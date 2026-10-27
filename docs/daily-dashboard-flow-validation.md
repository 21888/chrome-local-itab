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

## Countdown ordinary editor → card → cancel/hide/show

Port 8798 exercised the shipped Countdown flow over synthetic storage after nine
complete Countdown test files passed **467/467**. Settings search for Days from
today opened the correct section. A synthetic multilingual title, Show enabled,
and After today / 2 produced the draft date `2026-10-28` and “2 days left” on the
observed local calendar date, with no write. Explicit module Save wrote once.
The actual homepage displayed that exact saved title/date and day count.

The card's Edit anchor opened workspace-specific Settings. Changing only the
synthetic title then confirming Cancel discarded that draft and restored the
saved text, with write count still one. The card's Hide wrote only its enabled
state (write 2), retaining title/date. Opening Settings, showing Countdown and
explicitly saving (write 3) made the original homepage card reappear without a
reload. Other personal modules, shared privacy/sync/AI libraries and the other
workspace stayed exact. No file, clipboard, system clock or provider was used.
This is not a native DST/midnight or imported-file test. Tabs 50–52, server 8798
and its dedicated terminal were closed; only the untouched original tab remained.

## Reversible Prompt Trash and Collection Archive recovery

Port 8799 used valid synthetic snapshots built by the real stores/controllers:
one Prompt and one linked Collection, each with two body versions; the result
linked specifically to Prompt v1, not current v2. The complete controller chain
proved stable IDs, text, history, notes and exact reference across removal and
restoration. Nine related complete files passed **162/162**.

The real Collection details showed its current excerpt, two versions, annotation
and exact older Prompt body. Following its actual Prompt link opened the correct
record. With global homepage search already open, Archive result → confirm Move
to Trash for Prompt → Restore prompt → Restore from archive produced four writes
and live search counts **2 → 1 → 0 → 1 → 2**, without Refresh or reload. Trash and
Archived views retained the bodies and histories. After restoration, selecting
v1 in Prompt history displayed the exact restored result link; current v2 remained
unlinked. Body/current-version IDs, historical versions, notes and promptRef stayed
unchanged; normal revision/version/timestamps changed, so whole-record equality
is not claimed. All workspace modules, privacy/sync and the other workspace's
registry/bundle remained exact.

This is reversible user-interface recovery of synthetic records, not permanent
deletion, JSON restore, real user-data incident recovery or installed-extension
upgrade acceptance. No import/export, file, clipboard or model call occurred.
Owned tabs 53–55 were closed; a second inventory confirmed only original tab 9.
Server 8799 and its dedicated terminal were stopped/closed normally. No production
defect was found in either chain, and no screenshots were uploaded.

## Manually maintained local Weather, Topics and Movie cards

Port 8800 exercised actual Settings and homepage rendering with no online card
provider. Four complete topic/settings files passed **162/162**. Visibility was
enabled for the three existing cards; local city/condition/temperature/range/AQI,
movie title/note and two topic groups were entered. Adding a Baidu topic with
score 12345 retained the other unsaved form fields; adding a Weibo topic with
score 77 and ordinary Save produced the intended complete configuration.

The actual homepage rendered the synthetic weather values (18°, low/high 12/24,
AQI 35), multilingual city and condition, movie text with a placeholder rather
than an image, and the saved active Weibo topic. Topic-group selection is an
existing Settings preference; no homepage group-switch control is claimed.
Reopening Settings retained both groups. Native title/score prompts changed the
Baidu entry to the intended new title and 54321; confirming Delete removed only
the synthetic Weibo entry. Saving Baidu as the active group and returning to the
homepage displayed the edited topic while weather/movie values stayed intact.

