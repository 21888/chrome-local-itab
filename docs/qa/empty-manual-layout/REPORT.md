# Empty manual-layout placement

## Defect and fix

In free and snap placement, the Add shortcut tile was positioned from shortcut
rectangles alone. An entirely empty dashboard or a category with no matching
shortcuts still rendered its empty-state message in normal flow, while Add was
absolutely positioned at the same top edge. This could overlap the message and
its actions, especially at narrow widths or with longer translations.

The placement pass now includes the visible empty-state rectangle. Add follows
that block with the existing 16px gap, and the canvas includes Add's full height.
Hidden category messages do not reserve space after returning to a populated
category. This is display-only; saved coordinates and layout settings do not
change.

## Regression evidence

`tests/free-layout-empty-state.test.js` exercises the production render, category
filter, layout and template-refresh paths in the repository's DOM/geometry model.
The original code fails because Add is at `0px` when the visible message ends at
`234px`; the expected top is `250px`.

Coverage includes all 15 templates, both manual modes, global and category
emptiness, three message heights (including a panel taller than 320px), repeated
reflow, template refresh, populated/empty category round trips and no persistence
writes. The focused geometry, layout-mode, regroup-focus and template-reuse suites
also pass.

These automated checks model DOM rectangles; they are not native-browser visual
or keyboard acceptance. No screenshots, personal data or raw exports are included.

## Bounded native acceptance

2026-10-11, isolated dot cloud Chrome for Testing 155.0.8059.39. Tested newtab.js SHA256 `835738ea5b1911ba18d2151fbbf1e25df9c3bd7275e3ed1f5260081737ba5334` matches the release implementation. The loaded builder manifest was 1.1.40; the final package is 1.1.41.

- Truly empty Free and manual-snap layouts keep the full empty panel and its actions unobscured, with Add visibly below.
- Both Add entry points open the ordinary focused dialog; Escape dismisses.
- Saving one synthetic shortcut removes the empty reservation; choosing an empty category restores it correctly. Show all returns to populated content.
- Clarity/light and Folio/dark passed; measured responsive 320/1188 CSS-pixel widths preserve readable, reachable controls and reflow.

Widths are emulated CSS viewports, not physical-window measurements. The visible gap was not independently measured to exactly 16px. All 15 templates are automated coverage, not exhaustive native coverage. Native translated/long-copy cases, screen readers, process restart and byte-exact no-write checks were not tested. Integrated tests: 1,757 Node and 53 Python pass; independent focused geometry audit passes. No public screenshots or raw exports are included.
