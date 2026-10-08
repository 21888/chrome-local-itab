# Independent positions for duplicate URLs

Free placement and manual grid snapping give each saved shortcut its own position, even when URLs and titles are identical. Grid ordering still follows the shortcut list.

## Existing layouts

- A unique-URL shortcut keeps its legacy view + URL position key. Reading settings does not assign IDs.
- When independent placement or a guarded shortcut mutation needs to distinguish duplicates, all members of each colliding normalized-URL group receive stable `layoutId` values together. They survive edits, category changes, reordering and sibling deletion.
- Every legacy position key and point is retained. Previously overlapping duplicates initially keep the same old coordinate; the extension cannot recover separate positions that were never stored. Move a shortcut to give it an independent position.
- Editing URL X into an existing URL Y copies the edited shortcut's old X coordinates, while existing Y shortcuts keep Y's history. A newly added shortcut has no invented prior history.
- The assignment, copied coordinates, local recovery snapshot and page-invalidation generation commit together under the same local-write lock. Failure keeps the previous bundle. Another open page must reload after a replacement; a conflicting position change can be retried explicitly.

## Backup format and recovery

Legacy/raw configurations and supported version-1 envelopes remain importable. Identity-bearing JSON and Drive snapshots use `schemaVersion: 2` inside the existing `version: "1.0"` envelope. Import these files with this updated version; the tested previous importer (published `f1456cbb`) rejects schema 2. Keep the intact envelope: raw identity-bearing data without its format version is rejected, as are malformed, repeated or incomplete IDs.

The added configuration fields are:

- `links[].layoutId`: optional `l_` followed by 32 lowercase hexadecimal characters.
- `layout.identityVersion: 1`: identity-data format marker, separate from the backup envelope version.
- `layout.positionsById[layoutId][view]`: independent finite `{x, y}` coordinates. This namespace is separate from the unchanged `layout.positions` keys.

Empty maps reserve IDs, including the history of deleted shortcuts. The marker is retained after those shortcuts are deleted. No URL/title/index matching is used to reconstruct missing IDs from an imported copy.

Settings → Data contains downloads for the original pre-upgrade backup and the latest recovery backup, when available. A confirmed import/Drive restore keeps the current device's provider preferences and stores the prior configuration locally before replacement. The latest replacement recovery is replaced by the next such operation; the original pre-upgrade copy remains until Reset. Download copies you need to keep. Reset also removes local recovery copies.

Recovery files are ordinary validated JSON backups. Downloading does not restore them automatically: use Import Settings to review and confirm the replacement. Recovery storage failure aborts the transition. Local coordination/recovery records are excluded from ordinary exports, Drive snapshots and Chrome Sync.

## Chrome Sync compatibility

The raw Sync configuration and existing metadata/chunk keys stay compatible with the old transport. Identity-aware uploads include the actual marker/IDs/maps plus configuration-schema metadata and a complete-payload fingerprint. IDs and coordinates are never omitted to fit quota; large embedded images retain the existing omission behavior.

The tested previous binary ignores schema metadata and strips fields it does not understand. It can still display the preserved legacy shared positions, but cannot retain independent positions. Update other devices before using duplicate placement with Sync. A fresh installation cannot reconstruct identity history already overwritten in the cloud by an old client.

New clients inspect raw data before normalization, then recheck the latest local bundle inside the write lock. A changed legacy/stripped copy, malformed snapshot, missing reserved identity history or identity-removing upload is blocked. Current local data, generation, last successful sync time and enabled preference remain intact. Settings shows a compatibility status; the dashboard links to it. All pages cancel queued automatic uploads and recheck shared eligibility under the local lock immediately before enqueueing a provider write. An already enqueued provider operation can finish; its completion cannot adopt a newer replaced local bundle.

An exactly acknowledged, unchanged legacy cloud snapshot can be upgraded once. Exact shared upload fingerprints suppress only this profile's own notifications, including across open pages. They do not ignore an unrelated old-client rewrite arriving immediately afterward. Accepted remote snapshots do not automatically upload themselves again.

Download retries may accept a complete compatible copy if local data has not changed since the block. Routine Upload never resolves a compatibility conflict. After a confirmed local restore while Sync is enabled, a sticky review state prevents either automatic upload or an immediate remote restore. Explicit choices are:

1. Update other devices and retry Download. A local edit made while blocked requires an explicit decision rather than automatic replacement.
2. Choose **Replace this device with cloud copy…**. The confirmation names the current copy's shortcut count and warns about missing independent positions. A local recovery must succeed, and the cloud fingerprint must still match the preview.
3. Explicitly clear the cloud copy (or confirm disabling Sync while blocked) to keep this device. A readable conflicting cloud copy must first be retained locally for recovery. Review other devices before enabling/uploading again; they may republish their own copy.

There is no cross-profile/server-side compare-and-swap or automatic merge of independently allocated identities. Two profiles may develop different valid histories; choosing between them remains explicit. Deterministic model tests cover these boundaries; no live Google authorization or real-account migration is part of this change's validation.
