# Navigation light-surface contrast — development validation

This ordinary fix retains manifest1.1.92, without publication. It adjusts only
light navigation muted text (#626e82) and focus (#6682f6) colors on the existing
surfaces. Dark colors, opener and disabled styling remain unchanged.

Frozen source passed2474 Node tests,64 Python tests and exact112-file packaging.
CSS-derived sRGB calculations cover declared opaque palette pairs, including
the selected-card surface: muted text reaches approximately4.545:1 and focus approximately
3.040:1. These are scoped computed checks, not measured native pixels or complete
WCAG certification across every browser, background, state or theme.

Native representative readability/focus verification is pending. No new runtime
files, permissions, storage or network behavior are introduced. Formal release
remains gated on bounded native verification and final identity checks.
