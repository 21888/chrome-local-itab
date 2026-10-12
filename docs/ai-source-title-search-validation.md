# AI source-title search — development validation

This ordinary feature retains manifest 1.1.88 and does not publish a release.
The six implementation files match the frozen source that passed 2409 Node,
64 Python and 30 focused tests. Search filters displayed source titles locally;
selection and temporary excerpt edits remain independent of visibility.

## Bounded native checks — 2026-10-12

Independent Chrome for Testing 155.0.8059.39 Chinese synthetic profile loaded
112 runtime files with development ZIP SHA-256
`8a1f2266df044a453adc297d6bf41c95954668d9f649fdcada312fd45c69c35a`.
This differs from published 1.1.88; these observations do not claim that the
published version contains title search. This docs-only update preserves bytes.

Using one existing synthetic source and ASCII input:

- Blank search showed 1/1, selected0, hidden0. Uppercase ALPHA matched its
  lowercase title. Search-only Escape closed without dirty confirmation and
  returned opener focus. Reopening reset the search.
- Selecting the source showed original49 characters and full prompt420.
  Temporarily editing its send excerpt to alpha showed5 and total376. Query zzz
  hid the row while selected1/hidden1 and total376 remained; no-match/help appeared.
- Keyboard clear (Tab then Enter) restored blank search and visible search focus,
  revealing the still-selected edited source. Search did not enter the budget.
- Escape confirmation Cancel retained the edited draft. Cancel/Clear reset
  search/selection/hidden counts and total279. A later selection restored the
  original49-character excerpt rather than the discarded temporary edit.
- At 320×900 light and dark, clear control, counts, hidden-selection help,
  no-match text and budget wrapped within the panel, inspected by scrolling.
  Dark clear also returned search focus and preserved its selected source.
- Cleared the draft and restored Clarity light/Grid and fourteen saved sites.
  The original synthetic collection body/version remained unchanged.

Native coverage did not include 201-character queries, 13 sources, Unicode/CJK,
maximum lengths, retained actual request previews, provider calls or saved-data
writes. Such boundaries remain synthetic evidence. No numerical accessibility,
contrast or overflow certification, no full matrix. No provider settings,
Allow/Send, external navigation, permissions changes or published screenshots.