Nine actual writes included the existing visibility/group automatic saves,
topic helper saves and explicit ordinary Saves; this is not described as a
single manual transaction. Every other personal module, shared privacy/sync/AI
library and other workspace registry/bundle stayed exact. The test did not use
images, posters, file selection, live weather/topics, site opening or provider
permissions. Native prompt/confirm opening caused expected tool click timeouts;
the pending dialogs were handled directly without repeating the original action.
No product defect was found. Tabs 56/57, server 8800 and its dedicated terminal
were closed, with final inventory showing only the untouched original tab 9.
The Countdown, reversible-library-recovery and local-card checks are one bounded
acceptance batch, not three new features or incident-release authorization.

## Mixed-origin removed Tasks: native component restoration (2026-10-27)

A dedicated port-8819 page mounted the actual Tasks Store, Controller, View,
Dialog focus helper and lifecycle, with unchanged production CSS. These six
runtime files match the blobs at `31cd61a9ca429fddd16d5ab8d41daa75bd6d0e6e`.
The backend used actual browser Web Locks and explicitly synthetic sessionStorage;
this is component acceptance, not a full-dashboard or installed-extension test.
Seven valid records included two identical CRLF/Unicode/literal-HTML texts removed
from different states, two unselected removed records, an unrelated pin and a
sentinel with an existing receipt produced through the actual Store.

The native selection dialog began with no selection and showed each original
Active/Completed destination. Selecting the two identical texts, reviewing and
cancelling wrote nothing and retained the quick-entry draft. Reopening again
started unselected. Explicit review and one confirmation restored only those two
identities: one active, one completed. The complete unselected records, pin,
record order, original receipt and all original text stayed exact. One write
incremented revision 1 to 2 and appended one receipt. The quick-entry draft stayed
unsaved with appropriate status. After explicitly clearing that synthetic draft,
reload retained the saved result with no second write; draft survival across
reload is not claimed.

The first fixture omitted its workspace-owner identity and correctly received
an unavailable-storage refusal. It was cancelled without a write. Only the fixture
was corrected to supply the fixed synthetic owner used by existing model tests;
no production guard changed. Seed validation, fixture syntax and runtime-byte
comparison passed. Existing model/full-suite counts are not presented as new runs.

## Conflict-preserving Scratchpad copy routes (2026-10-27)

Port 8820 mounted the actual Scratchpad Store/Controller/View and production CSS
with two Store instances sharing a synthetic memory backend under browser Web
Locks. A separate, explicit `clipboard` dependency captured text in page memory
and could reject one requested write. **No system clipboard, clipboard permission,
file import/export, provider, or account was accessed.** These native controls
exercise the shipped copy logic, not actual OS clipboard behavior.

- Before editing, Copy current text retained the original controller CRLF bytes
  even though the native textarea displayed LF.
- A visible fixture control rejected the next ordinary autosave before commit.
  A second Store then saved a different BOM/CRLF/CR/LF snapshot. The retained draft
  and its actual selected text could be copied without any data write. Copy saved
  text remained disabled because the previous save was unconfirmed; this guard
  was not bypassed or described as a defect.
- Explicit Use saved text ended that synthetic conflict without a write. A new
  ordinary edit followed immediately by the second Store's explicit update
  produced a clean conflict, with the original autosave delay unchanged.
- Copy saved text then encountered the one armed memory-copy rejection. The UI
  retained both versions and explained explicit retry. Native Enter on that same
  button retried successfully, with the identical complete saved BOM/CRLF/CR/LF
  payload. It did not substitute the newer editor draft or resolve the conflict.
- In that same conflict, Copy current text captured the entire current draft;
  Ctrl+End then Shift+Home made a backward native selection at UTF-16 `[50,74)`,
  and Copy selected text captured only `New retained local draft`. The selection,
  draft and saved snapshot remained unchanged. The saved state stayed revision 2
  with two successful Store writes throughout these copies; one earlier rejected
  save is counted separately, not as a successful write.

