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
| Focus setup/Reset and temporary view | Actual Store/Controller/View regressions, full project run at the functional commit, native setup/Reset plus full-page temporary-view chain below | Other platforms, assistive technology and native full elapsed-interval completion not established |
| Saved-site discovery and Organizer | Integrated add/reveal and complete move/review/back chains; native synthetic add/reveal grid/free routes | Every import/export and upgrade combination is not implied |
| Tasks duplicate/edit/pin/completion | Two complete real-controller model chains; native duplicate identity/edit/pin/completion/Undo and failed-save retry below | Newer typing during an in-flight save remains model-only; this native retry typed after rejection |
| Scratchpad workspace departure | Actual Manager/Session/lifecycle/picker/controller complete models, including failure/newer draft; native normal and failed-save recovery round trips below | Native newer-typing-during-pending-write remains model-only; no import/upgrade conclusion |
| Template/card layout/navigation | Desktop synthetic complete page plus the bounded measured-zoom keyboard routes above | 21-template × language × zoom × custom-layout matrix is incomplete; mobile devices, screen readers and real dragging not claimed |
| Calculator and local recent results | Existing nine focused files: 115/115 passed; native calculate → continue → local error → reuse older result → remove/clear history chain below | Clipboard interaction and installed-extension behavior were not part of this native pass |
| Installed extension migration / file import incident | Existing retained failure and recovery evidence only | **Blocked separately** by the original file-selection approval/incident gate; no retry/bypass, upgrade-success claim, Release 161 or CWS submission |

An untested combination is not a confirmed defect and not a reason to stop unrelated authorized development. The calculator route below found no defect; Scratchpad multi-workspace departure/return was then checked below, keeping the original import incident separate. Remaining combinations stay explicitly bounded in the table.


## Native calculator continuation and error recovery

The same verified full-page runtime was served on isolated loopback port 8778 with synthetic storage, in one owned Chromium tab. The existing nine `local-calculator*.test.js` files separately passed **115/115**, exit 0. No production change was needed.

1. Enter `=1/10000000`: local result `1e-7`. Use result restored `=1e-7` with the caret at its end; appending `*2` and Enter produced `2e-7`.
2. Enter `=1/0`: the local divide-by-zero error appeared, without a site/provider opening. Recent results still contained both successful calculations.
3. Use the older `1e-7` result: the input regained the exact reusable expression, without automatically calculating it. Append `+1` and Enter: `1.0000001`, with three history entries.
4. Remove the middle `2e-7` history entry: two entries remained; the current expression/result were unchanged.
5. Clear recent calculations: zero history rows remained while `=1e-7+1` and `1.0000001` stayed in the current input/result.

Final DOM-backed synthetic readback showed **0 storage writes**, no opened sites, and exact preservation of Tasks, Scratchpad, Focus, Countdown, global settings and the other workspace. Calculator session history is not being described as persisted workspace data. Clipboard controls were not invoked or read. This was a native synthetic-page interaction test, not installation, upgrade, import or OS-input-method validation.

The owned browser tab was closed; only the original untouched tab remained. The dedicated 8778 server was stopped with Ctrl-C, its stopped marker and shell prompt verified, and its terminal tab closed before releasing GUI ownership. Screenshots were inspected only in-tool, not uploaded.


## Native Scratchpad workspace departure and explicit recovery

An isolated port-8779 full-page fixture retained the same **138/138** runtime hashes. Only synthetic setup changed: a fresh session key, the second workspace's existing note enabled in its legal workspace bundle, visible write-hold/reject/release controls, and DOM-backed saved-note readback. The legacy shadow and production autosave delay were unchanged. The existing complete workspace/Scratchpad model file was rerun: **3/3 passed**, exit 0; this is a focused rerun, not a new 3,177-test aggregate.

