# World-clock comparison copy checks

## Scope

**Copy comparison / 复制比较摘要** is an explicit button inside the existing Compare times panel. It copies the already-rendered local reference as the first line, then each current row in display order as `label · time · relative day`. It does not recalculate a time or change the comparison anchor/slider. Whitespace, Unicode labels, displayed 12/24-hour format, seconds and language are retained exactly. The row's day is relative to the displayed local reference date; no per-row absolute date or IANA identifier is added. This text is not a calendar invitation.

Only explicit button activation calls `navigator.clipboard.writeText`. Missing API, synchronous throw and rejected promises leave the displayed text available and show a local manual-selection/Ctrl/Cmd+C hint. No clipboard read, permission query, legacy `execCommand`, storage, network call, new permission or extra timer is used. The main clock and Calendar retain their existing lifecycle.

One unresolved comparison write is shared across card and ClockComponent replacements. Its button uses `aria-disabled` plus an activation guard, so pending work does not disable the focused native button. Slider edits (including same-value/ABA), exit/reentry, locale/config/render replacement, hiding/detachment and blur/pagehide/visibility changes invalidate the pending UI feedback. They cannot cancel the system write or release its lock early. A later explicit activation becomes available when that write settles. Identical fixed-preview ticks leave feedback intact; changed display text retires it. Copy observers/listeners exist only while a valid attempt is pending and are cleaned up on invalidation or settlement. Queued mutation records are checked before accepting a late outcome.

English and Simplified Chinese catalogs and English fallback cover the button, pending, success and manual-copy failure messages. The status is a separate polite live region, without turning clock values or the comparison reference into live announcements.

## Focused automated verification

The independent entry point `tests/world-clock-comparison-copy.test.js` runs the shipped ClockComponent with the real `shared/world-clocks.js` Intl implementation, controlled time, a bounded DOM model and stubbed clipboard promises. It covers:

- Comparison-only entry, no copy on render or live-mode interaction, empty/missing/hidden/detached/departing guards.
- Exact rendered text/order, Unicode and spacing; no date construction, `Date.now` read or formatter call during activation.
- English, Chinese and fallback; 12/24-hour and seconds; US DST gap/repeat, fractional zones and signed two-day date-line differences.
- Missing API, synchronous failure, rejected promise, explicit retry, independent feedback and preserved focus.
- Rapid/repeated activation, native-keydown routing and IME/229 guards; one unresolved write across card/ClockComponent replacement.
- Slider same-value/ABA edits, exit/reentry, config/locale/rebuild invalidation and unchanged comparison state.
- Pending and settled feedback surviving identical fixed-preview ticks, while the main clock keeps updating using one timer.
- Delivered/queued transient hidden, inert, aria-hidden, CSS/class and detach-return records; text/character-data changes and late success/rejection suppression.
- Blur/pagehide/visibility interruption cleanup; a real MonthCalendar integration probe preserving its viewed month, unsaved draft, announcements and the shared timer.

The existing world-clock card assertion is narrowed only to permit this separate, initially hidden copy status. Clock rows and the reference remain non-live, and passive ticks leave copy feedback empty. Existing comparison/helper tests retain their Intl/DST coverage. Existing Calculator copy tests guard its independent behavior.

Run only the named focused paths:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/world-clock-comparison-copy.test.js \
  tests/world-clock-comparison.test.js \
  tests/world-clocks-card.test.js \
  tests/world-clocks-live.test.js \
  tests/world-clocks.test.js \
  tests/local-calculator-copy-result.test.js
```

The new entry was first run against the unchanged runtime and failed because the explicit copy button did not exist. The first expanded run had 59 passes and 3 failures: the new date-line expectation was corrected to `-2 days` instead of Previous day; the existing card assertion was limited to permit only the independent copy status; and the existing direct-assignment source regex was retained, with time updates expressed as a conditional direct assignment. Timezone rules and the non-live clock/reference behavior were unchanged. Raw command/source/hash/exit evidence is retained outside the runtime/repository.

## Native verification boundary

These focused tests verify application guards, ownership, snapshot construction, real Intl results, explicit observer-record handling and cleanup. The DOM model deliberately queues text/hidden property writes; other attribute/stylesheet records are supplied explicitly. It does not implement a browser mutation scheduler, native keyboard synthesis, CSS layout or the OS clipboard. Success means the clipboard promise resolved; the implementation never reads clipboard contents back.

This change has not been checked with a native browser, a screen reader, real clipboard permissions or visual screenshots. Before claiming native acceptance, verify Enter/Space and pointer activation; focused pending-button behavior; actual copied multiline text in a separate paste target; denied/unavailable clipboard fallback and manual text selection; transient hiding/restoration and focus changes; English/Chinese narrow layouts and theme contrast. Earlier comparison screenshots cover their recorded feature/version only and do not validate this copy control. No screenshots, personal data or clipboard contents are included in these model fixtures.
