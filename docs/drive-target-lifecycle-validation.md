# Drive target lifecycle validation — 2026-10-16

## Reproduced defects

Using the actual Options event handlers and synthetic local provider responses:

1. Start renaming the `home` computer and hold its result. The computer selector
   remained enabled. Selecting `work` was rejected by the action lock, but the
   focused selector continued to display `work`. The actual target stayed `home`.
   A subsequent Rename therefore changed `home` while the selector showed `work`.
2. Hold an older panel read containing `home`, then complete a selection of
   `work`. Releasing the older read rolled the visible selector and name back to
   `home`, although the saved target remained `work`.

Six focused regressions fail against baseline `bfdf50e`: pending Rename, Add and
Select control ownership, stale successful and failed reads, and a panel refresh
that re-enabled actions while another operation was running. These tests pass
with the fix. Two additional superseded-final-read tests fail on the first
implementation (`3f65bd8`) and pass after closing that review finding. No real
account, network request or browser automation was used.

## Bounded UI change

- Lock the selector and Drive action buttons for every operation, including
  workspace preflight and the final panel read. The name field stays editable.
- Capture a requested computer ID before awaiting. Keep showing the last
  acknowledged target until a successful read supplies the selected target.
  Reject programmatic changes while disabled/busy and restore that target.
- Retire panel reads when an operation starts. Only the newest panel request may
  update computer identities, status, snapshot history or control availability.
  If a newer read supersedes the final refresh, the action stays locked until
  the latest panel owner settles; an obsolete return cannot release controls.
- Render action availability from the newest acknowledged panel state, retaining
  read failures and workspace restrictions after releasing the busy lock.
- Preserve existing per-computer name drafts. A completed action restores focus
  to its still-available trigger only if disabling it left focus on the page;
  it does not move focus away from later typing or another chosen control.

This is page-only UI state. Storage logic, schema, saved keys, permissions,
provider operations and manifest version remain unchanged. It does not introduce
a cross-tab provider transaction or claim to prevent another page from changing
the provider's active computer between separate operations.

## Verification

- `tests/drive-download-draft.test.js`: 44 passing tests, including 16 new cases
  covering pending target ownership, programmatic changes, late reads, failure,
  final-refresh locking (including superseding successful/failed reads),
  workspace preflight and focus.
- Drive, download-feedback, Options and settings/workspace lifecycle suites:
  209 passing tests.
- `node --check options.js` and `git diff --check` pass.

Reproduce the associated checks with:

```sh
node --test tests/drive-backup.test.js tests/drive-download-draft.test.js \
  tests/backup-download-feedback.test.js tests/*options*.test.js \
  tests/settings-stale-save.test.js tests/workspace-lifecycle.test.js
```

These are source-level DOM/provider models. Native Chrome focus/dropdown
behavior, real Drive/OAuth behavior and extension installation/upgrade are not
verified here. No screenshots, release assets or store submissions are produced.
