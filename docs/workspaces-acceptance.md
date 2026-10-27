# Workspace isolation acceptance

This is the focused synthetic acceptance gate for independent Local iTab
workspaces. It does not replace real-browser or release checks.

## Required behavior

- Upgrade existing saved sites, layout, notes, tasks, countdown and focus
  preferences into Default exactly once. Retain a verified pre-migration recovery
  copy before activation. Invalid storage is an error, never a reason to replace
  data with empty defaults.
- Resume an interrupted migration only from validated markers. A stale legacy
  tab changing the source during migration must not silently lose its changes.
  Later writes from an old tab block workspace writes, preserve both versions,
  and require an explicit reviewed resolution. Startup also detects changes
  made while no current page was observing storage.
- Give each workspace stable identity, independent saved content and preferences,
  and a generation boundary. A page and every operation stay bound to the
  workspace captured before awaiting work, regardless of another tab's selection.
- Serialize writes and reject stale revisions. Missing, corrupt, trashed or
  superseded workspace data must block stale editors.
- Duplicate saved contents and preferences without cloning a running timer.
  Protect Default, retain at least one live workspace, and restore deleted
  workspaces recoverably with a new generation. Moving a running timer to Trash
  freezes its remaining time; restoring it never silently restarts it.
- Keep provider credentials and device-level privacy/Sync settings out of scoped
  enumeration. Legacy Sync and Drive remain explicitly bound to Default, and
  local content actions never initialize or invoke a provider.
- Public local writes serialize read/modify/write operations, including disjoint
  fields and device-global privacy. Reads crossing a workspace generation change
  fail closed. Sync-clear recovery writes participate in the same local lock.
- Export and restore all workspaces through an explicitly reviewed complete
  archive. Exclude credentials/provider bookkeeping and active timer sessions.
  Keep legacy complete archives scoped to the explicitly reviewed current space.
  Restoring Default configuration leaves a persistent safety block against
  automatic replay of older Sync data. Workspace-wide recovery uses its own
  global slot and retains historical migrated single-workspace recovery.

## Focused automated gate

Run from the repository root:

    node --test tests/workspaces-invariants.test.js

To test a separate candidate without copying its runtime into this checkout:

    ITAB_WORKSPACE_SOURCE_ROOT=/absolute/candidate/path node --test tests/workspaces-invariants.test.js

The harness uses fake Chrome storage, deterministic identifiers and time, and
FIFO origin locks with genuine shared/exclusive behavior. Remote Sync, identity
and permission calls are trapped or explicitly modeled in memory. It
injects dropped writes, false acknowledgements, corrupted readback, exceptions
after commit, malformed source reads, stale revisions and stale generations.
No Chrome profile, account, local browser or network service is used.

## Real-browser checks still required

- New-tab and Settings routes remain pinned to the same workspace across reloads.
- Switching with unsaved notes/settings, open edit/review dialogs, pending writes
  or active searches offers clear stay/save/discard behavior without losing work.
- Two tabs editing different workspaces never refresh into each other's content.
  Deletion or generation replacement shows a persistent recovery-friendly notice.
- Workspace controls are usable with keyboard, narrow windows, light/dark modes
  and both interface languages. Focus and accessible labels follow each dialog.
- Legacy Sync/Drive controls clearly identify Default; complete backup review
  clearly distinguishes all-workspace replacement from selected-space restore.

## Verification record

On 2026-10-10 at 19:58 UTC, the integrated cloud candidate passed all 78 focused
tests in this file (0 failures, skips or cancellations). Test-file syntax also
passed. This combines the data, interface and backup candidates; rerun against
the final merged source after any later edits.

The gate found and verified fixes for corrupt single-key defaults, a new draft
typed during asynchronous switching, legacy shortcut cosmetic omissions, old
Sync replay after restore, unlocked public writes, stale generation reads,
Sync-clear recovery overwriting concurrent notes, and a recovery-key collision
with legacy-write detection.

A separate surgical compatibility patch for the existing single-workspace
complete-backup candidate passed 92 focused backup tests. It fills only missing
legacy cosmetic fields while retaining strict supplied-value/import validation.

No native browser or user profile was used. The real-browser checks above,
full release regression gate and packaging/release verification remain separate.

## Failure-boundary regression addition — 2026-10-27

This is a **test/documentation-only** addition to the existing implementation,
not an incident fix. Thirteen new cases are integrated into
`tests/workspaces-invariants.test.js`, reusing its per-test synthetic Chrome
storage, exclusive/shared lock queue, clock and explicit Manager dependencies.
No new global overrides or duplicated helper implementations are introduced.

- **12 staged-write cases:** Trash and Restore, at the new bundle and registry
  submission boundaries, each with reject-before-commit, silently dropped write,
  and commit-then-rejected-acknowledgement. Every original-generation bundle and
  other existing key remains exact (except an actually committed registry).
  There are no removes, provider calls, automatic retries or compensating writes.
  A registry commit with lost acknowledgement remains committed, points at the
  verified new bundle, retains the note and pauses rather than restarts Focus.
  Unactivated staged bundles may remain; this test does not add unsafe cleanup.
- **One public startup case:** actual `StorageManager.getAll()` → captured
  Session → Manager initialization, with successful original-snapshot write
  followed by failed verification read. The error propagates after exactly one
  snapshot write; no bundle/stage/registry/activation is submitted, and legacy
  data is unchanged. The failed Session stays fenced. A fresh capture resumes
  from the same snapshot without rewriting it or returning fallback defaults.

Existing snapshot reject/false/drop/corruption and interrupted-activation tests
are retained, not copied into a second suite. An initial local exploratory test
incorrectly expected the **same failed Session** to resume after the read error.
It failed with WORKSPACE_READ: `Session.ready()` caches that failure. The final
regression asserts this fence and separately uses a fresh capture, matching the
new-page recovery contract; production was not changed to satisfy the incorrect
expectation. That exploratory failure log remains local.

Final applicable run: complete `workspaces-invariants`,
`workspace-bootstrap-storage`, `workspace-bootstrap-page-failure`,
`workspace-lifecycle` and `workspaces-view` files, serial execution,
**205/205 passed**, exit 0; `git diff --check` passed. This is not a new full-suite
or native-browser result, and the thirteen cases are not retroactively added to
older aggregate counts.

Synthetic failures do not establish physical disk/crash durability, historical
installed-version behavior, original profile contents or the earlier
upgrade/import incident's cause. No user storage, file picker, pending import
approval, cloud provider or browser was touched. Release/CWS gates remain separate.
