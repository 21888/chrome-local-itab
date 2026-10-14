# Legacy saved-URL compatibility research

Status: implemented compatibility candidate with synthetic regression coverage;
whole-tree and native release gates are still required. Baseline: v1.1.138,
`ad97c0284abca12ec046b99f73b2c4398e240378`.

## Established facts

The v1.0.6 editor (`2befbd2`, `newtab.js:1172–1195`) saved trimmed URL text without
canonicalizing it. Its storage validator (`storage.js:379–397`) retained that text.
The original position key was `view + "|" + saved URL`. Both `https://example.com`
and `example.com` could therefore be legitimate saved records.

The v1.1.138 workspace gate rejects those two forms as `WORKSPACE_CORRUPT` before
migration writes. Synthetic source data remains exact. This does not establish the
cause or integrity of any particular person's browser data.

Simply accepting canonicalized URLs at the workspace gate is unsafe. Current
stored reads canonicalize URL strings while leaving URL-keyed positions intact.
For two records `https://example.com` and `https://example.com/`, a synthetic first
coordinate `(11.25, -7.5)` becomes associated with the second coordinate
`(111.25, -27.5)`. Later identity allocation can perpetuate that wrong association.
The currently rejecting workspace gate prevents that proposed shortcut from
silently activating these records.

## Implemented narrow contract

Keep the new-input URL normalizer's default behavior. Add an explicit stored-record
validation path with two separate values:

- **Stored identity:** the validated original URL string, retained byte-for-byte in
  records, raw comparison baselines and JSON representations.
- **Destination:** a derived, safe canonical HTTP(S) URL used only for opening,
  existing-site matching or HTML bookmark HREF serialization.

Do not normalize the entire configuration and then put raw URLs back. Full-config
validation can already reject a newly collapsed collision group before the put-back.
Validate stored records and identity groups using their original strings from the
start. Preserve all current checks for record fields, types, IDs, reserved identity
maps, finite coordinates and supported schemas. Do not drop unknown fields to make
validation pass. Existing documented cosmetic defaults remain a separate rule.

There is no automatic URL replacement, coordinate remapping, identity allocation,
new schema or default reset at upgrade. The pre-migration source snapshot and the
workspace bundle retain the original records and every layout key. Explicit later
mutations must carry raw before/after records and retain their exact provenance.

### First compatibility subset

Only consider trimmed, nonempty URL text whose interpretation matches current
navigation helpers:

- Proper lowercase `http://` or `https://` with a valid authority, or a schemeless
  host/path that the current navigation helper unambiguously treats as HTTPS.
- For newly accepted noncanonical forms, reject whitespace/control characters,
  backslashes, replacement characters, malformed percent escapes, credentials,
  even empty userinfo, protocol-relative/repair-dependent forms, and non-HTTP or
  unknown schemes. URL parsing alone is insufficient because it repairs inputs.
- Hostname case, missing trailing slash and other supported spelling differences
  are preserved as text; destination parsing must not mutate them.

Host-with-port strings and uppercase scheme spellings require separate semantic
review. In particular, the old editor's case-sensitive scheme check did not give
uppercase `HTTPS://` the same meaning as the current normalizer. Do not silently
expand this first exception to those cases.

Current canonical validation already accepts some credential-bearing URLs and
malformed percent escapes. Closing those existing gaps is a separate decision;
a narrow legacy compatibility exception must not accidentally expand their
acceptance or claim they were previously blocked.

## Required caller inventory

