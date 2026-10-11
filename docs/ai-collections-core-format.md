# AI result collections core v1

This is a core-only foundation for an open-source, auditable AI workbench. The
manual entry slice does not constrain future user-enabled model integrations.
This module saves excerpts supplied by the user. It does not fetch source URLs,
read websites or browser history, scrape conversations, open links, load images,
render HTML/Markdown, execute saved code, use the clipboard, contact a model,
request new permissions, or store model credentials. A saved excerpt is not a
complete conversation or a guarantee that the source remains accessible.

UI, unified prompt/result search wiring, workspace relationships and complete
backup module registration remain integration work. No existing behavior,
manifest, version, configuration export, sync/Drive policy or release is changed
by these three new files. Do not describe this core as the completed feature.

## Storage contract

`shared/local-ai-collections-store.js` exports `LocalItabAICollections` in a
browser and a CommonJS API in tests. The default backend uses only
`chrome.storage.local.__localItabAICollectionsV1` and the exclusive Web Lock
`local-itab-ai-collections-v1`. An injected backend implements `lock(action)`,
`read()`, `write(state)`, and `subscribe(listener)`. All writers must use the same
lock and schema. Missing storage is empty; invalid or unknown stored formats
fail closed without overwriting them. A write is followed by a read-back check.

A state has exactly:

- `schemaVersion: 1`, `revision`, `enabled`
- `records`, `recovery`, `receipts`

`enabled` is only the local presentation preference. `records` and `recovery`
are global reusable content, not device preferences. Workspace membership must
be separate references to stable record IDs; adding one item to multiple spaces
must not copy its body. An optional `ids` search filter accepts those references.

Each record has exactly:

- `id`: stable opaque record identity
- `version`: opaque editor conflict fence, distinct from a body-version ID
- `revision`: monotonically increasing record revision
- `title`, `body`: required strings; original body text is never normalized
- `type`: `answer`, `code`, `plan` or `other`; categorization is not verification
- `tags`, `tool`, `sourceUrl`, `notes`
- `promptRef`: null, or `{ promptId, bodyVersionId }`
- `createdAt`, `updatedAt`, `deletedAt`: canonical UTC ISO timestamps; active
  records have null `deletedAt`
- `currentVersionId`, `history: [{ id, body, createdAt }]`

`notes` are personal annotations, stored and exported separately from the
original excerpt. Every record starts with one immutable body history entry.
The current body and `currentVersionId` must equal the last history entry.
Metadata edits do not change body history. A reviewed body change appends a new
entry, including when restoring an earlier body; later history is never removed.
Body-version IDs are unique across records and cannot be reused for different
text, owner or version date, including in recovery snapshots. Clock rollback
cannot move record/history timestamps backward.

## Mutation and review API

```js
const store = new LocalItabAICollections.Store();
const command = store.request('add', {
  title: 'Useful explanation', body: 'Exact manually pasted text',
  type: 'answer', tags: [], tool: '', sourceUrl: '', notes: '', promptRef: null
});
const state = await store.mutate(command);
```

`add` requires title/body only. Other fields default as shown. It always adds a
new record; there is no automatic merge. `createDraft()` returns defaults;
`createDraft(record)` returns owned editable fields plus `id` and `version`.
Editing a draft never changes stored records.

Commands:

- `edit`: `id`, latest `version`, and any subset of editable metadata. An
  unchanged `body` is accepted for full-form submissions; a changed `body`
  fails with `REVIEW_REQUIRED`.
- `remove`, `restore`: `id` and latest `version`. These archive/unarchive while
  retaining identity, history, notes and prompt links. Archived records cannot
  be edited. No permanent-delete or automatic trash-clearing operation exists.
- `enable`: `enabled` boolean and latest whole-state `revision`.
- `revise`: the exact plan returned by a review method below. Only call after
  explicit acceptance of the proposed excerpt revision.
- `replace`: the exact plan returned by `review(source)`, after explicit
  acceptance of the full-library replacement and offering a downloadable
  recovery copy.
- `recover`: recovery snapshot `id` and latest state `revision`. This replaces
  live records with that snapshot and retains the displaced records in a new
  snapshot; the consuming UI must clearly review this replacement too.

Excerpt changes are a separate, reviewed action:

