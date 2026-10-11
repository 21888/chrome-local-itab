# Scroll-aware shortcut dragging: bounded native acceptance

2026-10-11, dot cloud Chrome for Testing, isolated synthetic shortcuts. Installed runtime version 1.1.40; tested newtab.js SHA256 `95f79e7e4761a9fa6767ec8b3cc4c3eaeda2a00a8bcddf5a6dabd0fd59638fb2`, matching the release implementation.

Observed passes:
- On a vertically scrolled desktop page, Free dragging lands at the visible pointer endpoint; manual snapped placement lands on its grid.
- At Chrome's measured responsive 240 CSS-pixel viewport, an intentional overlapping group exposes horizontal scrolling. Scrolling reveals the rightmost tile, which can then be dragged to a new position with a saved indication.
- Dark appearance was tested. Responsive CSS width is emulated, not a physical-window resize or browser zoom measurement.
- Actual native before/after exports differ only in the moved third shortcut's position, from (81,146) to (211,162), plus three export timestamps. Both other shortcut positions and every other saved payload remain exact.
- After closing and freshly reopening the page, a new native export equals the saved after-state except three export timestamps. An independent exact comparison confirmed both assertions.

Native export SHA256:
- before: a401e6ed4a7e95792b6698415a5a0f66fa15651578b872ea0dd237aabb5332b3
- after: d917d971a77c6711ce160d8e22c113f970f76ab4a5242e148cbdf96d08c7a7dd
- reopened: 9eb08900bc2a236c2f75c10ee162c545bd4dd722f8611138d7a3e19a81415557

The automation interface executes atomic drag gestures; simultaneously holding a drag and scrolling the wheel, in-flight pointer cancellation and resizing during a gesture were not established natively. Sixteen independent event-model cases cover scroll-to-release without another move, latest release endpoints, combined/nested scrolling, single-identity writes, snapping, cancellation and retired callback/listener cleanup. Whole-app resize deliberately cancels a gesture rather than preserving it. Fresh-page reopening does not establish whole-browser restart or crash durability.

Integrated automated suite: 1,756 Node and 53 Python tests pass. Screenshots and raw exports are retained separately and are not included here.
