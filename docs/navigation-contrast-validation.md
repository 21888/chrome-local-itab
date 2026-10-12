# Navigation light-surface contrast — development validation

This ordinary fix retains manifest1.1.92, without publication. It adjusts only
light navigation muted text (#626e82) and focus (#6682f6) colors on the existing
surfaces. Dark colors, opener and disabled styling remain unchanged.

Frozen source passed2474 Node tests,64 Python tests and exact112-file packaging.
CSS-derived sRGB calculations cover declared opaque palette pairs, including
the selected-card surface: muted text reaches approximately4.545:1 and focus approximately
3.040:1. These are scoped computed checks, not measured native pixels or complete
WCAG certification across every browser, background, state or theme.

## Limited native verification — 2026-10-12

Independent CfT155.0.8059.39 Chinese desktop-light synthetic profile loaded
112-file development ZIP `a698faa209caa243ff03518f11f31db5280460ad130baddc44d6413f7ce5a011`.
Selected PhET/WAVE muted text, full details and headings were readable. Search,
checkbox and summary keyboard outlines were visible. Escape canceled temporary
selections; reopening showed0 selected and120/106 not added/14 added unchanged.
Default14/Clarity light/Grid restored. This is qualitative screenshot evidence,
not measured pixel contrast or fullWCAG certification. Dark/320 were not rerun.
No saves, external links, providers, new permissions or uploaded screenshots.
Computed opaque-palette ratios above remain separate evidence. Final release
identity is checked independently.
