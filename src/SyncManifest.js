import { DBFS } from '@nan0web/db-fs'
import crypto from 'node:crypto'

export class SyncManifest {
	constructor(config = {}) {
		this.manifestDir = config.manifestDir || '.nan0web'
		this.dbfs = new DBFS() // DBFS pointing to process.cwd()
	}

	async buildFromDir(directory) {
		const index = {}
		await this.dbfs.connect()

		const absDir = this.dbfs.location(directory)

		if (!this.dbfs.FS.existsSync(absDir)) {
			return index
		}

		// Use fs readdir recursively
		const entries = this.dbfs.FS.readdirSync(absDir, { recursive: true, withFileTypes: true })

		for (const entry of entries) {
			if (entry.isFile()) {
				// Node <v20.1: entry might have `path` or `parentPath` instead of prepending relative automatically in some versions.
				// Readdir recursively from Node v20 withFileTypes returns parent path in entry.path (or entry.parentPath)
				// We construct the relative path manually since DBFS.FS can vary.
				const parentPath = entry.parentPath || entry.path
				// The absolute path of the file
				const fileAbs = this.dbfs.FS.resolve(parentPath, entry.name)

				// Strip the base directory out to get just the relative path
				let relativePath = fileAbs.replace(absDir, '')
				if (relativePath.startsWith('/') || relativePath.startsWith('\\')) {
					relativePath = relativePath.substring(1)
				}
				// Normalize slashes
				relativePath = relativePath.replaceAll('\\', '/')

				try {
					const buffer = this.dbfs.FS.readFileSync(fileAbs)
					const hash = crypto.createHash('md5').update(buffer).digest('hex')
					index[relativePath] = hash
				} catch (err) {
					// silently skip unreadable
				}
			}
		}

		return index
	}

	diff(oldIndex, newIndex) {
		const diff = { upload: [], delete: [] }

		for (const [file, hash] of Object.entries(newIndex)) {
			if (!oldIndex[file] || oldIndex[file] !== hash) {
				diff.upload.push(file)
			}
		}

		for (const file of Object.keys(oldIndex)) {
			if (!newIndex[file]) {
				diff.delete.push(file)
			}
		}

		return diff
	}
}
