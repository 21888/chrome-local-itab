# Clarity dashboard component rebuild

Date: 2026-10-18. Source baseline: `7b8c6a90ed95ae514ceb76e8e9e0a8c22c3610c7`.

## Scope

This candidate rebuilds the existing Clarity dashboard. It does not add a template, change the default preference, change any storage/schema/protocol, or migrate the vanilla DOM/IIFE architecture. Manifest 1.1.155, permissions, release configuration and other templates' styles remain unchanged.

- A 208px desktop category rail with an opaque, palette-matched surface.
- A shared top command row for the original workspace controls and compact Tools/Appearance disclosures.
- A compact title and clock, 56px search controls, aligned shortcut title/actions, and visually secondary information cards.
- A 14px baseline, auxiliary labels of at least 12px on the redesigned surfaces, 36–40px utility controls, 8/12px radii and restrained existing palette tokens.
- The original appearance, template-gallery, customization, AI, recovery, workspace and settings controls retain their IDs and owners. The markup wrappers exist before those controls initialize; mounted controls are never moved.
- Opening either disclosure creates an in-flow configuration row. Opening both keeps both panels in normal flow, including when focus moves elsewhere. Saving, error and preview states expose the original status/control host without taking focus.
- The other 20 templates keep the original expanded controls. Switching back to Clarity preserves the focused control and locally remembered disclosure state without a preference write.

Saved column counts, dashboard padding, shortcut typography/icon variables and opt-in card customization remain authoritative. Only non-free direct shortcut tiles receive new geometry. Existing free-layout coordinates, drag behavior, actions and visibility states remain owned by the existing implementation.

## Actual Bulma integration

`vendor/bulma/clarity-components.css` is compiled from the official Bulma 1.0.4 Sass sources, not a handwritten imitation. The source closure contains 16 unchanged upstream Sass files. The selected official modules are:

- `elements/button`
- `form/input-textarea`
- `elements/box`
- `elements/title`
- `components/menu`

Bulma's supported `class-prefix` and `cssvars-prefix` are both `itab-b-`. Every generated selector is scoped to Clarity. Official light/setup/dark token mixins are emitted only on the local `.itab-b-root` under the existing `data-color-mode` axis. The bridge uses the existing `--template-*` semantic tokens. No global reset, modal implementation, global/system theme selector, remote resource, font request or runtime compiler is included.

The generated CSS is 52,685 bytes. SHA-256:

`5f51f2de9fc1ea80bbcb5b22988064d7957d25374c03988f793189c0c800413b`

The original MIT license is preserved at `vendor/bulma/LICENSE`. `vendor/bulma/PROVENANCE.json` records the official package URL, npm SHA-512 integrity, SHA-256 hashes, pinned compiler dependencies, the complete vendored source inventory, build entrypoint and generated output hash.

The runtime whitelist adds exactly five files:

1. `vendor/bulma/clarity-components.css`
2. `vendor/bulma/LICENSE`
3. `vendor/bulma/PROVENANCE.json`
4. `clarity-dashboard.css`
5. `shared/clarity-dashboard.js`

The build entrypoint, offline build helper and upstream Sass sources are not included in the extension runtime. Existing CI does not install a new dependency or compile Sass; it packages the checked-in, verified local CSS.

## Offline reproduction

Use the fixed official npm archives listed in `vendor/bulma/PROVENANCE.json`, verify their listed SHA-256 and SHA-512 values, and extract a local compiler dependency tree. The toolchain used here was Dart Sass 1.86.3, chokidar 4.0.3, immutable 5.1.1, source-map-js 1.2.1 and readdirp 4.1.2. No global installation is needed.

Run:

```sh
python3 tools/build_bulma_subset.py --sass /absolute/path/node_modules/sass/sass.js
```

This checks the pinned compiler/dependency versions, original source/entrypoint/license hashes, compiles the local Sass entrypoint with no source map, checks selector/token scope and runtime-resource exclusions, and compares the resulting bytes with the pinned checked-in output. It does not access the network or install anything. `--write` can reproduce the same expected CSS bytes; it does not silently accept a changed upstream or output hash.

