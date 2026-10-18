# Task Controller source ownership and refresh delivery

## Scope and production reachability

This change binds a task Controller's state, subscription and retry lifecycle to its construction Store and backend. It does not change the Store transaction protocol, schema, storage keys, receipts, record/version or revision comparisons, recovery copies, Undo commands, View draft/focus rules, permissions, or the frozen manifest version `1.1.155`.

The production assignment search found only the task Store constructor assigning `backend`, and only the task Controller constructor assigning `store`. The `collectionStore.backend` wrapper in `shared/ai-context.js` belongs to a different component. Dashboard and settings initialization await `LocalItabWorkspacesView.mountPage()` before mounting Tasks. The default Controller constructs a Store whose backend is selected from the ready workspace session.

`Session.createBackend()` binds lock/read/write/subscribe functions to that Session through closures. Session `id` and `generation` are getters backed by a frozen identity. `requestSwitch()` waits for pending work and `session.flush()`; `commitSwitch()` pauses autosave, suspends admission, flushes again, selects the destination and navigates to a new page. It does not replace an existing task Controller's Store or backend.

The source replacements in this validation are deliberate public-field injection. They demonstrate a robustness gap, not a verified ordinary workspace-switch path. Neither this change nor these tests establish the cause of the historical upgrade-data-loss incident or certify its recovery.

Relevant code: `newtab.js`, `options.js`, `shared/local-tasks-controller.js`, `shared/local-tasks-store.js`, `shared/workspaces.js`, `shared/workspaces-view.js`, and `shared/local-content-lifecycle.js`.

## Observed gap and minimum source contract

Previously, the constructor subscribed to the original Store but called dynamic `this.refresh()` on a notification. A mutation's `CONFLICT` catch did the same. After replacing either the public Store or its backend, these separate reads could adopt foreign state. The existing revision comparison only orders states from one source; it cannot compare workspace identity. A delayed refresh failure could also overwrite a newer refresh or mutation's real feedback. Destroy prevented publication but did not prevent new I/O.

A private WeakMap now records just the construction Store, backend, refresh sequence and mutation-feedback sequence. A Controller does not support retargeting by replacing public fields. A deliberate new Controller provides a new lifecycle. Direct, separately invoked Store operations retain their existing ability to use the Store's current backend.

Guarding new `run`, `action` and `retry` calls is necessary for the same-source invariant: otherwise a foreign mutation could publish state into the Controller while its subscription and retry history still belonged to the original source. `action` checks before constructing a request. Rejected admission returns the existing content-free `UNAVAILABLE` error, does no I/O and does not replace an existing actual error, retry command or state. Existing pending `run`, `action` and `retry` calls return the same pending promise first.

This contract does not copy View DOM or global-session checks. The actual backend closes over its Session, whose established identity and availability checks already deliver `WORKSPACE_*` errors. Mutable workspace display metadata is not a separate Controller source selector. Replacing methods or destination logic inside the same backend, Store methods, or the Controller's own methods is outside this identity boundary; the backend object is not frozen.

## Refresh, mutation and destruction outcomes

- A refresh is admitted only for the live construction source. The original Store's subscription is similarly ignored while its public source no longer matches.
- A refresh publishes state, feedback and events only while that source still matches and its sequence is current. The existing nondecreasing revision comparison remains within this single-source boundary.
- Each new refresh supersedes older refresh deliveries. Mutation start and mutation settlement advance a separate feedback sequence. An earlier read failure cannot replace saving, Saved or a real mutation failure. The latest same-source successful refresh still publishes monotonic state and emits: it may be the only notification proving that an unacknowledged write really committed. It changes ready/READ feedback only if its feedback sequence also remains current.
- A non-closed, already-dispatched refresh success still returns its original backend's actual state to its original caller when publication is suppressed. It does not read or return a replacement backend's state. A closed Controller retains the prior successful-refresh return of `undefined`.
- Every already-dispatched refresh failure still rejects its caller with the actual original error, even when field publication and events are suppressed.
- An already-dispatched mutation is neither cancelled nor redirected. Its original state or real error still settles the caller's promise. Success still sets Saved and clears the retry; failure retains the exact command and actual error. Only state publication is suppressed during a source gap. An original `CONFLICT` cannot launch a foreign refresh.
- Returning the construction source permits deliberate refresh or exact-command retry. Receipt acknowledgement and write/verification error distinctions stay in the Store.
- Destroy blocks new I/O, including a previously retained subscription callback. Already-dispatched work still settles, pending is released, and closed Controllers emit no late event.

