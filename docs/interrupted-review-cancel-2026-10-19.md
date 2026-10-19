# Dismiss interrupted-restore review

A read-only interrupted-restore inspection previously displayed its explanation
and optional repair button outside the ordinary import preview. The only Cancel
button was inside that hidden preview, and Escape did not handle a settled
interruption review. Calling the internal cancel method worked, but users had no
direct visible dismissal control. The open review also did not count as
uncommitted UI work. A failed second inspection left the earlier explanation.

The interruption review now has a visible Cancel button using the existing
localized label. Cancel or ordinary Escape dismisses both recoverable and
non-recoverable explanations, retires the review and returns focus to Inspect.
Cancellation during the read ignores late results. A new inspection clears the
previous explanation before reading. Choosing a new file retires the old repair
review even if the file is oversized, requires confirmation or fails to read; a
late inspection cannot revive it. No repair, download or storage change is
triggered by dismissal.

A submitted repair remains non-cancellable. Success and uncertain failure close
the review controls; an uncertain failure retains its warning that data may have
changed, never a cancellation claim that saved data was unchanged. The underlying
restore protocol, opaque tickets, conflict checks and saved copies are unchanged.

Synthetic DOM regressions cover visible control reachability, Escape, repeat/IME
keys, both explanation states, pending-read cancellation, late completion/focus,
failed reinspection, no pending transaction, and submitted repair success or
uncertainty. Four new settled-review cases fail against the previous source;
existing cases pass. This is UI-model evidence, not native extension or upgrade
certification. Version and Release remain frozen.

Final validation: 120 focused tests, 16,716 serial Node tests and 84 Python tests
pass. All 138 runtime files verify in the reproducible ZIP, SHA-256
`c9247df5c4bebe4faed91618560d64138d61b54762e16e171660526ae6e7097c`.
Native browser validation of this change has not been performed.
