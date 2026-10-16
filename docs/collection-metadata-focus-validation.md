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

## Deliberately unchanged focus paths and limits

The shared **Check / retry the same save** and **Check saved outcome (read-only)**
callbacks are unchanged. A separate bounded probe of metadata operations with
`pendingCommand.action === 'save'`, `command.kind === 'edit'` and the original
record's `draftKey` reproduces those status buttons being removed during their
own pending render, with focus falling to body. Both operations retain the
same draft/command while pending, correctly confirm the original edit, clear
the draft on success and add zero writes. The regression above checks that a
newer search focus survives an exact retry; it does not claim those shared
buttons now retain their own focus. This remains a separate focus follow-up,
not a reason to change the receipt or body-review protocols here.

These are Node/DOM-model checks, not native Chrome, native IME, native keyboard,
visual, screen-reader, clipboard or installed-browser cross-tab acceptance.
No browser was launched, provider called, screenshot uploaded, user device used
or release published for this bounded change.