| Actual native action | Cumulative writes | Result |
| --- | ---: | --- |
| Ordinary edit/autosave of `Synthetic workspace return note 中文 👩‍💻` | 1 | Original workspace note saved, revision 1 |
| Picker selects second workspace, then Default | 3 | Actual page navigation displays distinct second note, then exact saved first note |
| Arm synthetic next write, edit `Synthetic failed-save draft 中文 retained`, reject held autosave | 3 | Failure shown; latest editor draft retained, original saved content unchanged |
| Select second workspace → Stay | 3 | Draft decision prevents departure; Stay retains failed draft |
| Select second workspace → Save and switch | 3 | Safely remains in Default with “Some edits need attention”; does not automatically retry a failed acknowledgement |
| Stay → original editor's explicit Retry | 4 | Ordinary retry reads/checks saved state, saves exact draft as revision 2, shows Saved |
| Select second workspace, then Default | 6 | Other note remains distinct/unchanged; returned editable note is exact recovered draft with Saved status |

The failed-save route intentionally differs from a clean unsaved-draft Save and switch: the controller's existing error fence requires review/Retry in the original editor. The initial acceptance plan expected Save and switch to retry, but native evidence and source review corrected that expectation; no production bug or fix is claimed. No controls were forced through a modal's focus boundary, and no dirty-state race was manufactured by changing the autosave timer.

Final readback retained the second workspace's entire content bundle, Tasks, Focus, Countdown and global settings exactly. Normal workspace selection updated registry/last-used state; it is **not** reported as zero-write or exact-registry preservation. No discard, import, export, clipboard or external provider action was performed. Native pending/newer-typing race coverage is not inferred from the separate model suite.

The owned tab was closed, port 8779 stopped by Ctrl-C with its stopped marker and shell prompt verified, and the dedicated terminal tab closed. Browser inventory contained only the original untouched tab. Screenshots were inspected in-tool only. These calculator and Scratchpad acceptance results form one documentation update, not two new features or runtime fixes.


## Native Tasks duplicate identity and recovery

Port 8780 used the same 138 verified runtime files and synthetic storage. The two existing complete-flow models reran **2/2 passed**. Native UI created two identical titles, filtered them, and edited only the second via its observed row Actions menu. It disappeared from the old filter; focus returned to Add a task. Filtering the new title, Pin next → Next up Complete → Completed → Undo completion preserved the second record identity, reopened it active and did not restore the old pin.

A visible fixture control armed one precommit write rejection before the edit dialog opened. Save task then displayed the normal failure and retained its draft, with no write and the previous saved text unchanged. Typing a newer value **after rejection** and explicitly choosing Save task committed that value. A subsequent explicit Pin next selected the same second record ID. This does not establish native newer typing during a pending save.

The final eight writes were two Adds, initial Edit, Pin, Complete, Undo, successful retry Edit and final Pin. The first duplicate's complete object and original seeded task remained exact; global settings, other workspace registry/bundle, Scratchpad, Focus and Countdown also remained exact. Two DOM-role locator mismatches for native Actions/Pin controls were corrected using fresh observed AX indices; these automation mismatches were not product failures. No runtime change was necessary.

Owned tab 19, dedicated server 8780 and its terminal tab were closed after the stopped marker/shell were verified. Only the original untouched browser tab remained. No clipboard/import/upgrade operation or screenshot upload occurred. This result is grouped with the temporary-focus route below, not counted as a new feature.


## Native temporary focus and return to the full page

The page-level route on isolated port 8781 used all 138 unchanged runtime files. The existing temporary-view model file independently passed **12/12**, exit 0. Native steps used the ordinary 25-minute timer without changing the clock or production timing.

- An unsubmitted task draft prevented entry into Temporary focus view. The page and exact draft remained, the Finish or save notice appeared, and storage writes stayed at zero.
- Explicitly adding that task produced write 1. Entering temporary view showed the centered Focus card and a visible Exit control, with other ordinary page modules hidden and no extra save.
- Start → Pause → Resume produced writes 2–4. Escape restored the original page and note/task visibility while the **complete saved Focus object, including the running deadline, remained exact** and writes stayed at 4.
- Entering again and choosing Stop / reset restored the full page automatically, with Ready to start and keyboard focus on Start. Total writes were 5; no timer restarted automatically.

Scratchpad, Countdown, global settings and the other workspace's registry/content stayed exact. Tasks changed only through the explicit Add and Focus only through its four ordinary timer actions. Presentation entry/exit itself did not save. This bounded desktop Clarity route does not establish every template, assistive technology, or actual elapsed interval completion. No product defect or runtime fix was found.

