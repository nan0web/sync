import { resolve, join, dirname } from 'path'
import { homedir } from 'os'
import { DBFS } from '@nan0web/db-fs'

export class SyncConfig {
	// --- Static schema (Model-as-Schema) ---

	static adapter = { type: 'string', default: 'ftp' }
	static source = { type: 'string', default: 'dist/web' }
	static target = { type: 'string', default: '' }
	static env = { type: 'string', default: 'stage', options: ['stage', 'prod'] }
	static host = { type: 'string', default: '' }
	static httpHost = { type: 'string', default: '' }
	static port = { type: 'number', default: 21 }
	static user = { type: 'string', default: '' }
	static password = { type: 'string', default: '' }
	static secure = { type: 'boolean|string', default: false }
	static remotePath = { type: 'string', default: '/public_html' }
	static indexFile = { type: 'string', default: '.nan0web/sync.index.json' }
	static dryRun = { type: 'boolean', default: false }
	static deleteRemoved = { type: 'boolean', default: true }
	static remoteManifest = { type: 'boolean', default: true }
	static lock = { type: 'boolean', default: true }
	static lockTTL = { type: 'number', default: 600 }
	static gitCheck = { type: 'boolean', default: true }
	static manifestDir = { type: 'string', default: '.nan0web' }

	constructor(overrides = {}) {
		this.adapter = overrides.adapter ?? SyncConfig.adapter.default
		this.source = overrides.source ?? SyncConfig.source.default
		this.target = overrides.target ?? SyncConfig.target.default
		this.env = overrides.env ?? SyncConfig.env.default
		this.host = overrides.host ?? SyncConfig.host.default
		this.httpHost = overrides.httpHost ?? SyncConfig.httpHost.default
		this.port = overrides.port ?? SyncConfig.port.default
		this.user = overrides.user ?? SyncConfig.user.default
		this.password = overrides.password ?? SyncConfig.password.default
		this.remotePath = overrides.remotePath ?? SyncConfig.remotePath.default
		this.indexFile = overrides.indexFile ?? SyncConfig.indexFile.default
		this.dryRun = overrides.dryRun ?? SyncConfig.dryRun.default
		this.deleteRemoved = overrides.deleteRemoved ?? SyncConfig.deleteRemoved.default
		this.remoteManifest = overrides.remoteManifest ?? SyncConfig.remoteManifest.default
		this.lock = overrides.lock ?? SyncConfig.lock.default
		this.lockTTL = overrides.lockTTL ?? SyncConfig.lockTTL.default
		this.gitCheck = overrides.gitCheck ?? SyncConfig.gitCheck.default
		this.secure = overrides.secure ?? SyncConfig.secure.default
		this.manifestDir = overrides.manifestDir ?? SyncConfig.manifestDir.default
	}

	static dbfs = new DBFS({ root: '/' })

	static async resolve(cliArgs = {}) {
		await SyncConfig.dbfs.connect()
		const layers = []

		// 1. Global config (~/.nan0web/sync.*)
		const globalConfig = await loadAnyConfigLayer(resolveHome('~/.nan0web'))
		if (globalConfig) layers.push(globalConfig)

		// 2. Project local direct configuration (.nan0web/sync.*)
		const projectConfigs = await findUpConfigs('.nan0web')
		if (projectConfigs) layers.push(projectConfigs)

		// 3. Embedded app configurations (nan0web.*#sync)
		const appConfigs = await findUpAppConfigs()
		if (appConfigs) layers.push(appConfigs)

		// 4. ENV
		const envConfig = loadEnv()
		if (envConfig) layers.push(envConfig)

		// 5. CLI
		if (Object.keys(cliArgs).length > 0) layers.push(cliArgs)

		const merged = {}
		for (const layer of layers) {
			Object.assign(merged, layer)
		}

		return new SyncConfig(merged)
	}
}

function resolveHome(filepath) {
	if (filepath.startsWith('~')) {
		return join(homedir(), filepath.slice(1))
	}
	return filepath
}

async function parseDocument(filePath) {
	try {
		const doc = await SyncConfig.dbfs.loadDocument(filePath)
		return doc
	} catch {
		// File might not exist or parse error, fallback if .js
		if (filePath.endsWith('.js')) {
			try {
				const module = await import(filePath)
				return module.default || module
			} catch {
				return null
			}
		}
		return null
	}
}

async function loadAnyConfigLayer(baseDir, prefix = 'sync') {
	const exts = ['.json', '.yaml', '.yml', '.nano', '.js']
	for (const ext of exts) {
		const fullPath = join(baseDir, `${prefix}${ext}`)
		const parsed = await parseDocument(fullPath)
		if (parsed) return parsed
	}
	return null
}

async function findUpConfigs(baseFolderName) {
	const configs = []
	let curr = process.cwd()
	while (curr !== dirname(curr)) {
		const config = await loadAnyConfigLayer(join(curr, baseFolderName))
		if (config) configs.unshift(config)
		curr = dirname(curr)
	}
	return configs.length > 0 ? Object.assign({}, ...configs) : null
}

async function findUpAppConfigs() {
	const configs = []
	let curr = process.cwd()
	while (curr !== dirname(curr)) {
		const exts = ['.json', '.yaml', '.yml', '.nano', '.js']
		let foundConfig = null
		for (const ext of exts) {
			const parsed = await parseDocument(join(curr, `nan0web${ext}`))
			if (parsed && typeof parsed === 'object' && parsed.sync) {
				foundConfig = parsed.sync
				break
			}
		}
		if (foundConfig) configs.unshift(foundConfig)
		curr = dirname(curr)
	}
	return configs.length > 0 ? Object.assign({}, ...configs) : null
}

function loadEnv() {
	const env = {}
	const mapping = {
		NAN0_SYNC_ADAPTER: 'adapter',
		NAN0_SYNC_SOURCE: 'source',
		NAN0_SYNC_TARGET: 'target',
		NAN0_SYNC_HOST: 'host',
		NAN0_SYNC_HTTP_HOST: 'httpHost',
		NAN0_SYNC_PORT: 'port',
		NAN0_SYNC_USER: 'user',
		NAN0_SYNC_PASSWORD: 'password',
		NAN0_SYNC_REMOTE_PATH: 'remotePath',
	}

	for (const [key, prop] of Object.entries(mapping)) {
		if (process.env[key]) {
			const strVal = process.env[key]
			const val = prop === 'port' ? parseInt(strVal, 10) : strVal
			env[prop] = val
		}
	}
	return Object.keys(env).length > 0 ? env : null
}
