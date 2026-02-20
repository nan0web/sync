[українською](task.md) | [english](task.en.md)

# Release v1.0.0: The Complete nan0sync Engine

## Mission (Scope)

Release the stable version of `@nan0web/sync` (v1.0.0) package to serve as a reliable tool for differential deployment of static sites and applications in the NaN•Web ecosystem. The platform will now use data-driven documentation built directly via the `nan0web.app` compiler, combined with web components from `@nan0web/ui-lit`.

## Definition of Done (Acceptance Criteria)

1. **Sync Core (Engine):**
   - Fully operational `diff` engine for comparing local files (`dist/`) against the remote server.
   - Remote manifest file (`.nan0web/sync.index.json`) acting as a Single Source of Truth to handle multi-developer deployments without breaking tracking states.
   - Locks mechanism to prevent concurrency during the upload process.
2. **Transport Adapters:**
   - Operational FTP adapter (core priority) with support for passive transfers.
   - Basic skeleton for SSH transfers.
3. **CLI Interface:**
   - Supported commands: `nan0sync push`, `nan0sync status`.
   - Native support for the `--dry-run` flag to safely log modifications prior to executing network mutations.
4. **Universal Documentation (Data-driven UI):**
   - Deprecated monolithic `.js` documentation in favor of pure configuration-based representations evaluated by `nan0web.app`.
   - Open configuration files with YAML syntax mapped onto native web components (`<ui-hero>`, `<ui-feature-grid>`, `<ui-api-grid>`).
   - UI consistency across the platform via components inherited from `@nan0web/ui-lit`.
   - SVG vector assets implemented successfully under the `public` repository.

## Architecture Audit

- [x] Read system indices avoiding redundancies?
- [x] Evaluated package duplications?
- [x] Data sources implemented properly (YAML)? (Data-driven structure applies).
- [x] Validated cross-platform UI standards? (Deep linking via single `nan0web.app` compiler handles architecture efficiently).