Owned tab 20, dedicated server 8781 and its terminal tab were cleaned up after stopped-marker/shell verification; inventory retained only the untouched original tab. No screenshots were uploaded. The Tasks and temporary-focus routes close two distinct acceptance gaps in one grouped documentation update; neither is represented as new product functionality.


## Two-tab Scratchpad conflict follow-through

A separate port-8782 fixture shared only its synthetic backend across two owned Chromium tabs through origin-local storage and browser storage events. The bridge adapted those events to its synthetic Chrome-storage subscription interface; the shipped Store, Controller, View and origin Web Locks ran unchanged. This is not a claim about installed-extension Chrome storage, upgrade or migration. A two-context fixture self-test verified bidirectional notifications/reads, precommit rejection and shared write counts; the existing Scratchpad Store/View baseline passed **79/79**.

In A, an explicitly armed synthetic save rejection retained draft A. B's ordinary editor/autosave then saved revision 1. A displayed the latest B text beside its retained draft. Explicit Use saved text adopted B, with no additional write. The sequence repeated with a new retained A draft and B revision 2; A explicitly chose Replace with my draft against that displayed revision. Revision 3 contained exactly A's chosen draft, and the clean B editor updated to the same text. Three successful writes total, with both rejected writes adding none. Tasks, Focus, Countdown, global data and the other workspace registry/bundle stayed exact.

No bug was found. The two tabs, port-8782 server and dedicated terminal tab were closed after shell/stopped-marker verification; only the original untouched tab remained. No screenshots or data were uploaded. This evidence is grouped with the Tasks concurrent-edit route below, not counted as a feature.


## Two-tab Tasks independent edits and reviewed overwrite

Port 8783 reused the validated shared synthetic-backend bridge with two legitimate task identities. Production runtime stayed unchanged; the existing Store/edit-source baseline passed **103/103**, exit 0. These focused counts and native interactions do not imply a new full-suite run.

1. A opened an edit for the first record. B edited and saved the second record. A then saved its still-open first edit: both independent changes survived (2 writes).
2. A opened a new first-record draft. B saved a newer first-record version. A's ordinary Save failed closed with its draft retained and the latest saved task displayed (3 writes).
3. B saved yet another version while A still displayed the earlier review (4 writes). A's first Replace latest with my edit **did not write** or overwrite that unseen version. The editor retained its draft and updated the displayed latest version.
4. A explicitly clicked Replace latest with my edit again, now against the displayed current revision. Exactly one write succeeded (5 total), and B's clean page updated to the same first-record text.

The second record's entire post-independent-edit object remained exact through both conflicts and the confirmed replacement. Scratchpad, Focus, Countdown, global settings and the other workspace registry/content remained exact. No production defect was found. Both owned tabs and only the port-8783 server/terminal were closed after stopped-marker/shell verification, leaving the original tab untouched. No screenshots were uploaded.

Together, the Scratchpad and Tasks routes validate representative cross-page conflict choices with real page controls, shipped controllers and browser Web Locks over an explicitly synthetic storage adapter. They do not establish installed-extension storage events, actual upgrade safety, every asynchronous ordering or any bypass of the separate import/incident gate. This bounded concurrency batch ends here rather than expanding into repeated permutations of already-covered races.

## Four additional structural templates with a retained task draft

On 2026-10-26 an isolated port-8791 full-page synthetic fixture exercised the
current Column (split), Bookmark (right navigation), Dock (bottom navigation)
and Quiet (centered) compositions. This supplements earlier sidebar/top and
historical template checks; it is not a new feature or production fix. The six
existing complete template model files independently passed **46/46**, exit 0.

Column gallery preview and Cancel made no storage write and restored Clarity.
Previewing again and explicitly applying saved Column once. Ordinary template
selection then saved Bookmark, Dock and Quiet. Category controls in their actual
positions correctly switched Work/Reading/All and displayed the corresponding
one/two seeded cards. The unsubmitted task draft remained exact throughout.

Native Chrome zoom produced a measured **586 CSS-pixel document client width**
and 380-pixel viewport height (200%). Quiet's ordinary Finder searched outside
the current Reading category and returned the exact saved Work card; closing it
did not open a site. From the retained task input, a real Tab reached Add without
submitting. Column, Bookmark and Dock were then selected at this zoom and their
category controls operated normally. Each of the four structures measured
`scrollWidth === clientWidth === 586`, with no page-level horizontal overflow.
Focus's Interval and the existing Scratchpad editor remained directly focusable;
no timer action or note edit was performed.

