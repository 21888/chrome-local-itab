# Manual-topic row focus after editing

2026-10-19. Baseline: `d24a7f4205323d48ad0feea3897d1372a1024212`.

## Actual baseline and cause

In the synthetic static production renderer in cloud Chrome, keyboard Enter
on Add created the requested literal topic and score. Cancelling the existing
title prompt preserved both the row and its Edit focus. Accepting a new title
and score displayed the correct edited row and success message, but focus
became `BODY`. Confirmed deletion of only that added synthetic row also left
focus on `BODY`.

The existing persistence helper replaces the selected topic list synchronously
to show the accepted draft before its queued write finishes. This detaches the
action button and loses keyboard focus. No lost topic data was observed.

## Correction and boundaries

Only the existing Edit/Delete event callbacks receive a focus wrapper. The
original row-ownership check still gates the action. If that action owned focus,
the row was replaced, focus is now `BODY`, and its original list remains
connected and visible in its section, focus moves to the replacement Edit
button. After removal, that is the following row, otherwise the preceding row;
an empty list uses its title input. It never chooses another Delete button.

The repair runs immediately after the synchronous action, not from a save
completion. Cancellation keeps the original row/button. Another input's focus
is never reclaimed. Prompts, confirmation, score parsing (including the
existing cancelled-score behavior), draft rendering, queueing, storage paths,
CAS, error reporting and recovery protocols are unchanged.

## Automated evidence

Fourteen tests are appended to the existing production/real-Store fixture.
Every byte of its previous 55 tests and helpers is preserved. The unchanged
production failed ten new focus assertions and passed the other 59 cases;
the candidate passes all 69. New English/Chinese cases cover:

- an accepted Edit focuses its replacement before a deferred real storage
  write settles; later success or rejection preserves a newer unrelated focus;
- success writes only the existing hot configuration path once, while a
  rejected write leaves the complete original raw data unchanged;
- deleting the first, last or only row selects the next Edit, preceding Edit
  or title input, with the exact remaining rows and a single write;
- title cancellation and declined deletion keep their original action focus,
  row and raw data with zero writes;
- unfocused row callbacks do not take an unrelated draft's focus.

Related topic-label, stale-save, keyboard, category-localization and category-row
focus tests passed 159 tests. The full Python suite passed 84 tests. Syntax and
diff-whitespace checks passed. Existing cancellation, detached-row, uncertain
write, conflict, localization and newer-draft tests are unchanged. Model
key events are not evidence of native held-key or screen-reader behavior.
The unchanged full exact-source CI remains the delivery gate.

Independent source review and a separate run of the complete 69-case topic
suite passed before the browser GREEN.

## Actual rendered GREEN

At 05:35–05:37 UTC, the frozen candidate's 138 runtime hashes differed from
baseline only in `options.js`. Two synthetic Baidu topics were added using
Enter and Space. The existing Edit button was clicked through the native tab
interface; the actual title and score prompts accepted `Edited first 中文`
and `43`. The original second topic remained unchanged. Read-only DOM and AX
showed focus on the replacement first Edit, visible at y=160.84–194.03px.

Confirming deletion of the edited first topic retained `Synthetic second`
and focused its Edit button at y=161.73–194.92px. Confirming removal of that
last added row left an empty list and visibly focused `baidu-topic-title`
at y=229.33–280.92px. The original five category names remained unchanged.
All prompt/confirm dialogs were closed afterward, and the preview service was
stopped before releasing the shared desktop.

These GREEN actions used real native JavaScript dialogs with synthetic data;
row actions used native clicks and Add used locator keyboard activation. They
are not a native held-key repetition test. Last-of-several deletion, cancellation
after the fix, other languages and delayed storage failures are regression
tests, not additional claimed browser observations in this run.

## Browser fixture limits

All browser data is synthetic and page-memory-only through the existing explicit
Chrome API bridge. Native JavaScript prompts/confirmation are not substituted.
One edit key action and one delete click reported tool timeouts after the real
dialogs had opened; dialog state was inspected before continuing, and neither
action was blindly repeated. A native Edit click explicitly reported prompt
interruption and likewise was not retried. The initial all-status DOM read
included hidden template text; subsequent observations filter visible notices.
Hidden error templates are not reported as actual displayed errors.

This workflow is not an installed-extension, durable-profile or historical
upgrade test. It does not establish the cause or resolution of the historical
data-loss incident. Screenshots stay local and no store/release publication is
part of this correction.
