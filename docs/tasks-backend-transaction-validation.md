# Task Store backend transaction ownership

## Scope and production reachability

This change keeps one task Store operation on the backend that owned its lock request. It does not change the task schema, task identities, record/version or revision comparisons, receipts, recovery copies, storage keys, permissions, or the frozen manifest version `1.1.155`.

The actual dashboard and settings initialization paths mount the workspace page before constructing their task View or settings Controller. The default Controller constructs a Store, and `createChromeBackend()` obtains the current workspace session. `Session.createBackend()` binds its lock/read/write functions to that Session through closures. A ready Session exposes read-only `id` and `generation` getters backed by a frozen identity. Normal workspace switching waits for pending work and `session.flush()`, suspends admission of new writes, flushes again, selects the destination, and navigates to a new page. It does not reassign an existing task Store's backend. The production assignment search found only the task Store constructor assigning its `backend`; the separate `collectionStore.backend` wrapper is not a task Store.

Relevant paths:

- `newtab.js`: workspace initialization and task-card mounting
- `options.js`: workspace initialization and task settings mounting
- `shared/local-tasks-controller.js`: default Store, mutation dispatch, retries and conflict refresh
- `shared/local-tasks-store.js`: default backend and all lock-owning operations
- `shared/workspaces.js`: Session identity, `withLock`, `get`, `set`, `flush`, and `createBackend`
- `shared/workspaces-view.js`: `requestSwitch`, `commitSwitch`, and navigation
- `shared/local-content-lifecycle.js`: pending task operations and draft/departure checks

The backend substitutions in these tests are deliberate mutation of a public JavaScript field. They establish a Store protocol defect under that substitution; they do not establish that ordinary product workspace switching causes cross-workspace task writes. The defect matters because awaiting one backend's lock/read must not let the operation continue through a different backend, outside that different backend's lock.

## Small production change

`read`, `mutate`, `verifyBatch`, `reviewBatch`, `reviewRestoration`, and `reviewTransition` capture `this.backend` synchronously at invocation. Their lock and every subsequent read/write/verification use that captured object. `readRaw` accepts an explicit backend while preserving its default for direct callers. `export` and backup `review` obtain their state through `read`; completion/reopening reviews delegate synchronously to `reviewTransition`.

An operation that already started may still complete on its original backend. This is destination consistency, not cancellation or rollback. The original write is still followed by an original-backend read and complete state equality check. A false/rejected write remains `WRITE`; a verification read failure remains `READ`; differing verified content remains `VERIFY`; existing `WORKSPACE_*` read errors remain unchanged. Latest-receipt acknowledgement, older-receipt conflict, exact batch-result validation, CAS checks, synchronous reviewed guards, and recovery retention are unchanged.

The backend object is captured, not frozen. Replacing methods or changing destination logic inside that same backend, changing unrelated injected hooks, or replacing Store methods is outside this change. A later, separately invoked Store operation uses the backend configured at that later invocation.

### Controller boundary remains explicit

On `CONFLICT`, `Controller.run()` starts a separate `refresh()`. Its constructor's storage subscription callback also starts an independent `refresh()` after a notification. If a test replaces `store.backend` meanwhile, either new read can use that replacement. The new conflict boundary test proves one foreign lock/read, zero foreign writes, and a foreign Controller state in that injected case. The editor model does not emit storage notifications: its zero-foreign-I/O assertions describe the measured operation/event window, not every later real notification. This change does not bind an entire Controller lifecycle or all future retries to one source. The existing editor source checks separately retain the original draft and prevent a foreign source from being presented as the reviewed latest record or closing that editor. No Controller, View, or notification behavior changes are included here.

## Tests and evidence

`tests/local-tasks-backend-transaction.test.js` adds 39 checks using independent synthetic destinations and queues plus the real Store and Controller. Coverage includes:

- Replacement while queued for the lock, during an already-dispatched read, during an already-dispatched write, and inside a synchronous mutation guard
- Exact preservation of unrelated records, pin, prior receipts and recovery content
- Every read/review entry, exports, and exact batch verification
- Latest receipt acknowledgement, older receipt refusal, original-source CAS, unknown write outcomes, and exact-command retry after restoring the original backend
- Checked replacement and recovery retaining the prior original content on the original backend
- A separately invoked operation and the separate Controller conflict-refresh boundary
- Actual Session/backend/lock/get/set code over a bounded synthetic manager/storage transport: original destination and lock retention, pending flush, suspension/resumption, unsettled restore rejection, and generation recheck after an awaited bundle read

The Session transport is modeled. These checks do not execute native Chrome storage, native Web Locks, browser navigation, accessibility, screenshots, or a user profile.

