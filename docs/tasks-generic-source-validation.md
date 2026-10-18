# Generic task action source validation

## Scope and boundary

This change binds the ordinary `View.perform` path and the generic `retryLast` fallback to the View's existing private construction lifecycle. That lifecycle identifies the original host/document, Controller, Store, backend, workspace object, workspace ID, workspace generation and session. Generic attempts also retain their exact command and success/failure callbacks privately.

The issue was a gap after an ordinary row had admitted its original source and called `source.owner.store.request`: the returned command still reached `this.controller.run`, which could now refer to a different complete Controller. Awaited generic continuations similarly checked mutable public fields and operation IDs, allowing effects from an older action to run on a changed View or while a newer same-ID command was pending. A no-command READ Retry could refresh a substituted Controller.

The fix uses the captured construction Controller, checks identity again after local effect setup, and fences result effects with the exact private attempt, action generation and captured Controller's pending/exact-command feedback. It rechecks after `rememberUndo`, effect-slot writes and the success callback before continuing. A successful continuation also requires that the captured Controller has no newer error, including a READ failure for the same exact command. Failure callbacks additionally require the Controller's actual error object to be the error from that invocation. The generic Retry fallback requires its retained exact command; an equal operation ID alone does not authorize a different command. A null command remains a refresh, without replaying an earlier saved receipt.

Only three existing View methods changed: `perform`, `retryLast` and source/focus checks in `performPinned`. The other 75 existing View methods are byte-identical, including the entire ordinary row implementation and all source-admission helpers. The specialized restoration, transition, quick-add and Undo dispatch heads remain intact. Existing row-specific Retry availability/source gates also remain intact. No kind-only routing was added: a direct generic command can share its kind with a row or Undo command without entering that other path.

`performPinned` checks identity before creating its focus intent, reads the captured Controller revision and checks construction identity again after its final layout read, immediately before restoring focus. Its focus-intent lifecycle and cleanup remain unchanged. A valid Next-up Retry still creates and supplies a fresh success closure; it does not reuse the cancelled focus lease from its previous invocation.

## Identity is separate from availability

The new generic checks use lifecycle identity, not the editor's stricter availability predicate. They do not add a blanket rejection for suspended/invalidated workspace flags, a closed original Controller, a detached original host or page visibility. Existing row-specific admission and Retry restrictions remain authoritative. Original Controller errors can still be delivered when storage is unavailable, and a genuine no-command READ Retry can still refresh the original source.

A transaction already issued to the original Store retains its actual outcome. The change cannot turn a failed write into success, reroute verification, cancel an issued transaction or reconstruct a command. Successful and committed-but-unacknowledged writes retain their receipts; exact explicit retries acknowledge them without another write. False writes and dropped writes can be retried on the original source. A source-gap continuation cannot clear the original Undo/effect slots or invoke its success/failure callback on the substituted View.

## First RED, before production changes

The original tracked files were archived and hashed at local HEAD `ebe45e1c6244adab631c7f88f6fc033ad4c05d18`. Every original tracked-file hash still matched after the first RED. No existing test or helper was edited.

