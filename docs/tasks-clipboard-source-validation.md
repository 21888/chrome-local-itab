# Task clipboard construction-source ownership

## Scope and interpretation

Production changes are limited to four existing View methods: `copyReady`, `refreshCopyControls`, `invalidateCopy`, and `copyText`. The private existing View lifecycle also retains the exact pending clipboard attempt; no new global declaration is required. The public `copyAttempt` field remains a compatibility mirror, while resetting that field cannot release an unresolved private write lock.

The four existing entry routes are unchanged: one row's raw text, visible active tasks, visible completed tasks, and visible removed tasks. The three list routes retain their exact numbering and displayed ordering. Existing per-route DOM, snapshot, filter, MutationObserver, details visibility, IME and selection gates remain in their existing methods. Store, Controller, schema, storage protocol, data writes, manifest, workflow and old tests/helpers are unchanged.

The new tests deliberately substitute mutable public source identities on real independent Stores and Controllers with identical validated state and a shared workspace object. These are synthetic source-ownership probes. They do not establish normal workspace-switch behavior, reproduce historical upgrade data loss, identify its cause, or recover any historical data.

## Retained unchanged-source RED

Base local HEAD: `6389d5815183844920566be1714a06181b89fb30`.

Before production edits, all 1,479 tracked files and the first new test file were archived. All tracked SHA-256 values stayed unchanged throughout both RED runs. Both runs used exactly:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-clipboard-source.test.js
```

- First run: **300 tests, 76 passed, 224 failed, 0 cancelled or skipped**, exit **1**, **2,145.069228 ms**.
- Corrected-fixture run: **300 tests, 80 passed, 220 failed, 0 cancelled or skipped**, exit **1**, **2,154.966273 ms**.

All four initially visible route controls passed from the first run. The only fixture correction used the mounted quick-entry form to produce the genuine failed Add whose card Retry ownership the test intended to preserve. Direct `Controller.action` had produced a genuine storage error but correctly did not grant the View ownership of that card Retry. No old test or helper changed. The first complete archive, first test, both reports and both exit files remain retained.

The 220 corrected-baseline failures comprised:

- **124** source-gap failures at entry, the pending status hook, control-refresh hook, or the final initial route predicate. The eight source dimensions were Controller, Store, backend, workspace object, workspace ID, workspace generation, session, and host. Existing host-containment entry checks already rejected four host-substitution cases.
- **48** late resolved/rejected clipboard results after source changes that still published stale feedback or refreshed a foreign host.
- **8** final route-predicate hooks that changed the source while returning a previously valid result.
- **8** clipboard-object or `writeText` accessor captures that were read twice and invoked the second returned target.
- **16** clipboard-object or method getter source-gap/retirement cases that still invoked a write.
- **12** retained old blur, pagehide or MutationObserver callbacks that invalidated a newer, genuinely dispatched copy.
- **4** control-refresh hooks that retired the View but still invoked a write.

The 80 passing controls included exact payloads, already-working availability and source rejection, real original clipboard failures, real card Retry preservation, lock retention across invalidation, and already-working retirement stages. A passing control is not an additional defect claim.

Retained SHA-256 values:

- Full baseline archive plus first test: `bea977cfa0aeb325582d4b1eabf869ae0894f226be17b0e71c3e29b244ba5a15`
- Baseline View: `2058c1b7c939f6f123017b83a59f699b5fb786515a4e47154fc938d513d0dcdd`
- First new test: `785a7f7e785336f6ecaf953ea56685280977afb3958b22b21582824ea5f1f6f5`
- First RED report: `f43080a03c09a3e590e44057e4c39beb93fe2ef7247b668ecce274555bbd24a5`
- Corrected RED report: `cbe367a2463dbac4eb547a3859d069c9cb0788a9267de515db15a544bdb2c32b`

## Source, activation and settlement

The shared copy function captures the original private construction lifecycle, original Controller/state, clipboard receiver and `writeText` function. It reads each clipboard accessor once. `Reflect.apply` preserves the original receiver. Source and exact-attempt identity are checked both before and after each route predicate, as well as after status, control, observer and listener setup boundaries before invocation.

No Store read, Store mutation, permission query, or other asynchronous work is awaited before the user-activated write. An unavailable, synchronously throwing or asynchronously rejecting original clipboard still reports the existing local copy-failure message and does not retry, change the card error, clear the draft, or move focus.

An already-invoked write cannot be cancelled. Invalidating, hiding, changing source or retiring the View suppresses later feedback; the private lock survives until the actual original write settles. Clearing or replacing the public compatibility field does not confer permission for another write while that lock is pending. The code does not claim it can undo a system clipboard write already issued.

Cancellation retains its exact attempt, observer, document/window listener functions and status node. Cleanup is idempotent. A retained old callback cannot invalidate the current attempt or erase its status. Status cleanup checks the exact private/public attempt, original status parent/document and ancestor chain, and the text the old attempt actually published. An original subtree detached from its old parent can be cleaned. Adopting that subtree under any foreign parent, connected or detached, cannot grant cleanup authority. Final cleanup releases only its own private/public slots and does not refresh another source's controls.

Source identity is distinct from availability. The existing closed/loading/pending/error Controller, review/dialog, departing, invalidated/suspended workspace and route visibility rules remain. No new blanket availability rule, permission prompt, automatic copy retry, focus restoration or text transformation is introduced. Checks do not claim to observe a source substitution that begins and ends entirely between checks.

## First frozen candidate

The first candidate was checked with the new suite and all four unchanged clipboard-route suites:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-clipboard-source.test.js \
  tests/local-tasks-copy-text.test.js \
  tests/local-tasks-copy-visible.test.js \
  tests/local-tasks-copy-completed.test.js \
  tests/local-tasks-copy-removed.test.js
```

