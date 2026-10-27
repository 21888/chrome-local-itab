# Narrow-window Free layout

Free layout (both manual snapped and fully free placement) fits saved shortcuts for the current visible category when the window or dashboard template changes.

- Separate shortcuts that previously sat beyond the right edge no longer collapse onto the same visible position. Existing in-bounds compositions stay in place; displaced compositions move down if needed, with 16px clearance.
- Intentionally overlapping tiles stay together with their relative coordinates unchanged. A connected composition wider than the canvas has a local horizontal scrollbar, so its right-hand tiles remain reachable. Extremely wide compositions are not scaled or broken apart.
- Fitting only changes the page presentation. It does not write, round or replace saved coordinates, including per-identity coordinates for repeated URLs. Widening the canvas restores the saved geometry.
- Hidden categories do not reserve space. The Add shortcut tile remains below the displayed content.
- Dragging starts from the tile's displayed position. Cancel, pointer cancellation and lost capture return to that displayed position without saving. A completed drag saves only the dragged shortcut. Manual snapped placement still snaps the completed drop; temporary narrow-window fitting itself does not rewrite or snap the saved arrangement.

For large imports, source-overlap lookup uses spatial buckets and shared composition identities. Collision-placement work has a fixed comparison budget; after it is exhausted, remaining displaced compositions are appended below the current content. The resulting tall page favors reachable shortcuts and bounded fitting time over a compact arrangement. Source-overlap lookup assumes normal rendered shortcut dimensions; unusually enormous synthetic tile dimensions can still degrade bucket performance.

## Verification

`tests/free-layout-fitting.test.js` exercises the production geometry helper and rendering entrypoint: the reported 600/800px collision on a 288px canvas, collision chains, mixed sizes, negative and fractional source positions, intentional overlap compositions, deterministic repeated fitting, multiple widths and exact wide restoration, repeated URLs with identity/category maps, hidden items, Add placement and 20,000-tile dispersed/dense inputs. Seeded property checks reject newly introduced intersections and changes to intentional-overlap offsets.

`tests/free-drag.test.js` also covers cancellation and completed drops of fitted duplicate-URL tiles in both manual modes, with one-identity-only writes, and scrolled oversized compositions. These are Node geometry/event-model tests. The bounded Chrome check below adds actual pointer/persistence coverage, but does not validate oversized-composition horizontal scrolling or mid-gesture cancellation.

## 中文摘要

缩窄窗口或切换模板时，自由布局不再把右侧多个独立快捷方式挤到同一个位置。显示调整不会改写保存的坐标；再次放宽窗口会恢复原布局。原本有意重叠的组合保持相对位置，过宽组合可在快捷方式区域横向滚动查看。隐藏分类不占位，添加按钮位于显示内容下方。拖动从当前显示位置开始，取消不保存；完成拖动只保存所拖动的快捷方式。大量导入时，优先保证可访问性和有界的碰撞布局计算，必要时向下延长页面。


## Bounded Chrome acceptance — 2026-10-27

A full-page loopback fixture used the exact 138 runtime files from `c90ed204e9e2deeef8f1e14f3f719c82d6bf7000`, actual StorageManager/LayoutController and a synthetic Chrome storage bridge. Three validated identity-bearing shortcuts included two identical URLs. External opening/fetching was refused. This was not an installed-extension upgrade or user-data import test.

- At 1180 CSS pixels, dragging A from `(40,20)` to `(180,20)` produced one verified write; reload retained it. Other identities and category positions stayed unchanged.
- Native Chrome 200% zoom narrowed the CSS viewport to 590 pixels (`clientWidth` 582). B's saved x=600 was displayed at x=474.203125 without another write. Dragging it left by 100 saved x=374.203125, starting from its displayed position rather than the off-screen saved coordinate.
- Returning to 100% zoom and switching All → Work → All preserved separate category geometry. Default → second workspace → Default preserved edited positions and the second workspace's distinct Grid/cards.
- Explicit Manual snap-to-grid selection saved the mode without rounding existing coordinates. A subsequent drag snapped A to `(0,0)`; reload retained that and B's fractional position.
- Six writes were observed: three completed drags, two workspace-registry selections and one mode selection. Shortcut URL/title/icon/category/identity values, target Tasks/Focus/Note/Countdown, global Privacy/Sync/Prompts/Collections and the other workspace bundle stayed equal. Registry changes were expected; this is not a zero-write claim. No site was opened.

The complete free-drag/fitting model files passed **40/40**. Native mid-gesture Escape, lost capture, OS cancellation, screen readers and oversized overlapping compositions with local horizontal scrolling remain unverified here. The narrow condition was browser zoom, not a physical mobile device or resized-window claim. No production defect was demonstrated and no runtime change was made.

The owned browser tab and server/Terminal tab were closed normally after restoring 100% zoom. Local readback/log evidence is retained, not uploaded. This acceptance does not resolve the earlier upgrade/import incident or change the Release/CWS gate.
