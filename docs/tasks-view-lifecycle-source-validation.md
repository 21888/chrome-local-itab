# Task View construction-source lifecycle

## Scope and production reachability

This change binds the Tasks View's subscription, rendering and destruction to its construction source. Only `constructor`, `render` and `destroy` change among the View's 74 methods. The other 71 methods, including the ordinary editor, import and recovery reviews, remain byte-identical. A private lifecycle record and an identity-only predicate sit outside the class. Store, Controller, shared DOM helpers, storage schema, keys, revision CAS, receipts, error codes and the `1.1.155` manifest are unchanged.

Production mounts Tasks after workspace initialization. The source-assignment search found no production Tasks View Controller hot-swap. Normal switching waits for pending work, suspends and flushes the current session, selects a destination and navigates to another page. The substitutions below deliberately exercise mutable public-field boundaries with independent real Stores and Controllers. They do not show that ordinary workspace switching redirects the View, and they do not establish the cause or recovery of historical upgrade data loss.

## Retained first RED

The first 27-test file ran against unchanged production and all **1,461 original tracked-file hashes**. It reported **9 passed, 18 failed, 0 cancelled, 0 skipped**, exit **1**, duration **331.269344 ms**. Its complete source, original View/Store/Controller sources, report, command, exit status and before/after tracked hashes were retained before production changes.

The real failures demonstrated:

- An original Controller subscription called dynamic `View.render()`, which displayed a different complete Controller's revision **60**, rows and real READ error instead of the original revision **4**. Direct rendering had the same problem. Distinct revisions prevent the render cache from hiding the source substitution.
- A successful or failed original initial read rendered the replacement Controller when its delivery arrived after a whole-Controller substitution.
- Direct rendering continued after Store, backend, workspace object, workspace ID, generation, session or host identity changed.
- An `onVisibility` callback replaced the Controller synchronously. The render continued into replacement-source feedback, and the original transaction's later event invoked the callback again.
- Destruction closed the foreign Controller while leaving the original Controller open with **one backend subscription**. Replacing the public View unsubscribe function also removed the foreign View's subscription instead of the original one.
- Reentrant destruction and restoration of the public `destroyed` field allowed **three Controller destruction calls and three View unsubscribe calls**, together with revived rendering through a retained callback.
- Already-dispatched original success, false-write and committed-but-unacknowledged outcomes caused the original subscription to repaint foreign rows. The Store transactions themselves remained original.

Nine passing controls covered original READ errors, real Session suspension and invalidation errors, original-host detachment, and original transactions settling after destruction. No Controller state, error or retry field was assigned to manufacture these outcomes. Existing repository tests and helpers were unchanged for this RED.

- First test SHA-256: `7ff9256f029a4a745f63b3775694f28786e53bae6234b566bd5331a7c9caa4b9`
- First RED report SHA-256: `e5e105471df0145eb26f85257176d5f3d495be8ed3b6f10940b6f49dd9aae0eb`
- Original View SHA-256: `3c7a97d7b9b53ffc501bdceb8d99d582ce4aa83af2b674ee7af8747b198958f6`

## Identity, availability and issued work

The private lifecycle captures the existing construction-source record, the exact returned View unsubscribe function and a non-revivable retirement flag. The subscription checks that private lifecycle before calling the View's render method. Render checks it again on entry and after `onVisibility` returns, and reads its own Controller through the captured reference.

The identity predicate compares the original host and document, Controller, Store, backend, workspace object, workspace ID, workspace generation and session. It deliberately does **not** treat the original workspace's `invalidated` or `_suspended` flags, a closed Controller or host detachment as a different source. An original READ or WORKSPACE failure must remain visible. The existing editor/review availability predicate is unchanged.

A source gap suppresses rendering; it does not overwrite Controller errors, retries, state or receipts. Returning the original source permits rendering and deliberate retry again. A dispatched transaction continues on its original Store. A successful commit or committed-but-unacknowledged write can be acknowledged through its exact receipt without a duplicate write; a genuine false write can be retried normally. Detaching the original host does not cancel or redirect issued work.

