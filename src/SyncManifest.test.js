import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { SyncManifest } from './SyncManifest.js'
import { DBFS } from '@nan0web/db-fs'
import path from 'node:path'

describe('SyncManifest Core Engine', () => {
	const TEMP_DIR = 'data/temp-manifest-test-' + Date.now()
	let db

	before(async () => {
		db = new DBFS()
		await db.connect()
		// Create some temp files
		await db.saveDocument(`${TEMP_DIR}/index.html`, 'html content')
		await db.saveDocument(`${TEMP_DIR}/app.js`, 'js content')
	})

	after(async () => {
		if (db) {
			try {
				await db.dropDocument(`${TEMP_DIR}/index.html`)
			} catch (e) {}
			try {
				await db.dropDocument(`${TEMP_DIR}/app.js`)
			} catch (e) {}
			try {
				await db.dropDocument(TEMP_DIR)
			} catch (e) {}
		}
	})

	it('should build index from directory hashing contents with MD5', async () => {
		const manifest = new SyncManifest({ manifestDir: '.nan0web' })
		const index = await manifest.buildFromDir(TEMP_DIR)

		assert.ok(index['index.html'], 'Index should contain index.html')
		assert.ok(index['app.js'], 'Index should contain app.js')
		assert.equal(typeof index['index.html'], 'string', 'Hash should be a string')
		// Check hash (md5 of "html content")
		assert.equal(
			index['index.html'],
			'eb329a86facbf1e1fe3ad1f3e825084f',
			'Hash should match MD5 of content',
		)
	})

	it('should correctly calculate differences between two indices', async () => {
		const manifest = new SyncManifest()
		const oldIndex = {
			'index.html': 'hash1',
			'old.css': 'hash2',
			'unchanged.js': 'hash3',
		}

		const newIndex = {
			'index.html': 'hash_changed',
			'new.js': 'hash4',
			'unchanged.js': 'hash3',
		}

		const diff = manifest.diff(oldIndex, newIndex)

		assert.deepEqual(
			diff.upload.sort(),
			['index.html', 'new.js'].sort(),
			'Should identify changed and new files to upload',
		)
		assert.deepEqual(diff.delete, ['old.css'], 'Should identify files to delete')
	})
})
