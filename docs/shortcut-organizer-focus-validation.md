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

## Production-renderer recovery flow — 2026-10-20

A bounded English/light dot-cloud Chrome check ran the exact 138-file runtime of release 1.1.157 (`5920ca1b595fb9df175becabde2ecd4ba1276fbe`) with an explicitly synthetic page-memory Chrome-storage backend. The unchanged production Manager migration and validators created three stable-ID records, including two identical title/URL/icon twins, two existing categories and saved per-view coordinate maps. A fixture-only visible report compared the complete original/current workspace values and all other raw keys; ordinary product controls performed every reviewed move. No real data, file/clipboard action, external navigation or screenshot upload was used.

1. **Stale destination, then fresh review.** Keyboard selection chose only record #2. While its review was open, a scheduled production Session write renamed the destination. Submitting the old review showed the changed-data message, disabled Retry and focused Cancel. Escape restored the organizer launcher. The only stored difference was the intentional category name; all three sites remained in their original category. Reopening reset selection and showed the renamed destination. A fresh review of #2 succeeded: exactly one additional write changed only `links[1].category`; the first twin and third record remained untouched.
2. **Written, but readback temporarily unavailable.** On a fresh disposable fixture, the backend committed the reviewed #2 move, then rejected bundle reads for three seconds. The real Workspace Manager converted this to `WORKSPACE_READ`; the production view disabled Retry and focused Cancel. This is not the retryable `ORGANIZER_UNVERIFIED` branch exercised by the lower-level model. After Escape and a fresh open, the second twin was visibly under the destination, and choosing that destination disabled its checkbox. No second move was submitted. Exactly one write had changed only `links[1].category`; closing did not roll it back.
3. **Lost acknowledgement with successful authoritative readback.** A separate fresh fixture committed #2's move and rejected that write acknowledgement once, without blocking subsequent reads. The unchanged production path verified the saved state, reported “Sites moved: 1”, closed the dialog and returned focus to its launcher. There was exactly one write, not a retry/duplicate mutation.

The full-object comparisons retained IDs, array order, titles, URLs, icons, category records (except the explicit rename), all saved coordinate maps and every other seeded configuration/global value. Nonempty Tasks/Focus/Scratchpad/Countdown modules were not seeded, so this run does not establish their populated-content retention. The post-write read failure correctly used the reachable Session error path; no fixture rewrote an error code or disabled a production guard to force Retry.

These three scenarios add native keyboard/focus and visible production-renderer evidence to the earlier deterministic models. They do not prove installed-extension persistence, disk durability, browser restart, quota/crash recovery, real cross-tab races, system IME, assistive technology or other locales/viewports. No runtime change was needed. Historical installed-profile evidence and the unresolved real-upgrade incident retain their separate limits.
