# Tasks Next up completion source ownership

Date: 2026-10-18 UTC. Baseline commit `d1daf37b315a5e2fdefb74ffe3f09f1a1ea8d3a9`; baseline tree `264889183ca18534195232dcdea3d7c2f4266309`. Manifest remains `1.1.155`.

## First bounded pre-production reproduction

The independent `tests/local-tasks-next-ownership.test.js` uses the actual Store, Controller and View with the unchanged shared DOM model. All task text and storage are synthetic. Different workspace object/ID/generation combinations have independently initialized storage. Replacement Store/backend probes preserve the exact original workspace object and matching session, while using distinct real backend data.

The first run executed **30 tests: 8 passed, 22 failed, 0 cancelled, 0 skipped**, exit **1**, duration **594.184131 ms**. It used exactly:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-next-ownership.test.js
```

There was one actual Node execution. All **1,447 tracked baseline file hashes** were unchanged afterward, including production, old tests, helpers, locales, manifest and CI. The new suite and this document are the only additions at this stage. No syntax, full-suite, scale or browser run is included.

Measured failures:

- A replacement source before the first asynchronous render, or a freshly rendered Next up after replacing the workspace object/ID/generation/session, added **1 request, 3 reads and 1 write**.
- Independent backend/store replacement with the same original workspace and session added **3 foreign reads and 1 foreign write**, for both old and fresh controls. Replacing backend created the request on the original Store; replacing Store created it on the foreign Store.
- Replacing Controller and rendering a fresh control added **1 request, 4 reads and 1 write**. Two Controllers subscribed to the same backend in this probe account for the extra notification read.
- Reinserting an entire old Next up subtree after a replacement subtree had rendered added **1 request, 3 reads and 1 write**. This adversarial probe deliberately restores the mutable View node/action/task references too; it checks that these references alone cannot restore retired authority. It does not model an unnoticed detach-and-reattach or claim MutationObserver evidence.
- Original READ, false-write, dropped-write and uncertain-acknowledgement Retry crossed a replacement workspace with **2 reads and 1 write**. Original uncertain-acknowledgement Retry crossed an independent backend/store with **3 foreign reads and 1 foreign write**. All six lost the pending original Retry after writing the foreign destination.
- An old control after unknown READ, false-write or dropped-write created a replacement command with **1 request, 2 reads and 1 write**. After uncertain acknowledgement it created **1 request and 2 reads**, but the original task CAS prevented a second write. It still replaced the original command/error, so this is a command-ownership defect rather than a successful replay.
- An identified workspace with a missing session still accepted Next up with **1 request, 3 reads and 1 write**.

The unknown-command tests also activate a different newly pinned control after the old control. That second measurement is not independent evidence that a fresh control displaces an intact original Retry: the first baseline activation has already replaced it. A later isolated probe must activate the fresh pinned control without first exercising the old callback.

Passing controls preserve current exact duplicate-text identity, Next up outside the collapsed list, the unchanged button across filtering/unrelated revisions, completion Undo, independent drafts/focus, and null/undefined/anonymous legacy availability. The Store's original latest-receipt Retry uses **1 read, 0 requests and 0 writes**; a later receipt conflicts with **2 reads and 0 writes**. An uncommitted exact Retry merges unrelated text/order changes with **2 reads and 1 write**, while a changed pin conflicts with **2 reads and 0 writes**, even though pin changes leave the original task version untouched. An already-started delayed write preserves a subsequently opened editor draft/focus and the original completion Undo.

First-suite SHA-256: `193571eb89bd54fd6cb569baafa62bc0a274cdea313e170397b792f5b8f63772`.

Complete first RED log SHA-256: `0a836a53138d83df4698eef0a9cb54be725aadc4a054d8c238fb508ef432e078`.

Unchanged baseline View SHA-256: `3c1af7eac6e2ccf5ba2d3434302cc0ca700697c0cbb842cd62655d6659111b3e`.

## Scoped implementation

The boundary is dedicated to Next up `completePinned`. Before the first asynchronous read, the View captures original Controller, Store, backend, workspace object/ID/generation, session, host, Next up container and mounted ancestor relationships. Each genuine Next up lifecycle owns exact text/button nodes, the full task snapshot, translated text/aria semantics and expected pin. An unchanged Next up remains valid across filters and unrelated row renders. Replacing its lifecycle retires the old selection even if mutable View references and original visible nodes are restored. No global row generation is used.

New activation rejects cancelled, repeated, composition-tail and foreign-target events; changed text/labels/aria/disabled semantics; hidden/inert/detached/replaced nodes; changed ancestry/source; inactive or edited task snapshots; and unresolved command ownership. It checks current selection without layout reads, inspects layout/visibility, then repeats every non-layout source/text/state check before command construction. The final-layout regression probes mutate at the second document-root computed-style lookup, the last modeled observation for the action and text paths. Their test explicitly requires that getter to execute before asserting zero I/O. The pre-production RED run did not measure a layout getter and supplies no post-layout evidence.

Original Retry accepts only the exact issued command object and construction source, even after its original button disappears. It never recreates the command from a current task, pin or row. The unchanged Store decides latest-receipt acknowledgement, later-receipt conflict and uncommitted retry with locked `expectedPin` plus task-version/active-state CAS. Returning to the original source can resume a legitimate exact Retry. The null/undefined no-workspace and anonymous legacy availability branches match the narrow existing row ownership compatibility; identified and partially identified workspaces require their matching session.

All row completion/reopen/pin/movement/remove/restore, Undo and batch production bodies remain protected. Store, Controller, schema, receipts, recovery, export, locales, manifest, CI and shared test helpers remain unchanged. The entire existing `performPinned` focus lease is byte-for-byte unchanged: only a still-owned action with the original adjacent revision/receipt may return focus to quick entry; newer editor or focus ownership wins.

## Original editor/Undo contract reproduction

After the new production entry guard was present, the two old test files were run unchanged using the specifically bounded name pattern for `completion Undo reopens exact identity` and `filter, expansion, order, drafts and open sections survive pinned completion`.

The run measured **5 tests: 2 passed, 3 failed, 0 cancelled, 0 skipped**, exit **1**, duration **247.788464 ms**. Both ordinary-row `pinned=false` language cases passed. Both `pinned=true` language cases failed at the original `undo.id` access because the newer open/inert editor prevented the new background completion. The filter/editor test executed its `expanded=false` loop successfully, then failed in `expanded=true` at the original expected active count (**6 instead of 5**). The collapsed branch did not originally assert target completion, so its old assertions could pass even when no completion occurred. This is one failing test with two executed loop branches, not two independently failing expanded cases. This old-test window did not instrument I/O and is not itself the zero-I/O proof.

The measured old-test snapshots are retained. Original completion-Undo SHA-256: `c382a9b7eb0b63c7e704e0a96c6955a8c3bf1fa64345b3a02f721a21f2bd6d8d`. Original pinned-completion SHA-256: `00ade783d05de261435cb1bf64fbcb05bb8ad459ae201b6457b9bdd4ed9b695b`.

Following explicit review, only the authorized setup sequences change. Both pinned Undo language cases and each expanded filter/editor branch now start the real visible Next up write, pause the actual backend write, assert exactly one issued write plus `saving`/pending, then open/focus the independent editor and release the already-started write. Every original follow-on assertion remains. Both expanded branches additionally verify the exact pinned target is done and only one completion write was issued. A separate new probe opens the actual editor first and requires a background Next up click to perform zero requests/reads/writes while preserving editor draft/focus, Controller state/status/error/Retry and Undo.

## Independent review finding: genuine conflict renewal

An independent real UI/Store probe found a defect in the first guarded implementation: an unrelated active row's Move to list start action reached an actual stale-version Store conflict, while the pinned task retained its original ID/version. The unconditional unchanged-Next up fast path retained the old selection's null conflict identity, so it could not expose a renewed deliberate choice.

The retained independent reproduction measured **1 test, 0 passed, 1 failed**, exit **1**, duration **116.159534 ms**. It passed the real Store `CONFLICT`, zero-write and unchanged-data assertions, then failed because the current Next up control was still the old node. It did not reach the later new-control activation assertions, so that run is not evidence about a subsequent click.

The corrected fast path renews Next up only when a new real `CONFLICT` Retry command identity is observed. It invalidates the retired control and captures the new reviewed conflict. Ordinary filtering/unrelated updates and repeated observation of that same conflict keep the existing control. Clearing the old error to start saving also keeps the control and its original focus lease. The repository regression uses an actual remote task edit, stale visible Move to list start click and real Store conflict, then checks old-control rejection, new-control usability, ordinary redraw stability and delayed-save focus ownership. No Controller outcome is fabricated in that regression.

## Verification

The single authorized focused GREEN window passed **3,067/3,067 tests**, comprising **208 new Next up probes and 2,859 existing regression tests**. There were **0 failures, 0 cancellations and 0 skips**, exit **0**, duration **38,052.959035 ms**. All original 30 RED cases pass. Four syntax checks, for the View, new suite and two adjusted old fixture files, each exited **0**. Source/test hashes match their retained pre-run snapshots exactly.

The run used `--max-old-space-size=512 --test --test-concurrency=1` with exactly these 26 files, without a wildcard:

- `local-tasks-reopen-ownership.test.js`
- `local-tasks-batch-store.test.js`
- `local-tasks-boundary.test.js`
- `local-tasks-complete-batch-store.test.js`
- `local-tasks-complete-batch-view.test.js`
- `local-tasks-complete-ownership.test.js`
- `local-tasks-completion-undo.test.js`
- `local-tasks-copy-visible.test.js`
- `local-tasks-edit-return-focus.test.js`
- `local-tasks-move-first-ownership.test.js`
- `local-tasks-move-first-store.test.js`
- `local-tasks-move-first-view.test.js`
- `local-tasks-move-last-ownership.test.js`
- `local-tasks-move-last-store.test.js`
- `local-tasks-move-last-view.test.js`
- `local-tasks-pin-ownership.test.js`
- `local-tasks-pinned-completion.test.js`
- `local-tasks-step-move-ownership.test.js`
- `local-tasks-store.test.js`
- `local-tasks-view.test.js`
- `local-tasks-reopen-batch-store.test.js`
- `local-tasks-reopen-batch-view.test.js`
- `local-tasks-restore-batch-store.test.js`
- `local-tasks-restore-batch-view.test.js`
- `local-tasks-copy-completed.test.js`
- `local-tasks-next-ownership.test.js`

The new isolated unknown-command fixtures preserve the original pending command before activating a different pinned task. All four READ/false/drop/ack failure modes are checked with and without storage notifications. The new pin cannot replace the original command or error; a later exact Retry is resolved solely by the Store's original receipt/pin CAS. This separately closes the evidence limitation in the combined first RED probes.

The actual-editor negative passes with zero requests/reads/writes and unchanged editor/Controller/Retry/Undo. Both adjusted expanded filter/editor branches verify target completion and a unique real completion write. Final-layout probes explicitly observe the final getter and reject late source/DOM/text/state changes before request construction. The real unrelated Move to list start conflict regression renews Next up once, retires the old control and preserves the new control during filtering, unrelated updates and the transition into saving.

Static protection checks show the View is byte-identical outside the authorized constructor source/Retry events, completePinned Retry gate, dedicated Next up helpers and renderNext regions. The entire original `performPinned` body is unchanged. Every original assertion line in both adjusted old files is retained. Of **1,447 baseline tracked files**, **1,444 remain unchanged**; the only three modifications are the scoped View and two authorized fixture setups. The new suite and this document are additions. `git diff --check` passes.

Complete focused GREEN log SHA-256: `a5123a55b94e0d6bddc63933c9aef43852b41f8da719d9e07101bf63c72cfefc`.

Verified View SHA-256: `8bb40f57ddfde8093d7f2c9539e19e5f8e2f851f737a0656e4326f2e4f2c38d2`.

Verified new suite SHA-256: `be74de8b923706b9ba6f935b29afefdd28536f748386db85ecf65f0c81a056a5`.

Verified completion-Undo fixture SHA-256: `0eddeba5a5b29d0e71a58b6b0b3fd9f6e6a24ed0c82fd1c235553ad617c080cb`.

Verified pinned-completion fixture SHA-256: `fc17b52de7a134700acfc0adc10dccd644aecc583a0da7a0a3dbcd3c21712092`.

The owner's independent final review passed **41/41 probes**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **538.762748 ms**. It includes the corrected genuine-conflict renewal boundary after the separately retained **1-test/1-failure** reproduction above. Combined local model evidence is **3,067 focused + 41 independent = 3,108 passing checks**. The earlier failure proved the old same-ID/version fast path retained the retired control after a real Store conflict; the fix renews only a newly observed genuine conflict identity and preserves ordinary redraw/saving focus ownership.

Owner Python checks passed **84/84** in **1.767 seconds**. Runtime packaging and verification covered **133 files**; runtime package SHA-256: `0f363b045de8fa8ae9163edd7eb2c53b7235ba662672991959d04af5bd02f23a`. These are verified candidate/model results, not native-browser validation or remote CI results.

Independent protection verification confirmed **401 of 403 protected baseline files** byte-for-byte unchanged; the only two exceptions are the explicitly authorized old test setups. Of **1,447 tracked baseline files**, the other **1,444** are unchanged apart from the scoped View and those two tests. Bytes outside the designated old cases remain unchanged, all original assertions are retained, and the full `performPinned` method remains byte-identical.

The failed pre-production, old-contract and independent conflict windows remain retained reproduction evidence and are not counted as successful verification. Exact-source remote CI remains a separate integration gate; this document does not claim it has passed.

## Limits

This is synthetic Store/Controller/DOM-model evidence, not native Chrome, native keyboard/IME timing, accessibility or visual-layout validation. No screenshot, user device, paid platform, permission expansion, tag, Release or Chrome Web Store submission is included. Manifest `1.1.155` remains frozen. This work does not establish that the historical real-upgrade data-loss incident is resolved.
