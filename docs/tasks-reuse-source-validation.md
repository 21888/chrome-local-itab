# New-task-from-text construction-source and exact-attempt ownership

## Scope and reachability

This change is confined to `View.reuseTask`, the existing **New task from text** popup. It binds entry, request construction, dispatch, modal Retry, asynchronous effects, cancellation and focus restoration to the View's original construction source and this exact popup opening. Reuse remains an independent draft-copy operation: changing or removing the source task after opening does not add a source-row version check or prevent deliberately adding the captured text.

The existing private View lifecycle and construction-source predicates retain the original host/document, Controller, Store, backend, workspace object, workspace ID, generation and session. Private retirement cannot be undone by restoring mutable public fields. Existing closed, suspended, invalidated and departure checks remain effective. No new connected-host, inert, document-visibility or general UI-admission contract is introduced for popup submission. Original issued work may finish after host detachment.

These source substitutions are deliberate fault-injection robustness probes. They are not ordinary production workspace navigation and do not establish the cause or recovery of historical upgrade data loss. Each foreign backend is independently writable and starts with the same synthetic state, task IDs and versions. The synthetic backend fixes the transaction target through the whole lock callback, including verification, to isolate View continuations from dynamic-routing behavior. Every successful, false-write, dropped-write and committed-but-unacknowledged result comes from the real Store and Controller; no Controller state, error or retry field is assigned to manufacture an outcome.

## Retained pre-production results

All **1,467 original tracked-file hashes** and the implementation audit's **493 protected-file hashes** remained unchanged throughout the pre-production runs. The new test file was the only checkout addition. Complete production/test sources, commands, logs, exit statuses and hashes were retained.

The first unbounded identity-assertion run terminated with **SIGKILL**, reporting one file-level failure, without individual test outcomes. A single-name diagnostic run also reported SIGKILL. This is not counted as a product regression result. The new file's failing cyclic DOM identity assertions were then changed to bounded boolean assertions; no production or pre-existing test/helper changed. The subsequent complete run reported **144 tests: 27 passed, 117 failed**, exit **1**, duration **2,268.587295 ms**.

One of those complete-run failures was a new-fixture mistake: its batch control clicked confirmation before asynchronous review finished. That control was corrected to await the real review before confirmation and to use the displayed quantity-bearing Retry label. Twelve additional boundary probes were added. The corrected genuine pre-production run reported **156 tests: 29 passed, 127 failed, 0 cancelled, 0 skipped**, exit **1**, duration **2,264.829988 ms**. The corrected batch control passed. The SIGKILL and fixture mistake are retained separately and are not presented as additional product failures.

Observed baseline failures include:

- A whole replacement Controller sharing the original workspace and identical saved snapshot opened a popup and subscribed to the foreign Controller. Seven of the eight initial-entry source substitutions admitted a popup; the host replacement was already rejected by existing row ownership.
- Replacing the Controller after opening caused **one foreign request, two foreign reads and one foreign write**. Replacing it while the original request returned caused **two foreign reads and one foreign write** with the original command.
- Store/backend substitutions sometimes stopped in downstream Controller admission, but command construction or popup effect ownership had already changed. Workspace ID, generation, session and host substitutions could still issue transactions.
- Modal Retry could dispatch through a foreign Controller. Cancel and late callbacks could dismiss a real foreign WRITE failure even when it held the same exact command object.
- Original successful issued work could discard its retained attempt across a source gap, permitting a later Add rather than explicit receipt acknowledgement. Source-gap settlement also cleared operation metadata.
- Capturing generation after `request` returned let synchronous same-text/ABA/input or composition changes appear to belong to the old submitted snapshot.
- Source-gap subscription updates could disable a newly focused control and move its focus. Cancel could restore focus after cleanup had changed the construction source.

Retained SHA-256 hashes:

- Baseline View: `23a93ba9e729260e393c676ecd918f90ea3f945bc60b6fbdff66a58abba32fee`
- Corrected 156-test source: `4a65420eb6ec7376b907438724b513b8f17a32d69c32691ef31a24390021bc08`
- Corrected pre-production RED report: `3c5d69f0750290e546ef24d4aedfdbcd0698841a59dcda5ae18998b4d60df2de`

## Minimum production contract

Only `reuseTask` changes. It reads the existing private construction owner and non-revivable lifecycle; it does not create a new public owner or reconstruct ownership from mutable fields when opening. Entry checks this source before and after the existing row/text/layout validation. The popup captures the original Controller, Store and subscription function, and keeps that subscription's own returned cleanup.

Draft text and generation are captured before requesting an Add command. The source is checked again after the request and after control/focus setup, immediately before dispatch through the captured Controller. A source gap returns before new storage work. Submission still uses exact original CRLF/CR text until an actual input event, after which it uses the textarea's edited value.

The popup's exact attempt remains separate from quick-entry Add and reviewed batch Add. During a source gap, an owned popup may show the existing CONFLICT message, but subscription updates do not change disabled controls, move focus or transfer operation metadata. Already-issued storage work keeps its actual original outcome. A source gap does not redirect, cancel or rewrite the transaction.

After returning to the exact original source and receiving its normal Controller notification, the same popup exposes **Retry previous add** with the retained original text and command. This includes an original successful save whose popup could not safely acknowledge completion during the gap. Explicit modal Retry sends the same command, never creates a new request, and confirms an already-committed receipt with **zero writes**. False and dropped writes can complete their original command with one later write. The global Retry control is not repurposed for this popup. A distinct newer Controller retry command cannot be replaced by the popup's older attempt.

