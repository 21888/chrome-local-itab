# Dock category direction correction

Ordinary fix on1.1.107. Dock's category navigation explicitly sets flex-direction:row instead of inheriting column while wrapping; this addresses clipped desktop category navigation. The runtime diff is confined to one Dock-scoped CSS declaration. Other templates, permissions and manifest are unchanged.

Frozen strict serial Node2672/2672 and Python81/81 passed, focused18/18 passed. The new regression fails against the prior107 baseline; runtime comparison found only dashboard-template-gallery.css changed among112 files. Native Dock verification is pending; CSS/source tests do not establish visual, zoom, narrow-screen or complete theme/platform coverage.
