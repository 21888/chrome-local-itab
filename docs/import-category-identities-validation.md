# Imported category identities

Validated on 2026-10-10 against development 1.1.7.

## Repair

Settings imports previously accepted repeated explicit category IDs. The resulting data then failed the guarded category-edit baseline. Legacy categories without IDs could also receive identical time-based fallback IDs.

Import validation now rejects duplicate explicit IDs before replacement. Missing or empty legacy IDs receive deterministic `cat_import_N` IDs after reserving every explicit ID, built-in ID, the reserved `all` ID and existing shortcut-category references. The prepared categories survive final normalization unchanged. Existing IDs, links, ordering, schema-2 coordinates and omitted-category behavior are preserved; normal runtime normalization is unchanged.

## Evidence and limits

- The full integrated Node suite passed 682 tests; Python packaging tests passed 19.
- Negative-control tests reproduced acceptance of duplicate IDs before the repair.
- Tests cover supported legacy envelopes, collision allocation, omitted and empty lists, unchanged input on rejection, no writes on invalid import, valid round trips, schema-2 identity preservation and actual Options import through real storage restoration into a subsequent guarded category edit.
- Additional local import-to-render models exercised hostile settings, bookmark and task text, non-HTTP(S) URLs, and remote icons with online icon access disabled. The inspected paths kept labels literal and did not perform the forbidden network operations in those models.
- Independent code/test review found no blocking issue. No native browser, image-decoder, live Sync/Drive, traffic-capture or exhaustive security pass is implied.

No permissions, storage schema, network defaults or dependencies changed.

## Bounded native acceptance

Official Chrome for Testing 155 on cloud Linux loaded the exact 60-file development runtime in an isolated profile with synthetic data. A duplicate-ID backup was rejected before the replacement confirmation; the prior quote, category and shortcut remained. A legacy backup with a missing category ID imported successfully, and a subsequent category-name edit persisted after reload. No other browser or operating-system pass is implied.
