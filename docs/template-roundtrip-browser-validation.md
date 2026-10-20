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

The narrow viewport is an iframe, not a resized OS window or mobile device. The round-trip checks above are representative acceptance, not all custom backgrounds, Free-coordinate preservation, actual IME composition, screen-reader, save/concurrency, or provider-account acceptance. Those boundaries and the historical upgrade/data-loss investigation remain unchanged. No new runtime defect was reproduced in this pass. An older expansion-guide paragraph incorrectly describing dashboard gallery choices as immediate saves was corrected to match the existing product.

## Follow-up: all-template responsive preview matrix

On the same date, all 21 templates were previewed and cancelled at both 1100 × 844 and 390 × 844 CSS-pixel iframe sizes (42 distinct states). Runtime hashes again matched all 138 production files, unchanged in commit `9561c5aee7f5228d22ebaa97acc2ec97e1cda888`. This pass used the English light palette, 12 synthetic shortcuts and four enabled local cards: Tasks, Focus, Scratchpad and Countdown. Content included a long unbroken task token, a 779-character multiline note and a long countdown title.

Every state retained the 12-shortcut heading and four positive-width cards. Neither the document nor any of those card containers had horizontal overflow at settled measurement (document widths 1092 and 382 pixels after scrollbars). All three preview actions were enabled with positive width; Cancel was actually clicked for every state. Native viewport samples showed long text wrapping and reachable card controls, with normal vertical scrolling for content below the viewport. Keyboard Tab from the scratchpad reached its Export text control without activating it. This was viewport sampling, not a full-page pixel inspection of every region.

All 37 explicitly recorded post-Cancel focus snapshots restored Clarity and focus to Browse 21 layouts. The first five transitions also cancelled successfully but did not record a separate focus snapshot. The fixture remained at five initialization writes with zero blocked external/file actions throughout; Apply was never activated. The owned tab and preview server were closed afterwards. No runtime defect was reproduced, so no product change was made. Dark palettes, custom-background combinations, installed-extension behavior and the other limits above remain outside this matrix.