```js
const plan = await store.reviewRevision({ id, version, body: proposedBody });
// Display current/proposed text and obtain explicit confirmation first.
const command = store.request('revise', plan);
await store.mutate(command);
```

`reviewVersionRestore({ id, version, versionId })` prepares the same revision
plan from a saved historic body. A revision plan is exactly
`{ reviewId, id, version, body, previousVersionId, restoredFromVersionId }`;
the last field is null for a newly entered body. Plans are immutable, tied to
the Store instance that created them, expire after 16 newer previews, and
become stale if the relevant record changes. Unchanged bodies do not write.
Review preflights history/storage capacity. The final mutation checks capacity
again; refusal never truncates content or evicts history.

Commands copy and freeze their input before waiting on another writer. Keep the
exact original command while a save is uncertain. `receipts` retains only the
latest mutation receipt `{ id, digest, stateDigest }`: SHA-256 fingerprints of
the canonical command and resulting state (excluding receipts). The same
operation and payload can confirm an uncertain committed write without adding
another record. Altered payloads, altered saved state or stale editor/state
fences fail. The command digest uses sorted object keys, so property order does
not affect identity. Receipts are bookkeeping, never user content or exports.
A lost read/verification failure is not evidence that nothing was saved. Keep
the draft and same command; refresh/review before reporting completion. Backend
failure details are not included in errors. Synchronous or asynchronous backend
lock failures before entry normalize to `LOCK`; unexpected errors after the
callback starts normalize to `VERIFY`, since a write might have committed. Keep
the draft and original operation in that uncertain case. Owned validation and
restore-fence errors retain their bounded codes without trusting arbitrary
backend error properties.

## Plain text, URLs and references

All public object inputs are copied from own plain-data property descriptors.
Accessors, custom prototypes, toJSON/functions, symbol/non-enumerable fields,
sparse arrays, cycles, excessive depth/size and prototype-pollution keys fail
before evaluation. These are data APIs, not a sandbox for executable JavaScript
Proxy traps or caller-provided functions. Raw object inputs must be JSON-shaped.
Titles/tags/tool disallow control characters; body/notes allow tabs, CR and LF.
Invalid Unicode, NUL and other control characters reject rather than normalize.

`sourceMetadata(sourceUrl)` returns:

```js
{ provided, attribution, href, host, hostname, protocol }
```

An empty URL is valid: `provided: false`, `attribution: 'not-provided'`, and null
URL/host/protocol fields. A nonempty URL is always `attribution: 'user-provided'`.
It must be explicit HTTP/HTTPS with a nonempty authority and hostname, no
userinfo (including an empty `@`), whitespace, backslash or any Unicode
`Bidi_Control` character (including Arabic, left-to-right and right-to-left marks). JavaScript, data, file and scheme-relative links are rejected.
`sourceUrl` preserves the entered string; derived `href` is parsed/canonical,
and `host` is the actual ASCII/punycode hostname including non-default port.
These fields are presentation data only. The core never visits or opens them.
The UI must show the actual host before an explicit user-triggered opening and
warn that the original account or permission may be needed. Never auto-fetch a
favicon, preview or image from saved content. Render all returned strings as text.

`findDuplicates(state, { body, sourceUrl })` returns `{ id, title, deletedAt,
reason }` suggestions, including archived matches. Exact body equality and
canonical URL equality yield `same-source-and-body`; identical bodies with no
URL yield `same-body-no-source`. Different body bytes or different URL
path/query/fragment are not merged. The UI can let the user choose new/cancel.

`resolvePromptReference(record, getPromptVersion?)` returns `{ status,
reference, version }` with `unlinked`, `unresolved`, or `resolved`. An omitted
resolver or missing version yields explicit `unresolved`, retaining both IDs.
The supplied resolver must be a synchronous local lookup, for example:

```js
resolvePromptReference(record,
  (id, versionId) => LocalItabPrompts.getVersion(promptState, id, versionId));
```

A result with a different prompt ID or version ID is rejected. No latest-version
fallback exists. Deleting, editing or selectively restoring prompts therefore
cannot silently rebind collections. User-requested link changes are explicit
metadata edits. `getVersion(collectionState, collectionId, bodyVersionId)`
resolves the collection's own immutable excerpt version across live, archived
and recovery records, or returns null.

## Local search

