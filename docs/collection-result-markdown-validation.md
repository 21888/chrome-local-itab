# Filtered collection results → Markdown anthology

## Behavior and privacy

The collection sidebar adds **Export filtered results as Markdown** beside the result count/list. It uses the same `sortedResults()` path as the visible list: the complete Controller result set for the current query, type, tool, exact tag and Saved/Archived intersection, in Recently updated or Earliest saved order. It does not depend on viewport height, scrolling or the selected detail. Zero results cannot open a review.

The independent review displays the matching count, Saved/Archived scope, query/type/tool/tag values, page order and full literal output. Only an explicit **Download Markdown** requests `local-itab-collection-results.md`. The exact string reviewed is passed to the Blob once, without re-reading records after approval. The status says only **Download requested**; the browser owns delivery and disk saving.

Each matching record uses the existing single-item `LocalItabAIMarkdown.serialize('collection', record)` without source opt-in. It includes current saved title, body, notes, type, tool, tags, body-version ID and exact prompt-reference IDs. Source URL fields, context snapshots, history, recovery copies, linked prompt bodies, drafts and proposed revisions are excluded. The existing Controller search validates its saved-state copy; the export adds no backend or prompt-body read. It does not inspect an editor to obtain content.

This is an unencrypted readable copy, not recovery JSON. Text and notes may still contain links, secrets or personal information; excluding source URL fields does not anonymize them. User text remains inside the existing literal fences, with Unicode, CRLF/lone CR/LF, tabs, spaces, backticks and HTML unchanged. The existing one-item source-URL opt-in and all-library JSON behavior are unchanged.

The current detail, selected item, metadata/new-item drafts, proposed revision text, list filters/order and expanded inline history are retained. No export preference is stored. No storage write, network/clipboard/permission request, external lookup or automatic retry is added.

## Review lifetime and bounded resources

The review is fenced by its View/controller ownership, state object, read and interaction generations, exact filters, page order, visible/attached control and read/write readiness. Filter round trips invalidate old approval. A refresh invalidates at the early `comparison` notification before its read settles. An error-clearing selection does not turn an unverified read into valid evidence. A full render, page hide/departure or disposal also invalidates the review. A later callback cannot start a stale download or overwrite newer status.

The host's existing dialog owns inert isolation, initial heading focus, Shift+Tab, ordinary Tab, IME-aware Escape and focus cleanup. The opener stays enabled during review so the dialog can retain and restore its focus; the existing pending-export/dialog guards prevent duplicate requests. Existing active body revisions and other modal dialogs prevent entry. Once a download has already been requested, later changes are not described as having cancelled it.

Valid saved collections remain bounded by 200 records and the existing 2 MiB budget with its 16 KiB internal reserve, including history and recovery. The complete result set is serialized or an error is shown; there is no truncation or new output quota. Literal fences can make the Markdown larger than the input budget, especially for long backtick runs. Temporary anchors and object URLs are cleaned up on success, cancellation after acquisition, or an injected error; there is no delayed download retry.

## Bounded synthetic verification

The new `tests/collection-result-markdown.test.js` has **44 tests** using the real Store and Controller, an independent clock, a synthetic DOM and modeled Blob/download sinks. Existing helpers and assertions were not changed. Its first two tests were run against the unmodified View and both failed because the list export button was absent. Both passed after the minimal implementation.

Coverage includes:

- Matching order/count and full serialized records, Saved/Archived separation and the exact query/type/tool/tag intersection, both sorts, and a modeled tiny viewport that does not reduce output.
- Zero matches; saved literal body/notes/HTML/backticks/Unicode/line endings; exact prompt-reference IDs; real revised bodies and a real reviewed replacement creating a recovery-only record.
- Actual metadata input events and new drafts, retained draft identities/serialized values, saved-state equality and zero additional IO. Historical, recovery-only, context, source and unsaved values are absent from output.
- Real modal cancellation and acceptance, heading focus and Shift+Tab, IME Escape, repeated Enter, duplicate invocation and old callback protection, opener focus restoration and unchanged inline history nodes/scroll position.
- Busy, pending/uncertain, failed/unverified/in-flight reads, hidden/CSS-hidden/inert/detached controls, foreign modal, active revision, replaced owner and destroyed View entry guards.
- Delayed approvals after filter round trips, sort/state/read changes, busy/error/pending states, hidden-document round trips, detach/replacement/render, ordinary page departure and bfcache departure.
- Real refresh notification before a gated read failure, old modal callbacks after invalidation, and selection clearing an error without restoring read eligibility.
- Serializer/dialog/Blob/URL/click/revoke failures, state change during URL creation, exact temporary-resource cleanup and no retry.
- 200 records built through real Store mutations, plus 31 records with 32,000-backtick bodies forming a valid collection above 1.9 MiB. Its Markdown exceeds 2 MiB and is still reviewed/downloaded in full, with exact serialized content checked for every record.
- English, Chinese and English-fallback UI labels.

