# Do not prune the backup that was just acknowledged

## Reproduced failure

On 2026-10-27 a bounded in-memory provider exercised actual draft creation, multipart upload, file parsing, listing and retention. Twenty existing snapshots had future client-created metadata timestamps (2099), while their server-created dates were in 2026. The current backup used the unchanged system time. The original flow acknowledged `just_uploaded`, then deleted that same ID as the oldest candidate and returned no cleanup warning. The assertion failure remains locally in `evidence/drive-retention-current-snapshot/before.log`.

This demonstrates a code-level retention failure with synthetic metadata, not an actual Google account event or the cause of the historical data-loss incident. Neither system time nor timezone was changed; there was no authentication, network request or real file deletion.

## Minimal preservation rule

After the existing upload-response ownership validation, automatic cleanup receives the acknowledged file ID. It still gathers the complete paginated list and computes the same computer-specific deletion plan using the existing ordering and retention limit. If that plan contains the current upload, it rejects the entire plan before the first DELETE. It does not remove another copy to make room, change timestamps, change groups, or reinterpret the latest-20 policy.

The existing successful-upload/cleanup-warning path records that cleanup was skipped and all prior copies were kept, in English and Chinese. The uploaded copy remains available. This may temporarily retain more than twenty copies, as with other unsuccessful cleanup attempts; it never falsely claims this cleanup enforced the limit. Missing or mismatched upload ownership still uses the earlier fail-safe path before any listing/deletion. `prune: false` remains unchanged.

## Validation

Five regressions were added to the existing complete retention-owner test file:

- Multipart and resumable uploads with future-dated old metadata; the protected upload arrives on the second list page. Even an old candidate preceding it in the deletion plan is retained, with zero DELETE requests and one successful upload.
- Ordinary two-page cleanup completes both reads before deletion and retains the newly uploaded file while deleting exactly the same two oldest eligible records as before.
- A later-page read failure preserves the successful upload and causes zero DELETE requests.
- A protected ID belonging only to a different computer is not confused with this computer's deletion candidates.

The existing missing/mismatched acknowledgement, caller-mutation, wrong-group and no-prune regressions continue to run. An intermediate test-writing error expected ascending deletion order; the existing algorithm iterates the descending sorted tail (`a_2`, then `a_1`). That failed assertion log is retained separately; the production ordering was not changed to satisfy it.

The five complete related files passed **211/211**, exit 0. The same five files also passed **211/211** in independent Node processes with the host's native `navigator` removed before the tests install their explicit lock models; no browser security setting was changed. Final fixed-source Node aggregate: **17,374/17,374 passed**, exit 0 (370.70 seconds). Python aggregate: **91/91 passed**, exit 0. JavaScript syntax, locale JSON parsing and `git diff --check` passed. No real provider, native extension installation/upgrade, new permission, release/version/CWS action, or historical incident resolution is claimed.
