# Complete-backup scope controls during initial checking

The complete-backup view now disables module checkboxes while a newly chosen
file is waiting for its first available-module list. This includes the large-file
permission prompt, `File.text()` and the first Store review. A visible scope edit
can no longer be accepted and then replaced by the initial default selection.
The file still needs an explicit Apply after review; no restore starts while it
is being read or checked.

The view retains the available-module list for that source across subsequent
scope reviews. Modules present in the file remain editable during those reviews,
so rapid changes still use the existing generation cancellation. Modules absent
from the file stay disabled, including while all available modules are deselected.
A new file, Cancel/Escape, an ordinary export, completed restore or destruction
retires that source's list. A late result cannot unlock a different file.

Selection is derived from checked state and the known file modules, separately
from temporary control disabling. Ordinary Export therefore remains available
to cancel an initial read and export its visible checked selection. Choose,
Cancel and the pre-restore recovery download also remain usable. Existing settled
review preservation for read-only recovery downloads is unchanged. Applying and
exporting still block duplicate actions and checkbox edits.

A rejected Store review retains the existing explicit scope-retry behavior.
This includes protection for an unverified configuration import and a transient
saved-data read failure: the user may deliberately reduce the scope or retry,
and the Store must produce a new valid preview before Apply is possible. The
view does not manufacture a ticket, silently re-review an old ticket or remove
any recovery, import-receipt, draft or conflict protection. An unreadable file or
rejected size has no loaded source to retry.

## Validation

Production changes are confined to `shared/complete-backup-view.js`. Store,
Settings controller, StorageManager, schemas, workspace registry and restore
protocols are unchanged; the manifest remains 1.1.155.

`tests/complete-backup-scope-reading.test.js` has 32 cases using the production
view, Settings restore controller, Store and StorageManager with synthetic DOM,
File events and RAM storage. The same final test file on baseline
`652d6845609cfbc91a8e985232e47ac39255d427` produced 18 expected failures and 14
passes; the fixed view passes 32/32. These failures are assertions for the same
initial scope contract and related control states, not 18 separate defects.

Coverage includes:

- Pointer/Space activation models in all three initial stages; disabled inputs
  are never assigned a new checked value or sent an impossible change event.
- After the first review, excluding configuration and explicitly applying only
  Scratchpad through the real RAM restore path. Configuration is unchanged and
  the verified recovery contains the original configuration and note.
- Export cancelling each initial stage without losing its visible selection;
  recovery download, Cancel/Escape, replacing the file and destruction.
- Stale file/review results, rapid out-of-order scope reviews, missing modules,
  an empty selection, busy actions and repeated large-file permission clicks.
- File/review/size failures, legacy and both global destination confirmations,
  both read-only recovery downloads, a dirty Settings refusal, protected-import
  scope retry and a transient read-failure retry, all without automatic Apply.

The focused run is 137/137: the new 32 plus 105 existing cases in seven explicitly
named complete-backup suites. Run it with:

```sh
node --test --test-reporter=tap --test-concurrency=1 \
  tests/complete-backup-scope-reading.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-options.test.js \
  tests/complete-backup-prompts-view.test.js \
  tests/complete-backup-collections-view.test.js \
  tests/complete-backup-download-review.test.js \
  tests/complete-backup-import-receipt-view.test.js \
  tests/complete-backup-workspaces.test.js
```

This is model evidence, not native Chrome input, a real 11 MiB performance test,
an installed-extension upgrade, filesystem download completion or recovery of
user data. Provider, identity, permission and network paths have failure sentinels
and zero calls. No full Node glob or Python suite, publication, screenshots,
permission changes, user device or paid service is part of this focused change.
