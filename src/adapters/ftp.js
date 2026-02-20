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
				// We could hook progress bar here
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
			await this.client.cd('/') // Reset to root after ensureDir
		} catch (err) {
			this.logger.error(`Failed creating directory ${dir}: ${err.message}`)
		}
	}

	async uploadFile(localPath, remotePath) {
		if (this.config.dryRun) {
			this.logger.info(`[Dry Run] Would upload file: ${localPath} -> ${remotePath}`)
			return
		}
		// Calculate the remote directory from path
		const remoteDir = remotePath.substring(0, remotePath.lastIndexOf('/'))
		if (remoteDir) {
			await this.createRemoteDirectory(remoteDir)
		}

		try {
			await this.client.uploadFrom(localPath, remotePath)
		} catch (err) {
			this.logger.error(`Upload failed for ${localPath}: ${err.message}`)
			throw err
		}
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
