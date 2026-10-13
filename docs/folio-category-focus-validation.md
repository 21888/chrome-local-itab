# Folio category focus padding

Ordinary fix on1.1.107 after the Dock direction correction. Folio category buttons reserve stable6px inline padding so the existing inset focus outline does not cover the rightmost category count. The observed issue was visual overlap; Enter activation already worked. This does not change shared focus styling, other templates or keyboard behavior.

Frozen strict serial Node2674/2674 and Python81/81 passed. Related targeted tests passed; applying the new assertion to the old CSS fails as expected. Independent source review found no blocker.112-file runtime comparison changes only the Folio-scoped CSS declaration versus the Dock parent, keeping manifest and permissions unchanged.

Limited native Folio recheck passed in light/dark at1188×848 bound-window screenshot dimensions, not DOM-measured viewport: first All/count14 and last qa remaining/count2 had visible space inside complete focus outlines. Tab/ShiftTab kept positions stable and Enter activated correctly. No three-digit or narrow-window coverage. CSS/model regressions alone do not prove narrow-screen, zoom, full-theme or accessibility conformance.
