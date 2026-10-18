# Scratchpad Store backend transaction ownership

## Scope and production reachability

One Scratchpad Store invocation now keeps the backend that was configured when the invocation began. The production change is limited to `shared/local-scratchpad-store.js`. The existing four-field state (`schemaVersion`, `revision`, `enabled`, `content`), revision CAS, validation, exact readback comparison, autosave and Retry protocol are unchanged. Scratchpad does not have operation receipts; none are introduced. Controller, View, subscriptions, workspace code, Tasks, storage keys, permissions, manifest `1.1.155`, and CI workflow remain unchanged.

The dashboard and settings initialize the workspace page before mounting their Scratchpad views. The default View/settings Controller constructs a Store, whose `createChromeBackend()` obtains the page's workspace session. The AI context path separately constructs a Scratchpad Store with `session.createBackend(Scratchpad.KEY)`. Each Session backend closes over its Session; the Session exposes read-only identity getters backed by a frozen identity. The inspected production assignments contain no reassignment of an existing Scratchpad Store's backend. The separate `collectionStore.backend` assignment is for another Store.

Normal workspace switching pauses autosave, waits for pending work and the Session's flush, suspends new operations, selects the target, and navigates to a new page. It does not replace the backend of an existing Scratchpad Store.

Relevant source paths:

- `newtab.js` and `options.js`: workspace initialization and Scratchpad mounting
- `shared/local-scratchpad-view.js`: default Controller and settings mounting
- `shared/local-scratchpad-controller.js`: default Store, autosave, save, visibility, Retry and refresh
- `shared/local-scratchpad-store.js`: backend construction, raw/read/mutate/subscribe
- `shared/ai-context.js`: explicit session-bound Scratchpad source Store
- `shared/workspaces.js`: Session identity, admission, lock, get/set, flush and backend closures
- `shared/workspaces-view.js`: request/commit switch and page navigation

The tests intentionally substitute the public `store.backend` field. They demonstrate a transaction ownership defect under that substitution; they do not demonstrate that ordinary workspace navigation causes cross-workspace writes. This is also not evidence about the cause of the historical upgrade-data-loss incident.

## Minimal production change

`raw(backend = this.backend)` retains its direct-call default and accepts an explicitly captured backend. `read()` and `mutate()` synchronously capture `this.backend` before requesting its lock. The lock callback, initial read, write, and verification read all use that same object, even if lock admission or a read/write is awaiting completion when the public field changes.

This is destination consistency. An admitted operation may finish on its original destination. It does not cancel or roll back an already dispatched operation. A concurrent or later invocation deliberately captures the backend then configured on the Store. A subscription stays registered with the backend used by its own `subscribe()` invocation; its returned unsubscribe remains owned by that backend.

Capturing an object does not freeze the object, its methods, or the internals of a mutable adapter/session. Replacing methods, changing a mutable adapter's internal routing, replacing Store methods, or introducing arbitrary side effects through getters is not covered by this change.

Existing failure handling is retained:

- Missing data gives the initial state; malformed saved data gives `CORRUPT` and is not overwritten.
- Ordinary source/verification read failures give `READ`; `WORKSPACE_*` read failures preserve the original error. Lock-admission errors propagate unchanged.
- A rejected write, including a `WORKSPACE_*` rejection from the write method, retains Scratchpad's existing `WRITE` translation.
- A dropped write or valid but unequal readback gives `VERIFY`; invalid readback gives `CORRUPT`.
- Stale revisions and invalid commands still reject before any write.
- Uncertain acknowledgement still uses the real Controller's exact `next.content === draft` Retry check, without receipts or an additional write when the exact draft is already saved.

### Controller boundary

Each Controller refresh or Retry is a new Store invocation. This change does not bind a complete Controller lifetime, all notification callbacks, or all future retries to its construction source. In particular, an original notification during a pending write may set `refreshNeeded`; `run()` can then start a separate `refresh()` from `finally`. If a test has replaced `store.backend`, that separate read can capture the replacement. Any Controller source-ownership change belongs to a separate item.

The new Controller integration tests explicitly isolate notifications while measuring the individual mutation and restore the original backend before exercising real Retry. They call `init`, `setDraft`, `save`, `setEnabled` and `retry`; they do not manufacture Controller state, errors, conflict flags, status or retry state. Their zero-foreign-I/O assertions are limited to that measured, notification-isolated window. Subscription ownership is tested separately.

