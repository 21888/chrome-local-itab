# Prompt library core v1

This is the local persisted foundation for the AI workbench. It does not decide
which future provider, execution or comparison features the product will offer.
This module itself never reads pages, uses the clipboard, executes templates,
contacts a provider, or stores API credentials. Provider authorization belongs to
an explicit future integration. The standalone core has no UI or manifest wiring. Coordinated complete-backup
integration is documented in `prompt-backup-transactions.md`.

## Storage and identities

`shared/local-prompts-store.js` exports `LocalItabPrompts` in browsers and a
CommonJS API in tests. Its default Chrome backend uses only
`chrome.storage.local.__localItabPersonalPromptsV1` and Web Lock
`local-itab-personal-prompts-v1`. Inject `lock(action)`, `read()`, `write(state)`,
`subscribe(listener)` for another backend. The integrated library uses
`workspaceManager.createPromptBackend(LocalItabPrompts)`; its lock ordering and
durable interrupted-restore fence are described in the transaction document.
The default Chrome backend also reads that fence, without writing it. All
writers must share the same lock
and validate the same schema. Missing storage reads as empty; malformed or
unsupported storage fails closed, without initializing over it.

State has exactly `schemaVersion: 1`, `revision`, `enabled`, `records`,
`recovery`, and `receipts`. `revision` fences whole-library changes. `enabled`
is a local presentation preference, not an instruction to discard content.

Each record has exactly:

- `id`, `type: "prompt"`, `version`, `revision`
- `title`, `body`, `tags`, `category`, `tool`, `favorite`
- `createdAt`, `updatedAt`, `deletedAt` (null while active)
- `currentVersionId`, `history: [{ id, body, createdAt }]`

IDs are stable opaque tokens. The mutable record `version` is an opaque editor
conflict fence; it is different from `currentVersionId`, which identifies one
immutable body version. Per-record revisions increase on change, including
imports/recovery. Body changes append a history entry. Title, tags, category,
tool, favorite, archive and unarchive changes do not append body history.
Identical edits do not write. Restoring a non-current body version appends a new
version and retains later history. Dates are canonical UTC ISO strings;
backwards system-clock changes cannot move record dates backwards.

Bodies are global library content, stored once. Workspace membership must use
separate references to record IDs, not duplicate these records or classify the
library as generic device preferences. Future complete backups must include the
library once and check reference integrity. Result collections should store both
prompt ID and body-version ID; `getVersion(state, promptId, versionId)` resolves
live, archived and recovery-snapshot versions, or returns null for a missing
reference. It never silently chooses a different version.

## Mutation API

```js
const store = new LocalItabPrompts.Store(optionalBackend);
const state = await store.read();
const command = store.request('add', {
  title: 'Explain a topic', body: 'Explain {{topic}} to {{audience}}',
  tags: ['Learning'], category: '', tool: '', favorite: false
});
const saved = await store.mutate(command);
```

- `add`: required title/body; tags/category/tool/favorite default to empty/false.
- `edit`: id and latest record version; any subset of editable fields.
- `remove`, `restore`: id and latest record version. Both retain ID and history.
- `restoreVersion`: id, latest record version and the historical `versionId`.
- `enable`: `enabled` boolean and latest state `revision`.
- `recover`: recovery snapshot `id` and latest state `revision`; swaps the
  selected snapshot into live records and saves the displaced live records.
- `replace`: only the unchanged plan returned by this Store's `review(source)`.

`request` owns and freezes its inputs. An add command creates the record whose
ID is exactly `command.operationId`; callers must use this ID after uncertain
writes rather than guessing from text. Public input boundaries use a bounded
descriptor-safe plain-data copier: accessors and `toJSON` hooks are never run;
functions, unsupported prototypes, cycles, sparse arrays, symbols and hidden
properties are rejected. Keep that exact command for uncertain
write retries. Internal receipts are `{ id, digest }` entries. The SHA-256 digest binds the
canonical complete command to its operation ID. A receipt is accepted only while
it is the latest committed operation and the complete command matches; payload
substitution or later changes cause `CONFLICT`. The unpublished v1 internal
receipt shape changed during integration; portable archives omit receipts. Read-back verification follows every
write. A failure does not prove nothing was written: keep the editor draft and
refresh/review before claiming success. Errors expose bounded codes, not user
content or backend error text. Independent record changes can merge under the
shared lock; stale same-record changes fail before writing.

