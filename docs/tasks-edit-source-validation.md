# Tasks editor source ownership: bounded reproduction and design

Date: 2026-10-18 UTC. Production baseline: `82c408367e07d401dcc8f9754395b58523f966a6`, tree `e87b21f189182ab233fdf2c36f875b1e836ed509`. Manifest remains 1.1.155. This document records the bounded reproductions, scope-approved repair, retained compatibility failure and final local verification. Remote CI and publication are separate gates; this document does not claim they have completed.

## Existing behavior and first reproduction

Ordinary `View.edit(task, origin)` currently retains its draft, generation, failed command and reviewed conflict version inside an opening, but constructs requests and runs them through mutable `this.controller.store` and `this.controller`. Its conflict read and dismissal callbacks also dereference the current Controller. The existing modal check only requires a connected input, so moving that same input or Save control out of its dialog does not remove command authority.

The first single-file run used:

`node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-edit-source.test.js`

The unchanged production View and all tracked-file hashes were captured before writing the new test. The exact first suite, first report and exit code are retained independently. The file registered 33 probes; the reporter emitted results for **29: 12 passed, 17 failed, 0 cancelled, 0 skipped**, exit **1**, reported duration **14,985.715865 ms**. It did not emit results for the last four in-flight probes and did not explain why. Those four are **not counted as executed evidence**. The retained first report uses the runner's readable reporter despite its `.tap` filename. Later assertion-format changes in the new test file avoid comparing whole cyclic DOM objects; they do not revise the first result.

Measured request/read/write deltas for the emitted probes:

- A legitimate visible Edit Save: **1/2/1** on its original source. Duplicate text remained tied to exact task identity. A separately established real Remove Undo survived and restored its task.
- New Save with a replacement Controller or Store: **1/2/1 on independent foreign storage**, original **0/0/0**, and the draft closed.
- New Save with a replacement backend: original request count **1**, foreign **2 reads and 1 write**, and the draft closed.
- Workspace object, ID, generation, session or host replacement: **1/2/1** instead of refusal. The object/ID/generation source model keeps independently keyed storage. Session/host replacement does not itself select a different backend but should still reject authority.
- Source replacement before the first asynchronous render and before opening: **1/2/1**.
- A genuine READ, returned-false WRITE, dropped-write VERIFY or committed-but-unacknowledged WRITE failure followed by Retry against independent backend storage: **0 new requests, 2 foreign reads, 1 foreign write**. Each original exact command was consumed by the foreign success and the draft closed. These failures are real Store/Controller outcomes, not fabricated error fields.
- A real conflict and displayed latest version followed by replacement of the Store with independent storage containing that exact version: overwrite performed **1/2/1 on foreign storage**, original **0/0/0**, and closed the draft.
- Moving the opening's textarea or Save control outside its original dialog: **1/2/1**.
- Cancel after Controller replacement: **0/0/0**, but the original Controller retained its failure and a real foreign failed command with a coinciding operation ID was dismissed. Independent deterministic command generation produces that collision; neither Controller's state is faked.

Positive probes passed for original programmatic `edit()` with null/undefined sources and an anonymous no-ID/no-generation/no-service workspace; an open editor remained usable across row redraw/filter/collapse/unrelated task edit/pin; and newer input/IME generations did not retry an older failed command. Exact reviewed-version overwrite hit a second real conflict rather than overwriting an unseen newer edit.

Four separate positive failure/recovery probes temporarily replaced the Controller, restored the original source without activating a foreign Save, and then retried. READ/false/drop each used **0 new requests, 2 reads and 1 write**; acknowledgment failure used **0 new requests, 1 read and 0 writes**. Each original receipt appeared once. These prove the current recovery contract and must remain valid after a guard; they do not establish that the failing cross-source click was safe.

## Additional authorized in-flight window

One separately authorized Node window used the same flags plus an anchored `--test-name-pattern` containing exactly the four previously unreported names. It ran **4 tests: 1 passed, 3 failed, 0 cancelled, 0 skipped**, exit **1**, duration **170.00302 ms**. The new-file assertion adjustment compared DOM identity as a boolean without changing behavior expectations. No production changes preceded either run. The first result remains 29 emitted tests; the additional run is separately reported rather than silently replacing it.

All following deltas begin **after the command had already been dispatched and the test had observed the paused operation**:

