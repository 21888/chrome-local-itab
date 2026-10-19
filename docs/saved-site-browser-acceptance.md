# Saved-site workflow browser acceptance — 2026-10-19

## Tested source and environment

These checks use the production renderer from master
`8a61fe00e6c3f016c029aaed5adf0a65018fce7c`, tree
`90c920f8ea4087d0a6f1969f857d78600f5b25a4`. All 138 runtime hashes match that
commit's [successful exact-source CI run](https://github.com/21888/chrome-local-itab/actions/runs/39179968299).
The runtime ZIP SHA-256 is
`f80f906033c50a04cb1f26b91fd4fa61f74773fec76de89f93af072295e8d81b`.
No production code was changed for these checks.

Cloud Chrome loads a local static renderer with a separately injected synthetic,
page-memory-only Chrome API bridge. The fixture contains 12 synthetic saved sites
and five categories in the default workspace. Native keyboard input and DOM/AX
observations are used for the interactions below. The narrow case is a 390 × 844
CSS-pixel iframe; its document client width is 382 pixels with the scrollbar.

## Finder

Chinese/dark, narrow viewport:

- Opening **Find saved sites** focuses its query field. A nonmatching English
  query shows the empty-results message without changing the category control.
- Clearing the query and choosing **Work (3)** shows the three matching sites,
  including a long Chinese title. The panel client and scroll widths are both
  356 pixels; its internal vertical scroll range remains usable.
- ArrowUp from the query focuses the last result and scrolls it into view. Tab
  reaches that result's separate Copy URL button; another Tab wraps to the first
  workspace selector inside the dialog. No copy is performed in this check.
- Escape closes the dialog and restores the original Finder opener. The main
  screen still displays its original 12-site heading.

English/light, desktop viewport:

- `/` from the Finder opener opens the existing dialog and focuses its query.
- **All words** with `Project Work` matches **Project Notes** in category **Work**,
  exercising matching across the title and category fields.
- Switching to **All workspaces** retains the query and match mode. The result
  names its Default workspace. Only one synthetic workspace exists in this
  fixture, so this is not multi-workspace result-completeness evidence.
- **Clear** resets query, category and match mode, focuses the query, and keeps
  the explicitly selected All workspaces scope. Close restores the opener;
  reopening starts with Current workspace, an empty query and Continuous phrase.

These exercised flows passed without requiring a production change. Scoped
screenshots were inspected locally for layout only; AX and DOM records establish
the keyboard-focus observations. No screenshots were uploaded.

## Organizer

Chinese/dark in the same 390 × 844 frame:

- After the saved-site snapshot loads, choose **Work** as the destination and
  search for `设计`. Native Enter on **Select current matches (1)** selects
  **设计参考** and hands focus to the now-enabled deselection button.
- Replacing the query with `项目` hides that selected site. The count reports one
  selected and one hidden-selected record. The visible **项目笔记** checkbox is
  disabled because it already belongs to Work. The panel client and scroll widths
  are both 342 pixels; document client and scroll widths are both 382 pixels.
- Native Enter on **Review move** displays the hidden **设计参考** record, its
  original `https://example.com/synthetic-2` URL, source `social`, and destination
  Work. The reviewed count remains one.
- **Back** restores query `项目`, destination `work`, the hidden selection and
  search-field focus. **Cancel** closes the organizer and restores its opener;
  the original 12-site heading remains visible.

This run checked selection, review, Back and Cancel only. It did not submit a
move, compare full stored snapshots, inject a storage failure, exercise the
retry path, or verify an actual cross-category write. Exact-label automation
selectors did not match the nested destination select; the successful run used
the existing unique `.organizer-panel select` native control. These locator
attempts are not counted as passing interaction checks or product defects.

## Limits

This is static production-renderer acceptance, not an installed-extension or
real-profile test. It does not establish real Chrome storage persistence, actual
settings saving, cross-tab concurrency, extension upgrade safety, screen-reader
speech, system IME behavior, or all viewport/theme/language combinations. The
Finder run did not activate a website or read/write the system clipboard.
The example.com seeds did not exercise built-in catalog-use/alias matching.
Historical tests and their limits remain separate evidence.

The bilingual Finder guides now also describe the already-existing built-in
use/alias search fields, which their older summaries omitted. The unchanged
`tests/shortcut-finder-catalog-use.test.js` suite passed 8/8 when checking that
documentation against production behavior; this is model evidence, separate
from the browser flows above. No new search behavior or catalog data was added.

Release and Chrome Web Store publication remain subject to the unresolved
real-upgrade data-preservation investigation. The manifest stays at 1.1.155.
