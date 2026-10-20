# Template and Settings round-trip browser check

Checked on 2026-10-20 against the production runtime tree of commit `199ec2da872b72ff123e4914a2228a86739c295f`.

## Existing product scope

- 21 templates, with live new-tab previews and explicit Apply. The compact selector and Settings gallery save immediately.
- Independent custom backgrounds and card spacing, opacity, order, width and grid controls. Template preview does not replace these settings. Grid, Free and snapped shortcut placement remain separate.
- An offline navigation library with 149 sites and 218 bilingual use tags, local search/filtering and an explicit review/save flow.
- Official subscription links are passive, user-opened references, not automatic usage collection.

## Bounded native checks

Actual production new-tab and Settings HTML, scripts and styles ran in cloud Chromium with synthetic shortcuts and a preview-only browser-API bridge. All 138 runtime file hashes matched the tested source. No extension was installed.

At a wide browser viewport (1180 CSS pixels reported by the page), keyboard selection of Folio previewed the real dashboard. Cancel restored Clarity and all 12 synthetic shortcuts. Opening Customize, choosing a gradient and cancelling restored focus to Customize without a save. The dashboard Settings control opened its local workspace-specific Settings URL; activating Back to Dashboard with Enter navigated that Settings tab back to the dashboard.

In a 390 × 844 CSS-pixel iframe, Chinese Paper preview exposed readable Apply, Cancel and Close controls. Tab reached Apply; Escape restored Clarity and focus to the gallery summary. The navigation library displayed 149 sites; searching `Git Hub` returned three matches including GitHub and GitHub Copilot, without opening their links. Escape returned focus to Discover sites. A separately opened narrow Settings frame showed translated navigation; keyboard Back returned to the dashboard with 12 shortcuts. Measured document scroll widths did not exceed the available document width in the checked settled states (382 pixels for new-tab, 375 for Settings, after frame scrollbars).

Preview, cancellation and navigation-library searching added no Chrome-storage writes after the fixture's five initialization writes. No external links, file downloads, imports, uploads, provider requests or permissions were used. Owned preview tabs and the local server were closed after checking.

## Limits

The API bridge stores synthetic data in page memory, resets it on navigation, blocks external/file actions, and allows only same-origin new-tab/Settings window opening. Back uses the production web-navigation fallback with extension tabs APIs absent. This establishes rendered controls, native keyboard dismissal/focus and local URL routing, not real-extension tab reuse or cross-navigation persistence. The synthetic locale comes from the fixture URL; it is not an installed extension's browser-language setting.

The narrow viewport is an iframe, not a resized OS window or mobile device. This is representative acceptance, not all 21 templates, all custom backgrounds, Free-coordinate preservation, actual IME composition, screen-reader, save/concurrency, or provider-account acceptance. Those boundaries and the historical upgrade/data-loss investigation remain unchanged. No new runtime defect was reproduced in this pass. An older expansion-guide paragraph incorrectly describing dashboard gallery choices as immediate saves was corrected to match the existing product.