Seven explicit template saves in total changed appearance only. DOM-backed
synthetic readback retained the saved sites, Tasks, Focus, Scratchpad, Countdown,
global privacy/sync/Prompt/Collection records and the other workspace's complete
bundle exactly. The existing custom solid background stayed `#e9edf4`; this does
not test setting a new background, uploading an image or arbitrary-image contrast.
Screenshots were inspected in-tool only, not uploaded.

An initial visit to ordinary `newtab.html` omitted the fixture bridge and showed
WORKSPACE_UNAVAILABLE. Navigating the same owned tab to the intended fixture page
resolved that setup error without any recovery/reset action; it is not a product
failure. A broad Column text locator was also corrected after a strict-match
error before interaction. Neither setup error is counted as product evidence.

Finally Chrome zoom was restored (client/scroll width 1180), only the unsubmitted
synthetic task draft was explicitly cleared, and the owned tab, port-8791 server
and dedicated terminal tab were closed after stopped-marker/shell verification.
Only the original untouched browser tab remained. This bounded light/English
representative pass does not cover all 21 templates at every breakpoint/locale,
screen readers, installed-extension storage, upgrade or the separate import gate.

## Custom appearance preview, save, return and narrow layout

On 2026-10-26, port-8797 used the final local `fa1a242` runtime with synthetic
origin-local shared storage and real production pages/controllers/Web Locks.
Five complete customization/appearance model files passed **96/96**, exit 0.
This extends the previously model-only complete customization flow; no product
code changed or new feature was added for this acceptance batch.

On the actual homepage, Customize previewed a 135-degree black/white gradient,
24px card padding, 20px gap, 16px corners, 40% card opacity and four columns.
Computed CSS showed that gradient, padding and four columns, but write count
remained zero. Cancel returned to the original saved template background and
restored keyboard focus to Customize without writing.

The initial fixture intended to preseed a solid saved background, but inserted
that assignment before the seed-defining script. Readback correctly exposed the
actual unchanged template background. That erroneous fixture-only assignment was
removed; it was not a product failure. Instead, the real Open Settings route
opened an owned local tab, where Solid Color and native text `#aabbcc`/Tab saved
the background in two normal writes. The homepage was reloaded and showed
`rgb(170, 187, 204)` before the remaining checks.

The same full customization was then explicitly saved once (write 3). Reload
retained the gradient, 24px padding, 20px gap and four columns. Selecting Folio
and Dark made the existing two appearance writes (4/5), retained every override,
and preserved the underlying `bg: {type: 'color', value: '#aabbcc'}`. The native
screenshot showed readable protected header/navigation/search surfaces across
the black/white gradient. DOM-backed computed styles showed the card container's
opaque `rgb(36,33,29)` backing and 40%-alpha card surface with light text; opacity
is not promised to reveal arbitrary wallpaper beneath text.

At actual Chrome 200% zoom, document `clientWidth` and `scrollWidth` were both
586 CSS pixels. The four-column preference automatically rendered one 552px
column, without changing its saved value or making a write. The reopened drawer
retained all selected values. Reset preview temporarily cleared overrides and
revealed the saved solid background; Cancel restored the saved custom gradient,
again without writing, and focused Customize. After restoring 100% zoom, choosing
Use saved background and explicitly saving changed only that override mode
(write 6): body returned to `rgb(170,187,204)` with no image while card parameters,
Folio/Dark and the original saved background remained intact.

All target Tasks/Focus/Scratchpad/Countdown content, shared privacy/sync/Prompt/
Collection data, and the other workspace's registry and bundle stayed exact.
This pass did not switch workspaces, reorder cards, upload an image, invoke
external services, or repeat the separate Free-placement acceptance. It does not
claim all palettes/breakpoints, native screen-reader behavior or installed upgrade
safety. Actual tab 48 and the owned Settings tab 49 were closed; only original
untouched tab 9 remained. Server 8797 was stopped with its marker/shell confirmed,
and its dedicated Terminal tab was closed. Screenshots were in-tool only.

These two representative template/customization flows form one documentation
batch, not separate feature deliveries. The import/upgrade incident gate remains
independent and is not changed by these synthetic local-page results.