Result: **727/727 passed**, **0 failed, cancelled or skipped**, exit **0**, **8,324.777057 ms**. The new suite contributes 300 of those tests. This is a bounded five-file result, not a full-suite or native-browser result. Source and tests were frozen immediately afterward for independent owner audit.

Frozen candidate SHA-256 values:

- View: `d6feeb034fec1f66bd734304aac98270948d4c1fce5b64e821bee56467980b7b`
- New test: `518555c303ca6c5e8ffa1ab15c9c16fc09f764db134a0f674d0b7309d0c4fcbc`
- First candidate report: `87846f96fd5206c58a8a7c6d8a9fc95cf4e4be7440634be10f84f3cfb127cd2b`

Static comparison at that freeze found only the View changed among the 1,479 original tracked files. The new test and this document are additions. Owner independent tests and further bounded/full validation, if performed, are separate stages and must be reported against their actual final hashes.

## Independent findings and second frozen candidate

The owner's first independent run passed **101/101** unchanged probes, exit **0**, **1,809.762971 ms**. The owner then expanded the independent harness to 103 cases. That run found **two genuine failures**, **101 passed / 2 failed**, exit **1**, **1,943.220658 ms**:

1. Moving the entire original status parent into a foreign detached host preserved the status parent identity. The first candidate's disconnected-node shortcut still allowed old cleanup to erase it.
2. A real second Completed copy started synchronously inside the older completion's first row-control refresh. The newer inner refresh correctly displayed locked controls; the older outer refresh then continued with its stale unlocked value and overwrote visible/completed controls. The private lock still blocked additional writes, but control presentation was wrong.

The first candidate source/test snapshots and both independent reports were retained. Twelve tests were added only to the new suite: attached and detached whole-parent adoption for all four routes, and the newer-real-copy control-refresh race for each route. Before changing candidate 1, the expanded suite reproduced **312 tests, 304 passed / 8 failed**, **0 cancelled or skipped**, exit **1**, **2,198.538272 ms**. The four detached-adoption cases and four newer-copy refresh cases failed; the four attached-adoption controls passed. There was no fixture correction in this stage.

Candidate 2 changes only the same four production methods. Cleanup now walks captured original status ancestry, allowing a genuinely detached original subtree while rejecting adoption under any foreign parent. Control refresh captures both exact private and public attempt identities and stops if either changes after a hook, preserving a newer copy's locked presentation.

The same explicit five-file command then passed **739/739** tests, **0 failed, cancelled or skipped**, exit **0**, **8,590.625823 ms**. This comprises the new **312-case** suite and the same **427** unchanged route tests; it is not additive to earlier runs. Source and tests were frozen again and the execution window returned to the owner for independent verification.

Second candidate SHA-256 values:

- View: `1db42f88e40dc3f7fec00f34a6bace88da79ff29e3aa1e08d586cf8fa54e66bd`
- New test: `a01f6182b1177a196b637f641772f4fcaf5c2af2cc5212daa65c4dc71bbf1f5c`
- Expanded RED report against candidate 1: `574f2008d64b5bd0e09f1658ca9097c4d7c0fd065a3ad8a04185523ac6485d50`
- Candidate 2 report: `8c6fa990993bc5e7ac43a97f08fc8941658c38cedf411f0caa3bbb73b64631db`

