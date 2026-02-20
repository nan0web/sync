import { SyncConfig } from './SyncConfig.js'
import { SyncManifest } from './SyncManifest.js'
import { FTPAdapter } from './adapters/ftp.js'
import path from 'path'
import os from 'os'
import fs from 'fs'

export class SyncEngine {
	/**
	 * @param {SyncConfig} config
	 */
	constructor(config) {
		this.config = config
		this.manifest = new SyncManifest({ manifestDir: config.manifestDir })

		// Initialize adapter
		switch (this.config.adapter) {
			case 'ftp':
				this.adapter = new FTPAdapter(this.config)
				break
			default:
				throw new Error(`Adapter '${this.config.adapter}' is not supported yet.`)
		}
	}

	async *run() {
		yield { phase: 'init', message: 'Starting sync engine...', config: this.config }

		try {
			yield {
				phase: 'connect',
				message: `Connecting to ${this.config.adapter}://${this.config.host}...`,
			}
			await this.adapter.connect()

			// --- Locking ---
			const lockPath = `${this.config.manifestDir}/sync.lock`
			if (this.config.lock) {
				yield { phase: 'lock', message: 'Acquiring remote lock...' }
				if (!this.config.dryRun) {
					// Extremely simplistic lock for demonstration
					// In a real scenario, we'd check if lock exists & TTL, then create.
					try {
						// Write empty lock file
						const tmpLock = path.join(os.tmpdir(), 'nan0sync.lock')
						fs.writeFileSync(
							tmpLock,
							JSON.stringify({ time: Date.now(), user: os.userInfo().username }),
						)
						await this.adapter.uploadFile(tmpLock, lockPath)
						fs.unlinkSync(tmpLock)
					} catch (e) {
						yield {
							phase: 'warn',
							message: `Could not acquire lock or already locked: ${e.message}`,
						}
					}
				}
			}

			// --- Manifests ---
			yield { phase: 'remote_manifest', message: 'Fetching remote manifest...' }
			let remoteIndex = {}
			const remoteManifestPath = `${this.config.manifestDir}/sync.index.json`

			if (this.config.remoteManifest && !this.config.dryRun) {
				const tmpManifest = path.join(os.tmpdir(), 'nan0sync_remote.json')
				try {
					// We need a download method in adapter realistically, but for now we'll simulate
					// We will assume FTPAdapter has downloadFile if it were complete
					if (typeof this.adapter.client.downloadTo === 'function') {
						await this.adapter.client.downloadTo(tmpManifest, remoteManifestPath)
						remoteIndex = JSON.parse(fs.readFileSync(tmpManifest, 'utf8'))
					}
				} catch (e) {
					// Manifest doesn't exist yet, which is fine for the first run
				} finally {
					if (fs.existsSync(tmpManifest)) fs.unlinkSync(tmpManifest)
				}
			}

			yield {
				phase: 'local_manifest',
				message: `Building local manifest from ${this.config.source}...`,
			}
			const localIndex = await this.manifest.buildFromDir(this.config.source)

			// --- Diff ---
			const diff = this.manifest.diff(remoteIndex, localIndex)
			yield {
				phase: 'diff',
				message: `Diff calculated: ${diff.upload.length} to upload, ${diff.delete.length} to delete.`,
				uploadCount: diff.upload.length,
				deleteCount: diff.delete.length,
				diff,
			}

			if (diff.upload.length === 0 && diff.delete.length === 0) {
				yield { phase: 'done', message: 'Local and remote are fully in sync. Nothing to do.' }
				return
			}

			// --- Uploads ---
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

				const localFile = path.join(this.config.source, file)
				const remoteFile = `${this.config.remotePath}/${file}`

				if (!this.config.dryRun) {
					await this.adapter.uploadFile(localFile, remoteFile)
				}
			}

			// --- Deletes ---
			current = 0
			const totalDeletes = diff.delete.length
			if (this.config.deleteRemoved) {
				for (const file of diff.delete) {
					current++
					yield {
						phase: 'delete',
						file,
						progress: { current, total: totalDeletes },
						message: `Deleting ${file}...`,
					}

					const remoteFile = `${this.config.remotePath}/${file}`
					if (!this.config.dryRun) {
						await this.adapter.deleteFile(remoteFile)
					}
				}
			}

			// --- Update Manifest ---
			if (this.config.remoteManifest && !this.config.dryRun) {
				yield { phase: 'update_manifest', message: 'Updating remote manifest...' }
				const tmpNewManifest = path.join(os.tmpdir(), 'nan0sync_new.json')
				fs.writeFileSync(tmpNewManifest, JSON.stringify(localIndex, null, 2))
				await this.adapter.uploadFile(tmpNewManifest, remoteManifestPath)
				fs.unlinkSync(tmpNewManifest)
			}
		} catch (error) {
			yield { phase: 'error', message: `Sync failed: ${error.message}`, error }
		} finally {
			// --- Unlock & Disconnect ---
			if (this.config.lock && !this.config.dryRun) {
				yield { phase: 'unlock', message: 'Releasing remote lock...' }
				try {
					await this.adapter.deleteFile(`${this.config.manifestDir}/sync.lock`)
				} catch (e) {
					// Ignore unlock errors
				}
			}

			yield { phase: 'disconnect', message: 'Disconnecting...' }
			await this.adapter.disconnect()

			yield { phase: 'done', message: 'Sync process finished.' }
		}
	}
}
