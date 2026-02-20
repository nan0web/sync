> 🌍 **[Ukrainian Documentation](docs/uk/README.md)**

# @nan0web/sync

High-performance site synchronization engine with remote manifests and atomic locks.

<!-- %PACKAGE_STATUS% -->

## Description

The `@nan0web/sync` package provides a differential deployment foundation for
calculating remote vs local differences using MD5 hashing, atomic locking,
and remote manifests to reduce overhead during continuous deployment.

Core Features:
- **Differential Sync** — only changed files are uploaded and removed files are deleted.
- **Remote Manifest** — stores the directory state remotely to skip full FTP directory scanning.
- **Atomic Locking** — prevents concurrent deployments.
- **Git Validation** — enforces deployment order.

## Installation

How to install with npm?
```bash
npm install -g @nan0web/sync
```

How to install with pnpm?
```bash
pnpm add -g @nan0web/sync
```

## CLI Usage

The `nan0sync` command is the primary way to interact with the engine.

How to use nan0sync via CLI?
```bash
# Check status without modifying remote (dry-run mode)
nan0sync status --env production

# Run live synchronization
nan0sync push --env production

# Force unlock if atomic lock gets stuck
nan0sync push --force
```

## Configuration (SyncConfig)

Sync supports hierarchical config loading (`sync.config.js`). It reads default, env, and local configs.

How to create sync.config.js?
```javascript
export default {
  adapter: 'ftp',
  source: 'dist/web',
  env: 'stage',
  host: 'nan0web.yaro.page',
  deleteRemoved: true,
  remoteManifest: true,
  lock: true,
  lockTTL: 600,
  gitCheck: true
}
```

## API

### SyncEngine

The engine executes the synchronization state machine via a generator function `run()`.

How to use SyncEngine programmatically?
```js
import { SyncEngine, SyncConfig } from '@nan0web/sync'
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
```
## Contributing

How to contribute? - [check here]($pkgURL/blob/main/CONTRIBUTING.md)

## License

How to license? - [ISC LICENSE]($pkgURL/blob/main/LICENSE) file.
