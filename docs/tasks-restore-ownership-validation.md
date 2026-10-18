# Tasks REMOVED-row Restore source ownership

Date: 2026-10-18 UTC. Baseline commit `d9869fdb7935fcd9d3426dfe7c3f12cc5a189af3`; tree `19bfb098002810c055e6b9ab651365f881928c30`. Manifest remains `1.1.155`.

## Measured pre-production reproduction

The new `tests/local-tasks-restore-ownership.test.js` uses the real Store, Controller and View with the unchanged shared synthetic DOM model. All data is synthetic. Independently initialized storage is selected by workspace object, ID and generation. Backend/Store replacement retains the original workspace object and matching session but uses independent storage; a session mismatch therefore cannot hide a missing backend boundary. Unknown-command probes use separate fixtures for an old control and a different newly rendered control, leaving the original command intact before each attempted replacement.

The single bounded RED run measured **45 tests: 3 passed, 42 failed, 0 cancelled, 0 skipped**, exit **1**, duration **989.702993 ms**. Exactly one Node process executed `node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-restore-ownership.test.js`. All **1,451 tracked baseline files** retained their initial SHA-256 hashes throughout RED. The original View, complete tracked hashes, immutable first suite, complete first log and exit status were preserved outside the checkout before production edits.

Measured failures, independently exercised for removedFrom ACTIVE and DONE:

- Changing construction source before first asynchronous rendering, source object/ID/generation/session followed by fresh rendering, reinserting an entire retired row, and activating inside a closed Removed section each added **1 request, 3 reads and 1 write**.
- Independent backend/Store replacement sharing the original workspace added **3 foreign reads and 1 foreign write**. Backend replacement issued **1 request on the original Store**; Store replacement issued **1 request on the foreign Store**.
- Original READ/false-write/dropped-write/uncertain-acknowledgement Retry crossed a replacement workspace with **0 new requests, 2 reads and 1 write**.
- Old controls after unknown READ/false/drop and different newly rendered controls after every unknown mode added **1 new request, 2 reads and 1 write**, displacing the original command. An old control after unknown acknowledgement added **1 new request, 2 reads and 0 writes**; task CAS stopped another write, but the original receipt was replaced by a conflict.

Passing controls verified visible Restore to each original destination, unchanged original text/other records/recovery/pin, and independent quick-entry draft/IME/focus. A genuine original Remove Undo control passed all four failure modes for both destinations after an earlier successful row Restore. Its same-kind `restore` command and success callback retained their own Retry behavior.

First RED suite SHA-256: `fba1e34cd90abca3741e67575b659edb8ab1e7fc50e939d06d692e47a9991c01`.

Complete RED log SHA-256: `652b89ab5bf7a8c79eec26df4af71d80857a794f1782fa7f4c28559aca04224b`.

The baseline reproduction did not contain a final-layout mutation probe. Later modeled getter hooks are regression coverage, not a claim that this interleaving was measured on the baseline.

## Scoped implementation

Direct row Restore captures its construction Controller, Store, backend, workspace object/ID/generation, session, host, Removed section object/box/summary/list, filter/input and original ancestry before the first asynchronous read. Each displayed choice retains the exact removed snapshot including text, removedFrom, version and timestamps, title/main/action/parent identities, direct Copy/Reuse/Restore order, normalized filter and a private WeakMap render-lifecycle token. Reattaching old nodes and restoring mutable View references cannot revive a retired choice.

A new action requires the original open, visible Removed section and actual displayed original. It checks all non-layout source/state/DOM boundaries, observes action/title layout, then repeats all non-layout checks after the final layout lookup. Repeated, prevented, composing/IME-tail and foreign-target events are rejected on the direct Restore action. Pending and unknown-result commands cannot be superseded. A real Store conflict still refreshes and permits a newly reviewed explicit Restore. The new action remains directly after the original Copy and Reuse buttons, with no row details menu.

Retry applies the new source gate only when `controller.retryCommand === rowRestoreAttempt.command`. The gate checks original construction ancestry but does not require a currently displayed row, unchanged filter, or an open Removed section. The exact original command, operation ID, removed-state/task-version CAS and receipt remain authoritative. Original Remove Undo also uses kind `restore`; its callback and Retry remain independent even when an earlier successful row Restore attempt is still saved.

Store alone decides whether latest receipt acknowledgement needs zero writes, a later receipt conflicts, or an uncommitted retry merges unrelated edit/order/pin changes. No broad revision, active-order or pin CAS is introduced. Store still restores removedFrom ACTIVE or DONE, clears removedFrom and never automatically repins. Null/undefined workspace compatibility and same-original anonymous no-ID/no-generation/no-service availability remain; a new anonymous object and identified sources with missing/wrong sessions are rejected.

