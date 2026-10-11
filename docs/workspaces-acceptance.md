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
