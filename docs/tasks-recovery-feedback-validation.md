# Tasks recovery feedback after an invalid import

## Correction

An invalid task-backup file could leave a page-local error above the Tasks list. Restoring a previous local copy then succeeded in storage, but the page still said “Nothing was replaced.” The old error also hid a later recovery write failure or revision conflict from the page-level status.

The recovery preview now captures the existing local error before its asynchronous read. Once the requested copy has been found and the preview still owns its opening, it clears that exact error only if it remains current. A newer error, including another error with the same code, is retained. Nothing clears page-local feedback when a delayed recovery save finishes.

This changes only `View.reviewRecovery`. It does not change store operations, schema, permissions, IDs, versions, recovery-copy limits, drafts, Undo, manifest or existing import behavior. The correction does not introduce a new successful-save state; existing preview/cancel status transitions remain unchanged. A preview may reveal Saved from an earlier action, but cancelling writes nothing and is not a successful restore.

## Focused verification — 2026-10-17

Eight new regression cases in `tests/local-tasks-view.test.js` use the real Store and Controller with the existing DOM model, controlled storage/file failures and synthetic task text. Against baseline `2a1aab8e6a669e6f1e7de9b2e06193ee63574e86`, five fail and three pass. With this correction, all eight pass:

- Invalid import followed by confirmed recovery: the list goes from one task to two and displays Saved. Task identity, order, text, state and timestamps are preserved; live versions regenerate, the pin is restored, and the replaced current list remains as the previous local copy.
- Cancellation from Ready: status returns to Ready, with zero writes and unchanged persisted state.
- Failed preview reads and missing copies: current READ and CONFLICT errors remain visible.
- Confirmation WRITE failure and revision CONFLICT: current feedback appears both on the page and in the dialog. The conflict hides confirmation; a write retry uses the same operation ID and succeeds.
- Delayed preview and save: newer export FILE errors survive, including distinct errors with the same code.
- Quick-entry draft and Undo: cancellation retains both; confirmed recovery keeps the unsaved draft and does not let an old Undo act on regenerated task versions.

Commands run from the repository root:

```sh
node --test --test-name-pattern='recovery feedback:' tests/local-tasks-view.test.js
node --test tests/local-tasks-view.test.js tests/local-tasks-store.test.js tests/local-tasks-departure.test.js tests/local-tasks-completion-undo.test.js
node --check shared/local-tasks-view.js
node --check tests/local-tasks-view.test.js
git diff --check
```

The four-file focused suite passed **109/109**. The original independent reproduction also passed with the corrected view: a confirmed recovery changed the persisted task count from one to two, retained the old one-task copy, and displayed “Saved on this device” without the error class.

## Limits

This is logic/DOM-model verification, not a fresh native-browser, screenshot, screen-reader, cross-platform or full-suite check. No user profile, personal data, live service, paid platform, publication or Chrome Web Store submission was used. The manifest version remains unchanged.
