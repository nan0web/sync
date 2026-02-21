#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { SyncConfig } from '../src/SyncConfig.js'
import { SyncManifest } from '../src/SyncManifest.js'
import { FTPAdapter } from '../src/adapters/ftp.js'
import Logger from '@nan0web/log'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const logger = new Logger()

const options = {
	'dry-run': { type: 'boolean', default: false },
	debug: { type: 'boolean', default: false },
	php: { type: 'boolean', default: false },
	'chunk-size': { type: 'string' },
	'chunk-files': { type: 'string' },
	help: { type: 'boolean', default: false },
	env: { type: 'string' },
}

const { values, positionals } = parseArgs({ args: process.argv.slice(2), options, strict: false })

if (values.help) {
	console.log(`
nan•sync CLI
Usage: nan0sync [options] <command>

Commands:
  push         Push changes to remote server (default)
  status       Show configuration and difference preview
  reset        Delete remote manifest (forces full re-sync)

Options:
  --dry-run    Preview changes without uploading
  --debug      Show detailed paths and FTP commands
  --php              Archive mode: tar.gz + PHP unpack (requires PHP on server)
  --chunk-size <MB>   Max source size per chunk in MB (default: 100)
  --chunk-files <N>   Max files per chunk (default: 500)
  --env <env>         Set environment (stage, prod)
  --help              Show help
`)
	process.exit(0)
}

const command = positionals[0] || 'push'

/** Join remotePath + file without double slashes */
function joinRemote(base, file) {
	const b = base.endsWith('/') ? base.slice(0, -1) : base
	return b ? `${b}/${file}` : `/${file}`
}

