# Settings JSON transfer localization

## Scope

Settings JSON export/import feedback uses the displayed English or Simplified
Chinese catalog with the previous English wording as the fallback. This covers
preparation, the existing large-export confirmation, file selection/processing,
the replacement preview and its counts, cancellation, success, and existing
error branches. The one shared feedback shell also localizes the operation name,
file-size label and item label. An unknown operation retains `toUpperCase()`.

Only user-visible string expressions in `exportSettings`, `importSettings` and
`showImportExportFeedback`, plus 25 new keys in each catalog, change at runtime.
The shared translation helper, all other Options functions, HTML, storage,
controllers, schemas, permissions and manifest remain unchanged.

Filenames and raw error details are concatenated directly after the translated
prefix. They never pass through translation substitution, so `$&`, `$1`, newlines
and HTML-like text remain literal. The real toast renderer still uses
`textContent`. Only numeric size/count values enter existing substitutions.

Underlying diagnostic strings and the original case-sensitive `includes`
classification remain unchanged. Raw validation, JSON parsing, storage and
recovery details can therefore still be English. This change does not attempt
to reinterpret errors or create error codes. Existing schema-1/schema-2/stored-URL
download-request guidance, the 10 MiB read warning and the recovery confirmation
remain unchanged.

The timestamp, feedback status and console arguments are unchanged. File size
still uses one decimal place in KB; zero/missing file-size and record-count
metadata remain omitted. Export still reports only that a download was requested;
this page cannot verify browser download completion or later cancellation.

## Safety and behavior boundaries

- The existing export warning remains strictly above 5000 KiB; the import read
  warning remains strictly above 10 MiB and occurs before `file.text()`.
- Preview order, numbers, optional asset lines and the final recovery reminder
  are unchanged. Neither cancellation starts a replacement.
- The actual confirmed-restore operation, local provider-state preservation,
  atomic recovery/receipt submission and readback verification are unchanged.
- An uncertain write is still uncertain. Same-file verification retries and
  pending-receipt conflicts retain the original recovery evidence.
- Stored URL spellings, independent layout identities, record payloads,
  metadata, private local modules and unsaved drafts are never translated.
- Filename generation, URL revocation after 60 seconds, the 1500 ms guarded
  reload and file-input clearing retain their existing behavior.

## Focused regression

Run from the repository root:

```sh
node --test tests/settings-transfer-localization.test.js tests/backup-download-feedback.test.js tests/backup-read-safety.test.js tests/backup-roundtrip.test.js tests/import-settings-navigation.test.js tests/identity-recovery-ui.test.js tests/legacy-url-restore.test.js tests/settings-stale-save.test.js
node --check options.js
node --check tests/settings-transfer-localization.test.js
git -c core.whitespace=cr-at-eol diff --check
```

The named `Settings JSON transfer localization (RAM integration)` suite reuses
the existing DOM and memory-storage fixtures. It executes actual DOMContentLoaded
initialization, actual bound export/import controls materialized from
`options.html`, the real translation helper, final feedback/toast rendering,
StorageManager validation, locks, recovery/receipt logic and delayed reload guard.
Only synthetic data is used. File reading, DOM/events, confirmation dialogs,
Chrome storage, URL creation and timers are local models; they never read a
browser profile, contact a provider or trigger an actual browser download.

Coverage includes both catalogs, unsupported-language English fallback, absent,
throwing, empty and key-returning catalogs, missing individual messages and no
translation helper; literal filenames and error details; size thresholds,
cancellation and pending reads; unchanged error classification and precedence;
schema/URL-identity export and import/re-export; recovery and receipt verification,
uncertain writes, retry and conflict handling; provider-state and private-module
preservation; metadata zero/nonzero behavior; failed download cleanup/retry;
and a newly opened draft blocking the delayed reload.

## Results (2026-10-16)

- New suite: 89 passed, no failures, skips or cancellations.
- Final new tests against baseline `0cf750ec435579f3e5fbdcfca6622e5d1382f24c`
  runtime/catalogs: 42 passed and 47 expected failures exposing hard-coded
  English and missing scoped messages. The feedback-shell Chinese case was also
  independently red before its three string-expression changes.
- The eight explicitly named related suites above: 291 passed, no failures,
  skips or cancellations.
- Changed JavaScript syntax and both catalog JSON parse checks pass. The CRLF-aware
  diff check passes; a bare `git diff --check` treats the preserved original CR
  line endings on changed lines as trailing whitespace.
- Reversing exactly the new localized expressions reproduces baseline
  `options.js` byte-for-byte, including its existing line endings. Removing
  exactly 25 added keys per catalog reproduces the baseline parsed catalogs.
- These are focused Node/RAM checks, not a full-repository or native-Chrome pass.
  Native dialog layout/focus, actual file picking, real persistent extension
  storage, browser download completion and cross-device Sync were not tested.
  No Python, screenshot, release, store submission or publication is claimed.
