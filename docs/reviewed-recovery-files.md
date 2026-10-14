# Review a retained copy and download a configuration file

The independent recovery page can now review one retained representation and,
only after that review is displayed, offer a separate configuration-file download.
It does not import the file, initialize a workspace, retry migration, fetch Sync,
restore an earlier value, or write/remove local storage. The original page and
its drafts can stay open. This capability is separate from investigation JSON.

## Eligible sources and limits

A source must have its own matching recorded SHA256 checksum: either
`rawConfiguration` with `rawConfigurationChecksum`, or a recognized Manual
`payload` with `checksum`. A usable sibling does not repair an incomplete source.
The source must pass strict nested field inventories, have every required
configuration field, contain no recognized credential-bearing URL, and survive
the current import contract without filling defaults, changing saved URLs,
generating IDs, normalizing text or silently dropping unknown fields.

Direct preMigration snapshots have no persisted historical checksum. Registry
attribution or a newly computed hash does not supply one. They, direct legacy
records, live/Trash configurations, and damaged or future-format copies remain
investigation-only. A separately checksummed recovery node nested inside such a
source can qualify independently. No source is automatically selected as latest.
A checksum establishes internal consistency, not authenticity or completeness of
all user data. Content that was never retained cannot be reconstructed here.

The exact selected original is used, never the privacy-filtered investigation
projection. Raw URL spelling, shortcut order, repeated URLs, categories, layout
IDs and all accepted legacy/ID-based coordinates remain intact. Opaque or hidden
view keys, including `__proto__` and `auth_notes`, are treated as data. Ambiguous
credential-like keys can make the whole candidate ineligible; they are not
silently omitted from a supposedly complete configuration.

## Scope and file format

This is a configuration file, not a Complete archive. It includes supported
configuration, including its privacy preferences. It excludes Sync/provider
preferences, runtime generation markers, recovery-container metadata, personal
modules, prompts, collections, other workspaces and older copies. Supplied
unknown or malformed fields in the selected configuration are refused, not
excluded as though recognized. Valid excluded provider strings are never copied
to the output. Free-form user content can still be private; keep downloads
private and inspect them before sharing.

Every file uses the existing strict `version: "2.0"`, `urlIdentityVersion: 1`,
`type: "backupSnapshot"`, `app: "local-itab"` envelope, with schema 1 or 2 matching
the retained relationships. Even canonical-URL copies use v2. Formal139's current
Settings importer accepts this format; older clients reject it. The transport
contains the established disabled-Sync object and does not change this device's
saved Sync setting. Later import is a separate explicitly confirmed replacement
workflow with its existing safeguards.

The raw checksum does not cover an adjacent portable timestamp, so raw review
time is shown as unknown. A portable record time is shown only when it is inside
that separately checked representation. New-file generation time is distinct.
Final UTF-8 size, including indentation and envelope, is limited to 32 MiB before
creating a Blob. That bound is separate from ordinary configuration capacities.

## Review lifecycle and privacy boundary

The page initially shows only inspection metadata. The user chooses one source
and selects Review configuration file. Successful review renders its provenance,
counts, timestamp limits, scope warnings and exact source site text (paginated;
very long text is explicitly shortened on screen, not in the checked file).
Only then is Download reviewed configuration available. The filename is fixed;
untrusted source names never enter it. A requested download does not prove that
the browser completed saving the file.

The inspector binds a private capability to the exact inspector/report/entry/
representation. It caches only the current review's generated file. Starting a
new inspection or review invalidates older and pending reviews even when the new
operation fails. Refresh, source changes, closing, hiding/suspending the page and
teardown revoke UI actions. Late async results cannot enable a stale download or
steal unrelated focus. A copied capability or matching `copy_N` label is not
sufficient. Repeated download activation is throttled across both file types.

Investigation export remains non-importable and has its original lossy,
allowlisted purpose. Multiple URL-like segments in a legacy position key are now
checked for credentials; such a key is omitted from investigation output and
blocks the whole importable-file candidate. Neither path changes the original.

## Implementation and required verification

The recovery page loads pure dependencies and the shared configuration codec,
not Storage or workspace managers. `shared/recovery-file.js` adds a deliberately
stricter admission policy around that single existing importer implementation.
It does not fork a second general configuration validator. Stored current data,
automatic behavior, write locks, Sync protection and replacement rules are
unchanged.

Tests cover actual importer round trips, independent checksums, exact raw values,
malformed/unknown/credential cases, finite fixed errors, bounded copying, source
immutability, zero writers/providers, capability races, bilingual explicit
review/download controls, stale focus and lifecycle handling. Cold formal139
parity and all existing import/export/Sync/Complete suites remain mandatory.
Native browser download/keyboard acceptance uses synthetic RAM fixtures only.
The package includes 130 runtime assets; historical test oracles and tests are
excluded. This document does not itself assert a completed full/native gate.
