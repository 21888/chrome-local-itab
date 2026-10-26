# Site library: recover batch selection after input composition

## User flow and fix

The site library disabled “Select current results” when filtering rendered during input composition. Its composition-end and focus-out handlers refreshed only the deselection control. If the final input event preceded `compositionend` (or composition ended through focus-out), the selection button stayed disabled until another edit or filter change. A final input event after `compositionend` masked the problem.

Composition start/end/focus-out now refresh both batch controls from the **current** results and current ownership/work guards. This does not rerender cards, rewrite the query, modify existing selections/destination, read storage, or add any sites. The asynchronous initial-read phase and retired panels are excluded from control refresh. Adding still requires an explicit review and confirmation, with existing pending-write, conflict, departure and selection-capacity guards.

## Reproduction and verification

The existing `tests/navigation-library-view.test.js` was recovered from fixed remote commit `8e5ffbb67c34106376e90815d82badf0c8ed8b02`; its pre-edit Git blob matched `47679fe0379d2eae6c1e5bf9730c18ed291c6980`. Runtime baseline is verified `f15c22d3ea92724549be5730a2efb6d83c273fd2`; the later remote commits only add acceptance documentation.

Before the fix, two added cases reproduced a disabled selection button after composition-end without a following input, and after focus-out. The after-end-input control case passed. Tests use actual library code and a synthetic DOM/event model, with a Chinese interface and `chatgpt`/`figma` search queries; they are **not** an operating-system IME or native browser acceptance claim.

Added coverage exercises:

- Both final-input/composition-end event orders and focus-out settlement.
- Existing GitHub selection retained while another matching site is selected, then reviewed and written exactly once to the chosen personal category.
- Repeated queries preserving current card identity, search text, selected sites and destination without extra reads/writes.
- Cancelled composition and unchanged input.
- Capacity, empty results, already-selected results, external pending work and departure remain blocked.
- Composition events during the initial asynchronous read and retired events after close/reopen cannot strand or unlock a later bar.

The first expanded full-file run passed 184 cases and failed one new test assumption: the `github` query matches more than the GitHub site. That assertion was corrected to use the unique `chatgpt` result, not by weakening product behavior. Local negative/positive logs stay in the workspace evidence directory and are not uploaded.

No file-import approval, native file picker, screenshot upload, schema, permission, storage format, Web Store submission or Release is part of this change. Historical data-loss recovery and the preservation gate remain unproven by these tests.

## Local recovery and test scope

All 466 unmodified tracked test/fixture files in the fixed source tree have been restored or checked byte-for-byte against their Git blob IDs. The modified navigation test has its separately verified original baseline. This restores the complete 430-file Node test glob rather than reporting only the initially available partial checkout as a full suite. Four documentation fixtures read by tests were also restored from the fixed remote reference. Recovery files are local baseline material, not newly authored feature changes.

The first aggregate diagnostic run was interrupted after it exposed two verification-setup issues: text restoration normalized the pinned historical `formal139-storage.js` fixture's mixed CRLF bytes, and applying the focused navigation test's 256 MiB heap limit to every test caused an explicit heap exhaustion in the large dashboard scale test. The fixture was restored from its original blob with exact hash verification, and the added heap cap was removed for the final aggregate run. Neither failure was attributed to flaky CI or fixed by weakening an assertion.

The complete navigation file passes **187/187** (179 existing plus 8 added). JavaScript syntax and whitespace checks pass. Runtime-tree comparison against the fixed baseline shows **only** `shared/navigation-library-view.js` changed out of 138 runtime files.

The next complete Node run reached **17,012 passed / 17,014 total**, with exactly two failures in `migration-guidance.test.js` caused by missing recovered documentation (the complete-backup guides and linked personal-module guides). Nine original documentation files were restored and their Git blob IDs verified; the unchanged migration test then passed **4/4**. The first full Python run also identified a missing original `docs/releases/1.1.160.md` record. Restoring its pinned blob `43571feae88d8aee062fd0e68869cb0f38bf930b` resolved that environment omission, and the full Python suite passed **91/91**. None of these original documentation files belong in the feature diff, and restoring the release record does not publish or prepare a new Release. A final complete Node run is performed against the now-consistent checkout.

## Final acceptance on the consistent local source

- `node --test --test-concurrency=1 tests/*.test.js`: **17,014/17,014 passed**, zero failed/cancelled/skipped, exit 0 (430 test files; approximately 384 seconds).
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91 passed**, exit 0.
- Complete navigation file: **187/187 passed**; JavaScript syntax and `git diff --check` passed.

These final results do not relabel the earlier interrupted or failed recovery-environment runs as green. Native operating-system IME, installed-upgrade persistence and historical-loss recovery were not tested. The change remains a three-file production/test/documentation commit without logs, recovered baseline files, screenshots, version bumps or publication actions.
