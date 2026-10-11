# Workspace appearance customization

This optional appearance slice adds a discoverable Customize drawer alongside the existing template/palette selectors in Dashboard and Settings. No migration writes are made on load.

## Controls and behavior

- Original background, arbitrary solid color, or two-color gradient with angle.
- Information-card padding, gap, corners, surface opacity, and 1–4 columns. Blank numeric values follow the template. Surface opacity never makes the card's text itself transparent.
- Explicit card columns place information cards below shortcuts; rows grow with content. Columns reduce at narrow viewports. Free/Snap shortcut positions and existing shortcut column controls are not rewritten.
- A workspace-aware link opens existing shortcut size, shortcuts-per-row, and module controls.
- Live local preview with a small sample-card display; Save commits, Cancel restores saved appearance, Reset preview returns only this drawer's fields to defaults and still requires Save.
- Template switching preserves custom overrides. Choosing original background restores existing solid/image/template configuration without deleting it.

## Persistence and concurrency

`appearance.customization` is optional and validated. Legacy appearance objects retain their original two-field shape. Imports reject unknown customization fields, arbitrary CSS strings, malformed objects, and nonfinite/out-of-range numbers. Accepted colors are six-digit hex values.

`patchDashboardCustomization` shares the mandatory local write lock and settings generation fence with other writers. It compares and merges only explicitly changed customization fields. Independent fields and template/palette changes merge; conflicting same-field edits and replacement generations are rejected without overwriting newer data. Existing saved sites, drag coordinates, tasks, notes, background images, and workspace/provider settings never travel in the drawer's write.

While previewing, external appearance notifications update the saved return target without replacing the user's draft. On save failure/conflict the preview stays available. Cancel/Escape/Reset and repeated Save are blocked while an actual write is pending. Escape honors active IME composition. The existing shared focus/inert dialog helper restores keyboard focus after dismissal.

## Verified

- 76 focused tests passed: dashboard-customization (12), appearance preferences/concurrency, complete-backup workspaces, and backup roundtrip suites.
- Syntax checks passed for storage.js, shared/appearance.js and shared/dashboard-customization.js.
- English/Chinese customization strings, runtime HTML links and explicit packaging allowlist are covered.
- Candidate runtime ZIP built and source-verified; final integrated package must be rebuilt after all feature commits.
- Whitespace check passed.

These are source, DOM-model and storage tests. Native browser rendering, screenshot review, keyboard behavior, narrow-screen geometry, and the full repository suite have not been run by this worker. Native QA should check Clarity plus Folio/side-column presets, both palettes, saved-image reset, light/dark custom gradients, 1/4 columns at desktop/narrow widths, Cancel and outside/Escape dismissal, another-tab edits, Save/reopen, and a non-default workspace.

## Custom-background contrast correction

A native Today/light/#111111 check exposed unreadable labels, brand, categories, heading and clock on the chosen dark background. The correction adds opaque palette-matched reading surfaces to previously exposed dashboard navigation/header/search/shortcut/footer regions, and Settings header/footer. The surrounding user background remains unchanged. Paint-only surrounds do not change padding, grid geometry, saved palette, card opacity, or Free positions; transparent collection rows inherit a reliable backing as well. Local text tokens on those surfaces contain any legacy wallpaper-contrast override instead of changing root colors or dialog/card palettes. This avoids guessing one foreground color for a gradient that contains both light and dark regions.

58 bounded tests passed: 44 new contrast/contracts (21 templates × light/dark plus two scoping contracts), and 14 existing customization/storage/DOM tests including CSS-order and numeric badInput regressions. Primary, muted, and accent text each meet 4.5:1 against the protected palette surface. These are source/token checks, not a browser rendering claim; the integrated candidate still needs a native repeat of the reported defect and an opposing black/white gradient.

The protected reading regions also include the information-card container: Folio's default transparent cards and custom 40–100% card surfaces retain an opaque palette-matched backing. Individual card-opacity declarations and stored values are unchanged. A focused regression checks Folio coverage and alpha composition for all allowed opacity percentages across all 21 light/dark palettes; with custom backgrounds the backing intentionally favors readability over showing the wallpaper through card text.

Final refinement: the information-card backing uses the distinct palette **page** color, rather than the card's own surface color. All allowed opacity percentages blend surface into page and retain a visible RGB difference (40% versus 100%) in every template/palette, while all primary/muted/accent text stays above 4.5:1. The en/zh drawer hint explicitly explains that custom-background card opacity blends against a contrast-safe backing panel; it does not promise wallpaper transparency.