## Retained first RED

Before adding the new suite, all **1,457 tracked files** were hashed and the original Controller, Store and existing backend-transaction suite were saved. All tracked hashes still matched immediately before the first run; no production source or old test had changed.

The authorized first command was:

`node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-controller-source.test.js`

It reported **49 tests: 11 passed, 38 failed, 0 cancelled, 0 skipped**, exit **1**, duration **142.640656 ms**. The complete first test source, report, exit code and hashes are retained independently and are not rewritten by later verification.

Measured failures included both backend and Store substitution:

- Original-source subscription notification caused **1 foreign lock / 1 foreign read / 0 foreign writes**.
- An actual original Store `CONFLICT` caused the same foreign read and published `FOREIGN 0 中文 😀` into Controller state.
- New refresh, run, action and retry admitted replacement sources rather than preserving the original state and failed retry.
- Paused refresh results and actual READ failures published after source replacement.
- Older real READ deliveries overwrote newer refresh, saving, Saved or actual WRITE feedback.
- Successful original mutations published their late state during a source gap. Pending action also constructed a request through a replacement Store before returning the pending promise.
- Calls after destroy, including a retained subscription callback, still issued storage work.

Positive first-run checks included same-source real conflict refresh, original backend mutation failures and exact retries, destroyed in-flight mutation results, and actual Session suspension/invalidation error codes. No Controller state or error is assigned by the test to manufacture a failure. The out-of-order-delivery adapter delays the result of a real Store read only after its lock has settled, so a second actual operation can finish first; this is a synthetic delivery-order model, not native-browser timing evidence.

First test SHA-256: `d18946b942b19db08273a10f3214468812cae0927958cc40073c3628690654bf`.
First report SHA-256: `4f523b0832c0c463dc87033f9abcc5b76f55429b2bbe3718ccdcf42a6d6715d9`.

## First implementation checks and retained compatibility failure

The independent review passed **40/40 probes**, **0 failures, cancellations or skips**, duration **123.218606 ms**. Its three promise-observer cases used real Store outcomes and actually observed the microtask interval where status was Saved and the retry command was cleared while the pending promise still existed. In unchanged, Store-replaced and backend-replaced cases, `run`, `action` and `retry` all returned that same promise without another request or I/O. No Controller field was fabricated for this observation.

The next separately authorized command named only the new suite and the existing backend-transaction suite:

`node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-controller-source.test.js tests/local-tasks-backend-transaction.test.js`

It reported **88 tests: 87 passed, 1 failed, 0 cancelled, 0 skipped**, exit **1**, duration **246.244291 ms**. All 49 new probes passed, with the test file byte-identical to the first RED. The sole failure was the unchanged feature-77 case `boundary: Controller conflict refresh is a separate operation on its current backend`. Its real original conflict now caused **0 foreign locks / 0 reads / 0 writes**, preserving the original Controller state, while its historical assertion required a foreign lock and read. The complete first compatibility failure remains retained; it is not a successful verification result.

Frozen Controller SHA-256: `375a749677341a699c4cfdea5bf6f013f407ec0ec86c52f19dbf03657e9788fe`.
Unchanged existing backend-transaction suite SHA-256: `06a1c49aaf87c3ee076d3c62a6cb9e8bb19c97e1000ddbb609dd383b516e23a3`.
First compatibility report SHA-256: `b777c90784c68da362c67fa997d353f33eb29fbbbaaf05a98e9b1c3277f86c53`.

## Reviewed compatibility adjustment

