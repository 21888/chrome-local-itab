# Task Undo construction-source and exact-attempt ownership

## Scope and reachability

This change is limited to the Tasks View's Undo record, Undo request, exact Undo Retry and issued Undo continuations. It does not change Store, Controller, schema, keys, receipts, revision CAS, task states or the `1.1.155` manifest. Existing completion, pinned completion, active/completed removal and batch completion still share one Undo slot. Undo retains its existing per-record or all-member CAS and does not acquire a revision fence.

Production mounts Tasks after workspace initialization. Normal workspace switching waits for pending work, suspends and flushes the session, then selects a destination and navigates. The substitutions in these tests deliberately exercise mutable public-field boundaries. They do not demonstrate a normal workspace switch redirecting Undo and do not establish the cause or recovery of historical upgrade data loss.

The existing Controller and Store protections cannot bind an old View Undo to its original source if the View's entire public Controller is replaced by another complete, valid Controller. The tests therefore seed independent foreign backends with the exact saved synthetic snapshot that created Undo, including IDs and versions. A mismatch in task CAS cannot accidentally conceal a source-admission failure.

## First RED and fixture isolation

The new test file first ran alone against unchanged production and all **1,463 original tracked files**. It reported **111 tests: 39 passed, 72 failed, 0 cancelled, 0 skipped**, exit **1**, duration **1,906.609897 ms**. The complete source, View/Store/Controller sources, tracked/protected baselines, command, report, exit code and hashes were retained before production changes.

Observed boundaries included:

- Each of five real original actions created Undo through actual View controls. Replacing the whole Controller before Undo caused **1 foreign request, 2 foreign reads and 1 foreign write**.
- Replacing Store, backend, workspace object, workspace ID, generation, session or host failed to reject Undo before request construction. The Store/Controller protections still refused some downstream work, but those refusals were not a View source check.
- A source change while `Store.request` returned was not checked before dispatch.
- The old exact Undo Retry could reach a changed source or fall through to a foreign refresh.
- A successful issued Undo cleared the retained Undo record during a source gap.
- Same-source false-write, dropped-write and committed-but-unacknowledged receipt controls passed without changing the actual Store or Controller protocols.

Three first-run late-success probes, for workspace object, ID and generation, instead received a real `VERIFY` failure. Their first synthetic backend routed each read dynamically: after the field injection, verification read a different synthetic destination than the write. Those three failures are retained as real outcomes of that adapter's routing and are **not** attributed to the View.

Only the new fixture was adjusted to capture a fixed synthetic target for the entire lock callback. This deliberately isolates the View's late continuation from backend-routing changes; it is not a claim about production workspace navigation. The corrected pre-production RED again reported **111 tests: 39 passed, 72 failed, 0 cancelled, 0 skipped**, exit **1**, duration **1,826.796827 ms**. All eight late-success source substitutions now produced a real original Controller `saved` result, and their failures measured the incorrect View cleanup. All original tracked files remained unchanged.

Retained hashes:

- Original View: `6e0e5efc9c9f29ea6964ed541d5528be6c1b93d6d864aab1035b9aaa923d1298`
- First 111-test source: `c2cc5d4c0ed092231375ce9a0c68179b99812338bcbb373a2b7e1df146524903`
- First report: `4d7fe61a7a6fedb45ad3c2bc2998d133740b145b4521de7be0c6c28a8606ac64`
- Corrected RED source: `9673a57107aefb507bd816e1627f1f72312ca253d1ebf11faad92cddf5a80f51`
- Corrected RED report: `0c68034fc54f695001bf8b9b22f5cb5f029be905332908699fc33e0bbd5bd1e7`

No old test or shared helper changed to obtain either RED. No Controller state, error or retry field was assigned to manufacture a result.

## Minimum ownership contract

Private WeakMaps bind each confirmed Undo record and exact Undo attempt to the original construction source. The source checks retain the original host/document, Controller, Store, backend, workspace object, workspace ID, generation and session. They reuse the established availability predicate and private non-revivable View lifecycle.

`rememberUndo` adds source admission and private metadata while preserving its existing saved-result, latest-receipt, batch-result and current-state conditions. A source-gap callback cannot register foreign Undo or clear the preceding record. A newer real completion or removal owns the new private slot.

`undoLast` checks the private record and original source before requesting a command and again after the request returns. The request comes from the captured Store. An already-dispatched attempt retains its exact original command; explicit Undo after return to the original source can acknowledge a committed result using its original receipt, with **zero new requests and zero writes**.

