# Main-screen navigation language and quote-only skip link

2026-10-18. Baseline master `ab87cd7bfb34e5fe6f15d9cf9124fbf95b24484c`;
local source `16c1b87054eef18d8327072fc9b7fc2c7069d7bc`, equivalent tree
`7754ca9be52a35cf63817209cce0e67faab0d5ca`.

## Observed user-facing issues

In the Chinese main screen, the existing skip link and nine static region
names still used English. Dynamic controls were translated, but the surrounding
workspace, clock, search, shortcuts, cards and quote labels were not bound to
the existing localization helper.

A separate real keyboard observation on the same control found that Clarity's
quote-only view still included the skip link in its tab order. First Tab focused
`Skip to shortcuts`; Enter changed the fragment to `#shortcuts-container`,
but the target had zero layout rectangles because the main area remained
hidden. The available recovery link and Show dashboard button already provided
real actions in this view.

## Limited correction

Add the existing `data-i18n` text binding only to the standalone skip link, and
`data-i18n-aria-label` bindings to the nine original regions. Both catalogs gain
nine keys; Search reuses the existing `search` key. English HTML fallbacks,
original nodes, native fragment href, children and recovery-first order remain.
Region contents are never localized through textContent. No JavaScript,
controller, storage, schema, permissions or saved layout settings change.

One Clarity-scoped CSS rule removes the skip link from quote-only mode. Removing
that mode restores the original native link. The existing temporary Focus rule
is retained. This change does not claim to handle every other cause of an
unavailable shortcuts target, nor change other templates' visibility behavior.

## Automated verification

The new six-test file extracts the actual HTML tags and executes the real
`i18n.js` with both catalogs in the existing DOM model. On unchanged production
source, two English/fallback cases passed and four binding/Chinese/round-trip/
quote-only cases failed. After the correction:

- 137 focused Node tests passed, including existing document language, Clarity,
  field-write, recovery entry and temporary Focus checks;
- 84 Python tests passed;
- independent review ran 98 related tests successfully, verified all prior
  catalog values unchanged and nine unique new keys per catalog;
- all pre-existing tests and helpers remain byte-for-byte unchanged.

The new tests preserve exact draft values, child node identities and focus
through translation and language round trips, with zero storage/network/timer
calls. The CSS test checks the single exact scoped visibility declaration and
retention of the original normal-mode focus style and temporary Focus rule.
Model checks do not prove screen-reader speech or browser event timing.

## Real production-renderer observations

The supported dot cloud terminal/browser route served 138 frozen production
runtime files plus one external preview-only API bridge. Data was synthetic
and page-memory-only. Baseline and candidate manifests differ only in the
HTML, Clarity CSS and the two catalogs. No extension was installed.

Chinese/light quote-only mode now has no skip-link rectangle or accessibility
entry. First Tab focuses the original read-only recovery link. Workspace and
quote names are Chinese. Activating Show dashboard restores the original
skip link, translated text, all nine translated region names and all 12
synthetic sites. Native Enter uses the unchanged fragment target, which now
has a layout rectangle because the main screen is visible.

Chinese/dark at a 390-by-844px iframe viewport reports `zh-CN`, the translated
skip text and all nine region names, with content/scroll widths both 382px.
Native skip activation reaches the original shortcuts fragment. After scrolling
settles, the target is visible at y=157.015625 with all 12 site actions retained.
Scoped screenshots remain local. An attempted body-target key operation after
restoration timed out; it is not counted as a successful Tab action. The normal
link was subsequently tested through its real native Enter activation instead.

These are static-renderer keyboard/layout observations. They do not establish
screen-reader narration, native extension loading, real-profile persistence,
or resolution of the historical data-loss incident. Full exact-commit CI remains
the final delivery gate; manifest, Release and store publication stay frozen.