1. A real original backend write was paused, then the View's Controller was replaced. Releasing the write committed the original text. Continuation used original **0 requests / 1 read / 0 additional writes**, foreign **0/0/0**. It incorrectly closed the original editor. This is a late UI-ownership failure, not cancellation of a write that was already issued.
2. A real original backend write was paused, then the same Store's backend was replaced. The original write completed; verification read independent foreign storage once (**foreign 0/1/0**) and produced real `VERIFY`. The draft stayed open and controls were re-enabled. Restoring the original backend and saving reused the exact command, acknowledged the original receipt with no new request/write and left one receipt. This passed and is a required preservation contract.
3. A Store read was paused after invocation, then its backend was replaced. The original read returned, but the existing Store then dereferenced its now-replaced backend for write and verification: **foreign 0 requests / 1 read / 1 write**, original **0/0/0** in the measured continuation. The independent foreign record actually changed, and the editor incorrectly closed. A new UI admission guard cannot retroactively pin or cancel this already-dispatched Store transaction. Whole-operation source binding is a separate unresolved Store/Controller concern outside the proposed patch; no zero-foreign-write claim is justified for this boundary.
4. A stale original version caused a real `CONFLICT` after a paused read and View Controller replacement. The original Controller refreshed its own latest record, but the editor dynamically read the foreign Controller's already-loaded state and displayed `Latest saved task: FOREIGN unreviewed text`. Foreign storage I/O remained **0/0/0**. An error review can therefore adopt foreign data without any foreign read at the time of display.

## Scope-approved implementation

1. Capture the original construction Controller, Store, backend, workspace object/ID/generation, session and host before the first asynchronous refresh. An editor captures that construction owner rather than adopting the source present when opened. Preserve normalized null/undefined and the narrowly existing anonymous workspace compatibility.
2. Separate opening ownership from source authority. Opening ownership means the same live dialog/panel/input/control parent relationships in the original document. Source authority means the original captured data-source identities and valid workspace/session remain current. An open modal legitimately makes the original host inert. Row identity, filter, collapse, list revision/order/pin and unrelated row rebuilds do not revoke editor ownership.
3. Check both before opening and before any Save, exact same-draft Retry or explicit overwrite constructs a request or dispatches Store work. Use the captured Controller and Store. Do not add a blanket guard for all programmatic `edit` commands.
4. Close cleanup and a detached/dismissed operation's catch must dismiss only their own operation on the captured original Controller. Source changes must not let close or a late result restore focus to another host's controls.
5. An already-dispatched operation cannot be cancelled or wholly source-bound by this UI check, as the additional read boundary proves. When source authority is absent at continuation, late success and failure both retain the original draft and newer focus. Preserve the same-generation exact command locally even after apparent Controller success because that result could belong to foreign storage; do not adopt its baseline or review. A deliberate Save after the original source returns can safely retry the original receipt. A newer draft generation still discards that older retry command. The opening's own `finally` must release pending and re-enable its still-owned controls regardless of source authority. Use only local content-free changed-source feedback, never foreign task text, and never close or refocus from that late result.

The implementation adds a private WeakMap construction owner and a source-current predicate, then changes only the ordinary editor's admission, modal identity, callback ownership and cleanup. It rechecks source authority after draft/baseline reads, after command construction, and after focus/disabled-control work immediately before Controller dispatch. Host DOM checks precede source-identity reads. Closing rechecks the original source again after cleanup and before row/input focus. The original input-generation and IME listeners remain unchanged.

The new suite initially contained 84 probes; all 84 passed the first focused implementation run below. The reviewed correction adds one exact detached-original-host positive, for 85 probes, all passing in the final verification. Added checks cover all source dimensions before opening, receipt Retry and reviewed overwrite; pending success/false/ack results and original-source return; newer input/IME generations during a source gap; identified/partial/legacy session compatibility; workspace invalidation/suspension; moved modal controls; and preservation of real Remove Undo and Controller state. Two explicit synthetic property-hook boundaries require that the getter/setter actually executed. One changes the source during the final draft read and expects zero requests/reads/writes. Another changes it while disabling the original Save control and expects one already-created request, no read/write, released controls and a deliberate original-source retry. These are synthetic ordering checks, not native-browser timing evidence.

## First implementation verification and retained compatibility failure

The owner's independent first review passed **45/45**, with no failures/cancellations/skips, duration **1,040.443625 ms**, exit **0**, against the initial static View and suite hashes. Both separately authorized syntax checks also passed, exit **0**.

