# Quick-entry Add construction-source and exact-attempt ownership

## Scope and reachability

This change binds quick-entry Add, its exact Retry and its asynchronous View effects to the View's original construction source. The real Add button, form submission and Enter handler continue to enter `add()`. Reuse-dialog Add and reviewed batch Add keep their separate commands, callbacks and dialog-owned Retry controls. No command is classified as quick entry merely because its kind is `add`.

Store, Controller, schema, storage keys, receipts, revision checks and the `1.1.155` manifest remain unchanged. No connected-host, inert, dialog, document-visibility or general UI-admission condition is added. Issued work remains allowed to finish after original-host detachment.

Production mounts Tasks after workspace initialization. The source substitutions below deliberately probe mutable public-field boundaries; they do not model ordinary workspace switching and do not establish the cause or recovery of historical upgrade data loss. Independent foreign backends start with the same synthetic snapshot as the original. Whole-Controller substitutions use a complete, writable, real Controller and Store, so downstream CAS or unavailable-controller checks cannot conceal a View admission error.

## Retained first RED

The first new test file ran against unchanged production and all **1,465 original tracked-file hashes**. It reported **105 tests: 36 passed, 69 failed, 0 cancelled, 0 skipped**, exit **1**, duration **1,437.760278 ms**. The complete test source, original View/Store/Controller sources, command, report, exit status, tracked hashes and **453 protected-file hashes** were retained before production changes. The only working-tree addition was the new test file.

Real failing outcomes included:

- Replacing the whole Controller before each of button, form and Enter Add caused **one foreign request, two foreign reads and one foreign write**.
- Changing the source while `Store.request` returned was not checked before dispatch. A whole-Controller replacement at that boundary caused **two foreign reads and one foreign write**, using the command constructed by the original Store.
- Store, backend, workspace object, workspace ID, generation, session and host substitutions failed source admission before request or dispatch. Some downstream Controller guards refused I/O, but that did not prevent command construction or View-effect changes.
- Failed exact Retry fell through to **one foreign refresh read** when the replacement Controller had no retry command. Other substitutions could replay the old command against a changed synthetic source or mutate local action/effect ownership even when Controller admission rejected dispatch.
- An original successful issued Add cleared the original draft and retry effect during a source gap. Existing draft-generation and composition guards already preserved newer text, but the older success still cleared its retry effect.
- A retained successful or dismissed attempt did not block foreign no-command refresh. The tests separately require real original READ Retry to refresh rather than replay a saved Add.

The backend fixture fixes a synthetic transaction target for the complete lock callback, including verification. This isolates View continuations from mutable workspace-field routing. Every `saved`, `WRITE` and `VERIFY` outcome comes from the real Store and Controller. No Controller state, error or retry property is assigned to manufacture a result. The fixture does not claim to reproduce normal workspace navigation or native browser transactions.

Retained SHA-256 hashes:

- Original View: `c5703038819784e68c68444950b0de4e5c11a67ed317d90e1c6523cb81c2c9cd`
- First 105-test source: `fb9668ab5aacd33fd47131aa7a0d34ae6d4cabb078f027d117f1e209b4671904`
- First RED report: `d25e3dd42d9e78c2b8ec562f54486e48ea514db8fff05e27b4f9ae841048a131`

## Additional controls and new-fixture correction

Twenty-three tests were appended before production changes. The first expanded run reported **128 tests: 49 passed, 79 failed**, exit **1**, duration **1,644.788368 ms**. Six additional failures were errors in the new reuse/batch controls: they attempted global Retry although those dialogs own separate Retry controls, and the batch confirm selector omitted its displayed quantity suffix. These are new-fixture errors, not additional product REDs. Their source and report were retained.

Only those six newly added controls were corrected. They now first assert that global Retry performs no I/O and preserves the real dialog-owned error/command, then activate the actual dialog Retry button. The corrected pre-production run reported **128 tests: 55 passed, 73 failed, 0 cancelled, 0 skipped**, exit **1**, duration **1,699.649442 ms**. The six reuse/batch controls all passed. The four added availability/private-retirement probes failed because quick Add still constructed requests while suspended, invalidated, closed or privately retired.

The other passing controls include real failed/dropped/unacknowledged receipt retries, deliberately new Add commands, original-host detachment, newer Add and Remove/Undo actions started in final Controller notifications, newer same-text generations and IME, legacy storage without a workspace, and a remote hidden preference. The original first 105-test source remains an exact byte prefix of the final 128-test file. No old test or shared helper changed.

- Expanded new-fixture-error report: `3383d0ef225b6d55086689642102dcd2c75c848794aaa21fe8c8fe0e0d77f36f`
- Corrected 128-test source: `1c72c5b27565cf8af5795b5950e4b6efe335e05c3aa625a6cd9f2ea47286d4a9`
- Corrected pre-production RED report: `26530c60927d8d17e9ebc5d41c6b0177de9a88827a82ffec03b80e95eb03ab94`

## Minimum production contract

A private `quickAddAttempts` WeakMap stores the captured construction owner, exact command and existing draft-success closure. It reuses the existing private non-revivable View lifecycle and construction-source availability predicate. Those checks retain the original host/document, Controller, Store, backend, workspace object, workspace ID, workspace generation and session, plus the existing closed/suspended/invalidated conditions.

`add()` checks that source before requesting a command, requests through the captured Store, then checks again after `request` returns. Every deliberate Add still creates a new request. It does not silently replay a failed or previously saved Add; exact replay belongs to Retry.

