# Bounded dashboard rendering audit — 2026-10-10

Isolated archive of `8dce937629bfc03009f26d177e5b3f90ba5e8305`. Synthetic data only; production dashboard methods under the repository DOM model, not native browser timing, paint, FPS or heap measurements. No providers, credentials, real data, desktop access or network calls. This audit did not modify the production checkout or publish.

## Accepted fixtures

200/2,000/20,000 identified links across 20/200/2,000 categories, respectively, with a 256-character synthetic text icon on every link. All three pass the actual `StorageManager.bookmarkImportSnapshot` validator, including identity position maps. The safe-import count caps are 20,000 links and 2,000 categories, with additional conservative 32 MiB allocation, node and depth limits; nominal counts or raw JSON size alone are insufficient.

## Isolated correction: category badge aggregation

`CategoryNavigation.updateCounts()` filtered the entire links array separately for each displayed category. Each refresh now builds a local Map in one pass and reads each badge count from it. There is no cache or persistence change. Missing/empty categories retain the `work` fallback, unknown category IDs remain distinct, duplicate navigation IDs receive the same count, All remains the full collection length, and empty badges show zero.

Measured category reads for one category switch:

| Links / categories | Before | Candidate |
| --- | ---: | ---: |
| 200 / 20 | 4,000 | 200 |
| 2,000 / 200 | 400,000 | 2,000 |
| 20,000 / 2,000 | 40,000,000 | 20,000 |

Template refresh invokes the visibility/count path twice, so its before/candidate counts are double those above: 80,000,000 versus 40,000 at the maximum fixture. This duplicate invocation is deliberately unchanged in this patch.

The regression fails against the original implementation at all three sizes; for the largest template refresh it observes 80,000,000 category reads where 40,000 are expected. Focus, persisted category selection, badge semantics and tile object identity during category selection have focused coverage. Existing full-suite tests cover template grouping/order, draft ownership, layout identity and Free positioning.

## Separate findings, not changed

- The dashboard materializes every shortcut, unlike Finder paging. For this text-icon fixture, grouped Grid contains 1,327 / 13,207 / 132,007 descendant elements; flat Grid contains 1,207 / 12,007 / 120,007. Category selection hides existing tiles without rebuilding them.
- Graphite-to-Folio refresh rebuilds every tile even though both use grouping: 200 / 2,000 / 20,000 tile constructions and per-tile focus-key serializations. No full-link-array serialization was observed in the measured category/template/layout presentation calls. Grouping changes rebuild once, preserve original data indices and do not mutate stored link order.
- Established Free layout and Free template repaint do not rebuild tiles. Initializing missing Free coordinates has a separate quadratic cost: `setSavedPosition` copies the complete `identityPositions` map for each newly positioned identified link. The isolated production-method benchmark completed 200/2,000 links and counted 40,000/4,000,000 top-level map entries copied, with the original maps unchanged. The 20,000-link benchmark was stopped before completion; no completed measurement is claimed for that case. This is not part of the badge correction.
- The layout controller's successful-save callback compares two full links JSON serializations. That occurs on a saved transaction, outside this presentation-only measurement; replacing it needs separate concurrency/identity review.

No pagination, virtualization, tile reuse, template transitions, Free positioning, focus logic, draft logic or storage behavior was changed.

## Verification

- `node --test tests/*.test.js`: 729 passed, zero failures/skips.
- `python -m unittest discover -s tests -p 'package_extension_test.py'`: 19 passed.
- `node --check newtab.js` and the added test file passed.
- Original-source operation-count regression: three expected failures, with semantic compatibility test passing.

Tests are operation/DOM-model evidence only. Browser responsiveness and native interactions at these sizes remain unmeasured.

The one-pass badge change was subsequently reviewed and integrated into the main checkout. Its complete 729-test Node suite and 19 Python packaging tests were rerun independently before commit; the separate findings above remain unmodified.