The first new suite contained 224 tests and ran with:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-generic-source.test.js
```

Result: **224 tests, 75 passed, 149 failed, 0 cancelled, 0 skipped**, exit **1**, duration **2,594.278208 ms**.

The failures established these boundaries with real Store/Controller calls:

- 88 request-return probes across ordinary Complete, Reopen, Restore, active/done Remove, Pin, Move up/down, Move to start/end and Next-up completion, with eight source-identity substitutions each.
- A whole-Controller substitution wrote the independent foreign backend, whose records and workspace identity matched the original. Workspace/session/host substitutions still dispatched after the source changed. Store/backend substitutions were rejected by the Controller but still replaced generic View effect/generation slots.
- Generic effect-setup hooks could change the source before mutable dispatch.
- Late saved, false-write, dropped-write and lost-acknowledgement results invoked stale generic callbacks or cleared effects during source gaps.
- No-attempt null READ Retry could refresh a changed source, and a dispatched READ Retry still invoked the View render hook after a source gap.
- An older failure callback ran while a newer exact or same-ID-distinct command was pending. A generic Retry could consume the newer distinct command because its operation ID matched.

The passing controls covered normal actions and exact receipt retries for all 11 routes, direct same-kind generic calls despite filtering, issued outcomes after host detachment/Controller closure/View destruction, genuine READ refresh after a saved generic receipt and completion Undo receipt Retry after filtering/collapse.

Retained SHA-256 values:

- Original tracked archive: `3bfc35841a7b1691f94d78cb5f17bd80c2343b7e8c44ffe127ada63bea1276f5`
- Original View: `95b80ddcf8f34a81a2eba0fe9eb12b7fae202d1a83412ea68089ff9ef6cee087`
- First 224-test file: `7fe85e48f6c50158c574e1c1052af18005a3ddacb8c04b2e3b9bbebbe23be2ab`
- First RED report: `3405156167a3ced3e5dfff5d69c3f47d30ac8675ec4016d04ebc913c1ccc8127`

## Expanded baseline RED

Before editing production, seven tests were appended for original unavailable/closed behavior and reentrant `rememberUndo`, effect-clear and success hooks. The original 224-test file remains an exact byte prefix.

Result: **231 tests, 78 passed, 153 failed, 0 cancelled, 0 skipped**, exit **1**, duration **2,754.207197 ms**. The three added availability controls passed; the four added hook/reentrancy probes failed. This was another unchanged-production RED, not a failure introduced by the candidate.

- Expanded test SHA-256: `1a1fb5ec4aa07b11deda262815600791e70de62aeb3497e9e14dca30650350ce`
- Expanded RED report SHA-256: `1466b2c356a31e78aa039f206294d2532aad9534bf48f4772530c2954794909e`

## First candidate verification

The first candidate ran these seven explicit files:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-generic-source.test.js tests/local-tasks-view.test.js tests/local-tasks-undo-source.test.js tests/local-tasks-next-ownership.test.js tests/local-tasks-quick-add-source.test.js tests/local-tasks-transition-source.test.js tests/local-tasks-restore-batch-source.test.js
```

Result: **1,431/1,431 passed, 0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **23,256.090447 ms**. These are successive verification stages, not additive test totals. The original tests in this command were unchanged.

- Candidate View SHA-256: `aed275141b68a585be0476deaae7474d2a354f545d640a7a4e18c9f430005bad`
- New 231-test suite SHA-256: `1a1fb5ec4aa07b11deda262815600791e70de62aeb3497e9e14dca30650350ce`
- First candidate report SHA-256: `93443ccc6b13b123e0d60763bf54483a7e61bcd31c4718b3d94f6113c4795d9a`

At the candidate handoff, static verification found **1,474 of 1,475 original tracked files unchanged**. Only `shared/local-tasks-view.js` differed. The test suite and this document are additions. Store, Controller, all original tests/helpers, manifest, workflow, schema and protocol were unchanged. The manifest remains **1.1.155**. No commit, push, tag, Release or Chrome Web Store operation was performed by this implementation task.

## Independent audit and second candidate

The independent review's first two 166-probe runs contained newly written helper assumptions incompatible with the existing DOM model: absent `disabled` is `undefined`, and an absent attribute is `undefined`, not necessarily `false` or `null`. Those stages reported **89 passed / 77 failed** and **29 passed / 137 failed**, respectively. Both original helper versions and reports were retained. Correcting only the new helper checks produced **166/166 passed**, exit **0**, duration **2,907.237091 ms**. Neither existing repository tests nor production were changed for those fixture corrections.

The reviewer then added callback-boundary probes. The initial Next-up probe counted its layout hook twice because focus itself rechecks layout; that draft and report were retained before making the hook one-shot. The corrected expanded audit produced **169 tests, 167 passed, 2 failed**, exit **1**, duration **2,924.176219 ms**, against the first candidate. These two actual product failures were:

1. A successful generic Controller call returned through a delayed wrapper after a newer real READ failure for the **same exact command** had settled. The older continuation still invoked its success effect and cleared Retry effects.
2. A Next-up success callback's final input layout read changed the View source to an independent foreign Controller that had genuinely saved the same exact command/receipt. The callback still focused the quick-entry input under the substituted source.