`search(state, query, { removed?, type?, ids? })` scans only validated saved
current titles, bodies and tags. All whitespace-separated terms must match,
case-insensitively; Chinese substring search works. Notes, source URLs, body
history and recovery snapshots are excluded. Normal results omit archived
records; `removed: true` is a separate trash search. `ids: []` is an empty
workspace selection, not all records.

Results are `{ record, matchedFields, snippet }`, sorted by updated time and
stable ID. Returned records are independent copies. Snippets are plain text,
bounded to 180 code points plus ellipses and never split surrogate pairs. This
is intentionally a derived on-demand index: edit, archive, restore and import
cannot leave behind a stale persistent index. UI integration can combine these
results with the prompt core's result shape, label each record kind and apply
workspace membership references. Search terms never leave this module.

## Portable backups and recovery

Exports are exactly:

```js
{ format: 'local-itab-ai-collections', schemaVersion: 1, exportedAt,
  content: { records }, recovery }
```

Exports include active/archived records, original excerpts, all body versions,
notes, source URLs, prompt references and recovery snapshots. They exclude
visibility, receipts, search indexes and unsaved drafts. Exported files are
unencrypted and can expose private text and private conversation links.
`export({ omitSourceUrls: true })` clears only sourceUrl in the exported copy,
including recovery snapshots; it never edits the saved records or alters bodies
and notes. This is not general anonymization. A redacted copy may have the same
snapshot IDs with different metadata; importing it back alongside the original
snapshots correctly requires resolving a snapshot conflict rather than silently
overwriting them. It can be imported into an empty destination.

`parseBackup(source)` rejects unsupported versions, unknown/missing fields,
duplicate JSON object keys (including escaped spellings), duplicate identities,
invalid dates, fields, URLs, links or history, and oversized input before a write.
`review(source)` additionally preflights a full replacement and retains an
immutable plan with:

- `reviewId`, exact `source`, latest state `revision`
- `incoming` and `current`: active, removed, version and recovery counts
- `conflicts`: same-ID records with changed flag, local/incoming body-version IDs
- `promptReferences`: all incoming live and recovery links, identified by
  `location`, `recoveryId` (null for live), `recordId`, `promptId`, `bodyVersionId`
  and `status: 'unresolved'`. A collection-only core cannot assert that an
  external prompt dependency exists. The integration must resolve/display these
  locally or preserve the missing-reference state.

The UI must explain the replacement scope (including trash), display reference
issues/conflicts and offer the current export as a downloadable recovery copy
before acceptance. `replace` preserves the displaced nonempty live content in a
snapshot, merges only identical or nonconflicting incoming snapshots and renews
editor fences. Body-version IDs remain unchanged. Recovery snapshots have
exactly `{ id, createdAt, content: { records } }`. An empty destination acquires
an incoming archive without inventing a useless empty snapshot. Recovery
operations swap a snapshot with current content so the displaced content is
still available. Unknown formats and insufficient capacity fail before writing;
there is no claimed cross-module atomic rollback.

Future complete-backup integration must register this content module once,
validate references with selected prompt/workspace modules, preserve existing
collections when an older backup lacks the module, and test selective restore.
An enabled sync or Drive option is not permission to add these records to cloud
scope. The library is not an encrypted vault.

## Bounded preservation and verification

`LIMITS`: 200 records including archived; 200-code-point title; 32,000-code-point
body; 16,000-code-point notes; 20 tags of 64 code points; 200-code-point tool;
2,048-code-point URL; 20 body versions per record; 8 recovery snapshots;
2 MiB total serialized storage budget with 16 KiB metadata headroom; 500-code-point
query. Additional input graph limits prevent large/deep hostile objects from
reaching serialization. All limits reject whole operations. There is no silent
truncation, merging, history eviction, trash clearing or permanent deletion.
Exporting alone does not authorize deleting the original content.

Focused checks:

```sh
node --check shared/local-ai-collections-store.js
node --test tests/local-ai-collections-store.test.js
```

The focused suite uses an in-memory serializing backend, simulated failures and
a Chrome-shaped local-storage/Web-Lock API. It does not establish native Chrome,
UI, clipboard, unified search, complete-backup or workspace acceptance. No full
suite was run during concurrent native-browser work, and this core was not
committed, pushed or released.
