# Current-saved-item Markdown: bounded native acceptance

Completed 2026-10-11, approximately 03:59–04:08 UTC. No confirmed functional defect in the exercised scope.

## Exact candidate and environment

- Frozen runtime supplied by parent: `/workspace/shared/markdown-export-native-candidate/runtime`, 89 files. Every hash matched before launch and after acceptance. Runtime and manifest remained unchanged; manifest version 1.1.28.
- Official Chrome for Testing 155.0.8059.39 reused from the previously verified QA binary. New isolated profile `/workspace/shared/markdown-export-native-qa/profile`; launcher `run.sh`. No headless mode, CDP, remote-debugging flag, sandbox bypass, storage seeding, or injected application JavaScript.
- Only the dot cloud Linux desktop was used. All application interaction used native CUA screenshots, mouse, and keyboard. Existing windows were preserved. Native accessibility was X11 fallback; text-paste was unavailable in Chrome, so native individual key input supplied synthetic content.
- Downloads were copied unchanged from the native Downloads folder using the native file manager into `exports/`. Offline reads, comparisons, and hashing operated only on those evidence copies and supplied runtime sources. No Library upload or publication.

## Exercised flows and results

1. Created an unrelated saved prompt `unrelated markdown sentinel`, with body `unrelated_record_must_not_export`.
2. Saved target `Native Markdown template` with `OLD_HISTORY_MUST_NOT_EXPORT {{topic}}`, then edited and saved its current body to `Summarize {{topic}} for {{audience}}.\n  Keep <b>literal</b> and ``` fences.` (actual newline, two leading spaces). Current template had two saved body versions.
3. Filled topic with `EPHEMERAL_VALUE_MUST_NOT_EXPORT` and audience with `synthetic readers`. Actual completed preview displayed both filled values. Evidence 01.
4. Opened the real saved-item Markdown review. Preview displayed the literal current saved template, including both variable tokens, angle-bracket markup, indentation, and backticks. Tab visibly focused Download Markdown. Escape cancelled, restored the visible focus ring to the export opener, and retained completed variables. Chrome's isolated-profile download history was empty. Evidence 02–04.
5. Reopened review by pressing Enter on the restored opener. Initial focus was Cancel. Scrolled within the review to read its full unencrypted/single-current-item disclosure, excluding unsaved work/history. Tab to Download and Enter downloaded the actual 231-byte `local-itab-prompt.md`. Offline exact-byte comparison confirms current saved template and body-version ID only, with no filled values, old history, or unrelated record. Evidence 05 and original export.
6. Created `Native Markdown excerpt` with exact excerpt `Exact excerpt <b>literal</b>\n  Keep ``` fences.`, notes `Synthetic annotation: retain {{topic}} literally.`, and source URL `https://example.com/conversation/native-markdown?token=synthetic%2Bonly&view=raw#literal-fragment`.
7. Opened current-saved-item Markdown review. Source checkbox was unchecked by default. Explicit download produced the 308-byte `local-itab-collection.md`, with exact saved body and notes but no source section or URL. Evidence 06.
8. Reopened review, explicitly checked the source opt-in, and inspected its literal URL display. Tab navigation focused Cancel and then Download Markdown; Enter produced 434-byte `local-itab-collection (1).md`. Its only addition over the omitted-source file is the exact literal source URL section, preserving encoded query and fragment. Evidence 07.
9. Used the original collection header Export action. Its review still describes all saved/archived collection items, history, annotations, prompt references, and recovery snapshots; the separate source-removal checkbox remained unchecked. Downloaded original 867-byte `local-itab-ai-collection (6).json`. It parses once as the existing collection export envelope, retaining one current record, one history entry, source URL, annotations, and empty recovery array. This proves the existing JSON path remained usable for the synthetic scope; it is not an exhaustive backup compatibility test. Evidence 08.
10. Chrome download history showed exactly the three Markdown files and one JSON file produced in this fresh profile. Evidence 09. Native file manager copied all four original files without rewriting them. The downloads total 1,840 bytes.

## Reproducible evidence

`node verify.cjs` verifies all nine actual PNG screenshots and four original downloads against `evidence-manifest.json`, then checks exact Markdown content, omission boundaries, and the original JSON structure/content. It has no sibling-repository or runtime dependency. `comparison.json` records the standalone pass and honestly reports runtime verification skipped.

For optional frozen-runtime checking: `node verify.cjs --runtime-dir /path/to/runtime`. It uses the included `runtime-sha256.json`. The original 89-file passing result is retained in `source-integrity.json`.

All screenshots are actual unedited desktop captures. Profiles, logs, and unrelated downloads are excluded from the sanitized package.

## Limits and observations

- Initial Cancel focus scrolls tall review dialogs to their bottom, so the top warning/title requires scrolling upward at this window size. Warning, preview, checkbox, and actions were all reachable; keyboard focus was visible and cancellation worked. No DOM identity or accessibility-tree semantics were inspected.
- Async refresh, race/disposal, BFCache, fault injection, and stale-state forcing were not exercised natively; those are covered only by separate automated evidence where reported.
- Unsaved draft/revision export prevention, restored/archived records, Unicode/CRLF edge matrices, exhaustive locales/themes/widths, browser restart durability, and other backup modules were not tested natively here.
- Collection had one saved item and one body history entry; unrelated-record and older-history exclusion was demonstrated with the prompt library. No claim of native collection-history exclusion under multiple revisions.

## Handoff

Desktop ownership released after acceptance. Candidate browser window 81788931 remains open with synthetic content only, alongside pre-existing windows. Foreground native file manager is showing the evidence exports directory. No running full test suite or export remains pending.