Only the exact private Undo command branches from `perform` into the added `performUndo` method. The original generic `perform` body remains byte-identical. The Undo-only path checks ownership again immediately before captured-Controller dispatch. Its continuation clears only its own record while its source, private attempt and action generation still match. A newer draft, Undo or retry is not cleanup authority for an older completion.

An issued original transaction is not cancelled or redirected. Its captured Controller retains the actual successful, false-write or lost-acknowledgement result. A source gap suppresses View cleanup, not the transaction's outcome. Detaching the original host does not cancel already-issued work. No new connected-host, inert, dialog, visibility or document-background contract is added to Undo.

The exact Undo Retry check does not use command kind to classify ownership: ordinary row `reopen` and `restore` commands keep their own existing Retry paths. Genuine READ Retry must refresh the original Controller and cannot be treated as acknowledgement of a previously successful Undo.

## Candidate checks and retained READ-Retry RED

Twelve positive controls were appended for revision-free unrelated edit/pin behavior, ordinary same-kind row Retry, batch all-or-none CAS, original-host detachment and a newer real Remove Undo started during final notification.

The first four-file candidate check reported **256 tests: 254 passed, 2 failed**, exit **1**, duration **4,212.883707 ms**. The original 111 probes and all three unchanged old suites passed. The two failures were in the new ordinary-row controls before dispatch: they incorrectly looked for a text `Reopen` menu item and a removed-row menu. Only these new controls were corrected to use the real `.tasks-check` Reopen button and direct Restore button. No production code, original test or shared helper changed for that correction.

The same four-file check then passed **256/256**, **0 failures, cancellations or skips**, exit **0**, duration **4,158.81038 ms**. The View and four test-file hashes matched before and after execution. Static checking showed only the View changed among the original 1,463 tracked files; all **454 protected files** remained unchanged.

Subsequent review found that the first candidate's `saved && !retryCommand` Undo Retry branch could replace a real READ refresh with an old successful Undo receipt acknowledgement. Four additional tests use genuine backend failures and actual Controller methods. On the frozen first candidate they reported **127 tests: 125 passed, 2 failed**, **0 cancelled or skipped**, exit **1**, duration **2,193.642449 ms**. Both failing cases observed one incorrect `Controller.run(oldUndo)` call after a real READ failure with a null retry command. The two controls for newer real Add Retry, with and without an additional background READ failure, passed. The candidate source and complete failed report were retained.

- First four-file green report: `1d5bec716e2533426c2c0a2439ea179bb3b8ecd65c73dbb2926857e3327e6715`
- READ-Retry RED candidate View: `18cccc5c94a3f8499a540a9c446a7bf4fd8aca0861a084e30ca9ea848b259981`
- READ-Retry RED test source: `c17f6787df52aeb124fe14dec17b0851a2cd9551c1bd45ec7ce59c987ec4c907`
- READ-Retry RED report: `8261a08b9b1e7d6fd0dd203a714fa78ecba653ec2c0b09a0b42ca761199b1d8f`

These are successive verification stages, not additive totals. All Node checks use a 512 MB heap limit, concurrency one and explicit test-file paths; no glob, local full-suite or scale command is used.

## READ-Retry correction and four-file verification

The correction only narrows `retryLast`: a retained Undo attempt rejects source gaps before any foreign refresh; within its original source, only the exact command still held by the original Controller's `retryCommand` enters the Undo branch. A successful attempt with no retry command no longer grants that permission. The existing READ refresh path remains available, while `undoLast` retains explicit receipt acknowledgement.

