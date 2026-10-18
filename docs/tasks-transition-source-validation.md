# Selected completion and reviewed reopening source ownership

## Scope and unchanged storage rules

This feature covers the shared Tasks View transition popup: initial source admission, original selection, asynchronous review, confirmation, exact modal Retry, closed-popup card Retry, late results, subscription cleanup and focus ownership. Production changes are limited to the shared `transitionBatch` method, one private exact-attempt map, an added `performTransition` method and leading exact-object routes in `perform` / `retryLast`. The focused, independent and explicit 55-file local checks below are complete; remote exact-commit CI and delivery are owned separately.

Completion and reviewed reopening enforce the reviewed revision plus every member's ID, version and state atomically. Completion clears a selected pin. Reopening preserves the current pin and stored positions and does not create Undo. Completion Undo uses `reopenBatch` without revision, permitting unrelated edits and newer pins while retaining all-member CAS. This is not the append Add merge protocol. Store, Controller, schema, keys, receipts and CAS remain unchanged.

A deliberately closed popup cannot cancel an already dispatched transaction. Its real uncertain command must remain reachable through card Retry. A real completion confirmed on its original source can still create page-local Undo after the popup is closed. An open original modal can explicitly acknowledge a saved result that arrived during a source gap, with the exact original receipt and zero duplicate writes. A closed popup whose original Controller actually saved and has a null retry command does not acquire a new Retry button or a manufactured Controller error. Its retained attempt cannot replace genuine READ refresh.

## Genuine unchanged-baseline RED

The first run contains **390 tests: 80 passed, 310 failed, 0 cancelled, 0 skipped**, exit **1**, duration **6,214.003657 ms**. It ran before production edits. All **1,471 tracked-file hashes** and **485 protected-file hashes** match the baseline. Complete tracked production, test and documentation sources were archived; the new suite, exact command, report, exit code and hashes were separately retained.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-transition-source.test.js
```

The test fixture uses independent writable foreign backends seeded with identical synthetic records, IDs, versions and revisions. Whole valid Controller replacement therefore cannot accidentally be rejected by mismatched task state. All saved, false-write, dropped-write/VERIFY and lost-acknowledgement outcomes come from real Store/Controller I/O. No Controller state, status, error or retry field is assigned to manufacture an outcome. Assertions involving DOM or source identity are bounded booleans rather than cyclic object diffs.

Observed baseline failures include:

- Construction substitutions can open the old selection popup and attach a foreign Controller subscription.
- A whole replacement Controller receives review construction and read (one request, one read). Confirmation redirects the old reviewed command (two foreign reads, one foreign write).
- Changed source can mutate selection, publish a late original review, or accept Retry through mutable Controller/Store fields.
- Source-gap saved results can clear private popup state rather than keeping the original modal's explicit receipt acknowledgement.
- Late callbacks and cleanup can affect focus, retry metadata or the foreign Controller's real exact-command WRITE feedback.
- A saved/null attempt can fall through to foreign refresh, and an old modal Retry can replace a newer distinct real command.

Existing source-valid closed-popup Undo/card Retry and the initial visibility, availability, connected-host and reviewed revision controls pass on the baseline. These controls must continue to pass. The RED is not a claim that all 310 failures are different bugs.

No fixture correction was required for this RED or the first candidate. No old test or shared helper changed.

Retained RED hashes:

- Baseline View: `f1d36433d4da0ed33e618a8c21ad3c751f30f1941fbd11d142e1e57a652eaf04`
- New 390-test suite: `44f2fb43fa9c2a27192269d63e4278d64841e26191babb005186fd7284844c00`
- RED report: `18dc5ce9a19adb14062ffc138ef439436520b980ab93a400281fbeadf6af94bb`

## Minimal source and exact-attempt implementation

The popup captures the private construction owner and non-revivable View lifecycle before admission, together with the original Controller, Store and bound subscription method. Source checks cover Controller, Store, backend, workspace object/ID/generation, session, and original host/document. Existing connected-host, visibility and availability checks remain in the popup. Selection never changes its immutable opening snapshot.

Control updates check source ownership before and after moving focus. Review checks again after control setup, dispatches to the captured Store and refuses late publication during a source gap. Already-dispatched original reads may still finish. Confirmation and modal Retry preserve the original immutable reviewed command, selected generation and exact review. The original revision and all-member CAS rules remain in the untouched Store.

The private exact-attempt route dispatches through the captured Controller. Latest-attempt, action-generation and exact retry checks prevent old continuations from clearing newer Undo or Retry. A source-gap outcome may retain private modal receipt data but cannot publish foreign View state, close a newer popup or clear foreign feedback. Source-valid completion calls the existing `rememberUndo` even after deliberate close; reviewed reopening does not create Undo.

Card Retry checks this retained source before any foreign refresh. It replays the transition only when the original Controller still holds that exact non-null command. Saved/null attempts permit original-source genuine READ refresh. Completion Undo's revision-free `reopenBatch` remains a different exact command and keeps its existing route. Close preserves unknown commands for the card, removes the captured subscription, and cannot dismiss genuine READ or foreign/newer WRITE feedback.

## Frozen first candidate: focused verification

The first candidate passed **576/576 tests**, **0 failures, cancellations or skips**, exit **0**, duration **11,120.948508 ms**. These are the 390 new tests and 186 tests in five unchanged old files. The complete command, sources, report, exit and hashes are retained. Candidate source and new test source matched their pre-run copies afterward.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-transition-source.test.js \
  tests/local-tasks-complete-batch-view.test.js \
  tests/local-tasks-reopen-batch-view.test.js \
  tests/local-tasks-completion-undo.test.js \
  tests/local-tasks-complete-batch-store.test.js \
  tests/local-tasks-reopen-batch-store.test.js
```