Only exact command identity on the captured Controller permits dismissal. Cancel with no attempt does not call dismissal and preserves a genuine READ failure and its global refresh Retry. Closing a popup unsubscribes its original listener, never a foreign listener or Controller. Late work from a closed popup preserves a newer popup, quick-entry draft/effect, Remove/Undo, batch error and exact Retry. Closing still cannot cancel an issued write.

Focus restoration retains the existing row-first/visible-quick-entry fallback rules and is checked again after modal cleanup and after target layout inspection. Source gaps, newer external focus and departed focus do not grant restoration authority. IME, same-text generations, ABA edits, missing composition-end fallback, late input, source-row edits/removal, remote hide, existing Undo and independent modal Retry behavior remain covered by the new and unchanged nearby suites.

## First focused candidate and static boundary

The first candidate passed **411/411 tests**, **0 failures, cancellations or skips**, exit **0**, duration **9,061.444713 ms**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-reuse-source.test.js \
  tests/local-tasks-reuse-draft.test.js \
  tests/local-tasks-quick-add-source.test.js \
  tests/local-tasks-batch-view.test.js \
  tests/local-tasks-view-lifecycle-source.test.js
```

This includes 156 new probes and 255 tests in four unchanged existing suites. The complete candidate View and test snapshot matched the checked working files afterward. All **493 protected-file hashes** remained unchanged. **1,466 of 1,467 original tracked files** remain byte-identical; the only changed original is `shared/local-tasks-view.js`. Everything outside the `reuseTask` method is byte-identical, including the other **75 existing methods**, generic `perform`/`retryLast`, quick Add, Undo, editor and replacement protections. Store, Controller, schema, CAS/receipt logic, old tests/helpers, manifest, permissions and CI are unchanged.

- Candidate View: `393c572eacfa5b8a758fc656bfb62a262960d5a4656170fbc8ad40c2fce86688`
- First candidate report: `f3d5f67669bcb2db4460c25ec7dc57a27d8173aae8dc5e569559ffdbe9d55c26`

`git diff --check` passed. These are successive verification stages, not additive test totals. The candidate source and new tests were frozen after this pass for independent review.

## Independent review and package verification

The independent combined check passed **301/301 tests**, **0 failures, cancellations or skips**, exit **0**, duration **5,986.107737 ms**. This combines 40 independent reuse probes with the preceding 261 independent quick-entry, Undo, lifecycle, replacement-review, Controller and editor probes. The independent reuse cases include saved-source-gap receipt acknowledgement with zero writes, request-return text/ABA changes, source-gap subscription controls/focus and Cancel cleanup that changes the Controller before focus restoration.

Two independent new-fixture corrections were retained transparently. The first 40-probe run reported 38 passes and two failures because those new probes called a nonexistent `document.dispatch`. Switching to the model's actual listeners allowed a combined run of 299/301, whose two failures came from trying to focus the old background search field while it was inert behind the modal. The corrected probes create a new non-inert external input after opening, first assert that focus really moved, then verify that Cancel preserves it. Only the new independent fixture changed; production and old tests/helpers stayed frozen. These failures are not product regressions.

Independent static review separately confirmed **1,466/1,467 original tracked files unchanged**, **417/417 protected files unchanged**, and all View bytes outside `reuseTask` identical. Its View/new-test hashes match the implementation audit's hashes above. The larger implementation protected list separately retains all 493 original hashes.

Python verification passed **84/84** in **1.785 seconds**. Runtime build and verification passed with **133 files**, **4,032,236 source bytes** and archive SHA-256 `0fe0d4882049f8c8478bc605f494be6a43a12638e45e0e2bb05f53aad3a40ea5`. Tests and validation documents do not enter the runtime package. This is static package verification, not a browser run.

Independent combined report SHA-256: `9132202a6def372191a6d62b2f633445d922dad91c70f4cf8d3c105b173552d9`.

## Final 53-file focused check

The final broader focused check passed **5,571/5,571 tests**, **0 failures, cancellations or skips**, exit **0**, duration **72,155.1777 ms**. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the 53 explicit paths below. The expanded command, full report, exit status and complete path list were retained. All 54 View/test hashes matched before and after execution.

Both changed JavaScript files then passed `node --max-old-space-size=512 --check`, each exit **0**. `git diff --check` passed. No local full-suite, scale command or test glob was used. No original test/helper changed; the first green candidate View and 156-test source remained frozen throughout independent and final checks.

Final report SHA-256: `c1dcbd193dc59f2255550f0f57c32ad26b011ee21e0b5f827378163f8d85438e`.

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
- `tests/local-tasks-reuse-source.test.js`

These local checks do not establish exact-source full CI, the remote commit or publication. The delivery owner verifies those separately.

## Limits

The DOM/event model is not native Chrome, a screenshot, native keyboard/IME timing or screen-reader evidence. The line-ending normalization control models the HTML textarea value behavior; it does not claim native event timing. Existing browser/screenshots remain evidence for their original source versions only.

All data and failures are synthetic. No user device, paid platform, permission expansion, local full-suite or scale command, branch, tag, Release or Chrome Web Store publication was used for this implementation. The `1.1.155` manifest and existing Release/browser/screenshot evidence remain frozen.

This change does not add a durable draft store, extend the bounded receipt history, change transaction verification, or promise receipt acknowledgement after a later incompatible committed command. Existing receipt/CAS rules may return CONFLICT in that situation, leaving the draft for an explicit next decision.
