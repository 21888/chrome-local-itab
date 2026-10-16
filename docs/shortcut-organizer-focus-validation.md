# Organizer failure focus — 2026-10-16

## User-visible correction

When a reviewed move cannot be retried, the organizer keeps keyboard focus on
**Cancel** and leaves **Retry reviewed move** disabled. Tab remains in the open
review, Escape closes it, and reopening starts a fresh selection. A failed or
unverified move that is eligible for retry still focuses the enabled retry
button and retains the same reviewed request.

Previously, the error handler first rebuilt the review and focused Retry, then
disabled that focused button. A browser that blurs a newly disabled control
could leave focus on the page body, outside the organizer's Escape/Tab handler.
An external category edit after the review is captured is one ordinary way to
reach this error path. Pending writes remain non-dismissible.

The correction is limited to the organizer view's error rendering and focus
choice. Storage, locking, snapshot comparison, mutation requests, schema,
permissions, manifest version and shared dialog handling are unchanged.

## Deterministic evidence

The frozen audit baseline was
`2e5e708e15d4590f3f9d87f38c63b05258049b69`. Its four existing organizer suites
passed 47 tests. With the final view regressions applied to that baseline, the
view suite passed 12 and failed 7 tests: six non-retryable error branches and
one production-storage conflict path lost the expected Cancel focus. The fixed
view suite passes 19/19; the four focused suites together pass 56/56, with no
failures or skips:

```sh
node --test tests/shortcut-organizer-view.test.js \
  tests/shortcut-organizer-search.test.js \
  tests/shortcut-organizer-integration.test.js \
  tests/shortcut-organizer-storage.test.js
```

The new coverage loads actual production organizer/dialog source in the DOM
model with disabled-control blur enabled. Keyboard probes originate from the
current active element. It covers:

- `ORGANIZER_CONFLICT`, `ORGANIZER_LAYOUT_PENDING`, production workspace
  `WORKSPACE_INVALIDATED` / `WORKSPACE_SWITCH_PENDING`, the existing
  `WORKSPACE_STALE` compatibility case, and an unknown error.
- Disabled retry, enabled/focused Cancel, Tab containment, Escape dismissal,
  opener restoration, and a fresh empty selection after reopening.
- `ORGANIZER_FAILED` / `ORGANIZER_UNVERIFIED` retaining an enabled/focused retry,
  the exact same request on retry, and opener restoration after success.
- A real `StorageManager` snapshot and move operation over synthetic in-memory
  storage: rename a category after review, observe a read-only conflict, dismiss
  with Escape, reopen against current data, and complete a fresh reviewed move.
  Full before/after objects establish that the rejected attempt changes nothing
  and the fresh successful attempt changes only the selected twin's category.

Existing focused suites additionally cover literal local search, Unicode/IME
composition events, cross-filter and hidden selection counts, exact duplicate
occurrences, orphan categories, destination changes, Review/Back/Clear, stale
controls, canceled delayed reads, pending-submit exclusion, layout coordination,
request replay and uncertain-write retry.

## Limits

This is deterministic source/DOM-model and synthetic-storage evidence. It is
not new native Chrome, screen-reader, real system IME, viewport, cross-platform,
Sync/Drive or installed-extension upgrade acceptance. Historical native checks
in [the organizer feature notes](features/shortcut-organizer.md) retain their
own snapshots and scope. The full aggregate suite and native acceptance remain
separate integration/release gates.