The new repository suite appended corresponding regressions, eight final-layout source dimensions, fresh same-source Next-up focus controls, a closed-Controller issued-success effect control and a real unrelated-order-change Undo Retry control. The first 231 tests remain an exact byte prefix. Its first 247-test run on candidate one reported **237 passed, 10 failed**, exit **1**, duration **3,344.114391 ms**. Nine failures matched the actual product gaps. The tenth was a new assertion mistake: reopening a task restores its original inactive slot, so it can appear before an unrelated task moved to the first active slot. Only that new assertion was corrected to preserve the existing active order while excluding the reopened task. The corrected candidate-one RED was **247 tests, 238 passed, 9 failed**, exit **1**, duration **3,192.138402 ms**.

The second production correction was limited to requiring no newer Controller error before success effects, plus using the captured Controller revision and checking construction identity immediately before the Next-up callback focuses the input. It did not add an availability check or change row bodies, private specialized routes, Store, Controller or old tests.

The same seven-file focused command then passed **1,447/1,447 tests, 0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **23,235.139971 ms**. This includes the final **247-test** new suite. Fresh Next-up focus worked after successful first attempts and after false, dropped and lost-acknowledgement retries. The closed original Controller's issued-success callback behavior remained intact. Exact Undo Retry survived a real unrelated active-order change and filtered rows.

Retained SHA-256 values:

- Corrected independent 169-probe RED report: `274ac32dc6b6191a12d304f73b304b8a5022a954486cba5f91fe4c5351a97822`
- First candidate's expanded 247-test report, including the new assertion mistake: `43290bb5ee4ac94c90966b7754d36ed2ff1de79450600737d30be057f354a672`
- Corrected candidate-one 247-test RED report: `3cc9b96bc873d97fb245ca64e23c38a6b91c936e8e06bf6c180b6697eafaba2e`
- Second candidate View: `685c321e75627fa78b6d16927660fc3d9ac944a69b66c5e5f558ff13916ee4cc`
- Final 247-test suite: `f40a29f46bf9b91a016e16efc3495bd6f982d49a9fa8c00aa8913bea09d039d4`
- Second candidate focused report: `2dbf4e210ffdeef0ee8a9ca99f634ba4228b29c556138af914be7b2e800f830f`

Static verification after candidate two again found **1,474 of 1,475 original tracked files unchanged**, exactly the same three View methods changed, and the full row body byte-identical. The candidate source and test hashes were checked against their retained frozen copies before handing execution back for independent review.

## Final independent and package verification

Against the second candidate, the independent reviewer reran the same 169 probes together with 442 preceding regression probes. The combined run passed **611/611 tests, 0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **12,506.322604 ms**. The two genuine callback RED assertions were unchanged and passed.

- Final independent report SHA-256: `cce2bda3ee1b3a4ff2fdbc89814d4f90a1b7b0c34adebfa329052d0a731bf84a`

The owner's independent static check confirmed **1,474/1,475 original tracked files unchanged**, **421/421 protected files unchanged** and **75/78 existing View methods byte-identical**. The specialized dispatch/Retry heads, all historical row-specific Retry gates and the entire row body matched the baseline exactly. Outside the three changed methods, the sole source addition is the private generic-attempt map.

Owner Python checks passed **84/84** in **1.892 seconds**. Runtime build and package verification passed with **133 files**, **4,047,947 source bytes**, archive SHA-256 `7cba3c696faa7d9ddc7be77fc2ee900c019fc605cb9e994d3c6f10a99988b913`. These are working-tree checks, not a remote CI, Release or native-browser claim.

## Final bounded 57-file verification

The final run reused the preceding feature's exact 56-file list and appended only `tests/local-tasks-generic-source.test.js`. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the 57 explicit paths below, without globs or parallel Node processes.

Result: **6,665/6,665 tests passed, 0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **94,043.154345 ms**. The View and all 57 named test-file hashes matched before and after the run. The two changed JavaScript files then passed their individual sequential `node --max-old-space-size=512 --check` commands, exit **0** each. All 58 source/test hashes still matched after syntax checks.

