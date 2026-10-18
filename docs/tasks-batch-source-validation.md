# Reviewed multi-line Add construction-source ownership

## Scope and protocol

This work is limited to `View.addBatch`: popup entry, asynchronous review, confirmation, exact modal Retry, late effects and cancellation. It uses the existing private construction owner and View lifecycle. Store, Controller, schema, storage keys, receipts, generic `perform`/`retryLast`, quick entry, reuse, completion/reopening/restoration and manifest remain unchanged.

`Store.reviewBatch` revision describes the preview. It is not a revision CAS fence. Unobserved remote edits may safely merge with the complete append if capacity still permits; an observed newer Controller revision requires another numbered review. The exact text, whitespace, duplicates, CRLF/CR/LF parsing, all-or-none capacity and receipt replay rules stay unchanged.

Source substitutions are deliberate mutable-field fault injection, not ordinary workspace navigation or evidence for historical upgrade data loss. Independent foreign backends start with identical synthetic states, IDs and versions. The backend fixes its target for an entire lock callback, including verification, to isolate View continuation ownership. Real Store/Controller transactions produce every saved, WRITE and VERIFY outcome. No Controller state/error/retry fields are assigned to manufacture outcomes.

## Retained RED and fixture correction

The first 168-test run reported **7 passed, 161 failed**, exit **1**, duration **3,213.530979 ms**. Two failures were new-fixture mistakes: attempting to open reuse while an original batch was pending, contrary to reuse's existing admission rule. The full first test source, production sources, command, log, exit and hashes were retained. These two failures are not additional product regressions.

The shared new-popup fixture was corrected to open the real batch/reuse UI after the original transaction's final Controller notification, when reuse admission is valid. Eight additional boundary/control probes were appended. The corrected 176-test pre-production run reported **14 passed, 162 failed**, **0 cancelled or skipped**, exit **1**, duration **3,306.721664 ms**. All **1,469 original tracked-file hashes** and **412 protected-file hashes** stayed unchanged. No old test or helper changed.

Observed baseline failures include:

- All eight construction-source substitutions admitted a popup. A replacement Controller received the popup subscription.
- A replacement Controller before review received one request and one read. Before confirmation it received two reads and one write for the original reviewed command.
- Changes after an already-dispatched review could publish the old numbered preview. The original read still legitimately completes on its captured backend; View rejection is not transaction cancellation.
- Source-gap success discarded an original attempt instead of retaining an explicit exact receipt acknowledgement. Retry could route through replacement sources.
- Cancel and late callbacks could clear a real foreign WRITE error holding the same exact command. No-attempt Cancel called dismissal with undefined and cleared a real READ error.
- Focus/control hooks could change source between admission and dispatch. Source-gap subscription updates did not explain the conflict, and Cancel restored focus despite changed ownership.

The existing append behavior, legacy/no-workspace receipt replay, detached original host, global/modal Retry separation, newer quick-entry/Undo/batch operations and old-review/new-popup controls are tested separately.

Retained SHA-256:

- Corrected new test: `c8d1aa452b4f1ac4164d37dcf0c5aad162fb154506bb44b8e7af31049e802143`
- Corrected RED report: `7866062b6de8d76f751a4198482443350409c03ebec6406b46f720ddaf6aaaac`

## Minimal production contract

Only `addBatch` changes. It captures the existing private construction owner and non-revivable View lifecycle, original Controller, Store and subscription function. It checks source identity before popup entry and again after construction, before review/confirm/Retry, after focus/control setup, and before publishing asynchronous results. Source identity includes host/document, Controller, Store, backend, workspace object, ID, generation and session, plus the existing closed/suspended/invalidated checks. No new initial pending guard, connected-host, inert or visibility submission condition is added.

Captured-subscription cleanup belongs to this opening. A source-gap notification can explain the existing CONFLICT in an owned popup but does not update its controls, numbered preview or focus. A delayed review returning during a gap is discarded as a preview; its original read legitimately finishes. Returning to the exact original source permits another explicit review.

Each submitted attempt retains the original reviewed command, numbered texts, source text and generation. A source gap after a real success or failure retains that exact attempt. On return and normal Controller notification, the same popup exposes its exact modal Retry and original numbered preview. False/dropped writes may complete with one later write; committed or acknowledged receipts replay with zero new requests and zero writes. No automatic retry or new Add is issued. A distinct newer Controller retry command blocks the old modal Retry.

Cancel and late catch/finally dismiss only the completely identical command on the captured Controller. No-attempt Cancel never calls dismissal. A real READ error and its refresh Retry survive; so do a foreign same-object WRITE error and a distinct newer original command. Closed/retired openings cannot regain authority by restoring public fields. Newer popup/draft/IME/Undo/action ownership and operation metadata remain separate.

Closing first performs modal cleanup without restoring focus, then checks source/opening ownership before using the original trigger or existing quick-input fallback. Cleanup-triggered source changes and current external focus cannot grant old focus restoration. Original-host detachment does not cancel issued storage work.

## Candidate and additional fixture correction

