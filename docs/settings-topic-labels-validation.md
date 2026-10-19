# Persistent labels for manual topic fields

2026-10-19. Baseline: `9475d04fb9ced7e8f58002f8bbdddfa20224334b`.

## Observed issue and minimal correction

The three manual topic groups used placeholders alone for the title and score
inputs. In actual cloud Chrome, English and Chinese filled inputs had no
visible purpose label; the accessibility tree showed only their values.
Read-only DOM inspection confirmed no associated label or ARIA name.

Each of the six inputs now has a unique ID and a visible, associated `label`.
The labels use the existing `form-label` styling and existing translated title
and score strings. Placeholders, input types, classes, Add buttons, group
selection, editing and saving behavior are unchanged. No production JavaScript,
CSS, catalog, schema or storage code changes.

## Automated evidence

Six new tests materialize the actual three HTML sections and run the real i18n
helper against both catalogs. They verify unique IDs, visible label association,
localized title/score labels and placeholders, unchanged input types/classes,
the original Add button, exact filled drafts and focus across repeated
localization, and no network/storage access by localization.

The final fixture fails all six cases against preserved baseline HTML and
passes the candidate. Existing topic-localization, stale-save and settings-search
tests remain unchanged; the combined run passed 120 tests. These include the
existing real-Store topic Add/edit/delete, cancellation, conflict, rejected-save,
draft-preservation and localization protections. The full Python suite passed
84 tests. Independent source review and a separate six-test run passed.
The unchanged full exact-source CI remains the delivery gate.

An initial new-fixture run did not mirror `data-*` attributes into the shared
model's separate dataset and expected `null` where that model returns
`undefined` for an absent attribute. Only the new parser/assertions were fixed;
the old helpers and tests were untouched. Those logs and the initial baseline
RED are retained. An initial Python filename-pattern typo discovered zero
tests; it was corrected to the actual CI pattern before reporting 84 passes.

## Actual rendered validation and limits

The frozen static production renderer used the existing synthetic page-memory
Chrome API bridge. Baseline/candidate maps contain 138 runtime files and differ
only in `options.html`.

At 05:16 UTC, English/light at 1167px document width showed both labels above
the filled fields. Clicking Score's label focused its number input, retaining
the exact spaced title and `42`. All three topic groups were selected through
the existing selector, filled with separate synthetic drafts, and the title
labels in Weibo/Zhihu focused the correct inputs. Readback retained all six
values and associated labels across those group changes. The document's client
and scroll widths were both 1167px.

At 05:17 UTC, Chinese/dark in a 390 × 844 CSS-pixel iframe showed 热榜标题 and
分数 after filling. Clicking the title label focused that input; exact spaced
Chinese text and `42` remained. The fields were 235px wide with no overlap,
and document client/scroll widths were both 375px after its scrollbar. The
scoped screenshots remain local. This checks visible labels, real browser label
association and focus, not screen-reader speech.

A prior preview tab timed out; the documented fresh-tab route in the same
selected cloud browser succeeded without changing settings. A read-only
top-document attempt to inspect the iframe returned no `contentDocument` in
the tool's DOM scope; geometry was then read using its supported frame locator.
The unsuccessful read is retained, not counted as a geometry result. The service
was stopped and desktop released after verification.

These browser checks did not submit a new topic or exercise editing dialogs.
Their existing behavior is regression-tested, not newly claimed as native QA.
The synthetic bridge is not an installed extension or durable profile, and
this work does not establish upgrade safety or resolve the historical data-loss
incident.
