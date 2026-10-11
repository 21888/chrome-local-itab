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

`tests/free-drag.test.js` also covers cancellation and completed drops of fitted duplicate-URL tiles in both manual modes, with one-identity-only writes, and scrolled oversized compositions. These are Node geometry/event-model tests, not a substitute for actual Chrome painting, horizontal-scroll reachability and pointer interaction checks before release.

## 中文摘要

缩窄窗口或切换模板时，自由布局不再把右侧多个独立快捷方式挤到同一个位置。显示调整不会改写保存的坐标；再次放宽窗口会恢复原布局。原本有意重叠的组合保持相对位置，过宽组合可在快捷方式区域横向滚动查看。隐藏分类不占位，添加按钮位于显示内容下方。拖动从当前显示位置开始，取消不保存；完成拖动只保存所拖动的快捷方式。大量导入时，优先保证可访问性和有界的碰撞布局计算，必要时向下延长页面。
