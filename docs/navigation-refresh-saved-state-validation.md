# Explicit refresh of saved state

The library has a “Refresh saved state” / “刷新已保存状态” button. One accepted click reads the existing workspace snapshot once. Browsing does not subscribe to storage events, poll, write data, or request permissions.

A successful read updates Added markers, saved personal-category locations, destination names/options and privacy-setting labels together. Search, every filter, selected-only mode, expanded details, new-category mode/name and still-unsaved selections remain in place. Selected sites that became saved elsewhere are removed from selection with an explicit count. A deleted destination stays visible as invalid: Add and Review are unavailable until the user chooses a valid category or explicitly creates a new one. There is no first-category fallback.

During refresh the existing view remains visible and controls are temporarily unavailable; Close remains available. The button returns focus after keyboard activation unless the user moved focus elsewhere. Read failure retains the previous snapshot and browsing/draft state, explicitly labels it as the previous saved state, and permits another read. Review, writes, pending layout work, lifecycle departure and uncertain-save locks prevent refresh. Refresh cannot clear a write lock. Opening identity, read tickets, storage/workspace identity and lifecycle checks prevent late reads from replacing newer or another workspace's view.

## Verification

`tests/navigation-library-view.test.js` models external add/remove/rename, mixed selected/newly saved reconciliation, selected-only retention, renamed valid targets, deleted targets, preserved search/filter/details/draft, both locales, failed reads, repeated pending clicks, review/write/uncertain-save guards, close/reopen reverse-resolution and workspace/lifecycle changes. Every refresh case asserts no writes and accepted read counts.

All fixtures are synthetic. This validation covers the DOM model and offline package; native browser interaction and screenshots are not claimed here.

## 中文使用说明

在其他页面整理快捷方式后，无需关闭导航库：点击“刷新已保存状态”即可重新读取。搜索、筛选、展开详情、新分类草稿及尚未保存的选择都会保留。已在其他页面添加的网站会从选择中移除，并提示数量。原目标分类被删除时会明确显示失效，必须重新选目标才可添加。刷新失败会保留旧状态并明确说明，确认添加或保存结果不确定时不能用刷新解除保护。

Frozen implementation passed2814/2814 strict Node tests and81/81 Python, including
eight new refresh cases. Independent audit passed149 view tests and26 additional
real StorageManager checks covering external changes, reversed reads, mutation
and layout flags, rejection paths and zero writes.113-file offline packaging
passed. Manifest remains1.1.114 for this ordinary feature; native acceptance is
pending, and synthetic read-count/fault evidence is not native verification.
