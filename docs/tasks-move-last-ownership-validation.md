# Move-to-end source ownership hardening / 移到列表末位来源边界

Date: 2026-10-18 UTC. Local recovery baseline: `57f18b11325196ced0821c88363162fefff2f410`; baseline tree: `731b35411c6f2fd451894a1622489f83a611c30c`. Manifest remains `1.1.155`.

## Baseline reproduction

The new independent `tests/local-tasks-move-last-ownership.test.js` uses the real Store, Controller and View and the unchanged shared DOM model. Every record, workspace and receipt is synthetic. Changed workspace object/ID/generation routes to independent data with identical initial IDs, versions and active order. Store/backend replacement probes also use independent data while keeping the original workspace object and session, so session mismatch cannot disguise a missing backend boundary.

Before production changes, the sole authorized RED run on 2026-10-18 at 00:48 UTC completed **23 tests: 2 passed, 21 failed, 0 skipped**, exit **1**, duration **496.732 ms**. Its complete log and exact test snapshot were retained before extending the new file.

- Replacement before the first asynchronous row render, and replacement followed by redraw, each produced three extra reads, one request and one write in the newly selected workspace.
- Replacing the backend with independent storage but the same workspace identity allowed both the original and redrawn row to write there. Replacing the Store rejected the original row correctly, but a redrawn row adopted the new Store. Each failing replacement produced three foreign reads and one foreign write; the original storage had no additional reads or writes.
- All nine combinations of false/dropped/uncertain-acknowledgement save and workspace/Store/backend replacement let the original Retry write once in the changed destination. Workspace replacement added two reads; independent Store/backend replacement added three reads, including its subscription refresh. These are actual writes, including the three acknowledgement cases, not merely changed Retry UI.
- A pending state introduced at the final layout getter created one request but performed no read/write because `perform` rejected pending work. Late error, hidden document, unapplied filter and replaced Controller state each produced three extra reads, one request and one write.
- The current original row correctly performed one write. A nullish legacy source restored from undefined to null and an original anonymous availability object without a workspace service were incorrectly rejected, with zero writes.

The RED test snapshot SHA-256 is `26efd19379bfd4815ebd6c84f8b94071ae2bbb66f03299ae0ac7ffc615cfae06`. The complete RED log SHA-256 is `68cfadecd801b63d0bc0082336352669f89ea6020e0756aaf3fdc4c900458c38`.

## Scoped correction

Only Move-to-end construction ownership, its row-specific guards and the `kind === 'moveLast'` Retry boundary change. Move-to-start construction, helpers, row handler and Retry gate remain byte-for-byte unchanged. Store, Controller, schemas, receipts/recovery/export protocols, translations, other row actions, shared DOM helper, existing tests, manifest and CI remain unchanged.

Move-to-end now captures its original host/list/filter input, Controller, Store, backend, workspace object/ID/generation, session and mounted ancestor chain before the first async load. Each row keeps its original nodes, immutable task/order snapshot and existing render generation. Redrawing cannot adopt a new source, and reattaching a complete stale row cannot renew its ownership.

The handler checks eligibility, then original DOM/visibility/ancestry, then eligibility again. The final pass rereads document visibility and the original raw filter input before checking current ownership, pending/error/receipt and dialog/session state, and then obtains the current saved records and order. No layout or ancestry read occurs between that final state check and request creation. Repeated/prevented/IME-tail activations and stale/hidden/inert/disabled sources remain rejected. The restoration-session guard is included. Quick-entry draft/composition stays independent of the saved row action.

Null and undefined remain equivalent only for a construction-time no-workspace source. An anonymous availability object qualifies for compatibility only when it had nullish ID/generation and no workspace service at construction. It must retain the identical object, backend, Store, Controller and IDs, stay valid and unsuspended, and the service must remain absent. Identified workspaces with missing or wrong sessions never gain this exception.

Original Retry checks mounted source ownership without binding to the stale row/order/version or unresolved error. Restoring the original source allows the exact original command to reach existing receipt/CAS validation: a latest acknowledged operation confirms without another write, a later receipt conflicts without writing, and an uncommitted operation can merge an unrelated latest edit. A refreshed real-CONFLICT row can still make a new explicit move; unknown READ/WRITE/VERIFY failures cannot be replaced by a fresh move.

## Verification

Static checks passed before GREEN: `git diff --check`, manifest `1.1.155`, all **1,436 other tracked baseline files** unchanged, and the complete existing Move-to-start constructor/helpers/handler/Retry gate preserved. The new tests retain the 23 RED probes and extend row/source/Retry, nullish/anonymous compatibility, final layout/page/filter getters, state/session guards, event guards, locale/fallback, safe feedback, drafts and focus coverage.

The authorized bounded GREEN command is:

```sh
node --max-old-space-size=512 --check shared/local-tasks-view.js
node --max-old-space-size=512 --check tests/local-tasks-move-last-ownership.test.js
node --max-old-space-size=512 --test --test-concurrency=1 \
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
  tests/local-tasks-copy-visible.test.js
```

The first GREEN window began at **00:51:52 UTC**. Both syntax checks passed, then the eleven-file run passed **841/841 tests**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **13.560 seconds**. The new ownership file contributes **217 tests**; the ten unchanged regression files contribute **624**. No GREEN failure, assertion relaxation or repeat of this window occurred. The retained complete log is `item68-green-01.log`.

The original 23 RED cases all pass after the scoped fix. Expanded tests also verify final document-hidden/raw-filter getters that alter pending or current state, restoration sessions, late task text/version/order changes, all three unresolved write modes, source restoration and safe localized READ/WRITE/VERIFY feedback. The unchanged copy-visible regression is included alongside Move-to-start ownership coverage.

The owner's independent review passed **28/28 on its first run**, **0 failed, 0 skipped**. Its retained log is `feature68-independent-round1.log`. Those probes independently cover separate Store/backend data with the original workspace identity, construction-source changes and redraw, final-layout pending/version/text/workspace/hidden/filter/WRITE changes, original Retry source rejection/restoration, latest-acknowledgement zero-write confirmation and later-receipt conflict, complete stale-row reattachment, nullish/anonymous availability positives, ID-only or generation-only workspaces without a service, and an initially missing session that is supplied later.

Passing model checks total **841 focused + 28 independent = 869**. Python/runtime packaging and exact-source CI remain separate gates; these bounded checks do not imply their completion. The RED failures above remain disclosed rather than described as a clean baseline.

After the implementation freeze, owner checks passed **84/84 Python tests** and package creation/verification checked **133 runtime files**. The runtime ZIP SHA-256 is `17622efdfe617fdba34af8ad44de928a4a1e506b85855ebc9eaebb5462defdb2`. The owner separately rechecked all 398 protected test/Store/Controller/manifest/CI/package baseline files, all 1,436 other tracked files, and the Move-to-start constructor/helpers/handler/Retry unchanged. Packaging describes the modified working-tree source; it does not establish browser or remote CI completion. Exact-source CI remains pending publication.

## Limits

These are bounded synthetic model checks. They do not establish native Chrome, keyboard/IME timing, assistive-technology, screenshot or visual-layout correctness. No local full-suite/scale run, user device, paid platform, new tag/Release/store submission or manifest bump is included. A write already dispatched is not cancelled by subsequent page hiding or departure; existing Store protection and receipt Retry remain authoritative. The unchanged exact-source CI remains the full remote gate.
