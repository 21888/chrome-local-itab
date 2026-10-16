# Reorder saved sites without dragging

Each saved site has one always-visible **More actions (⋯)** button. Click it or focus it and press Enter/Space to open the existing menu with Open, Edit, Delete and ordering actions. It replaces the separate hover-only Edit/Delete buttons to keep compact tiles uncluttered. Delete still asks for confirmation and retains the existing Undo delete flow.

In **Grid** placement, open **More actions**, or use your keyboard's menu key / Shift+F10 (where supported) or right-click the site. Choose **Move earlier** or **Move later**. The menu uses Up/Down, Home/End, Enter/Space, and Escape.

- Moving one step follows the current visible list. A category filter skips hidden sites. Grouped templates keep the move inside the site's collection.
- At the first/last visible site, the unavailable direction is disabled. Both directions are disabled during a pending order/layout save and in Free or Manual placement.
- The moved site retains keyboard focus unless you moved focus elsewhere while saving. An editor opened during saving keeps its text and waits for the order save before enabling Save.
- Saved identities and manual coordinates are retained. The operation uses the existing guarded local shortcut transaction. If another tab changed the list, the latest list is shown instead of overwriting it; reopen the menu and try again.
- There are no new permissions, network calls, or accounts. No global hotkey is installed.

## 中文

每个已保存网站都有常显的“更多操作（⋯）”按钮，点击或聚焦后按 Enter/空格，即可打开包含打开、编辑、删除和排序操作的菜单。它替代原先悬停时出现的编辑/删除按钮，让紧凑卡片更简洁；删除仍需确认，并保留“撤销删除”。

在“网格”布局下，打开“更多操作”，也可使用菜单键、Shift+F10（浏览器支持时）或直接右键点击。选择“向前移动”或“向后移动”。菜单支持方向键、Home/End、Enter/空格和 Esc。

移动以当前可见列表为准；分类筛选会跳过隐藏项目，分组模板只在当前分组内移动。边界方向、正在保存时以及自由/手动布局下的移动按钮会禁用。操作保留快捷方式标识、手动坐标及未完成的编辑内容，不新增权限、网络访问或账号要求。其他标签页已修改列表时会刷新列表，请重新打开菜单再试。

## Native smoke checklist

1. In light and dark Grid templates, use keyboard-only menu opening, End/Up/Down, Enter and Space to move. Check edge disabled states, Escape, and no double move from held Enter or a stale clicked menu.
2. Repeat with an active category filter, an interleaved hidden category, identical-title/URL twins, and Graphite/Folio collections. Confirm only the intended site moves and focus follows it.
3. Save manual coordinates, switch to Grid, reorder, then switch back to Free/Manual. Confirm coordinates stay unchanged. Confirm move entries are disabled outside Grid.
4. Delay storage completion; try another move, move focus to search, and open a fresh editor. Confirm no extra move, no stolen focus, no erased draft, and the editor still targets the original site after saving.
5. Change links in another tab, then activate an old menu or submit an order from a stale tab. Confirm the competing change is preserved and any failure is visible.
6. Repeat core menu flows in English and Simplified Chinese.
7. In all 15 templates, light/dark and narrow widths, check the visible More button does not overlap the icon/title. Repeat Grid and saved Free placement; check Graphite/Folio collections and the compact horizontal-list templates. Escape and Tab return to the owning More button, Edit cancel/save restore it, and clicking/focusing outside keeps the newer focus.
8. Rebuild or filter the grid, change templates/categories, or replace a shortcut while its menu is open. Old menu actions must not open or mutate another site. Test detached old buttons, held Enter/Space and IME composition; More must never launch the site or start a drag.

## Original reorder verification / 原排序功能验证（2026-10-09）

Independent review fixed duplicate editor/focus identity restoration, overlapping deletion versus reorder, and cancelled-editor saving-state cleanup. The final suite passes 113 tests, including independent delayed-editor and defect reproductions.

Bounded native Chrome for Testing acceptance on the identical final runtime passed first/last boundaries, held-key single moves, keyboard menu reopening and focus, repeated duplicate-specific moves, category filtering, disabled Free/Manual actions, manual-position retention, Graphite dark collection boundaries and reload persistence. All seven synthetic sites remained. Injected pending races/failures, live Sync, and screen-reader behavior were not verified natively.

## More actions acceptance — 2026-10-09

The integrated More-button change passes 589 Node tests and 19 Python packaging
tests. Independent actual-entrypoint review covered 20 additional behavior groups,
including duplicate identity, stale menus, delayed writes and focus ownership.

Native normal-sandbox Chrome for Testing 155.0.8059.39 on cloud Linux verified
Tab → More → Enter, Escape return, Space reopening, outside-click focus retention,
reordering Alpha, the correct Edit dialog, and cancelled deletion retaining all
six synthetic sites. Clarity light/dark at outer1188/514 widths, grouped Graphite,
compact Column, and Column free placement had no observed More/icon/title overlap.
Edge menus stayed visible; free-layout reorder commands were disabled.

Those comprehensive flows used immutable visual-v2. The exact final source only
changes two modified CSS line endings from CRLF to LF; every normalized runtime
byte is identical. A separate fresh exact-final profile imported the same fixture,
reloaded the dashboard and opened More successfully. Do not interpret that final
smoke as repetition of every v2 flow. Both owned QA windows were closed normally.

The final 60-file runtime ZIP is 1,262,289 bytes (1,255,027 source bytes), SHA256
`454052fc051d97b47c51bd2cddf0d2244fa45ae68ee595e7afbe6ebbfac58ba0`.
[Current real captures and precise provenance](screenshots/shortcut-menu/capture-metadata.json)
include final light-wide and v2 dark-narrow states. No exhaustive 15-template,
Chinese native UI, sub-510px native width, screen-reader, IME or cross-platform
acceptance is implied; their automated checks retain model/static scope.

## Grid drag identity while saving — 2026-10-16

Grid dragging now uses the same guarded order update as the menu commands. The
visible cards and their index targets stay on the previous list until saving is
confirmed. Opening or editing a still-visible site therefore targets that site;
an editor opened during the write keeps its draft and remaps to the saved slot.
A second drag or deletion waits for the first order update. Dragging still inserts
at the actual drop index, including across collections, without changing categories.

Failure, unverified-write and competing-change notices retain their existing
meaning. An uncertain or conflicting write keeps an open draft protected from
saving to a stale slot. A template refresh during the write still rebuilds and
retires old controls, using the visible previous snapshot until completion.

Focused synthetic handler/DOM regression checks:

```
node --unhandled-rejections=strict --test --test-concurrency=1 \
  tests/shortcut-drag-identity.test.js tests/shortcut-order.test.js \
  tests/template-refresh-reuse.test.js tests/category-mutations.test.js \
  tests/shortcut-write-conflicts.test.js tests/shortcut-delete-session.test.js
```

The new drag suite reproduced three baseline failures, including visible Alpha
opening Beta during a deferred write, and passes after the fix. These checks do
not establish native Chrome drag behavior; that acceptance remains unperformed
for this change. No storage schema, permissions or manifest changes are included.
