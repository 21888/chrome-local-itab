# Keyboard Skip target in limited recovery Settings

The recovery-only Settings page hides and disables its ordinary search input.
The existing first “Skip to settings” link still targeted that input. Native
keyboard activation moved focus back to the page rather than the recovery
section. Recovery actions remained reachable with another Tab; this was a
broken section focus target, not complete loss of keyboard access.

The recovery section now has `tabindex="-1"`. Only after successful mounting,
the existing Skip link targets that section. Ordinary Settings retains its
search target. No listener or automatic focus call is added, and mount failure
does not leave the link pointing at a removed host. Ordinary controls remain
isolated; no storage, recovery, import or download behavior changes.

Three new production-startup model tests cover the normal target and both
Default/Work recovery targets, focusability, repeat-entry idempotency,
cancellation, raw preservation and unchanged write/provider counts. Against
the prior source, the normal case passes and both recovery cases fail at the
wrong target. The focused recovery/search suite passes all 27 tests.

Native cloud-browser verification used 138 frozen production runtime files
with synthetic RAM-backed Chrome APIs. Tab reached the first Skip link;
Enter focused the recovery container; the next Tab focused its first retained-
copy download button. Before the change, Enter left focus at the page.
No download or restore was submitted. No screenshots were uploaded. This is
not an installed-extension upgrade test or a diagnosis of the earlier data-loss
incident. Version and Release remain frozen.

Final validation: 16,726 Node tests pass with a 512 MiB Node heap limit and
single-file concurrency (357 seconds, exit 0, cancelled 0); 84 Python tests and
all 138 runtime files pass. ZIP SHA-256:
`2b8619443bfbe49b615e7b1e45a90610e9d66a8dad3fd8fbfeb598bb9d9ebfd5`.
The initial full run ended with one navigation-library-view file failure and no
assertion stack or exit signal in its spec log. That unchanged file passed all
179 tests in isolation, followed by the successful complete rerun. The initial
failure is retained and its cause is not established.
