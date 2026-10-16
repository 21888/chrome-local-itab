# Task dialog composition draft ownership — 2026-10-16

## Observed model defect and bounded repair

The 1.1.155 baseline already advances quick-entry draft ownership on
`compositionstart`, before a native input method necessarily emits its first
`input` event. The ordinary task editor and batch editor advanced their draft
generation only on `input`.

A deterministic actual-View/Controller/Store test reproduced the gap: submit an
edit or reviewed batch, hold its write, start a new composition while the
textarea still has its submitted value, then release the earlier write. Its
successful continuation closed the editor and removed the newly composing
field. Starting composition also left an earlier batch review attached, or
allowed a pending review to publish against the new draft ownership.

The repair only changes `shared/local-tasks-view.js`:

- Ordinary edit treats `compositionstart` like a new draft generation. An older
  save or retry cannot close it before the first changed-text input.
- Batch composition start advances both draft generation and review epoch,
  invalidates a previous review, and retires a pending review's ownership.
  Composition still disables review/confirmation until it ends or blurs.
- Ending or cancelling composition without a subsequent input does not return
  ownership to the older asynchronous operation. The dialog stays available
  for an explicit next action.
- Existing immutable batch retry commands survive this invalidation. Retry
  confirms that exact old batch first, without adding duplicates or discarding
  the newly owned draft. A completed batch still requires another review before
  that retained text can be submitted again.
- An ordinary uncertain edit followed by a newly owned composition does not
  reuse its old command silently. A new Save retains the old version baseline;
  if the old write committed, the existing conflict review is required. Only
  the existing explicit replacement action can then commit the new draft.

Unchanged editors still close after their own confirmed save. Cancel, Escape,
destruction and reopened-editor ownership keep their existing semantics. A
cancelled dialog does not undo a write already started. There are no changes to
Controller, Store, storage adapters, schema, permissions, locale text, shared
focus behavior or manifest version (1.1.155).

## Regression evidence

Baseline commit: `3a1dec2e8c283e349bc8d595a56988d63137ce2d`.
Baseline tree: `81d3407a4c0fef1a6487c6a7799b17490166a728`.

`tests/local-tasks-dialog-composition.test.js` contains 24 synthetic DOM/event
model cases using the actual View, Controller and Store. Copying that exact
file into an independent unchanged baseline checkout gives **6 passed and 18
failed**. The candidate gives **24 passed**, with zero failures, cancellations
or skips.

The cases cover first-input-free composition, composition end and blur with no
input, deliberate later save/review, unchanged-save closure, failed and
uncertain exact-command retries, immutable batch preview retention, ordinary
edit version conflict after uncertainty, cancel/reopen, destruction, and old
review success/failure arriving after a fresh review. Checks assert stored
text/order, write counts, exact operation identity, draft retention, focus,
review visibility and departure ownership.

Focused command:

```sh
node --test tests/local-tasks-dialog-composition.test.js tests/local-tasks-view.test.js tests/local-tasks-batch-view.test.js tests/local-tasks-edit-return-focus.test.js tests/local-tasks-departure.test.js tests/local-tasks-visibility.test.js tests/local-content-lifecycle.test.js tests/dialog-focus.test.js
```

Result: **188 passed**, zero failures, cancellations or skips. This also covers
existing quick-entry Enter/Shift/repeat behavior, composition blur recovery,
text validation, duplicate batch lines, cancellation, focus-return ownership,
remote-hide draft preservation and departure guards. Syntax checks for the
changed runtime and new test file, manifest JSON/version validation, and
`git diff --check` passed.

## Verification limits

This is deterministic DOM/event-model coverage, not a newly reproduced native
IME/browser defect. It does not establish actual composition event timing,
candidate selection behavior, focus painting or assistive-technology output
on a native OS/Chrome combination. No real browser, screenshots, user profile,
provider, release, packaging or aggregate test run was used for this slice.
The integration workflow owns independent review and complete release gates.

The scope follows existing draft-preservation requirements in
[tasks quick-entry composition](tasks-quick-entry-composition-validation.md),
[reviewed batch capture](tasks-batch-capture-validation.md) and
[task edit return focus](tasks-edit-return-focus-validation.md). Existing
native-platform limits remain documented there; no new product feature or
expanded data persistence is proposed.
