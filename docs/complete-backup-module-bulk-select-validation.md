# Complete-backup module bulk selection

## Change and bounds

The module fieldset now contains native `type="button"` controls for **Select all
available modules** / **全选可用模块** and **Clear selection** / **全部取消**. They use
the existing secondary-button and fieldset styles. The production changes are
limited to the view and English/Chinese catalogs. Store, schemas, restore tickets,
restore arguments, Settings controller, target confirmation, Focus sessions,
configuration-import receipts and recovery protocols are unchanged. The manifest
remains 1.1.155; Release and Chrome Web Store assets are unchanged.

Without a file, bulk selection changes only the seven checkbox values and makes
no Store call. With a checked file, only available modules are changed. One changed
batch requests at most one existing review; it never dispatches seven checkbox
changes. Empty selection synchronously clears the preview and impact details,
retains the source, known modules and existing same-file destination choices, and
makes no core review call. Repeating a same-value batch changes no generation,
feedback or control lock. It does not disable or move focus from an already-all or
already-empty button.

The new controls use the existing busy/unknown-scope locks. They cannot change
selection during initial file reading/review, the large-file confirmation, export
or Apply. Known-scope rereviews remain editable; generation ownership rejects
late results. Selection never automatically exports, restores or approves a
destination. Selecting all five workspace modules returns to the existing full
workspace scope and impact disclosure. Either selected global library still needs
its own explicit target. Clearing and reselecting does not stop an active Focus
timer or bypass draft/import/recovery protections.

## Red, green and focused regression

The starting checkout was commit
`3acaac7896fa8d3eb08dc75162223a1a2bfd7c02`, tree
`ee640918174cfd82074868c14d9db3b16722f441`. Before changing production code, one
minimal test mounted the production view and required the two native controls in
the existing fieldset. The baseline produced **0 passes / 1 expected failure**:
“the module fieldset needs Select all available modules.” The same minimal test
passed after the view change. This was a missing-entrypoint check, not a full
baseline matrix.

The first complete new focused file passed **22/22**, with no fixture failures.
The final nine explicitly named suites passed **159/159**: 22 new cases and 137
existing regression cases. There were no failed, skipped or cancelled tests.
The run used a 512 MiB Node heap limit and test concurrency 1:

```sh
node --max-old-space-size=512 --test --test-reporter=tap --test-concurrency=1 \
  tests/complete-backup-module-bulk-select.test.js \
  tests/complete-backup-scope-reading.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-options.test.js \
  tests/complete-backup-prompts-view.test.js \
  tests/complete-backup-collections-view.test.js \
  tests/complete-backup-download-review.test.js \
  tests/complete-backup-import-receipt-view.test.js \
  tests/complete-backup-workspaces.test.js
```

New coverage uses the production view, synthetic DOM/File events, and two small
production Store/StorageManager RAM fixtures:

- Native button markup and English, Chinese and fallback labels; seven-module
  selection before a file, no-op focus/feedback, and the existing empty-export
  guard, with no Store calls.
- A real partial file: clear, select only Scratchpad, then select all available;
  exactly one fresh nonempty review per change, absent modules stay disabled,
  and the current file remains the source.
- A real complete file: full-scope impact, synchronous clear, fresh Scratchpad
  `matching` scope, then fresh `all` scope and collapsed impact. Both global
  targets remain independently required, then retain only the explicit choices
  already made for that same file. A new file resets both choices.
- Legacy target preservation, active Focus refusal, initial file/first-review/
  large-confirmation locks, export/Apply locks, and no automatic write actions.
- Known-scope out-of-order review and clearing while old work is pending;
  repeated same-value activation does not invalidate the in-flight generation.
- Cancel, Escape, a new file, file-read failure, destroyed controls, a detached
  host, and focus ownership after delayed bulk review. Stale results cannot
  resurrect the prior details or selection.

Both real RAM cases compare the complete raw storage and write count before and
after bulk selection/review: they remain unchanged. Provider, identity, permission
and network failure sentinels recorded zero calls. All input content is synthetic.
The existing regression suites additionally exercise the unchanged Settings
restore, draft, import-receipt and recovery protections.

## Evidence limits

This is Node model/RAM evidence. Native Chrome pointer/keyboard activation,
assistive technology, visual layout, narrow/light/dark rendering, installed
extension upgrades, real large-file timing, filesystem download completion and
user-data recovery were not tested. The large-file case supplies a synthetic size
and checks the existing confirmation gate; it is not a performance benchmark.
No browser screenshots, user device, paid service, permission/security change,
provider access or external data transmission was used. No full Node glob,
Python suite, scale/resource diagnostic or publication was run for this change.
