# Settings access during an interrupted combined restore

## Observed defect and scope

A real prepared combined-restore transaction causes `StorageManager.getAll()` to reject with `WORKSPACE_RESTORE_PENDING`. Settings initialization previously failed before mounting the complete-backup recovery controls. This made the existing inspection and retained-copy tools unreachable from a newly opened Settings page. The storage rejection is intentional and remains unchanged.

Settings now recognizes that exact error and mounts a separate recovery-only section. Ordinary main content, workspace switching and the sibling Save/Reset footer are hidden, inert and disabled. This also covers a later startup failure after ordinary listeners have already been installed. No empty/default form is substituted and unknown errors still follow the existing failure path.

The limited view permits existing retained-copy downloads, inspection, cancellation and explicit recovery. Ordinary import, module/target changes, export and apply are refused in event handlers as well as hidden. Privacy and Sync warnings remain visible. A completed recovery does not unlock this page: the user must explicitly reload. Draft and queued-write guards remain in force; the recovery protocol and storage fence are unchanged.

## Evidence

- Production-path regression tests use the real StorageManager, backup Store, view, lifecycle and initialization with synthetic DOM and Chrome storage/lock boundaries.
- Seven tests pass. With the prior source, the original six cases fail; removing only footer isolation makes six of the final seven cases fail.
- Default and Work entry each perform zero new local writes/removes and zero provider operations. Late-startup initialization has 10 writes before the error and 10 afterward; this is not described as zero initialization I/O. Explicit confirmed synthetic recovery performs two local writes. Provider operations and local removes remain zero.
- Focused final suite: 65/65 passing. Covers repeated entry, ordinary handler refusal, cancellation, drafts arriving during queued recovery, raw preservation, footer isolation with listeners already mounted, and explicit reload behavior.
- Native cloud-browser preview uses all 138 final runtime files, verified against source hashes, with synthetic RAM-backed Chrome APIs. English/Work and Chinese/Default show the limited view, both download controls and privacy warning. Inspect followed by Cancel retires the review and leaves ordinary settings unavailable. The recovery section remains visibly inside the page container. The Chinese preview header retains its existing English fallback.
- Native verification did not download, select a file, or submit recovery. No screenshots were uploaded. This is not installed-extension upgrade verification.

This fixes access to existing recovery tools for this observed interrupted transaction. It does not diagnose or resolve the earlier user upgrade data-loss incident. Version and Release remain frozen.

Final validation: 16,723/16,723 serial Node tests and 84 Python tests pass.
The first full run had two failures in the subscription guide's historical
whole-CSS hash guard. Its original hash remains unchanged; only the exact,
unique reviewed isolation block is excluded, with negative checks for deletion,
duplication, broader selectors and extra declarations. The failed-run log is
retained, and the full suite was rerun after independent review of this update.
All 138 runtime files verify; reproducible ZIP SHA-256:
`a5269d9bbf3270ef4533bf94c86062064a64b14a01c821eb3bbdb65e964606ee`.
