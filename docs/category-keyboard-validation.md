# Category keyboard navigation

## Usage / 使用方法

Focus a category on the new tab page. Use Left/Right in horizontal category
lists, or Up/Down in vertical lists, to move focus. Movement wraps; Home/End
reach the first/last available category. In wrapped horizontal lists, Left/Right
follow the category order across rows. The arrow axis follows the current
template and responsive layout immediately.

Press Enter or Space, or click, to apply the focused category. Moving focus does
not filter sites, save a category, rebuild shortcuts or discard search text.
Ordinary Tab/Shift+Tab remains available on every category. Orthogonal arrows,
modified keys, composing input and events from descendant inputs are untouched.
Disabled, hidden and inert categories are skipped.

在新标签页聚焦任一分类后，横排分类使用左右方向键，竖排分类使用上下方向键。
到达边界会循环；Home/End 跳到首个/末个可用分类。横排换行时，左右键仍按分类顺序
跨行移动。模版或窗口宽度改变后，按键方向立即跟随实际横竖排列。

方向键只移动焦点，按 Enter、空格或点击才应用筛选。不会因为浏览分类而改动当前
显示的网站、保存分类或清除搜索文字。仍可逐个 Tab/Shift+Tab；隐藏、禁用及弹窗
打开后不可交互的分类不会被选为焦点目标。

## Automated verification

Run from the repository root:

```sh
node --test tests/category-keyboard.test.js tests/category-mutations.test.js tests/shortcut-keyboard.test.js tests/context-menu.test.js tests/shortcut-menu-entrypoint.test.js tests/folio-category-focus.test.js
node --check newtab.js
node --check tests/category-keyboard.test.js
git diff --check
```

The six focused files above pass 28 tests. JavaScript syntax checks and
`git diff --check` also pass; no complete-suite result is claimed here.

The new 12-test suite runs the production CategoryNavigation renderer and
handlers in the existing DOM/event model. Nine tests fail against the preceding
implementation; all 12 pass with this feature. Coverage includes:

- Forward/backward wrapping, Home/End, responsive axis changes and focus only.
- RTL/reversed flex direction without changing logical Home/End endpoints.
- Disabled, hidden, display:none, visibility:hidden/collapse and inert targets.
- Native-button activation modeling: Enter/Space alone apply the existing filter.
- Native Tab and orthogonal arrows, modifier/IME/default-prevented events,
  input/label descendant events and repeated navigation.
- New category order after rendering, single-category states, detached old
  buttons, and no focus movement from an old control after the user moved away.
- Unchanged search draft, shortcut nodes, selected-category semantics and zero
  writes/reflows while only moving focus.

This change modifies no storage, backup, migration, permissions or manifest
version. It adds no document-level keyboard listener or network access.

## Native verification still required

No real Chrome installation or native UI verification was performed for this
change. The modeled checks above do not establish layout, scrolling, focus-ring
painting, operating-system key dispatch, IME or screen-reader behavior.

Before release, check horizontal, vertical and wrapped category lists in real
Chrome, including template changes, narrow widths, light/dark and zoom. Confirm
focus remains visibly in view, Home/End and wrapping land on the intended
categories, Enter/Space applies exactly one filter, and Tab/Shift+Tab leave the
category list normally. Open a dialog and confirm background categories remain
unreachable; close it and repeat keyboard navigation. Existing context-menu
opening and Escape focus return should still work from the focused category.