The conflict was explicitly resolved with Use saved text only after preserving
all readbacks, to close the disposable page normally. No runtime defect was found.
Six runtime files were byte-compared and fixture syntax checked; this did not rerun
or extend the historical full-suite result. These checks do not establish native
permission denial, physical-key repeat, OS IME, real Chrome storage, crash/upgrade
recovery, or all asynchronous schedules. The initial Tasks fixture refusal and Scratchpad copy-denial
results remain part of the evidence, not discarded failures.

Both fixtures and all native readbacks used synthetic data only. Owned tabs
84/85/86 and dedicated servers 8819/8820 and Terminal tabs were closed normally;
the pre-existing Chrome tab 83 was not touched. Screenshots were inspected only
in-tool. No screenshots, runtime files or profiles accompany this grouped QA
update; no new feature, version, Release, CWS action or incident resolution is claimed.

## 2026-10-27: occupied-category removal and recent-calculation copying

This bounded follow-on batch uses separate local synthetic pages, not installed-extension or upgrade validation. It changes no production source. The two fixtures each had 166 common non-wrapper files byte-identical to the current local source, including assets; that number is not a runtime-manifest count. Original browser tabs were preserved; owned tabs and servers were normally closed. No screenshots or binary evidence are included, and no full suite was rerun for these checks.

### Occupied category → homepage fallback → Finder → reload (8821)

Actual Options, StorageManager, category navigation and Finder were used. A category named Reading contained a saved shortcut, while Work and its unrelated shortcut remained. Deleting only Reading through its native settings control and allowing the normal autosave produced one synthetic workspace write. Shortcut objects (including their original `reading` category IDs), layout, personal data and Default workspace stayed exactly equal.

Returning to the same Work homepage selected All and displayed both shortcuts. Finder's category selector retained the otherwise orphaned raw `reading` ID with count one; selecting it showed exactly the retained shortcut and its original URL as text. Neither the shortcut nor an external destination was opened. Reload kept the All fallback and both shortcuts. This verifies discoverability without claiming that category removal reassigns or deletes its member shortcuts. Normal category preference localStorage behavior is separate from the counted workspace write.

A bounded actual-code model independently exercised the same deletion and fresh navigation/Finder flow. Two initial fixture errors were corrected before its passing result: separate Options/newtab VM contexts were required for their top-level declarations, and the limited DOM fixture needed the actual shortcut visibility selector. Neither correction changed production or relaxed preservation assertions. This one model result is not an additional full-suite pass.

### Recent calculation → newer draft → copy rejection → keyboard retry (8822)

The actual search/calculator initializer received the literal expression `  = 1.0e-07  ` through native input and Enter. It produced `1e-7` and one page-local recent record. The input was then replaced with `New unsaved calculator draft`, without submitting a search.

A deliberately rejecting **in-memory clipboard adapter** captured a click on that record's Copy calculation button. The visible failure retained both source strings and the newer draft. An explicit Enter on the same native button then succeeded and left focus on that button. Both attempted payloads were exactly the original expression, one LF, and `1e-7`: no labels, newer draft or trailing newline were added. The history remained one unchanged record. Folding/reopening recent history retired the old success feedback while retaining the record and draft, without a third copy attempt.

Final synthetic storage readback showed zero writes, unchanged links/layout/personal data/other workspace, and no external/provider attempts or errors. The synthetic unsaved input was explicitly cleared only after preservation evidence, for cleanup. The fixture reused the preceding valid category seed and its visible storage-proof label; no category action was taken in this second flow.

This closes the native activation/readback gap left by the historical recent-copy model report; it does not test OS clipboard contents, real browser permission denial, assistive technology, every pending-copy race or IME sequence. Existing model results remain separately scoped. Neither flow establishes recovery from the historical data-loss incident or removes the store-release gate.

## 2026-10-27: filtered completed-task reopening and historical long-text reading

This second bounded batch closes two distinct native gaps, without production changes or repeating full green suites. It uses synthetic local backends, actual production components and native controls; no installed-extension, upgrade, system clipboard, account or provider acceptance is implied.

