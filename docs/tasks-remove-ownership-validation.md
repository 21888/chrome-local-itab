# Tasks ACTIVE and DONE single-row Remove source ownership

Date: 2026-10-18 UTC. Baseline commit `29449fff0c7cc7a9b5973b536c9e1dfd8ca8117c`; tree `75aa242a8fa12b4b6899a15205d3099e7ffd167f`. Manifest remains `1.1.155`.

## Bounded pre-production reproduction

The new suite uses the real Store, Controller and View with the unchanged shared synthetic DOM model. All task data is synthetic. Workspace identity selects independently initialized storage. Store/backend replacement retains the exact original workspace object and matching session while using independent backend data, so a session mismatch cannot hide a backend defect. Unknown-command probes activate another newly rendered row first, while the original unknown command is still intact.

The first bounded run executed **35 tests: 3 passed, 32 failed, 0 cancelled, 0 skipped**, exit **1**, duration **723.625443 ms**. Exactly one Node process ran with `--max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-remove-ownership.test.js`. All **1,449 tracked baseline files** retained their original SHA-256 hashes. Complete hashes, original View, immutable first suite, complete log and exit status are retained outside the checkout.

Measured failures, independently exercised for ACTIVE and DONE:

- Source change before the first asynchronous row render, fresh rows after workspace object/ID/generation/session changes, and retired entire-row reinsertion each added **1 request, 3 reads and 1 write**.
- Fresh rows after independent backend/Store replacement sharing the original workspace/session added **3 foreign reads and 1 foreign write**. The request was issued on the original Store for backend replacement and the foreign Store for Store replacement.
- Original READ/false-write/dropped-write/uncertain-acknowledgement Retry crossed a replacement workspace with **0 new requests, 2 reads and 1 write**.
- A different newly rendered row after each unknown result superseded the intact original Retry with **1 new request, 2 reads and 1 write**. No old callback was activated first, so these are isolated fresh-control failures rather than combined-fixture inference.

Passing controls verified current visible ACTIVE/DONE removal, Store-owned removedFrom and pin behavior, independent IME draft/focus, and original Remove Undo's restore Retry after all four real failure modes.

First RED suite SHA-256: `50c7898594a9f99996ab1254025d21b1960428f384ad1a5e46d8974762757a5e`.

Complete RED log SHA-256: `81e1616a8a301debfe6ec67781f139e87df251f75ddc73b19f82e742bb2f5c7d`.

The RED window does not include a final-layout mutation probe, and supplies no baseline claim about that interleaving.

## Scoped implementation and pending verification

Single-row ACTIVE/DONE Remove captures its original Controller, Store, backend, workspace object/ID/generation, session, mounted host/lists/section/filter and ancestry before the first asynchronous read. New selections retain the exact rendered row, title, main control, Remove action, actions menu and summary, filter, snapshot and a private render-lifecycle token. Restoring old nodes and mutable View references cannot restore that retired token.

A new activation checks non-layout source, snapshot, lifecycle, event and visibility semantics, observes the actual action/title layout, then repeats every non-layout check before constructing the command. Pending or uncertain commands cannot be displaced; an actual Store CONFLICT permits a new reviewed row after refresh. The command retains only the original Store task-version/non-removed CAS. Store continues to own removedFrom and target-only unpin semantics, independently of unrelated revision/order/pin changes.

Original Retry is gated by exact issued row command identity and the construction source including original ancestry. It reuses the original command/operation ID and existing success effect after redraw, filtering, collapse or unknown acknowledgement; the Store still determines latest-receipt acknowledgement, later-receipt conflict and uncommitted merging. It never reconstructs a Remove from a current row. The unchanged Remove success callback, perform, rememberUndo and undoLast bodies retain their existing focus and Undo behavior. Removal Undo is restore and is not intercepted by the row gate.

Before the authorized old-fixture adjustment below, static protection checks found **1,448 of 1,449 tracked baseline files unchanged**; only the View was modified. All old tests/helpers, Controller, Store, locale, manifest, schema, recovery and workflows were untouched. Existing method bodies outside constructor, retryLast, row and render are byte-identical; dedicated Remove helpers and the private lifecycle map are additions. `git diff --check` passes. The initial static candidate was frozen before any further Node execution; measured later results are recorded below. No full-suite or native-browser result is claimed.

