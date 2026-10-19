# Manual-topic title/score separation

2026-10-19. Baseline: `02d62171a0f574f3c85276870c7ec4a64ab4b71d`.

Actual cloud-browser topic editing showed the title and number touching, for
example `Edited first 中文43`. The two stored/displayed strings were correct,
but adjacent inline spans had no visual separation in Settings. The preserved
pre-fix screenshot and runtime hashes come from the preceding row-focus GREEN.

The correction is one Settings CSS declaration: `.topic-score` gains
`margin-inline-start: var(--spacing-sm)`, using the existing 12px token. It does
not insert a separator into either string, alter numeric formatting, change
row actions, add truncation or modify dashboard topic styling. Existing title
wrapping and responsive action layout remain.

The original three layout tests are byte-for-byte preserved. One appended
static test checks the complete loaded stylesheet list for the score rule,
locks its single logical-gap declaration, and verifies the unchanged literal
title/number DOM construction. Baseline failed the absent-rule assertion;
candidate passes all four. The new spacing-token expectation was corrected
from an initial assumed 8px to the actual existing 12px definition before GREEN.
This is a static contract, not proof of rendered geometry.

Related topic-layout, localization/action and field-label regressions passed
79 tests; Python passed 84. Independent review and a separate four-test run
passed. Production JavaScript, HTML and catalogs are unchanged. The unchanged
full exact-source CI remains the delivery gate.

The 05:54–05:55 UTC production-renderer check in the dot cloud browser passed:
- English/light, 1167px document: `Synthetic title42 中文` and score `43`
  retain their exact text; the measured inline gap is 12px and document
  scroll/client widths are both 1167px.
- Chinese/dark, 390×844 CSS-pixel iframe: a long repeated Chinese title remains
  complete across wrapped lines; score `43` wraps to its own separated line.
  Edit/Delete remain visible beside the text, without overlap; document
  scroll/client widths are both 375px. The first screenshot preceded scrolling
  to the row; the subsequent visible-row screenshot is the visual evidence.
- Add was activated with Enter in both checks. The frozen 138-file runtime
  manifest differs from the baseline only in `options.css`. The preview service
  was stopped after the check.

Screenshots are local only. The preview uses synthetic page-memory Chrome APIs
and production rendering, not an installed extension or durable user profile.
This change provides no new evidence of historical upgrade safety.

## Full-CI compatibility correction

The first exact-source CI (`39207213988`, source `8932cbba`) ran 16,657 Node
tests: 16,656 passed and the passive subscription-guide preservation test failed.
That earlier test froze the first 42,422 bytes and the entire Options stylesheet,
including unrelated topic rows. The added four-line score rule changed those
hashes; the guide, permissions, network behavior and its own styling did not
change. Python/build were skipped after the Node failure. The complete failing
case and a separate local reproduction are retained.

The compatibility correction leaves production CSS unchanged. The one existing
preservation case now removes exactly one byte-for-byte score-spacing block
before checking the same historical prefix and full-file hashes. It rejects a
missing or duplicated block. All other file hashes, permission code boundaries,
manifest permissions, safe links, no-network checks and passive real-startup
tests remain. No fixture hash is updated. A new negative test proves that an
unrelated spacing token edit, an added subscription-guide hiding rule, a second
score block or an extra score declaration still fails. The separate topic CSS
test also continues to require the unique single-declaration rule.

All 86 combined topic and passive-guide checks pass after this test-only
correction. The same production bytes were already visually verified above;
the repaired commit still requires its own complete exact-source CI.
