# Preserve saved shortcut category IDs

Deleting a category in Settings removes its navigation metadata without moving the saved shortcuts that still refer to its ID. The shortcut editor now adds a temporary option for its own nonempty string category ID when that ID is absent from the current category list. Its English label says “Not in category list”; its Chinese label says “未在分类列表中”. Opening, cancelling or saving the editor does not recreate category metadata or repair unrelated orphan records.

A category selector chooses IDs, not free text. An actual selected option retains its exact value, including Unicode and whitespace, both when retaining the saved category and when explicitly choosing a different listed category. The temporary option is constructed with `value` and `textContent`; IDs are never interpreted as HTML. New shortcuts still use the current category, or the existing `work` default for All/empty selection. Temporary options are rebuilt per opening and never copied into the category list.

The change does not alter storage validators, Settings deletion, conflict guards, schema rules, Sync, icon requests, recovery, or save ownership. Missing category fields retain their existing legacy default. Explicit empty/non-string categories remain invalid for active workspace data even though the legacy display can show a default. Import normalization is a separate existing boundary; no temporary option makes invalid records valid.

## Focused acceptance

Run `node --test --test-concurrency=1 tests/shortcut-unlisted-category.test.js`.

The synthetic in-memory tests exercise the production Settings delete/save path, More/Edit menu, shortcut submission, StorageManager and workspace sessions. They cover:

- Schema 1 and schema 2; English, Chinese and fallback labels; pristine editor and cancelled drafts make no writes.
- Title-only save after category deletion; supported raw URL spelling, sibling/hidden sites, legacy/manual/identity/reserved positions, schema markers, unrelated content and existing recovery copies remain exact.
- Exact absent or listed IDs containing whitespace, Unicode, reserved-looking names and HTML-looking text; explicit target choices for both Edit and Add; unmatched native select values retain the default.
- Explicit moves, cancel/reopen/new editors, no duplicate or leaked temporary options, empty or asynchronously loaded category lists, metadata deletion while open or while a save is pending, and preservation of newer focus after dismissal.
- Real active-workspace title and category saves; migration source and pre-migration recovery stay unchanged.
- Empty/non-string active data remains rejected with zero writes; unsupported original URLs, invalid layout IDs and unknown fields on noncanonical URL records remain rejected without dropping the original fields.

The small DOM harness explicitly models native select unmatched-value behavior. It is not a browser screenshot, native keyboard, or accessibility claim. At the implementation checkpoint, focused acceptance and related regression checks passed; full-suite and native-browser acceptance remain separate release gates.
