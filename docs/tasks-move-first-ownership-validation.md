# Move-to-start source ownership hardening / 移到列表首位来源边界

Date: 2026-10-18 UTC. Local recovery baseline commit: `74148120a66ee9c8e57702d8909630c7e695ac42`; tree: `05dbf914c4c6246b0fece949a4995c5540af746b`. Manifest remains `1.1.155`.

## Confirmed baseline findings

An independent `tests/local-tasks-move-first-ownership.test.js` uses the real Store, Controller and View with the unchanged shared DOM model. All records, workspace identities and receipt IDs are synthetic. Workspace object/ID/generation changes route to separate synthetic stores containing identical initial records; the tests do not mistake identical content for a shared owner.

Before production edits, its 21-test run on 2026-10-18 at 00:00:51 UTC finished **5 passed, 16 failed, 0 skipped**, exit **1**:

- Four detached old rows were correctly ignored initially, but each performed one write after the complete row was reattached following expand, collapse, filter-clear or redraw.
- Eight original/redrawn-row cases performed one write after the original workspace object, ID, generation or active session changed. A ninth case replaced the workspace before the first asynchronous load rendered a row.
- After an unresolved false or dropped write, a fresh move performed an additional write. After an uncertain acknowledgement, it performed additional reads and replaced the unresolved operation with a new conflict; this case did **not** demonstrate a second successful write.
- Disposal, current workspace/legacy movement, legacy null/undefined restoration, and a fresh explicit choice following a real conflict passed.

The unchanged 21-test RED snapshot and complete failed log were retained separately before extending the new file. Their SHA-256 values are:

- RED test snapshot: `322aa360b7c44da68fba9d2e7f6631b4368300ce27376a61ba2b2bcc3fa8255c`
- Complete RED log: `050e528a4db2f0d04080a05a2a0a8a11920583cb333e55a38ed53baad2c73876`

## Additional Retry boundary reproduction

Before changing the Retry path, a second bounded RED run at 00:11:23 UTC selected only 18 new source-boundary cases: **0 passed, 18 failed**, exit **1**. False/dropped writes followed by workspace object/ID/generation/session or Store/backend replacement performed an additional write in all 12 cases. Uncertain acknowledgements followed by object/ID/generation/Store/backend replacement wrote the old command into the newly selected identical synthetic data in five cases. An acknowledgement followed only by session replacement performed one extra read, without a second write. The complete failed log and pre-Retry-fix test/View snapshots were retained.

- Retry RED test snapshot SHA-256: `e71b8c152438706ebe0f81dbf1773361b7048a4c0785c186916b8b4a47ad6944`
- Retry RED View snapshot SHA-256: `d71b36a9c082f545408024644f4414e5a2a2bf079d8632dfc0b035abd77f4c7e`
- Retry RED full log SHA-256: `8883cc9ca14300a97a1cfde55bf1b0cb7fdad2885fe197abc84d35d8fb38b0ed`

## Scoped correction

Only the existing Move-to-start handler, first-specific ownership checks and the `moveFirst` branch of the existing Retry gate change. The mounted source is captured before the first asynchronous load: original host/list, Controller, Store, backend, workspace object/ID/generation, session and ancestor chain. Each row captures an immutable task/order snapshot, original title/action/menu/summary nodes and the existing render generation. The old Move-to-end generation is read without changing its increment or its handler.

A current original row must remain visible and attached to its original structure. Disabled, hidden/inert/aria-hidden sources, stale or replaced titles, changed ownership, open dialogs, unresolved errors/receipts, repeated/prevented/IME-tail activations and unavailable sources are rejected before request creation. After the final layout/ancestry inspection, page visibility and the original filter input are reread before non-layout source/state eligibility is checked again. A late hidden page, unapplied filter, changed source, pending/error or record change cannot authorize a request using an earlier snapshot.

Legacy no-workspace backends treat null and undefined as the same source. A temporary unavailable workspace or dialog does not permanently revoke the original legacy row once its original source is restored. An unresolved READ/WRITE/VERIFY result keeps its exact original Retry. A freshly rendered CONFLICT row may start a new explicit choice after the latest saved task is reviewed; the old row cannot revive. The original moveFirst Retry checks only mounted source ownership, not old row generation/order/version or the unresolved error. Restoring that original source permits the exact original command to reach the existing receipt/CAS rules. A same-source latest acknowledgement needs no second write; a later remote edit creates a newer receipt, so retrying the acknowledged older operation still conflicts without writing.

Store, Controller, schemas, receipt/recovery/export protocols, localization, button count, other row-action handlers and existing tests/helpers stay unchanged. Movement still uses the existing one-write `moveFirst` CAS, preserves Next up and drafts, and retains the established focus and retry paths.

## Verification status

- The baseline RED run above is complete and preserved.
- Static `git diff --check` passed. The Move-to-end block, Store/Controller, existing move-first/move-last tests, shared DOM helper, manifest and CI were verified byte-for-byte unchanged from the baseline.
- Expanded focused tests add original-node/visibility checks, event guards, source replacement before/after redraw, pending/unresolved receipt retention, final-layout getter mutations, localization, legacy sources, draft/focus and independent sibling-action positives.
- The first post-correction single-Node window began at **00:17:27 UTC**. Both `node --max-old-space-size=512 --check` invocations passed for `shared/local-tasks-view.js` and the new ownership test file.
- Its nine-file regression run passed **480/480 tests**, **0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **9.851 seconds**. The new ownership file contributes **133 tests** and the eight unchanged regression files contribute **347**. No GREEN failure, assertion relaxation or repeat of this window occurred.
- This passing run follows the two disclosed RED runs; it is not described as a clean baseline. The retained new assertions cover cross-source Retry rejection followed by original-source restoration, same-source latest-acknowledgement confirmation after refresh/redraw, preservation of unrelated edits after an uncommitted failure, and conflict without writing after a later receipt.

- The owner's separate 25-probe independent review subsequently passed **25/25 on its first run**, **0 failed, 0 skipped**. It covered old complete-row revival, late layout/source changes, isolated Store/backend rejection with no reads/writes, original-source Retry restoration, and an unrelated later edit causing receipt CONFLICT without a new write. Its full log was retained as `feature67-independent-round1.log`.
- Passing model checks now total **480 focused + 25 independent = 505**. This total excludes the separately preserved failed RED runs. Python/runtime packaging and exact-source CI are separate gates, not implied by these Node results.

- Final owner checks passed **84/84 Python tests**. Package creation and verification checked **133 runtime files**; runtime ZIP SHA-256: `dcdc9f405fe68083c5042b9a8a8b53a107e72764ebb1c48e97139879024118d3`. Packaging reported the modified working-tree source, not a committed or browser-tested build.
- The owner independently checked all **397 protected baseline files** and the existing Move-to-end handler unchanged. Exact-source remote CI remains pending publication.

Exact bounded test command:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-move-first-ownership.test.js \
  tests/local-tasks-move-first-view.test.js \
  tests/local-tasks-move-first-store.test.js \
  tests/local-tasks-move-last-view.test.js \
  tests/local-tasks-move-last-store.test.js \
  tests/local-tasks-store.test.js \
  tests/local-tasks-view.test.js \
  tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-edit-return-focus.test.js
```

These are bounded synthetic model probes, not native Chrome, keyboard/IME, accessibility, screenshot or visual-layout evidence. No local full-suite/scale run, user device, paid platform, Release/tag/store submission or manifest bump is included. The unchanged exact-source CI remains the full gate after review and push.
