# Reviewed saved-site batch movement

Open **Organize saved sites** beside Find saved sites, or from a category’s context menu. Choose individual saved records and an existing destination category. Review the exact count, title, full URL and source for each selected occurrence, then choose **Move reviewed sites**. **Cancel** and **Back** do not write. Orphaned source categories remain visible by their saved identifier. Sites already in the destination cannot be selected.

## Search within the current organizer

**Search saved sites** filters the current snapshot by title, full URL or displayed source category name. An orphaned category uses its saved identifier. Matching is a literal substring after Unicode NFKC, case and whitespace folding; it does not use regular expressions, split the query into tokens, or search hidden record properties. Empty or whitespace-only searches show the original grouped list. Original record numbers and order remain unchanged, including identical title/URL occurrences.

The summary shows matching sites out of all saved sites, all selected sites, and selected sites hidden by the search. Selections and destination stay in place while searching. **Review move** always includes all selected occurrences, even if the current search matches none. **Back** restores the query, selections and destination. **Clear search** only clears the query and returns focus to the same search field. Choosing another destination still removes selections that are already in that category, including hidden selections.

**Select current matches (N)** selects every currently matching, unselected occurrence that is eligible for the destination. **Deselect current matches (N)** removes only the matching selected occurrences. Both counts describe what that action will change; an action with zero changes is disabled. Hidden selections stay untouched. These controls use the loaded snapshot, with no twenty-site cap, and treat identical title/URL occurrences separately by original record index. Orphaned source records remain selectable. Before choosing a destination, selection follows the individual checkboxes; movement still requires an existing destination and the usual exact review.

Bulk selection updates the existing checkboxes without replacing or focusing the search field. Its selected/hidden counts are announced through the existing live status. If a focused bulk-action button becomes disabled after the action, focus moves to the other available bulk action before disabling it, keeping keyboard control inside the dialog. Empty or unmatched lists disable both actions. IME composition, stale views, closed/reopened sessions, pending reviewed moves and departure use the same temporary-selection guards.

Search is temporary, local view state. It makes no additional storage reads, writes, permission requests or network calls. Canceling or closing discards it; reopening starts with an empty query, selection and destination. The search field stays mounted while typing and composing with an IME. Detached controls, previous dialog sessions and controls behind a pending reviewed move cannot change the active selection.

This is separate from the read-only Finder. The organizer never launches URLs, creates/removes categories, reorders sites, allocates IDs, or migrates coordinate maps. Legacy missing IDs and identical title/URL twins are distinguished by the reviewed index within a fully compared snapshot. Every property except selected records’ category is preserved.

## Transaction and interruption guarantees

- One dedicated storage operation uses the existing workspace/local Web Lock and a single links write. The complete saved links, category records, layout, schema and generation are compared before writing. Imports, category edits/deletion, record changes and layout changes invalidate the review.
- Layout mutation coordination is held from flush through readback/adoption. A concurrent shortcut action cannot bypass the pending guard.
- Repeated submission uses the same immutable in-memory request and shares any pending write. Retry compares the saved result first. A verified success never writes again; a definitely failed write can retry. Changed data after uncertainty is rejected instead of overwritten.
- Pending writes cannot be dismissed. Open selection/review and pending operations participate in existing workspace departure and native beforeunload protection. Workspace Save does not implicitly commit a reviewed batch. Cancelled reads cannot reopen a newer session.
- Readback failure is disclosed as unverified. Closing that review does not promise a rollback; re-open against current saved data to inspect the outcome.

## Verification

Focused Node suites: `tests/shortcut-organizer-storage.test.js`, `tests/shortcut-organizer-view.test.js`, `tests/shortcut-organizer-integration.test.js`, `tests/shortcut-organizer-search.test.js`. Storage tests compare entire before/after objects, including unknown fields and coordinate maps. View tests use a DOM model; they do not prove browser-native layout or keyboard behavior. Native extension QA and the serialized aggregate suite remain required release gates.

Current-match regression checks are in `tests/shortcut-organizer-search.test.js` under `current-match` test names. They cover hidden selections, duplicate occurrences, destination exclusions, orphan sources, no-result/localized counts, a 24-record uncapped selection, stable search/checkbox nodes, focus handoff, IME and repeated clicks, Review/Back and stale reattached controls, close/reopen, pending/departing guards, no extra selection I/O, and a real storage-manager move with one links-only write and complete before/after comparison. A bounded run is `node --max-old-space-size=512 --test --test-concurrency=1 --test-name-pattern='current-match' tests/shortcut-organizer-search.test.js`. These are synthetic deterministic checks, not native Chrome evidence.

## Integrated verification — version 1.1.45

- The full serial Node suite passed 1,824 tests, zero failures/skips; all 53 Python packaging checks passed. The runtime inventory contains 93 files, verified ZIP SHA-256 33c2f5649b6df5ad2816687c9379c06e6b6cb512e03659b74944319de0345cee.
- Independent integrated review passed 154 focused organizer, Countdown, Finder, departure and workspace-lifecycle tests. Additional adversarial probes covered indistinguishable twins, mandatory locking, links-only writes, completed-request replay and concurrent updates to other modules.
- Review found an initial path that could discard a failed drag after category movement. The final guard refuses movement while that layout intent remains unresolved: independent real-controller reproduction verified zero category writes and preservation of the failed drag.
- Final integrated organizer runtime matched the independently reviewed feature; both locale catalogs retained all 22 organizer entries. A category move preserved a concurrently edited Countdown revision/title plus synthetic Scratchpad, Tasks and Focus state.

These are deterministic checks. Native browser operation and saved-export comparisons are separate gates.

## Bounded native data checks — 2026-10-11

An ordinary Settings import supplied five synthetic sites, including two identical title/URL/icon records with distinct saved identities and a record whose category metadata was absent. Genuine Settings exports were compared as complete unnormalized data objects, excluding only the outer export envelope and its timestamp.

- Cancel preserved the complete data payload.
- Moving only the second identical twin changed only its category; the first twin stayed in place.
- A subsequent three-record batch, including the orphaned-category record, changed only the selected category fields. IDs, order, icons, all saved coordinate maps, category records and unrelated settings remained exact.
- Review displayed the intended destination and precise count; orphaned sources were readable by their saved category ID.

The ordinary organizer transaction does not queue implicit layout writes while its mutation hold is active. A separate production-controller model, checked after 350 ms and an explicit flush, verified zero stored-layout writes for missing destination coordinates and no legacy-twin identity allocation. Temporary display fallback coordinates are local UI state. Independently initiated external layout refreshes are separate lifecycle activity; this claim does not prevent other actors from changing shared data.
- Importing the genuine mixed-batch export through the ordinary Settings picker, reloading New Tab and Settings, then exporting again preserved the complete data payload exactly.

Native coverage was English/light desktop on a synthetic profile. Legacy missing IDs, dark/narrow/Chinese presentation, concurrent edits, write failures, large batches and the automatic-coordinate guard were not exercised natively. Renderer interruptions recovered by reloading; their cause was not established. Model evidence above must not be read as native coverage.

## Bounded static-renderer checks — 2026-10-19

[Current workflow acceptance](../saved-site-browser-acceptance.md#organizer) adds
Chinese/dark 390px production-renderer checks for filtered selection, hidden
selection review, Back and Cancel. It uses an explicit synthetic API bridge;
it does not install the extension, submit a move, compare complete stored
snapshots, or replace the historical native-write checks above.