After the Store was frozen, a separate diagnostic outside the regression suite executed real `Controller.init()`, `setDraft()` and `save()` with a notifying backend. It replaced the public Store backend during the original pending write, then allowed that write to commit and notify. The original mutation correctly committed and returned its original content. The notification-triggered `finally` refresh performed one new foreign lock/read, zero foreign writes, and replaced Controller state/draft with the foreign note at the same revision. The Controller then reported `saved` and no uncommitted work. Counts were original **2 locks / 3 reads / 1 write**, foreign **1 lock / 1 read / 0 writes**; both saved records retained their expected data.

That one diagnostic completed with its observation assertions satisfied, exit 0, with identical Store/Controller/diagnostic hashes before and after. It is evidence for a separate, unfixed Controller boundary under deliberate public-field substitution, not another regression check counted in the totals below and not a normal navigation reproduction. No Controller edit was made. Diagnostic source SHA-256: `da35af48124da11c4d9e5da4c4cac700b0db04b78bf6477e4cec0552b3807d3f`.

## New tests and retained RED

`tests/local-scratchpad-backend-transaction.test.js` contains **102 new checks** against the real production Store and, where relevant, the real Controller and Session. Independent synthetic backends keep separate fixed raw data, counters, lock queues and gated reads/writes. Coverage includes:

- Content and visibility mutations with replacement before a queued lock callback, during source read, during write, and during verification read
- Direct raw/read ownership and detached results
- Empty text, CRLF, Unicode supplementary characters, combining text, BOM, whitespace and NUL without normalization or byte loss
- Original stale CAS, an all-rejected stale queue, and competing original writers with exactly one CAS winner
- Original read/lock/write error translation and `WORKSPACE_*` preservation where the existing protocol provides it
- Missing/corrupt original data, invalid commands, no accidental foreign reads/writes, and complete foreign record preservation
- Original exact verification, including a foreign matching result that must not falsely acknowledge an original dropped write
- Real Controller lost-acknowledgement/readback-failure Retry without duplicate successful writes; failed/uncommitted writes retried once after returning to the original source
- Concurrent independent invocations using their respective captured destinations, and unchanged subscription/unsubscribe ownership
- Actual Session/backend/admission/get/set code over a synthetic manager transport: original destination and lock ownership, pending flush, suspension/resumption, restore rejection, and generation recheck after an awaited original bundle read

The Session tests execute production Session logic, but their storage and lock transport is modeled. They are not native Chrome storage, native Web Locks, browser navigation, or screenshot tests.

Before any production edit, all **1,483 tracked baseline SHA-256 hashes** were verified. The complete baseline and new suite were archived together. The first RED run used only these explicit files:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-backend-transaction.test.js \
  tests/local-scratchpad-store.test.js
```

Result: **35/109 passed, 74 failed**, exit 1, **0 cancelled/skipped**, duration **494.628596 ms**. All seven existing Store checks passed. The new suite therefore had 28 passing and 74 failing checks on the unmodified production baseline. The full output and matching before/after hashes were retained. All 1,483 tracked files still matched the baseline after RED. There were no fixture corrections, old-test edits or discarded failed runs.

Measured RED examples include:

- Queued content/visibility invocation: original lock acquired, original reads/writes 0, foreign reads 2 and write 1, foreign lock 0.
- Paused original read: original read 1, then foreign write/read under no foreign lock.
- Paused original write: original write committed, but verification read came from foreign storage and produced `VERIFY`.
- Original dropped write with foreign matching bytes: the Store returned success despite no original commit.
- Queued stale command: a matching foreign revision admitted a write that the original revision should have rejected.
- Real Session backend substitution: the original Session locks were held but the saved destination was foreign.

## First focused GREEN, frozen

After approval of the Store-only scope, the minimal change passed its first candidate run: **795/795**, exit 0, **0 failed/cancelled/skipped**, duration **6,792.368588 ms**. This consists of the 102 new checks and 693 existing checks. The source and test hashes matched before and after the run. The first green Store and new suite were frozen, and the Node execution window was returned for independent audit.

The exact focused command, with no wildcard or full/scale run, was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-backend-transaction.test.js \
  tests/local-scratchpad-store.test.js \
  tests/local-scratchpad-boundary.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-copy-saved.test.js \
  tests/local-scratchpad-copy-selection.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-line-count.test.js \
  tests/workspace-lifecycle.test.js \
  tests/workspaces-invariants.test.js
```

