# Task-row Edit return focus — 2026-10-15

## Defect and bounded repair

On the 1.1.153 baseline, saving a task rebuilds its row for the new revision. The shared dialog's original Edit trigger is then disconnected. Closing the editor falls back to Add even when the same task's replacement Edit is visible. An unrelated revision can produce the same disconnected-trigger condition on Cancel or Escape.

The task view now supplies its row origin to the editor and resolves that task's current Edit by stable task ID when closing. It restores focus only when the same editor still owns it, including an unclaimed native body fallback. Focus that moved elsewhere, left the window, or departed before its later owner was removed is not reclaimed. Returning focus to the editor permits a later close or retry to restore the row normally. The editor removes its focus/visibility/window listeners when closed or destroyed.

The current Edit must be connected, enabled and visible, outside hidden/inert ancestors and closed details. A removed task, changed filter, collapsed preview/menu/group or unavailable workspace does not cause another row to receive focus. Where available, the existing Add fallback remains; otherwise the close fails closed. Non-row editor openings retain their original return path while respecting newer focus. The same resolver handles Save, explicit reviewed conflict replacement, Cancel and Escape. Unchanged cancellation still returns to the original Edit node.

This is local to the task view. The shared dialog-focus implementation, store/controller, write protocol, permissions and schema are unchanged. Ordinary completion's existing Add-return contract remains. Version remains 1.1.153 in this implementation candidate.

Interaction reference: [W3C APG Modal Dialog Pattern, Note 2](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) describes returning focus to the invoking element, or a logical workflow target when that element no longer exists. This is the interaction rationale, not a claim of whole-product accessibility conformance.

## Focused automated evidence

The new `local-tasks-edit-return-focus.test.js` has 45 cases using the actual View, Controller and Store with synthetic data and the repository DOM/event model. On the unchanged 1.1.153 baseline, 21 pass and 24 fail the intended focus assertions; the candidate passes all 45.

Coverage includes:

- Four-row preview, expanded 300th active task, filtered task and Completed group, with and without storage notifications
- Duplicate task text resolved by ID; 500 stored tasks, 8 full previous copies, old Unicode/whitespace/plain-text markup, timestamps, ordering and existing receipts preserved exactly except the explicitly edited record's normal edit fields
- Pending success with external focus, external owner subsequently removed, explicit body focus, native body fallback, focus returned to the editor, window blur and document hiding
- No eligible target after edit/filter changes, collapsed preview, closed row menu/Completed group, hidden row/host/workspace, inert workspace, disconnected host or removal before the edit continuation
- Failed and uncertain writes retaining the draft and exact operation retry; reviewed conflict replacement; cancellation after row rebuild; newer editor ownership; destruction during pending work
- Listener cleanup without removing another operation's ownership listeners

Focused command:

```sh
node --test tests/local-tasks-edit-return-focus.test.js tests/local-tasks-view.test.js tests/local-tasks-batch-view.test.js tests/local-tasks-pinned-completion.test.js tests/local-tasks-completion-undo.test.js tests/local-tasks-departure.test.js tests/local-tasks-visibility.test.js tests/dialog-focus.test.js
```

Result: 216 passed, zero failures or skips. The existing pinned-completion/new-editor test now distinguishes the still-open editor's own two document listeners from the completed pinned action's cleaned-up listeners, and asserts zero after destruction.

The model explicitly emits focusin for simulated focus changes and simulates native blur/layout edges. It is not native-browser or performance evidence. Full-suite, packaging and native-browser checks have not been run for this frozen implementation candidate; independent review and later release checks remain separate gates.
