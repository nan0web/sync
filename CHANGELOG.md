# Changelog

## [1.0.3] — 2026-02-25

### Fixed

- **Critical:** Bumped `@nan0web/db-fs` to `^1.1.2` — fixes `ERR_MODULE_NOT_FOUND` for `yaml` in global/standalone installs (#2026-02-25-02)

### Added

- `knip.json` — production lint config per system.md
- `knip` script and integrated into `test:all` pipeline

## [1.0.2] — 2026-02-25

### Added

- `httpHost` config property for independent HTTP host configuration behind Apache/vhosts (#2026-02-25-01)
- `NAN0_SYNC_HTTP_HOST` environment variable mapping

## [1.0.1] — Initial patch

### Fixed

- Minor CLI stability fixes

## [1.0.0] — Initial release

- SyncManifest — MD5-based directory diff engine
- SyncConfig — YAML/env-driven configuration
- FTPAdapter — `basic-ftp` based deployment
- `nan0sync` CLI with progress bars and atomic locks
- Vite-powered documentation site with `@nan0web/ui-lit` components