The initial 1,455 tracked-file SHA-256 baseline and original Store/Controller/editor-test copies were retained before any production edit. The new 39-check suite was frozen before the first run (SHA-256 `06a1c49aaf87c3ee076d3c62a6cb9e8bb19c97e1000ddbb609dd383b516e23a3`). Each run retained its complete output, exit status, and matching before/after source hashes.

The first two runs used only these explicit files:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-backend-transaction.test.js \
  tests/local-tasks-edit-source.test.js
```

1. Before production changes: **103/124 passed, 21 failed**, exit 1, no skips/cancellations. All 85 existing editor tests passed. The new tests recorded foreign writes after a queued lock, paused original read, and synchronous guard; wrong-source reads in queued read/review/verification operations; wrong-source receipt/CAS and recovery behavior; and a foreign Session write while the original Session's locks were held. All tracked files remained unchanged.
2. After the production fix, before changing any existing test: **122/124 passed, 2 failed**, exit 1, no skips/cancellations. All 39 new tests passed. The two failures were preserved: the old editor verification case expected a foreign read to induce `VERIFY`, but original-backend verification now succeeded; the old dispatched-read boundary expected one foreign write, but observed zero. These failures demonstrate changed behavior rather than a weakened baseline.

After retaining those failures, only the two affected existing cases and one obsolete fixture comment were updated. The verification case now returns the original backend's pre-write state for one verification read after the real original write commits. It still asserts `VERIFY`, the same draft and usable control, the exact original retry command, and a unique receipt with no duplicate write after source restoration. It additionally checks original committed data and zero foreign reads/writes. The dispatched-read case now requires one original write, zero foreign I/O, unchanged complete foreign data, the retained original draft and usable control, and receipt acknowledgement without a new request/write after returning to the original source. The remaining 83 editor cases and shared helpers are byte-identical.

3. Final focused run: **5,048/5,048 passed**, exit 0, **0 failures/cancellations/skips**, duration **63,427.557705 ms**. This used the same 512 MiB heap and concurrency 1 with the 47 explicit files listed below, including all 39 frozen new checks and all 85 editor checks. The Store, new suite, adjusted editor suite, Controller and documentation hashes matched before and after the run. Each of the three changed JavaScript files also passed one separate `node --max-old-space-size=512 --check` invocation.

Independent modeled verification passed **82/82**, exit 0, no failures/cancellations/skips, duration **1,211.754112 ms**. This comprises 27 Store checks and 55 editor checks, including four active/done × original-verification-success/genuine-`VERIFY` scenarios with notifications explicitly isolated. The earlier 27-check independent run is retained, not added again to the final 82 count.

Python tests passed **84/84** in **1.750 seconds**. Runtime packaging and verification passed for **133 files**, **4,017,298 source bytes**, SHA-256 `c452f8b80c7525d13c14d48f03690982d56e14b720a9e2ced979ce0e382ad96a`. This is a local package built from the modified working tree, not a published release or remote exact-source CI result.

Independent static review found **1,453/1,455 baseline tracked files unchanged**; only the scoped Store and authorized editor test changed, with the new suite and this document added separately. Of 410 initially protected files, 409 are unchanged and the sole changed file is the specifically approved editor test. All seven original assertions in its verification case and all four draft/initial-write assertions in its dispatched-read case remain; only the two explicitly obsolete foreign-write expectations were replaced and strengthened. The other 83 editor cases are byte-identical. View, Controller, helpers, workspace code, manifest and CI remain unchanged. Existing validation, backend factory, constructor, request, receipt handling, guard placement, mutation switch/CAS/recovery semantics, export and backup-review logic were preserved. `git diff --check` passes.

Frozen JavaScript SHA-256 values:

- Store: `5aa33683132db33f91ef1d0a39a24ac24e593414ab0fef66ae74fb085a5a3956`
- New 39-check suite: `06a1c49aaf87c3ee076d3c62a6cb9e8bb19c97e1000ddbb609dd383b516e23a3`
- Purpose-preserving 85-check editor suite: `aa125fabe5cd7029bba585855906a1decf1f15ab80e0acca0e4bb289e0feb316`

### Explicit final focused files

The final run used these 47 filenames, with no wildcard, full-suite or scale run:

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

## Delivery limits

No local full-suite or scale run, release, tag, browser extension publication, native-browser test, screenshot, paid service, user-device operation, or permission expansion is part of this change. Focused modeled tests do not establish full exact-source CI. This transaction fix does not resolve or certify recovery from the historical upgrade-data-loss incident.