The callback may already have received the original-source visibility value, and the original host's visibility may already have changed, before it replaces the source. Those earlier original-source actions are not counted as foreign publication. The post-callback check prevents subsequent row, feedback and control publication under the changed source.

## Destruction, reentrancy and cleanup exceptions

Destruction privately retires the View before observer, copy, focus or modal callbacks run. Resetting the public `destroyed` field, invoking a retained subscription callback or recursively calling `destroy()` cannot revive rendering or repeat cleanup. Cleanup always uses the captured original View unsubscribe function and Controller, including when public fields point to another complete live Controller.

A second retained RED tests a real modal close callback that throws. The first candidate retired the View but skipped its original subscriptions after that exception, making the leak permanent on repeated destruction. The appended probe plus the unchanged original View suite reported **94 tests: 93 passed, 1 failed, 0 cancelled, 0 skipped**, exit **1**, duration **1,109.117878 ms**. The failing outcome retained **one backend listener**, with **zero original View unsubscribe calls and zero original Controller destruction calls**.

The correction attempts every original cleanup callback and every modal in a snapshot of the original dialog set, then releases the captured unsubscribe and Controller in `finally`. It preserves and rethrows the first exception after attempting the remaining cleanup. It does not swallow callback errors or change Store/Controller behavior. Individual callbacks retain responsibility for their own internal resources; the View guarantees their cleanup attempt and the original subscription/Controller cleanup even if another callback fails.

The first 27 tests remain an exact byte prefix of the final 28-test file. The throwing-close RED's candidate source, test source and report are retained independently.

- Throwing-close RED report SHA-256: `44e24901df17b935687b9c5db38a08d62f7f0fb63801ecdd4c709596cd72b4f7`

## Earlier initial-read fixtures

The first three-file candidate check reported **301 tests: 296 passed, 5 failed**, exit **1**, duration **2,982.37696 ms**. The new 27 tests and the unchanged original View suite's 66 tests passed. All five failures were in earlier Next-up initial-read fixtures: workspace object, ID, generation, session and whole-Controller substitution.

Those fixtures originally expected a rendered button and then tested rejection when it was activated. The View now rejects the changed source before constructing that button. The first failed report was retained before changing the fixtures.

Only those five cases were adjusted, after review, to retain the original before-first-read substitution timing and assert the earlier safe boundary: no Next-up button, no rendered revision, zero requests and writes, and unchanged I/O and raw data across explicit rendering. Each then restores the original source, refreshes it, and verifies a real completion with exactly one write. The preceding backend/Store initial-read cases keep their existing null-Controller-state expectations and recovery assertions. The other 203 Next-up cases and every shared helper remain unchanged.

- First three-file report SHA-256: `a428b9957af3e7ba372a9237a38e26b7de81b8f38e7773e9e9c2267016738aef`

The first broader 50-file check then reported **5,160 tests: 5,144 passed, 16 failed, 0 cancelled, 0 skipped**, exit **1**, duration **64,571.426275 ms**. Every failure was the same earlier-rendering assumption in another initial-workspace-substitution fixture. The production source and all 50 named tests had unchanged hashes throughout that run. The complete failed report and all nine affected original test files were retained before adjustment.

After review, only these additional 16 cases were adjusted:

- Ordinary completion: 1 case
- Ordinary editor: 1 case
- Move to start: 1 case
- Move to end: 2 cases
- Pin and unpin: 2 cases
- Remove active and completed tasks: 2 cases
- Reopen a completed task: 1 case
- Restore to active and completed states: 2 cases
- One-step move up and down: 4 cases

Each retains its original before-first-read source substitution and asserts no task rows, no rendered revision, zero requests/writes, and unchanged I/O and raw data after explicit rendering. Restoring the captured original workspace/session and refreshing then exercises that case's real original action with exactly one request and one write. The positive outcomes preserve the corresponding original state, order, pin, text, recovery and Undo expectations. The editor uses real Edit/Save controls. No shared helper, production method, other test case or Controller state/error/retry field was changed for these adjustments.

