# Task render reentry: preserve the latest pending controls

## Scope and reachability

This change addresses a synchronous reentry boundary in the public Tasks View `onVisibility` callback. An accepted render captures the Controller's state and pending flag, then invokes that callback. A callback can start a genuine operation on the original Controller. `Controller.run()` immediately sets its real pending state and emits, so a nested render publishes the correct saving controls before the outer callback returns. Previously the outer render then reapplied its earlier `busy = false` snapshot.

The measured defect is stale disabled/ARIA display: Add, Add multiple tasks, Undo and Retry were re-enabled, and ordinary row/Next-up action `aria-disabled` values reverted to `false` while the real operation was pending. Copy/reuse controls independently read current Controller availability and retained their correct ARIA state. The probes did **not** show raw data, drafts, focus, receipts, rendered revisions or feedback being corrupted. In particular, the saving message already read the current Controller status and remained correct.

The current production mount in `newtab.js` passes a callback that sets `window.localItabTasksVisible` and calls `applyModuleVisibility()`. That function updates dashboard classes, styles and visibility; it does not issue a Tasks Controller operation. The new tests exercise robustness of the public callback contract. They do not demonstrate this callback mutation occurring through current ordinary navigation, identify the cause of historical upgrade data loss, or recover lost data. The source-substitution controls are deliberate boundary probes, not normal workspace switching.

Only `View.render()` changes in production: one private lifecycle token assignment and the existing post-callback guard, plus its explanatory comment. Store, Controller, other View methods, availability predicates, generic/Undo/batch/clipboard effects, storage schemas, revision CAS, receipt behavior, all old tests and helpers, CI and manifest `1.1.155` remain unchanged.

## Retained baseline and RED evidence

Before the first run, an independent inventory verified all **1,481 original tracked-file hashes** against the supplied baseline. An archive retained those unchanged originals and the first new test file. No production change preceded either RED run. Both test versions, complete outputs and the fixture correction were retained.

The first 15-test run reported **2 passed, 13 failed, 0 cancelled, 0 skipped**, exit **1**, duration **228.145251 ms**. Twelve failures stopped on a test-construction mistake: the test expected the Copy-visible button's native `disabled` property to represent pending work, but production intentionally preserves focus and uses `aria-disabled`. The thirteenth, nested-filter test reached the actual outer-render overwrite. The new fixture alone was corrected to read and assert the ARIA value. No existing helper, test or production file changed for this correction.

The corrected 15-test RED reported **2 passed, 13 failed, 0 cancelled, 0 skipped**, exit **1**, duration **250.458848 ms**. All 13 failures reached the genuine stale pending-control comparison:

- Add, original-row Remove and original-row Pin, each with delayed success, a rejected write, and a committed write whose acknowledgement throws: **9 cases**.
- A real Add with an additional nested filter render and a newer independent quick-entry draft: **1 case**.
- A real Add issued from the first ready-state visibility callback: **1 case**.
- Same-source Controller operations while the original host is detached or the document is hidden: **2 cases**.

For every 9-case action/outcome combination, the test first completed the raw-byte, settlement and deliberate Retry assertions, then compared the captured outer publication with the nested publication. The nested Add/Batch/Undo/Retry controls were disabled and Next-up ARIA was `true`; all five were incorrectly reset by the outer render. Each case made exactly **one request** and **one successful backend commit**. Successful and acknowledgement-loss cases required **one write invocation**; a rejected first write followed by deliberate Retry required **two write invocations**. Receipt Retry did not create a replacement command or duplicate write. The original raw bytes remained exact until backend release, and rejected writes left them exact until deliberate Retry.

The two passing controls covered a no-operation nested filter render followed by a genuine READ-error Retry, and source substitution/destruction. No Controller `state`, `pending`, `error`, `status` or `retryCommand` was assigned to manufacture these outcomes. The fixtures use real production Store requests, Controller operations, original View entry points and row events, with a synthetic delayed backend and the unchanged DOM model.

Retained hashes:

- Original View: `1db42f88e40dc3f7fec00f34a6bace88da79ff29e3aa1e08d586cf8fa54e66bd`
- Baseline/original-test archive: `c9e611087895c9f91413520e6328b572a53d2232f999c5f69fe8e6bb6381836f`
- First test file: `d3e0068438bf5a7d01e3b9ebfc0721b3e689751326b3911138d6d71cfe8bbb49`
- First RED report: `f2293baf3f81b74cac0e5e3ed3391154bbf8631febfebcc02a020861be99785d`
- Corrected test file: `538e44cc3cc633aa2dcc63ebbf2a0877a3a41ec03dfbdc9d6e498133df6ed17a`
- Corrected RED report: `ffa6a643fe83aac8911d9d6a54a9626092df1f21ad4609a27cfda6891400d30e`

## Latest accepted render ownership

Each source-valid entry places a fresh opaque object in the private View lifecycle and keeps that object locally. After `onVisibility` returns, the render proceeds only if both its construction source and its token are still current. A legitimate nested render receives its own token and publishes normally; when it returns, the older outer render is retired at the existing callback boundary.

