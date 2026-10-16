# Preserve complete-backup review across recovery downloads

## Reproduced issue

On baseline `b3648ec85e6fc0bbd054321a5fe92d28b2ca4091`, select and review a
complete-backup file, then choose **Download both saved copies**. Its read-only
export handler unconditionally returned the panel to an empty phase. The
reviewed counts and file remained visible, but **Replace selected saved modules**
stayed disabled after a successful download request, a recovery-read failure,
or a download failure. Choosing the file or changing the selection again was
necessary to continue.

This was a UI lifetime issue, not a deliberately consumed restore ticket.
Recovery downloads do not consume or refresh the Store's opaque review ticket.
The Store still checks saved data and import receipts before replacement.

## Change

The recovery-download handler now resumes only a stable state that it owned:

- A ready review retains its existing ticket, counts and selected modules.
- A review awaiting a destination still requires that deliberate selection.
- An unconfirmed large file retains its confirmation without reading the file.
  The Continue control is disabled while downloading; the size warning is shown
  again alongside download feedback afterward.
- The download control is disabled during file reading and review preparation.
  It cannot retire an in-progress read and later revive an orphaned reading
  state.

Cancellation or a newer operation invalidates the older completion through the
existing generation check. An already issued download request cannot be recalled,
but its late completion cannot replace a newer review or its feedback. Empty and
uncertain-restore states never become ready. No automatic restore, reload,
re-review, target selection or data write was added.

Only `shared/complete-backup-view.js` runtime UI code changed. Storage, Store,
formats, permissions, localization keys and manifest version `1.1.155` are
unchanged.

## Focused automated evidence (2026-10-16)

The final regression tests, copied into a detached baseline worktree, fail all
three ready-review cases with `apply.disabled === true` instead of `false`:

```sh
node --test --test-name-pattern='retains a ready restore review' tests/complete-backup-view.test.js
```

The identical tests pass with the fix. The related suite selection passes
**69 / 69 tests**:

```sh
node --test tests/complete-backup-view.test.js \
  tests/complete-backup-download-review.test.js \
  tests/complete-backup-options.test.js \
  tests/complete-backup-prompts-view.test.js \
  tests/complete-backup-collections-view.test.js \
  tests/complete-backup-import-receipt-view.test.js
```

New DOM cases cover download success, read and download failures, repeated
clicks/retry, later focus and drafts, Cancel, destruction, newer file/module
selection, awaiting destination, file/review reads, large-file confirmation,
empty state, uncertain restore, active Focus blocking, cancellation before a
large-file read, and late completion after download was already requested.

The new production Store/StorageManager/workspace integration cases mutate saved
configuration or create an unverified configuration import while the recovery
read is delayed. After download settles, explicit use of the old ticket is still
rejected with zero additional writes, no changed saved values and no provider
calls. Download does not silently issue a fresh approval baseline.

Tests use synthetic DOM and memory-only fixtures. This is focused automated
verification, not a full-suite, native-browser, screenshot or packaging pass.
Large-file cancellation coverage uses the visible Cancel control while download
is pending; no new Escape-key behavior is claimed. `git diff --check` passes.
