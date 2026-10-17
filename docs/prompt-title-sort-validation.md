# Prompt library: page-local title ordering

## Behavior and boundaries

The prompt sidebar adds a native, labeled **Sort this page** selector with two choices:

- **Default order** retains the Controller's existing result order exactly: favorites first, then descending `updatedAt`, then record ID.
- **Title ascending** sorts a copy of all current matching results by saved title. `Intl.Collator` uses the page's supported language (`zh-CN` for Chinese; `en` otherwise), `sensitivity: 'base'` and `numeric: true`. Case and base-equivalent titles compare equally; numbers such as 2 and 10 sort naturally. Equal comparisons use literal ascending record ID as a stable tie-breaker. Favorites are not pinned in this mode.

This is the browser's locale-aware collation, not a promise of identical Chinese or pinyin ordering across every browser/ICU version. Blank or unsupported UI-language values fall back to English. Titles and snippets remain plain text, and the copied result array keeps the original records/snippets and filter intersection.

Search, category, exact-tag and All/Favorites/Trash keep their existing meanings. Sorting applies to the complete matching result set, including offscreen rows. Filters, record navigation and refresh of saved data retain the choice in this View; a new page/View starts with Default order. No preference, schema field or backup field is added.

The change event redraws only result cards and their count. It does not call `filter`, `render` or the broader sidebar `renderList`. Consequently it does not replace current detail/editor/preview/history nodes, rewrite search or editor values, reset temporary variable sessions, clear inline version comparison, choose the first result, or replace pending work. Saved-data refresh continues to have its existing behavior; sorting does not change that behavior.

The control verifies its own current View/controller callback owner, original parent/sidebar, connected host/shell, enabled state and visibility. Replaced, moved, detached, destroyed/disposed, hidden/inert, CSS-hidden, background-page and modal controls reject the event and restore the current selector choice. Loading without a state, busy saves and uncertain-save receipts also reject sorting. The pending command/receipt, error and explicit retry remain intact. Sorting during a delayed read or clipboard write does not start another operation or invalidate the original one.

The selector uses existing `.prompt-filter` styling and native select keyboard handling. Store, Controller, old tests/helpers, CSS, schema, storage keys, permissions, manifest, workflows and release configuration remain unchanged. Sorting causes no additional storage read/write, network request, clipboard access or permission request.

## Bounded synthetic verification

`tests/local-prompts-title-sort.test.js` uses the real prompt Store and Controller, controlled dates and synthetic prompt data with the existing small DOM model. The first three tests failed before implementation because the native control did not exist. The implementation then passed those tests before expansion.

The 19 new tests exercise real `change` events and cover:

- Native English, Chinese and fallback labels, two supported values, selector focus and uncancelled key events.
- Exact unchanged default ordering, natural numbers, case/base-equivalent titles, equal-title ID ties differing from update order, and favorites no longer pinned under title sort.
- A copied frozen result array, frozen saved record array, unchanged data and snippets, retained selection and zero additional IO.
- The actual locale passed to `Intl.Collator`, Chinese/Unicode titles, numeric ordering and literal HTML-like title text. Chinese expectations use the current runtime's comparator rather than hard-coded pinyin.
- All 24 combinations of query/category/exact-tag across All, Favorites and Trash, explicit full intersections, clearing filters and no matches; empty and single-item libraries.
- Sort retention after metadata save, data refresh, filtering and navigation, plus new-View reset.
- Exact editor draft objects and text; search assignment interception, modeled input range/direction, scroll and focus; saved and new-draft variable sessions and preview DOM.
- A synthetic unsaved-result textarea remaining intact, expanded saved history and inline comparison nodes, exact chosen version and historical session.
- Unsupported/unchanged/foreign-target events; disabled, hidden, inert, CSS-hidden, detached, moved and replaced controls; old View ownership; actual confirmation modal and pagehide/BFCache cases.
- A gated real save; an uncertain-save command and its original retry; an awaited read; and both successful and failed pending clipboard writes keeping their original content and completion behavior.

The fixtures do not call a real model or exercise a real AI result workflow; the unsaved-result check is a DOM-preservation sentinel. The intermediate editor fixture was corrected to dispatch the actual input event rather than assume that a direct Controller update rewrites the input node. Original red and intermediate failure logs were retained during development.

Focused verification used a 512 MiB Node heap and one test file at a time:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-prompts-title-sort.test.js \
  tests/local-prompts-view.test.js \
  tests/local-prompts-tag-filter.test.js \
  tests/local-prompts-controller.test.js \
  tests/local-prompts-store.test.js \
  tests/local-prompts-comparison.test.js \
  tests/local-prompts-history-preview.test.js \
  tests/local-prompts-history-draft.test.js \
  tests/local-prompts-draft-preview.test.js \
  tests/local-prompts-save-focus.test.js \
  tests/local-prompts-lock-errors.test.js \
  tests/local-prompts-tags-preservation.test.js \
  tests/local-prompts-excerpt-variables.test.js \
  tests/local-prompts-linked-results.test.js \
  tests/local-ai-markdown-view.test.js \
  tests/ai-model-view.test.js \
  tests/library-search-shortcut.test.js \
  tests/dialog-focus.test.js \
  tests/dialog-ime.test.js
```

Result: **600 passed, 0 failed**, including 19 new cases and 18 unchanged neighboring test files. Both the changed View and new test passed `node --check`; both changed locale JSON files parsed without duplicate keys; `git diff --check` passed.

This is a bounded synthetic development result, not full-suite or native Chrome acceptance. Native dropdown keyboard interaction, narrow/zoom layout, focus painting and screen-reader announcements were not checked in a real browser. No screenshots, uploads, user-device access, paid platforms or publication were used. Manifest remains 1.1.155, with Release and CWS frozen.

## 中文

提示词库侧栏新增原生「本页排序」，默认顺序完整保持原有收藏优先、更新时间倒序及 ID 规则；「标题升序」对当前匹配结果副本按本页语言进行不区分大小写、数字自然顺序比较，等价标题按 ID 字面升序稳定排列。标题模式不置顶收藏。中文细节遵循当前浏览器排序数据，不承诺跨浏览器完全相同的拼音顺序。

清筛选、切换条目和刷新已保存数据保留本页选择，新页面恢复默认。排序事件只重绘结果卡片与计数，不触发 Controller 筛选或详情渲染，不写偏好，不重设草稿、变量、历史、内联比较或选中项。真实控件归属、模态、隐藏、不可交互和旧页面均有拒绝保护；保存忙碌及不确定回执仍要求原有明确重试，不因排序自动写入、读取或清除。

19 项新增合成测试使用真实 Store/Controller 和原有 DOM 模型，涵盖中英回退、默认与标题顺序、ID 兜底、24 种筛选组合、空/单项、草稿与变量/历史节点、选区、控件归属和晚到读写/剪贴板操作。未保存 AI 结果仅用合成文本节点核验保留，不代表真实模型调用验收。

新增测试与 18 个原样邻域文件共 **600/600** 通过；语法、两份语言 JSON 无重复键及差异检查通过。没有改动旧测试/helper、存储或 Controller；没有规模测试或全量测试声明。原生下拉键盘、窄屏/缩放布局、实际焦点绘制和读屏仍需真实 Chrome 验收；本轮未做截图、上传、用户设备、收费平台或发布操作。版本保持 1.1.155，Release 与 CWS 继续冻结。
