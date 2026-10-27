# Preserve Drive computer profiles across Options instances

## Actual counterexample

A bounded 2026-10-27 reproduction used two real `DriveBackupManager` instances sharing synthetic Chrome local storage. Instance A called `markRestored`; its storage read captured the original computer list and waited before delivering that value. Instance B called the public `addDevice` and successfully saved a second profile. Delivering A's older read caused the former `saveState` read/merge/write to overwrite B's list and active selection: only A remained. The original failing assertion and output are retained locally in `evidence/drive-state-concurrency/before.log`.

This is a local provider-metadata loss counterexample, not an actual account incident or deletion of a Drive snapshot. No token, account, network request, upload or remote deletion was used.

## Correction

Every production Drive metadata write now goes through the dedicated `local-itab-drive-state-write` Web Lock. It reads fresh state inside the lock and applies the logical command there. Initialization, adding a profile, selecting a specific ID, renaming a specific ID, connection/error metadata, and backup/restore timestamps share this writer. Network calls, backup content reads, restore commits, and nested state operations are not inside the lock.

- Two concurrent Adds retain both profiles. Same-name Adds resolve to one profile using the existing case-insensitive name rule.
- Rename applies to the displayed profile ID captured by Options, not whichever profile became active in another tab. It does not revert a newer selection. Its field acknowledgement uses that target's saved name. The legacy method signature still captures an original target ID before queuing, without carrying an old profile array into the update.
- Timestamp/error updates merge into the fresh profile list rather than writing a stale whole list. `saveState` accepts only string-valued `connectedAt`, `lastBackupAt`, `lastRestoreAt`, and `lastError` patches, detached before waiting. Profile fields, unknown fields, invalid values and old full-state objects reject explicitly without a write; they are not silently ignored. All production callers use these bookkeeping fields; profile commands use fresh-state updaters instead.
- Missing Web Locks refuses the mutation with an English/Chinese explanation; it does not silently use an unsafe unlocked fallback. Read-only state projection is unchanged.
- A rejected write releases the lock without inventing success. An already committed write whose acknowledgement is lost is not rolled back or automatically repeated; an explicit same-name Add retry finds the existing profile.

Only `__localItabDriveBackup` is written. Stored shortcut/configuration data, Sync preferences, unrelated provider keys, backup payloads and snapshot retention rules are not changed. The lock coordinates current-version writers; it cannot make an already-open older extension implementation obey the new protocol, nor make external Drive services transactional.

## Validation

`tests/drive-state-concurrency.test.js` exercises actual public manager calls with explicit serialized cross-instance lock/storage models. It covers restore timestamp/Add, distinct and duplicate Add/Add, both Rename/Select orders, initialization, missing target, denied/missing locks, failed read/write, lock release, immutable queued patches, committed/lost acknowledgement, and rejection of old full-state/unknown-field status patches. The Options event regression verifies that a changed backend selection still receives the displayed original profile ID and the correct per-ID acknowledgement. It is a modeled DOM/provider boundary, not a native signed-in account test.

Existing Drive profile tests now exercise the real locked writer rather than replacing `saveState`; retention fixtures explicitly supply Web Locks instead of relying on the host Node version. Existing multipart/resumable retention tests continue changing the selection while the upload awaits, checking that this lock does not span network delivery.

Final verification:

- Seven complete related files: **339/339 passed**, exit 0.
- Final fixed-source Node aggregate, including the metadata-only patch guard: **17,369/17,369 passed**, exit 0 (369.18 seconds).
- Final Python aggregate: **91/91 passed**, exit 0.
- The earlier pre-guard aggregate also ended successfully (17,359 Node tests and 91 Python tests); it is retained separately and is not substituted for the final run.
- JavaScript syntax checks, locale JSON parsing and `git diff --check`: passed.

No version, release, CWS submission, screenshot upload, file-import approval, or historical incident status changes with this correction.
