# Full-page template matrix — 2026-10-26

## Scope and result

All 21 current templates have full-page interaction evidence at **1180 CSS px
(100% native browser zoom)** and **586 CSS px (200% native browser zoom)**.
This closes the bounded template/resolution matrix, not every possible viewport,
locale, palette, content density, browser, or accessibility configuration.
No product defect was found in this matrix; this is an acceptance record, not a
feature or a runtime fix.

The new run used an isolated loopback page on port 8801 with the production
dashboard, template/gallery/card-layout code, and personal-card controllers.
Chrome storage was a synthetic origin-local bridge with two valid workspaces;
browser input, layout, focus and Web Locks were native. This was **not an
installed-extension upgrade or real user-data recovery test** and does not
clear any upgrade/import incident or release gate.

Source: local runtime commit `fa1a2421b4131f67aad847f79e59d57827c6bffd`.
The dashboard's `newtab.js` SHA-256 was
`e1f20d73bf7825d202ea0c40504c1f68a9c344392ab79e21559858bb789be7f3`.

## Finite matrix

| Template | 1180 px | 586 px |
| --- | --- | --- |
| Clarity | New pass | New pass |
| Graphite | New pass | New pass |
| Folio | New pass | New pass |
| Atelier | New pass | New pass |
| Quiet | Reused 8791 | Reused 8791 |
| Studio | New pass | New pass |
| Console | New pass | New pass |
| Prism | New pass | New pass |
| Library | New pass | New pass |
| Horizon | New pass | New pass |
| Ledger | New pass | New pass |
| Meadow | New pass | New pass |
| Blueprint | New pass | New pass |
| Terrace | New pass | New pass |
| Column | Reused 8791 | Reused 8791 |
| Dispatch | New pass | New pass |
| Today | New pass | New pass |
| Bookmark | Reused 8791 | Reused 8791 |
| Dock | Reused 8791 | Reused 8791 |
| Mosaic | New pass | New pass |
| Paper | New pass | New pass |

That is **34 new cells plus 8 reused cells**, not 42 newly executed cells.
The reused Column/Bookmark/Dock/Quiet interactions are documented in
`daily-dashboard-flow-validation.md` under the four structural templates.
Before reuse, eleven relevant runtime assets were byte-compared against that
8791 fixture: `newtab.js`, the three dashboard template/gallery/customization
stylesheets, registry, gallery, card-layout and appearance modules, and the
Tasks/Scratchpad/Focus views. All were identical. Earlier 388 px observations
are separate evidence, not substitutes for these 586 px cells. Clarity was
checked afresh rather than reusing an older partially different startup source.

## Actual interactions and observations

For each of the 17 new desktop templates:

1. Preview the template with the existing content, then Cancel. The synthetic
   write count and the unsubmitted Tasks draft remained unchanged.
2. Preview again and Apply. The intended template became the selected and
   saved template; personal cards remained mounted with their content.
3. Click Work and read `Work · 1`, then click All for both saved sites.
4. Click the Tasks draft and press Tab: focus moved to Add without submitting.
5. Click the Scratchpad editor and the Focus Interval selector, then Escape
   without changing the interval or starting a timer.

At 586 px, each of the same 17 templates was selected through the existing
compact selector (its normal immediate-save contract), followed by steps 3–5.
These were ordinary locator clicks and keyboard input, not forced clicks,
runtime mutation, or synthetic dispatched DOM events. The earlier reused cells
retain their originally documented action scope; no new claim is made that
each reused template individually received a Preview/Cancel cycle.

Every new cell retained the exact unsubmitted text `Matrix unsaved 日本語 🧪`,
the saved Scratchpad content, and the ready 25-minute Focus timer. Add received
keyboard focus and Interval received focus after the interactions. The controls
could be scrolled into view and clicked without an occlusion bypass. Document
`scrollWidth` equalled `clientWidth` in all 34 new cells: 1180 or 586 respectively.
Screenshots inspected the desktop structural layouts and representative narrow
layouts; no screenshot upload was performed. The check does not assert that
every control is simultaneously above the fold: Folio/Today use a taller side
column on desktop and narrow templates use normal vertical scrolling.

The original full-page Graphite layout exposes its appearance controls directly
and hides the outer Appearance summary. One attempt to close that invisible
summary was rejected by the locator; the visible Browse layouts disclosure was
then closed normally. This was a harness assumption, not a product failure or
permission bypass. No source change was made for it.

## Writes and preservation

There were **33 effective template writes**: 16 desktop changes and 17 narrow
changes. Applying the initially selected Clarity was a no-op and wrote nothing.
Every new desktop Cancel left the write count unchanged. Work/All selection
used the normal existing category preference behavior; this record does not
claim that user navigation never stores preferences outside the synthetic
Chrome-storage write counter.

The visible readback confirmed all Tasks, Scratchpad, Focus and Countdown data
exactly equal to their initial snapshots, both global libraries/privacy/sync
unchanged, and the other workspace's registry entry and bundle unchanged.
The two original shortcut records retained their title, URL, icon and category;
no site was opened. No task was added, timer started, note imported/exported,
external model invoked, or file selected.

At the end, only the synthetic unsubmitted Tasks draft was explicitly cleared;
the write count remained 33. Zoom was restored to 100%/1180 px. The owned tab 58
was closed, the dedicated 8801 server stopped normally, and its Terminal tab
closed. The final browser inventory at 23:49 UTC contained only the untouched
pre-existing tab 9.

## Automated supporting evidence

The six complete `tests/template-*.test.js` files passed **46/46** before this
native run. There is no new full-suite claim for this documentation-only work;
the underlying runtime retains its separately recorded regression/CI evidence.
The matrix does not cover screen readers, OS IME, installation/migration,
online providers, imported files, all background contrasts, or arbitrary custom
card sizes. Those require their own scoped evidence rather than extrapolation
from this matrix.
