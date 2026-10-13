# Shortcut editor content preview

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

The final integrated version1.1.118 snapshot preserves the separately implemented, default-off Claude experiment and current README images. Strict serial regression passed2893/2893 Node tests with a1GiB heap and84/84 Python tests. The worker's standalone baseline passed2842/84 and independent review found no blocker; runtime JS/CSS/cache files match that frozen source byte-for-byte. The118-file package passed build/source verification. Native preview checks are pending. No claim of full template-card fidelity, live account access or production network verification follows from these automated results.
