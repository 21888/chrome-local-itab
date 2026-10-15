# Reviewed configuration import: local write boundary

A synthetic regression against c1ad50e reproduced a settings import that
reported WORKSPACE_WRITE after it had already replaced the selected workspace.
The workspace Session wrote its configuration bundle (including recovery) first,
then submitted privacy/provider globals separately. Rejecting the second write
left an unintended partial result in both Default and named workspaces.

Session now validates the merged workspace and submits the bundle, its recovery
copy, and supplied global settings in one chrome.storage.local.set call, followed
by verification of all submitted keys. Existing provider-boundary checks and
workspace locks remain in force. No permissions, schema, migration, remote
provider behavior or recovery export format changes are introduced.

This removes the separate second submission, not all storage uncertainty. A
browser storage write that commits before its acknowledgement/readback fails can
still have taken effect. Tests explicitly retain that distinction: verification
failure is surfaced, and the same submitted workspace retains its pre-import
recovery payload. No blind rollback or retry is introduced, and no cross-storage
transaction or universal no-write-on-error guarantee is claimed.

Synthetic focused coverage:
- Real inspector review/export, JSON parse, import validation and setAll, for raw
  and portable schema 1/2 sources into Default and named destinations.
- Exact original URL spelling, duplicate URLs, hidden-category links, legacy and
  ID-based hidden coordinates, recovery links/layout, personal modules, sibling
  live/Trash workspaces and registry attribution.
- Thrown, false-return and quota-style storage rejection before submission,
  preserving the entire backing store; post-submission readback failure retaining
  recoverable original links/layout.

Run: node --test --test-concurrency=1 tests/legacy-url-restore.test.js
 tests/recovery-file.test.js tests/workspaces-invariants.test.js
 tests/import-safety.test.js (join these lines into one command).

These are memory-only fault-injection results, not browser crash/disk guarantees,
real profile evidence or recovery of the earlier user incident. Full-suite and
native gates must be reported separately by the release integrator.
