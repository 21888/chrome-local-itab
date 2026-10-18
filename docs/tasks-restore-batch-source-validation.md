# Selected removed-task restoration source ownership

## Scope and unchanged semantics

This feature covers the Removed selection restoration popup: construction-source admission, immutable displayed selection, review, confirmation, exact modal Retry, closed-popup card Retry, late outcomes, captured subscriptions and focus. Production changes are limited to a private restoration-attempt map, an added `performRestoration` method, leading exact-object routes in `perform` and `retryLast`, and `restoreBatch` itself. The original restoration DOM/source helpers, transition and Undo paths, Store, Controller, schema, keys, protocol, manifest and workflows are unchanged.

Restoration still reviews each original ID, version and `removedFrom` destination together with the current revision. Confirmation applies all members atomically or applies none. Original text, stored order, capacity, pin and unrelated Undo are preserved. Restoration adds no Undo or redo. The original receipt is reused for uncertain outcomes; no replacement command is constructed for Retry.

The stronger historical restoration gates remain: displayed removed snapshot and DOM identity, MutationObserver history, row text and destinations, filter and revision, original section and control ownership, modal background inert ownership, workspace identity and availability. Exact card Retry keeps its existing page-hidden/departing and suspended/invalidated restrictions. It intentionally does not require the old row snapshot and retains its historical detached-host admission. Genuine null-command READ refresh remains separate from receipt Retry.

## Unchanged-baseline RED and fixture correction

The first new-suite run contained **196 tests: 114 passed, 82 failed**, exit **1**, duration **3,910.951663 ms**. It ran against the unchanged tracked source. One test had a fixture visibility mistake: its final-notification Remove probe targeted `task_0007`, which was no longer among the four visible active rows after restoration. The corrected probe targets the genuinely visible `task_0005`; it passes on the unchanged baseline. The original first-run suite, report and exit remain retained rather than replaced or described as 82 independent product failures.

The corrected and expanded RED contained **254 tests: 133 passed, 121 failed, 0 cancelled, 0 skipped**, exit **1**, duration **4,721.791277 ms**. All **1,473 tracked-file hashes** matched the baseline before production edits. Full tracked sources were archived; both test versions, commands, reports, exit statuses and hashes were separately retained. No old test or shared helper changed.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-restore-batch-source.test.js
```

The fixture uses real Store and Controller operations and independent writable foreign backends seeded with identical synthetic records, revisions, IDs and workspace identity. Saved, false-write, dropped-write/VERIFY and lost-acknowledgement results arise from real I/O. Controller state, errors, retry commands and status are never assigned to manufacture outcomes. Source-identity assertions are bounded booleans instead of cyclic DOM object diffs. The backend captures its transaction target for the lock callback, so injected public workspace changes cannot silently redirect a transaction's verification.

Observed baseline failures include:

- Replacing the backend with an independent backend using the same workspace can open the popup. Review constructs one original request and performs one foreign read.
- Backend substitutions mutate original selections. Confirmation can change retry/effect metadata even when the Controller's own source gate rejects I/O.
- Late review returns and source-gap notifications change controls, preview or focus.
- Focus and control-property hooks can change source during setup, before unguarded review/confirmation/Retry dispatch.
- Issued saved and uncertain outcomes alter the popup during source gaps instead of retaining its original explicit receipt acknowledgement.
- Closed-card Retry can fall through to a foreign Controller refresh or adopt a replaced host/source.
- A post-construction source change can subscribe the popup to a foreign Controller.
- An old modal Retry can replace a newer real quick Add or a distinct same-kind restoration WRITE command.

These are related boundary failures, not 121 different bugs. Existing source-valid session reuse, closed-popup card Retry, detached-host card Retry, historical availability, genuine READ cancellation, original revision CAS/Undo and unrelated same-kind generic `perform` controls pass the baseline.

Retained hashes:

- Baseline View: `a59fbba3009368a71f1ce6b6200b1cc76c7c4a4a339192ae3eff7d7bc9d45f9b`
- Corrected 254-test suite: `800b46420aacfa812fddf337916ce5d58a837f20327e0c642a2fefca62245ea9`
- Corrected RED report: `e2ec0e22f7319470645dd1230113cd5fca76635e46bb42c9d9f724df4267a916`

## Minimal implementation

The popup captures the private construction owner and View lifecycle before admission. It captures the original Controller, Store and bound subscription, rejects post-construction replacement, and checks the same source before and after control/focus hooks, review publication and dispatched outcomes. Selection and existing restoration snapshot validation remain independent of this added construction-source check.

The private map retains the exact reviewed attempt, opening, generation, command and source. Modal Retry must match both this attempt and the original Controller's exact command, if non-null. `performRestoration` dispatches only through the captured Controller and checks latest-attempt identity, action generation and exact retry ownership before publishing effects. It neither resets nor manufactures Controller outcomes.

When issued work finishes during a source gap, only private acknowledgement data is retained. An open original modal can explicitly replay the original receipt after its source returns, with zero new request and zero duplicate write for an already saved operation. A deliberately closed popup cannot cancel issued work. Its original uncertain command remains reachable through card Retry. A genuinely saved/null closed attempt does not expose a fabricated Retry or intercept the original Controller's genuine READ refresh. Foreign and newer real errors remain untouched.

The public `restorationAttempt` is preserved with its existing success and non-retryable-failure clearing semantics; source-gap continuations cannot clear it. Generic `perform` and `retryLast` continue unchanged after the newly added heads. Matching uses exact command objects, never the `restoreBatch` kind alone.

## First frozen candidate verification

The first candidate passed **409/409 tests, 0 failures, 0 cancelled, 0 skipped**, exit **0**, duration **7,324.416035 ms**. This is the 254-test new suite plus 155 tests in three unchanged existing files. Complete command, source, suite, report, exit and hashes are retained. No fixture or production correction occurred between corrected RED and this candidate's first run.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-restore-batch-source.test.js \
  tests/local-tasks-restore-batch-view.test.js \
  tests/local-tasks-restore-batch-store.test.js \
  tests/local-tasks-completion-undo.test.js
```