## Focus and cascade safeguards

The small disclosure adapter is display-only. It has an idempotent mount and fully removable listeners/observers. A retired handle cannot remove a newer mount. Native select/input Escape, composition, already-handled nested Escape and existing preview cancellation remain with their original owners. Explicit closure restores summary focus only for owned focus; asynchronous status updates do not steal focus.

Additional cascade safeguards address the existing layered styles:

- Reset the wrapper's old fractional grid rows to natural rows, so a tall viewport cannot turn the search row into a large empty spacer.
- Give visible heading/clock/workspace descendants safe semantic surfaces when a custom solid/gradient or legacy wallpaper is active. A `display: contents` header cannot provide its former safety background.
- Explicitly place narrow-screen search input and submit controls into their two-column row instead of inheriting the legacy full-row submit rule.
- Preserve distinct heading/clock/configuration rows when the later month-calendar stylesheet expands its old header grid at 600px and below.
- Keep non-overlapping, naturally wrapped disclosure panels in either opening order, independent of focus.
- Keep user customization after the component bridge; do not rewrite its settings or saved geometry.

## Verification completed

- 24 explicitly named Node test files, serial concurrency and 512MB Node limit: **298 passed, 0 failed**.
- The new `tests/clarity-dashboard.test.js`: **15 tests**, including all other templates, source-owner/focus behavior, both disclosure opening orders, status visibility, idempotent cleanup, narrow search, calendar cascade contracts, wallpaper safety, natural rows, module scope and provenance hashes.
- `tests.package_extension_test`: **19 passed**.
- Offline compiler reproduction: byte-for-byte match with the hash above.
- `node --check` for `newtab.js` and `shared/clarity-dashboard.js`: passed.
- `git diff --check`: passed.
- Independent owner integration checks using the production Appearance controller and StorageManager: **16 passed**, covering English/Chinese, preview/error/Apply/Cancel/IME behavior and preserved single-write/lock behavior.
- Independent full Python suite: **84 passed**.
- Independent official Sass reproduction and runtime byte comparison: matched.
- Independently built runtime package: **138 files**, **4,193,791 bytes**, SHA-256 `c4ea657bd254f7721b03409603726aba8cadb59e2565916168cef06f942cdb8b`.
- Independent source/cascade review rechecked the narrow-search, wallpaper/readability, dual-disclosure, calendar-row and natural-grid-row fixes. These are source/model checks, not browser visual validation.

The packaging test's old exact count was first run unchanged and failed at `PackagingTests.test_runtime_inventory_and_determinism`: `133 != 138`. With approval, only that count was changed to the actual 138 entries and byte-equality assertions were added for all five new runtime files, plus exclusion of upstream build sources. No old assertion was removed or weakened; existing test helpers are unchanged.

The explicit focused Node files were:

```text
tests/clarity-dashboard.test.js
tests/template-rendering.test.js
tests/template-live-preview.test.js
tests/template-refresh-reuse.test.js
tests/appearance-preferences.test.js
tests/dashboard-customization-contrast.test.js
tests/shortcut-toolbar-layout.test.js
tests/shortcut-toolbar-focus-padding.test.js
tests/layout-modes.test.js
tests/free-layout-fitting.test.js
tests/dialog-focus.test.js
tests/search-draft-lifecycle.test.js
tests/search-regression.test.js
tests/local-calculator-integration.test.js
tests/local-calculator-copy-result.test.js
tests/local-calculator-recent-results.test.js
tests/local-calculator-recent-copy.test.js
tests/local-calculator-recent-remove.test.js
tests/local-calculator-continue-result.test.js
tests/month-calendar-integration.test.js
tests/dashboard-field-writes.test.js
tests/template-gallery-integration.test.js
tests/dashboard-card-layout.test.js
tests/dashboard-card-layout-backup-compat.test.js
```

## Validation boundary

