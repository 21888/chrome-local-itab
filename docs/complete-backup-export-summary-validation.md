# Complete-backup export summary validation

## Scope

The ordinary complete-local-backup export now prepares a count-only summary, followed by an explicit single-use download of the exact generated JSON string. Store export, schemas, parsing safety, replacement/review tickets and recovery protocols are unchanged. English and Simplified Chinese fallback/catalog labels, README entries and guides describe the two steps and saved-snapshot limitation.

The View uses existing pure parse/count APIs on the generated string. The full parsed object is transient; only the exact original string, bounded selected IDs/token and rendered small statistics survive preparation. No restore review or extra storage read is used to generate the summary. Global library counts include their retained recovery count once. Ordinary preparation retires any earlier restore or interrupted-recovery review UI.

## Evidence and boundaries

`tests/complete-backup-export-summary.test.js` exercises the production Store, StorageManager and workspace manager using RAM-only synthetic fixtures, plus synthetic DOM/File/MutationObserver events. It is not native Chrome, download-completion, screen-reader, visual-layout or performance certification. No real profile, network provider, user data, permission request, screenshots or external services are used.

Coverage includes all 127 nonempty seven-module selections (schemas 2/3/4), schema 1, live/Trash counts, global-only identity metadata, repeated local images, exact Chinese/emoji UTF-8 bytes, later saved edits, count-only text, both languages and no extra reads/writes. The independent summary oracle reads the exact JSON sent to download rather than reusing the View’s aggregate methods. Preparation/cancel/repeat, empty selection, malformed/oversize/read failure, lost focus, current-selection mismatch, stale async results, destruction, page departure and removed/reattached nodes are checked. Submitted downloads keep their lock until settlement, release it even offscreen, never revive stale feedback, and never automatically retry. Both callback and pending-observer-record paths are exercised.

The initial feature probe failed because there was no export-summary panel. A separate pre-fix probe demonstrated that a submitted download settling offscreen could strand the local lock; success and failure regression cases now require releasing that lock without rendering stale success or retaining reusable bytes.

## Existing-test adjustments

- `complete-backup-view.test.js`: replace the ordinary-export `'JSON'` placeholder with a valid real Store fixture and assert zero downloads until the new explicit button. Existing restore, Focus, recovery, interrupted-copy cancellation and uncertain-result assertions remain.
- `complete-backup-scope-reading.test.js`: provide the already-loaded global count APIs in its VM and insert summary/zero-download assertions before the explicit ordinary download. Keep the original narrowed-scope, stale-read, unchanged-storage and restore protection checks.
- `complete-backup-target-recovery.test.js`: the ready ordinary export now has uncommitted page-local work until download/cancel; assert that state, then explicitly download and retain the original narrowed-scope and unchanged-storage checks.
- `complete-backup-module-bulk-select.test.js`: ordinary export fixtures use valid real JSON plus pure count helpers, so lock testing cannot pass merely because invalid placeholder data failed. Assert the resulting summary is ready with zero downloads. Other bulk-selection and restore guards remain.

Only directly related complete-backup View, selection, recovery and localization tests are run for this candidate. The existing 32 MiB boundary remains unchanged; the oversize rejection test is a malformed output boundary probe, not a claim that a 32 MiB production export has passed scale or browser performance validation. No full-suite or scale run is claimed here.

## Focused candidate run

All 228 tests passed in the following directly related run (37 new export-summary tests, including the 127-selection matrix within one test). Raw-output SHA-256: `7c2643fa0db3c12fef9d124e9e23962be5738366ec715df1513ce4f1e808e170`.

```sh
node --test tests/complete-backup-export-summary.test.js tests/complete-backup-view.test.js tests/complete-backup-scope-reading.test.js tests/complete-backup-module-bulk-select.test.js tests/complete-backup-download-review.test.js tests/complete-backup-target-recovery.test.js tests/complete-backup-options.test.js tests/complete-backup-import-receipt-view.test.js tests/complete-backup-image-counts.test.js tests/complete-backup-workspace-impact.test.js tests/complete-backup-prompts-view.test.js tests/complete-backup-collections-view.test.js tests/complete-backup-contrast.test.js
```

The View and new test file also pass `node --check`; both changed catalogs parse as JSON, and `git diff --check` is clean. These checks do not replace independent review, full CI or native browser verification.
