# Quote field label association

2026-10-19; baseline `9cedc2abcf986a75580cc00b34e299a93a9ed3c0`.

## Observed issue and correction

In the actual cloud Chromium settings renderer, the Data page's visible Quote
Text label did not focus its input when clicked. The accessibility tree exposed
the input's current value without a name. Read-only DOM inspection confirmed
`input.labels.length === 0` and an empty label `htmlFor`.

The existing visible label now has `for="quote-text"`, referencing the existing
unique input ID. No input, translated string, placeholder, style, JavaScript,
saving behavior, storage schema or permission changes. The exact HTML byte
comparison permits only this attribute addition and preserves mixed line endings.

## Automated and independent checks

Two new regressions materialize the real quote-field HTML and execute the real
i18n helper with the English and Simplified Chinese catalogs. They check the
visible association, unique ID, unchanged field attributes and hint, exact
spaced Unicode draft, retained focus through repeated localization and no
network/storage access. Both cases fail against the retained baseline markup.

The candidate passes 25 tests together with the existing topic-label,
settings-field-writes and settings-search files, plus all 84 Python tests.
All existing tests and helpers remain byte-identical. Independent review of
the one-attribute production diff and a separate two-test run passed. Full
exact-source CI remains the delivery gate.

These DOM-model checks do not simulate native label activation or establish
screen-reader speech, extension persistence or upgrade safety.

## Actual rendered validation

At 06:57–06:58 UTC, the frozen production renderer ran in dot's cloud Chromium
with the existing preview-only Chrome API bridge and synthetic page-memory
data. The 138-file runtime maps differ from baseline only in `options.html`.

- English/light, 1167px document width: the accessibility tree names the field
  Quote Text. A filled spaced Unicode draft remains exact. On a separate fresh
  page, clicking the label transfers focus from the page to `quote-text`.
- Chinese/dark, 390 × 844 CSS-pixel iframe: after filling a spaced draft,
  explicitly focusing the Data tab and clicking 引用文案 transfers focus to the
  input. The draft remains exact; the input has one associated localized label.
  The focus outline is visible and client/scroll widths both equal 375px.

The first wide filled-draft check already had input focus before clicking its
label; it is not the evidence for focus transfer. The separate fresh-page and
Chinese tab-to-label checks establish that transition. No Save, import, export
download or restore action was activated. Screenshots remain local.

A preceding backup-summary check's tab timed out. The documented fresh-tab
route in the same selected browser worked, without changing browser settings.
The owned preview service was stopped afterward. This is real browser layout,
label association and focus acceptance with a synthetic bridge, not an installed
extension, durable profile, screen-reader speech or a historical-upgrade test.