Static checking found only the View changed among the 1,471 original tracked files. All 485 protected files remain unchanged. Of 76 old View methods, only `perform`, `retryLast` and `transitionBatch` differ; `performTransition` is added. Removing the newly added exact-attempt heads restores the entire old `perform` and `retryLast` methods byte-for-byte, including all earlier quick Add, Undo, ordinary-row and restoration routes. All 73 other old methods are identical.

Frozen focused report SHA-256: `e0af251840e0f3bbd81433025a4d137384736ef5ed57e7e7b89b49f1bac35efd`.

Frozen candidate View SHA-256: `a59fbba3009368a71f1ce6b6200b1cc76c7c4a4a339192ae3eff7d7bc9d45f9b`.

The first green candidate was frozen and the sole Node window returned to the delivery owner. No local full-suite, scale, glob or concurrent Node/syntax command was run. Independent probes, the explicit prior 54-file set plus this new file, syntax and Python/package checks were performed afterward and are recorded separately below. Remote exact-commit CI is not claimed by these local checks.

## Independent review

The delivery owner's first independent check passed **58/58 probes**. Its combined independent run passed **400/400**, **0 failures, cancellations or skips**, exit **0**, duration **8,251.212604 ms**, without fixture changes. These are successive verification stages, not additive totals. Independent coverage includes completion and reviewed reopening, exact saved/modal and closed/card paths, original READ refresh, newer real commands, foreign exact-command WRITE feedback, and same-kind separation between reviewed `reopenBatch` and revision-free completion Undo.

Independent static review agrees that source ownership is exact and that the original reviewed revision/member CAS and receipt protocol remain intact. The owner's final static list found **1,470 of 1,471 original tracked files unchanged** and **419/419 protected files unchanged**. The worker's broader protected list contains 485 files and is also unchanged. Both independently identify the View as the only changed original file, 73/76 old methods as byte-identical, the exact two generic heads as removable byte-for-byte, and only the private map outside methods.

## Python and runtime package

The owner's Python verification passed **84/84 tests** in **2.007 seconds**. Runtime build and package verification passed with **133 runtime files**, **4,040,393 source bytes**, SHA-256 `4848679abb2df370c19e6aaff7a02556bc8de47c7c1134059ffb596119780ecb`. The new tests and this document are not runtime package contents. These local results do not establish remote exact-commit CI or publication.

## Final explicit 55-file and syntax verification

The final run used the exact previous 54-file set plus only the new transition-source file. It passed **6,137/6,137 tests**, **0 failures, cancellations or skips**, exit **0**, duration **83,634.368084 ms**. No old case failed and no fixture or production correction followed the first green candidate. View and all 55 test-file hashes matched before/after the run and after syntax checking.

