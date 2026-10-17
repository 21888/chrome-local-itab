# New draft from a saved excerpt — bounded development validation

## Scope

Active saved details have a secondary native button, “New draft from this
excerpt” / “以此摘录新建草稿”. It uses the controller's existing editable-field
projection, removes record identity/version, retains original tags, and gives
the independent unsaved draft an empty baseline. Only explicit Save uses the
existing add, duplicate-confirmation, capacity and uncertain-outcome paths.

The view keeps its explanatory label separately from draft data. It copies no
history, archive state, historical question/source snapshot, capture marker,
exact-result marker or proposed revision. An existing new-item draft is merely
selected; every field, baseline and special marker stays intact. Existing other
drafts and proposals remain. No source fence is added after creation: later
changes to the original record do not overwrite or freeze the independent draft.

The new action owns its rendered detail, state, record identity/version and read
generation. It rejects stale controls, unverified or pending reads, errors,
saves, drafts, modal/revision states, hidden/inert/non-visible controls,
pagehide, detached hosts and disposed views. Focus moves only from the removed
active action to its still-owned visible editor; synchronous newer focus wins.
Visibility checks cover hidden/aria-hidden/inert ancestors, CSS visibility and
closed details. These are defensive ownership checks, not a claim that the
current collection page normally enters each presentation state.

## Verification (2026-10-17)

- Minimal red: the actual View + Controller + Store RAM model initially lacked
  the action (1 failing assertion). Adding the entry made that check pass.
- New focused file: 40 passing tests. English, Chinese and missing-catalog
  fallbacks; actual detail activation; exact metadata, CRLF/CR and comma-bearing
  tags; missing exact prompt IDs retained; editable text and explicit unlink;
  no creation I/O; dirty/departure protection; ordinary/exact-result/captured
  existing drafts; other drafts/proposals; old controls and A→B→A; read failure
  and refresh; modal/busy/pending/visibility/lifecycle; native keyboard-default
  preservation and IME/repeat suppression; synchronous focus reentry.
- Real Controller/Store RAM save cases: duplicate cancellation keeps the draft;
  explicit confirmation creates a different ID with one version while the
  source's 20 versions remain byte-equivalent; capacity rejection keeps the
  draft; an uncertain committed add reuses its operation and does not duplicate
  writes. Later source metadata/archive changes leave the new draft independent.
- First expanded run was 35/36 because the 20-version fixture did not await the
  existing subscription refresh between revisions. Awaiting its normal settle
  step fixed the fixture; the first failure was retained in the evidence.
- Final explicit six-file regression: 322/322 passed with strict unhandled
  rejections, 512 MiB old-space limit and test concurrency 1. Existing test files,
  Store/controller/core/helpers, manifest and workflows remain unchanged.

Command, run from the repository root:

```sh
node --max-old-space-size=512 --unhandled-rejections=strict --test --test-concurrency=1 tests/collection-reuse-draft.test.js tests/local-ai-collections-ui.test.js tests/collection-metadata-focus.test.js tests/local-ai-collections-tags-preservation.test.js tests/collection-revision-lifecycle.test.js tests/collection-context-handoff.test.js
```

View/new-test syntax, both modified locale JSON files and whitespace checks also
pass. No full/glob/scale suite, provider, network, clipboard, real-browser,
screenshot, user-device, permission, upgrade or migration run was performed.
The DOM model preserves native Enter/Space defaults and simulates textarea line
ending normalization; it does not prove Chrome native key activation or focus
painting. Manifest remains 1.1.155. Release and Chrome Web Store publication are
frozen for this development change.
