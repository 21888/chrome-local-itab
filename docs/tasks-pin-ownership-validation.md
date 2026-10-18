# Tasks Pin next / Unpin source ownership

Date: 2026-10-18 UTC. Local baseline `9f246e06130089690ed68e4f11dddbe6d5ba9fb0`; baseline tree `01cd4056a17ad85311367f20e2dfcd1390e5a47f`. Manifest remains `1.1.155`.

## Baseline reproduction

The new independent `tests/local-tasks-pin-ownership.test.js` uses real Store, Controller and View implementations with the unchanged shared DOM model. All records, storage and workspace identities are synthetic. Each workspace object/ID/generation selects independent data with identical records. Foreign Store/backend probes retain the exact original workspace object and session while using independent data, so a session mismatch cannot conceal a missing backend boundary.

The authorized pre-production RED window ran **28 tests: 2 passed, 26 failed, 0 skipped**, exit **1**, duration **619.341 ms**. Both positive controls produced exactly one write. Both Pin next and Unpin failed these actual-I/O negative probes:

- A workspace replacement before the first asynchronous row render, or after loading followed by fresh redraw, added **3 reads, 1 request and 1 write**.
- Original and redrawn rows crossed independent Store/backend replacements with the same original workspace identity, adding **3 foreign reads and 1 foreign write**, while original storage stayed unchanged.
- Original READ/false/dropped/uncertain-acknowledgement Retry crossed a replacement workspace, adding **2 reads and 1 write**.
- Uncertain-acknowledgement Retry crossed independent Store/backend data, adding **3 reads and 1 write**.
- Perfect reattachment of a complete stale row after redraw added **3 reads, 1 request and 1 write**.

These are measured storage operations, not merely enabled controls or static analysis. The original handlers performed no layout checks; late-layout injection is post-fix regression coverage, not claimed RED evidence.

The retained RED snapshot SHA-256 is `2640987448e34d99bfcb4f6d36d9f07bf151c4a12a657152912fb11ac5eb0df0`. Complete first RED log SHA-256 is `b2893be8c452e91cbb9437d1a6c54121751abb9d98c1df0734604a94cab90404`.

## Scoped correction

Production changes are confined to row pin/unpin construction ownership, dedicated pin guards and generation, the pin handler and the `kind === 'pin'` original Retry gate. The four movement constructor/helper/handler/Retry/node-chain paths, Next up completion, other command kinds, Store, Controller, schema, receipts, recovery, export, locales, manifest and CI remain unchanged.

`pinOwner` captures the original Controller, Store, backend, workspace identity/ID/generation, session, host/list/filter input, ancestor chain and feedback/status nodes before the first asynchronous read. Each row captures its full task snapshot, original expectedPin, Pin next/Unpin direction and label, original row/title/menu/summary/action nodes and a dedicated render generation. Fresh redraw cannot adopt a replacement source; reattaching all original row nodes cannot renew their generation.

The handler rejects prevented/repeated/IME-tail/foreign-target activation, checks current eligibility, checks original DOM/layout/ancestry and label/pressed semantics, then reacquires current source, saved snapshot and expectedPin after layout. It does not lock the entire active order: unrelated reordering can coexist with pin selection. First and last active positions are valid pin targets.

Filtering is a legitimate way to find a task to pin. A current filtered row remains usable; a stale filter result, mismatched unapplied query, filter IME composition or replaced filter input does not. Quick-entry drafts and their independent IME state remain untouched and do not block saved-row selection.

Unknown READ/WRITE/VERIFY attempts cannot be replaced by a new row choice. Original pin Retry retains the exact command and original expectedPin, checks only its construction source, and delegates receipt/CAS outcomes to the existing Store. A latest acknowledged receipt confirms with zero new writes; a later receipt conflicts without writing; an uncommitted operation can merge an unrelated edit if expectedPin remains unchanged; a changed expectedPin conflicts instead of overwriting the newer pin. A genuine Store CONFLICT still refreshes rows and permits a new explicit current-row selection.

Null/undefined are equivalent for a no-workspace construction source. Anonymous availability objects retain the same narrow compatibility path as the preceding movement fixes: original nullish ID/generation, absent workspace service at construction and activation, original identities, and current availability. Identified, ID-only and generation-only sources cannot adopt a missing/wrong session later.

## Visible conflict feedback and the original regression contract

The original test `DOM model: stale detached pin cannot bless a newer pin` protected the newer pin, but also asserted `controller.error.code === 'CONFLICT'`. That internal assertion required a detached stale action to invoke Store and make Controller fail. Rejecting before request creation is a stronger boundary, so preserving the old internal failure would require either unnecessary I/O or a fabricated Controller error.

Before adjusting that case, its exact original full test file was retained, SHA-256 `79cb2fcd04d67d07f82f82cd38eb01507ecb66d0203b93d973138a05dfe19c9d`. With the new guards and original assertion unchanged, the authorized single-case window ran **1 test, 0 passed, 1 failed**, exit **1**, duration **95.812 ms**. The newer-pin assertion passed first, followed by `TypeError: Cannot read properties of null (reading 'code')`. Complete failure log SHA-256 is `86e717efc58185478fd42b1c3e67b9b1258476151571e92cfba5f58cc6862c00`. This window establishes Controller.error stayed null; it did not contain a visible-feedback assertion and is not evidence that the new UI contract passed.

