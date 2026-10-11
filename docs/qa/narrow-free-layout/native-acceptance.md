# Narrow Free-layout native acceptance

Dot cloud Chrome for Testing, 2026-10-11. Synthetic shortcuts only. Tested newtab.js SHA256: `5b92faaed2c90ba1c62e8a84e98920c6b1f6507c10d6542205697fec16da30ca`, identical to the integrated release implementation. The loaded builder manifest was 1.1.38; the final package manifest is 1.1.39.

Observed passes:
- Chrome responsive toolbar measured a 400px CSS viewport. Previously separate right-hand tiles remain reachable and visibly separated, with Add below.
- Returning to 1188px before dragging restores the original horizontal arrangement visually.
- Dragging a fitted tile starts at its visible position; widening preserves the changed tile while restoring the untouched one.
- Light/dark appearance and narrow Add dialog with Escape work.
- At 240px CSS width, an intentional three-tile overlap composition exposes usable local horizontal scrolling. Scrolling reveals the rightmost tile/menu; dragging it after scrolling places it correctly and removes unnecessary overflow.

These are responsive emulated CSS viewport widths, not physical window measurements or zoom tests. Before/after exports were not captured; exact no-coordinate-write assertions come from automated tests. In-flight native drag cancellation, other templates, screen readers and other operating systems were not tested.

Two early Chrome error9 incidents coincided with shared executor stalls. After host recovery the same frozen code passed the checks above. Cause was not established; this is not proof of a product defect or its absence under all conditions.

Integrated suite: 1,756 Node and 53 Python tests pass. Independent geometry audit includes randomized fitting, identity/filter cases, exact restoration, scroll-aware drag/cancel and large collections. Backup acceptance uses reconstructed-store tests; it does not claim native historical upgrades.

