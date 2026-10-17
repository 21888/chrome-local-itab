# Focus interval progress

## Usage

The optional Focus card now includes a native `progress` element immediately below remaining time and one line showing **Elapsed / This interval**. Chinese uses **已用 / 本阶段**, with **本阶段进度** as the progress name. Missing localization falls back to English.

- Ready starts at zero against the saved Focus or Break duration (1–180 whole minutes). A typed but unsaved 30-minute draft still shows the saved 25-minute total.
- Running progress uses the card's existing 250 ms presentation updates. Pause freezes elapsed time; Resume retains the original saved interval total even though the timer's resumed deadline changes.
- Completion stays full until the user explicitly resets or chooses the next interval. Choosing an interval does not start it.
- A pending action continues to show the current controller snapshot, rather than the requested phase or unsaved duration. Errors, uncertain timing, missing state, invalid presentation values and a retired workspace hide the entire group and clear its values, text and accessible labels. Existing error and reopen guidance stays in place.
- Progress does not add a Tab stop, live region, focus movement, animation, listener or timer. Hidden-page/card behavior uses the existing lifecycle. Destroy clears progress, and late callbacks or pending write settlement cannot revive it.

## Calculation and boundaries

Progress and remaining digits use the same snapshot already read by `View.render()`:

- Total seconds = saved duration for the current phase × 60
- Remaining seconds = `Math.ceil(session.remainingMs / 1000)`
- Elapsed seconds = total seconds − remaining seconds
- Native progress maximum = total seconds; value = elapsed seconds

The displayed elapsed and remaining seconds therefore add to the saved total. With 1 ms still remaining, a one-minute interval shows 0:59 elapsed and 0:01 remaining, never a full progress bar. The calculation does not use input drafts, `Date.now()`, `startedAt` or `deadline`.

This is a presentation enhancement. Controller, Store, persisted schema, session transitions, clock recovery, duration submission, tab-title and temporary-focus behavior are unchanged. There are no permission or release-version changes.

## Automated validation

The entry test first failed against the unchanged base because no native progress element existed. The focused candidate command is:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-focus-progress.test.js \
  tests/local-focus-view.test.js \
  tests/local-focus-duration-draft.test.js \
  tests/local-focus-localization.test.js \
  tests/local-focus-retired-workspace.test.js \
  tests/local-focus-title.test.js \
  tests/local-focus-temporary-view.test.js
```

These 85 tests cover default and custom Focus/Break durations including 1 and 180 minutes, 1001/1000/999/1/0 ms boundaries, pause/wait/resume, completion/reset/next phase, draft and external saved-state changes, pending duration/pause/phase operations, read/write and saved-but-unacknowledged errors, clock uncertainty, invalid values, one-snapshot rendering, hidden-page/card lifecycle, stable nodes/focus/coarse status, no additional storage I/O or ticker, destroy and late settlement, English/Chinese/fallback labels, and the existing real workspace retirement paths including same-ID replacement.

The suite uses the production View, Controller and Store over synthetic local storage and a deterministic DOM/event model. The progress-specific model reflects `value`/`max` attributes and their native defaults to verify cleanup; the shared model adds only basic attribute removal. This is not native browser, rendering or assistive-technology evidence. Full-suite, Python packaging and build checks are separate integration stages.

## Manual acceptance still to verify

In a disposable unpacked-extension profile with synthetic state, inspect light/dark and narrow layouts in English and Chinese. Check the native progress bar at zero, halfway and complete; test keyboard order and screen-reader access without per-second live announcements. Pause/resume and hide/show the card/page, then verify failed reads and a retired workspace remove the entire progress row. No browser screenshots or native/assistive-technology verification are claimed for this change.
