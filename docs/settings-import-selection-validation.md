# Settings JSON file-selection ownership

## Behavior and boundary

An unconfirmed Settings-only JSON read belongs to its current file selection.
Opening the picker retires that preparation immediately, even if the picker is
then cancelled. A new selection (including an empty or invalid selection), a
native input cancel, pagehide, or document visibility becoming hidden also
retires it. Switching Settings panels alone is not a document-hide event. Returning to the
page does not revive an old read. A subsequent selection can start normally.
File reading itself is not aborted; its obsolete result is ignored. An existing
Processing toast still uses its ordinary 3000 ms removal timer.

After either file-text or local provider-state reading, an obsolete completion
cannot open the old replacement confirmation, publish an error over newer
feedback, clear a newer input, or submit a replacement. Replaced input elements
are not cleaned up by the old request. The picker clears its input before opening
so selecting the same filename again remains possible.

Once the current replacement confirmation is accepted, the existing restore
continues to own its result. The two file-import controls are temporarily disabled
until that operation finishes, with their original disabled states restored in
finally. Picker/cancel/page-lifecycle events do not turn a submitted restore into
a cancellation or hide its error/success. Other controls, existing replacement
serialization, recovery copies, receipt verification/retry/conflict handling and
the guarded 1500 ms success reload remain unchanged. This is page UI ownership;
no StorageManager, workspace Session, schema, permissions or manifest changes.

The reproduced baseline was a late A confirmation after newer B had already
verified, before B's 1500 ms reload. A replaced B only after explicit acceptance
of that second confirmation. This change does not establish an automatic overwrite
or an explanation for any historical data-loss incident.

## Focused checks (2026-10-17)

```sh
node --test --test-name-pattern='selection ownership:' tests/settings-transfer-localization.test.js
node --test tests/settings-transfer-localization.test.js tests/backup-roundtrip.test.js tests/import-settings-navigation.test.js tests/settings-stale-save.test.js tests/import-safety.test.js tests/identity-recovery-ui.test.js
node --check options.js
node --check tests/settings-transfer-localization.test.js
git -c core.whitespace=cr-at-eol diff --check
```

- The 18 new selection cases fail against unchanged baseline
  `b2860323e6408c8b5f3a9da8751045bb2d55d358` and pass with the UI change.
- All 166 tests in the six named related suites pass; no failures, skips or
  cancellations. Changed JavaScript syntax and the CRLF-aware diff check pass.
- The tests execute actual Options DOM-ready/bound handlers and real
  StorageManager/workspace Session/recovery/receipt code with synthetic memory
  storage. They cover late file/provider success and failure while B is pending,
  late A after verified B, picker opening independently of cancellation, repeated
  selection, empty/invalid input, hidden-to-visible, pagehide, replaced inputs,
  confirmation lifecycle, original disabled-state restoration, verified saves and
  submitted-but-unverified saves followed by same-file verification retry. The
  multi-listener event model preserves both import and restore lifecycle listeners.
- A reopened captured Session reads B and the unchanged independent personal
  modules; a late A creates no additional confirmation, write or reload timer.
- Initial test scaffolding used invalid placeholder personal-module records;
  that fixture failure is not counted as baseline bug evidence. The final red
  run uses valid synthetic module states and normal event dispatch/no-op behavior
  for event listeners absent from the baseline.

These are focused Node/RAM checks, not the full Node suite or native Chrome QA.
Native picker/dialog rendering, browser lifecycle ordering and persistent browser
storage were not exercised. No browser, screenshots, provider operation, user
device, push, tag, release or store submission was used for this patch.

## Confirmed replacement fence (2026-10-25)

A confirmed Settings replacement also retires any older unconfirmed JSON
preparation, before its queued operation starts. Retirement is permanent for
that preparation even when Reset fails or returns false. Declining Reset does
not retire it. A new deliberate picker selection still works after either
outcome. Already-confirmed imports continue to own their submitted result,
including uncertain-write verification retries; this is not cancellation of
storage work.

The added matrix uses actual Options DOM-ready and bound Reset/import controls.
It holds file text or provider-state reading, accepts Reset, changes an ordinary
quote draft while Reset is pending, and then releases the obsolete read with
success or rejection. Successful Reset uses real StorageManager/workspace
storage and its real reload guard; failed-write cases inject a synthetic storage
rejection, while false-result cases model the clear operation returning false.
It checks no late import dialog, feedback, error log, toast, input cleanup, write
or reload, preservation of the newer draft, and a later deliberate picker.
A declined-Reset control verifies the original preparation remains usable.
Existing verified/uncertain confirmed-import tests cover submitted ownership and
same-file retry. All records and errors are synthetic.

This is a late-prompt/error ownership counterexample, not evidence of automatic
data loss or a historical incident cause. On the old path, overwriting after the
late preview still requires a second explicit acceptance. Native file dialogs,
browser event ordering and persistent browser storage are outside this RAM model.
Validation against baseline `474d689` (unchanged runtime, new tests) produced
12 expected failures: six late replacement confirmations and six late error
feedback results. The declined-Reset control passed. No fixture failures,
skips or cancellations occurred. The assertions were unchanged for the fix.

After adding the single retirement call in `replaceSettings`, all 246 tests in
the eight suites below passed (serial execution; no skips or cancellations),
including all 13 new cases and confirmed verified/uncertain import/retry cases:

```sh
node --test --test-name-pattern='confirmed (retained-draft|rejected|false) reset|declining Reset' tests/settings-transfer-localization.test.js
node --test --test-concurrency=1 tests/settings-transfer-localization.test.js tests/backup-roundtrip.test.js tests/import-settings-navigation.test.js tests/settings-stale-save.test.js tests/import-safety.test.js tests/identity-recovery-ui.test.js tests/backup-read-safety.test.js tests/backup-download-feedback.test.js
node --check options.js
node --check tests/settings-transfer-localization.test.js
git -c core.whitespace=cr-at-eol diff --check
```

Both syntax checks and the diff check passed. Raw local run evidence is in
`/tmp/itab-reset-preparation-negative.log` and
`/tmp/itab-reset-preparation-focused.log` (ephemeral, not repository artifacts).
This is a focused model pass, not a full suite or native GUI pass. No version,
manifest, store submission, release or push was changed by this task.