The new regression probes cover ACTIVE/DONE menu/section/filter/hidden/inert boundaries, retired entire-row reinsertion, exact source replacement, independent backend data, all four unknown-result modes with and without notifications, isolated old/fresh-other controls, latest/later receipts, unrelated edit/order/pin merging, real task CAS conflict renewal, translated/duplicate text, nullish/anonymous compatibility and missing identified sessions. Final-layout probes explicitly assert the final getter executes before checking zero I/O. Actual-editor-first and already-started-save/later-editor fixtures distinguish rejection from preserving a newer draft/focus while a legitimate write finishes.

## Original closed-menu fixture contract

The owner ran the unchanged existing `DOM model: stale detached pin cannot bless a newer pin` case. It measured **1 test, 0 passed, 1 failed**, exit **1**, duration **99.882555 ms**. The original setup called Remove while its details menu was closed; the new visible-action guard rejected that hidden action, and the unchanged `undo.id` assertion encountered null. This window did not instrument I/O at that setup and does not independently prove its zero-I/O boundary. The original test snapshot and complete failing result remain retained.

After explicit root approval, the only old-test adjustment opens that same row's details menu before its original Remove activation, asserts the actual action has a visible rectangle, and additionally checks the real saved removed state and removal Undo state. All original stale-pin, visible conflict notice, Retry, draft, focus and zero-I/O assertions remain unchanged. Production is not relaxed to accept hidden controls. New closed-menu, inert-background and actual-editor-first probes retain the negative boundary.

The owner's first independent review passed **60/60 probes**, **0 failed**, exit **0**, duration **976.979487 ms**, against the frozen View and new-suite hashes. It is separate from the pending repository focused run.

## First focused verification: retained failure

The first authorized focused window ran exactly 27 named files, comprising the new Remove suite and the 26 previously focused task suites. It measured **3,562 tests: 3,557 passed, 5 failed, 0 cancelled, 0 skipped**, exit **1**, duration **45,166.896484 ms**. All **495 new Remove probes passed**; the existing suites contributed **3,062 passes and 5 failures**. The three authorized syntax checks (View, new Remove suite, and adjusted old View test) each exited **0**. This is a retained failing integration window, not a GREEN result.

All five failures are original closed-menu Undo-seeding fixtures, observed without changing those files:

- Completion Undo's `latest completion/removal share one Undo slot and restoring a removed completed task keeps it completed` failed at its first original Undo-ID assertion because the hidden ACTIVE Remove was rejected and Undo still belonged to the preceding completion. The later DONE Remove was not reached in that run; static inspection shows it also requires opening Completed and its row menu.
- Pin ownership's `pin preserves existing Undo, active order and independent draft` failed in both pin/unpin branches because hidden Remove had not created the expected Undo.
- Step movement's `movement preserves Next up, existing Undo and independent quick-entry draft` failed in both up/down branches because hidden Remove had not created the expected Undo.

These old fixtures did not instrument the rejected setup's I/O. The passing new closed-menu and real-editor-first probes supply separate zero-request/read/write evidence. The three original old files, complete first focused log/exit, and exact run-input snapshots remain retained. No retry or additional old-file adjustment was made before reporting these failures for review.

First focused log SHA-256: `22f3cca1bd4d35c55ea5f9385c5cd49f77804082d502a4acce04458619daf438`.

## Authorized remaining fixture corrections

The retained first focused failures received explicit root approval for the three exact cases above. The completion/removal Undo case now opens the ACTIVE row's menu, and later opens Completed and the DONE row's menu. Both actions assert visible rectangles and actual removed state, removedFrom and Undo identity/state before continuing. The shared pin/unpin case and shared up/down case now open the same original ACTIVE row's menu and verify actual removal plus original removal Undo before exercising their original behaviors. No production change was made for these fixtures.

Static comparison confirms every original assertion in all four adjusted old files remains, and bytes outside the four authorized cases are unchanged. The initial View-test adjustment adds exactly four lines. Of **1,449 tracked baseline files**, **1,444 remain unchanged**; modifications are only the scoped View and those four old fixtures. The new Remove suite and this document are additions. Controller, Store, all shared helpers, locales, schema, recovery, manifest and workflows remain byte-for-byte unchanged. The production and new-suite bytes remain exactly those that passed all 495 new probes and the owner's independent review.

The owner's expanded independent review passed **84/84 probes**, **0 failed**, exit **0**, duration **1,341.027353 ms**. This supersedes the earlier 60-probe set for combined-count reporting. Owner Python checks passed **84/84** in **1.787 seconds**. Packaging and verification covered **133 runtime files**, with package SHA-256 `52d6248be9c177e9af4e224f4d7dedcab799ca0ff50c7406b18f0c6ae27677cd`. These describe the current candidate, not native-browser or remote CI success.