Two intermediate failures were in the new fixture, not evidence of production draft mutation: the fixture first used a nonexistent Store review method, then asserted an old input value after updating only Controller data. The fixture was corrected to use the actual reviewed replacement API and real `input.value`/`input` events; the original failure logs were retained. Draft identity, before/after serialized draft values and unchanged saved-state assertions were retained.

The bounded command used a 512 MiB heap and one test file at a time:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/collection-result-markdown.test.js \
  tests/collection-saved-sort.test.js \
  tests/local-ai-markdown.test.js \
  tests/local-ai-markdown-view.test.js \
  tests/local-ai-markdown-integration.test.js \
  tests/local-ai-collections-ui.test.js \
  tests/collection-revision-lifecycle.test.js \
  tests/collection-history-reading.test.js \
  tests/collection-reuse-draft.test.js \
  tests/local-ai-collections-import.test.js \
  tests/local-ai-collections-outcome.test.js \
  tests/dialog-focus.test.js \
  tests/dialog-ime.test.js \
  tests/dialog-details-focus.test.js
```

Result: **385 passed, 0 failed**, comprising the 44 new cases and 13 unchanged neighboring test files. This is a focused development result, not a full-suite run. No full/scale/20k tests were run for this change.

A separate reviewer also passed 9 independent probes, 152 unchanged neighboring tests and a repeat of the 44 new tests. These are separate bounded runs, not additive unique-coverage totals. Locale JSON parsing and byte preservation were checked: removing the three newly added message blocks in each English/Chinese file reproduces the original file bytes exactly. `git diff --check` passed.

These are synthetic-model checks, not native Chrome acceptance. Real download delivery, browser keyboard defaults, focus painting, screen-reader announcements, narrow layouts/zoom and real cross-tab lifecycle timing remain unverified. No screenshots were taken or uploaded; no user device, credentials, provider service or paid platform was used. No release or CWS publication was performed. Store, Controller, serializer, schemas, providers, permissions and manifest version 1.1.155 remain unchanged.

## 中文

列表附近新增「将筛选结果导出为 Markdown 合集」，按当前搜索、类型、工具、精确标签及已保存/已归档范围的交集，导出所有匹配条目，沿用最近更新/最早保存排序，不受屏幕可见范围影响。先审阅条数、范围、全部筛选、顺序及完整输出，再明确请求下载；零结果不启动。

复用单条 Markdown 字面序列化，仅含当前已保存字段和精确提示词引用 ID。始终排除来源网址字段、上下文快照、历史、恢复副本、关联提示词正文、草稿及拟修订文本。正文和注释里的私人信息仍原样保留，并未脱敏。文件未加密，不是恢复 JSON；原单条 Markdown 与全库 JSON 功能不变。

筛选往返、排序、数据或读取变化、页面隐藏/离开、销毁及失去控制器所有权会阻止旧下载。提前读取通知即使尚未完成也使旧审阅失效，不自动重试。既有模态框负责焦点和输入法语义；审阅期间不禁用触发器，避免丢失返回焦点。已请求的浏览器下载不会被宣称撤销。

44 项新测试使用真实 Store/Controller 和合成 DOM/下载模型，与 13 个未改动邻接测试文件合计 **385/385** 通过。最初两个真实基线红例因缺少入口失败，加入实现后转绿；另保留了两次新测试夹具初始化/API错误的失败记录，修正使用真实 API 和 input 事件，没有放宽草稿前后相等断言。实际 200 条与超过 1.9 MiB 的有效集合均完整序列化，长反引号输出超过 2 MiB 也未截断。

这里只是有界开发验证，不是全量回归或原生 Chrome、下载、键盘、布局/缩放和读屏验收。没有截图、上传、用户设备、收费服务或发布操作。既有 helper/断言、Store/Controller/serializer、schema、权限、provider 及 1.1.155 版本不变。
