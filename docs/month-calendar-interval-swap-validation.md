# Date interval swap validation

## Scope — 2026-10-17

**Swap dates** / **交换日期** exchanges the two current raw Start/End strings,
including empty, invalid and whitespace-containing drafts. It clears interval
validation, result and copy feedback. It does not parse, normalize, calculate,
change the viewed month or its year/month draft, move focus, save or sync data.
A new explicit calculation is required before another result can be copied.
The existing wrapping button layout is reused; there are no new permissions,
settings, schema, timers, network calls or clipboard operations.

Activation requires the current clock owner and calendar view, an open visible
calendar and interval, and both usable date fields. Hidden, inert, aria-hidden,
disabled, detached, moved or superseded controls, hidden/departing pages, IME
composition, handled/repeated clicks and double-click continuations are rejected.
Fresh Enter/Space retain native button activation; repeated/composing keydowns
are prevented. A later separate click can swap back. Existing Escape behavior
still closes the calendar and returns focus to its visible summary.

Swapping invalidates the copy feedback session, including settled feedback, but
cannot cancel an already-issued system clipboard write. Its existing global
one-in-flight lock survives swapping back, recalculation, calendar rebuilding
and clock replacement until the actual Promise settles. Late completion cannot
revive the invalidated feedback or move focus.

## Synthetic regression coverage

Twelve added tests in `tests/month-calendar-interval-copy.test.js` reuse its
existing bounded DOM/event/clipboard harness without changing prior assertions:

- English, Simplified Chinese and missing-key fallback; stable native buttons.
- Exact early-year/leap/identical/invalid/empty/whitespace/Unicode text exchange;
  throwing parser/calculation stubs prove swapping does not invoke arithmetic.
- Clearing validation/result/copy state while preserving the independent month
  error, announcement, browsed month and raw year/month draft.
- Required explicit recalculation, then copying the newly reversed result.
- Double-click suppression, later deliberate reversal, composing/held-key guards
  and all three independent year/start/end IME inputs.
- Unusable fields/ancestors, folding, hidden/departing pages, moved controls,
  connected superseded views and old clock owners.
- Pending and settled clipboard success/failure, identical-value swaps,
  swap-back/rebuild/remount lock retention, late settlement and explicit retry.
- No focus theft, no global keyboard handler, existing Escape and dashboard
  routing, unchanged clock timer, ticks/config/locale updates and blocked I/O.

Focused test command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-reporter=tap \
  tests/*clock*.test.js tests/month-calendar*.test.js \
  tests/dashboard-customization.test.js tests/dashboard-customization-contrast.test.js
```

All **290 tests in 17 files passed**, with no failures or skips. Both changed
JavaScript files passed syntax checks; both changed locale JSON files parsed.
This is not a full-project or scale pass. The existing CI gate remains unchanged.

An independent reviewer also ran **115/115** calendar/locale checks, including
eight separate modeled cases for long raw drafts, independent month errors,
reparented controls, swap/locale/edit ordering during unresolved copies, and
close/reopen cleanup. These overlap the focused suite and are not added to its
count. Python packaging/release checks passed **84/84**. A newly built runtime
ZIP matched its source on verification: **133 files**, SHA-256
`7a03c702baab6720d8d0640b7b7c9514f5314ab25fd6964555e149863aa8a335`.
Manifest remains 1.1.155. No remote CI or publication is claimed by these local
results.

## Limits and privacy

These are source and synthetic model checks, not Chrome trusted activation,
native held-key/IME ordering, actual OS clipboard, assistive technology or visual
layout/zoom/contrast acceptance. No new browser run or screenshot was produced;
older calendar screenshots predate this control. All test strings are synthetic.
Swapping is local and does not itself copy anything. Dates later copied explicitly
may be retained or synced by the operating system as described in the calendar
guide.