The final four-file check passed **260/260 tests**, **0 failures, cancellations or skips**, exit **0**, duration **4,232.22588 ms**. This consists of the 127 new tests plus 133 tests in the unchanged completion-Undo, batch-completion View and original View suites. The exact command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-undo-source.test.js tests/local-tasks-completion-undo.test.js tests/local-tasks-complete-batch-view.test.js tests/local-tasks-view.test.js
```

All five source/test hashes matched before and after execution. At this four-file stage, the only changed pre-existing tracked file was `shared/local-tasks-view.js`. Four of its 74 pre-existing methods change (`perform`, `retryLast`, `rememberUndo`, `undoLast`), and `performUndo` is added. The other 70 existing methods remain byte-identical; stripping the two-line exact-attempt delegation from `perform` restores that entire original method byte-for-byte. The preceding lifecycle, editor and replacement-review protections are unchanged.

- View SHA-256: `c5703038819784e68c68444950b0de4e5c11a67ed317d90e1c6523cb81c2c9cd`
- New 127-test suite SHA-256: `c17f6787df52aeb124fe14dec17b0851a2cd9551c1bd45ec7ce59c987ec4c907`
- Final four-file report SHA-256: `3dd71f20fd2ba910795c5f056dfb8ae12b06c184390b3174e2779ca3e722d6f2`

## Independent review, static boundaries and package checks

Before the broader row-fixture adjustments, the independent check passed **220/220 probes**, **0 failures, cancellations or skips**, exit **0**, duration **4,059.949899 ms**. It comprises 30 Undo probes, 27 earlier lifecycle probes, 63 import/recovery review probes, 45 Controller probes and 55 ordinary-editor probes. The additional Undo probes confirm that a repeated real READ failure keeps a null retry command, a later successful refresh returns to `ready` without consuming the retained Undo, foreign READ Retry causes zero I/O, and a newer generic Add Retry keeps its command and draft effect.

At that same pre-adjustment stage, independent static review confirmed **1,462 of 1,463 original tracked files unchanged** and all **414 files in its protected list unchanged**. The broader baseline retained for the new suite also found all 454 entries in that list unchanged. Both lists exclude the deliberately modified View. Removing the exact-Undo additions from the top of `perform` and `retryLast` restores their entire old generic paths byte-for-byte. `rememberUndo` retains the old saved/receipt/current-state conditions byte-for-byte.

Python verification passed **84/84** in **1.822 seconds**. Runtime build and verification passed with **133 files**, **4,028,154 source bytes**, package SHA-256 `013427cda634ba89fc8445ec729be474693f32dd5c04f08d73ad0d7ac21b7f95`. Neither the new tests nor this documentation enters that runtime archive. The manifest, store assets, screenshots, release version and browser-validation scope remain unchanged.

## First broader check and earlier row-ownership fixtures

The first explicitly named 51-file check reported **5,287 tests: 5,275 passed, 12 failed, 0 cancelled, 0 skipped**, exit **1**, duration **66,079.781694 ms**. The View and all 51 test-file hashes remained unchanged throughout execution. The two subsequent syntax checks, for the View and new Undo suite, both exited **0**. The full failed report and all three affected original test files were retained before any fixture adjustment.

The 12 failing cases come from five existing test declaration bodies: one Remove test, two Reopen tests and two Restore declarations, one of which expands to eight cases. Each deliberately changed `LocalItabWorkspaces.session` to a different object and then expected Undo Retry to succeed. Their original purpose was to ensure an ordinary-row ownership gate, including a prior row attempt with the same command kind, did not incorrectly classify Undo as its own command. Undo now has its own construction-source gate, so the substituted session correctly prevents that retry.

- First 51-file report SHA-256: `edd9cb42a1c6fd1a39d2f354ef5b897ecac5f1d8d6eae9f4c03c6308fc53fc6c`

After review, only those five declaration bodies were adjusted. Their existing loops still exercise 25 internal combinations. Each keeps the session substitution and now verifies zero requests, reads and writes, unchanged raw state, and the exact original error, retry, Controller state, Undo and earlier row-attempt references. It then restores the exact original session.

To retain the original row-independence protection, each positive continuation shallow-copies only the corresponding `completed` or `removed` section wrapper while retaining the same DOM nodes. It verifies the ordinary row source predicate is false, DOM node identities, draft and focus remain unchanged, and all Undo construction-source identities still match. It then executes the real Retry and preserves every original successful-write, exact-command, receipt, destination and acknowledgement-zero-write assertion. No private predicate substitutes for the actual successful retry.

The three adjusted ownership files plus the unchanged 127-test Undo suite passed **1,427/1,427 tests**, **0 failures, cancellations or skips**, exit **0**, duration **16,096.882336 ms**. The View and all four named test-file hashes matched before and after execution. These fixture adjustments do not change production, any helper, any other old case or the runtime package.

## Final independent review after fixture adjustment

The final independent check passed **232/232 probes**, **0 failures, cancellations or skips**, exit **0**, duration **4,493.405116 ms**. This includes 42 independent Undo probes and the unchanged 190 earlier lifecycle/review/Controller/editor probes. Its additional 12 combinations independently perform a prior real row Reopen or Restore, create a new real completion/removal Undo, reject changed-session Retry with zero I/O and unchanged owned state, restore the original session, invalidate only the ordinary row's wrapper, and verify the real exact Undo Retry and receipt.

Independent static review stripped only the five authorized declaration bodies and found the remaining text of all three adjusted old test files identical to the baseline. Those bodies cover the original 25 mode/state combinations. All shared helpers, other old cases, Store, Controller, production methods outside the four named methods, lifecycle protections, manifest and runtime package remain unchanged. The final static counts are **1,459 of 1,463 original tracked files unchanged** and **411 of 414 protected files unchanged**. There are four changed original files in total: the View and the three approved ownership test files. The new Undo suite and this document are additions.

## Final 51-file and syntax verification

The corrected final 51-file check passed **5,287/5,287 tests**, **0 failures, cancellations or skips**, exit **0**, duration **65,547.811296 ms**. The View and all 51 named test-file hashes matched before and after execution. Each of the five changed JavaScript files then passed its own `node --max-old-space-size=512 --check` command: View, new Undo suite, and the three approved ownership suites. All five exited **0**.

The final production and new-suite hashes remain `c5703038819784e68c68444950b0de4e5c11a67ed317d90e1c6523cb81c2c9cd` and `c17f6787df52aeb124fe14dec17b0851a2cd9551c1bd45ec7ce59c987ec4c907`. The earlier Python/package verification therefore still covers the unchanged runtime source.

Final 51-file report SHA-256: `deab93290e41f7ac1d4fc6d478ebcb0b8368308c4d9b252a7d580dd7c7e5a263`.

## Explicit final verification paths

The final 51-file command names exactly these paths; its complete expanded command, report, exit status and before/after hashes are retained.

- `tests/local-tasks-restore-ownership.test.js`
- `tests/local-tasks-remove-ownership.test.js`
- `tests/local-tasks-reopen-ownership.test.js`
- `tests/local-tasks-batch-store.test.js`
- `tests/local-tasks-boundary.test.js`
- `tests/local-tasks-complete-batch-store.test.js`
- `tests/local-tasks-complete-batch-view.test.js`
- `tests/local-tasks-complete-ownership.test.js`
- `tests/local-tasks-completion-undo.test.js`
- `tests/local-tasks-copy-visible.test.js`
- `tests/local-tasks-edit-return-focus.test.js`
- `tests/local-tasks-move-first-ownership.test.js`
- `tests/local-tasks-move-first-store.test.js`
- `tests/local-tasks-move-first-view.test.js`
- `tests/local-tasks-move-last-ownership.test.js`
- `tests/local-tasks-move-last-store.test.js`
- `tests/local-tasks-move-last-view.test.js`
- `tests/local-tasks-pin-ownership.test.js`
- `tests/local-tasks-pinned-completion.test.js`
- `tests/local-tasks-step-move-ownership.test.js`
- `tests/local-tasks-store.test.js`
- `tests/local-tasks-view.test.js`
- `tests/local-tasks-reopen-batch-store.test.js`
- `tests/local-tasks-reopen-batch-view.test.js`
- `tests/local-tasks-restore-batch-store.test.js`
- `tests/local-tasks-restore-batch-view.test.js`
- `tests/local-tasks-copy-completed.test.js`
- `tests/local-tasks-next-ownership.test.js`
- `tests/local-tasks-copy-removed.test.js`
- `tests/local-tasks-edit-source.test.js`
- `tests/local-tasks-batch-view.test.js`
- `tests/local-tasks-dialog-composition.test.js`
- `tests/dialog-focus.test.js`
- `tests/dialog-ime.test.js`
- `tests/dialog-details-focus.test.js`
- `tests/ai-context-task-edit.test.js`
- `tests/ai-context-view.test.js`
- `tests/ai-context-external-tasks.test.js`
- `tests/local-tasks-departure.test.js`
- `tests/local-tasks-reuse-draft.test.js`
- `tests/local-tasks-copy-text.test.js`
- `tests/local-tasks-visibility.test.js`
- `tests/local-tasks-backend-transaction.test.js`
- `tests/workspace-lifecycle.test.js`
- `tests/workspaces-invariants.test.js`
- `tests/workspaces-view.test.js`
- `tests/ai-context.test.js`
- `tests/local-tasks-controller-source.test.js`
- `tests/local-tasks-replacement-source.test.js`
- `tests/local-tasks-view-lifecycle-source.test.js`
- `tests/local-tasks-undo-source.test.js`
