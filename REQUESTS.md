# Incoming Requests for @nan0web/sync

## Request #2026-02-25-01: Independent HTTP Host Configuration (`httpHost`)

- **From:** legalgreenplanet.tech (Deployment failure behind Apache/vhosts)
- **Goal:** Allow providing a separate host for unpacking chunk requests (HTTP) while using an IP address for FTP.
- **Priority:** 🟠 High
- **Status:** ✅ DONE (25.02.2026)
- **Context:**
  When DNS resolves to a provider that blocks standard FTP access or goes through a CDN (like Cloudflare), it is common to deploy via direct IP over FTP, but the `.php` chunk extractor must still be queried over HTTP using the domain name to satisfy virtual hosts routing. If `142.132.x.x` is used, Apache returns `503 Service Unavailable` because it expects the `legalgreenplanet.tech` `Host` header.
- **Fix:** Added `httpHost` property to `SyncConfig`. If present, `_nan0sync_unpack.php` uses `httpHost` instead of `host` in `nan0sync.js`. Also mapped `NAN0_SYNC_HTTP_HOST` in environment overrides.
- **Tasks Completed:**
  - [x] Add static schema `httpHost` in `src/SyncConfig.js`.
  - [x] Fallback `config.httpHost || config.host` logic in `bin/nan0sync.js`.
  - [x] Testing: `legalgreenplanet.tech` unpack sequence is working.

## Request #2026-02-25-02: Fix `@nan0web/db-fs` downstream dependency

- **From:** Global install panic
- **Priority:** 🔴 Critical
- **Status:** ✅ DONE (25.02.2026)
- **Context:** `@nan0web/db-fs` was missing `yaml` dependency. Once installed globally, `@nan0web/sync` crashed.
- **Tasks:**
  - [x] `@nan0web/db-fs` published `1.1.2` with `yaml` in dependencies (tracked in its `REQUESTS.md`).
  - [x] Updated `package.json` of `@nan0web/sync` to use `@nan0web/db-fs@^1.1.2`.
  - [x] Bumped version to `1.0.3`.
  - [ ] `npm publish --access public` (awaiting confirmation).