After the real compatibility failure was retained and independently reviewed, only that existing feature-77 boundary case was updated. It now requires zero foreign I/O, the exact prior Controller state reference, the real original CONFLICT and exact retry command, and unchanged original/foreign storage. After explicitly restoring the original backend, it requires a fresh read of the latest original state while retaining the same actual conflict error object and retry command. The case explains that feature 77 recorded a then-unfixed boundary; this is not a rewrite of its historical result. The entire file outside that one test block, including its other 38 cases, remains byte-identical.

Adjusted existing suite SHA-256: `451ca50b77ca7f805a55575b831fdc375345efd7dbfa10f81e7e13daff14ee6f`.

## Initial broader review and package checks

The initial broader independent review passed **97/97 probes**, **0 failures, cancellations or skips**, duration **1,256.160188 ms**: 42 Controller probes and 55 independent editor regressions. This was the initial candidate review count; the earlier 40-probe review is not added again. Two added real request-value getter cases change the source during request construction and verify that the already-constructed request never reaches mutation dispatch or storage, without changing existing Controller fields.

Initial candidate Python checks passed **84/84** in **1.868 seconds**. Its runtime build and verification covered **133 files**, **4,018,897 source bytes**, SHA-256 `baa7c925fcd0f084117dde40b90ecf0c23f335aa9b82b7b09a39686d16a8fca4`. These preceded the feedback correction below and are not final-package evidence.

The initial static review confirmed **1,455 of 1,457 tracked files unchanged**, and only the approved old boundary block changed among 411 protected files. Its other 38 cases and five original protection assertions remained intact. Store, View, helpers, workspace code, manifest and CI were unchanged. These were initial-candidate checks.

## Retained broad failure and production correction

The first 48-file focused window used the same explicit 47 files as the prior Store validation plus the new Controller suite, with `--max-old-space-size=512 --test --test-concurrency=1`. Its report was **5,079 tests: 5,073 passed, 6 failed, 0 cancelled, 0 skipped**, exit **1**, duration **66,625.825447 ms**. The Controller, new suite and existing backend-transaction suite were unchanged before/after, and all three syntax checks passed. The complete report SHA-256 is `404302898f95bf608e30afbbd0231da2601e2937333b0f92a3e99e3d6c2395da`.

Three failures were genuine production regressions in unchanged Undo tests: one batch Undo and two uncertain single-task Undo cases. A real write committed and sent its storage notification, then its acknowledgement failed. Invalidating the whole refresh sequence at mutation settlement discarded the successful same-source notification, leaving stale completed state and a visible Undo button. Changing these old assertions would have hidden the regression, so their tests and helpers were left unchanged.

The correction separates latest-refresh ordering from mutation-feedback ordering. The latest same-source successful read can publish state under the original nondecreasing revision check and emit for Undo/render listeners; it cannot clear a newer mutation error or change Saved/ready feedback. A late failure must match both sequences before publishing an error, but still rejects its caller with the real read error. Changed-source and closed-controller publication remain prohibited. This preserves committed-but-unacknowledged state observation without claiming the mutation succeeded.

The first 49 tests remain an exact byte-for-byte prefix of the final suite. Four appended probes use actual Store writes/reads and notification delivery: acknowledgement failure, verification-read failure and success all retain their real feedback while the delayed committed snapshot reaches state/listeners; a real failing notification read does not replace the original WRITE error. No original new-suite assertion was relaxed.

Two other broad-window failures were the existing Next up fixture cases that replaced backend/Store before the initial asynchronous read. Their assumption that a Next up button must exist no longer held when the Controller correctly withheld that late initial state. After retaining the failures and receiving explicit review, only those two branches were updated: state must remain null, no Next up action may be generated, both sources must have zero new request/write, and the original source must become genuinely usable after restoration and explicit refresh. The Controller-replacement branch keeps its actual click and zero-I/O assertions. The original file and hash are retained; everything outside the one approved loop block is unchanged.

The sixth report entry was a file-level failure for the pinned-completion suite after eight individual passes. It contained no specific failing assertion or termination cause. Its remaining 19 cases are not counted as executed in that report. A later explicit focused run completed all 27 pinned-completion cases normally; that does not retroactively fill in the earlier report.

