# Selected-source view — development validation

## Scope

Adds a session-only “Show selected only” native toggle button beside the existing
loaded-title search. It applies an AND condition with the title query and retains
the query when toggled. The existing counts continue to distinguish displayed,
selected and selected-but-hidden sources. Selection, edited excerpts and sending
are independent of visibility. No new source reads, storage, permissions,
provider configuration or automatic selection/deselection are introduced.

A visible pressed outline and `aria-pressed` expose state. An empty selected view
explains how to recover without automatically clearing either filter. Deselecting
a focused visible row moves focus to the next visible enabled checkbox, then the
previous one, or the toggle if none remains. Focus is captured before hiding the
row, including the browser-style case where hidden elements lose focus instantly.
Cancel / clear draft resets both view controls together with its existing draft
reset. View controls alone never make a draft dirty.

## Synthetic regression coverage

Five new actual-view/controller tests cover:

- All 201 loaded sources, zero selections, 12 selected, original DOM identity and
  order, AND title matching and selected-but-hidden counts.
- Unchanged query, temporary edits, budget, reviewed request and generation;
  no controller source reads, inspection, edit, review, send, allow or permission
  calls from view changes; no storage reads/writes or network requests.
- Next/previous/toggle focus recovery with browser-like hidden focus loss.
- 13 selections still blocking review even when every row is hidden; correcting
  to 12 includes all hidden edited selections without truncation; hidden
  unselected edits remain dirty; clear draft restores original text and filters.
- View changes during pending transport; exact hidden edited excerpt in the
  request; completed answer, reviewed request and snapshot consent/preview remain
  intact after toggling and clearing title search.

Validation commands:

- `node --test tests/ai-context-view.test.js`: 35 passed.
- `node --test tests/*.test.js`: 2414 passed, no failures/skips/cancellations.
- `python3 -m unittest discover -s tests -p '*_test.py'`: 64 passed.
- `git diff --check`: clean.

Only synthetic fixtures were used. DOM-model tests do not certify native browser
keyboard behavior, screen-reader announcements, visual layout or contrast.
Manifest remains 1.1.88; this candidate is not a release. The prepared runtime
was built and inspected separately, followed by the bounded checks below.


## Partial native verification — 2026-10-12

Independent Chrome for Testing 155.0.8059.39 Chinese synthetic profile loaded
112 files from development ZIP SHA-256
`e063a0a9b1890746efda3e3c5fa180e23fef8915c76d3e9d6c4511afb769ece2`.
Version remains 88 development, distinct from published 88. Ordinary Reload/new
tab loaded the feature; this docs-only finalization preserves its runtime bytes.

With one existing synthetic source:

- Selected-only with zero selections showed an empty view and recovery help,
  visually pressed toggle and unchanged budget279. View-only Escape closed
  without dirty confirmation; reopening reset full view.
- Selected source with a temporary alpha excerpt (5 characters) retained
  budget376 when selected-only plus zzz query hid it: shown0, selected1, hidden1.
  Keyboard clear query revealed the selected edited source, keeping the toggle.
- Space deselected the only checkbox; the row disappeared, counts cleared,
  budget returned279 and visible focus moved to the selected-only toggle.
- At 320×900 light/dark the toggle, counts, empty-state/help and budget wrapped
  within the panel. Cancel/Clear reset query, pressed state, selection and budget.
- Temporary drafts were cleared; Clarity light/Grid and fourteen saved sites
  were restored. The existing synthetic AI collection body/version was unchanged.

This is a partial native pass. Multiple-row next/previous focus, ARIA/screen-reader
semantics, 201/13/Unicode/maximum-budget cases and provider behavior were not
native-tested. Pressed appearance is visual evidence only. No new fixtures,
Allow/Send, credentials, permissions, external calls or data saves; no numerical
contrast/overflow or complete responsive certification. Screenshots remained
native tool-transcript evidence, not published attachments.
