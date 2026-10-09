# Local Scratchpad

Opt-in, device-local plain text card, off by default. Enable it in Settings. One draft, no Markdown/HTML rendering, links, network service, history, clear or undo UI. Native textarea editing remains available. A discreet non-live count shows Unicode code points; limits are 32,000 code points and 128 KiB UTF-8. Oversized drafts stay visible without truncation. Invalid Unicode is rejected rather than silently converted on save.

A dedicated personal-content key stores content, visibility and revision. The configuration schema, permissions, providers and 15 templates/presets are unchanged. Settings export, Sync, Drive and configuration recovery exclude this key; import/reset preserve even opaque or corrupt existing values. Export text downloads the current visible draft as UTF-8, including unsaved/conflicted drafts. Export files are the user's own backups; browser data removal/uninstall can erase saved text.

Autosave waits approximately 500 ms after editing, does not run during IME composition, serializes writes under the existing origin-local Web Lock, compares a fresh revision and verifies readback. The page says Saved only when its current draft matches verified storage. A failure retains the draft and provides retry/export. Clean editors update from other tabs. Dirty editors retain drafts and present latest saved text with explicit Use saved / Replace with my draft; a further unseen update rejects replacement again. Hiding on another page defers while a draft is unsettled.

Configuration reload guards protect pending, dirty, failed and conflicted drafts. Beforeunload requests a browser departure warning where supported; there is no unload-time save promise and no guarantee against browser termination. A failed initial load stays readonly with Retry; corrupt saved data is not treated as blank.

## TXT import follow-up

Scratchpad now supports one bounded UTF-8 TXT file with an inline preview and explicit whole-note replacement. Selection and cancellation do not write. See [TXT import validation and remaining native checks](scratchpad-import-validation.md) for the later automated evidence, and the [English guide](local-scratchpad.en.md) / [中文说明](local-scratchpad.zh-CN.md) for migration and recovery. The older native acceptance records below cover the original editor/export interface, not the new import controls.

## Automated evidence

Run `node --test tests/*.test.js` and `python -m unittest discover -s tests -p 'package_extension_test.py'`. Scratchpad suites exercise store limits/plaintext/Unicode/corruption/CAS/readback/failures, controller pending edits/IME/conflicts/retry, DOM-model load/retry/visibility/export/keyboard-labelled controls, and actual StorageManager boundaries including concurrent reset/save and runtime package allowlist. DOM models are not native browser or assistive-technology verification.

## Native acceptance checklist

1. Load packaged extension in a disposable cloud Chrome profile, all other features left at defaults. Confirm Scratchpad starts hidden, no writes, enable via Settings, then reload and verify text/visibility persistence.
2. Paste whitespace, multiline text, emoji and literal HTML/Markdown. Confirm plain text, unchanged draft export bytes, native selection/caret/undo, no triggered links/network requests. Enter 32,000 emoji then one extra; confirm retained draft/count/limit status and recovery after shortening.
3. Type with Chinese IME, including composition while a save is pending. Confirm no partial composition saves and final text saves after a pause. Type while a storage operation is delayed; current text must remain and receive its own verified save.
4. In two tabs, test clean updates, dirty conflict preview, Use saved, Replace with my draft, and a third update before replacement. Hide from Settings while the other tab has dirty/failed/conflicted text: keep its editor accessible until resolution.
5. Simulate local read/write/readback failure in disposable test data. Confirm readonly retry on initial failure, retained draft on later failure, honest status and successful draft export. Confirm corrupt state is never blank-overwritten.
6. Trigger configuration reload with dirty/pending/failed/conflicted draft; verify deferral and explicit discard flow. Check browser navigation warning behavior without assuming it appears on forced termination.
7. Keyboard-only Tab/Shift-Tab and Enter/Space through enable, text, retry, conflict and export controls; inspect focus rings and native focus after async operations. Screen-reader checks are a separate acceptance step, not an automated claim.
8. Test light/dark, narrow viewport, Scratchpad-only dashboard, all 15 existing templates, and double-click interactions. Check no ordinary theme/template change remounts the editor or loses a draft.
9. Confirm settings export/Sync/Drive contain no sentinel Scratchpad content, and settings reset/import preserve it. Inspect ZIP allowlist; no tests or private content packaged.

## Recorded acceptance — 2026-10-09

The final integrated candidate passed 241 Node tests, including 24 focused Scratchpad cases, and 19 Python packaging tests. Independent review reproduced and corrected lossy export of invalid Unicode/line endings and a late corrupt-read state that had remained editable. Seven independent failure/concurrency cases and actual StorageManager reset/import races passed. The final IME/read-error retention delta was rechecked. These are model tests, not native fault injection.

Bounded native checks used official Chrome for Testing 155.0.8059.39 on cloud Linux with the normal sandbox. Scratchpad began disabled; enabling it through Settings exposed the card. A synthetic 37-character Chinese/English multiline draft, including an empty line and literal HTML text, reached Saved and survived reload. A second tab added a line; the first clean editor updated to 55 characters without reload. The earlier draft exported through the actual browser download flow; the resulting 45-byte UTF-8 file was independently compared byte-for-byte with the input fixture and matched.

English Graphite dark/light at a 1188×848 native window and English light at 510×848 remained readable. The [selected light/dark card-row captures](screenshots/scratchpad/capture-metadata.json) preserve original JPEGs and exact crop coordinates. No generated or retouched UI imagery is used. Chinese characters were entered through ordinary copy/paste from a local synthetic UTF-8 file, not an IME test. Native window size is not asserted as CSS viewport size.

All 51 runtime file hashes matched the tested snapshot. Final newtab.js SHA256: `881ae6150025c8015dc23cbc2a2df83d56fd9a952d42ebf47bd4d55a98fa08fd`. The 51-file canonical package was built and verified separately; packaging does not itself run a browser.

Native dirty-conflict/forced-hide races, failure injection, CRLF export, actual IME, screen-reader announcements, all 15 templates, live Sync/Drive and other operating systems were not verified in this bounded run. Applicable local cases have automated coverage above; untested cases are not promoted to native passes.

## Template appearance sweep — 2026-10-09

The exact published `3f20fa9` extension ZIP (SHA256 `b9090699e131f6e8dc60763211f5c3ef9b8a76e7dda8dcacc105f852db82e860`) was inspected in 21 native combinations: all 15 templates in light appearance at a 1188×848 window, and Folio, Console and Blueprint in dark appearance at wide and 510×848 narrow windows. The wide dark Folio window was 1188×848; Console and Blueprint were 1260×848. These are native window dimensions, not measured CSS viewport dimensions. Browser zoom was 100%.

The 27-character saved multiline Scratchpad content persisted throughout. No new Scratchpad clipping or unreadable text was observed. Folio intentionally stacks cards in a right rail; not all three neighboring cards are visible simultaneously. Existing Tasks search placeholder truncation in some narrow columns was not counted as a new Scratchpad defect.

This extends the earlier bounded layout coverage only. It does not establish exhaustive contrast compliance, all-template narrow coverage, keyboard/IME or assistive-technology behavior. The owned test browser was closed normally; original desktop captures and source hashes were retained with the acceptance artifacts.
