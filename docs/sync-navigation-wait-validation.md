# Manual Chrome Sync navigation waits — 2026-10-17

## Reproduced UI gap

On baseline `7115a4df1cd8d9abff72d0bfe90e6c3f9ce6209d`, an explicit
Upload can wait in the first remote metadata read while the real workspace
Session has no queued writes. Settings reports no pending work, so the existing
workspace Open flow can select and navigate before the Sync event settles.
The real Session then rejects the old page's later writes with
`WORKSPACE_SWITCH_PENDING`. This is an admission/waiting gap; it is not evidence
of remote corruption or a real account outcome.

## Bounded change

- Register each explicit Enable/Disable, Upload, Download, Clear and confirmed
  replacement UI operation in a page-local counter before its first await.
- Expose that count through the existing Settings pending/dirty interface. The
  existing workspace wait, deferred reload and beforeunload protections now see
  these operations, including confirmation preflights, error status reads and
  the toggle's final status read.
- Release each operation in `finally`, including rejection and cancellation.
  Overlapping actions retain independent counts; this adds no action lock,
  duplicate-click suppression, retry or provider operation.
- Run a completed explicit replacement's reload after its own counter and busy
  flag are released. Other pending actions and unrelated drafts still defer it.

Automatic Sync listeners are unchanged. StorageManager, Session, provider
protocol, locks, CAS checks, provider error/uncertainty semantics, confirmation text,
existing button availability, permissions, persisted keys and version are
unchanged. A browser controls whether a native departure warning appears; this
change cannot guarantee that closing a page waits for an asynchronous operation.

## Verification

`tests/sync-navigation-options.test.js` has 19 tests. The same final test file
fails 17 tests and passes the two existing replacement reload/draft checks on
baseline `7115a4d`; all 19 pass with this change.

The first 17 cases use real StorageManager, workspace Manager/Session, Settings
events, ContentLifecycle and WorkspacesView. Only the DOM, named FIFO Web Locks
and storage areas are synthetic RAM models. They cover:

- All six explicit entries held at their first provider read, with no queued
  Session write: Settings/lifecycle pending and dirty state, beforeunload,
  deferred Reload (including its button), and real workspace Open waiting
  without early selection, write suspension or navigation.
- Existing confirmation cancellation for Clear, Disable and replacement without
  provider writes; rejected Clear/replacement preflights without new retries.
- Upload failure while its error status read is pending, and the toggle's final
  status read succeeding or rejecting, with pending released only on settlement.
- Overlapping Download/Clear operations, where finishing one cannot clear the
  other's lifecycle registration.
- A real backed-up explicit replacement reloading a clean page and preserving a
  separate unsaved draft.

The last two cases are explicitly **UI-contract tests**: they inject an
`applied: true` Download result to exercise its existing delayed-reload branch,
with and without a newer form draft. Ordinary production `pullFromSync()`
currently acknowledges equal copies or requests explicit replacement; these two
cases do not prove a reachable ordinary-store apply or a cloud outcome.

Focused related check: 283 passing tests, with no failures, skips or cancellations:

```sh
node --test tests/*options*.test.js tests/workspace-lifecycle.test.js \
  tests/workspaces-view.test.js tests/settings-stale-save.test.js \
  tests/drive-download-draft.test.js
node --check options.js
node --check tests/sync-navigation-options.test.js
git diff --check
```

These checks do not include the complete repository suite, Python tests or
packaging. No real Chrome profile, Sync/Drive account, OAuth flow, network
provider, screenshots, release assets or store submission were used.
