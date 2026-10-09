# Reorder saved sites without dragging

In **Grid** placement, focus a saved site's button and open its context menu using your keyboard's menu key or Shift+F10 (where supported), or right-click the site. Choose **Move earlier** or **Move later**. The menu uses Up/Down, Home/End, Enter/Space, and Escape.

- Moving one step follows the current visible list. A category filter skips hidden sites. Grouped templates keep the move inside the site's collection.
- At the first/last visible site, the unavailable direction is disabled. Both directions are disabled during a pending order/layout save and in Free or Manual placement.
- The moved site retains keyboard focus unless you moved focus elsewhere while saving. An editor opened during saving keeps its text and waits for the order save before enabling Save.
- Saved identities and manual coordinates are retained. The operation uses the existing guarded local shortcut transaction. If another tab changed the list, the latest list is shown instead of overwriting it; reopen the menu and try again.
- There are no new permissions, network calls, or accounts. No global hotkey is installed.

## 中文

在“网格”布局下，将焦点移到快捷方式，使用菜单键或 Shift+F10（浏览器支持时）打开右键菜单，也可以直接右键点击。选择“向前移动”或“向后移动”。菜单支持方向键、Home/End、Enter/空格和 Esc。

移动以当前可见列表为准；分类筛选会跳过隐藏项目，分组模板只在当前分组内移动。边界方向、正在保存时以及自由/手动布局下的移动按钮会禁用。操作保留快捷方式标识、手动坐标及未完成的编辑内容，不新增权限、网络访问或账号要求。其他标签页已修改列表时会刷新列表，请重新打开菜单再试。

## Native smoke checklist

1. In light and dark Grid templates, use keyboard-only menu opening, End/Up/Down, Enter and Space to move. Check edge disabled states, Escape, and no double move from held Enter or a stale clicked menu.
2. Repeat with an active category filter, an interleaved hidden category, identical-title/URL twins, and Graphite/Folio collections. Confirm only the intended site moves and focus follows it.
3. Save manual coordinates, switch to Grid, reorder, then switch back to Free/Manual. Confirm coordinates stay unchanged. Confirm move entries are disabled outside Grid.
4. Delay storage completion; try another move, move focus to search, and open a fresh editor. Confirm no extra move, no stolen focus, no erased draft, and the editor still targets the original site after saving.
5. Change links in another tab, then activate an old menu or submit an order from a stale tab. Confirm the competing change is preserved and any failure is visible.
6. Repeat core menu flows in English and Simplified Chinese.

## Final verification / 最终验证（2026-10-09）

Independent review fixed duplicate editor/focus identity restoration, overlapping deletion versus reorder, and cancelled-editor saving-state cleanup. The final suite passes 113 tests, including independent delayed-editor and defect reproductions.

Bounded native Chrome for Testing acceptance on the identical final runtime passed first/last boundaries, held-key single moves, keyboard menu reopening and focus, repeated duplicate-specific moves, category filtering, disabled Free/Manual actions, manual-position retention, Graphite dark collection boundaries and reload persistence. All seven synthetic sites remained. Injected pending races/failures, live Sync, and screen-reader behavior were not verified natively.
