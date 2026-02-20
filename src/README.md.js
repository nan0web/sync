import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import FS from '@nan0web/db-fs'
import { NoConsole } from '@nan0web/log'
import { DatasetParser, DocsParser, runSpawn } from '@nan0web/test'
import { SyncEngine } from './Engine.js'
import { SyncConfig } from './SyncConfig.js'
import { SyncManifest } from './SyncManifest.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fs = new FS()
let pkg

before(async () => {
	pkg = await fs.loadDocument('package.json', {})
})

let console = new NoConsole()

beforeEach(() => {
	console = new NoConsole()
})

function docs() {
	/**
	 * @docs
	 * > 🌍 **[Ukrainian Documentation](docs/uk/README.md)**
	 *
	 * # @nan0web/sync
	 *
	 * High-performance site synchronization engine with remote manifests and atomic locks.
	 *
	 * <!-- %PACKAGE_STATUS% -->
	 *
	 * ## Description
	 *
	 * The `@nan0web/sync` package provides a differential deployment foundation for
	 * calculating remote vs local differences using MD5 hashing, atomic locking,
	 * and remote manifests to reduce overhead during continuous deployment.
	 *
	 * Core Features:
	 * - **Differential Sync** — only changed files are uploaded and removed files are deleted.
	 * - **Remote Manifest** — stores the directory state remotely to skip full FTP directory scanning.
	 * - **Atomic Locking** — prevents concurrent deployments.
	 * - **Git Validation** — enforces deployment order.
	 *
	 * ## Installation
	 */
	it('How to install with npm?', () => {
		/**
		 * ```bash
		 * npm install -g @nan0web/sync
		 * ```
		 */
		assert.equal(pkg.name, '@nan0web/sync')
	})

	/**
	 * @docs
	 */
	it('How to install with pnpm?', () => {
		/**
		 * ```bash
		 * pnpm add -g @nan0web/sync
		 * ```
		 */
		assert.equal(pkg.name, '@nan0web/sync')
	})

	/**
	 * @docs
	 * ## CLI Usage
	 *
	 * The `nan0sync` command is the primary way to interact with the engine.
	 */
	it('How to use nan0sync via CLI?', () => {
		/**
		 * ```bash
		 * # Run live synchronization
		 * nan0sync push
		 *
		 * # Preview changes without uploading
		 * nan0sync push --dry-run
		 *
		 * # Show detailed paths, config, and FTP error codes
		 * nan0sync push --debug
		 *
		 * # Check status and diff preview
		 * nan0sync status
		 * ```
		 */
		assert.ok(pkg.bin.nan0sync.endsWith('bin/nan0sync.js'))
	})

	/**
	 * @docs
	 * ## Configuration (SyncConfig)
	 *
	 * Sync supports hierarchical config loading (`sync.config.js`). It reads default, env, and local configs.
	 */
	it('How to create sync.config.js?', () => {
		/**
		 * ```javascript
		 * export default {
		 *   adapter: 'ftp',
		 *   source: 'dist/web',
		 *   env: 'stage',
		 *   host: 'nan0web.yaro.page',
		 *   deleteRemoved: true,
		 *   remoteManifest: true,
		 *   lock: true,
		 *   lockTTL: 600,
		 *   gitCheck: true
		 * }
		 * ```
		 */
		assert.ok(true) // prevent DocsParser from capturing code internals
		const config = new SyncConfig({ adapter: 'ftp', host: 'test' })
		assert.equal(config.adapter, 'ftp')
	})

	/**
	 * @docs
	 * ## API
	 *
	 * ### SyncEngine
	 *
	 * The engine executes the synchronization state machine via a generator function `run()`.
	 */
	it('How to use SyncEngine programmatically?', async () => {
		//import { SyncEngine, SyncConfig } from '@nan0web/sync'
		const config = new SyncConfig({
			adapter: 'ftp',
			source: 'dist/web',
			host: 'example.com',
			user: 'user',
			password: 'pwd',
			dryRun: true,
		})
		const engine = new SyncEngine(config)
		engine.adapter.connect = async () => {} // mock to prevent test from hanging

		assert.ok(true) // prevent DocsParser from capturing test internals

		try {
			for await (const state of engine.run()) {
				console.info(state.phase)
			}
		} catch (e) {
			// Expected to fail on 'connect' since host is a mock
		}

		assert.ok(console.output()[0][1].includes('init'))
	})

	/**
	 * @docs
	 * ## Contributing
	 */
	it('How to contribute? - [check here]($pkgURL/blob/main/CONTRIBUTING.md)', async () => {
		assert.ok(true) // prevent DocsParser from capturing code internals
		const text = readFileSync(path.resolve('../../CONTRIBUTING.md'), 'utf8')
		assert.ok(text.includes('# Contributing'))
	})

	/**
	 * @docs
	 * ## License
	 */
	it('How to license? - [ISC LICENSE]($pkgURL/blob/main/LICENSE) file.', async () => {
		/** @docs */
		assert.ok(true) // prevent DocsParser from capturing code internals
		const text = readFileSync(path.resolve('../../LICENSE'), 'utf8')
		assert.ok(text.includes('ISC'))
	})
}

describe('README.md testing', docs)

describe('Rendering README.md', async () => {
	const parser = new DocsParser()
	const text = String(parser.decode(docs))
	await fs.saveDocument('README.md', text)

	const dataset = DatasetParser.parse(text, pkg.name)
	await fs.saveDocument('.datasets/README.dataset.jsonl', dataset)

	it(`document is rendered [${Intl.NumberFormat('en-US').format(Buffer.byteLength(text))}b]`, async () => {
		const saved = readFileSync('README.md', 'utf8')
		assert.ok(saved.includes('## License'), 'README was not generated')
	})
})