These checks establish source, package, DOM/event-model and targeted cascade contracts. They do not establish browser geometry, visual quality, native popup painting or actual extension loading. No browser launch, screenshot capture/upload or release was performed for this candidate by this implementation step.

Real-browser review remains necessary through an approved route: English/Chinese, light/dark, default/custom/legacy wallpaper, wide/tall/390px/600px layouts, both disclosures, gallery preview/Apply/Cancel/error, expanded month calendar, grid/free layout, saved column counts, keyboard/context-menu focus, quote-only and temporary-focus views. No new permission or alternate rendering route is implied by this checklist.

## Follow-up: real-browser static preview and narrow date correction

2026-10-18, baseline `26d79b7bb691131054dc4443621de96fb9e3b232`.

A supported dot-cloud desktop terminal and its ordinary localhost browser now
provide a working static preview route. This supersedes the earlier connectivity
blocker for this limited preview. The server freezes all 138 runtime files and
their SHA-256 hashes. The production HTML receives one extra, preview-only local
Chrome API bridge, with synthetic page-memory storage, localized test sites,
disabled sync and blocked external navigation. No extension is installed and no
user profile or saved data is read. Only the iTab tab was captured, locally;
screenshots and preview infrastructure are not published in the repository.

The first pass visibly checked English/light and Chinese/dark at 1172 CSS pixels,
legacy-style synthetic wallpaper, and free placement. The latter retained the
seeded first two positions of 0px and 120px. Both Tools and Appearance panels
occupied separate, non-overlapping rectangles; Escape closed only Tools and
returned focus to its original summary while Appearance stayed open.

At a 390px-wide embedded viewport (382px content width after its scrollbar), a
real cascade defect was found: the legacy narrow `.date-display` cap of 135px
still applied. The English date wrapped onto three lines although the grid row
had 348px available. The clock was only 135px wide and 130.75px tall.

The correction is limited to the existing Clarity `max-width: 620px` block:
`#clock-container` gets `width: 100%`, and `.date-display` gets `max-width: 100%`.
No font, wrapping, ordering, stored layout, custom setting or non-Clarity rule is
changed. The same real browser then measured a 348px clock, a single 19.1875px
date line, and a 92.375px clock height. Search moved up by 38.375px. Horizontal
scroll width remained equal to the 382px content width.

Additional actual render checks:

- 390px English/light, calendar open: heading, clock/calendar and search retain
  separate rows; calendar fits within its row; no horizontal overflow.
- 620px Chinese/dark: full-row clock is 560px wide; content and scroll widths
  are both 612px. At 621px English/light the clock remains in column 2 and
  258.53125px wide; content and scroll widths are both 613px.
- 600px English/light with synthetic PNG wallpaper: clock is 558px wide and
  the date stays one line. Its readable surface remains near-opaque white with
  dark text; content and scroll widths are both 592px.
- 1100-by-1100px Chinese/dark with a synthetic custom gradient: no horizontal
  overflow or fractional search-row spacer; the dark reading surface and light
  text remain present.

Fixed-size checks use actual same-origin iframe viewports, not native browser
window resizing. The initially supplied SVG wallpaper and incomplete custom
appearance seed were correctly rejected by existing validation. The preview
fixtures were corrected to PNG and the complete existing customization shape;
no production validator was loosened. Candidate and baseline runtime manifests
differ only in `clarity-dashboard.css`.

The two appended source-contract tests first failed against the old CSS while
all 15 existing tests passed. The original test bytes and helpers are unchanged;
each new assertion also rejects removal of its own required declaration.
Owner focused validation passed 262 Node tests, and Python passed 84 tests.
Independent source/cascade and focused month-calendar review passed 150 tests.
Full unchanged CI remains the delivery gate.

These observations establish a real static-renderer visual check and this
specific correction. They do not establish native extension loading, a real
Chrome upgrade, persistence across a real browser profile, all popup/menu flows,
the remaining checklist above, or final user acceptance of the redesign. The
historical upgrade incident and release/store safety gate are unchanged.
