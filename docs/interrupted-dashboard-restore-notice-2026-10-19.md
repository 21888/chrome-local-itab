# Persistent dashboard notice for an interrupted local restore

## Problem and scope

A workspace registry can load successfully while the later dashboard read rejects with `WORKSPACE_RESTORE_PENDING`. The existing generic failure toast disappears after five seconds. A partially loaded dashboard then lacks a persistent explanation, even though the Settings and read-only recovery routes remain available.

Only that exact error now creates one persistent alert inside the workspace switcher. English and Chinese copy explains that loading is incomplete, no automatic repair ran, and the condition does not establish that saved content was deleted. Explicit links preserve the captured workspace identity (or the already validated requested identity) for Settings and read-only saved copies. The notice does not navigate automatically, focus itself, start timers, install listeners, or perform storage operations. Other errors retain their existing feedback.

This change does not alter storage, restore, migration, backup formats, or the write lock. It does not establish the cause or resolution of the reported 1.1.71 data-loss incident. Version 1.1.155 and the store/Release gate remain unchanged.

## Reproduction and focused validation

The same final 15-test dashboard navigation/notice suite against prior source `32668ec8bea3de3ca97bfa2968d572a85678cb36` produced 12 passes and 3 failures. With this change it passes 15/15; combined focused validation passed 36/36.

Real storage-manager fixtures cover prepared restores in Default and Work. Initial startup reads are 15 in each case; running the existing five-second cleanup and exercising the two link models leaves that count unchanged. Repeating startup yields 16 reads, one notice, and unchanged listener count (14). All writes/removes and provider operations remain zero, with raw storage and the prepared marker unchanged. Isolated notice creation from a real pending error leaves reads at 10, with no listeners or timers. Unrelated initialization can still perform reads; these measurements do not claim that the whole dashboard is I/O-free. Unknown and near-matching errors do not create this notice.

## Cloud-browser visual validation

A synthetic, in-memory Chrome API preview in the dot Linux cloud browser used exactly the frozen bytes of all 138 runtime files. English/Work and Chinese/Default notices remained visible beyond five seconds. Text and both links wrapped inside the workspace-switcher region without clipping or overlay. Accessibility URLs retained the correct workspace for `options.html` and `recovery.html`.

No download or restore was executed, and this check does not assert a real new-tab navigation. No screenshot was uploaded. Synthetic browser previews are not installed-extension upgrade certification.

## Final validation

- Complete Node suite: 16,741 passed, zero failures/cancellations/skips; serial execution with a 512 MiB heap limit, 361.4 seconds, exit 0.
- Python: 84 passed.
- Runtime package: 138 files; static packaging checks passed.
- Runtime ZIP SHA-256: `1c31041b50b73b748071ebce303c72a44c54c6a70ad935a1041059c41d2149bf`.

Packaging validation does not perform browser testing. The separate visual preview checks and their limits are described above.