### Filtered Completed → select one exact identity → cancel/confirm → reload (8823)

The actual Tasks Store/Controller/View used seven valid synthetic records, including three completed tasks. Filtering by `相同` displayed two identical-text completed records and excluded the third. With an unsaved quick-entry draft present, the selector began with nothing selected. Selecting the first identity and reviewing its numbered complete original, then Cancel, left writes at zero and revision at one. Reopening the selector again began with nothing selected.

Selecting only that first identity, reviewing and explicitly confirming produced one write, revision two and one additional receipt. Only the selected ID became active with a new version. The same-text sibling, hidden completed task and all other unselected records—six in total—remained exactly equal, as did pin, record order, original text and the prior receipt. The quick draft and filter remained; the filtered page showed one active and one completed row. After explicitly clearing the synthetic draft for cleanup, reload showed Active 3 / Completed 2 / Removed 2 and the same one-write state. No automatic reopening of all records, restored old pin, new Undo or persistence of an unsaved draft across reload is claimed. Six component source files were byte-identical to the current source; the only preliminary local check validated the synthetic seed, rather than rerunning prior batch suites.

### Same-record historical versions → independent long-text reading (8824)

A full Collection page used three legitimate saved histories generated through the real Store's add and reviewed revision operations. The first and third originals were identical 7,851-UTF-16-unit strings containing 160 numbered lines, tabs, Unicode, HTML-like literals, CRLF and a bare CR. The middle version differed only by converting CRLF to LF. Offline seed construction is separate from the page's zero-write read-only session.

The dialog initially selected the latest two IDs and correctly reported that their originals were not exactly identical, although both displayed 7,692 units after line-ending normalization. Native selection of first versus third reported exact equality across distinct IDs; selecting the same ID on both sides produced the separate same-version label. The Current marker remained attached to the exact third version.

At 1,165 CSS pixels, the two columns were side by side. Native Tab and End scrolled the left body to 3,250 pixels while the right remained at zero; Tab and PageDown then scrolled the right independently. Actual browser zoom narrowed the CSS viewport to 666 pixels, where the two bodies stacked. Keyboard Home on the first and Tab/End on the second kept both independently reachable: left zero, right 3,396 pixels (3,590 scroll height / 194 client height). The Close button remained reachable below the second body. Escape returned focus to the original history-reading entry, and browser zoom was restored before cleanup.

Final readback showed zero page storage writes, exact equality of the entire saved collection library and no recorded errors. No history was restored, source URL opened, content copied or sent to a model. Native screenshots were inspected in-tool, not uploaded or committed. These checks do not establish screen-reader/IME behavior, every interruption or actual installation/update behavior. Both owned pages, servers and terminal tabs were normally closed, preserving the original browser tab.

## Historical Prompt reuse and page-local browsing — 2026-10-27

### Selected historical body → independent new Prompt (8825)

A separate loopback full Prompt page used actual Store-generated synthetic data: one record with three saved bodies, changed current metadata and comma-bearing tags, plus a Collection result linked to the original historical identity. All 138 shared runtime files matched the current checkout. This is cloud Chrome interacting with a synthetic storage bridge, not an installed-extension or migration test.

After using the middle version and filling its variable, the operator selected the first history without activating it and explicitly opened a new draft from that body. The draft contained the selected original template—not the filled middle preview or latest body—and current saved metadata. Changing its title and returning to the original retained the middle preview. A further historical-draft action was disabled while the existing new draft remained available; Continue existing draft returned its exact body/title and title focus, with zero writes so far.

Explicit Save made one write and a new Prompt ID with one fresh history. The entire original Prompt and linked Collection library stayed equal; the new record did not inherit the original result association. Literal placeholders, original CRLF/bare-CR body and exact comma-bearing tag array were preserved, together with current category, tool and favorite. Reload retained the two independent records and the one-write state. This does not claim temporary variable values survive reload. The fixture's first post-click proof preceded asynchronous save settlement; the final proof was explicitly read after settlement rather than treating that transient zero as a failed save.