- First 50-file report SHA-256: `f0a6e4992436e0777252bccbe5f1ecb64146babd2ac8bcec4866f4298f1ceb96`

The first check of the nine adjusted files reported **3,068 tests: 3,059 passed, 9 failed**, exit **1**, duration **33,875.024691 ms**. All nine failures were an error in the newly written fixture code: four files had no `io` helper, but the added counter assertions called it. That candidate and failed report were preserved. Only those newly added expressions were corrected to inline snapshots of the same real backend counters; no helper or product code changed. This is a test-construction error, not an additional product RED.

- First adjusted-fixture report SHA-256: `52b3853ea358aea302b573b88bceb182658992569ec511c53a6ced2c317d7d5a`

## Focused verification

The final authorized three-file command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-view-lifecycle-source.test.js tests/local-tasks-view.test.js tests/local-tasks-next-ownership.test.js
```

It passed **302/302 tests**, **0 failures, cancellations or skips**, exit **0**, duration **3,069.487189 ms**. This comprises 28 new lifecycle tests, 66 unchanged original View tests and 208 Next-up tests. The View and all three named test-file hashes matched before and after execution.

At this three-file stage, static verification found only two changed original tracked files: the View and the five approved Next-up fixtures. The subsequent nine-file fixture adjustments are described above. The new lifecycle test file and this document are additions. All 71 non-lifecycle View methods, including the three preceding replacement-review methods, remain byte-identical.

Final code SHA-256:

- View: `6e0e5efc9c9f29ea6964ed541d5528be6c1b93d6d864aab1035b9aaa923d1298`
- New 28-test suite: `a9a45fc1f6dc1ee5fa3dac29c45e2762bc8bb2b035084606fedb183709032d59`
- Next-up suite: `0eeb6407d99235d0757d99fcd6c93d55bd41a4b3e99017341090fe650ee06277`
- Final three-file report: `da6d443270391562ee14c81cdbc77ad5515b5455375e77237cdb712d01423575`

## Independent verification

The independent reviewer passed **190/190 probes**, **0 failures, cancellations or skips**, exit **0**, duration **3,221.481053 ms**. These comprise 27 independent lifecycle probes and the unchanged 63 replacement-review, 45 Controller and 55 ordinary-editor probes. They cover identity substitutions, original subscription and initial-read delivery, captured cleanup, reentrant and throwing modal callbacks, real original availability errors, and original-host detachment.

The independent script's first run reported 172 passed and 18 failed because its newly added cross-VM array comparison treated differing prototypes as a display change. The original script and failure report were retained. The reviewer corrected only that comparison to require the same `visibleTasks` reference and equal serialized contents, then reran all 190 probes successfully. Production and repository tests were not changed for that audit correction.

Final independent static review confirmed **1,450 of 1,461 original tracked files unchanged** and **403 of 413 protected files unchanged**. The changed originals are the View and ten test files containing the 21 reviewed initial-read fixture cases. The nine additional files differ only in 11 approved test declaration bodies, expanded by their existing loops into 16 cases; removing those bodies leaves their baseline text identical. Shared helpers, Store, Controller, all other test cases, the 71 other View methods, manifest and CI remain unchanged.

Python verification passed **84/84** in **1.826 seconds**. Runtime build and verification passed with **133 files**, **4,024,944 source bytes**, archive SHA-256 `b716326d89df232e3e1051cbe3ae48efb89eb1f5b8faf61f7150ecf371233c64`. The subsequent fixture/document changes do not enter that runtime package, and its production source stayed frozen.

## Final 50-file verification

The corrected nine-file check passed **3,068/3,068 tests**, **0 failures, cancellations or skips**, exit **0**, duration **32,944.666624 ms**. Its report SHA-256 is `5e6fdbdd3218debe36315977b0a4e4474cfcf325f313787c0cc0dc7ba8964e15`.

The final 50-file check passed **5,160/5,160 tests**, **0 failures, cancellations or skips**, exit **0**, duration **64,268.72203 ms**. It used `--max-old-space-size=512 --test --test-concurrency=1` with the explicit paths below. The View and all 50 test-file hashes matched before and after execution. The expanded command, complete file list, report and exit code are retained. All **12 changed JavaScript files** then passed their individual `--check` commands with the same 512 MB limit. No glob, local full-suite command or scale run was used.

Final 50-file report SHA-256: `cce63a7a89031fb2f4e210448488140deffc3f179911a2c3529c33ffc2807ea3`.

These checks are successive verification stages, not additive test totals. The exact final paths were:

- `tests/local-tasks-restore-ownership.test.js`
- `tests/local-tasks-remove-ownership.test.js`
- `tests/local-tasks-reopen-ownership.test.js`
- `tests/local-tasks-batch-store.test.js`
- `tests/local-tasks-boundary.test.js`
- `tests/local-tasks-complete-batch-store.test.js`
- `tests/local-tasks-complete-batch-view.test.js`
- `tests/local-tasks-complete-ownership.test.js`
- `tests/local-tasks-completion-undo.test.js`
- `tests/local-tasks-copy-visible.test.js`
- `tests/local-tasks-edit-return-focus.test.js`
- `tests/local-tasks-move-first-ownership.test.js`
- `tests/local-tasks-move-first-store.test.js`
- `tests/local-tasks-move-first-view.test.js`
- `tests/local-tasks-move-last-ownership.test.js`
- `tests/local-tasks-move-last-store.test.js`
- `tests/local-tasks-move-last-view.test.js`
- `tests/local-tasks-pin-ownership.test.js`
- `tests/local-tasks-pinned-completion.test.js`
- `tests/local-tasks-step-move-ownership.test.js`
- `tests/local-tasks-store.test.js`
- `tests/local-tasks-view.test.js`
- `tests/local-tasks-reopen-batch-store.test.js`
- `tests/local-tasks-reopen-batch-view.test.js`
- `tests/local-tasks-restore-batch-store.test.js`
- `tests/local-tasks-restore-batch-view.test.js`
- `tests/local-tasks-copy-completed.test.js`
- `tests/local-tasks-next-ownership.test.js`
- `tests/local-tasks-copy-removed.test.js`
- `tests/local-tasks-edit-source.test.js`
- `tests/local-tasks-batch-view.test.js`
- `tests/local-tasks-dialog-composition.test.js`
- `tests/dialog-focus.test.js`
- `tests/dialog-ime.test.js`
- `tests/dialog-details-focus.test.js`
- `tests/ai-context-task-edit.test.js`
- `tests/ai-context-view.test.js`
- `tests/ai-context-external-tasks.test.js`
- `tests/local-tasks-departure.test.js`
- `tests/local-tasks-reuse-draft.test.js`
- `tests/local-tasks-copy-text.test.js`
- `tests/local-tasks-visibility.test.js`
- `tests/local-tasks-backend-transaction.test.js`
- `tests/workspace-lifecycle.test.js`
- `tests/workspaces-invariants.test.js`
- `tests/workspaces-view.test.js`
- `tests/ai-context.test.js`
- `tests/local-tasks-controller-source.test.js`
- `tests/local-tasks-replacement-source.test.js`
- `tests/local-tasks-view-lifecycle-source.test.js`

## Limits

This is the View subscription/render/destruction contract. It does not certify every other View action's source checks, redefine workspace switching, or change Controller and Store transaction semantics. The DOM helper is an unchanged synthetic ownership/event model; these tests are not native Chrome, screenshot, visual-layout or keyboard evidence.

All task contents and errors are synthetic. No user device, paid service, permission expansion, local full-suite/scale command, tag, Release or Chrome Web Store publication was used. The existing `v1.1.155` Release target remains frozen. These focused results do not establish exact-source full CI; that must be checked for the delivered commit separately.