The first focused run used `--max-old-space-size=512 --test --test-concurrency=1` with **42 explicit filenames**, no wildcard, and reported **4,758 tests: 4,757 passed, 1 failed, 0 cancelled, 0 skipped**, exit **1**, duration **62,708.007759 ms**. All **84 new editor probes passed**. The sole failure was the existing `local-tasks-edit-return-focus.test.js` case `pending edit has no eligible row target: detached-host`, at its original assertion requiring the completed editor to close. Source and new-test hashes matched their frozen pre-run values. The first complete failure log is retained unchanged (SHA-256 `e9eb24b94e8320a15112ef40f51742a03da882f0ed22dc7ee87406fe0814a2ba`); the existing focus suite is unchanged (SHA-256 `7812ea4247f5ba879f0ce71bcd8b7480222bb1ea8d0a77d279bf5692fb3b3eda`).

The initial guard mistakenly treated disconnection of the same original host as replacement of its data source. In that old test the original backend write had already been dispatched, then its host was detached. The valid saved result must still close its own editor while avoiding any detached focus target. This is distinct from replacement of `view.host`, Controller, Store, backend or workspace. Following explicit review, the correction removes only the original-host `isConnected` requirement from source authority. Original host identity and `ownerDocument` remain required; the opening's overlay/panel/input/control connection and parent checks remain. Existing tests are not edited. A new positive observes the real dispatched write before detachment, then requires saved original data, editor close and focus remaining on `document.body`. Existing replacement-host/source refusal probes remain in place.

The owner's initial candidate Python checks passed **84/84** in **1.854 seconds**. Initial runtime package/verification covered **133 files**, **4,016,780 source bytes**, SHA-256 `dcbfd4fd914e88b1e1342313d208f7704e9fac63afdac053f522d2f5bceb7c1c`. These pre-correction artifact results are not final-package verification. Owner static checks found **407/407 protected files unchanged**, and **1,452 of 1,453 baseline tracked files unchanged**, with only the scoped View modified. All 71 original methods other than `constructor` and `edit` remained byte-identical.

## Final corrected verification

The final corrected run passed **4,759/4,759 tests**, **0 failures, cancellations or skips**, exit **0**, duration **62,312.152801 ms**. This comprises **85 new editor source probes** and **4,674 unchanged existing tests**. Both authorized View/new-suite syntax checks passed, exit **0**. The original detached-host focus case and its new explicit original-data/body-focus counterpart passed. The retained already-dispatched read boundary still observes the existing foreign write while now preserving the editor; its passing result does **not** mean the Store transaction risk is fixed.

The final independent review passed **51/51 probes**, **0 failures/cancellations/skips**, exit **0**, duration **995.511347 ms**. Its six added ACTIVE/DONE × success/false/ack cases observe the original dispatched write before host detachment, then verify saved data or exact Retry, editor close and body focus. Acknowledgment retry performs no duplicate write and leaves the unique latest receipt. The earlier independent 45-probe window remains historical and is not added again to the final count.

Final Python verification passed **84/84** in **1.963 seconds**. The rebuilt final runtime package and verification cover **133 files**, **4,016,753 source bytes**, SHA-256 `bf502d0578b1c1638aaf266c88a500f8f92abf076001e0afb128939cac913eba`. Final protection checks confirm **407/407 protected files unchanged** and **1,452 of 1,453 tracked baseline files unchanged**, with only the scoped View modified. All 71 original methods other than `constructor` and `edit` remain byte-identical. The protection check's initial path-resolution script error did not modify source; the corrected absolute-path check completed successfully.

The final source and test hashes matched before and after the focused run:

- View: `c777e4a2d2def02c66d62424fd97d7ce84577fc71eb3bbaceeb4dd84b0bd649b`
- New test suite: `26de1e1fc0e970ca66d6ba94f7e60346c6bcd59c504151933bd0494163cde4bc`
- Complete final focused log: `02d689c18f54ad7b18211b02cbac45d404e7033b8ba59f4614601e2bd1017685`

Both focused windows used the same explicit 42 files with `--max-old-space-size=512 --test --test-concurrency=1`, without wildcards, full-suite or scale runs:

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

The first RED, separate in-flight RED and first focused compatibility failure remain unchanged reproduction records. They are not represented as successful verification or silently replaced by the final run. No existing test/helper required adjustment.

## Limits and follow-on risk


 All existing tests, shared DOM helpers, Controller, Store, schema, receipts, recovery, Undo, row-action guards, manifest and locales remain unchanged. The empirically demonstrated already-dispatched read → replacement-backend write boundary is deliberately still represented by its actual foreign write; this patch must not be described as fixing it. A separate prioritized review of its real production reachability and original lock/receipt/CAS protocol is required after this item completes its full verification. No browser/native, screenshot, release, CWS or upgrade-recovery claim is made. Historical real upgrade loss remains unresolved. All records and failures in this suite are synthetic.