## Corrected targeted verification

The corrected five-file window explicitly named the Controller source suite, complete-batch-view, completion-undo, pinned-completion and next-ownership suites. It passed **355/355 tests**, **0 failures, cancellations or skips**, exit **0**, duration **3,761.388853 ms**. This includes all 53 Controller cases, the unchanged original Undo assertions, all 27 pinned-completion cases, and the reviewed Next up fixture changes.

The first RED, initial compatibility failure and first broad failure remain retained independently. Later successful runs do not replace those reproduction records.

## Final corrected verification

The final 48-file focused run passed **5,101/5,101 tests**, **0 failures, cancellations or skips**, exit **0**, duration **63,315.495531 ms**. All 53 new Controller probes and all 27 pinned-completion cases actually emitted passing results. The original uncertain Undo assertions passed without modification. The approved backend-transaction boundary and the two Next up fixture branches passed. Four separately authorized syntax checks passed for Controller, the new suite and both adjusted existing suites. All four code-file hashes matched before and after the run.

The final independent review passed **100/100 probes**, **0 failures, cancellations or skips**, exit **0**, duration **1,287.733185 ms**: 45 Controller probes plus 55 editor regressions. Its added complete/reopen/completePinned cases observe a real committed-but-unacknowledged write, delay the successful same-source notification beyond mutation settlement, require state publication with the original WRITE error and exact retry preserved, then acknowledge the same unique latest receipt without another request or write. Earlier independent counts are historical and are not added to the final 100.

The original 42-probe independent Controller file and 97-probe report are retained. In the corrected independent review, two newly authored successful-read-across-mutation observations now require the original revision-monotonic state behavior and permit an event, while strictly preserving the latest status, error, exact retry and pending fields. A separately superseded-refresh observation still requires the prior state reference and zero events. This purpose-preserving correction responds to the real Undo regression and revises the initially overbroad publication contract; it changes no pre-existing repository test. The three additional acknowledgement-notification cases bring the corrected independent Controller total to 45.

Corrected Python verification passed **84/84** in **1.823 seconds**. Final runtime build and verification passed with **133 files**, **4,019,240 source bytes**, SHA-256 `48a96f38472f7e5b825f44da15bc0a6884c0894d65287e35aa3256c270cc8e16`. A first packaging attempt used a relative output path containing parent segments and was rejected before producing files. Its failed log is retained separately; the successful build and verification used an absolute output path.

Final static review confirms **1,454 of 1,457 tracked baseline files unchanged** and **409 of 411 protected files unchanged**. The only authorized existing-test changes are the single feature-77 boundary case and the two Next up branches. The other 38 backend-transaction cases and everything outside the approved Next up block remain byte-identical. All Undo/pinned tests, Store, View, shared helpers, workspaces, manifest and CI remain unchanged. The first 49 new tests remain an exact prefix of the final 53-test suite; Controller `dismissRetry` and `destroy` are unchanged.

Final SHA-256:

- Controller: `0ee6da4fa641196c35586d99b0bd96551b7b26d012a2d1156e7eef41a8be0bdf`
- New 53-test suite: `5d301c379e2ed4f4c1924ee4fe34c7b04642498ce7e442c63b28cf9c60fab3ee`
- Backend-transaction suite: `451ca50b77ca7f805a55575b831fdc375345efd7dbfa10f81e7e13daff14ee6f`
- Next up ownership suite: `602922d576d74ab715e250cfd26345225523fbe2ec31cde70a4f27fc089ebce8`
- Complete final focused report: `f2f10936bc854ef20f6d7ec98c5bb5e9c5025f419940e49ee702b827326f706e`

Both broad windows used `--max-old-space-size=512 --test --test-concurrency=1` and the same 48 explicit files below. No glob, local full-suite or scale command was used.

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

## Delivery limits

No local full-suite or scale run, release, tag, browser extension publication, native-browser test, screenshot, paid service, user-device operation, or permission expansion is part of this change. Focused modeled tests do not establish full exact-source CI. All test task records are synthetic.