Static checking found **1,472 of 1,473 original tracked files unchanged**. The View is the only changed original file. Of 77 original View methods, only `perform`, `retryLast` and `restoreBatch` differ; `performRestoration` is added. Removing the two new exact-object heads restores both generic methods byte-for-byte. The other 74 methods, including every restoration helper, render, transition and Undo method, are byte-identical. Candidate source and test suite match their frozen pre-run copies. `git diff --check` passed.

- First candidate View: `1becb4d6ceff152ecb9605930e0b8737f46649d2fc0cf9407082807c01d53caf`
- First candidate report: `c424de77dbbb4df8c481c3d38ec8985ab6a2a3a36fc3a395d0a7d9dbbe7d81ab`

The sole Node window was returned to the delivery owner after this focused run. No worker full-suite, scale, glob, concurrent Node or syntax run was performed. Independent review, aggregate tests, package validation, exact-commit remote CI and delivery are separate stages and are not claimed by these focused results.

## Independent review and corrective RED

The delivery owner's first independent run passed **39/39** probes. Additional independent layout and composition probes then found **3 genuine failures in 42 tests** on the frozen first candidate. These findings were not treated as a completed validation: the final popup layout observation could change the backend after its construction check, and source-gap compositionstart could clear an existing reviewed preview.

The worker added 27 regression controls to the new suite, including all eight construction-source changes at the final review admission and final original-title layout boundaries, source-gap composition, valid original-source IME behavior, and subscription snapshot/final-availability hooks. Against the **unchanged first candidate**, this expanded run produced **281 tests: 263 passed, 18 failed**, exit **1**, duration **5,489.853789 ms**. Its View hash equals the first frozen candidate. The previous 254-test suite and all earlier reports remain retained.

This corrective RED established that final admission could perform a foreign read after a backend hook, and could perform an original request/read after a host hook. The final source-title observation could publish a review after any of the eight construction changes. Compositionstart could clear the review across those same eight changes. No storage outcome was fabricated.

The correction remains entirely within `restoreBatch`: availability and original snapshot checks now recheck construction identity after their final observation; updates preserve the reviewed preview if a guard itself encounters a source change; a source-gap compositionstart cannot change the original selection. A still-owned compositionend may finish its private composing state and then uses the source-gated update, allowing a real composition to finish across a temporary gap without changing foreign UI.