- Final 57-file report SHA-256: `e37e21fcd9b1b7c97321fc2c5c5f12d3318555e9e38015058782d1d94f6475e3`

The exact named files were:

```text
tests/local-tasks-restore-ownership.test.js
tests/local-tasks-remove-ownership.test.js
tests/local-tasks-reopen-ownership.test.js
tests/local-tasks-batch-store.test.js
tests/local-tasks-boundary.test.js
tests/local-tasks-complete-batch-store.test.js
tests/local-tasks-complete-batch-view.test.js
tests/local-tasks-complete-ownership.test.js
tests/local-tasks-completion-undo.test.js
tests/local-tasks-copy-visible.test.js
tests/local-tasks-edit-return-focus.test.js
tests/local-tasks-move-first-ownership.test.js
tests/local-tasks-move-first-store.test.js
tests/local-tasks-move-first-view.test.js
tests/local-tasks-move-last-ownership.test.js
tests/local-tasks-move-last-store.test.js
tests/local-tasks-move-last-view.test.js
tests/local-tasks-pin-ownership.test.js
tests/local-tasks-pinned-completion.test.js
tests/local-tasks-step-move-ownership.test.js
tests/local-tasks-store.test.js
tests/local-tasks-view.test.js
tests/local-tasks-reopen-batch-store.test.js
tests/local-tasks-reopen-batch-view.test.js
tests/local-tasks-restore-batch-store.test.js
tests/local-tasks-restore-batch-view.test.js
tests/local-tasks-copy-completed.test.js
tests/local-tasks-next-ownership.test.js
tests/local-tasks-copy-removed.test.js
tests/local-tasks-edit-source.test.js
tests/local-tasks-batch-view.test.js
tests/local-tasks-dialog-composition.test.js
tests/dialog-focus.test.js
tests/dialog-ime.test.js
tests/dialog-details-focus.test.js
tests/ai-context-task-edit.test.js
tests/ai-context-view.test.js
tests/ai-context-external-tasks.test.js
tests/local-tasks-departure.test.js
tests/local-tasks-reuse-draft.test.js
tests/local-tasks-copy-text.test.js
tests/local-tasks-visibility.test.js
tests/local-tasks-backend-transaction.test.js
tests/workspace-lifecycle.test.js
tests/workspaces-invariants.test.js
tests/workspaces-view.test.js
tests/ai-context.test.js
tests/local-tasks-controller-source.test.js
tests/local-tasks-replacement-source.test.js
tests/local-tasks-view-lifecycle-source.test.js
tests/local-tasks-undo-source.test.js
tests/local-tasks-quick-add-source.test.js
tests/local-tasks-reuse-source.test.js
tests/local-tasks-batch-source.test.js
tests/local-tasks-transition-source.test.js
tests/local-tasks-restore-batch-source.test.js
tests/local-tasks-generic-source.test.js
```

No original test or shared helper changed at any stage of this feature. The only test correction was the newly added active-order assertion described above, and its failed version/report remain retained separately.

## Model and verification limits

Every manufactured storage result in the new tests comes through an actual Store operation and actual Controller method. Tests do not assign Controller state, error, retry or status fields to create an outcome. Foreign backends are independent while sharing identical initial records and workspace identity. Each synthetic backend lock fixes its storage target before queued work begins, so a workspace-field substitution cannot accidentally reroute the backend's own verification.

DOM identity checks compare bounded identities or scalar summaries, avoiding recursive equality on cyclic node graphs. The tests use the existing DOM/event model. They do not validate native Chrome focus painting, native keyboard dispatch, extension installation or actual workspace navigation. Public-field source substitutions are deliberate fault injection and are not evidence of the cause of the historical real-data-loss report. That report remains unresolved.

These RED, focused/57-file, independent, Python and package checks are distinct stages; their test counts are not additive. They do not claim repository-wide local execution, remote CI, native-browser verification or publication. No local full-suite, scale, concurrent Node, browser, screenshot, user-device, paid-platform or permission-expansion step was used.
