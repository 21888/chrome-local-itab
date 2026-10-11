# Prompt restore transaction audit

Validated 2026-10-10 against the integrated prompt-library candidate. This audit uses synthetic fixtures and does not exercise the native browser or change permission state.

## Result

- 50 independent focused synthetic tests passed: 25 transaction/recovery tests and 25 core boundary/receipt/identity tests.
- The runtime owner's current 25 coordinated backup tests also passed.
- Both new test files pass `node --check`.
- This is focused synthetic coverage, not a broad suite or native browser sign-off.

## Defect found and fixed by runtime owner

Interrupted recovery previously validated retained prior workspace bundles structurally but did not bind their bytes to the verified previous snapshot. A valid later edit to an old-generation scratchpad could be exposed after `recovered:true`. The owner added a SHA-256 digest of the raw prior workspace snapshot to the durable marker and verifies it before repair. The independent reproducer now passes with no authority writes.

## Important verified behavior

- Cancellation immediately after the prepared fence leaves unchanged authorities, retains recovery, and blocks cooperating writers until explicit restore-previous.
- Marker drop/false acknowledgement/throw/readback uncertainty and partial recovery writes never cause automatic authority retries.
- A final verified-marker acknowledgement error may return `UNCONFIRMED`, followed by an inspection result of `pending:false`, because the authority payload was already readback-verified and the final marker persisted. The UI should allow reload without a repair action.
- Prior-generation changes, current-generation changes after recovery review, marker drift, authority drift, and corrupt recovery bytes fail closed.
- Existing session writes (including device-global settings), scoped tasks, and workspace create/duplicate/trash/restore/select are blocked with zero writes by a pending combined marker.
- Three contended direct/coordinated/restore orderings complete without lock inversion. Coordinated ordering is workspace then prompts; direct prompt writers never acquire workspace while holding prompts.
- All four pre-submission recovery cancellation gates stop without writes. Cancellation during an already-submitted authority acknowledgement settles once rather than rolling back automatically.
- Changed commands cannot replay a successful operation ID. Exact semantic commands with reordered keys can replay without writing. Receipts bind title, body, kind, target, metadata, unknown fields, and enable value.
- Own getters, nested getters, toJSON hooks, nonplain instances, hidden/symbol keys, sparse arrays and cycles are rejected without hook execution at tested public boundaries.
- Same body-version identity cannot change bytes or migrate to another record, including identities retained only in recovery.
- Existing focused backup coverage verifies selected/unselected preservation, v1/v2 compatibility, explicit global target, immutable reviewed plan, single combined authority submission, and provider/device-field exclusion.

## Re-run

```
node --test tests/local-prompts-independent-audit.test.js tests/complete-backup-prompts-independent-audit.test.js
PROMPT_AUDIT_SOURCE=/absolute/path/to/final/source node --test tests/local-prompts-independent-audit.test.js tests/complete-backup-prompts-independent-audit.test.js
```

Default source files at final validation:

- complete-backup.js: `4d480f5df98009cd120384d84c1e60203c4df4cb25a8b851063f0ae8f2b3da4d`
- workspaces.js: `339e84c15e82872178baec1bca4bce3d4e87dd72cd6813b3d4e0df0ba21decf6`
- local-prompts-store.js: `15250af32ab597109409bdc0c4c24d6fddbeb5ca0431ccece5abe8802332f9a9`