Static baseline verification found **1,482/1,483 tracked files unchanged**; the sole changed tracked file is the scoped Store. All **493/493 protected files** remain unchanged. The new suite and this document are added separately. Existing tests/helpers, Controller, View, Tasks, workspace code, manifest and CI workflow were not edited. `git diff --check` passed.

Frozen SHA-256 values:

- Baseline Store: `03f5861809c8ca226261ec513adc2ddf583ce9fc6388a8d04fe6b0be14c81065`
- First-green Store: `7388cabce249fcd9a966ebad82829e9febe2180df5aa83ef50e1edfc76ac7901`
- Unchanged new suite from RED through GREEN: `c3850d44b72433db9ff7022a07d909af1fb5a93dc81fbfd692b884f6649f47d3`
- Baseline-plus-new-suite archive: `3bfc6dcdcbe40a1d4fc8dff6c1c0204ad14ac74d77205e759204819507cce946`

## Final focused and independent verification

The final related-code run passed **1,574/1,574**, exit 0, **0 failed/cancelled/skipped**, duration **24,497.181959 ms**. Its 35 filenames are explicit below. The Store and all 35 test-file SHA-256 hashes matched before and after. The new Store and test suite remained at their first-green hashes. Both separately executed `node --max-old-space-size=512 --check` commands, one for the Store and one for the new test file, also exited 0.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-backend-transaction.test.js \
  tests/local-scratchpad-boundary.test.js \
  tests/local-scratchpad-copy-saved.test.js \
  tests/local-scratchpad-copy-selection.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-line-count.test.js \
  tests/local-scratchpad-store.test.js \
  tests/local-scratchpad-view.test.js \
  tests/workspace-lifecycle.test.js \
  tests/workspaces-invariants.test.js \
  tests/workspaces-view.test.js \
  tests/ai-context.test.js \
  tests/ai-context-view.test.js \
  tests/complete-backup-acceptance.test.js \
  tests/complete-backup-collections-view.test.js \
  tests/complete-backup-collections.test.js \
  tests/complete-backup-contrast.test.js \
  tests/complete-backup-download-review.test.js \
  tests/complete-backup-duplicate-keys.test.js \
  tests/complete-backup-export-summary.test.js \
  tests/complete-backup-image-counts.test.js \
  tests/complete-backup-import-receipt-view.test.js \
  tests/complete-backup-import-receipt.test.js \
  tests/complete-backup-module-bulk-select.test.js \
  tests/complete-backup-options.test.js \
  tests/complete-backup-prompts-independent-audit.test.js \
  tests/complete-backup-prompts-view.test.js \
  tests/complete-backup-prompts.test.js \
  tests/complete-backup-scope-reading.test.js \
  tests/complete-backup-target-recovery.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-workspace-impact.test.js \
  tests/complete-backup-workspaces.test.js \
  tests/complete-backup.test.js
```

The independent owner audit passed its **26/26** new Scratchpad checks on the first run, exit 0, no failures/cancellations/skips, duration **87.888097 ms**. The owner then ran those checks with its current 14 independent Tasks suites: **789/789**, exit 0, no failures/cancellations/skips, duration **15,485.97192 ms**. The 26 checks are included in 789; these overlapping runs are not summed into a new total. These independent probes cover queued/source-read/write substitution, matching foreign-byte false acknowledgement, original failure translation and CAS, later invocations, subscription ownership, exact/empty text and real Controller Retry.

Owner static verification independently confirmed **1,482/1,483 unchanged baseline tracked files**, **493/493 unchanged protected files**, and changes confined to `raw`, `read` and `mutate`. Helpers, constructor, `subscribe`, exports and the rest of the Store protocol are unchanged.

Python validation passed **84/84** in **1.865 seconds**. Local runtime packaging and verification both exited 0 for **133 files**, **4,053,478 source bytes**, package SHA-256 `035e7c40cda880407916de1f802b0b93b071eceb3c44a3b0f7b1564213829054`. This is a local modified-working-tree package, not a published release or remote exact-source CI result.

## Delivery limits

The focused result is local modeled validation. It does not claim a full exact-source CI result, publication, native-browser QA, accessibility/screenshot testing, or historical data-loss recovery. No tag, Release, extension-store publication, user-device operation, paid platform, or permission change is part of this item. Manifest and the existing Release remain frozen.