The first production candidate ran 449 tests: **445 passed, 4 failed**, exit **1**, duration **9,413.075175 ms**. Every old test passed. The four failures shared a new-fixture assertion mistake: a Controller's Set-based notification visits listeners newly added by a prior listener. The new batch/reuse popup therefore legitimately received its own source-gap CONFLICT before the old batch continuation resumed, but the fixture expected its feedback to remain empty.

Only those new fixtures changed: they explicitly deliver that source-gap notification before recording the new popup's own feedback, then preserve the original draft/focus/foreign-error/operation assertions while checking the old continuation. No production change was made for these four failures. The full candidate source/test/command/log/exit is retained.

The final 176-test source was then run in an isolated evidence copy containing the original View, original Store/Controller and unchanged DOM helper, without replacing the current production candidate. It again reported **14 passed, 162 failed**, **0 cancelled or skipped**, exit **1**, duration **3,263.612854 ms**. These fixture failures are reported separately from product REDs.

The first green candidate passed **449/449**, **0 failures, cancellations or skips**, exit **0**, duration **9,600.780028 ms**. The exact focused command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-batch-source.test.js \
  tests/local-tasks-batch-view.test.js \
  tests/local-tasks-batch-store.test.js \
  tests/local-tasks-dialog-composition.test.js \
  tests/local-tasks-view-lifecycle-source.test.js \
  tests/local-tasks-reuse-source.test.js
```

This consists of 176 new probes and 273 checks in five unchanged old suites. All **412 protected-file hashes** remain unchanged; **1,468 of 1,469 original tracked files** are byte-identical. The sole changed original file is `shared/local-tasks-view.js`; all bytes outside `addBatch`, including the other **75 existing methods**, remain identical. `git diff --check` passed. The candidate View/new test are frozen for independent verification.

Hashes:

- Baseline View: `393c572eacfa5b8a758fc656bfb62a262960d5a4656170fbc8ad40c2fce86688`
- Final-fixture RED report: `4c80b497e3dc47231d820751f9229aeb23f11b3840a02be141cb37085cbb805d`
- Frozen candidate View: `f1d36433d4da0ed33e618a8c21ad3c751f30f1941fbd11d142e1e57a652eaf04`
- Frozen 176-test source: `367b76d541bf96af3cce2629be1694fec101311f3eab244adba6ea670dff157b`
- First green report: `e69da43e51999031eed93e95bee0d88ac0600f3eda44fe9996bc0f0304f82ae2`

These are successive verification stages, not additive test totals.

## Independent and package verification

The independent first check passed **41/41** new probes. Its combined run passed **342/342**, **0 failures, cancellations or skips**, exit **0**, duration **6,921.160981 ms**. This combines those 41 batch probes with the previous 301 independent reuse, quick-entry, Undo, View lifecycle, replacement-review, Controller and editor probes. The checks include original-backend reads for already-dispatched reviews, suppressed source-gap previews, saved-gap receipt acknowledgement with zero writes, genuine READ Cancel, and unobserved remote-edit append versus observed-update re-review.

Independent static review confirms **1,468/1,469 original tracked files unchanged**, **418/418 protected files unchanged**, and every View byte outside `addBatch` identical, including the other 75 methods. The implementation-side protected list separately retains all 412 hashes. Both checks match the frozen candidate/new-test hashes above.

Python passed **84/84** in **1.766 seconds**. Runtime build/verification passed with **133 files**, **4,035,617 source bytes**, archive SHA-256 `03f56c97cf9667acd3bbd1c522b9f3aa22a07861219490c7778df71353c90a21`. Test/doc additions do not enter the runtime package. This is package verification, not browser evidence.

Independent combined report SHA-256: `5db267c06f3452e6c188e10298c7761d620ad2217b1520d357b6e5abbbff0156`.

## Final 54-file focused verification

The final broader focused check passed **5,747/5,747**, **0 failures, cancellations or skips**, exit **0**, duration **75,754.190914 ms**. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the 54 explicit paths below. The expanded command, complete report, exit status and path list are retained. All **55 View/test hashes** matched before and after execution.

Both changed JavaScript files passed `node --max-old-space-size=512 --check`, each exit **0**. `git diff --check` passed. No old test/helper changed. The first green candidate View and final 176-test source remained frozen through independent and final verification.

Final 54-file report SHA-256: `9a5b2b4119d147867688a861e311e87926f158f7e109e56e6ea441dbb55d3c26`.

The exact paths were:

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
- `tests/local-tasks-reuse-source.test.js`
- `tests/local-tasks-batch-source.test.js`

These focused local checks do not establish exact-source full CI, remote commit or publication. The delivery owner verifies those separately.

## Limits

The synthetic DOM model is not native Chrome, browser timing, a screenshot, native IME or screen-reader evidence. Source injection is a robustness probe. Fixed-target transactions do not demonstrate that a dynamically rerouted backend would produce the same verification outcome.

No local full-suite/scale run, old-test/helper changes, user device, paid platform, permission expansion, release/tag, Chrome Web Store publication or new browser/screenshot evidence is part of this implementation. Manifest `1.1.155` and existing publication/browser evidence remain frozen. The bounded receipt history and unknown-receipt replay behavior are unchanged; this work does not promise acknowledgement after incompatible later commands or receipt eviction. Exact remote commit/CI delivery is verified separately by the delivery owner.