Corrective RED report SHA-256: `f642bfe663ec356efb5feab2a80e72d3d8aa774d908b680596642eb1150a4ca5`.

## Second frozen candidate verification

The same four-file explicit focused command passed **436/436 tests, 0 failures, 0 cancelled, 0 skipped**, exit **0**, duration **7,775.611658 ms**. This is the expanded 281-test suite and the same 155 unchanged existing tests. These are successive verification stages, not additive totals.

Static scope remains unchanged: the View is the only modified original tracked file, only the same three old methods differ, both generic methods recover byte-for-byte after removing their new heads, and all 74 other old methods remain identical. Source and tests match their frozen second-candidate copies. Only `restoreBatch` changed between candidates.

- Second candidate View: `95b80ddcf8f34a81a2eba0fe9eb12b7fae202d1a83412ea68089ff9ef6cee087`
- Expanded 281-test suite: `4eb31f6bf8db4b3244532df93a0402e5d63e3e4851f4048a5857c369f57c1544`
- Second candidate focused report: `771b4cf3e87075bd09581ff5ae52a69621530066dfd054e8a367b373c53d5d01`

The Node window was again returned to the delivery owner. Subsequent independent, aggregate, syntax, package and exact-commit CI stages are owned separately and are not implied by the focused pass.

## Independent second-candidate and package verification

The delivery owner's second-candidate run passed **442/442 tests, 0 failures, 0 cancelled, 0 skipped**, exit **0**, duration **9,284.288145 ms**. It combines the expanded 42 restoration probes with the prior 400 independent probes; the first failing 42-probe source and log remain retained. This is a successive verification stage and is not added to the focused test counts.

The owner's independent static check confirms **1,472 of 1,473 original tracked files unchanged** and **420/420 protected files unchanged**, the same three changed old methods, 74 byte-identical old methods, exact removable generic heads and only the private map outside methods. Its View and new-suite hashes match the second frozen candidate above.

The owner's Python checks passed **84/84 tests** in **1.779 seconds**. Runtime build and package verification passed with **133 runtime files**, **4,046,138 source bytes**, runtime SHA-256 `35ade4a24338550d9ec5ee687508da421375a3d6d588e7bd6c82b784d8f71482`. The new test suite and this document are not runtime package contents. These results do not establish remote exact-commit CI or publication.

## Final explicit 56-file and syntax verification

The final run used exactly the prior transition-source 55-file list plus only the new restoration-source suite. It passed **6,418/6,418 tests, 0 failures, 0 cancelled, 0 skipped**, exit **0**, duration **89,720.897618 ms**. No old case failed and no production or test edits followed the second frozen candidate. View and all 56 test-file hashes matched before and after the run and after syntax checking.

The View and new suite each then passed a separate sequential `node --max-old-space-size=512 --check` command, both exit **0**. No other Node or syntax process ran concurrently. `git diff --check` passed. Full command, reports, exit statuses and before/after hashes are retained.

Final 56-file report SHA-256: `92e6e9a6b92f2e6a167a90d68e04b72ec7b37b36bf1b876c081e7b7aefe737fa`.

The View remains `95b80ddcf8f34a81a2eba0fe9eb12b7fae202d1a83412ea68089ff9ef6cee087`; the expanded test suite remains `4eb31f6bf8db4b3244532df93a0402e5d63e3e4851f4048a5857c369f57c1544`. Exact-commit remote CI and delivery remain separate owner-controlled stages.

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
  tests/local-tasks-transition-source.test.js \
  tests/local-tasks-restore-batch-source.test.js
```

## Limitations

These are synthetic public-field substitution and asynchronous-boundary fault-injection probes. They do not reproduce normal workspace navigation or establish the cause of the original real upgrade data loss. That loss remains unresolved. The DOM model is not native Chrome and does not establish real browser focus painting, native key dispatch or MutationObserver timing. The unchanged old restoration suite supplies its existing limited reflected-attribute observer checks.

No GitHub Release/tag, Chrome Web Store publication, screenshot delivery, native Chrome run, user-device operation, paid service or access expansion is part of this work. No production data or credential was used. The delivery owner controls commits, pushes and subsequent verification.
