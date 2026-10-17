# Preserve destination review during an ordinary recovery download

## Reproduction and change

Baseline `47b71aef03b595024a00938aff0b2e40fe08424c` clears a settled review
awaiting a destination when **Download pre-restore recovery copy** runs. For a
schema-1 file containing configuration and scratchpad, deselecting configuration
then downloading recovery loses both the file and the narrowed selection.
Choosing the file again selects both modules again. No replacement is performed
without confirmation, but the user's review choices are lost.

The ordinary recovery download now retains a settled `ready` or `target` review
and resumes that same phase after success, missing recovery or download failure.
It keeps the source, module choices, target choices, review object and rendered
counts. It does not re-review, refresh the approval baseline or choose a missing
destination. A target-less review still cannot be applied.

The existing generation guard still owns cancellation and late completion.
Ordinary Export and recovery during initial reading or an unconfirmed large-file
prompt keep their existing cancellation behavior. The separate **Download both
saved copies** handler is unchanged. Runtime changes are limited to the ordinary
download handler in `shared/complete-backup-view.js`; Store, storage, formats,
restore protocol, receipts, permissions and version `1.1.155` are unchanged.

## Focused verification (2026-10-16)

The new test file runs production View, Settings restore controller, Store,
StorageManager and workspace code against synthetic DOM and memory-only data.
On the baseline, the three narrowed schema-1 outcomes and the global-destination
case fail because the review becomes hidden: **4 fail, 7 pass**. The identical
tests with the fix pass **11/11**.

Coverage includes preserving an already chosen prompt destination while the
collections destination remains unchosen; later explicit scratchpad-only
restoration with the exact ready review object; stale saved data rejected by
the real Store's CAS check; unchanged dirty drafts and focus; and Cancel,
Cancel followed by a new file, and destruction while recovery is pending.
Downloads make no storage writes or provider calls and never restore or reload.

Explicit related test files, run serially with a 512 MiB Node heap, pass **96/96**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/complete-backup-target-recovery.test.js \
  tests/complete-backup-scope-reading.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-download-review.test.js \
  tests/complete-backup-options.test.js \
  tests/complete-backup-prompts-view.test.js \
  tests/complete-backup-collections-view.test.js
```

`git diff --check` passes. This is focused automated verification only, not a
full-suite, native-browser, screenshot, packaging or publication pass.
