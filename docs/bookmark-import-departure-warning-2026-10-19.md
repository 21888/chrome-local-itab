# Request a departure warning for unfinished bookmark imports

The existing beforeunload guard now includes bookmarkImportView.hasUncommittedWork(), as the shared pending/workspace navigation guards already do. It requests the browser's departure warning while a bookmark file is being read, an import review is open, or its Apply is pending. It does not add a confirmation dialog, save at unload, cancel a write or alter import/storage protocols.

Browsers decide whether to display a native warning. The event interception alone cannot prove that departure is prevented or that data cannot be lost.

## Validation boundary

- A synthetic full Options DOMContentLoaded/Work Session/Node File/Bookmark View/StorageManager reproduction demonstrated the omission in reading, ready and applying stages. Apply was held at the RAM Chrome local.set boundary. The lifecycle already reported unfinished work, but beforeunload did not request a warning.
- After the one-condition change, the same full-startup reproduction requests the warning in all three stages. Releasing the explicit Apply adds only the intended synthetic bookmark in Work. Startup's one Sync quota metadata read is recorded separately; the import adds no provider I/O.
- The repository regression exercises real View/lifecycle and Options prepare/apply/storage paths using the file's established initialized-form fixture. It records reading, cancellation and late completion, ready review, allowed departure, restored departure protection, pending Chrome set and settled states. Actual File.text rejection and invalid bookmark HTML both clear pending/review state and do not request the warning; this is not generalized to Apply failures that retain unfinished work. Event dispatch itself adds no raw/read/write operations. Original assertions remain.
- GUI file selection and native browser warning display were not tested. No existing unresolved chooser permission flow was retried or bypassed.

This is an omitted warning request fix, not evidence identifying or repairing the reported 1.1.71 upgrade incident. Release, version and store publication remain frozen.
