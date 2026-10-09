# Appearance field concurrency validation — 2026-10-09

## Verified defects and fix

Against base `5c241523bec1655221255b87ab2581e1db8fc2bf`, the actual dashboard
and Settings appearance controls both reported successful concurrent saves, but
one independent choice was lost. Template-first saved Clarity/Dark instead of
Folio/Dark; color-first saved Folio/Light. A separate queued case saved an earlier
Graphite template again while changing color, overwriting another page's intervening
Folio selection.

The same deterministic tests fail on that original source and pass on the fix.
The same-field and rapid same-page coalescing control cases pass on both.

`StorageManager.patchAppearance` validates and snapshots the requested fields and
page generation, then reads, checks, merges and writes inside `local-itab-local-write`.
It returns the committed appearance to the controller. Dashboard and Settings use
their original configuration-generation baseline. Per-field intent versions retire
acknowledged fields while preserving newer same-field choices. No source outside
these appearance paths is changed at runtime.

## Automated coverage

`node --test tests/appearance-concurrency.test.js` runs 26 actual-code regressions
with separate page globals, actual dashboard/Options mount paths and a shared
Chrome-storage/Web-Locks model. Coverage includes:

- Both concurrent field orderings, same-field serialized intent, rapid coalescing,
  and cross-page interference between two queued local selections
- Newer same-value intent, failed newest selection after an earlier commit,
  read/write/lock/initialization rejection, failed acknowledgements without retry or
  rollback, malformed generation, missing initial baseline, missing locks and explicit retry
- Whole restore, reset and applied Sync invalidation, identical-value replacement,
  both orderings around a locked restore, and a fresh page's successful new choice
- Legacy theme resolution without migration writes, unknown appearance siblings,
  unchanged settings/Free positions/private-content records, invalid inputs and
  snapshot isolation before asynchronous initialization
- Ordinary Settings coexistence, optional Sync scheduling failure, workspace
  recommendation review invalidation without implicit apply, and English/Chinese
  conflict guidance remaining visible after deferred refresh and later refresh failure

The existing appearance/controller, gallery and workspace suites retain their
coverage. Focused combined run: 38 passing tests. Full repository run:
615 Node tests, 19 Python packaging tests; JavaScript syntax and manifest/locale
JSON checks pass. Expected injected failures print diagnostics in test logs.

## Limits

This is deterministic source/DOM/storage-model evidence, not native Chrome
acceptance. No browser, real provider account, live Sync/Drive authorization,
operating-system accessibility or exhaustive template/viewport check is claimed.
Old-version pages or third-party direct storage writes cannot be protected by a
lock or generation check they do not use. A failed storage acknowledgement does
not prove a write was absent; there is no automatic retry or rollback.