## Final owner independent and static checks

The owner's first combined shell invocation accidentally selected retained pre-v2 Controller/replacement harnesses in addition to their current v2 versions. Its retained report was named `feature89-owner-independent747.log`, but it actually executed **850 tests: 848 passed / 2 failed**, **0 cancelled or skipped**, exit **1**, **17,109.81147 ms**. Both failures were the historical pre-v2 Controller assertions “old successful read cannot clear newer save-success” and “old successful read cannot clear newer save-error.” Those assertions had already been superseded during the earlier Controller-source work. This accidental selection was not the intended current-suite gate, and its failures and original report were not removed or relabeled as a pass. No harness, source or test changed for the correction.

The corrected invocation used an explicit **13-file** current-harness list, rather than the prior overbroad shell expansion:

```text
tasks-clipboard-source-independent.cjs
tasks-export-source-independent.cjs
tasks-generic-source-independent.cjs
tasks-restoration-source-independent.cjs
tasks-transition-source-independent.cjs
tasks-batch-source-independent.cjs
tasks-reuse-source-independent.cjs
tasks-quick-add-source-independent.cjs
tasks-undo-source-independent.cjs
tasks-view-lifecycle-independent.cjs
tasks-replacement-review-independent-v2.cjs
tasks-controller-source-independent-v2.cjs
tasks-backend-editor-independent.cjs
```

The exact current gate passed **749/749**, **0 failed, cancelled or skipped**, exit **0**, **14,971.032172 ms**. It consists of **103** unchanged expanded clipboard probes plus the **646** preceding current independent probes. In particular, both independently found clipboard defects now pass without changing their independent harness. These are successive runs, not additive coverage counts.

- Accidental 850-test report SHA-256: `c63c9b0b898623694f7e93bec9833be067c06f65ac162b0f3bb489d9a8c03c31`
- Explicit current 749-test report SHA-256: `1aeab8a64a41f26372f3a384c37f2697458bd9d7982e3e91ff6001f9b0ebcf66`

Owner final static verification confirmed **1,478/1,479** original tracked files unchanged, with only the View changed; **423/423** protected files unchanged; **74/78** old View methods unchanged; no new methods; and every byte outside the four scoped methods identical. Old tests/helpers, workflow, manifest, Store and Controller are unchanged.

Owner Python checks passed **84/84** in **1.948 seconds**. Runtime packaging and verification both exited **0**, with **133 files**, **4,053,303 source bytes**, archive SHA-256 `263e17853838d123afd98c3321d2254d3fcd71ca728a03b490f5b6146f48d7cb`. These are working-tree checks; they are not remote CI, release publication or native-browser validation.

## Final bounded 59-file verification

The final run reused the preceding feature's exact 58-file list and appended only the new clipboard-source suite. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the explicit paths below, without globs, parallel Node processes, full-suite execution or scale runs.

Result: **7,092/7,092 passed**, **0 failed, cancelled or skipped**, exit **0**, **98,823.96571 ms**. All **60/60** hashes (the View plus 59 test files) matched before and after execution. Sequential `node --max-old-space-size=512 --check` commands for the View and new suite each exited **0**, and the same hashes still matched afterward. Source and tests remained frozen throughout.

- Final 59-file report SHA-256: `fe3fa97f3a66f2aeaa4a6a2beb06875b12514e1049a67c4cedc65511ea965802`

The exact files were:

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
tests/local-tasks-export-source.test.js
tests/local-tasks-clipboard-source.test.js
```

## Bounds

All task records, clipboard call targets and promises are synthetic. Store and Controller behavior is real production code operating solely on in-memory test backends. The fixture verifies exact Unicode, combining characters, CR/LF and Unicode line separators, duplicates, maximum-length emoji text, literal markup-looking text, and original list order without touching system or user clipboard content.

The tests verify zero original/foreign Store I/O during copy, unchanged stored bytes and recovery data, original local error and card Retry state, draft/filter state and focus. The DOM/observer fixture does not validate native Chrome clipboard activation/permission behavior, native observer scheduling, UI painting or browser focus rendering. No actual system/user clipboard, native browser, browser permission, screenshot, user device, paid service, credential or personal data was used.

This implementation task made no commit, push, tag, GitHub Release or Chrome Web Store change. Publication and exact-commit CI verification remain with the owner. Release/tag/CWS/native-browser work remains outside this change, and historical real-upgrade data loss remains unresolved.
