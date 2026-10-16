# Manual topic dialog and feedback localization

## Scope

The three manual topic lists in Settings use the current English or Simplified
Chinese catalog for six messages: title prompt, score prompt, Delete confirmation,
and Add/Edit/Delete success feedback. Each expression uses the existing `t`
helper and the prior English text as its fallback. Missing, throwing, absent or
key-returning catalogs, and an absent i18n helper, retain readable English.

Only these six message expressions and the two catalogs change at runtime.
Brand labels, literal user titles, prompt default arguments, scores, stored
records, parsing, cancellation, row ownership, save queues, CAS, error details,
drafts and Sync behavior are unchanged. No data migration, network topic source,
provider, permission or manifest change is introduced.

Existing score behavior is deliberately retained: cancelling the title prompt
or entering a blank title stops the edit; cancelling the score prompt still
saves an accepted new title with the prior score. An unparseable score retains
the prior score on Edit and uses zero on Add. Scores otherwise use the existing
`parseInt` behavior.

## Focused regression

Run from the repository root:

```sh
node --test --test-concurrency=1 tests/settings-topic-localization.test.js tests/settings-stale-save.test.js tests/local-content-lifecycle.test.js tests/content-topics-layout.test.js
node --check options.js
node --check tests/settings-topic-localization.test.js
git diff --check
```

The new suite executes actual DOMContentLoaded initialization, real HTML manual
topic controls, actual Add and rendered-row Edit/Delete listeners, the shared
i18n helper, real Options queue and real StorageManager. RAM Chrome storage,
serialized Web Locks, DOM/event dispatch, prompts, confirmations and timers are
deterministic models with synthetic content only.

Coverage includes:

- EN/ZH and unsupported-language English fallback across all three lists and all
  three successful actions; each missing message in an otherwise Chinese catalog
- Literal `$` sequences, newlines and HTML-like titles; unchanged raw prompt
  defaults and numeric argument types; existing trim and score parsing semantics
- Title cancellation/blank input, score cancellation/invalid values and declined
  deletion; unchanged Add input clearing and validation
- Real StorageManager false results, rejected writes, uncertain post-write
  acknowledgements and CAS conflicts; exact raw details, retained drafts and
  unchanged baselines without misleading success messages
- Detached row handlers, successive queued additions, pending-save departure
  protection, newer unsubmitted inputs and unrelated form/list drafts
- Sync scheduling after a successful local write, without scheduling after
  refused writes; topic-only patch scope and untouched private sentinels

The related existing suites cover broader stale-save, lifecycle and layout
regressions. Focused Node checks do not establish a full-repository pass. They
also do not test native Chrome prompt rendering, modal focus, IME, accessibility,
real extension storage persistence or live cross-device Chrome Sync.

## Results (2026-10-16)

- New suite: 55 passed, no failures/skips/cancellations.
- The same final tests against baseline `02ac5622` runtime/catalogs: 40 passed,
  15 expected failures exposing hard-coded English and missing scoped keys.
- The four explicitly named suites above: 101 passed, no failures/skips/cancellations.
- Both changed JavaScript files pass syntax checks; both catalogs parse as JSON;
  `git diff --check` passes.
- Reversing exactly the six new `t(...)` wrappers reproduces baseline `options.js`
  byte-for-byte. Removing exactly the six new keys from each catalog reproduces
  the baseline parsed JSON. No full-suite, Python or native-browser run is claimed.