`createDraft(record?)` returns independent editable fields (plus id/version for
an existing record). It is not a saved record. The caller owns unsaved-draft
navigation guards, conflict presentation and clipboard behavior.

## Variables and local search

`previewTemplate(body, values, { literal: false })` returns plain
`{ text, variables, missing, complete }`. `renderTemplate` returns completed
text or throws `MISSING_VALUES`. Neither writes storage. Values never enter
history/export unless the user separately and explicitly saves them as body text.

Supported placeholders are `{{name}}`, with optional surrounding whitespace.
Names begin with a Unicode letter or underscore and continue with Unicode
letters/numbers, underscores or hyphens. Names are case-sensitive. Repeated names
use one supplied value; an own key with `""` is deliberately empty, while an
absent key is missing. Extra keys and non-string values fail validation.
`\{{name}}` produces literal `{{name}}`; `literal: true` preserves the entire
body exactly, including backslashes. Expressions, dotted names, nesting and
unmatched braces are literal text. Replacement values are never re-parsed.
No browser context, environment variables, code evaluation or network is used.

`search(state, query, options)` rebuilds results directly from validated saved
content. It searches title/body/tags/category/tool, case-insensitively, with
Chinese substring support. All whitespace-separated query terms must match.
Options are `favorite`, exact `category`, `removed` (default false), and `ids`
(a workspace's validated prompt references; empty means no results). Results
are `{ record, matchedFields, snippet }`, with copied records and plain-text
snippets; favorite results sort first, then most recently updated. History and
recovery snapshots are not silently included in ordinary search. Re-running
after edit/import/archive/restore rebuilds results; no persistent derived index
can outlive the source text. All UI consumers must render these strings as text,
never as HTML or auto-loaded external resources.

## Backups and bounded preservation

Exports have exactly `{ format: "local-itab-prompts", schemaVersion: 1,
exportedAt, content: { records }, recovery }`. They include all active/archived
records and body history, but not visibility, receipts, previews or variable
values. Exported files are unencrypted and can contain private text.
`parseBackup` rejects unknown versions, unknown/missing fields, duplicate IDs,
invalid dates/text/history, and oversized input before any write.

`review(source)` parses and preflights the replacement under the lock, without
writing. It returns an immutable plan with `reviewId`, the exact `source`,
current `revision`, current/incoming counts, and same-ID conflicts with current
and incoming body-version IDs. A consuming UI must show that this is a full
live-library replacement, including removed records, and offer the current
export as a downloadable safety copy before requesting acceptance. Call
`store.mutate(store.request('replace', plan))` only after acceptance. Changing
the plan or the state invalidates it. Plans belong to the Store that reviewed
them; retain that Store through the review/commit interaction.

Replacement keeps displaced live records in a recovery snapshot, merges
nonconflicting incoming recovery snapshots, preserves stable body-version IDs,
and renews editor fences. Reusing a body-version ID for different text or a
different prompt fails with `IDENTITY_CONFLICT`. The full archive can migrate
into an empty destination without inventing an empty recovery snapshot. Review
expiry (after 16 newer previews) only discards a read-only plan, never data.

Limits are exported as `LIMITS`: 200 records including archived; 200-code-point
titles; 32,000-code-point bodies; 20 tags of 64 code points; 100-code-point
category; 200-code-point tool; 20 body versions per record; 8 recovery snapshots;
2 MiB total serialized budget with metadata headroom. Template preview has
separate limits of 100 variables, 32,000 code points per value and 256,000 output
code points / 1 MiB. All limits reject before writing or emitting partial output;
no truncation, history eviction, automatic trash clearing, or permanent-delete
operation is implemented. A full history can still accept metadata edits.
Capacity management that deletes history needs a separately reviewed future
flow; exporting alone does not authorize deleting the local copy.

## Verification

Run `node --test tests/local-prompts-store.test.js` and
`node --check shared/local-prompts-store.js`. Tests use a serializing in-memory
backend and a Chrome-shaped API model; they do not substitute for native Chrome,
UI, clipboard, complete-backup or workspace integration acceptance.


### Lock error boundary

Store entry points sanitize unexpected synchronous and asynchronous backend lock
errors. Before the protected callback starts they report `LOCK`. After entry they
report `VERIFY`: a write may already have committed, so the UI must retain the
draft and original operation for exact-command retry or review, never assume a
fresh operation is safe. Owned domain errors, including `RESTORE_PENDING`, keep
their bounded codes. Arbitrary backend `code` or `message` getters are not read.
