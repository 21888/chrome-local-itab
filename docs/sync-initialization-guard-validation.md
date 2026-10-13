# Sync initialization concurrent-edit guard

## Scope

Based on release 1.1.120 (`76b62c5`). This changes only acceptance of a remote
snapshot during default-workspace Sync initialization. It does not return local
state early, add a timeout, skip remote-enabled restoration, or introduce network
requests. No permissions, accounts, version or release metadata changed.

## Failure and contract

Previously, a page waiting for Sync metadata could overwrite a quote successfully
saved in another initialized page with a late legacy or identity-compatible v2
whole snapshot. The existing local write lock serialized writes but did not
identify changes made while the network/storage read was pending.

Initialization now captures an exact fingerprint under that lock before reading
Sync. It covers raw configuration keys and their presence (including local assets
omitted from the Sync payload), persistent layout/settings generations, and the
Sync identity/authority state. Acceptance compares under the same lock that covers
the final write. Persistent generations also detect same-content replacements.
This is a comparison of shared persisted state, not a page-local edit flag.

Known acknowledged or own revisions still skip replay, allowing two concurrent
normal initializers without a false conflict. Existing sticky restore conflicts
remain protected. A changed baseline before an actual replacement persists a
sticky `initialization` conflict before releasing the lock. Automatic pulls,
pushes, and acknowledgement paths cannot clear it. The existing explicit reviewed
cloud replacement retains a local recovery backup and can resolve it. Explicit
Sync disable/clear retains its existing backed-up resolution behavior.

## Verification

`tests/sync-initialization-guard.test.js` runs 15 deterministic Node/VM shared
storage models: legacy/v2 delayed snapshots with another page's saved quote,
unchanged disabled-local/enabled-remote restoration, absent-local initial restore,
same-content generation replacement, explicit off authority, omitted embedded
background assets, queued edits at the final-write boundary, failed acceptance,
existing restore conflicts, simultaneous initialization, known acknowledgement
with later edits, and transient/persistent conflict-receipt failures.

The existing identity Sync suite also exercises wire consistency, own writes,
identity preservation, blocked copies, confirmed restoration and cross-page
interleavings. No live Sync account, user profile or external network was used.
These models do not establish native-browser Sync delivery behavior or first-paint
performance.

## Storage failure boundary

A transient failure to persist the refusal is retried by the existing blocking
handler. No remote acknowledgement or configuration replacement is written by the
rejected initialization. If local storage continually rejects both writes, the
current page remains blocked and reports the compatibility error through Sync
status. A later same-page attempt retries persistence and cannot replay the
snapshot. Protection across a new page or process restart cannot be promised when
the backing storage refuses all durable writes. This is not reported as a saved
cross-page conflict receipt.

## Candidate result (2026-10-13)

- Strict sequential Node aggregate: 2,940/2,940 passed (122.1 seconds), with
  `NODE_OPTIONS='--max-old-space-size=1024 --unhandled-rejections=strict'`.
- Python packaging/static aggregate: 84/84 passed.
- Independent review reran the 15 new cases plus 93 identity/layout/workspace
  cases and found no remaining blocker within this scope.
- Canonical runtime ZIP creation and verification: 118 files, 2,754,348 source
  bytes; SHA-256 `eb8f7e954d65c3351c486f7e60927318df3d74d001b2ceacfc1de674b76391e5`.
- Native-browser execution was not performed for this candidate. All data used
  in this work was synthetic; no account data or credentials are included.
