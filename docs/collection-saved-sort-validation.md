# Collection list: page-local saved-date ordering

## Behavior and boundaries

The collection sidebar has a native, labeled **Sort this page** selector with exactly two options:

- **Recently updated** is the default. It preserves the existing controller results in their exact order: descending `updatedAt`, with ascending record ID for ties.
- **Earliest saved** orders a copy of those same results by ascending record `createdAt`, with ascending record ID for ties. This is the item's initial save time, not a body-history version selector. Annotation/metadata edits, body revisions and archive operations can advance `updatedAt` without changing `createdAt`.

Search and type, tool, exact-tag and archive filters retain their existing intersection and snippet behavior. The sort is local to this View instance. Changing or clearing filters, navigating records and refreshing saved data retain it; a new page/View starts with Recently updated. No sort preference is saved or exported.

Changing sort uses the existing list-only filter notification with an empty filter patch. This records a user interaction, so a pending capture handoff cannot replace the user's current selection after the sort. Only the sidebar is rebuilt: no first-item selection or detail rerender occurs, and ordinary metadata/new-item drafts, proposed text, expanded history, reading nodes and focus are retained. A data refresh itself still follows the existing refresh behavior.

Active body revision contexts, including the asynchronous gap before their review dialog appears, reject sort changes before recording an interaction. This keeps the in-progress revision valid and preserves its exact proposed text. Modal dialogs, including saved-history reading, also reject background sorting without clearing the dialog. Disabled, busy, uncertain-save, closed/disposed, hidden/inert, detached and replaced controls cannot apply a sort. Rejected or unsupported values return the selector to its current choice without changing list order or selection.

The selector reuses existing field/select styling and native browser keyboard behavior. There are no new shortcuts, CSS, runtime dependencies or modules. No changes are made to the Store/controller search contract, schema, storage keys, providers, permissions, manifest version, release configuration or CWS material. Sorting performs no extra storage read/write, network request, permission request or clipboard operation.

## Bounded synthetic verification

`tests/collection-saved-sort.test.js` contains 12 tests using the real collection Store and Controller with an independent, controllable clock. The shared collection harness retains its original fixed-date behavior; no helpers or old assertions were changed. The first two tests were run before implementation and failed on the missing native selector.

The final tests cover:

- Exact default order; independently differing initial-save and update times; an annotation edit that changes only update order; and equal-created-date ID ties whose prior update order is different.
- Frozen returned result arrays and frozen `state.records`, unchanged serialized state, zero additional IO, selected-record preservation and unchanged detail-node identity.
- All 16 combinations of query/type/tool/tag filters in both Saved and Archived modes, explicit full-intersection results, clearing filters, and no matching results.
- Empty and single-item collections, plus 200 records built through actual Store mutations at different times. A 201st add is refused by the existing capacity limit; sorting does not change it.
- Repeated changes retaining metadata/new-item draft objects and text, proposals, open inline history, history-body nodes, modeled scroll position and focus.
- Saved-history reading modal bodies, version choices and focus surviving a rejected background sort.
- A delayed real capture-page handoff being refused after a valid native `change` dispatch; unsupported and unchanged values not advancing the interaction token.
- Disabled/hidden/inert/modal/detached/disposed/page-departure controls and an old View whose controller is now owned by another View.
- A real body-revision editor and gated asynchronous review preserving their context and proposed text when sorting is refused.
- English, Chinese and English-fallback labels, a native two-option selector, and no custom cancellation of its keyboard events.

Focused command (512 MiB heap limit, one test file at a time):

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/collection-saved-sort.test.js \
  tests/local-ai-collections-ui.test.js \
  tests/local-ai-collections-store.test.js \
  tests/local-ai-collections-tag-filter.test.js \
  tests/local-ai-collections-tags-preservation.test.js \
  tests/collection-revision-lifecycle.test.js \
  tests/collection-history-reading.test.js \
  tests/collection-capture-page.test.js \
  tests/collection-capture-adversarial.test.js \
  tests/collection-reuse-draft.test.js \
  tests/collection-metadata-focus.test.js \
  tests/collection-metadata-retry-focus.test.js \
  tests/collection-context-handoff.test.js \
  tests/local-ai-collections-import.test.js \
  tests/local-ai-collections-outcome.test.js \
  tests/manual-saved-excerpt-comparison.test.js \
  tests/saved-result-comparison.test.js \
  tests/dialog-focus.test.js \
  tests/dialog-ime.test.js \
  tests/dialog-details-focus.test.js
```

Result: **613 passed, 0 failed**, including the 12 new cases and 19 unchanged neighboring test files. The changed View and new test file also passed `node --check`; both changed locale JSON files parsed successfully; `git diff --check` passed.

These are bounded development checks, not a full-suite result or native Chrome acceptance. No real-browser dropdown interaction, native key handling, visual layout at narrow widths/zoom, focus painting or screen-reader announcements were verified here. DOM key dispatch does not prove native keyboard behavior. No screenshots, user-device access, provider accounts, credentials, paid platforms, uploads or publication were part of this change. Manifest stays at 1.1.155; Release and CWS remain frozen.

## 中文

收藏侧栏新增原生「本页排序」，默认「最近更新」逐项保持原搜索结果顺序；「最早保存」仅对结果副本按记录 `createdAt` 升序、同时间按记录 ID 升序排列。首次保存时间不同于正文版本时间，批注更新等操作不会改变它。搜索、类型、工具、标签与归档范围仍按原规则取交集，搜索摘要不变。

选择仅在当前页面实例保留。切换或清除筛选、切换记录、刷新已保存数据保留选择；重新加载或重新挂载恢复默认。排序不写入偏好或备份，只更新列表，不自动选首条，不重绘当前详情，保留普通编辑/新草稿、拟修订文本、展开的历史、阅读节点与焦点。

排序通过既有列表通知记下用户交互，阻止迟到的选区传递覆盖当前选择。活动正文修订上下文（包括对话框出现前的异步审阅间隙）和模态窗口会先拒绝排序，不推进交互票据，不丢失修订文本或历史阅读内容。隐藏、不可交互、脱离页面、已关闭/销毁以及失去当前实例所有权的旧控件不能改变列表；无效值恢复当前选择。

12 项专属合成测试使用真实 Store/Controller 和独立可控时间，覆盖默认顺序、批注更新、同日期 ID、32 种筛选交集、归档/空/单项/真实 200 条上限、草稿/历史与焦点、零额外 IO、晚到 capture、revision 异步间隙、旧控件拒绝和中英回退。最初两个测试先因缺少控件失败；加入实现后与 19 个既有测试文件合计 **613/613** 通过，语法、两份语言 JSON 与差异检查通过。原 helper、旧断言、规模测试及 20k 测试未修改。

本项没有新增存储读写、网络、剪贴板、权限、数据格式或 provider 行为，也不修改 Store/controller 契约。未做完整回归或真实 Chrome、键盘、布局、缩放和读屏验收；没有截图上传、用户设备或收费平台操作。版本保持 1.1.155，Release/CWS 继续冻结。
