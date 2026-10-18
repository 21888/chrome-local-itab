# Tasks ordinary Complete source ownership

Date: 2026-10-18 UTC. Baseline commit `d7b7a736b5c75590171959ad6de8fecf9406d041`; baseline tree `a23cd1adcd2d617245a352f8b8069396335140da`. Manifest stays `1.1.155`.

## Measured baseline reproduction

The independent `tests/local-tasks-complete-ownership.test.js` uses the actual Store, Controller and View with the unchanged shared DOM model. Tasks and storage are synthetic. Workspace object/ID/generation changes select independent storage initialized with identical records. Store/backend replacement probes retain the same original workspace object and session while changing the independent data destination; a session mismatch cannot hide a missing Store/backend boundary.

The first bounded pre-production RED window ran **29 tests: 5 passed, 24 failed, 0 skipped**, exit **1**, duration **614.970926 ms**. All tracked source hashes remained unchanged. Positive controls included ordinary filtered completion with an independent quick-entry IME draft, pinned-row completion, latest receipt acknowledgement without another write, later receipt conflict without another write, and uncommitted Retry merging unrelated edit/order/pin changes.

Actual baseline I/O failures included:

- Replacing a source before the first asynchronous row render, replacing workspace object/ID/generation/session followed by a redraw, or perfectly reinserting an entire old row added **3 reads, 1 request and 1 write**.
- Replacing Store/backend with independent data sharing the original workspace identity added **3 foreign reads and 1 foreign write** for both original and redrawn rows. Replacing only backend created the request on the old Store; replacing Store created it on the foreign Store.
- Original READ/false/dropped/uncertain-acknowledgement Retry crossed a replacement workspace with **2 reads and 1 write**. Original uncertain-acknowledgement Retry crossed an independent Store/backend with **3 foreign reads and 1 foreign write**.
- Unknown READ/false/dropped completion accepted an old row callback, creating **1 new request, 2 reads and 1 write**. Unknown acknowledged completion also accepted the old callback, creating **1 new request and 2 reads**, although task CAS prevented another write. This was an incorrect replacement command, not a replay of the original receipt.

The baseline late-layout probe failed because the old handler did **not invoke layout inspection**. No late mutation fired in that test, so it is not evidence of an observed post-layout cross-source write. Post-layout source/text/DOM changes are separate regression probes for the new guard.

The immutable first RED suite SHA-256 is `24c08a9579f6062a2656d73a4c2af8071dec022352555cb3f4592267eb883e07`; complete first RED log SHA-256 is `102780a6e5d2016d4f1e43968649fadb1999389ed775fdcd39e4797167cd5208`. A launch wrapper initially failed because `/usr/bin/time` was absent, before Node ran; that exit-127 launch record is retained separately. The single actual RED execution used the shell's timer.

## Scoped implementation

Only the ACTIVE ordinary row's `○` Complete selection gains dedicated construction ownership, current-selection/visibility helpers, a row generation and a `kind === 'complete'` original Retry source gate. The original DONE `↶` handler remains unchanged. The four movement paths, Pin next/Unpin paths, Next up `completePinned`, remove, restore, batch operations, Undo implementation, Store, Controller, schema, receipts, import/recovery/export, locales, manifest and CI remain protected.

Before the first asynchronous read, the View captures its original Controller, Store, backend, workspace object/ID/generation, session, host, list, filter input and mounted ancestor relationships. Each active row captures its full task snapshot, filter, exact title and button nodes, translated Complete title/aria-label, `○` action dataset, and independent generation. Redrawing cannot adopt another source. A complete old row cannot regain authority by being reinserted.

Activation rejects prevented, repeated, IME-tail or foreign-target events. It checks original visible text, exact nodes, button semantics, ancestry, active state, filter, availability and unresolved work, inspects actual layout, then repeats all non-layout DOM/source/state/generation checks after the last layout observation. Unknown READ/WRITE/VERIFY completion keeps its original Retry and cannot be superseded by another active-row choice. A genuine Store CAS conflict still refreshes and permits a new explicit choice from the current row; the View never fabricates a Controller failure or success.

Current filtered rows remain legitimate choices. Independent quick-entry drafts and their IME do not block completion. Ordinary completion retains its original task-version/active-state CAS; it adds no revision, order or expected-pin precondition. Unrelated edits, ordering and independent pin changes remain compatible.

Original complete Retry checks its construction source and reuses the exact original command, operation ID and task CAS. Row rebuilds, filtering and unrelated changes do not turn Retry into a new command. The existing Store decides whether the latest receipt confirms with zero new writes, a later receipt conflicts, or an uncommitted operation can merge. Returning to the original available source preserves legitimate Retry. Null/undefined no-workspace sources and anonymous availability objects retain the same narrow compatibility branch as Pin next/Unpin; identified or partially identified workspace sources cannot acquire a missing/wrong session.

This gate applies only to `kind === 'complete'`. Undo remains `reopen`; DONE `↶`, `completePinned`, batch and unrelated commands do not acquire this new ownership policy. In particular, an acknowledged save can show a DONE row, and this change does not claim to protect that row's independent Reopen action.

## Preserved Undo/editor test purpose

The old `completion Undo reopens exact identity, keeps draft/filter/focus and newer pin` test opened an editor first, then directly dispatched a click on the now-inert background Complete row. For ordinary completion this contradicts the required rejection of new background choices. Its purpose, preserving a newer editor's draft/focus during completion and Undo, remains important.

With that old test file unchanged and the new production guard present, the authorized four-case window ran **4 tests: 2 passed, 2 failed, 0 skipped**, exit **1**, duration **141.780124 ms**. Both `pinned=false` language cases failed at the original `undo.id` assertion because Undo remained null; both `pinned=true` Next up cases passed unchanged. This old window did not instrument requests/reads/writes and therefore is not itself the zero-I/O proof.

