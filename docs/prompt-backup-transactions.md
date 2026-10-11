# Global prompt library in complete local backups

Prompts are reusable user content shared by all workspaces, never device settings.
The complete-backup module selector adds `prompts`. A workspace-aware default
export includes all six modules; explicitly omitting prompts still produces
schema 2. Legacy standalone exports remain schema 1 and cannot include prompts.

## Portable schema 3

Schema 3 retains the schema-2 registry, live workspaces, Trash and scoped module
bundles. `modules` includes `prompts`, but each workspace's `modules` contains only
selected scoped modules. The exact additional top-level shape is:

```
globals: {
  prompts: {
    format: "local-itab-prompts", schemaVersion: 1, exportedAt,
    content: { records }, recovery
  }
}
```

The complete prompt library occurs once. All archived records, immutable body
version IDs, saved histories and prompt recovery snapshots survive. Strict core
validation and its 2 MiB prompt budget apply in addition to the complete archive's
32 MiB structural and serialized limits. No visibility, receipts, provider or
credential fields are exported. Unknown keys, versions, oversized content and
identity reuse with different text fail before writing. Workspace memberships
and AI-result collections are not implemented by this slice; there are no
workspace prompt references to invent or silently drop. Their future integration
must add its own explicit schema and reference validation.

Schema 1/2 imports never read or write the global prompt library. Deselecting
prompts in a schema-3 file also leaves the exact global state alone. A prompt-only
restore does not require matching workspace topology or replace workspace data.

## Review and mutation APIs

`Store.review(source, selected, { promptTarget: 'global-library' })` issues a
consumable preview only after this explicit target is supplied. Without it,
`requiresPromptTarget` is true and restore is unavailable. The preview contains
current/incoming prompt counts, history/recovery counts and same-ID differences
with exact local/incoming body-version IDs. Scoped legacy imports independently
require `targetWorkspaceId`. The UI shows both targets and scopes when relevant.

One Store instance owns the preview. `restore(preview, { confirmed: true })`
consumes it before awaiting. Prompt revision/content and all workspace state are
rechecked under the locks. Prompt replacement preserves local visibility, renews
editor fences, retains displaced records in recovery, and preflights history,
identity and capacity limits. Full recovery/history is rejected, never evicted.

## One lock order and staged authority submission

The global order is workspace lifecycle lock, then prompt lock:

1. `local-itab-workspaces-v1` exclusive
2. `local-itab-personal-prompts-v1` exclusive

The dedicated UI uses `workspaceManager.createPromptBackend(LocalItabPrompts)`.
That backend does not initialize workspaces, create a captured Session, hydrate
configuration or touch a provider. The default standalone prompt backend only
acquires the prompt lock; it never asks for a workspace lock while holding it.
All normal workspace and both prompt writers check the durable restore fence.

Combined restoration first saves and verifies a complete portable pre-restore
copy, including selected prompt content. Workspace replacement stages and
read-back-verifies all changed generations, retaining previous generations. A
durable `__localItabCombinedRestoreV1` marker binds both previous authorities,
intended authorities, the recovery checksum and a canonical SHA-256 digest of the
exact prior raw workspace snapshot. Then one `chrome.storage.local.set` submits
registry authority, global prompt state and the submitted marker together. All
three fields are read back before the marker can be marked verified.

This is deliberately **not a promise of browser-crash atomicity**. Dropped,
partial or unacknowledged submissions can leave either candidate on disk. No
automatic retry or rollback occurs. Prepared/submitted markers block normal
writers across reloads while retaining both authorities and old generations.
The next read does not convert corruption into empty storage.

## Interrupted restore: inspect, download, explicitly recover

`Store.inspectInterruptedRestore()` is read-only and returns an issued review.
It checks the retained raw snapshot digest at review time and reports
`canRecover`, `priorIntact`, and whether both current authorities match the old,
new or mixed candidate. The Settings panel offers a separate recovery action,
never an automatic retry. A transient ordinary read failure does not itself
create a durable fence. If the only uncertainty was the final marker's
acknowledgement, a later inspection may show no pending recovery; the user can
explicitly reload to inspect saved data without another write.

`Store.recovery()` downloads the verified portable pre-restore archive even
while ordinary writers are fenced. `Store.exportInterruptedCandidates()`
produces a read-only `local-itab-interrupted-restore-candidates` JSON containing
standard `before` and `current` complete archives. It excludes device privacy,
provider settings and credentials. Its maximum size is two complete archives
plus envelope overhead. The combined package is for review, not silently
accepted as a normal import.

`Store.recoverInterruptedRestore(review, { confirmed: true, isCurrent })`
explicitly restores both previous authorities. Before writing, it checks the
portable recovery checksum, retained raw snapshot digest, current authority
pair and every current workspace bundle against the reviewed baseline. Changed
retained or current data stops recovery without overwriting external changes;
both candidates can be downloaded for review. The recovery submission and fence
clear are each verified. An uncertain recovery remains fenced and requires a
fresh explicit review. Page drafts are guarded by the same Settings write queue
as normal restore and are never discarded implicitly.

Future global content stores must extend this explicit transaction schema,
allowlist, portable archive, lock order, all-selected recovery and readback as
one reviewed change. This API does not permit arbitrary global keys or introduce
any credential/device-preference write channel.

## Focused verification

Core prompt boundaries and exact command retry receipts, schema 1/2
compatibility, schema-3 selection and target behavior, partial writes, retained
and current candidate drift, recovery cancellation and UI double-click/cancel
flows have deterministic Node tests. These are model-level checks, not native
Chrome, clipboard, full-app or release acceptance. No version bump or publication
is part of this implementation.
