import { Client } from 'basic-ftp'
import Logger from '@nan0web/log'
import { DBFS } from '@nan0web/db-fs'

export class FTPAdapter {
	constructor(config) {
		this.config = config
		this.client = new Client()
		this.logger = new Logger()
		this.dbfs = new DBFS({ root: process.cwd() }) // DBFS relative to cwd
	}

	async connect() {
		try {
			await this.client.access({
				host: this.config.host,
				port: this.config.port || 21,
				user: this.config.user,
				password: this.config.password,
				secure:
					this.config.secure === true || this.config.secure === 'implicit'
						? this.config.secure
						: false,
				secureOptions: {
					rejectUnauthorized: false,
					checkServerIdentity: () => undefined,
				},
			})
			this.client.trackProgress((info) => {
				if (this.onProgress) this.onProgress(info)
			})
		} catch (err) {
			this.logger.error(`FTP Connection failed: ${err.message}`)
			throw err
		}
	}

	async disconnect() {
		this.client.close()
	}

	async createRemoteDirectory(dir) {
		if (this.config.dryRun) {
			this.logger.info(`[Dry Run] Would create directory: ${dir}`)
			return
		}
		try {
			await this.client.ensureDir(dir)
		} catch (err) {
			// Silently ignore — directory may already exist or be auto-created
		}
		try {
			await this.client.cd(this.config.remotePath || '/')
		} catch (_) {}
	}

	async uploadFile(localPath, remotePath) {
		if (this.config.dryRun) {
			this.logger.info(`[Dry Run] Would upload file: ${localPath} -> ${remotePath}`)
			return
		}

		// Ensure parent directory exists
		const lastSlash = remotePath.lastIndexOf('/')
		if (lastSlash > 0) {
			const remoteDir = remotePath.substring(0, lastSlash)
			try {
				await this.client.ensureDir(remoteDir)
			} catch (_) {}
			// Always reset CWD to root to avoid drift
			try {
				await this.client.cd('/')
			} catch (_) {}
		}

		// Upload using absolute path
		await this.client.uploadFrom(localPath, remotePath)
	}

	async deleteFile(remotePath) {
		if (this.config.dryRun) {
			this.logger.info(`[Dry Run] Would delete remote file: ${remotePath}`)
			return
		}
		try {
			await this.client.remove(remotePath)
		} catch (err) {
			this.logger.error(`Failed deleting file ${remotePath}: ${err.message}`)
		}
	}
}
