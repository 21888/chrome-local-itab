# Complete backup admission with retained configuration-import receipts

Complete configuration restore refuses an affected workspace with an unresolved,
malformed or unsupported manual configuration-import receipt. This protects both
saved configuration and its retained import evidence from acquiring new generation
fences while the original import is still unverified.

The existing receipt validator is used without changing the receipt format.
No import is automatically settled, cleared or marked verified. A structurally
valid verified receipt remains accepted even after ordinary configuration edits;
the existing same-file manual-import reconfirmation rules still apply afterward.

Admission is read-only during review, then checked again under the existing
restore lock before any recovery/staging submission. Configuration restores also
re-read after asynchronous recovery preparation, before overwriting the recovery
slot. A pending or unsupported receipt that appeared after preview yields the
specific receipt error without any restore write.

Affected scope:

- Legacy single-workspace archives: only the explicitly chosen destination.
- Matching partial configuration archives: all matching destination IDs.
- All-scoped archives: every current workspace, including Trash and workspaces
  that the incoming topology would remove.
- Personal-module-only and global-library-only restores: no new receipt gate.

English and Chinese messages explain the blocker and provide a separate read-only
inspection link for the first affected workspace. Inspection does not navigate the
current page or discard drafts. An exact pending import can first be verified
through the existing original-file Settings flow. A conflict remains blocked;
this change supplies no automatic conflict-resolution protocol.

## Focused verification

`tests/complete-backup-import-receipt.test.js` exercises the real Store,
StorageManager, workspace sessions, validators and lock implementation using
synthetic RAM storage. `tests/complete-backup-import-receipt-view.test.js` mounts the
production Complete Backup view with the real Store and a synthetic DOM.

Coverage includes exact/mismatched pending imports, restart, malformed and future
receipts, live/Trash topology removal, independent legacy destinations,
unselected configuration, verified controls, post-preview import changes,
changes during awaited recovery preparation, localized inspection links,
repeated clicks, deselection, cancellation and stale async UI results. Every
refusal checks complete stored values and the absence of new recovery, staged
bundle, receipt, Sync or registry writes. No provider or network access is used.

These are focused automated integration tests, not a full-suite or native
installed-extension verification. No extension version, runtime dependency,
permission or write protocol changes are included.
