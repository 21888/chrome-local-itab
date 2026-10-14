# Shared configuration contract

`shared/configuration-codec.js` extracts the configuration-default and validation
contract from formal1.1.139 Storage. This is a behavior-preserving foundation,
not a new recovery exporter or a stricter replacement policy.

## Runtime boundary

The UMD module loads only pure layout identity, dashboard-template, world-clock
and stored-URL dependencies. Loading it does not create StorageManager, workspace
sessions, storage listeners, timers, providers or network requests.

- `createDefaultConfig({ getMessage })` generates the established defaults using
  only an explicitly supplied localization callback. Empty/throwing/missing
  localization retains the existing fallbacks.
- `create({ getMessage, now, workspace, warn })` creates a standalone validator.
  The caller supplies a clock, existing workspace-error mode and warning sink.
- `ConfigurationValidator` owns the single implementation of32 importer/default
  methods. Its instance can validate supported input without a storage backend.
- `install(prototype)` installs those shared method descriptors on ordinary
  StorageManager, excluding the two narrow context adapters. It intentionally
  changes only the supplied prototype when invoked; module load does not invoke it.

Storage continues to own I/O, locks, generations, recovery snapshots, mutation
transactions, Sync and all fallbacks that actually write. Its constructor keeps
listener registration, default construction and workspace-validator configuration
in their former order. Its `validateData` adapter supplies live workspace/error
context and `console.warn`; its category adapter supplies the current realm's
`Date.now`. No copied validator remains in Storage for those two methods.

The ordinary pages load the codec before storage.js. The independent read-only
recovery page does not load either Storage or this codec in this foundation
commit. Future consumers must explicitly opt in and preserve their own read-only
boundary.

## Compatibility is not recovery eligibility

This extraction retains existing normalization/default behavior. The importer
accepting a value does not establish that a damaged retained copy is complete,
private-field-free or safe to advertise as recoverable. In particular, version1
imports can fill defaults, and existing configuration validation has historical
field-tolerance rules. No such rule is broadened or silently tightened here.

A future recovery-file gate must inspect a selected original checksum-verified
representation, reject missing/unknown required configuration and credential URLs,
and prove exact retained-value equality. It must not convert the current lossy
investigation projection. That separate feature requires its own review/UI and
independent regression gates.

## Verification

The differential test fixtures are exact formal1.1.139 storage.js and its four
pure dependency sources, each pinned by SHA256 under tests only. It is never a runtime dependency or packaged extension asset.
Candidate and baseline run separately with controlled clocks, locales and synthetic
APIs; comparisons cover normalized values, refusals/error codes/messages, source
immutability and existing writer/provider boundaries. Pure browser/CommonJS cold
loads are separately checked against forbidden API access.

Existing import, export, layout/URL, Sync, Complete and workspace suites remain
required in addition to differential tests. A dependency-loading change in a VM
fixture does not relax its behavior assertions. The package contains exactly129
runtime files including the codec, and excludes the entire tests tree.
