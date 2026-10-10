# Bounded large-data validation — 2026-10-10

This check used an isolated archive of commit `351c83ae96762983305dc16318d2123798580f86`, synthetic local data, production JavaScript modules and the existing Node DOM/Chrome-storage models. It did not use a browser, personal data, live providers or network traffic. The repair was reviewed and applied to the production checkout based on `ffc6a409713775f0384b949376818d33b08f8e69`, then the complete suites were rerun independently before committing.

## Reproducible Finder inefficiency and candidate repair

`Controller.search()` previously constructed URL/domain/fingerprint models for every matching record before returning a 50-row page. It also serialized the complete link collection, including icon data, on every query, even when there were no results or all visible records had stable layout identities.

The bounded fixture contains 20,000 links, 2,000 categories and a 256-character synthetic icon per link. The production `StorageManager.bookmarkImportSnapshot()` accepts this fixture with identity mode enabled. It is therefore inside the actual safe-import state boundary, not merely below the nominal record caps.

For one query matching all 20,000 links:

- Before: 20,000 URL constructions and one complete links serialization (8,246,681 UTF-8 bytes).
- Candidate: 50 URL constructions and no complete links serialization.
- Before, empty and no-match queries also serialized those 8,246,681 bytes; the candidate does neither URL construction nor complete links serialization for those queries.

The candidate keeps matching/counting in original order, clamps the requested page using the complete match count, then constructs detailed row models only for that page. A complete ordered snapshot is still captured if any visible row lacks a persistent identity. Legacy fresh-read comparisons, duplicate rejection, fingerprints and activation checks remain intact.

This does not make the whole search constant time. Matching still scans all links; a page containing legacy records still needs its full snapshot. These are operation counts, not browser latency, native FPS, paint or memory measurements. An initial separate 1-KiB-icon stress fixture exceeded the importer's conservative byte-accounting budget despite being below 32 MiB in serialized JSON; no supported-boundary claim is made for that larger-icon fixture.

## New coverage

Eight tests were added in `tests/large-data-boundaries.test.js` and `tests/shortcut-finder-scale.test.js`:

- Tasks: all 500 supported records, each exactly 1,000 Unicode code points. Counts are 167 active, 167 completed and 166 removed. The 588,535-byte task export imports without text/ID/pin loss; imported versions refresh as intended. A 501st task and an overlong edit are rejected without a write or altered prior state.
- Tasks actual view model: all-state matching shows exactly 500 rows, a narrower query shows the exact 50 matching identities/counts, a no-match query yields zero rows, and clearing restores the four-active-row default. Filtering writes nothing.
- Bookmark import: a 10,000-anchor file produces exactly 2,000 additions and 200 new categories. It contains 6,000 canonical duplicate skips and 2,000 invalid-URL skips. Aggregate counts cover all 8,000 skips, while preview examples remain capped at 50 and mappings at 200.
- Bookmark storage: the production append path under modeled Chrome APIs grows 18,000 links/1,800 categories to the supported 20,000/2,000 caps in one write. All old records/IDs and orphan positions survive; all 20,000 live IDs remain unique. Re-importing the same file is a no-op, and one additional new link rejects without writing. The synthetic input is 534,294 bytes; the resulting full HTML export is 1,408,727 bytes.
- HTML roundtrip: 2,000 distinct URLs across 200 folders retain titles, full query/fragment URLs, folder order and within-folder order. HTML deliberately does not preserve internal layout IDs.
- Finder: all 400 pages expose exactly 20,000 distinct persistent identities in order, with category-filter counts checked. Second/last/out-of-range pages remain correct; persistent-ID activation survives reordering and rejects an unseen URL edit.
- Mixed Finder identity mode: the snapshot is omitted on a saved-ID-only page, captured once when a legacy row is visible, and captured when reordering brings that legacy row onto the first page. Old legacy tokens refuse after reordering or unrelated icon changes.
- Finder actual view model: 20,000 matches produce only 50 rendered result models with exact first/second-page counters; closing removes them.

Existing tests additionally cover duplicate/ambiguous identities, legacy duplicate URLs, deletion and edits, pending activation, cancellation, unsafe URLs, ordering, IME and draft/focus ownership.

## Limits observed

- Tasks: 500 current records including completed/removed, 1,000 Unicode code points per task, eight recovery copies, and a 2 MiB total file/collection bound. Independent limits do not promise every combination can fit simultaneously.
- Bookmark input: 10 MiB; 10,000 encountered anchors; at most 2,000 new links and 200 new categories per import. Depth, title, URL and other parser limits remain enforced by existing tests.
- Safe bookmark-import state: at most 20,000 links/2,000 categories, plus conservative 32 MiB allocation accounting and node/depth limits. Checking raw JSON size alone does not establish acceptance.
- HTML export: up to 20,000 links/2,000 categories and 32 MiB output. Import limits differ: the full 20,000-link export correctly rejects with `BOOKMARK_LIMIT` when fed to this application's importer. That asymmetry is already documented; it is not represented as a failed supported roundtrip.

## Verification

- The new operation-count regression fails against the original Finder: 20,000 URL constructions are observed where the repaired page bound is 50.
- Candidate full repository run: `node --test tests/*.test.js` — 690 passed, zero failed/skipped.
- `python -m unittest discover -s tests -p 'package_extension_test.py'` — 19 passed.
- `node --check` passed for the changed Finder module and both added test files.

Native browser responsiveness, layout/paint, native keyboard interactions, assistive technology, real IME input and live providers were not tested in this pass. The isolated audit did not edit production or publish. Root integration and its independent checks are recorded above. Native Finder regression is a separate check and is not claimed here.

## Independent native Finder regression

After integration, official Chrome for Testing 155.0.8059.39 ran the extension on the cloud Linux desktop with a separate synthetic profile. All 60 runtime files matched published commit `70eaa15d098d0a149e69c420a0731d1ad219e89a` byte-for-byte.

A 63-shortcut fixture was imported through the normal Settings UI. Native input verified first-page results 1–50, Next results 51–63, Previous, one exact text match, no-match, Clear, ArrowDown result focus followed by Escape cancellation, slash-key reopen with an empty query, and the Close button. The single local tab remained and no destination was activated. The owned test browser was closed afterward.

This supplements the model tests with real dialog behavior, but does not measure a 20,000-item browser workload or native performance. Other operating systems, result activation, packet capture and assistive technology were not tested in this pass.