The replacement contract requires a precise, user-visible, localized CONFLICT notice in the original live status region, while leaving Controller state/status/error/Retry, localError, receipt and Undo untouched and performing zero requests/reads/writes. Feedback is published only when the original construction source and visible feedback/status ancestry still match, the captured expectedPin has changed, and no pending/error/Retry/localError/dialog/review/session/departure owns the surface. Source and state are rechecked after layout. This is a temporary view notice, not a simulated Store failure or an unresolved-save blocker; a normal render or explicit current-row choice replaces it.

The new independent suite covers both Pin next and Unpin, exact English/Chinese/fallback text, live-region semantics, rejected feedback replacement during another operation or source change, and subsequent successful current selection. The reviewed original-test adjustment is limited to its purpose-preserving assertions and local instrumentation; shared helpers and other old tests stay unchanged.

## Verification

The first authorized focused GREEN window ran at **01:29:07–01:29:35 UTC**. Syntax checks passed for production, the new pin suite and the original view suite. Its eighteen files ran **2,015 tests: 2,013 passed, 2 failed, 0 skipped**, exit **1**, duration **27.465 seconds**. All **1,439 existing tests**, including the strengthened original case, passed. The new pin suite ran **576 tests: 574 passed and 2 failed**.

Both failures were the new final-feedback-layout source-switch probes, one per pin direction. Their zero-request/read/write assertions passed. The generic storage assertion then compared the newly selected independent workspace's original revision-4 data against the prior workspace's revision-5 newer-pin data. The retained first-run log SHA-256 is `452ee8d28d4b83e6005ff29b784c4f542bcb549c92e965b33a1f408afb462679`; the entire first-run new-test snapshot is also retained. No production write is inferred from this cross-source comparison failure, and the run is not reported as passing.

The reviewed test-fixture-only correction snapshots both distinct workspace identities and their own data, switches at the actual final layout lookup, verifies zero requests/reads/writes, and separately checks replacement data and restored-original data against their own snapshots. Production, the generic test helper and all existing tests are unchanged by this correction. The second authorized window ran at **01:30:58–01:31:25 UTC**. The new test syntax check passed; the same eighteen files then passed **2,015/2,015 tests**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **26.889 seconds**. This comprises **576 new pin tests + 1,439 existing regressions**. All 28 retained RED probes now pass. The strengthened original case and the new localized feedback cases establish the precise visible notice, unchanged Controller/Retry state, zero I/O and subsequent successful current-row choice.

Per-file passing counts:

- `local-tasks-batch-store.test.js`: 22
- `local-tasks-boundary.test.js`: 3
- `local-tasks-complete-batch-store.test.js`: 32
- `local-tasks-complete-batch-view.test.js`: 41
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

The bounded run used `--max-old-space-size=512 --test --test-concurrency=1`; no local full-suite or scale run was performed. Original first-GREEN failures remain retained rather than replaced. The independent owner review then passed **54/54 probes**, **0 failed, 0 cancelled, 0 skipped**, duration **743.569 ms**. Final local model verification is **2,015 focused + 54 independent = 2,069 passing checks**, excluding retained failed reproduction windows. Owner Python checks passed **84/84** in **1.802 seconds**. Runtime packaging and verification covered **133 files**, with ZIP SHA-256 `a10c6bbf30c623b21ac6182ca9de87617d5d633e7cd26db00f5f2e9db02dee50`. This packaging describes the verified working-tree source, not browser or remote CI success. Remote exact-source CI remains the integration gate.

Independent protection checks show **399 of 400 protected baseline files** unchanged; the sole exception is the reviewed old-view test case, with every byte outside that case unchanged. Static checks also show all **1,439 other tracked baseline files** unchanged, all four movement helper/constructor/handler/Retry/node-chain blocks still present byte-for-byte, and every byte outside the one authorized original-view test case unchanged. Manifest remains `1.1.155`.

Final new-test SHA-256: `5109764cfab731292cafb44967f3253dd2e7c8055fa3a31adb98096dc1f6d7c0`. Complete second-GREEN log SHA-256: `3357f5653eed5ecd96f13b20631da109c88806581df657e8d59fee111eda3a30`.

Final production SHA-256: `e6d5c911f35fe6da3f9d25d0827923b5ab9b8450564ea85f780105cb7e06233a`. Original-view test SHA-256 after its reviewed single-case update: `5700548f178155cfd6eb7900fdc0028ea0f1919ed7f59216ac7d9c34e373903d`.


## Limits

This is synthetic Store/Controller/DOM-model evidence, not native Chrome, real keyboard/IME timing, screen-reader or visual-layout validation. It does not cancel a storage write already dispatched before a later departure. No screenshot, user-device access, paid platform, permission expansion, tag, Release, store submission or manifest bump is included. Release `1.1.155` remains frozen; these ownership fixes do not establish that the historical real-upgrade data-loss incident is resolved.
