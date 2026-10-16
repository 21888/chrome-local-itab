# Collection metadata editor focus

## Scope and reproduced behavior

The audit baseline is `ba038a0ee51c78a34999e74fe12629423baca778` (tree
`ba3a95658af842b66d6be21c651369f328464c57`, manifest 1.1.155). It covers
existing collection metadata: title, annotations and tags; draft retention,
initial save, definite rejection and uncertain acknowledgement. The separate
body-review lifecycle, prompt forms, task editor and backup flows are outside
this change.

Activating the existing **Edit details** button removed its focused node without
focusing the editor. Saving metadata by button, form submission or Ctrl+S also
removed/disabled the focused control; focus fell to the document body while the
write was pending and remained there after success or rejection. The drafts and
saved body history themselves remained correct.

## Minimal view-only change

- An accepted **Edit details** action focuses its title field.
- An initial metadata save that starts with focus inside its editor moves focus
  to the existing stable status region. That region already has `tabIndex=-1`,
  `role=status` and `aria-live=polite`.
- The save call runs its synchronous busy/error render before status is focused.
  This matters because `prompts.css` hides `.prompt-status:empty`; focusing the
  empty idle status before beginning the save would not work.
- Completion does not restore any old focus. A newer search, filter or other
  focus choice remains the owner. The status node itself is retained across
  renders; its text changes to the saving, success or failure feedback.

No controller, Store, schema, recovery, permissions, manifest, external API or
body-review behavior changes. Metadata saves retain exact excerpt history;
uncertain results retain their original immutable operation and draft.

## Focused checks

All fixtures are synthetic. The final 44-case regression file has **23 failures
and 21 passes** against the frozen baseline, and **44 passes** with this view
change. Its local DOM setup models the status region's empty-state visibility
and native text replacement semantics rather than allowing an invisible status
to receive focus.

Coverage includes:

- English and Chinese Edit entry; literal annotation/tag drafts; field identity
  and focus across typing, search and clearing filters, without storage writes
- Real button, form and Ctrl+S entry with a deferred real Store write; saved data
  and exact body history checks; busy duplicate-save/input/departure guards
- A definitive pre-write capacity refusal, actual tag-validation failure and
  real uncertain acknowledgement, keeping the expected draft and operation
- Newer search/type/tool/tag/archive focus through success, refusal, uncertainty
  and subsequent refresh; body focus, hidden state, persisted pagehide and
  disposal without late focus restoration
- Conflict-copy retention, exact retry without another write, and actual
  discard-confirmation cancellation, explicit discard and clean reopening

The five explicitly selected related files pass **156/156**, without skips:

```sh
node --unhandled-rejections=strict --max-old-space-size=512 --test --test-concurrency=1 \
  tests/collection-metadata-focus.test.js \
  tests/local-ai-collections-ui.test.js \
  tests/local-ai-collections-tags-preservation.test.js \
  tests/local-ai-collections-tag-filter.test.js \
  tests/local-ai-collections-outcome.test.js
```

JavaScript syntax checks and `git diff --check` pass. Existing related tests
also cover imported delimiter-bearing tag preservation, annotation search,
conflict copies and read-only receipt reconciliation. Full Node/Python suites,
packaging and release checks are separate integration work.

## Metadata outcome-check follow-up

The separate pending-button follow-up is based on
`0510ff752fe7c006e989f921c76133a9f767d566` (tree
`810a7642a9df636b312afa319446c3685c1883bd`, manifest 1.1.155).
Actual **Check / retry the same save** and **Check saved outcome (read-only)**
button clicks reproduced the same focused-node removal: the synchronous busy
render replaced the button and left focus on the document body. The existing
Store still confirmed the exact original metadata operation without another
write, so no data or recovery change was needed.

A view-local callback now recovers only the clicked metadata button's lost
focus to the existing status region. It checks the pending action is `save`,
the command kind is `edit`, and its original `draftKey` and retained draft ID
match the command ID. This uses the operation's draft, even if the user has
selected another record while awaiting the earlier outcome. It does not treat
add, save-as-copy, body revision, archive, restore or import operations as
metadata edits.

The callback starts the original controller method exactly once before
focusing. The synchronous busy render has then made the status visible, which
matters for `.prompt-status:empty`. It moves focus only if the clicked button
owned it and removal left focus on body; a newer synchronous focus choice is
also respected. There is no post-await focus restoration, so subsequent search,
filter, body, pagehide, hidden-page or disposal focus stays with its newer owner.
The retry/inspection command, admission, acknowledgement and write behavior are
unchanged; no controller, Store or body-review code was edited.

The final `tests/collection-metadata-retry-focus.test.js` has **37 failures and
12 passes** on the frozen follow-up baseline and **49 passes** with this change.
All 37 baseline failures concern the missing synchronous status focus. The
checks exercise real rendered buttons, a real Store, synthetic records, a
commit-then-throw uncertain write and deferred exact retry/inspection:

- English and Chinese pending and confirmed feedback, read errors, retained
  field values and immutable operation identity; status is visible and busy
  when focused and is never focused again on completion
- Exact retry and read-only verification add zero writes; missing receipt proof
  retains the draft, and a later saved edit forces read-only verification
  without overwriting that later edit
- Newer search, type, tool, tag and archived-filter focus; hidden/pagehide,
  disposal, host removal and body focus; unfocused clicks and synchronous new
  search focus; duplicate busy requests are refused
- Selection away and back to the original draft, checking while another record
  is selected, successful reopening, discard cancellation and explicit discard
- Existing non-metadata add, save-as-copy, revision and archive callbacks retain
  their previous focus behavior; body history and explicit review regressions
  remain covered by the separate revision lifecycle suite

The seven explicitly selected related files pass **245/245**, without skips:

```sh
node --unhandled-rejections=strict --max-old-space-size=512 --test --test-concurrency=1 \
  tests/collection-metadata-retry-focus.test.js \
  tests/collection-metadata-focus.test.js \
  tests/collection-revision-lifecycle.test.js \
  tests/local-ai-collections-ui.test.js \
  tests/local-ai-collections-tags-preservation.test.js \
  tests/local-ai-collections-tag-filter.test.js \
  tests/local-ai-collections-outcome.test.js
```

JavaScript syntax checks and `git diff --check` pass. Full Node/Python suites,
packaging and release checks remain separate integration work.

## Validation limits

These are Node/DOM-model checks, not native Chrome, native IME, native keyboard,
visual, screen-reader, clipboard or installed-browser cross-tab acceptance.
No browser was launched, provider called, screenshot uploaded, user device used
or release published for these bounded changes.
