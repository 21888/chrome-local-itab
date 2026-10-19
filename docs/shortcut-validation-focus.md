# Shortcut validation focus and error association

Submitting an invalid Add/Edit shortcut now focuses its first invalid field, in
title-then-URL order. The existing error text is associated with its field through
`aria-describedby`; `aria-invalid` follows synchronous input validation and is
reset when feedback is cleared. The existing title limit, URL policy, trimming,
normalization, drafts and storage transactions are unchanged.

Focus moves only during synchronous form validation while focus belongs to the
current editor. Ordinary error display, including a later failed storage write,
does not redirect focus or mark an otherwise valid URL as invalid. Nothing
submits automatically or discards a field.

## Actual baseline

On 2026-10-19, the exact production renderer from master `42dd6aa` was opened in
dot-cloud Chrome with a 390 × 844 CSS-pixel iframe. A separate explicit local API
bridge supplied only synthetic page-memory data. This was a static renderer, not
an installed extension or real-profile persistence test.

Keyboard Save on the empty form kept focus on Save. The modal had scrolled to
121px; its first invalid title input had a viewport top of -5.3125px, partly
outside the modal's 16px top boundary. Neither field had an invalid attribute or
an error-description association. The real visible messages still appeared, and
no claim is made about an actual screen-reader announcement.

An unsafe `javascript:` URL was correctly rejected without clearing the draft.
A safe synthetic item with literal `<note> & 台账`, a text emoji and a scheme-less
example.com URL saved normally. Reopening showed the trimmed title/icon and
HTTPS-normalized URL. Escape cancelled a later rename and returned to its menu
trigger. Confirmed deletion and explicit Undo restored that synthetic item to the
last position and restored the 13-shortcut count; the final state was awaited
after the intermediate Saving state. These existing behaviors are retained.

## Regression scope

The new focused tests cover empty/both-invalid forms, a title over the existing
limit, unsafe URLs, partial correction, valid correction with exactly one write,
all four exact raw draft fields, unchanged saved records, feedback reset,
closed-editor focus protection and a real deferred failed save with newer focus.
Static checks verify the actual production markup's unique error associations.
The DOM model cannot establish native scroll geometry or assistive-technology
announcements; browser verification is recorded separately.

The final new-test RED was 9 failing and 1 passing test against the original
runtime; the candidate passes all 10. An earlier new-test run did not report
individual results. A subsequent readable run exposed two mistakes in the new
test setup: attempting to focus an inert background search field. The closed
editor case now closes normally before focusing that field; the late-write case
focuses the still-available icon field. Neither uses private focus-state writes.
Those preliminary logs are retained, not counted as valid coverage.

The first combined regression found five older fixture factories that represented
inputs as plain objects without `setAttribute`. They failed during normal modal
initialization before reaching their existing assertions. The factories in
`shortcut-delete-session`, `shortcut-favicon-session`, `shortcut-reload-guard`,
`shortcut-save-session` and `shortcut-storage-rejection` now implement string-valued
attribute storage and `getAttribute`. Removing only those factory additions makes
each file byte-identical to its prior version. All old test bodies, assertions and
shared helpers are unchanged; production code does not bypass the attribute API.
The complete focused shortcut/dialog set passes 384 tests, and Python passes 84.

## Actual candidate verification

The same cloud Chrome route ran the final candidate at 03:52–03:54 UTC. The frozen
138-file runtime differs from the baseline only in `newtab.js` (SHA-256
`4573d80803722308911a5a45119e385f97bdefaf9f50eaad2343e871f60f671b`).

- English/light: keyboard Save on an empty form focused Title. Its full rectangle
  was now 16.6875–58.296875px inside the modal, with the error at 70.015625–90.40625px.
  Both fields exposed their correct error IDs and `aria-invalid=true`.
- After correcting only Title and entering an unsafe URL, keyboard Save focused
  URL. The URL and its error were fully visible at 71.46875–145.1875px; the exact
  spaced title draft remained and its invalid state reset to false. Correcting
  the URL saved successfully, closed the dialog and displayed 13 shortcuts.
- Chinese/dark: native Space on Save focused 标题, with both localized errors and
  invalid attributes present. The input rectangle was 20.6875–62.296875px and its
  error 74.015625–94.40625px. The document had equal 382px client/scroll widths.
  Ordinary Escape closed the dialog and returned focus to 添加快捷方式.

The first English candidate screenshot also captured the outer test wrapper's
scroll offset; it is not used to claim the complete field was visible in the
outer screenshot. A normal scroll over the wrapper restored its top before the
English URL and Chinese title images. Frame-relative measurements above are
reported independently of that wrapper. No production scroll script was run.

The shared desktop was released and preview service stopped. Images remain
local. Native screen-reader speech, real extension persistence, cross-tab writes,
other operating systems and historical upgrade recovery are outside this check.