The original old-test SHA-256 is `6cebd66585331579c31258cc176252024a349a71a4c12b71e38bf392b86e7b4d`. Its complete retained failure log SHA-256 is `a5076cac76dbf05a7a0eab095f6547ee0ed6094182c106400ae5146be8c84ad1`.

After explicit review, only the two ordinary-completion branches are adjusted: activate the visible original row, pause its real backend write, open the independent editor, enter a draft and focus it, then release the already-started write. All original Undo, draft, filter, focus, exact-version and newer-pin assertions remain. The `pinned=true` activation sequence is unchanged. No Controller outcome is fabricated. The new independent suite separately asserts that activating `○` after the actual editor becomes open/inert performs zero requests/reads/writes and preserves editor draft/focus, Controller status/error/Retry and Undo.

## Verification

The authorized focused GREEN window passed **2,258/2,258 tests**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **29,673.976352 ms**. This comprises **243 new ordinary-completion probes + 2,015 existing regression tests**. The original 29 RED probes all pass. Syntax checks for the View, new completion suite and existing completion-Undo suite each exited 0. There was one actual focused GREEN execution; retained failed RED/old-contract windows are not counted as successful checks.

Passing counts by file:

- `local-tasks-batch-store.test.js`: 22
- `local-tasks-boundary.test.js`: 3
- `local-tasks-complete-batch-store.test.js`: 32
- `local-tasks-complete-batch-view.test.js`: 41
- `local-tasks-complete-ownership.test.js`: 243
- `local-tasks-completion-undo.test.js`: 26
- `local-tasks-copy-visible.test.js`: 104
- `local-tasks-edit-return-focus.test.js`: 45
- `local-tasks-move-first-ownership.test.js`: 173
- `local-tasks-move-first-store.test.js`: 22
- `local-tasks-move-first-view.test.js`: 16
- `local-tasks-move-last-ownership.test.js`: 217
- `local-tasks-move-last-store.test.js`: 50
- `local-tasks-move-last-view.test.js`: 103
- `local-tasks-pin-ownership.test.js`: 576
- `local-tasks-pinned-completion.test.js`: 27
- `local-tasks-step-move-ownership.test.js`: 474
- `local-tasks-store.test.js`: 18
- `local-tasks-view.test.js`: 66

The bounded run used `--max-old-space-size=512 --test --test-concurrency=1` and explicitly named nineteen files. No local full-suite or scale run was performed. The old Undo purpose is now verified using a genuine delayed write: the late result preserves the newer editor's draft/focus and all original Undo assertions. The separate actual-editor/inert-background negative proves zero requests, reads and writes with unchanged editor, Controller, Retry and Undo.

The independent final-layout cases mutate at the second document-root computed-style lookup, the last layout read along the original action and title paths. They verify the final non-layout fence rejects changed text, title/action/main nodes, labels/datasets, row ID, ancestry, filter, state, generation and construction source before request creation. These are modeled adversarial getter probes, not evidence about browser event-loop interleavings.

Complete GREEN log SHA-256: `e66f69340c54f68790f4dd79e8ed5eabf87bb82d40c60700534c71931efd2b91`.

Verified production SHA-256: `3bbd6c3403bc8c7357c9c4e4b33f160442685d345d228489c66e980e896eb3f8`.

Verified new-test SHA-256: `953982d952f5db8b9f5a59cd5bfa676f8cf6a1ff327dba5b7904ed3389a5a643`.

Verified adjusted completion-Undo test SHA-256: `c382a9b7eb0b63c7e704e0a96c6955a8c3bf1fa64345b3a02f721a21f2bd6d8d`.

Static protection checks show only the authorized View additions and scoped Undo-test setup affect tracked files. Every byte outside that old-test setup is unchanged, including all original follow-on assertions. Every original View line remains unchanged except the one conditional split separating ACTIVE from the retained original DONE branch; new constructor/helpers/Retry/generation code is inserted separately. Movement, pin, Next up and Undo method bodies are unchanged. All other tracked source/tests/helpers remain unchanged. The owner's subsequent independent review passed **60/60 probes**, **0 failed**, duration **760.035 ms**, including actual inert-background zero-I/O rejection and an already-started delayed completion preserving the newer editor draft/focus. Final local model evidence is **2,258 focused + 60 independent = 2,318 passing checks**, excluding the retained failed reproduction windows.

Owner Python checks passed **84/84** in **1.776 seconds**. Runtime packaging and verification covered **133 files**; package SHA-256 is `641ee614423bf895e45877f73e83a9fd58dcff9300758f03e9d6e3333693852c`. This describes the verified working-tree package, not native-browser or remote CI success.

The owner's independent protection check found **400 of 401 protected files** byte-for-byte unchanged. The sole exception is the expressly reviewed ordinary-completion Undo setup; all other bytes of that test remain unchanged. Of **1,443 tracked baseline files**, the other **1,441** remain unchanged. The `pinned=true` test activation sequence and protected `completePinned` production behavior remain unchanged. Exact-source remote CI remains the integration gate; this document does not claim it has passed.

## Limits

This is synthetic Store/Controller/DOM-model evidence, not native Chrome, real keyboard/IME timing, screen-reader or visual-layout validation. It cannot cancel a write already dispatched before later departure. No screenshot, user device, paid platform, permission expansion, tag, Release, Chrome Web Store submission or manifest bump is included. `1.1.155` remains frozen; this guard does not establish that the historical real-upgrade data-loss incident is resolved.