| Boundary | Current path | Narrow requirement |
| --- | --- | --- |
| Workspace admission and retained content | `validateWorkspaceConfig`, `validateWorkspaceValues`, `completeBackupConfigFromRaw` | Use stored URL validation before raw identity-group validation; no normalization writes. Keep v138 conflict/admission fences. |
| Ordinary reads | `get('links')`, `getAll`, `validateConfigObject`, `layoutSnapshot`, `getLayoutSnapshotForUpdate` | Return the same preserved URL text used by position keys and subsequent baselines. |
| Shortcut input/write entry | `set('links')` → `validateData` → `writeLocalValues`; `setAll` | Choose the stored-array contract before whole-array normalization. Only the explicitly edited/new URL may follow the input-normalization path. Audit every caller; an unclassified writer must reject rather than rewrite old records. |
| Compare-and-swap | `writeLocalValues` expectedLinks, `deleteShortcutWithUndo` expectedLinks, `applyLayoutPatch` expected.links | Compare stored URL spelling exactly. Canonically equivalent spelling changes can change position identity and must conflict. |
| Position/identity mutation | `layoutSnapshot`, `LayoutIdentity.needs/allocate`, `applyLayoutPatch` | Preserve raw previousLinks and every legacy/hidden/orphan view. On an explicit URL collision, derive each new ID's coordinates from that record's exact previous raw URL. Do not assign IDs during startup. |
| Editor | `handleFormSubmit`, `normalizedShortcutDraft`, `saveShortcutLinks` | A title/icon/category-only edit retains the unchanged original URL. An explicitly changed URL keeps the normal input policy and raw prior-record provenance. |
| Delete/Undo and organizer | `shortcutUndoSnapshot`, `deleteShortcutWithUndo`, `undoShortcutDeletion`, `readShortcutOrganizerSnapshot`, `moveShortcutsToCategory` | Preserve all unselected records and layout maps. Do not treat known safe URL spelling as a repaired record; retain strict other-field checks. |
| Complete archives | `completeBackupConfigFromRaw`, `validateCompleteBackupConfig`, `validateImportPayload`, `shared/complete-backup.js` | Export, parse, restore and recovery must retain raw URL/position associations. Admit only the documented stored URL forms, without weakening whole-envelope validation. |
| Manual/Drive/recovery | `getAllForBackup`, `sanitizeConfigForBackup`, `buildManualExportPayload`, `buildDriveBackupPayload`, `makeRecovery`, `getRecoveryBackup` | Do not canonicalize a URL while leaving its position key unchanged. JSON round trips preserve stored identity. Provider access is not part of migration tests. |
| Sync | `readSyncSnapshot`, `acceptSyncSnapshot`, `layoutSnapshot`, `pushToSync/pullFromSync`, identity/fingerprint guards | Preserve raw identity and current conflict/replacement rules. No implicit merge or permission/network changes. Test with synthetic providers. |
| Catalog and existing bookmarks | `navigationLibrarySnapshot`, `catalogCanonicalURL`, `navigation-catalog.savedURLs/savedLocations`, `bookmarkImportSnapshot`, planner existing-site dedup | Derive a safe destination for matching existing rows; keep their raw records and raw freshness baselines. Do not broaden the external catalog/HTML input parser. |
| HTML bookmark export | `bookmark-export.serialize` | Emit an absolute safe HREF from the destination value, preserve titles/categories/count, and never mutate the JSON source. HTML is not a full layout backup. |
| Finder and opening | `shortcut-finder` fingerprint/safeUrl, `openShortcutRecord`, batch open | Keep raw identity fingerprints; only opening derives a destination. The first compatibility subset must already agree with these launch semantics. |

This is one integrated compatibility change. Do not ship admission first while any
read/write/backup caller still collapses the original URL identity.

## Historical red tests and release gate

Explicit research command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/legacy-url-preservation.test.js tests/legacy-url-sync-guard.test.js \
  tests/legacy-url-restore.test.js tests/stored-shortcut-url.test.js \
  tests/legacy-url-consumers.test.js