async function runEngine() {
	const debug = values.debug
	const cliArgs = {
		dryRun: values['dry-run'],
	}
	if (values.env) cliArgs.env = values.env

	const config = await SyncConfig.resolve(cliArgs)

	if (command === 'status') {
		logger.info('nan•sync Config Status:')
		console.log(config)
	}

	if (debug) {
		logger.info('\n[debug] Resolved config:')
		logger.info(`  host:       ${config.host}`)
		logger.info(`  remotePath: ${config.remotePath}`)
		logger.info(`  source:     ${config.source}`)
		logger.info(`  adapter:    ${config.adapter}`)
		logger.info(`  cwd:        ${process.cwd()}`)
		logger.info('')
	}

	logger.info(
		`Starting NaN•Sync Engine (~${config.adapter} adapter) in ${config.dryRun ? 'DRY RUN' : 'LIVE'} mode.`,
	)

	let adapter
	switch (config.adapter) {
		case 'ftp':
			adapter = new FTPAdapter(config)
			break
		default:
			logger.error(`Adapter '${config.adapter}' is not supported yet.`)
			process.exit(1)
	}

	// Handle 'reset' command separately
	if (command === 'reset') {
		logger.info('Resetting remote manifest...')
		await adapter.connect()
		const remoteManifestPath = `${config.manifestDir}/sync.index.json`
		try {
			await adapter.deleteFile(remoteManifestPath)
			logger.success('Remote manifest deleted. Next push will do a full sync.')
		} catch (e) {
			logger.warn('No remote manifest found.')
		}
		await adapter.disconnect()
		return
	}

	const engineGenerator = (async function* () {
		yield { phase: 'init', message: 'Loading engine components...', config }
		const manifest = new SyncManifest({ manifestDir: config.manifestDir })

		yield { phase: 'connect', message: `Connecting to ${config.adapter}://${config.host}...` }
		await adapter.connect()

		let remoteIndex = {}
		const remoteManifestPath = `${config.manifestDir}/sync.index.json`
		const lockPath = `${config.manifestDir}/sync.lock`

		if (config.lock) {
			yield { phase: 'lock', message: 'Acquiring remote lock...' }
			if (!config.dryRun) {
				const tmpLock = path.join(os.tmpdir(), 'nan0sync.lock')
				fs.writeFileSync(
					tmpLock,
					JSON.stringify({ time: Date.now(), user: os.userInfo().username }),
				)
				try {
					await adapter.uploadFile(tmpLock, lockPath)
				} catch (e) {
					yield { phase: 'warn', message: `Lock wait fail` }
				}
				if (fs.existsSync(tmpLock)) fs.unlinkSync(tmpLock)
			}
		}

		yield { phase: 'remote_manifest', message: 'Fetching remote manifest...' }
		if (config.remoteManifest && !config.dryRun) {
			const tmpManifest = path.join(os.tmpdir(), 'nan0sync_remote.json')
			try {
				if (typeof adapter.client.downloadTo === 'function') {
					await adapter.client.downloadTo(tmpManifest, remoteManifestPath)
					remoteIndex = JSON.parse(fs.readFileSync(tmpManifest, 'utf8'))
				}
			} catch (e) {
				yield { phase: 'warn', message: `Manifest not found (first run).` }
			} finally {
				if (fs.existsSync(tmpManifest)) fs.unlinkSync(tmpManifest)
			}
		}

		yield { phase: 'local_manifest', message: `Building local manifest from ${config.source}...` }
		const localIndex = await manifest.buildFromDir(config.source)

		const diff = manifest.diff(remoteIndex, localIndex)
		yield {
			phase: 'diff',
			message: `Diff calculated: ${diff.upload.length} to upload, ${diff.delete.length} to delete.`,
			uploadCount: diff.upload.length,
			deleteCount: diff.delete.length,
			diff,
		}

		if (command === 'status' || (diff.upload.length === 0 && diff.delete.length === 0)) {
			await adapter.disconnect()
			yield { phase: 'done', message: 'Nothing to sync.' }
			return
		}

		const php = values.php
		let current = 0
		const totalUploads = diff.upload.length
		const failedUploads = []
		let failedChunks = 0

		if (php && totalUploads > 0 && !config.dryRun) {
			// ── ARCHIVE + PHP CHUNKED MODE (with auto-resume) ──
			const MAX_CHUNK_MB = parseInt(values['chunk-size']) || 100
			const MAX_CHUNK_BYTES = MAX_CHUNK_MB * 1024 * 1024
			const MAX_FILES_PER_CHUNK = parseInt(values['chunk-files']) || 500

			// Stable prefix based on file list hash (enables resume across runs)
			const { createHash } = await import('node:crypto')
			const fileListSorted = diff.upload.slice().sort().join('\n')
			const hashHex = createHash('md5').update(fileListSorted).digest('hex').slice(0, 8)
			const archivePrefix = `_nan0sync_${hashHex}`

			// Session file for resume support
			const sessionPath = path.join(config.cwd || process.cwd(), '.nan0web', 'sync.session.json')
			let chunks = []
			let uploadedSet = new Set()
			let resumed = false

			// Check for existing session
			try {
				const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'))
				if (session.prefix === archivePrefix && session.totalChunks) {
					// Verify temp archives still exist
					const firstArchive = path.join(os.tmpdir(), `${archivePrefix}_0.tar.gz`)
					if (fs.existsSync(firstArchive)) {
						uploadedSet = new Set(session.uploaded || [])
						for (let i = 0; i < session.totalChunks; i++) {
							const chunkList = path.join(os.tmpdir(), `nan0sync_chunk_${i}.txt`)
							if (fs.existsSync(chunkList)) {
								chunks.push(fs.readFileSync(chunkList, 'utf8').split('\n').filter(Boolean))
							} else {
								chunks.push([])
							}
						}
						resumed = true
						const remaining = chunks.length - uploadedSet.size
						yield {
							phase: 'info',
							message: `Resuming: ${uploadedSet.size}/${chunks.length} chunks uploaded, ${remaining} remaining`,
						}
					}
				}
			} catch (_) {}

			if (!resumed) {
				// Check if archives from a previous identical diff exist in tmpdir
				const firstArchive = path.join(os.tmpdir(), `${archivePrefix}_0.tar.gz`)
				if (fs.existsSync(firstArchive)) {
					// Count how many chunk archives exist
					let i = 0
					while (fs.existsSync(path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`))) {
						const chunkList = path.join(os.tmpdir(), `nan0sync_chunk_${i}.txt`)
						if (fs.existsSync(chunkList)) {
							chunks.push(fs.readFileSync(chunkList, 'utf8').split('\n').filter(Boolean))
						} else {
							chunks.push([])
						}
						i++
					}
					resumed = true
					yield {
						phase: 'info',
						message: `Found ${chunks.length} packed chunks from previous run, skipping packing`,
					}
				}
			}

			if (!resumed) {
				// Split into chunks by size + file count
				chunks = []
				let currentChunk = []
				let currentSize = 0
				for (const file of diff.upload) {
					const filePath = path.resolve(config.source, file)
					let fileSize = 0
					try {
						fileSize = fs.statSync(filePath).size
					} catch (_) {}
					if (
						currentChunk.length > 0 &&
						(currentSize + fileSize > MAX_CHUNK_BYTES || currentChunk.length >= MAX_FILES_PER_CHUNK)
					) {
						chunks.push(currentChunk)
						currentChunk = []
						currentSize = 0
					}
					currentChunk.push(file)
					currentSize += fileSize
				}
				if (currentChunk.length > 0) chunks.push(currentChunk)
			}

			const { spawn } = await import('node:child_process')
			const tempFiles = []

			// Cleanup stale archives from server and local tmpdir
			if (!resumed) {
				try {
					const remoteFiles = await adapter.client.list(config.remotePath || '/')
					for (const f of remoteFiles) {
						if (f.name.startsWith('_nan0sync_') && !f.name.startsWith(archivePrefix)) {
							try {
								await adapter.deleteFile(joinRemote(config.remotePath, f.name))
							} catch (_) {}
						}
					}
				} catch (_) {}
				// Clean old local archives
				const tmpDir = os.tmpdir()
				try {
					for (const f of fs.readdirSync(tmpDir)) {
						if (f.startsWith('_nan0sync_') && !f.startsWith(archivePrefix)) {
							fs.unlinkSync(path.join(tmpDir, f))
						}
					}
				} catch (_) {}
			}

			// Save session immediately
			const saveSession = () => {
				try {
					const dir = path.dirname(sessionPath)
					if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
					fs.writeFileSync(
						sessionPath,
						JSON.stringify({
							prefix: archivePrefix,
							totalChunks: chunks.length,
							uploaded: [...uploadedSet],
							fileListHash,
							timestamp: Date.now(),
						}),
					)
				} catch (_) {}
			}

			if (!resumed) {
				// 1. Pack chunks (parallel — one per CPU core)
				const cpuCount = os.cpus().length
				yield {
					phase: 'pack',
					message: `Packing ${totalUploads} files into ${chunks.length} chunks (${cpuCount} parallel)...`,
				}

				// Prepare all chunk list files
				for (let i = 0; i < chunks.length; i++) {
					const chunkList = path.join(os.tmpdir(), `nan0sync_chunk_${i}.txt`)
					fs.writeFileSync(chunkList, chunks[i].join('\n'))
					tempFiles.push(path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`), chunkList)
				}

				// Pack in parallel batches
				let completed = 0
				const packStart = Date.now()
				const sizeInterval = setInterval(() => {
					let totalSize = 0
					for (let i = 0; i < chunks.length; i++) {
						try {
							totalSize += fs.statSync(path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`)).size
						} catch (_) {}
					}
					const mb = (totalSize / 1024 / 1024).toFixed(1)
					const elapsed = (Date.now() - packStart) / 1000
					const elapsedStr =
						elapsed > 60
							? `${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s`
							: `${Math.round(elapsed)}s`
					let etaStr = ''
					if (completed > 0) {
						const remaining = ((chunks.length - completed) / completed) * elapsed
						etaStr =
							remaining > 60
								? ` | ETA ${Math.floor(remaining / 60)}m ${Math.round(remaining % 60)}s`
								: ` | ETA ${Math.round(remaining)}s`
					}
					process.stdout.write(
						`\r\x1b[K [PACK] ${completed}/${chunks.length} done | ${mb} MB | ${elapsedStr}${etaStr}`,
					)
				}, 500)

				for (let batch = 0; batch < chunks.length; batch += cpuCount) {
					const batchPromises = []
					for (let j = 0; j < cpuCount && batch + j < chunks.length; j++) {
						const i = batch + j
						const chunkArchive = path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`)
						const chunkList = path.join(os.tmpdir(), `nan0sync_chunk_${i}.txt`)
						batchPromises.push(
							new Promise((resolve, reject) => {
								const tar = spawn('tar', ['-czf', chunkArchive, '-T', chunkList], {
									cwd: path.resolve(config.source),
									stdio: 'pipe',
								})
								tar.on('close', (code) => {
									completed++
									if (code === 0) resolve()
									else reject(new Error(`tar chunk ${i} failed`))
								})
								tar.on('error', reject)
							}),
						)
					}
					await Promise.all(batchPromises)
				}
				clearInterval(sizeInterval)
				process.stdout.write('\n')

				// Show total packed size
				let totalPackedSize = 0
				for (let i = 0; i < chunks.length; i++) {
					totalPackedSize += fs.statSync(
						path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`),
					).size
				}
				yield {
					phase: 'pack',
					message: `Packed: ${(totalPackedSize / 1024 / 1024).toFixed(1)} MB in ${chunks.length} chunks`,
				}

				saveSession()
			}

			// 2. Upload chunks (with server-side size verification)
			const uploadStart = Date.now()
			let totalBytesUploaded = 0
			for (let i = 0; i < chunks.length; i++) {
				const chunkArchive = path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`)
				const chunkRemote = joinRemote(config.remotePath, `${archivePrefix}_${i}.tar.gz`)
				const localSize = fs.statSync(chunkArchive).size

				// Check if already uploaded (session or FTP size match)
				if (uploadedSet.has(i)) {
					if (debug)
						yield {
							phase: 'debug',
							message: `  chunk ${i + 1} already uploaded (session), skipping`,
						}
					continue
				}
				try {
					const remoteSize = await adapter.client.size(chunkRemote)
					if (remoteSize === localSize) {
						uploadedSet.add(i)
						saveSession()
						if (debug)
							yield {
								phase: 'debug',
								message: `  chunk ${i + 1} already on server (${(localSize / 1024 / 1024).toFixed(1)} MB), skipping`,
							}
						continue
					}
				} catch (_) {} // File doesn't exist on server
				const chunkSize = localSize
				const chunkStart = Date.now()

				adapter.onProgress = (info) => {
					if (info.bytes > 0) {
						const pct = Math.round((info.bytes / chunkSize) * 100)
						const mb = (info.bytes / 1024 / 1024).toFixed(1)
						const totalMB = (chunkSize / 1024 / 1024).toFixed(1)
						const elapsed = (Date.now() - chunkStart) / 1000
						const bytesRemaining =
							chunkSize -
							info.bytes +
							chunks.slice(i + 1).reduce((sum, _, j) => {
								if (uploadedSet.has(i + 1 + j)) return sum
								try {
									return (
										sum +
										fs.statSync(path.join(os.tmpdir(), `${archivePrefix}_${i + 1 + j}.tar.gz`)).size
									)
								} catch (_) {
									return sum
								}
							}, 0)
						const speed = info.bytes / elapsed
						const etaSec = speed > 0 ? Math.round(bytesRemaining / speed) : 0
						const eta = etaSec > 60 ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s` : `${etaSec}s`
						process.stdout.write(
							`\r\x1b[K [UPLOAD] chunk ${i + 1}/${chunks.length} | ${pct}% | ${mb} / ${totalMB} MB | ETA ${eta}`,
						)
					}
				}
				await adapter.uploadFile(chunkArchive, chunkRemote)
				totalBytesUploaded += chunkSize
				uploadedSet.add(i)
				saveSession()
				adapter.onProgress = null
				process.stdout.write('\n')
			}

			// 3. Upload PHP unpack script
			const scriptPath = new URL('../src/scripts/unpack.php', import.meta.url)
			let unpackScript = fs.readFileSync(scriptPath, 'utf8')
			unpackScript = unpackScript.replace('__ARCHIVE_PREFIX__', archivePrefix)
			const unpackLocal = path.join(os.tmpdir(), '_nan0sync_unpack.php')
			const unpackRemote = joinRemote(config.remotePath, '_nan0sync_unpack.php')
			fs.writeFileSync(unpackLocal, unpackScript)
			tempFiles.push(unpackLocal)
			await adapter.uploadFile(unpackLocal, unpackRemote)

			// 4. Extract each chunk via HTTP
			const unpackBase = `https://${config.host}/_nan0sync_unpack.php`
			let extractedTotal = 0
			for (let i = 0; i < chunks.length; i++) {
				yield {
					phase: 'upload',
					file: `chunk-${i}`,
					progress: { current: i + 1, total: chunks.length },
					message: `Extracting chunk ${i + 1}/${chunks.length} (${chunks[i].length} files)...`,
				}
				const url = `${unpackBase}?chunk=${i}&total=${chunks.length}`
				if (debug) yield { phase: 'debug', message: `  GET ${url}` }

				try {
					const response = await fetch(url)
					const text = await response.text()
					try {
						const result = JSON.parse(text)
						if (result.ok) {
							extractedTotal += result.files || chunks[i].length
							yield {
								phase: 'info',
								message: `  ✓ chunk ${i + 1}: ${result.files || chunks[i].length} files`,
							}
						} else {
							failedChunks++
							yield { phase: 'error', message: `  ✗ chunk ${i + 1}: ${result.error}` }
						}
					} catch (_) {
						failedChunks++
						if (debug) yield { phase: 'debug', message: `  Response: ${text.slice(0, 200)}` }
						yield {
							phase: 'warn',
							message: `  ⚠ chunk ${i + 1}: non-JSON response (status ${response.status})`,
						}
					}
				} catch (err) {
					failedChunks++
					yield { phase: 'warn', message: `  ⚠ chunk ${i + 1} HTTP failed: ${err.message}` }
				}
			}

			yield {
				phase: 'info',
				message: `✓ Extracted ${extractedTotal} files in ${chunks.length} chunks`,
			}

			// Cleanup temp files and session
			for (const f of tempFiles) {
				if (fs.existsSync(f)) fs.unlinkSync(f)
			}
			// Clean all chunk archives from tmpdir
			for (let i = 0; i < chunks.length; i++) {
				const f = path.join(os.tmpdir(), `${archivePrefix}_${i}.tar.gz`)
				if (fs.existsSync(f)) fs.unlinkSync(f)
				const l = path.join(os.tmpdir(), `nan0sync_chunk_${i}.txt`)
				if (fs.existsSync(l)) fs.unlinkSync(l)
			}
			if (failedChunks === 0 && fs.existsSync(sessionPath)) {
				fs.unlinkSync(sessionPath)
			}
		} else {
			// ── FILE-BY-FILE MODE ──
			for (const file of diff.upload) {
				current++
				yield {
					phase: 'upload',
					file,
					progress: { current, total: totalUploads },
					message: `Uploading ${file}...`,
				}
				const localFile = path.resolve(config.source, file)
				const remoteFile = joinRemote(config.remotePath, file)
				if (debug) {
					yield { phase: 'debug', message: `  local:  ${localFile}` }
					yield { phase: 'debug', message: `  remote: ${remoteFile}` }
				}
				if (!config.dryRun) {
					try {
						await adapter.uploadFile(localFile, remoteFile)
					} catch (err) {
						failedUploads.push({ file, error: err.message })
						yield { phase: 'warn', message: `⚠ Failed: ${file} (${err.message})` }
						if (debug) yield { phase: 'debug', message: `  FTP code: ${err.code || 'N/A'}` }
					}
				}
			}
		}

		current = 0
		const totalDeletes = diff.delete.length
		if (config.deleteRemoved && totalDeletes > 0) {
			const deleteStart = Date.now()
			const BATCH = 10
			for (let b = 0; b < diff.delete.length; b += BATCH) {
				const batch = diff.delete.slice(b, b + BATCH)
				if (!config.dryRun) {
					await Promise.all(
						batch.map((file) => {
							const remoteFile = joinRemote(config.remotePath, file)
							return adapter.deleteFile(remoteFile).catch(() => {})
						}),
					)
				}
				current += batch.length
				const elapsed = (Date.now() - deleteStart) / 1000
				const rate = current / elapsed
				const remaining = (totalDeletes - current) / rate
				const eta =
					remaining > 60
						? `${Math.floor(remaining / 60)}m ${Math.round(remaining % 60)}s`
						: `${Math.round(remaining)}s`
				yield {
					phase: 'delete',
					file: batch[batch.length - 1],
					progress: { current, total: totalDeletes },
					message: `Deleting... ETA ${eta}`,
				}
			}
		}

		if (
			config.remoteManifest &&
			!config.dryRun &&
			failedUploads.length === 0 &&
			failedChunks === 0
		) {
			yield { phase: 'update_manifest', message: 'Updating remote manifest...' }
			const tmpNewManifest = path.join(os.tmpdir(), 'nan0sync_new.json')
			fs.writeFileSync(tmpNewManifest, JSON.stringify(localIndex, null, 2))
			try {
				await adapter.uploadFile(tmpNewManifest, remoteManifestPath)
			} catch (e) {
				yield { phase: 'error', message: `Manifest update fail` }
			}
			if (fs.existsSync(tmpNewManifest)) fs.unlinkSync(tmpNewManifest)
		} else if (failedUploads.length > 0 || failedChunks > 0) {
			yield {
				phase: 'warn',
				message: 'Skipping manifest update — not all files deployed successfully.',
			}
		}

		if (config.lock && !config.dryRun) {
			yield { phase: 'unlock', message: 'Releasing remote lock...' }
			try {
				await adapter.deleteFile(lockPath)
			} catch (e) {}
		}

		yield { phase: 'disconnect', message: 'Disconnecting...' }
		await adapter.disconnect()

		if (failedUploads.length > 0) {
			yield { phase: 'error', message: `${failedUploads.length} file(s) failed to upload:` }
			for (const f of failedUploads) {
				yield { phase: 'error', message: `  ✗ ${f.file}` }
			}
		}

		yield {
			phase: 'done',
			message: `Sync finished. ${totalUploads - failedUploads.length}/${totalUploads} uploaded.`,
		}
	})()

	// Consume generator
	try {
		let isUploading = false
		for await (const state of engineGenerator) {
			// Log formatting based on phase
			if (state.phase === 'upload' || state.phase === 'delete') {
				if (!isUploading) {
					process.stdout.write('\n')
					isUploading = true
				}
				const percentage = Math.round((state.progress.current / state.progress.total) * 100)
				// Overwrite the same line with progress
				process.stdout.write(
					`\r\x1b[K [${state.phase.toUpperCase()}] ${percentage}% | ${state.progress.current}/${state.progress.total} | ${state.message}`,
				)
			} else {
				if (isUploading) {
					process.stdout.write('\n')
					isUploading = false
				}

				if (state.phase === 'error') {
					logger.error(state.message)
				} else if (state.phase === 'warn') {
					logger.warn(state.message)
				} else if (state.phase === 'debug') {
					process.stdout.write(`\x1b[90m${state.message}\x1b[0m\n`)
				} else if (state.phase === 'diff') {
					logger.info(state.message)
					if (state.diff.upload.length > 0)
						process.stdout.write(
							'\x1b[32m+ ' +
								state.diff.upload.slice(0, 5).join('\n+ ') +
								(state.diff.upload.length > 5 ? '\n...and more\n' : '\n') +
								'\x1b[0m',
						)
					if (state.diff.delete.length > 0)
						process.stdout.write(
							'\x1b[31m- ' +
								state.diff.delete.slice(0, 5).join('\n- ') +
								(state.diff.delete.length > 5 ? '\n...and more\n' : '\n') +
								'\x1b[0m',
						)
				} else if (state.phase === 'pack' || state.phase === 'info') {
					logger.info(state.message)
				} else {
					logger.success(`[${state.phase}] ${state.message}`)
				}
			}
		}
	} catch (error) {
		logger.error(`Fatal Error: ${error.stack}`)
		try {
			await adapter.deleteFile(`${config.manifestDir}/sync.lock`)
			await adapter.disconnect()
		} catch (e) {}
		process.exit(1)
	}
	console.log('\n') // Final newline
}

runEngine()
