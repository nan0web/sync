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

Options:
  --dry-run    Preview changes without uploading
  --env <env>  Set environment (stage, prod)
  --help       Show help
`)
	process.exit(0)
}

const command = positionals[0] || 'push'

async function runEngine() {
	const cliArgs = {
		dryRun: values['dry-run'],
	}
	if (values.env) cliArgs.env = values.env

	const config = await SyncConfig.resolve(cliArgs)

	if (command === 'status') {
		logger.info('nan•sync Config Status:')
		console.log(config)
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
			// Status ends here, or if there's nothing to push
			yield { phase: 'done', message: 'Nothing to sync.' }
			return
		}

		let current = 0
		const totalUploads = diff.upload.length
		for (const file of diff.upload) {
			current++
			yield {
				phase: 'upload',
				file,
				progress: { current, total: totalUploads },
				message: `Uploading ${file}...`,
			}
			const localFile = path.resolve(config.source, file)
			const remoteFile = `${config.remotePath}/${file}`
			if (!config.dryRun) await adapter.uploadFile(localFile, remoteFile)
		}

		current = 0
		const totalDeletes = diff.delete.length
		if (config.deleteRemoved) {
			for (const file of diff.delete) {
				current++
				yield {
					phase: 'delete',
					file,
					progress: { current, total: totalDeletes },
					message: `Deleting ${file}...`,
				}
				const remoteFile = `${config.remotePath}/${file}`
				if (!config.dryRun) await adapter.deleteFile(remoteFile)
			}
		}

		if (config.remoteManifest && !config.dryRun) {
			yield { phase: 'update_manifest', message: 'Updating remote manifest...' }
			const tmpNewManifest = path.join(os.tmpdir(), 'nan0sync_new.json')
			fs.writeFileSync(tmpNewManifest, JSON.stringify(localIndex, null, 2))
			try {
				await adapter.uploadFile(tmpNewManifest, remoteManifestPath)
			} catch (e) {
				yield { phase: 'error', message: `Manifest update fail` }
			}
			if (fs.existsSync(tmpNewManifest)) fs.unlinkSync(tmpNewManifest)
		}

		if (config.lock && !config.dryRun) {
			yield { phase: 'unlock', message: 'Releasing remote lock...' }
			try {
				await adapter.deleteFile(lockPath)
			} catch (e) {}
		}

		yield { phase: 'disconnect', message: 'Disconnecting...' }
		await adapter.disconnect()
		yield { phase: 'done', message: 'Sync process finished.' }
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