```

The original research matrix, now `legacy-url-preservation.test.js`, is part of
the ordinary release test glob. On unmodified v1.1.138 it produced **21 tests:
15 expected failures, 6 passing safety controls**. All 21 pass on this candidate.
The failures cover startup, exact coordinates in multiple views, explicit URL-edit
collision identity allocation, title-only edits, schema-2/reserved IDs, complete
and manual JSON/recovery, raw spelling CAS for shortcut and layout writes,
Delete/Undo, category moves, catalog recognition, existing-bookmark admission and
HTML output. Passing controls cover dangerous/unsupported schemes, parser-repair
spellings and unknown link fields without writes.

The new restore, Sync and consumer tests expand the matrix for three coexisting URL
spellings; exact duplicates; mixed identified/unidentified records; raw/complete
recovery equality; old/new concurrent tabs; all v138 interruption/admission checks;
provider isolation; and every explicit mutation listed above. The independent
whole-tree Node/Python/static gates and bounded native browser acceptance remain
required. Synthetic success cannot establish the state of a real user's data.


## Wire compatibility and explicit-operation boundaries

Manual and Drive exports containing a supported noncanonical saved URL use
`version: "2.0"` and `urlIdentityVersion: 1`. Both markers must occur together;
the app/type, schema and optional Drive metadata must agree. Canonical-only
exports retain version 1.0. New imports preserve raw identity from the beginning,
and reject mixed markers or lossy normalization. Recovery downloads use the same
version rule. The independent read-only recovery page recognizes the bound format
without loading Storage, Sync or a workspace session.

Actual version-6 candidate source (`90b91e6`, not a proven Chrome Web Store binary),
v1.1.71 and v1.1.138 parsers reject newly generated affected Manual/Drive files at
the version gate. Those old parsers otherwise collapse the three saved spellings.
Complete archives keep their existing outer versions: actual old Complete parsers
already reject the affected raw records, while the new strict parser preserves
them. This does not make new files readable by an old extension.

Affected local or remote configuration is blocked from both Sync upload and
replacement, including explicit confirmation, own/ack paths, empty-cloud first
upload and a final queued-upload recheck. The finite error is
`SYNC_IDENTITY_COMPATIBILITY` with kind `stored-url`. The user's enabled preference
is preserved. Read-only preview and verified backup before cloud clearing remain
available. A separate transport guard is necessary: the earlier review-on-difference
protection does not protect a first upload that an old client could later read.

Explicit edits or free-layout operations may require schema-2 IDs. Allocation
uses each original row URL and copies every view's coordinate before the edit.
If a stored schema marker exists, the explicit operation keeps it consistent
with the resulting layout; a missing marker remains missing. A confirmed restore
from schema 2 to 1 retains a before-restore recovery copy in the guarded
replacement write and changes the existing marker to 1.
Unconfirmed replacement still refuses without writes. Startup never performs
these explicit schema changes.

## Safety and capacity contract

Stored configuration is detached through own data-property descriptors before
identity validation. Accessors, cycles, non-JSON values and unsupported prototypes
are refused without executing accessors. Only configuration keys are selected;
authentication, provider fields and unrelated recovery chains are not copied or
included in portable exports. Stored-runtime copying keeps the existing workspace
limits (500,000 nodes, depth 40 and 128 Mi UTF-16 string units). It does not reuse
the smaller bookmark-preview budget. Complete archives retain their separate
32 MiB UTF-8 boundary. Synthetic 12 MiB ASCII configurations pass all formerly
supported paths; a 40 MiB runtime configuration is not incorrectly subjected to
the Complete export limit.

New stored-data refusals carry `STORED_CONFIG_INVALID` through both standalone
`get('links')` catches and `getAll`; they cannot enter the old default-writing
fallback. Workspace admission retains the existing `WORKSPACE_CORRUPT` handling.
The newly accepted noncanonical rows have a strict field allowlist. Previously
canonical rows retain the existing unknown-field Delete/Undo contract; the final
strict workspace/Complete validators have not been relaxed.

The matrix checks raw originals and pre-migration snapshots exactly, three
coexisting spellings, exact duplicates, mixed IDs, hidden/orphan/reserved views,
CAS, explicit collisions, Delete/Undo, organizer and bookmark/catalog consumers.
It exercises manual/Drive/recovery and Complete archives for current, all live
and Trash workspaces, replacement failures and interruption recovery. Portable
personal-module projection is compared under its established contract rather
than mislabeled as an exact raw storage dump. No test contacts a user profile,
real provider or authentication service. Passing synthetic tests cannot establish
what remains in any particular user's browser.