No provider, clipboard, permission, import, restore, file selection or external navigation was exercised. Owned page/server/terminal were normally closed; screenshots remained in-tool only. No product change or new automated-suite result is claimed.

### Title ordering → filtered browsing → return to draft and history (8826)

Six Store-generated prompts distinguished default favorite/update ordering from numeric title ordering, base-equivalent `Alpha 2`/`alpha 2` with known ID order, and `中 2`/`中 10`. Actual native Home/End on Sort this page switched between both choices while keeping selector focus. Title order put the two alpha-2 records before alpha-10 and the favorite Zulu-10, with the equal-title order matching the saved ID tie-breaker; the Chinese numeric pair also stayed 2 before 10. This English-page observation does not establish identical Chinese collation across browser versions.

An activated historical preview containing `KEPT THROUGH SORT` retained both its exact version and completed text through sorting. A new unsaved title/body then survived reorder, the actual query `alpha` + Work category + exact study-tag intersection (two matching records), and Clear filters (all six, title mode retained). Returning to the saved prompt preserved its historical preview, and returning to the draft preserved its title/body. At an actual zoomed 674-CSS-pixel viewport, the native selector and adjacent draft remained readable and operable with visible selector focus and no positive horizontal overflow; zoom was restored afterward. This is not mobile-device or screen-reader acceptance.

Only the synthetic draft was explicitly discarded before reload. Reload restored Default order with the favorite first. The final visible proof showed zero storage writes, exact equality of the complete synthetic storage object and no errors. The shared 138 runtime files were byte-identical; fixture-seed checks used the real Store/Controller without rerunning the old green suite. Owned page, server and terminal were normally closed. No clipboard or provider was invoked, and no screenshots or fixture binaries were committed.

## Prompt capacity exits — 2026-10-27 (8827–8828)

Two independently seeded full Prompt pages exercised declared application limits through actual UI saves, rather than injecting controller error states. Each used 138 current byte-identical runtime files and a synthetic local storage bridge. Offline seed writes are not counted as native session writes. This finite batch does not cover browser quota, disk durability, lost acknowledgements, every byte/recovery limit or installed-extension upgrades.

For the 20-body-version boundary, the real Store/Controller built one legitimate record with twenty histories. Editing its body to a twenty-first draft and clicking Save produced the actual history-limit message, zero writes, an unchanged complete original record and an editable retained draft. Explicit **Save draft as new prompt** then wrote once, creating a different Prompt ID, revision one and one fresh body history with the exact attempted text. The original ID, revision twenty, current body and all twenty original histories remained equal, as did the linked Collection library. The same title was permitted: the two cards displayed their distinct bodies. Returning to the original and reloading confirmed both records and the one-write result. No history was pruned, restored or replaced.

For the 200-record boundary, 200 real Store additions and one removal prepared 199 active prompts plus one Trash record. A new titled Unicode/placeholder draft could be edited, but explicit Save correctly refused at capacity. The message explained that Trash counts toward the limit and moving items there does not free space; the backup link was visible but not opened. The entire synthetic storage object remained equal with zero writes. Close editor followed by Cancel preserved the draft and returned focus to Close editor. Filtering to Trash, opening its one saved record and returning through the draft shelf preserved the original new title/body and focused its title. Only the synthetic draft was explicitly discarded for cleanup; reload still showed 199 active plus one Trash, revision unchanged, zero writes and no errors. There was no automatic eviction, permanent deletion or import.

Both owned pages, servers and terminal tabs were normally closed. Before-reload comparisons establish equality to the original seed; each page's post-reload equality indicator alone is not used to prove that original comparison. No screenshots or fixture binaries were uploaded or committed, no production code changed, and no new full-suite result is claimed.
