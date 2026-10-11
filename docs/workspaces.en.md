# Independent workspaces

A workspace keeps sites, categories, layout, appearance, Tasks, Scratchpad,
Countdown and Focus state separate. It is not an account or a security boundary:
people using the same browser profile can still access its workspaces.

## Everyday use

Use the new-tab workspace bar or Settings → Workspaces to create, rename,
duplicate, move to Trash and restore. Open pages stay pinned to their original
workspace; switching elsewhere does not retarget them. New tabs use the most
recently selected workspace.

Switching waits for pending saves. Dirty pages offer Stay, Save and switch, or an
explicit Discard. Failed/conflicted saves preserve the draft and stop navigation.
Duplication copies saved contents only, never a page draft or running timer.

Trash is recoverable. Running Focus is paused at deletion, and restoration never
auto-starts it; paused/completed state remains. Restoring creates a fresh editing
generation, so stale pages cannot overwrite restored content. Default is protected
because it remains the compatibility target for existing data and cloud settings.
The 100-workspace limit includes Trash; nothing is silently purged for capacity.

## Migration and archives

Existing data migrates once into Default, after a complete original snapshot is
written and read back successfully. Staging precedes activation. Invalid data and
uncertain writes fail closed, not into empty defaults. This is not a crash-atomic
storage transaction.

The complete local archive includes live and trashed workspaces. Preview the scope
before confirming. Selected-module restoration requires matching workspace
identities/topology; it cannot silently add or delete spaces. Older single-space
archives require an explicit destination and preserve other spaces. Restoration
retains a verified pre-restore recovery copy.

Deletion or generation replacement invalidates old pages, without erasing their
visible draft text. Copy/export it before explicitly reopening. If an obsolete
page writes to legacy storage after migration, close it, download both saved
copies, review counts, then explicitly keep the current workspaces while retaining
the older-tab copy. This does not merge, delete or automatically reload. New
changes after review require another review.

## Providers and device state

Chrome Sync and Drive remain bound to Default and their previous configuration
scope. They do not automatically upload all spaces or personal modules. Privacy,
provider and update preferences are device-level; credentials are excluded from
portable archives. Default reset/restore may retain a safety pause on automatic
Sync until reviewed. Resetting another space does not change global providers.
No browser permission is added. Archive size limits still apply.

This guide describes intended behavior, not proof of verification. Release records
must separately state actual automated/native coverage and its limits.
