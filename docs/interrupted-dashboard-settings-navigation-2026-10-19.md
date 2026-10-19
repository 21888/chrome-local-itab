# Keep dashboard Settings navigation available during startup failure

The dashboard previously attached its Settings gear and category-management
button handlers only after stored configuration had loaded. A real prepared
combined restore makes protected `getAll()` reject with
`WORKSPACE_RESTORE_PENDING`, so both visible buttons had no action. The static
read-only recovery link and the workspace manager link remained available;
this was not a complete loss of recovery access. No editable default dashboard
was created by that rejected configuration-read path.

The two navigation handlers now attach before asynchronous startup. A WeakSet
tracks individual button nodes, so repeated initialization does not duplicate
handlers. Binding does not open a page or read/write storage; only an explicit
click uses the existing Settings URL helper. Successful startup keeps the same
ordinary and category-anchored destinations.

Settings navigation prefers the captured workspace identity. Before capture,
it preserves the Session's validated requested identity, if present, without
looking up the registry or guessing Default. Encoding still occurs through the
existing URL helper. The destination's normal validation and pending-restore
fence remain responsible for refusing unavailable or protected workspaces.
The change cannot create a workspace or unlock writes. The workspace-view
module is synchronously loaded before newtab.js in the production HTML.

This is navigation behavior around an observed interrupted transaction, not a
repair to the recovery protocol or the earlier upgrade data-loss incident.
Version and Release remain frozen.

Eleven focused production-path tests pass; the old source passes three and
fails eight. Removing only requested-identity fallback passes seven and fails
four, proving that branch is exercised. While the first real storage read is
held, the Session has no captured identity: explicit clicks preserve requested
Default/Work or omit the parameter when none was requested. Reads remain at
one; writes, removes and provider operations are zero in those held-read
cases, with no click-induced I/O. This does not claim all dashboard initialization
is I/O-free. Captured identity wins over a later last-used change. Invalid
Session tokens are rejected, and unavailable destinations retain their normal
storage rejection. The combined navigation regression suite passes 32 tests.

Native cloud-browser clicks after a synthetic pending dashboard load failure
produced the expected Work Settings URL and category anchor with `_blank` and
`noopener`. The preview bridge displays and intercepts navigation requests;
this verifies actual clicks and requested destinations, not a real new-tab
open. All 138 frozen production files matched the tested source. No download
or recovery was submitted, and no screenshots were uploaded.

Final validation: 16,737 Node tests pass with a 512 MiB heap limit and serial
file execution (358.4 seconds, exit 0, cancelled 0), alongside 84 Python tests
and 138 runtime files. ZIP SHA-256:
`c6375d3ee25ac2fb134fcc728e59f40a08575083b7375d924a8f38356f97fd11`.
The first full run lost its execution transport before producing a final total
or exit code. That incomplete log is retained; it is not counted as a successful
run or attributed to an assertion failure. The unchanged frozen source was
then verified by the complete rerun above.
