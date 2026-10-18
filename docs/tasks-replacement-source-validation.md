# Task backup import and recovery review ownership

## Scope and production reachability

This change is limited to `View.importFile`, `View.reviewRecovery` and `View.reviewReplacement` in `shared/local-tasks-view.js`. It reuses the existing private construction-source identity and source predicate. The other 71 View methods, including the constructor, ordinary editor, `createDialog`, `recoveryPreview` and `destroy`, remain byte-identical. Store and Controller code, schema, storage keys, revision CAS, receipts, recovery-copy retention, error codes, Undo and shared DOM helpers are unchanged. The manifest remains `1.1.155`.

Production initialization mounts Tasks after workspace setup. The assignment search found no production task-View Controller hot-swap. Normal workspace switching waits for pending work, suspends and flushes the session, selects the destination and navigates to another page. The source substitutions here are deliberate public-field boundary probes using independent real Stores and Controllers. They are not evidence that normal workspace switching redirects Tasks, and do not establish the cause or recovery of the historical upgrade-data-loss incident.

The existing Store captures a transaction's backend before taking its lock. The existing Controller binds its operations to its construction Store/backend. Both protections remain intact. They cannot, by themselves, bind an open View review to its original Controller when the entire public `View.controller` field is replaced with a different valid Controller.

## Observed failures

The original import path obtained its Store after asynchronous `file.text()`. Recovery froze the displayed content and revision from one successful read, but its confirmation command, dispatch, cancellation and late-failure cleanup still dynamically obtained the current Controller or Store.

The retained first RED ran the new file alone against unchanged production and all **1,459 original tracked-file hashes**. It reported **25 tests: 6 passed, 19 failed, 0 cancelled, 0 skipped**, exit **1**, duration **385.269964 ms**. The six successful controls covered real import and recovery with successful writes, false writes and committed-but-unacknowledged writes followed by exact receipt retries.

Measured failures were:

- Replacing the entire Controller before either confirmation caused **1 foreign request, 2 foreign reads and 1 foreign write**.
- A delayed file read acquired the foreign Store, performed **1 foreign read** and opened a review. An already-issued original review/recovery read also opened a review after its View source changed.
- Cancel and a cancelled operation's late failure both retained the original real WRITE retry while clearing a foreign real WRITE retry with the same operation ID.
- A moved, hidden or inert retained confirmation performed **1 request, 2 reads and 1 write** for both import and recovery.
- Changing the Controller during confirmation's focus transfer dispatched an original command to foreign storage, causing **2 foreign reads and 1 foreign write**.
- An already-issued original successful transaction correctly stayed on its original Store, but its late View callback incorrectly closed the review during a source gap.

The full first test source, production sources, tracked hashes, report and exit code are retained independently. No original repository test or helper was modified to obtain these failures.

- First 25-test source SHA-256: `556bae276bd7301de540718fe959d09decb3dc42c1280fa3154084015addeaac`
- First RED report SHA-256: `d8aa592cc56b9e8ca7941be196c9aaa2743a998fadf1da2b3d169895bff3462f`
- Original View SHA-256: `c777e4a2d2def02c66d62424fd97d7ce84577fc71eb3bbaceeb4dd84b0bd649b`

## Minimum review contract

### Source identity and asynchronous preparation

Both public preparation entries capture their original construction owner and Store. They recheck that source before starting storage work, after file/read awaits and after any valid-source render. An invalidated entry retires without replacing `localError`, actively rendering a foreign source, or opening a review. Existing generation checks still prevent a delayed review from replacing a newer dialog or surviving destruction.

Recovery retains the existing immutable same-read content and revision. Import retains its parsed backup review and reviewed revision. The resulting internal command factories use the captured Store. No source identifier is added to stored data, backup files or command schemas.

### Exact modal ownership and confirmation admission

An opening retains its original overlay and panel, and verifies the exact feedback/actions/Cancel/confirmation parent chain, document, connection and membership in the View's dialogs. Host layout and row redraws are not dialog ownership: the modal itself makes its original host inert, and an already-issued result remains compatible with original-host detachment.

New activation separately requires a visible, enabled confirmation outside hidden/inert ancestry, a visible document and no departing lifecycle. It is checked again after request construction and focus transfer. Source identity is rechecked at those boundaries and immediately before captured-Controller dispatch. A local pending guard prevents reentrant or repeated confirmation. Unavailable-source feedback uses the existing conflict message inside the still-owned original review; it does not fabricate a Controller error or retry.

Structural ownership is deliberately separate from confirmation availability. The button disabled for saving does not prevent an issued result from settling or prevent `finally` from restoring an owned button. A source gap also does not permanently disable the review. Returning the original source permits a deliberate retry.

### Issued results, cancellation and receipts

An admitted Store transaction is neither cancelled nor redirected. Its original success or actual error still reaches its caller under the unchanged Store/Controller protocols. During a source gap, its review keeps the exact command and remains open instead of treating the result as permission to close a different-source review. On return to the original source, a committed result can be acknowledged using that same latest receipt without another request or write.

