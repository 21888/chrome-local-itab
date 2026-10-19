# Interrupted-restore candidate association audit

The read-only interrupted-restore candidate export includes a `before` backup
and the current saved state. On 2026-10-19, an audit found that export checked the
recovery file's own SHA-256 but did not associate it with the pending restore
transaction. A different, internally valid recovery file could therefore be
incorrectly labeled as that transaction's `before` candidate.

Candidate export now requires the supported recovery key and the exact recovery
checksum recorded in the pending transaction. Missing, unsupported or mismatched
references fail closed without changing any stored bytes. The existing independent
source-content checksum verification still applies. Identical original bytes
remain acceptable across different transaction identifiers: portable backup files
have no transaction identifier, and this contract binds content, not provenance.

The recovery write path already checked this association and is unchanged. No
backup schema, authority-switch protocol, recovery persistence, migration or
startup behavior changes. Failure does not delete either raw candidate or attempt
a repair. This finding does not establish the cause or resolution of the reported
1.1.71 upgrade data-loss incident.

## Verification

- Before the fix, a regression replacing the recovery slot with another valid
  backup failed with “Missing expected rejection”; the other 29 tests passed.
- Targeted tests cover a mismatched valid backup, missing/unsupported marker
  references, prepared and submitted markers, equal checksums across transaction
  identifiers, source-byte corruption, live workspaces and Trash, and unchanged
  raw storage and write count.
- The prompt, independent interruption audit, collection and reconstructed
  acceptance suites pass together: 92 tests.
- Final serial Node suite: 16,701 passed; Python: 84 passed. The reproducible
  runtime ZIP verifies all 138 files, SHA-256
  `60d1d7ccb013e60009ef91fe543effae58f593e3a25b5564a1f3c5a863ace896`.

All scenarios use synthetic in-memory storage. They are not native extension
upgrade or browser-crash certification. Release and version remain frozen.
