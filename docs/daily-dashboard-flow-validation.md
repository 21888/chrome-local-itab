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

## Measured zoom and representative keyboard routes

A separate synthetic page on `localhost:8777` used the same verified runtime. Native Chrome zoom UI showed **200%** with a **586×380 CSS-pixel** document viewport, then **300%** with **388×253 CSS pixels**. The reported document scroll width equaled client width in each checked template state. Image pixels were not used as CSS dimensions.

| State | Actually exercised |
| --- | --- |
| Clarity, 200% / 586 CSS px | Native Tab to Skip to shortcuts, Enter then Tab to Placement; Tab/Enter opened Finder, query and Escape returned to its opener; native Tab traversed shortcut actions → Tasks input → Focus Start → Scratchpad editor. |
| Clarity, 300% / 388 CSS px | Shift+Tab returned from Scratchpad through the page to Appearance; keyboard opened the gallery, reached Folio and applied its preview while retaining the task draft. |
| Folio, 300% / 388 CSS px | Keyboard reached Finder; query then ArrowDown focused the complete result, visibly scrolled into its own dialog viewport. Escape returned to the opener; Tab reached Tasks, Focus Start and Scratchpad. Keyboard returned to the gallery and selected/applied Today. |
| Today, 300% / 388 CSS px | Shift+Tab reached category All; Right moved focus to Work, then Enter selected it. Finder result was visibly reachable, Escape restored its opener, and Tab traversed all three personal modules to the readable Scratchpad. |

These are representative routes, **not** a three-template-by-two-zoom matrix or all 21 templates. No inaccessible control or page-wide horizontal overflow was observed in these states. Smooth focus scrolling briefly produced an offscreen rectangle immediately after a key; a subsequent screenshot/readback confirmed the settled control onscreen, so that transient observation is not a defect claim. Inner dialog/disclosure scrolling is intentional and distinct from page overflow.

Two automation/environment corrections were kept separate from product results: the dedicated `dashboard-qa.localhost` URL failed with `ERR_SSL_PROTOCOL_ERROR`, so the standard authorized localhost page was used without changing security settings; an exact-label loop missed Finder's visible `/` hint and reached Add, saving the synthetic task draft. The corrected route matched the actual label and verified Finder. The final three writes were Folio Apply, that task Add, and Today Apply. Scratchpad, Focus, Countdown, global settings, the other workspace and shortcut content remained unchanged; no site opened.

Native zoom was restored to 100% and document width 1180 before cleanup. Both owned tabs (including the failed navigation tab, closed through its tab-strip X without reading its internal page) were removed. Only the original untouched tab remained in inventory. Port 8777 stopped normally, and its dedicated terminal tab closed. No screenshots were uploaded. The existing category/disclosure/template/CardLayout model baseline separately passed **50/50**, exit 0.

## Remaining acceptance map and next route

| Area | Evidence currently established | Remaining scope / actual blocker |
| --- | --- | --- |
| Focus setup/Reset | Actual Store/Controller/View regressions, full project run at the functional commit, desktop synthetic native setup and Reset chains | Other platforms and assistive technology not established |
| Saved-site discovery and Organizer | Integrated add/reveal and complete move/review/back chains; native synthetic add/reveal grid/free routes | Every import/export and upgrade combination is not implied |
| Tasks duplicate/edit/pin/completion | Two complete real-controller model chains here; ordinary add used after native template changes | Full duplicate/edit/retry chain not newly repeated in native UI |
| Scratchpad workspace departure | Actual Manager/Session/lifecycle/picker/controller complete models, including failure/newer draft; ordinary native editing retained through appearance changes | Native multi-workspace departure/return remains separate from these models |
| Template/card layout/navigation | Desktop synthetic complete page plus the bounded measured-zoom keyboard routes above | 21-template × language × zoom × custom-layout matrix is incomplete; mobile devices, screen readers and real dragging not claimed |
| Calculator and local recent results | Existing focused calculation/continuation/copy/recent-result model suites; historical scientific-calculation native spot checks | Current complete calculate → continue → recover from invalid expression → reuse recent result route is the next bounded check; no network search or clipboard read is required |
| Installed extension migration / file import incident | Existing retained failure and recovery evidence only | **Blocked separately** by the original file-selection approval/incident gate; no retry/bypass, upgrade-success claim, Release 161 or CWS submission |

An untested combination is not a confirmed defect and not a reason to stop unrelated authorized development. The next calculator route should first establish its real public-control chain and only change production if a reproducible user-visible failure is found.