The View and new suite then each passed a separate sequential `node --max-old-space-size=512 --check` command, both exit **0**. `git diff --check` passed. These checks did not run in parallel with any other Node or syntax process. The final full command, output, exit statuses and all before/after hashes are retained.

Final report SHA-256: `602d98d555742d54a54c72b585f8059ab64f32b93a0a341d65a0fafdc73d4236`.

The final View remains `a59fbba3009368a71f1ce6b6200b1cc76c7c4a4a339192ae3eff7d7bc9d45f9b`, and the new 390-test suite remains `44f2fb43fa9c2a27192269d63e4278d64841e26191babb005186fd7284844c00`.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-restore-ownership.test.js \
  tests/local-tasks-remove-ownership.test.js \
  tests/local-tasks-reopen-ownership.test.js \
  tests/local-tasks-batch-store.test.js \
  tests/local-tasks-boundary.test.js \
  tests/local-tasks-complete-batch-store.test.js \
  tests/local-tasks-complete-batch-view.test.js \
  tests/local-tasks-complete-ownership.test.js \
  tests/local-tasks-completion-undo.test.js \
  tests/local-tasks-copy-visible.test.js \
  tests/local-tasks-edit-return-focus.test.js \
  tests/local-tasks-move-first-ownership.test.js \
  tests/local-tasks-move-first-store.test.js \
  tests/local-tasks-move-first-view.test.js \
  tests/local-tasks-move-last-ownership.test.js \
  tests/local-tasks-move-last-store.test.js \
  tests/local-tasks-move-last-view.test.js \
  tests/local-tasks-pin-ownership.test.js \
  tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-step-move-ownership.test.js \
  tests/local-tasks-store.test.js \
  tests/local-tasks-view.test.js \
  tests/local-tasks-reopen-batch-store.test.js \
  tests/local-tasks-reopen-batch-view.test.js \
  tests/local-tasks-restore-batch-store.test.js \
  tests/local-tasks-restore-batch-view.test.js \
  tests/local-tasks-copy-completed.test.js \
  tests/local-tasks-next-ownership.test.js \
  tests/local-tasks-copy-removed.test.js \
  tests/local-tasks-edit-source.test.js \
  tests/local-tasks-batch-view.test.js \
  tests/local-tasks-dialog-composition.test.js \
  tests/dialog-focus.test.js \
  tests/dialog-ime.test.js \
  tests/dialog-details-focus.test.js \
  tests/ai-context-task-edit.test.js \
  tests/ai-context-view.test.js \
  tests/ai-context-external-tasks.test.js \
  tests/local-tasks-departure.test.js \
  tests/local-tasks-reuse-draft.test.js \
  tests/local-tasks-copy-text.test.js \
  tests/local-tasks-visibility.test.js \
  tests/local-tasks-backend-transaction.test.js \
  tests/workspace-lifecycle.test.js \
  tests/workspaces-invariants.test.js \
  tests/workspaces-view.test.js \
  tests/ai-context.test.js \
  tests/local-tasks-controller-source.test.js \
  tests/local-tasks-replacement-source.test.js \
  tests/local-tasks-view-lifecycle-source.test.js \
  tests/local-tasks-undo-source.test.js \
  tests/local-tasks-quick-add-source.test.js \
  tests/local-tasks-reuse-source.test.js \
  tests/local-tasks-batch-source.test.js \
  tests/local-tasks-transition-source.test.js
```

## Evidence limits

Public-field substitution is deliberate fault injection. It is not normal workspace navigation and does not establish the cause of historical upgrade data loss. The synthetic backend captures one fixed storage target for the entire transaction lock callback, including verification. This isolates View continuation ownership from adapter routing changes. It does not claim production transactions navigate workspaces this way, and an adapter's routing-induced VERIFY failure is not labeled a View bug.

The DOM/event model does not provide native Chrome layout, system IME, screen-reader or browser focus evidence. Existing initial-read timing, row-snapshot admission, keyboard/IME, remote hide, changed selection, unrelated edit/pin and receipt-conflict suites remain relevant. No manifest/version, tag, Release, CWS, screenshot, native browser evidence, user-device, paid-platform or permission change is included. Master remains the only online branch. Commit/push and final delivery belong to the delivery owner.
