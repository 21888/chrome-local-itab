# Layout numeric-input draft validation — 2026-10-16

## Reproduced defect

Settings' Columns and Grid Size controls save on `change`, but their shared layout
renderer previously assigned both inputs on every successful or failed refresh.
Typing was therefore vulnerable before blur, even after focus had moved elsewhere.

The first four tests in `tests/layout-input-draft.test.js` fail against base
`817a8e1`: a Columns draft of `8` becomes saved `6`, a Grid Size draft of `144`
becomes saved `96`, and a failed read that started before typing replaces an empty
draft with either saved number. The same four assertions pass with this change.
The comparison used the base's actual source and the same DOM/event model.

## Bounded change

- Keep raw numeric drafts in the page while refreshes, read failures and unrelated
  layout rendering update the saved state. An untouched input still follows saved
  values. Display a localized unsaved-input notice instead of claiming a newer
  draft is saved after an older operation finishes.
- Capture the draft's original numeric value, layout generation and shortcut
  context in memory. Refreshing, or saving a different layout field, does not
  authorize overwriting a newer same-field value. Numeric submissions use the
  existing locked `applyLayoutPatch` conflict checks with that captured baseline.
- A successful own write advances only that submitted numeric field's baseline,
  allowing rapid subsequent submissions without a false conflict. Later typing
  owns a new draft and cannot be cleared by the earlier completion.
- Failed submissions keep the draft. The existing explicit Retry may rebase its
  failed patch; a later, unsubmitted draft is retained if Retry saves an older
  value. Numeric conflict feedback asks the user to review the saved numbers in a
  new Settings tab before retrying. No automatic Retry or rollback is added.
- Whole-context invalidation disables the old inputs without erasing their text.
  Late input/change events cannot submit from disabled or invalidated controls.
- Raw layout drafts participate in the existing reload, departure and workspace
  switch guards. Save-and-switch waits for submitted work but does not silently
  submit raw numeric input; the user finishes editing in the original field.
  Deliberately committing an empty/non-finite number retains the existing
  validation/reset behavior. A confirmed valid submission still normalizes its
  displayed number.

Only the layout UI controller, shared departure checks, two locale messages and
focused tests/documentation change. Storage implementations, schema, saved keys,
permissions, providers, migrations and manifest version are unchanged. Nothing in
these in-memory draft records enters exports or saved configuration.

## Focused verification

`tests/layout-input-draft.test.js` has 21 passing source-level regressions, covering:

- Columns/Grid Size drafts and empty input across successful and failed reads
- Unfocused drafts, normal clean refresh and explicit save/normalization
- Older successful and failed saves with later `9`, original `6`, or empty typing
- Two rapid submissions, same-field external refreshes before/during typing,
  and unrelated own placement changes that merge another page's numeric value
- Observed and unobserved replacement generations; disabled stale blur events
- Failed-read retry, explicit failed-save retry with newer typing, and departure,
  reload and Save-and-switch behavior

The fixture runs actual `shared/layout.js`, `shared/local-content-lifecycle.js`
and `StorageManager.applyLayoutPatch`, with synthetic DOM/events, storage I/O and
serialized locks. It uses no personal data, credentials or live provider accounts.

Focused combined command:

```sh
node --test tests/layout-input-draft.test.js tests/layout-modes.test.js \
  tests/layout-write-conflicts.test.js tests/layout-baseline-admission.test.js \
  tests/layout-readback.test.js tests/layout-regroup-focus.test.js \
  tests/local-content-lifecycle.test.js tests/workspace-lifecycle.test.js \
  tests/settings-stale-save.test.js
```

Result: 150 passing tests, zero failures. JavaScript syntax checks for the three
changed/new JavaScript files, both locale JSON parses and `git diff --check` pass.
The full repository suite was not run for this bounded UI audit.

## Verification limits

This is deterministic source/DOM/storage-model evidence, not native Chrome
acceptance. Native number-input blur/IME behavior, focus painting, beforeunload
prompts and two-tab UI interaction remain to be checked in a permitted unpacked
extension session. No browser restriction was bypassed, no screenshot was taken
or uploaded, and no push, tag, release or Chrome Web Store submission was made.
