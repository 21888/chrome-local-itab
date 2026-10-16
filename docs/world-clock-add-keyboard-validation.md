# World-clock Add keyboard ownership

## Reproduced issue

Against `c4ce282927bc507713d3b1c74140acdf83392216`, the Settings editor
treated an IME's final Enter with `keyCode: 229` as Add. It appended the still
edited clock, cleared both inputs and moved focus to the time-zone input.
Holding Enter after a successful Add also validated the newly empty input and
showed an invalid-zone error. The existing Move/Remove buttons already guarded
repeated and composing activation keys; Add did not.

## Narrow correction

- Input Enter leaves composing, key-code 229 and already-consumed events alone,
  so candidate confirmation remains owned by the IME or earlier handler.
- Repeated input Enter is prevented without appending or changing feedback.
- Add's native button guards repeated/composing Enter and Space like the existing
  row actions. Ordinary input Enter, native button Enter/Space and mouse clicks
  retain their existing Add behavior. There is no new modifier-key policy.
- Add still changes only the page-local list. Explicit Save persists it, and
  an earlier Save completion retains newer unadded input and its focus.

Only `options.js`, focused tests and this record change. Manifest remains
1.1.155. Storage, timer/controller logic, schemas, permissions and translations
are unchanged.

## Automated evidence

The original focused audit passed 87 existing tests. Five additional tests execute
the actual Options initializer and Add/save handlers in the existing DOM model.
With those final tests copied onto the unchanged baseline, world-clock Options
reports 4 failures and 7 passes. The failures cover IME/input ownership, held
Enter's false error, missing button key guards, and newer unadded input during an
older Save. The ordinary activation test already passes on the baseline.

The corrected candidate passes all 154 tests in the following related suites,
with no failures or skips:

```sh
node --test tests/world-clocks-options.test.js tests/world-clocks-live.test.js tests/world-clock-editor-layout.test.js tests/local-countdown-controller.test.js tests/local-countdown-view.test.js tests/local-countdown-integration.test.js tests/local-focus-duration-draft.test.js tests/local-focus-view.test.js tests/local-focus-controller.test.js tests/local-focus-integration.test.js tests/settings-keyboard.test.js tests/settings-stale-save.test.js
node --check options.js
node --check tests/world-clocks-options.test.js
git diff --check
```

New coverage includes both inputs; English/Chinese normal activation; literal
Chinese labels; repeat, composing, 229 and consumed Enter; unchanged focus,
inputs, feedback and save boundary; unaffected Tab/Escape; ordinary mouse Add;
and newer draft input surviving a delayed Save. Button tests explicitly model
Enter activation on keydown and Space activation after an uncancelled keydown
and keyup. They do not replace a browser's keyboard implementation.

## Bounded Countdown / Focus audit

Existing documentation, implementations and the named suites were reviewed/run:

- Countdown: explicit Save/Cancel, newer typing during writes and Cancel reads,
  failed/uncertain acknowledgements and exact retry, conflicts and confirmed
  replacement, composition, duplicate actions, read-generation ordering,
  destruction, and text-import cancellation/newer edit/departure/late completion.
- Focus duration: raw/empty drafts through refresh, native change versus explicit
  Save, validation, failed/uncertain saves, phase-bound drafts, remote running
  state, stale events, held activation, pending duplicates, conservative focus
  restoration, hide/show, departure and destroy-time protection.
- World clocks: explicit versus unrelated saves, newer drafts during saved
  completion, order conflicts, live-read ordering, removal/reorder focus and
  obsolete row handlers. Ordinary Settings keyboard and stale-save tests remain
  included because the correction is in their shared Options script.

No new Countdown or Focus defect was established by this bounded audit; their
existing regression evidence is not a new exhaustive acceptance. No additional
Countdown/Focus adversarial tests were introduced here. Native IME/datalist and
keyboard behavior, visual layout, assistive technology, real cross-tab timing,
provider behavior and platform differences were not exercised. No browser,
screenshots, Python tests, full Node suite, package or publication ran in this
work item. Integration and independent review remain separate gates.