## Static protection

The candidate modifies only `shared/local-tasks-view.js` among tracked files: **1,450 of 1,451 tracked baseline files remain byte-identical**. The new suite and this document are additions. All old tests and shared helpers, Controller, Store, locales, manifest, schema, recovery, receipts, import/export and workflows remain unchanged.

The View changes only constructor, retryLast, row and render, adding three dedicated Restore helpers and one private lifecycle map. All **66 other existing method bodies** are byte-identical. The original Remove success callback, global Retry listener, Undo methods, existing movement/pin/completion/reopen/Next up and batch implementations are unchanged. The now-unused row-local `run` declaration is the only removed dead code. The original first RED suite remains an exact prefix of the expanded suite. `git diff --check` passes.

Frozen candidate View SHA-256: `afcd48b8ab0db29df7b8d98341770515baba1827e117710d7f1d62d7e19f561d`.

Frozen expanded-suite SHA-256: `e0d4f12493fce15d658534c1878e77964ca0ae9aab44575f6aba8ebf1168de59`.

The expanded matrix covers both restoration destinations; direct action structure; closed/hidden/inert/moved controls; exact saved records; source replacements; retired full rows; valid and invalid events; unknown modes with and without storage notifications; independent old/fresh-other attempts; original/latest/later receipts; uncommitted merging; genuine restore→edit→remove version-conflict renewal; original ancestry restoration while rows remain hidden; translations/duplicate text; compatibility; original Undo callback/Retry after delayed real failures; current editor protection; and a save legitimately started before a newer editor.

Final-layout tests assert the second document-root computed-style getter actually executes, then mutate each relevant source/state/DOM boundary and assert zero requests/reads/writes. These remain synthetic getter hooks, not browser scheduling evidence. Original Undo tests explicitly distinguish the saved earlier row Restore identity from the later same-kind Undo command.

## Final focused GREEN

After independent owner review, the single authorized focused Node window passed **4,257/4,257 tests**, with **0 failures, cancellations or skips**, exit **0**, duration **52,382.682818 ms**. This comprises **537 new Restore probes**, **3,562 existing probes from the preceding 27 named task suites**, and **158 additional existing Copy Removed probes**. All 45 original RED probes now pass. The View and new suite each passed their authorized syntax check, exit **0**. No existing fixture or assertion required adjustment.

The run used `--max-old-space-size=512 --test --test-concurrency=1` and exactly these 29 files, without a wildcard:

- `local-tasks-restore-ownership.test.js`
- `local-tasks-remove-ownership.test.js`
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
- `local-tasks-copy-removed.test.js`

Copy Removed was explicitly added to exercise the existing direct Removed controls beside Restore. Source and new-suite bytes still exactly match the frozen hashes above. Complete focused GREEN log SHA-256: `d14a8928191ce4943c48673dbc55f38b40f324388cf66cf910c9b8f902291d09`.

The owner's independent review passed **80/80 probes**, **0 failures, cancellations or skips**, exit **0**, duration **1,281.872292 ms**, against the same frozen View and new-suite bytes. Combined local model evidence is **4,257 focused + 80 independent = 4,337 passing checks**, excluding retained RED failures.

Owner Python checks passed **84/84**, exit **0**, in **1.757 seconds**. Packaging and verification covered **133 runtime files**, **4,012,499 source bytes**, with ZIP SHA-256 `f25b37053b3510cc6c0d9fb432e9e4fb078a14d07648337e0c2d2939d1c8c62b`. These are separate Python/package results, not native-browser or remote CI evidence.

The owner's independent protection audit confirmed **406/406 protected files byte-identical**, **1,450/1,451 tracked baseline files unchanged**, the same **66 unchanged existing method bodies**, and the entire row non-removed branch byte-identical. `git diff --check` passes. No source or test bytes changed after successful verification. Exact-source remote CI remains a separate owner-controlled integration gate; this document does not claim it has passed.

## Evidence limits

Synthetic Store/Controller/DOM evidence does not establish native Chrome, real keyboard/IME timing, accessibility, visual or screenshot correctness. No browser, user device, paid platform, permission expansion, manifest bump, tag, GitHub Release or Chrome Web Store submission is included. No local full-suite/scale result or final-source remote CI success is claimed. This bounded ownership correction does not establish that historical real-upgrade data loss is fixed. A guard does not cancel a write already dispatched before a later source departure.
