# Adjacent workspace ordering — validation

Date: 2026-10-17. Source baseline: `90a3ac23a8517d6efbeffb6af73782cd8e0fae3a`. No manifest version change or publication.

## Scope

Settings → Workspaces adds native **Move up / Move down** (**上移 / 下移**) buttons on normal rows. Default can move but remains protected from deletion. First/last boundaries stay disabled, including after pending work ends; a single normal workspace has both disabled. Trash has no move controls. Names can repeat; operations and focus recovery use the actual workspace ID.

The new manager method accepts only a valid workspace ID and `up` or `down`. Under the existing lifecycle transaction, the rendered registry revision must still match. It swaps the two neighboring normal entries' existing sparse `order` values, skipping Trash. Only those entries' `updatedAt`, their `order`, and registry revision change. Registry array order, identities, generations, names, creation/deletion timestamps, default/last-used/migration IDs, every saved bundle and global state remain unchanged. Boundary calls do not write, increment revision or obtain a timestamp. Existing transaction, commit, verification, restore, migration and provider methods are unchanged.

The existing restore fence is checked through transaction and commit. A focused injected-notification test also reproduced a legacy-conflict signal arriving during commit's restore read. Only the new move method supplies a final sticky-conflict callback to the existing commit path. This is an admission guard, not a new storage protocol or a claim of browser-crash atomicity.

The UI captures the displayed revision and ID. It does not retry a relative move on failure, including when the write succeeded but acknowledgement or verification failed. It refreshes and reports that the order could not be confirmed. Create, Trash, restore or another reorder changing the revision invalidates an older action.

New move controls reject repeated/pending, detached, modal and IME activation. The visibility checks cover `document.hidden`, hidden/inert/aria-hidden ancestors and controls with no client rectangles. Keyboard repeat is prevented on Enter/Space. Only this operation retains a focus intent across disabled controls and async refresh: the same action is preferred, then an enabled direction/control on the same row. Newer focus, pointer/keyboard activity, hidden-page transitions, an external modal or destruction prevent reclaiming focus. Temporary listeners are removed after success or failure. Existing controls and mutation handlers keep their semantics.

The switch picker is unchanged: an open dialog keeps its original ordered snapshot and query, while reopening uses the latest loaded order. Sorting never switches sessions, saves a draft, initializes a provider or changes a running Focus session.

## Bounded automated evidence

- Before implementation, two new minimal tests failed on the genuinely missing manager method and active-row UI entry: **0 passed / 2 failed**. The same entry tests passed after implementation.
- A later focused legacy-conflict injection failed with **Missing expected rejection**, then passed after the new move-only guard.
- The bounded seven-file regression command below passed **310 tests, 0 failed, 0 skipped**. The new store/view files contain **65 tests**.
- Storage coverage includes sparse orders, interspersed Trash, same-name IDs, Default, both directions/boundaries, detached return values, exact whole-storage diffs, one registry-only write, zero-write no-ops, strict validation, competing managers, stale revisions after lifecycle changes, waiting for locks, early/late restore fences, legacy conflicts, false/dropped/throwing writes, failed readback and lost acknowledgement. Snapshots and newly captured sessions preserve saved content and running Focus. Later create/duplicate still append; restore keeps its prior slot.
- DOM-model coverage includes English, Simplified Chinese and fallback labels, stable boundary disabling, pending/old controls, document/ancestor visibility, no-rectangle, inert and modal guards, composition/repeat protection, failure refresh, ownership-aware focus, listener cleanup, unsaved text and stable picker snapshots. Existing workspace invariants, view, lifecycle, picker-search and complete-backup workspace tests also pass.
- One intermediate run had **22 passed / 3 failed** because the new synthetic Scratchpad fixture incorrectly added an unsupported `updatedAt` field. Removing that fixture-only field made all 25 then-present storage tests pass. Production validators and old test helpers were not altered to accommodate it. Both logs are retained.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/workspace-reorder-store.test.js \
  tests/workspace-reorder-view.test.js \
  tests/workspaces-invariants.test.js \
  tests/workspaces-view.test.js \
  tests/workspace-picker-search.test.js \
  tests/workspace-lifecycle.test.js \
  tests/complete-backup-workspaces.test.js
```

This is a bounded model-based check, not a full-suite pass. CSS `visibility`, closed-details interactions, native Chrome layout, actual keyboard event synthesis/IME, focus painting, assistive technology, narrow/light/dark rendering and real cross-tab timing remain unverified for this feature. No native browser screenshots or user-profile data were produced. Release and Chrome Web Store publication remain frozen under the separate upgrade incident; this feature does not resolve that incident.