Cancel and cancelled/detached late-failure cleanup address only the captured Controller and an actually constructed command's operation ID. Source-gap closure suppresses focus restoration while still cleaning up the original modal. Genuine same-source conflicts keep the established conflict/hidden-confirmation behavior; WRITE and verification failures retain their existing exact-command retry behavior.

## Retained unconfirmed-Cancel RED

After the first implementation passed its focused checks, a static review found a related cancellation edge: an unconfirmed review called `dismissRetry(undefined)`. With no retry command, the unchanged Controller's optional operation-ID comparison also evaluates to `undefined`, so the call cleared an unrelated real READ failure and changed status from error to ready.

Two appended tests opened real import/recovery reviews, obtained a real Store READ failure through `Controller.refresh()`, and then cancelled without confirming. On the preserved green candidate, the new file reported **31 tests: 29 passed, 2 failed, 0 cancelled, 0 skipped**, exit **1**, duration **424.120189 ms**. Both failures measured one dismissal, a lost READ error and status changed to ready. No Controller field was assigned to manufacture those states.

The final correction only checks that a command exists before the two captured-Controller dismissal calls. It does not modify `Controller.dismissRetry`. The earlier 29 tests are an exact prefix of the final file; the original first 25 are also preserved as an exact prefix. The two RED failures and candidate source remain retained, with report SHA-256 `eab23a928adf6dfd1d9e78790af2fa690e21a4fb8d53ffa991e4ae445bafc700`.

## Focused, independent and package verification

The first implementation passed **91/91 tests**: the new 25 plus the unchanged original View suite's 66. Adding background/departure admission controls passed **95/95**. After the unconfirmed-Cancel correction, the new 31 plus the original 66 passed **97/97**, **0 failures, cancellations or skips**, exit **0**, duration **1,204.553003 ms**. These are successive candidate checks, not additive totals.

Final independent review passed **163/163 probes**, **0 failures, cancellations or skips**, exit **0**, duration **2,677.548534 ms**: 63 replacement-review probes, 45 Controller probes and 55 ordinary-editor regressions. Replacement probes cover source substitution before preparation/confirmation, source changes during request construction, original issued success/WRITE/acknowledgement outcomes and exact receipt retries, cancelled late failures with equal-ID foreign retries, background/departure rejection, and original-host detachment compatibility. Delayed real successful/READ review deliveries retain existing unrelated INVALID feedback without the three review methods actively rendering a foreign Controller. Four unconfirmed-Cancel probes preserve an unrelated real READ error or real WRITE error and exact retry, together with status, state identity and zero additional I/O.

Final Python verification passed **84/84** in **1.926 seconds**. Runtime build and verification passed with **133 files**, **4,022,517 source bytes**, SHA-256 `9e1144fec685cc460f2a068c11904af68ebe504abdeb7f3712cd8e86e5825bc6`.

Static independent review confirmed **1,458 of 1,459 tracked baseline files unchanged** and **412 of 412 protected files unchanged**. The sole changed pre-existing file is the View, and only its three review methods differ. Every old test, Store, Controller, shared helper, ordinary editor, workspace component, manifest and CI file remains unchanged.

Final code SHA-256:

- View: `3c7a97d7b9b53ffc501bdceb8d99d582ce4aa83af2b674ee7af8747b198958f6`
- New 31-test suite: `934fe339e9172d902700c23ce1d2cb584b485444801d13e76cfe028af174a413`

## Final 49-file focused verification

The final authorized window explicitly named the preceding Controller validation's 48 files and the new replacement-review suite, with `--max-old-space-size=512 --test --test-concurrency=1`. It passed **5,132/5,132 tests**, **0 failures, cancellations or skips**, exit **0**, duration **63,610.954925 ms**. Both subsequent syntax checks, for the View and the new suite, exited **0**. The View and all 49 named test-file hashes matched before and after execution. The expanded command, complete file list, report, exit code and before/after hashes were saved before the result was reported.

Complete final focused report SHA-256: `6a945752d3f01e9a33c8b9ca161b85a3fe22b3a70cce3f5c725aead4022ebef5`.

No glob, local full-suite command or scale run was used. The exact named files were:

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

## Unchanged boundaries and delivery limits

This contract applies to preparation, review confirmation and review cancellation. It does not redefine the entire View lifecycle. The original constructor subscription still invokes dynamic `this.render()`: after deliberate whole-Controller substitution, an original Controller's issued-result event can therefore make that unchanged subscription read the foreign Controller while rendering the background list. The original `View.destroy()` also retains its dynamic Controller lookup. Neither boundary is fixed or certified by this change, and neither is presented as a historical incident cause.

The DOM helper is an unchanged model. Programmatically dispatching retained hidden, moved or inert controls tests rejected authority; it is not evidence that ordinary native clicks can reach them. All task contents and errors are synthetic. No native-browser testing, screenshot, user-device operation, paid service, permission expansion, local full-suite/scale run, tag, Release or Chrome Web Store publication was performed. Focused results and a local runtime package do not establish exact-source full CI; that must be verified separately for the delivered commit. The existing `v1.1.155` Release target remains frozen.
