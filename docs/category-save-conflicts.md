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
