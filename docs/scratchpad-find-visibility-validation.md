# Scratchpad Find: reveal the selected match — 2026-10-19

## Reproduced user-visible defect

The baseline is master `b523e016c15a39cbd977603ae743dbb132f395f7`, tree
`c07287a55e9b4b3f2e700b7244dc96a23eaa4cdf`. Its
[exact-source CI](https://github.com/21888/chrome-local-itab/actions/runs/39183390238)
passed 16,589 Node tests and 84 Python tests. Passing those tests did not establish
native textarea scrolling.

Cloud Chrome loaded the production renderer in a local 390 × 844 CSS-pixel
iframe, with an explicitly injected synthetic, page-memory-only Chrome API
bridge. The English/light fixture contained 779 characters on three logical
lines, with twelve `narrow-column` occurrences and substantial soft wrapping.
Find selected the first occurrence at offsets 79–92 and reported **Match 1 of
12**, but the textarea retained `scrollTop = 294` (`clientHeight = 178`,
`scrollHeight = 472`). The first match was outside the visible editor. Previous
to the last match and Next back to the first reproduced the stale scroll offset.
Scoped screenshots, DOM geometry and the selected offsets were retained locally.

A first experiment selected before focusing. It made the first match visible,
but a subsequent last-match selection stayed at scroll zero and was still not
visible. It also failed 19 existing ordering assertions. That experiment was
rejected and restored byte-for-byte; none of those old assertions or helpers was
changed to accept it. Its failing logs and browser records were preserved.

## Minimal production change

The existing focus-then-selection sequence remains intact. After a current,
successful selection, Find measures the unchanged draft in a transient hidden,
`aria-hidden` mirror using the editor's computed typography, wrapping, padding
and client width. A native text Range supplies the selected rectangles. Find
adjusts only the textarea's vertical scroll position; if a match is taller than
the viewport, it reveals the beginning. A guarded nearest/instant
`scrollIntoView` also reveals the editor in ancestor scrollports.

The mirror uses a plain Text node, not HTML. It is removed in `finally`, including
stale-source and exception paths. Current source, draft, query, selection and
focus checks surround the work and publication of match feedback. Geometry that
fails or loses ownership cannot publish a stale success or steal newer focus.
The original editor value and undo stack are not assigned or replaced. There is
no new persistent state, schema, controller, storage/network operation, listener,
timer, stylesheet or permission. Existing ownership and zero-I/O assertions remain
unchanged. Older DOM models without native geometry APIs retain their existing
selection behavior; the new model supplies explicit rectangles separately.

API references: [textarea selection](https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/setSelectionRange),
[Range rectangles](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects),
[nearest scrolling](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView).
Selection alone is not treated as proof that its text is visible.

## Real renderer checks after the fix

All 138 runtime inputs were hash-compared against the baseline. Only
`shared/local-scratchpad-view.js` changed. The tested file's SHA-256 was
`25dec79d010b1986708c0d7a0d7f5dfb6cc1dfc6f7f6c743b43006007f5d2c06`.
The preview bridge, synthetic seeds and other preview inputs were separately
frozen; they are not extension runtime files.

- **English/light, 390 pixels:** first match 79–92 became visibly highlighted at
  scroll 46; last match 739–752 became visible at scroll 292. Next wrapped to the
  first match at scroll 46 with the correct count and editor focus.
- **Chinese/dark, 390 pixels:** native Space on Previous selected the final
  `窄列排版` occurrence, 205–209, at scroll 115 with the localized 14-of-14 count.
  Enter on Next wrapped to the first occurrence, 23–27, at scroll 46. Both
  highlights were inspected in scoped screenshots.
- A missing query produced the localized no-match message without changing the
  preceding Chinese selection or scroll position. Escape closed Find and
  returned focus to its opener in both languages.
- Three captured complete editor strings were compared exactly with their
  synthetic seeds: English 779 characters and Chinese 213 characters twice.
  All matched; the logical-line count stayed three and no mirror remained.

These are actual Chrome renderer, keyboard, focus, geometry and painting checks.
They are not an installed-extension test, a raw-storage audit, real profile data,
or proof of upgrade preservation. They do not establish OS IME, held physical
keys, assistive-technology announcements, every font/viewport, or full theme
coverage. The historical upgrade incident and release/store gates remain open.
Screenshots stay local and are not included in this commit.

## Regression tests and review

The two initial geometry tests failed against the unchanged baseline. The final
new test file covers visible first/last matches without editing or saving;
query/focus changes and throwing geometry with mirror cleanup; and a match taller
than the editor. Existing tests and helpers are byte-for-byte unchanged.

- Initial fixed Find-focused run: **273/273**, before the third new test was added.
- Nine focused files covering Find, View, Store, boundaries, line count and text
  copying: **539/539**, also before the third new test.
- Final new visibility file: **3/3**.
- Independent read-only source/test review and a fresh
  `node --test tests/local-scratchpad-find*.test.js`: **274/274**. The reviewer also
  inspected the Chinese final-match screenshot and complete editor snapshots.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **84/84**.
  An earlier incorrect `test_*.py` pattern selected zero tests and is not counted
  as validation. Syntax and `git diff --check` passed.

These overlapping runs are not summed into a unique-test total. The new model
rectangles are not substituted for the real browser evidence above. The normal
unchanged complete GitHub CI remains the delivery gate for the exact new commit.

See [Find usage](local-scratchpad.en.md) and the earlier
[match-position model scope](scratchpad-match-position-validation.md).
