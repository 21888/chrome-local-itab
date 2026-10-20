# Calculator continuation, editing and removal: native browser check

Checked on 2026-10-20 against the unchanged production runtime in commit `61667ae65a90df7f604415fcfb1e524b2ae4b810`. All 138 runtime file hashes matched. Cloud Chromium rendered the real new-tab page with synthetic, page-memory browser-API fixtures; no extension was installed.

## Observed flows

- English, wide browser: submitting `=12 + 3` produced `15`. Enter on **Use result** focused the search draft `=15`. Typing ` * 2` did not calculate or add history: the expanded history still contained only the original calculation. Explicit Enter then produced `30` and a second record.
- Space on the original record's **Edit expression** restored exactly `=12 + 3`, focused the search field and placed both selection endpoints at its end (7). It cleared the current result without submitting or adding a record.
- Enter on the first **Remove calculation** preserved the other record and moved focus to its Remove button. Space on the last removed it, kept history expanded, showed **No calculations yet.**, disabled **Clear recent calculations**, and focused the history summary. The search draft remained unchanged.
- Chinese, 390 × 844 CSS-pixel iframe: `=0.1 + 0.2` produced `0.30000000000000004`. Space on **用结果继续计算** preserved the complete value in the draft. Typing ` * 2` left one history record until explicit Enter produced `0.6000000000000001`. Enter on the original **编辑表达式** restored `=0.1 + 0.2` and focused the input. Space then Enter removed the two records with the same surviving-row and empty-summary focus behavior; the draft remained intact.

Native viewport samples showed the expanded history controls and long decimal values wrapping in the narrow layout. The measured narrow document width was 382 pixels after its scrollbar, with zero horizontal overflow. This is representative viewport inspection, not full-page or all-template visual certification.

The fixture stayed at five initialization storage writes and zero blocked external/file actions. Copy controls were not activated; no clipboard, provider, download, import, upload or permission action was used. The accepted preview tab and server were closed after checking. No product defect was reproduced and no runtime change was needed.

## Boundaries

This closes a bounded native keyboard/focus and rendered-flow gap in the earlier [continuation](calculator-continue-result-validation.md), [expression editing](calculator-recent-expression-validation.md) and [single-record removal](calculator-recent-remove-validation.md) model-test records. It does not establish actual IME composition, held-key behavior, reentrant focus races, screen-reader announcements, clipboard behavior, installed-extension persistence, every locale/template/palette or exhaustive geometry. The narrow size is an iframe, not a resized OS window or mobile device. Synthetic state resets on navigation; history is intentionally page-local. Historical upgrade/data-loss evidence and the Store-update hold are unchanged.
