# One-step Tasks movement source ownership / 上移与下移来源边界

Date: 2026-10-18 UTC. Local recovery baseline: `f3f093d6ba25f0bb4b29af806c18f9ca9205cb3d`; baseline tree: `b8b00d5edbeacdc152440af68bab282cae14a56b`. Manifest remains `1.1.155`.

## Baseline reproduction

The new independent `tests/local-tasks-step-move-ownership.test.js` uses the real Store, Controller and View with the unchanged shared DOM model. All storage, text, identities and receipts are synthetic. Each workspace object/ID/generation selects independent starting data with identical records, IDs, versions and active order. Foreign Store/backend probes also keep the exact original workspace object and session, so a session mismatch cannot conceal a missing backend boundary.

Before changing production, the single authorized RED window ran **30 tests: 2 passed, 28 failed, 0 skipped**, exit **1**, duration **677.457 ms**. The original upward and downward moves each correctly performed one write. Both directions failed the following real-I/O probes:

- Changing workspace before the first asynchronous row render, or changing it and then redrawing, added **3 reads, 1 request and 1 write** in the replacement destination.
- Both original and redrawn rows crossed independent backend and Store replacements despite retaining the original workspace identity. Each case added **3 foreign reads and 1 foreign write**; original storage had no additional reads or writes.
- An original false, dropped or uncertain-acknowledgement Retry crossed a replacement workspace, adding **2 reads and 1 write**. An uncertain-acknowledgement Retry crossed an independent Store/backend with **3 reads and 1 write**.
- Reattaching a complete old row after redraw, or activating with a preexisting hidden document or unapplied raw filter, each added **3 reads, 1 request and 1 write**.

These are actual reads and writes, not merely enabled controls or static inspection. The old handlers did not perform layout inspection; no late-DOM getter injection is claimed for RED. Explicitly triggered final-getter regressions are part of post-fix validation.

The retained 30-test RED snapshot SHA-256 is `2ffefd0955c0cdc4b0b5f6e7e2d844585ac8d80cdd2b9ff679a60b31fed24eb7`. The complete RED log SHA-256 is `d296df0d3dd7ec6546585271b4b545327615fa67c89ab51f29fcb285072e24be`.

## Scoped correction

Only the existing Move up / Move down handlers, their new construction-time ownership and dedicated guards, and the `kind === 'move'` Retry gate change. Move-to-start and Move-to-end constructor blocks, helpers, handlers, Retry gates and original node chains remain byte-for-byte present. Store, Controller, schema/receipts/recovery/export protocols, all old tests and helpers, manifest, locales and CI are unchanged.

`stepMoveOwner` captures the original host/list/filter input, Controller, Store, backend, workspace object/ID/generation, session and ancestor chain before the first asynchronous load. Every direction owns its original action, title, menu, summary and row nodes, immutable full task and active-order snapshots, and the existing render generation. Fresh redraw cannot adopt another source; complete stale-row reattachment cannot renew ownership.

Each handler rejects prevented/repeated/IME-tail or foreign-target events, checks current eligibility, checks original DOM/layout/ancestry, then checks current eligibility again. This last pass reads page/filter DOM state before reacquiring current source, error/receipt/pending state, dialog/session state, saved record and entire active order. The selected record must still match all snapshot fields and have a valid neighbor in its direction. No layout/ancestry read follows the final source/state check. The first upward and last downward boundaries remain rejected even if their disabled flag is manually removed.

Unknown READ/WRITE/VERIFY attempts preserve their exact original Retry. A real CONFLICT still refreshes the saved rows and permits a new explicit current-row choice. Original Retry checks construction source without binding to an obsolete row, order, version or error: latest acknowledged receipts confirm with zero new writes, later receipts conflict without writing, and an uncommitted operation can merge an unrelated latest edit through existing CAS. Returning to the original source restores Retry availability.

Null/undefined remain equivalent for a construction-time no-workspace source. The narrow compatibility path for anonymous availability objects requires nullish ID/generation and absent workspace service at construction, unchanged original identity/IDs/backend/Store/Controller, validity and availability, and a still-absent service. Identified, ID-only and generation-only sources never gain this exception when session/service is missing or wrong.

Independent quick-entry draft and IME do not block saved-row movement. Existing focus fallback, Next up/pin, pending-copy-result invalidation and Undo contracts remain untouched and receive dedicated regression coverage.

## Verification

Before GREEN, `git diff --check` passed, manifest remained `1.1.155`, and SHA-256 comparison found all **1,438 other tracked baseline files** unchanged. Exact baseline Move-to-start/Move-to-end constructor, helper, handler, Retry and node-chain blocks remain present unchanged.

The authorized bounded GREEN window consists of syntax checks for the production file and new test, followed by:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-step-move-ownership.test.js \
  tests/local-tasks-move-last-ownership.test.js \
  tests/local-tasks-move-last-view.test.js \
  tests/local-tasks-move-last-store.test.js \
  tests/local-tasks-move-first-ownership.test.js \
  tests/local-tasks-move-first-view.test.js \
  tests/local-tasks-move-first-store.test.js \
  tests/local-tasks-store.test.js \
  tests/local-tasks-view.test.js \
  tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-edit-return-focus.test.js \
  tests/local-tasks-copy-visible.test.js \
  tests/local-tasks-boundary.test.js \
  tests/local-tasks-batch-store.test.js
```

The first GREEN window ran at **01:08:04–01:08:24 UTC**. Both syntax checks passed, then the fourteen-file run passed **1,340/1,340 tests**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **19.299 seconds**. The new step-move ownership suite contributes **474 tests**; the thirteen unchanged regression files contribute **866**. The complete first-run log is retained as `item69-green-01.log`. There was no failed GREEN, assertion relaxation or repeated window.

All original 30 RED probes now pass. Explicit final-layout probes reach their second document-root style lookup before injecting changed workspace/session, order/version/text, pending/error/receipt, dialog/session, page/filter and lifecycle state. Final document-hidden/raw-filter getters also assert that the third read was reached before changing pending/current-state values. Separate probes cover unchanged first/last boundaries and their original receipt behavior through the existing ownership suites.

The owner independently passed **60/60 probes on the first run**, **0 failed, 0 skipped**, covering both directions across independent same-identity Store/backend data, source replacement/redraw, late layout state, original Retry ownership/restoration, latest and later receipt outcomes, stale-row reattachment, compatibility and logical boundary guards. This includes removing the disabled flag without authorizing a boundary move and merging an unrelated latest edit after an uncommitted attempt. Its complete log is `feature69-independent-round1.log`. Final local model verification totals **1,340 focused + 60 independent = 1,400**, excluding the retained failed RED run.

Owner Python checks passed **84/84**, and package creation/verification checked **133 runtime files**, runtime ZIP SHA-256 `8243bcc0a6aad0478ffe0af3388e79c4ab3aa7ac63e10960c3d57ff6a8600a85`. The owner independently rechecked all **399 protected baseline files**, all **1,438 other tracked files**, and the original first/last constructor/helpers/handlers/Retry/node-chain blocks unchanged. Local packaging describes the modified working-tree source; it does not establish browser or remote CI completion.

No local full-suite or scale run has been performed. Exact-source CI remains pending publication.

## Limits

These are synthetic DOM-model checks, not native Chrome, real keyboard/IME timing, assistive-technology or visual-layout evidence. An already-dispatched storage write is not cancelled by a later hide/departure; existing Store protection and receipt Retry remain authoritative. No user device, paid platform, permission expansion, screenshot, tag/Release, store submission or manifest change is included. Release 1.1.155 remains frozen; remote exact-source CI is the full integration gate.
