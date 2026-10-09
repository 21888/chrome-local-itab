# Saved-site Finder validation — 2026-10-08

## Automated and independent review

The complete repository suite passes 66 tests with no failures or skips. JavaScript syntax checks and manifest/locale JSON validation pass.

Production-code models cover Unicode/case/accent/title/address/category matching; duplicate records; bounded result pages; plain-text rendering; stale/deleted/edited targets; fresh local reads before activation; owned blank-tab cancellation; late reads; user-navigated tabs; repeated activation; IME/repeat handling; focus return; and reload deferral alongside Tasks.

Independent composed tests exercise actual renderer/event paths across A/B/C and Grid/Free/snapped modes. Query, local navigation and dismissal preserve configuration and coordinates and do not invoke provider, persistence or navigation paths before explicit result activation. The existing Tasks privacy/reset checks remain in the full run.

A synthetic Node measurement of twenty complete 10,000-record queries took approximately 446 ms total, with at most 50 displayed result models per page. This is a reproducible model measurement, not browser paint or a performance guarantee.

## Bounded native check

An unpacked extension in a disposable Chrome for Testing profile passed:

- A duplicate query displaying two separate results
- Searching across categories while Work was selected, including a Social result
- Enter in the query field causing no navigation
- Native Enter and Space on a focused result each opening exactly one expected-URL tab
- Escape dismissal returning focus to the Finder opener
- Visual preservation of grouped Grid layout and Free positions
- Readable Clarity layout at an approximately 1188 px browser window and Folio in an approximately 632 px docked viewport

The synthetic destination's local server was absent. URL and tab count were verified; destination-page rendering was not.

## Remaining limits

This was not a complete six-palette native matrix, native IME/assistive-technology audit or live-provider test. Exact full-configuration equality, zero provider work, stale asynchronous races and recovery checks above come from production-code models; the native placement comparison was visual. Native screenshots do not establish exhaustive small-window, zoom or large-list performance coverage.

## Page-local `/` shortcut — 2026-10-09

- Full integrated checks: 215 Node tests and 19 Python packaging tests passed. Independent event review covered 26 propagation/cancellation cases. Regressions include ordinary button/link focus, Shift-produced `/`, AltGraph/modifier exclusion, editing/native controls, visible dialogs/menus, disconnected hosts, hidden documents, interrupted composition, and destroy/remount cleanup.
- Native Chrome for Testing on cloud Linux verified English Graphite dark and Chinese light. Page space, the Finder opener and an existing website button opened one panel with `/`; Escape returned to the real prior control. Typing in search/Finder/editor fields, `?`, Ctrl combinations, address-bar focus, existing editor dialogs and context menus did not open another panel.
- At a measured 510 × 848 native window, Chinese controls, the `/` marker and its localized tooltip were readable. The web-search module was explicitly disabled and saved; a new tab had no web-search input, while `/` still opened the local Finder.
- These dimensions describe the native window, not a measured CSS viewport. Real non-US keyboard layouts, actual IME composition and assistive-technology announcements were not tested natively. Their event/source coverage is separate from the executed browser checks.
