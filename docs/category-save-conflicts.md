# Category saves across Settings tabs

## Contract

Settings keeps the category baseline that populated its form. An unchanged
category form is omitted from Save Settings, so unrelated saves preserve the
latest categories, including another tab's additions, renames and deletions.

A dirty category form carries its expected baseline to StorageManager. The
comparison and write run together under the existing `local-itab-local-write`
Web Lock. Malformed or lossy-normalized authoritative categories and invalid
expected baselines fail closed, including missing/duplicate IDs, empty names
and unsupported extra fields. A mismatch rejects the whole settings write and shows an explicit
conflict. The existing form and edits remain available; there is no automatic
merge, overwrite, retry or reload. Open another Settings tab to inspect the
latest categories and reapply the intended edits there. Do not refresh a dirty
conflicted tab before recording its edits.

Only successful category writes advance that form's baseline. Saving does not
rerender the category inputs, so input entered during an asynchronous write is
retained. Same-page saves are serialized. Confirmed import, reset, Drive restore
and explicit cloud replacement invalidate queued ordinary saves and stop stale
form saves during the pending reload. Cancelled confirmations leave editing
available; failed replacements allow retry without advancing the baseline.

Shortcut records, category IDs, layout positions and personal-content boundaries
are not migrated or rewritten by this fix. Explicit whole-data replacements
retain their established confirmation and recovery behavior. This change does
not introduce generalized conflict handling for other Settings fields.

## Automated verification

Run from the repository root:

    node tests/category-save-conflicts.test.js
    node --test tests/*.test.js

The new regression executes actual Options and StorageManager code with two
independent Options DOM contexts sharing storage and a serialized lock model.
It covers each of add/rename/delete, clock-only saves, repeated stale dirty
conflicts, links/layout preservation, storage-write/read failures, missing Web
Locks, newer input during pending saves, repeated saves, reset/import races,
cancelled/failed imports, failed resets, successful own saves followed by failed
resets, malformed baselines and both guarded storage entry points.
Expected failure logs are intentionally emitted by production storage code.

## Native unpacked-extension smoke check

1. Open Settings in two tabs with Work and Reading categories. Save a link in
   Reading and note any existing independent shortcut positions.
2. In tab B add Research and save. In tab A change only the clock format and save.
   Reopen Settings and verify Research remains. Repeat with a Work rename and a
   Reading deletion. Confirm links, their category IDs and positions survive.
3. With tab A's category form still stale, edit a category there and save. Expect
   an explicit conflict, unchanged saved categories and intact edited inputs.
   Repeat Save; do not expect silent overwrite or false success.
4. Make rapid successive category edits in one tab while saving. Verify the final
   input is retained and can be saved, without reverting to an earlier response.
5. Trigger an autosave, then confirm Reset or Import. Verify the replacement stays
   in place after its reload; cancelled confirmation should keep edits available.

The DOM/lock model does not substitute for native extension smoke verification.

## Bounded native acceptance, 2026-10-09

On the identical final runtime in official Chrome for Testing, two Options tabs verified that B's newly added category survives A's unrelated clock-only save and subsequent reload. A conflicting stale category rename in A was explicitly rejected with a readable warning and its edited field remained intact. This is actual native two-tab behavior. The add/rename/delete matrix, malformed authoritative records and reset/import interruption cases are additionally covered by deterministic production Options/Storage tests; those broader cases are not all native observations. Final aggregate: 125 passing tests.

## Incomplete category names, 2026-10-16

Clearing a category name, including entering only whitespace removed by
JavaScript `trim()`, leaves an unfinished rename. Ordinary Save Settings and the
category editor's debounced autosave now reject the entire submitted form before
writing. The English/Chinese notice asks for a name or the row's Delete (✕)
button and states that Settings were not saved. Other fields in that submission
remain as page-local drafts too. Complete the name or explicitly delete the row,
then save again. Deleting every row still supports an empty category list.

Validation is captured synchronously with each submission, before it waits in
the existing same-page queue. A rejected submission advances neither category
baseline. Valid queued submissions retain the existing cross-tab comparison,
write serialization and raw-input ownership. An older successful write cannot
mark a later empty-name draft clean. The page's existing departure and deferred
reload protection therefore continues to recognize the unfinished draft, even
when its Settings panel is hidden. Dedicated helper saves, such as background
color, retain their separate existing behavior and do not acknowledge the
unfinished category.

Before this fix, `getCategoriesFromDOM()` filtered out the empty name, so the
ordinary save removed that category's navigation metadata and marked the visible
empty row clean. The confirmed reproduction retained the associated shortcut
records and their category IDs, legacy/identity positions, original recovery
copies and private local content; it did not delete those shortcuts. This UI
validation does not restore category definitions already removed by a prior
save, change explicit deletion, alter schemas/storage/conflict protocols, or
introduce new normalization rules for nonempty names or default icons.

### Focused regression

    node --test tests/category-name-draft.test.js tests/category-save-conflicts.test.js tests/settings-stale-save.test.js tests/shortcut-unlisted-category.test.js tests/local-content-lifecycle.test.js tests/bookmark-import-options.test.js

The new suite runs actual Options, StorageManager and lifecycle code in separate
page contexts sharing modeled storage and Web Locks. It covers schemas 1/2,
English/Chinese notices, empty/whitespace/NBSP names, a newly added empty row,
repeated saves, simultaneous edits to other fields, explicit deletion,
newer input during pending writes, queued valid/invalid/valid submissions,
cross-tab add/rename/delete conflicts, definite write failure and retry,
unchanged stale forms, dedicated background saving, hidden-panel validation,
lifecycle Save, an originally empty list and existing nonempty/icon fallbacks.
It checks storage objects and retained row/input identity, focus, pending draft
state, beforeunload cancellation and deferred reload behavior.

The 28 new checks produce 23 failures and 5 passes on the unchanged integration
baseline, then 28 passes with this fix. All 101 tests in the six explicitly
listed files pass. Syntax, locale-JSON parsing and diff-whitespace checks also
pass; aggregate release validation is separate.

These are deterministic DOM/storage/event models. The new fix has not been
verified in native Chrome, with a real input method or screen reader, or against
a native browser departure dialog. Existing broader composition-autosave,
repeated Add-key activation and Delete-focus behavior are unchanged by this fix.
