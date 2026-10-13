# 本地 AI 资料库搜索 / Local AI library search

在新标签页右上角选择“搜索 AI 资料库”，同时查找当前保存的提示词和 AI 摘录。可切换全部、提示词或 AI 摘录范围；搜索标题、正文、标签及 AI 摘录的当前已保存备注，不搜索来源网址、提示词备注、历史版本、恢复副本、已归档内容、未保存草稿或变量填写值。搜索大小写不敏感，按输入的完整文字匹配，不解释正则表达式或 HTML。

每条结果显示内容类型、匹配字段和原文片段。上下方向键可移动到结果；Enter 使用浏览器原生链接，在新标签页打开对应记录。Escape 关闭窗口并返回原按钮。结果按标题、类型及稳定 ID 确定顺序。同一记录仅显示一次，匹配字段优先级为正文、标题、标签、摘录备注；空查询仍显示正文片段。

搜索只读取现有的本地资料库，无模型调用、抓取、网络请求、新权限或存储格式变更。搜索期间资料库发生变化时立即清除旧结果，重新读取两侧资料库；读取失败与没有匹配内容分别显示。打开的记录已删除或归档时会显示明确提示，不自动打开最新或其他记录。现有标签页的草稿不会因打开搜索结果而被丢弃。

## English

Choose **Search AI library** in the new-tab navigation to search current saved prompts and AI excerpts together. Filter by type and match a literal, case-insensitive phrase in title, body, tags or current saved AI excerpt notes. Source URLs, prompt notes, history, recovery copies, archived records, drafts and filled-in variable values are excluded.

Results show the record type, matched field and a literal text snippet. Use arrow keys to move through results and native Enter to open the exact stable record ID in its existing library page, in a new tab. Escape closes the dialog and restores focus. Ordering is deterministic: title, type, then ID. Each record appears once, with match priority body, title, tags, then excerpt notes. An empty query still shows the body snippet.

Only existing fenced local stores are read. No model/provider calls, scraping, network requests, added permissions or schema writes are introduced. A source change invalidates both result sets immediately before rereading; unavailable libraries are distinguished from empty results. Invalid, missing or archived destinations have explicit states and never fall back to another saved record. Existing tabs retain their unsaved edits.

## Validation scope

Focused Node tests cover notes-only excerpt matches, excluded prompt notes and source URLs, absent/non-string notes, match priority and deduplication, notes-specific Unicode/HTML snippets and stale/read-error refresh, literal search, deterministic ordering, type filters, cross-store asynchronous generations, read failures and recovery, disposal, strict navigation validation, unavailable/missing/archived destinations, retained drafts, IME, arrow navigation, repeated Enter, Escape/focus return, localized labels and runtime wiring. The package inventory includes the three new JavaScript files.

These automated checks do not establish native-browser acceptance. Native Chrome keyboard/link behavior, narrow layouts and theme appearance need the integrated candidate's separate browser pass.

## 资料库页面快捷搜索 / Library-page search shortcut

在提示词库或 AI 收藏页面，未在输入内容且没有打开弹窗、版本对比或导出预览时，按 `/` 可聚焦本页搜索框并选中已有查询；查询内容不会被替换，也不会自动筛选或保存。搜索框下方显示提示，并提供 `aria-keyshortcuts` 和关联说明。中英文界面均支持。

On either standalone library page, press `/` outside editable controls to focus the page's search field and select its existing query. The shortcut does not change the query, trigger filtering or write data. It stays inactive during dialogs, inline version comparison and Markdown export preparation/review. It leaves IME composition, held-key repeats, Ctrl/Meta/Alt combinations and browser Find or editor Save shortcuts untouched. A quiet localized hint is associated with each search field.

The synthetic DOM tests in `tests/library-search-shortcut.test.js` cover both libraries, exact query preservation, editable descendants and active controls, modal closing/reopening behavior, disposal, non-persisted page teardown and BFCache preservation. Native-browser shortcut/selection behavior still requires a separate browser check.

Shortcut candidate verification (manifest 1.1.98): `node --unhandled-rejections=strict --max-old-space-size=1024 --test --test-concurrency=1 tests/*.test.js` passed **2,542/2,542**, with no failures, cancellations or skips. `python3 -m unittest discover -s tests -p '*_test.py'` passed **81/81**. Changed view scripts pass `node --check`; `git diff --check` and the unchanged 112-file runtime package inventory pass. All fixture content is synthetic. Browser testing was not performed in this implementation task.

### Development validation: library search shortcut

Frozen combined source on manifest 1.1.98 passed strict serial Node 2542/2542 and Python 81/81, including ten targeted shortcut regressions. Offline packaging retains the 112-file runtime whitelist. Native browser validation is pending; input, composition, dialog, modifier, repeat and lifecycle guards are deterministic synthetic coverage until separately observed. No controller, store, schema or permissions changed. This ordinary feature commit does not publish a release.
