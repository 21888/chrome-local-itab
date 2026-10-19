# Shortcut editor content preview

## Refresh icon button label (2026-10-19)

The existing refresh button now has the catalog title “Refresh icon from site”
in English and “刷新网站图标” in Chinese. Actual cloud-browser shortcut-editor
checks found that both catalogs lacked `refreshIcon`: the existing i18n helper
returns a missing key literally, so the button's English fallback was not used.
Only those two message entries are added. Button markup, handlers, cached icon
behavior, explicit refresh, privacy checks and network permissions are unchanged.

Two new regressions evaluate the actual button template through the production
i18n helper and catalogs; both fail on the original catalogs and pass after the
correction. The related icon/preview/locale/validation set passes 28 tests and
Python passes 84. No old test or helper is changed.

At 04:10 UTC, the actual production renderer in dot-cloud Chrome exposed the
correct title and matching button name in English/light and Chinese/dark at a
390 × 844 CSS-pixel iframe. Both real accessibility trees contained the localized
description instead of the key. Escape returned to the Add button. This was a
static renderer with an explicit synthetic page-memory API bridge, not an
installed extension or real-profile storage test. All 138 runtime files were
frozen; only the two locale catalogs differ from the preceding delivered source.
The refresh/fetch buttons were not activated. Pointer-hover tooltip painting,
screen-reader speech and actual online icon fetching were not tested. No new
screenshots were taken or uploaded for this label-only correction.

The add/edit dialog shows a read-only **icon and title** sample. It is not a replica of the selected template's card grid, collection headings, spacing or placement. The full card layout is visible on the home page after saving.

- Title and icon text are trimmed like saved values. Blank icons use 🌐. URLs use the existing `normalizeHttpUrl` routine.
- The sample and actual card share `appendShortcutContent` and `setShortcutIconContent`; strings enter the DOM through `textContent`. Image values must pass the existing raster data-URL validator.
- Dashboard-scoped icon size/font and title size/color variables are copied into the sample. Hidden titles remain hidden, with a note pointing to the title input for review.
- Preview rendering never calls the existing network-capable favicon lookup APIs. `peekIconDataUrl` only reads a fresh IndexedDB record. It first checks `indexedDB.databases()`, avoids opening a missing database, aborts any upgrade caused by a deletion race, uses a readonly transaction and closes its connection. Unsupported enumeration, failures, expired records and misses return no image. It does not open Cache API stores, fetch or persist anything.
- Safe direct data images render immediately. Uncached remote icon references show 🌐; text/emoji remain as entered. Existing explicit Fetch and Refresh buttons retain their existing privacy controls and side effects.
- Cache results are accepted only for the current modal session, preview revision and title/URL/icon fields. Category-only edits do not invalidate content. Closing or reopening prevents old results from modifying the new preview.
- Preview controls cannot launch or drag a shortcut. It does not alter the draft baseline, storage, save/validation, or cancellation behavior.

## Implementation references

This extends the repository's existing mechanisms rather than adding a parallel persistence or dialog implementation:

- `newtab.js`: `setShortcutIconContent`, `normalizeHttpUrl`, `cancelIconRequest`, `readShortcutDraft`, `hasUncommittedShortcutWork`, and `handleFormSubmit`.
- `favicon-cache.js`: existing icon cache record format and expiration policy; the preview adds a separate readonly lookup.
- `shared/dialog-focus.js`: existing modal focus/close behavior remains unchanged.
- `tests/shortcut-favicon-session.test.js`, `tests/shortcut-save-session.test.js`, `tests/shortcut-departure.test.js`: existing ownership, save and draft regressions.

## Verification

Run `node --test tests/shortcut-edit-preview.test.js` for focused literal/XSS, read-only cache, missing-database/upgrade-race, async lifecycle, category-change, settings, explicit fetch, event wiring and save/cancel tests. Run the full Node and Python suites and runtime ZIP validation before publishing.

These tests use DOM/IndexedDB models. Native-browser checks should also cover add/edit, cached and uncached icons, offline/privacy-disabled typing, rapid input and close/reopen, hidden titles, custom sizes, a narrow/short viewport, cancel and save. Model tests and ZIP validation alone do not establish pixel-level fidelity or native IndexedDB behavior.

## Integrated development validation

The final integrated version1.1.118 snapshot preserves the separately implemented, default-off Claude experiment and current README images. Strict serial regression passed2893/2893 Node tests with a1GiB heap and84/84 Python tests. The worker's standalone baseline passed2842/84 and independent review found no blocker; runtime JS/CSS/cache files match that frozen source byte-for-byte. The118-file package passed build/source verification. Limited native Chinese-light checks passed on the118-file combined development package: editing a synthetic Gemini title updated immediately, clearing the icon showed the globe and ASCII QA updated; Cancel/reopen retained the original. At100%/200%, ordinary scrolling and Cancel focus were usable. Temporary96px icons and hidden titles produced the large sample and explicit hidden-title note; settings were restored to automatic icon/title size and visible titles. No shortcut save or icon-fetch control was activated. Cached-image hits, arbitrary Unicode input, native network instrumentation, races, dark mode and additional widths were not covered. No claim of full template-card fidelity, live account access or production network verification follows from these automated results.
