# Bookmark HTML import acceptance — 2026-10-09

## Implemented and verified

A separate local-file Netscape HTML import previews additions, folders, skips and current Sync/icon disclosure before explicit Apply. Existing JSON backup restore is unchanged. Import is additive, with a bounded no-DOM/no-I/O parser, strict locked storage validation and conflict detection, latest-position preservation, and structural readback verification. Existing enabled providers retain their normal behavior; this is not a promise that the entire application never uses a network.

The final integrated candidate passed 182 tests and exact artifact hashes. Independent parser review included 10,000 deterministic fuzz cases and maximum-size uppercase/raw-text memory checks. Independent storage/UI tests covered races, malformed state, write ambiguity, unchanged existing data, newer form edits, strict object-key-order-independent verification, cancellation and accessibility semantics.

Additional model-only preservation coverage adds 17 regressions for legacy and identity layouts: both lock orderings of reset/restore versus import, pending position writes versus import, first initialization and persistence of imported manual positions, concurrent dedicated Tasks and running Focus updates, and duplicate identity allocation after import. These tests execute the actual storage and layout methods with modeled Chrome storage, Web Locks, and tile geometry; they do not establish native browser layout or cross-tab timing behavior. A later explicitly confirmed reset/restore intentionally replaces the imported shortcuts, while restore recovery retains the preceding imported state.

## Actual native browser observations

Official Chrome for Testing in disposable cloud profiles verified real file selection, preview, Cancel with original five sites intact, Apply and category filtering. A first write exposed a genuine Chrome property-key ordering difference: three records were saved but verification incorrectly warned. This was fixed without a rollback or blind retry; the final runtime then successfully added a distinct two-site/one-category batch. The dashboard showed all ten expected records (original five plus three and two), preserving the expected fields/order. Reimport of that final file showed zero additions and disabled Apply; Cancel and reload retained all ten.

Chinese light mode at a measured 514×848 native window displayed localized counts, skip reasons, folder mapping and privacy text with stacked full-width Apply/Cancel controls; cancellation showed nothing-added feedback. English dark mode verified the successful import and zero-addition flows. These dimensions are browser windows, not measured CSS viewport sizes.

Earlier file-selection failures involved an inaccessible path and chooser cancellation; separate local diagnostics verified File.text, arrayBuffer and FileReader with both retained and reset selections. No speculative change to file reading was made.

## Limits and known unrelated UI observations

Native tests did not cover every engine fixture, all 15 templates, screen-reader announcements, real IME composition, live Sync, online-icon requests, network instrumentation, large-file performance, quota failures, injected storage races, or Tasks/Focus recovery data comparisons. Those behaviors are supported only by the stated code/model checks where present, not inferred from the native pass. Parser tests do not constitute a whole-application network audit.

A horizontal scrollbar was visible in the English wide test profile on existing Appearance/dashboard/Data views before import preview; it was absent in the Chinese narrow/light import test. This import does not claim to eliminate all Settings overflow. A pre-existing English helper above the importer also remains untranslated in the Chinese profile.
