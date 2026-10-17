# Move an active task to the list start — validation

Date: 2026-10-17. Baseline: `a74983b83f1423c3bc925b3dd35c06403ea8f226`, tree `bdf1fa9d331c5677aa3d1933d9cee25aba917026`. No manifest version change.

## Behavior

**Actions → Move to list start** (**移到列表首位**) moves one active task to the start in one atomic local save. It rotates only the active slots preceding that task, just like repeated **Move up** actions. The other active tasks retain their relative order. Completed/removed records keep their absolute slots; all record contents, versions and timestamps are unchanged. The existing **Next up** pin and recovery copies are preserved. List order and the Next up selection remain separate choices.

The `moveFirst` command checks target ID/version, active state and the entire active ID order inside the existing storage lock. It uses the existing finish, receipt, write and exact readback path. A latest-receipt retry acknowledges the original result without reordering again; an older receipt after a later mutation conflicts. Unrelated record edits and pin changes are preserved without imposing a global revision requirement.

The action exists only for active rows. It is disabled on the first row and while filtering. Pending actions retain the existing `aria-disabled`/perform guards. Its own click guard also rejects disabled, detached, stale, hidden or closed-menu controls, an open review/editor, departing pages and unavailable workspaces. Other row actions are unchanged. After redraw, the existing focus recovery falls back to that row's Actions summary because its Move-to-start button is now disabled. Newer input/search focus and quick-entry drafts are preserved. The new position survives reload and appears in the four-row collapsed preview.

English, Simplified Chinese and English fallback labels/help are provided. No keyboard shortcuts, timers, network calls, permissions, schema, backup format or controller changes were added.

## Bounded automated evidence

- A missing-entry test was added before implementation and failed on the baseline: the active row had no Move-to-start button (**0 passed, 1 failed**).
- The final bounded six-file regression window passed **187 tests, 0 failed, 0 skipped**; the two new files contain **38 tests**.
- The synthetic fixture has six active tasks interspersed with completed/removed records, repeated Unicode/multiline text, a pin and a previous copy. Tests compare every record by ID and every inactive absolute slot.
- Coverage includes middle/last/pinned/duplicate-text targets; equivalence to adjacent upward swaps; exactly one write; readback/export/reload; complete-order checking (including a middle target's suffix); stale edit/completion/removal/order/add/restore after waiting for the lock; preservation of unrelated edits and repins; false/throw/dropped writes, failed readback and uncertain acknowledgements; exact retry and later-receipt conflicts.
- Real Store and Controller classes run against a serialized backend model and the existing DOM model. View checks cover localization/fallback, first-row/filter disabling, pending/repeated clicks, old controls, collapsed preview, focus fallback and newer drafts/focus. Existing store/view/pinned-completion/edit-return-focus regressions also pass.
- The first implementation run found four incorrect test expectations for existing behavior: Next up text includes its label prefix, and conflict feedback hides Retry. These assertions were corrected; neither the test harness nor those production behaviors changed.

Command:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-move-first-store.test.js \
  tests/local-tasks-move-first-view.test.js \
  tests/local-tasks-store.test.js \
  tests/local-tasks-view.test.js \
  tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-edit-return-focus.test.js
```

This is a bounded model-based check, not a full-suite or native-browser pass. No native keyboard, assistive-technology, visual-layout or screenshot evidence is claimed for this change. Native follow-up should check the longer Actions menu in both languages, narrow/light/dark layouts, Enter/Space activation and focus after moving a visible row or one beyond the four-row preview.