## Final focused GREEN

The authorized second focused run passed **3,562/3,562 tests**, comprising **495 new Remove probes and 3,067 existing task regression probes**, with **0 failures, cancellations or skips**, exit **0**, duration **44,382.282675 ms**. The same exact 27 files ran as in the retained first focused failure. The three additionally changed old files each passed their authorized syntax check; together with the earlier unchanged View/new-suite/View-test syntax checks, all six affected JavaScript files passed syntax validation.

Combined final local model evidence is **3,562 focused + 84 independent = 3,646 passing checks**, excluding the earlier 60-probe subset, retained RED failures and retained old-contract/first-focused failures. Python/runtime results are separately recorded above. No final source or test bytes changed after their successful run.

Both focused runs used `--max-old-space-size=512 --test --test-concurrency=1` with exactly these named files, without a wildcard:

- `local-tasks-remove-ownership.test.js`
- `local-tasks-reopen-ownership.test.js`
- `local-tasks-batch-store.test.js`
- `local-tasks-boundary.test.js`
- `local-tasks-complete-batch-store.test.js`
- `local-tasks-complete-batch-view.test.js`
- `local-tasks-complete-ownership.test.js`
- `local-tasks-completion-undo.test.js`
- `local-tasks-copy-visible.test.js`
- `local-tasks-edit-return-focus.test.js`
- `local-tasks-move-first-ownership.test.js`
- `local-tasks-move-first-store.test.js`
- `local-tasks-move-first-view.test.js`
- `local-tasks-move-last-ownership.test.js`
- `local-tasks-move-last-store.test.js`
- `local-tasks-move-last-view.test.js`
- `local-tasks-pin-ownership.test.js`
- `local-tasks-pinned-completion.test.js`
- `local-tasks-step-move-ownership.test.js`
- `local-tasks-store.test.js`
- `local-tasks-view.test.js`
- `local-tasks-reopen-batch-store.test.js`
- `local-tasks-reopen-batch-view.test.js`
- `local-tasks-restore-batch-store.test.js`
- `local-tasks-restore-batch-view.test.js`
- `local-tasks-copy-completed.test.js`
- `local-tasks-next-ownership.test.js`

Complete final GREEN log SHA-256: `6876e42375cfd3b72dec524296b2dab6408453434fa66dbd3965879e74bbe666`.

Final verified file SHA-256 values:

- `shared/local-tasks-view.js`: `3513f17108b5b42260ed929626136b42194e86df04c0df7129bab1edb5aaaa39`
- `tests/local-tasks-remove-ownership.test.js`: `9d11c4850e2d49eaf2dbdf1e64d2d486ee513969f6c97540963f0a20f490a162`
- `tests/local-tasks-view.test.js`: `d15bb38b7f0af217fde147166b35d2bc2d303610c71caef97ec01cc5658dc0e4`
- `tests/local-tasks-completion-undo.test.js`: `de00850f040fa849de66a39a49c46bc1838a602950dac61c8ac8e08e89965a15`
- `tests/local-tasks-pin-ownership.test.js`: `eddbd3a7a54893296656e5f36d0aadc95d197ef4eeec1d57f4f7c15c01b113b6`
- `tests/local-tasks-step-move-ownership.test.js`: `9de3cc2d8d53c49cfb84a37c48c41d2a47b3b77c8b36948a4a7041378d3dfc29`

The owner's final independent protection audit confirmed **401/405 protected files unchanged**, with exactly the four authorized old-fixture exceptions, and **1,444/1,449 tracked baseline files unchanged**, with only the View plus those four fixtures modified. All original **31 + 6 + 7 + 8 assertion texts** across the four designated old cases remain. Bytes outside those cases are identical. Existing method bodies other than the four authorized constructor/retryLast/row/render regions are byte-identical.

`git diff --check` passes. The original Remove success callback and the complete perform, rememberUndo, undoLast, performPinned, batch, restore and other action helper bodies remain byte-identical. Exact-source remote CI remains a separate integration gate; this document does not claim it has passed.

## Limits

Synthetic Store/Controller/DOM-model evidence does not establish native Chrome, actual keyboard/IME timing, accessibility, screenshot or visual correctness. This work does not resolve or establish a fix for historical real-upgrade data loss. No user device, paid platform, permission expansion, manifest change, tag, Release or Chrome Web Store submission is included. The four explicitly authorized old fixture setups above are the only old-test exceptions; shared helpers, Controller, Store, locale, schema, recovery and workflow changes are excluded. The first RED window covers only the named new suite, with bounded memory and serial test execution.
