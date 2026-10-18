# Tasks DONE-row Reopen source ownership

Date: 2026-10-18 UTC. Baseline commit `1c35d13b1871346ecabf8dc593d42570088e7051`; tree `5e13761838fbdb8b62be87b4c856661d5ba16322`. Manifest remains `1.1.155`.

## Measured baseline reproduction

The new `tests/local-tasks-reopen-ownership.test.js` uses the real Store, Controller and View with the unchanged shared synthetic DOM model. Each workspace object/ID/generation selects independent synthetic storage with identical initial records. The Store/backend replacement probes retain the original workspace object and matching session while selecting independent data, so a session mismatch cannot conceal a missing backend boundary.

The first bounded RED window ran before production changes: **25 tests, 4 passed, 21 failed, 0 skipped**, exit **1**, **558.9604 ms**. All **1,445 tracked files** retained their initial hashes. The plain/filtered current-row controls and two original Undo controls passed. The Undo controls include real delayed failed writes and an earlier successful row Reopen followed by completion and Undo of another task.

Measured failures:

- Changing source before the first asynchronous row render, changing workspace object/ID/generation/session followed by a redraw, or reinserting an entire stale row added **3 reads, 1 request and 1 write**.
- Independent Store/backend replacements sharing the same workspace added **3 foreign reads and 1 foreign write**, for both original and redrawn rows. Backend replacement created the command on the original Store; Store replacement created it on the foreign Store.
- Original READ/false/drop/uncertain-ack Retry crossed a replacement workspace with **2 reads and 1 write**. Uncertain-ack Retry crossed an independent Store/backend with **3 foreign reads and 1 foreign write**.
- Unresolved READ/false/drop accepted an old row callback with **1 new request, 2 reads and 1 write**. An unknown acknowledged reopen accepted the old callback with **1 new request and 2 reads**; the task CAS prevented another write, but the new command replaced the original Retry with a conflict.

The baseline reproduction did not include a late-layout mutation claim. Final-layout mutations below are regression probes of the new guard, not an observed baseline interleaving. These are modeled getter hooks, not native browser scheduling evidence.

Frozen first RED suite SHA-256: `559afa4a3ea07194dbd4a1df1d3e6400da1a643485d76b01bb5c649d4b11cf35`.

Complete first RED log SHA-256: `891a6ff7d9411d55e5035ad5493d3168ec762b1e112a77769d7f80e234c7cbdd`.

## Scoped implementation

Only the DONE row's `↶` selection gains dedicated `rowReopenOwner`, `rowReopenGeneration`, exact `rowReopenAttempt` command ownership and eligibility/visibility checks. Constructor ownership is captured before the first asynchronous read: Controller, Store, backend, workspace object/ID/generation, session, host, completed section object/box/summary/list, filter/input and original ancestor relationships.

A row captures its exact DONE snapshot, text/title/action/main nodes, translated label, aria-label, `↶` dataset, filter and generation. New activation requires the current open and visible completed section, a matching filter, the original visible DONE text and `is-done` class, exact node/ancestor identities and an unchanged saved snapshot. It checks non-layout eligibility, inspects layout, then repeats the entire non-layout check after the final layout observation. Fresh redraws cannot adopt replacement sources, and reinserting an entire stale row cannot revive its callback.

Repeated, prevented, composing/IME-tail and foreign-target events are rejected. Unknown READ/WRITE/VERIFY or pending operations cannot be superseded by a new row choice. Genuine Store CAS conflict still refreshes and permits a new explicit action on the current DONE row. Independent quick-entry drafts and IME stay usable. No revision, active-order or pin condition is added to Store's task-version/DONE CAS.

The original Retry source gate applies only when `controller.retryCommand === rowReopenAttempt.command`. It does not gate all `kind === 'reopen'` commands. Completion Undo also creates `reopen`; its original implementation, pending/failure behavior, Retry and success effect remain independent, even after an earlier successful row attempt left its own stored command identity.

