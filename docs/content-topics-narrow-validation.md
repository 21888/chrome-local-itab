# Content topics narrow-layout validation

This 1.1.73 local candidate carries the Content CSS and static regression tests
from recovered snapshot `9222adc8105db10446da96df7bf7ab947112ead0`, following
the separately reconstructed 1.1.72 backup-guidance/Privacy commit. The Content
runtime and tests are unchanged from that snapshot; the version is now 1.1.73
so each proposed master release increments its direct parent's patch once.
Reconstructing the release sequence and building release assets alone do not
establish native acceptance or publication. Bounded native acceptance was
completed on 2026-10-12 as recorded below.
The separate 1.1.72 bounded backup-guidance/Privacy gate has passed; its
[acceptance record](backup-guidance-native-validation-2026-10-12.md) does not
cover this Content change.

## Static findings and change

In Settings → Content → Local Cards, the topic editor used a hard 220px grid
track floor. At a 320px viewport the intended card content budget is 214px after
the final container padding, card borders, and Settings padding. The previous
floor could not fit that budget. This is a source-level constraint finding,
not a reproduced native visual defect.

The track now uses `minmax(min(100%, 220px), 1fr)`: the preferred floor remains
220px when there is room, and contracts with the container otherwise. Topic
cards can shrink. Topic titles retain all their literal text and wrap long
unbroken strings. Rows and action groups wrap, and buttons can shrink and wrap
labels rather than pushing actions outside the available row. No text clipping,
font reduction, event-handler change, data migration, or permission change is
introduced.

## Checks completed

- Review of all 12 stylesheets linked by options.html, including load order,
  generic button rules and 960px/640px media rules.
- Static contracts cover unique topic rules across loaded CSS and reject
  unreviewed scoped topic overrides; budget calculations cover 320, 375, 640,
  768 and 960px; wide content budgets retain the 220px preferred floor.
- Targeted command: `timeout 60 node --test --test-concurrency=1 tests/content-topics-layout.test.js tests/world-clock-editor-layout.test.js tests/update-panel-layout.test.js`.
- `git diff --check`.

These are static checks, not computed-style or rendered-layout assertions.
Other Settings sections can have separate intrinsic-size constraints.

## Bounded native acceptance — 2026-10-12

Chrome for Testing loaded 1.1.73 from the fixed synthetic runtime directory.
The tested canonical runtime ZIP SHA-256 is
`ccb925124d0eb253c9501da071ed4b12f5e2651bff73e214b4465b52d53ed90c`.
This documentation-only update does not change those runtime bytes, tests or CI.

Completed scope, using English UI, Clarity and synthetic local topics:

- Baidu long continuous ASCII and URL-like titles in light appearance at actual
  320, 375, 640, 768 and 960 CSS-pixel responsive viewports, plus desktop.
  Full titles wrapped without related horizontal clipping. Edit/Delete stayed
  inside the cards and reachable; desktop retained side-by-side actions where
  space permitted.
- At 320px, Baidu Edit opened the title prompt; Escape canceled it and preserved
  the original title. Keyboard group selection visited Baidu, Weibo and Zhihu,
  including initially empty group panels.
- Weibo: keyboard Tab/input/Add created a short synthetic title with score 42;
  Edit confirmed a changed title and score. Canceling Delete retained the item;
  confirming Delete removed it. Zhihu keyboard Add created a short synthetic
  title with score 7.
- Save Settings succeeded. After a real page reload, Baidu long titles remained,
  Weibo stayed empty after deletion and the Zhihu synthetic item remained.
- Clarity dark was selected through Appearance, saved and preserved after reload.
  Baidu long titles/actions fit at desktop and 320px; the saved Zhihu item and
  empty Weibo list also fit at 320px.
- The coordinating reviewer inspected the key 320px light and desktop dark
  native screenshots. Screenshots remain local and are not uploaded or included
  as release assets. The 1188×848 browser-window capture size is not a claim
  that every responsive CSS viewport used that size.

This clears only the tested Content-layout scope. Chinese UI and CJK titles
were not covered, nor were dark appearance at the intermediate widths or a full
cross-product of every group, title, width, appearance and interaction. It is
not a claim of full-matrix, all-language or live-provider acceptance.

## Known limitation

The Clarity light appearance has a pre-existing low-contrast Delete control.
This candidate changes wrapping and sizing, not colors; reaching the control
in these checks does not establish adequate contrast. The contrast issue is
tracked for a separate fix and is not claimed resolved by 1.1.73.