The token is installed only **after** the original source-validity check. A rejected render against a substituted Controller cannot supersede an original render that resumes after its source is restored. There is no new host-attachment, document-visibility or storage-availability gate. Original detached/hidden rendering and original READ errors still publish. Already-issued operations, their exact errors and Retry commands, monotonically published revisions, and removal Undo continue through the unchanged Store/Controller and effect paths.

Every accepted render still delivers its visibility callback. A bounded three-level no-operation reentry control verifies all **three callbacks**, the latest rendered snapshot, unchanged draft/focus and zero new I/O. This is not a claim to prevent an application callback that recurses indefinitely.

Two controls were appended after the corrected RED: the three-callback direct-render case, and a rejected foreign nested render that restores the original Controller before a real READ-error render resumes. The final new suite contains **17 tests**.

## Focused verification

The new suite passed **17/17**, with **0 failures, cancellations or skips**, exit **0**, duration **262.462126 ms**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-render-reentry.test.js
```

The explicit focused run then passed **375/375**, with **0 failures, cancellations or skips**, exit **0**, duration **5,071.949089 ms**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-render-reentry.test.js tests/local-tasks-view.test.js tests/local-tasks-view-lifecycle-source.test.js tests/local-tasks-visibility.test.js tests/local-tasks-generic-source.test.js
```

These are successive checks, not additive test totals. The old suites cover construction-source rejection, original Session availability failures, destruction, generic effects, draft/Undo behavior and visibility/preferences alongside the new callback boundary.

At freeze, all **1,480 other original tracked files** and all **424 protected baseline files** were byte-identical. Comparing the original and candidate View before and after the `render()` method proved that every other method and surrounding source remained byte-identical. `git diff --check` passed. The only added files are this validation document and the new test suite.

Frozen source and report hashes:

- View: `8cb6e05cc733f5c49791a748f048bf78b609036dac0e2edc1f5550c65f1d2a42`
- New 17-test suite: `b9b5f6dbd5051b5cdd952820170b78d4c05661fd69ab0e17395f7fd2aad30595`
- New-suite report: `44ff3e1e9c938ed80d4499a91a3d1e5db4ffb15bca23ebbc9d6ebec6a7cf12ab`
- Focused 375-test report: `494a664cde1bb4aed2dd59beab6dbde34dd26dbfc80fc437227a1c9a5929c770`

## Independent verification and runtime packaging

The independent owner audit passed **14/14 probes** on its first run, with **0 failures, cancellations or skips**, exit **0**, duration **319.507042 ms**. It independently exercised Add, Remove, ordinary Complete and Pin across success, rejected-write and lost-acknowledgement outcomes, plus two nested-filter controls. It checked pending controls, exact commands, original transactions and receipt behavior.

The combined independent check then passed **763/763 probes** across **14 explicit files**, with **0 failures, cancellations or skips**, exit **0**, duration **16,122.932944 ms**. This includes the new 14 probes and independent clipboard, export, generic, restoration, transition, batch, reuse, quick-add, Undo, View-lifecycle, replacement-review, Controller-source and backend/editor checks. It is a separate independent run, not an addition to the repository test count.

Independent static review confirmed **1,480/1,481 original tracked files** and **424/424 protected files** unchanged, all **77 other View methods** unchanged, and every byte outside `render()` identical. It verified the same frozen View/test hashes reported above.

Python verification passed **84/84 tests** in **1.811 seconds**. Runtime packaging and verification both exited **0**, with **133 runtime files** and **4,053,395 source bytes**. Archive SHA-256: `26ca1698418f24864f975911a144709cca546ad84696ea537f2a965c795b9781`. This is a local verification package for the modified working tree, not a published release or a claim of browser testing.

Independent report hashes:

- 14-probe report: `831793329e2e1c78b0b796a6427ba5f5ac7b6d3adb2a561f4ad0b1c4ad408792`
- Combined 763-probe report: `8361049e3263c631a9cee4ff2c277ae3b37c1e98afc64cf06c720257b31f9181`

## Final explicit 60-file verification

The final authorized **60-file** run passed **7,109/7,109 tests**, with **0 failures, cancellations or skips**, exit **0**, duration **99,983.249737 ms**. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the exact paths below. The View and all 60 test hashes matched before and after the run. The complete expanded command, path list, output, exit status and before/after hashes are retained. No glob, local full-suite or scale command was used.

The View and new test suite then each passed serial `node --max-old-space-size=512 --check` commands, exit **0**. Their source hashes still match the frozen values above. These results, the focused repository run, and the independent audit are successive/overlapping checks and must not be added together as a unique test total.

Final 60-file report SHA-256: `53ef8c058516adf4e9b84b8ac92b8152fd7c32b52a492814507575b5c0fb519a`.

Exact test paths:

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
tests/local-tasks-render-reentry.test.js
```

## Verification limits

These results are cloud-executed Node/DOM-model checks. They are not native Chrome, browser keyboard/focus-painting, extension-installation, or historical upgrade verification. No browser or screenshot was used. No local full-suite or scale command was run for this change. The working source and new tests were frozen before independent audit; this document does not substitute earlier successful CI for CI on the eventual exact candidate commit.

No version bump, tag, GitHub Release, Chrome Web Store submission, user-device operation, paid service or permission change is part of this render-only validation.