Row Retry preserves its original command, operation ID and task CAS. It does not rebuild from a current row, require current row visibility or an open section, or reinterpret the original receipt. The unchanged Store determines latest receipt acknowledgement with zero new writes, later-receipt conflict, and merging an uncommitted operation with unrelated edits/order/pin. Returning to the original source allows Retry. Null/undefined no-workspace and original anonymous availability retain narrow compatibility; identified or partially identified workspaces cannot adopt absent/wrong sessions.

## Verification

The single authorized focused GREEN window passed **2,859/2,859 tests**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, **37,014.252099 ms**. This includes **268 new row-Reopen probes and 2,591 existing regression tests**. All original 25 RED probes pass, including the four original positive controls. Syntax checks of the View and new test each exited **0**. The tested production/test files exactly match the retained GREEN snapshots.

The run used `--max-old-space-size=512 --test --test-concurrency=1` with exactly 25 named files, without a wildcard:

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

The new probes cover unchanged original Undo Retry after delayed READ/WRITE/VERIFY/ack failures and after an earlier row attempt; latest receipt confirmation while the completed section is collapsed and filtering hides its row; later-receipt conflict; uncommitted Retry merging unrelated edit/order/pin; real task CAS conflict followed by an explicit current-row choice; translated labels; exact duplicate-text identities; invalid activation events; actual editor/inert background; original nullish and anonymous availability compatibility; and source/task/DOM changes at the second document-root computed-style lookup, the final original-title ancestry layout observation. Every rejected new choice asserts zero requests/reads/writes.

Complete GREEN log SHA-256: `eb6464be46883d7e46d4096436426f57153f401e0157bae38535ca9c89d029a7`.

Verified production SHA-256: `3c1af7eac6e2ccf5ba2d3434302cc0ca700697c0cbb842cd62655d6659111b3e`.

Verified new-test SHA-256: `9bdc3dfaf962094fcff14fc37b061f8b4696e9772b40fdd3c91869dc29f96f1c`.

Static protection checks found **1,444 of 1,445 tracked baseline files unchanged**. The only modified tracked file is the View. Its diff consists of four insertion regions and replacement of the old six-line DONE action branch. The ACTIVE `○` branch and existing complete source helpers, all movement and pin helpers, `perform`, `undoLast`, `rememberUndo`, `renderNext`, `performPinned`, batch transition and restoration method bodies are byte-for-byte unchanged. All existing tests/helpers, Store, Controller, locales, manifest, CI, schema, receipts and import/recovery/export remain unchanged. `git diff --check` passes.

The owner's independent review passed **68/68 probes**, **0 failed**, in **934.992 ms**, including original receipt acknowledgement with the completed section collapsed, a different DONE row being unable to replace an uncertain attempt, and an earlier row attempt not intercepting a later real Undo failure/Retry of the same command kind. Combined local model evidence is **2,859 focused + 68 independent = 2,927 passing checks**, excluding the retained RED failures.

Owner Python checks passed **84/84** in **1.749 seconds**. Runtime packaging and verification covered **133 files**; package SHA-256 is `8770d7fa9e04a7db3607fe526d5e6119709ce2ad2b89b6b797131c4f12f5034d`. These results describe the verified candidate, not native-browser or remote CI success.

The owner independently confirmed **402/402 protected files** unchanged and **1,444/1,445 baseline tracked files** unchanged. The single changed tracked file is the narrowly scoped View; the new suite and this validation document are additions. No existing test required adjustment. Exact-source remote CI remains the integration gate; this document does not claim it has passed.

## Limits

These are synthetic Store/Controller/DOM-model checks, not native Chrome, real keyboard/IME timing, screen-reader or visual QA. A guard cannot cancel a write already dispatched before later departure. No local full-suite or scale run, screenshot, user device, paid platform, permission expansion, tag, Release, Chrome Web Store submission or manifest bump is included in this work. The frozen `1.1.155` release is unchanged. This synthetic boundary fix does not establish that the historical real-upgrade data-loss incident is resolved.
