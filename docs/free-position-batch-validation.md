# Initial Free-position batching — 2026-10-10

Isolated cloud archive based on `1eae938f759fd6166e211e14af606ce984cb1128`, including its category-count optimization. Synthetic data only. No production checkout edits, publication, providers, credentials, personal data or browser use during this validation.

## Change

`ShortcutsComponent.initializeMissingPositions()` previously invoked the immutable single-position setter for every missing identified link. Each call copied the entire identity map, including unchanged entries. Initialization now takes at most one lazy top-level copy and copies each touched per-link view map, publishing the batch before the existing debounced save. No copy or save is made when all visible positions exist.

The current category is captured for the synchronous batch. Encoded pending keys prevent duplicate DOM bindings from receiving a second seed before publication. Existing fractional coordinates, inactive views, hidden links, orphan identity entries, legacy position keys and seed placement order are preserved. The saved layout and borrowed identity/view maps are not mutated. Persistence still receives separate coordinate objects through the same controller and conflict checks. Individual drag writes still use the original setter.

No storage format, permissions, identity allocation, import limits, Grid behavior, template logic, manual/backup export behavior, version or release artifact changed.

## Bounded operation-count evidence

The fixtures contain 200 / 2,000 / 20,000 identified links across 20 / 200 / 2,000 categories, with a 256-character synthetic text icon per link. Each passes `StorageManager.bookmarkImportSnapshot`, including its count/allocation and identity validation. Counts alone do not establish support for arbitrary data of the same size.

| Links | Earlier completed audit: copied top-level entries | Candidate: copied entries | Candidate: top-level copies |
| ---: | ---: | ---: | ---: |
| 200 | 40,000 | 200 | 1 |
| 2,000 | 4,000,000 | 2,000 | 1 |
| 20,000 | Not completed | 20,000 | 1 |

The baseline figures above come from the [earlier bounded rendering audit](dashboard-render-scaling.md). Its original 20,000-link stress was stopped and is not represented as a completed measurement.

New tests execute the actual production initialization method under the existing DOM model. Proxies count top-level map enumeration on the initial map and every replacement. A strict one-map copy budget aborts a regression at its second enumeration, before another full copy completes. Running these tests against the unchanged baseline produced the three expected failures safely, including the maximum fixture; the original unbounded stress was not repeated. Established layouts then perform zero additional map copies or saves.

For a batch of N visible items and M existing identity entries, the top-level copying is O(M) rather than O(N × M). Additional work still includes visiting visible items, copying touched per-link view maps and building save deltas. This is not a claim that all layout, save or rendering work is linear in link count under every layout history.

## Regression coverage

- Exact row/column seed ordering for all three accepted fixtures.
- Frozen original map/view ownership; no-op rerun identity and no repeat save.
- Existing fractions and negative coordinates, varying tile dimensions, row wrapping, distinct identities sharing a URL, hidden links, orphan entries and legacy-key fallback.
- Category-local seeds, separator-bearing and prototype-looking view names, defensive repeated DOM binding and absent per-link map.
- Quiet `persist=false`, distinct queued coordinate objects and unchanged immutable single-drag setter.
- Display-only x/y bounds leave saved coordinates intact.
- Grid bypass and existing identity-migration/error guards.
- Existing layout identity, write-conflict, focus/regroup, drag, restore and export tests run in the full suite.

## Verification

- `node --test tests/*.test.js`: 736 passed, zero failures/skips.
- `python3 -m unittest discover -s tests -p '*_test.py'`: 19 passed.
- JavaScript syntax checks across runtime, shared, tests/helpers and assets: passed.
- Manifest and locale JSON parsing: passed.
- Runtime-only ZIP generation and source-comparison verification: passed, 60 runtime files. Validation ZIP remained in the isolated archive and is not a release artifact.
- Independent read-only review: no blocking concerns; targeted new and existing layout/drag/identity/conflict checks passed.

## Remaining limits

This is operation-count and modeled-DOM evidence, not native latency, layout/paint, FPS, heap or interaction evidence. The dashboard still materializes every shortcut, template changes can rebuild all tiles, and successful layout saves still compare full-link serializations. Single drag writes still copy the complete identity map. Large accumulated view histories and orphan maps still cost memory/copying. These are separate concerns; this patch only removes repeated top-level copying during missing-position initialization.