Only the exact private quick-entry command takes the new `performQuickAdd` branch at the top of `perform`. The old generic body, including the exact Undo branch, remains byte-identical. The new method checks its private attempt/source before local effect setup and immediately before captured-Controller dispatch. After settlement, it checks the same source and attempt, action generation, pending work and any newer retry command before clearing effects or invoking the original success closure.

The draft closure retains the old text, draft generation and composition checks. A newer text draft, a same-text input generation or a composition started before text arrives cannot be cleared by an older result. The method does not focus any element. Newer real actions and Undo records retain ownership through final Controller notifications.

`retryLast()` gains only a leading quick-attempt branch. A source gap returns before any foreign refresh. Within the original source, only `owner.controller.retryCommand === attempt.command` enters exact quick Retry. A saved or dismissed attempt with no retry command cannot replace a genuine READ refresh. The rest of the pre-existing Retry method remains byte-identical, including Undo and ordinary-row routing. Reuse and batch retain their existing modal Retry contract.

Already-dispatched work is neither cancelled nor redirected. The captured Controller reports its real successful, false-write, dropped-write or committed-but-unacknowledged result. A source gap suppresses View cleanup only. Returning to the original source does not automatically acknowledge, clear or resubmit its draft. Explicit Retry after a real failure retains the original operation ID: a false or dropped write can write once successfully; an already-committed receipt is confirmed without another write.

## First focused verification and static boundary

The first candidate passed **420/420 tests**, **0 failures, cancellations or skips**, exit **0**, duration **8,632.84884 ms**. The exact command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-quick-add-source.test.js tests/local-tasks-view.test.js tests/local-tasks-undo-source.test.js tests/local-tasks-reuse-draft.test.js tests/local-tasks-batch-view.test.js
```

This comprises the 128 new probes plus 292 tests in four unchanged original suites. Candidate View and new-test snapshots matched the checked working files afterward; all four old suites matched their retained original hashes.

Static review confirmed **1,464 of 1,465 original tracked files unchanged** and **all 453 protected files unchanged**. The sole changed original is `shared/local-tasks-view.js`. Three of its 75 existing methods change: `perform`, `retryLast` and `add`; `performQuickAdd` is added. The other **72 existing methods remain byte-identical**. Removing only the leading exact-quick-attempt delegation restores the entire old `perform` and `retryLast` methods byte-for-byte. Store, Controller, all old tests and helpers, the preceding Undo/lifecycle/editor/replacement protections, manifest and CI remain unchanged.

- Candidate View: `23a93ba9e729260e393c676ecd918f90ea3f945bc60b6fbdff66a58abba32fee`
- Focused report: `839a17db5347150248bc57852c1ef6b25bc261fc3a5b9eded45df362f2f41889`

These are successive verification stages, not additive test totals.

## Independent review and package checks

The independent 29 quick-entry probes passed **29/29**. A combined independent run then passed **261/261 probes**, **0 failures, cancellations or skips**, exit **0**, duration **5,042.903654 ms**. This comprises 29 quick-entry probes, 42 earlier Undo probes, 27 lifecycle probes, 63 replacement-review probes, 45 Controller probes and 55 ordinary-editor probes. The quick-entry checks independently cover saved/no-retry real READ errors, foreign exact-command WRITE feedback, late drafts/IME and same-text generation changes, newer Undo and same-kind reuse isolation.

Independent static review confirmed **1,464 of 1,465 original tracked files unchanged** and **all 415 files in its protected list unchanged**. The larger implementation-side protected list separately retained all 453 original hashes. Both exclude the deliberately changed View. The old generic `perform` and `retryLast` bodies and all three Undo methods are unchanged.

Python verification passed **84/84** in **1.782 seconds**. Runtime build and verification passed with **133 files**, **4,030,513 source bytes**, archive SHA-256 `c79235d526f723cf2dbf19e3f65868e8b4b67647eb5604b5c62354cbb2839d41`. Test and document additions do not enter that runtime package.

Independent combined report SHA-256: `a04b2b062761d22550ff77f758245a9a81ef02e40bc87545a933ce711e86f7cf`.

## Final 52-file verification

The final broader focused check passed **5,415/5,415 tests**, **0 failures, cancellations or skips**, exit **0**, duration **69,174.328131 ms**. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the 52 explicit paths below. The complete expanded command, report and exit code are retained. All 53 View/test hashes matched before and after execution.

The two changed JavaScript files then each passed `node --max-old-space-size=512 --check`; both exit codes were **0**. `git diff --check` passed. No local full-suite, scale command or glob was used. No old test or helper was changed for this feature, and the candidate View and 128-test source remained frozen through these checks.

Final 52-file report SHA-256: `6d79964a32494385dc84e0a713b6f629d0e0c27e4b72ff15827f78a90d2203cf`.

The exact test paths were:

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
- `tests/local-tasks-undo-source.test.js`
- `tests/local-tasks-quick-add-source.test.js`

## Limits

These checks cover quick-entry source and attempt ownership. They do not certify every other View action, redefine reuse/batch behavior or workspace switching, or change Store/Controller receipt semantics. The unchanged DOM helper models events and ownership; it is not native Chrome, screenshot, visual-layout or native-keyboard evidence.

All task contents, timestamps and storage failures are synthetic. No user device, paid service, permission expansion, local full-suite/scale command, tag, Release or Chrome Web Store publication was used for this implementation. The existing `v1.1.155` Release and native-browser/screenshot evidence remain frozen. Focused local checks do not establish exact-source full CI; that must be verified for the delivered commit separately.
