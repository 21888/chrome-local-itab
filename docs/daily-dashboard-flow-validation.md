# Daily dashboard flows: integrated regression coverage

Validated on 2026-10-26. These flows passed the existing production implementation. This is a combined **test-only** addition, not six new features or a claimed product repair.

## Tasks: duplicate identity, editing and completion

The real Tasks Store/Controller/View, backed by synthetic local storage, adds two identical task texts through Enter. A filtered edit changes only the second identity. When the edited task leaves the old filter, focus returns to task entry; a new filter finds the exact edited task. Pin next → Next up Complete → Completed → Undo keeps the other task unchanged. Completion restores task-entry focus. Undo reopens the same record without restoring the old pin, as intended.

A second full sequence holds a failed edit while newer text is typed, then explicitly saves the latest draft and pins the confirmed record. The other duplicate's entire object stays unchanged.

## Templates, card layout and continued personal work

The actual `setupDashboardAppearance` wiring connects gallery actions to appearance preview/apply/cancel, real StorageManager validation/CAS and `Shortcuts.refreshTemplate`. Real Tasks, Scratchpad and Focus controllers/views are mounted in the same document; every module must initialize without an error and expose a loaded state.

- Preview and cancel Folio preserve current Work category, saved values, same input nodes and unsaved personal drafts. Apply saves only the intended appearance. After the transition, task Enter saves the original task draft, Scratchpad saves its original note, and Focus saves 31 minutes and starts through its original controls. The exact Work shortcut remains rendered and visible; no site is opened.
- Customize card-order preview moves existing nodes; Cancel restores saved order and exact saved values without reconstructing personal modules.
- Customize width Save → template switches Graphite/Folio/Clarity → Customize reopen preserves the saved Scratchpad width, original card nodes and every non-appearance saved field.
- With an actual LayoutController and an already identity-backed free shortcut plane, template previews/cancellation/application and Reading → Work category return preserve every link and saved coordinate. No pending layout timer or failed change remains, and the original Work tile is visible. Normal category preference behavior is not described as zero writes.

## Results and limits

- New complete flows: **6/6 passed**.
- Combined template/appearance/card-layout/complete-flow set: **121/121 passed**, exit 0.
- Tasks Store/Controller/View plus its two complete flows: **105/105 passed**, exit 0.
- These are overlapping focused sets, not an additional full-project aggregate.

The DOM model is synthetic. Grid mode uses real shortcut rendering/category filtering with geometry setup excluded; free mode uses the real layout controller and saved coordinates. These model counts do not establish browser painting, responsive reachability, actual dragging, OS IME, installed-extension migration or file import; the separately bounded native follow-through is recorded below. The tests never use personal data or open providers/sites. Initial fixture corrections (opening the real Actions menu, selecting Cancel inside the current customization overlay, providing the browser monotonic clock and accepting the controller's absent initial failure value) are not product counterexamples. One diagnostic Node run with an active timer was interrupted; only the final terminal runs above count as passing.

No runtime files, permissions, version, release or store submission changed.

## Native full-page follow-through

Cloud Chromium additionally exercised the actual page at an isolated loopback fixture on port 8776. All 138 runtime files matched local commit `41f6f6ef2fea420c8af116aa0bb95445c2a34dc1` (the two regression files and this document do not alter runtime). Only the synthetic current-workspace bundle enabled Tasks, Scratchpad and Focus; the legal legacy shadow remained unchanged. External requests/providers were disabled.

The observed cumulative synthetic storage writes were:

| Native action | Writes | Result |
| --- | ---: | --- |
| Enter task draft, edit Scratchpad | 1 | Task remains unsubmitted; ordinary note autosave confirmed |
| Folio preview → Cancel | 1 | Clarity restored, both texts retained, no appearance save |
| Folio preview → Apply | 2 | Folio saved, controls and texts retained |
| Customize Scratchpad width to 2 columns → Save | 3 | Custom grid/span 2 saved; task draft and note unchanged |
| Enter in original task input | 4 | Original draft becomes a second saved task |
| Start Focus, then keyboard Pause | 6 | Running then Paused; Resume owns focus |
| Select Free placement, then Work category | 9 | Normal placement/missing-position writes settle; original shortcut still reachable |

Normal scrolling visibly reached the two Tasks, the paused Focus timer with Resume/Reset, and the two-column Scratchpad with its exact note and Saved status. Readback retained the original shortcut content, other workspace, global settings and Countdown exactly. Tasks, Focus and Scratchpad changed only through the explicit operations above. No site was opened. One stale AX index after task insertion expanded the timing-help disclosure rather than Start; the current Start control was then used and its actual Running/Pause results verified. That automation correction is not a product failure.

The owned browser tab was closed, the dedicated server terminated normally by Ctrl-C with its stopped marker verified, and its terminal tab closed. Existing Options/approval tabs were untouched. Screenshots were inspected locally/in-tool, not uploaded. This native pass covers the stated desktop route, not every template, viewport, drag gesture, OS input method, actual extension installation/upgrade or import/recovery gate.
