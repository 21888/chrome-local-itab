# Collection body review lifecycle

## Behavior

A body revision or historical-body restore belongs to the saved item and page
context in which it was reviewed. Selection changes (including A → B → A),
editing, a newer saved-data read, a newer review, page departure, and teardown
invalidate the earlier review. Its delayed success or failure cannot reopen a
confirmation, write a different item, replace newer feedback, or redraw/focus a
newer editor. Proposed text remains available in the tab for a fresh review.

The controller admits reviews only after the current saved-data read finishes.
It binds the original frozen store plan to its record/state identity and read,
interaction, and review generations. Only that exact still-current plan can be
accepted, once. A view-owned dialog is closed without restoring stale focus on
invalidation; detached buttons and input callbacks cannot affect later dialogs.

Confirmed writes continue through the existing mutation and receipt machinery.
An uncertain save retains its exact pending command and proposal; checking or
retrying that command cannot append a duplicate body version. No background
retry is added. Store format, schema, permissions, and manifest version are
unchanged.

## Validation

The original five real-Store/DOM-model reproductions all failed on the baseline
and passed with this fix: delayed review over another item's draft, delayed
error after a newer save, persisted pagehide/pageshow, view destruction, and
controller disposal.

`node --test tests/collection-revision-lifecycle.test.js` covers 40 scenarios:

- Success and failure after selection, round trips, drafts, refresh, and disposal.
- Exact plan identity, newer review supersession, and single acceptance.
- No stale modal, status, focus, editor replacement, or proposal removal.
- BFCache cancellation during both editing and confirmation; stale detached
  buttons/input cannot close or modify a newer dialog.
- Host removal and an old finally block while a newer revision is active.
- Current success, review failure, uncertain-write retry, historical restore,
  and admission while saved data is still being read.

Related regression command:

`node --test --test-concurrency=1 tests/*collection*.test.js tests/local-ai-markdown-view.test.js`

The existing UI, tag-preservation, and Markdown fixtures now wait for the
post-save refresh before simulating a new review. The cross-tab editor test
expects the invalidated flow to preserve its proposal without publishing an
obsolete error. These checks use synthetic data and the repository DOM model;
they do not claim native browser or BFCache verification.
