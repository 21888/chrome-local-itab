# Saved items → Markdown

In a saved prompt or collection item's detail view, choose **Export current saved item as Markdown**. Review the item identity, saved record version, body version, and literal content, then choose **Download Markdown**. Cancel or Escape makes no download request. The browser controls where the file goes; “Download requested” does not confirm that it was saved to disk.

- Prompts export the current saved template, including literal `{{variables}}`, plus saved metadata. Filled-in variable values are excluded.
- Collection items export the current excerpt, annotations, type, tool, tags, and exact linked prompt IDs when present. Linked prompt bodies are never resolved or included.
- Only one saved item is exported. Unsaved drafts, proposed revisions, other records, body history, and recovery snapshots are excluded. An archived selected item can also be exported.
- Source URLs are excluded by default. For collections with a source, an unchecked opt-in exposes the exact saved URL for review and includes it only when checked. No source is fetched or previewed remotely. Text and annotations can still contain private information even when source URLs are excluded.
- The file is an unencrypted, readable Markdown copy, not a recovery backup. Keep it private. The existing collection JSON backup remains available and unchanged.
- User content and metadata are fenced as literal text with a delimiter longer than any embedded backtick run. Unicode, original line endings, tabs, whitespace, HTML and template variables are not interpreted or transformed. Framing newlines are added around each literal section.
- A changed selection/version, closed page, pending or uncertain save, or active editor prevents a stale download. Duplicate clicks while review is pending do not start another export. There is no deferred download or automatic retry.

Files use the fixed names `local-itab-prompt.md` and `local-itab-collection.md`, with UTF-8 Markdown content. Export does not modify saved data, add permissions, or use network access.

## Export the current filtered collection

The list-side **Export filtered results as Markdown** entry is separate from single-item export. It takes every matching saved record in the current Saved or Archived scope and the exact query/type/tool/tag intersection, using the same Recently updated or Earliest saved order as the list. Zero matches cannot start a review. Review the count, scope, active filters, order and complete literal output, then explicitly download `local-itab-collection-results.md`.

Each item reuses the single-item serializer for saved title, current body, notes, type, tool, tags, body-version ID and exact prompt-reference IDs. Drafts and proposed changes never supply fields, even if the selected item is being edited. Source URL fields, context snapshots, history, recovery copies and linked prompt bodies are always excluded, without an opt-in. Text and notes can still contain private information; this does not anonymize them. No source or prompt body is fetched.

Filtering, sorting, saved-state/read changes, hidden/departed pages or a replaced View invalidate the old review. Pending, uncertain or unverified reads/writes prevent a new request. Cancel and repeated/late callbacks cannot request another download. There is no retry, clipboard request or storage mutation. An already requested browser download is not retroactively cancelled. Existing detail, drafts and list choices are retained. The complete matching result set is serialized or an error is shown, without truncation; literal fencing can make the output larger than the 2 MiB input budget. [Bounded synthetic verification and untested native behavior](collection-result-markdown-validation.md).

## 中文

在已保存的提示词或收藏条目详情中，选择“将当前已保存条目导出为 Markdown”。检查条目、已保存版本、正文版本及原文后，再选择“下载 Markdown”。取消或按 Escape 不会请求下载。“已请求下载”仅表示已向浏览器发出请求，不代表文件已写入磁盘。

仅导出当前单个已保存条目。提示词保留 `{{变量}}` 模板原文，不含临时变量值；收藏包含原文、注释和元数据，关联提示词仅包含精确 ID，不包含关联正文。草稿、修订提案、其他条目、历史版本和恢复快照均不导出。来源网址默认不包含，需手动勾选，并可检查保存的网址原文；不会访问网址。即使不包含网址，正文和注释仍可能含私人信息。

这是未加密的可读副本，不是恢复备份。原有 JSON 备份功能不变。条目或版本在检查期间改变，或保存状态不确定时，需重新发起导出。

### 当前筛选结果合集

收藏列表附近可选择「将筛选结果导出为 Markdown 合集」。它包含当前已保存/已归档范围以及搜索、类型、工具、精确标签交集中的全部匹配条目，沿用本页最近更新/最早保存排序，不限于可见列表。先审阅条数、范围、筛选、顺序和完整原文，再明确下载。

仅使用每条当前已保存字段，正在编辑的草稿、拟修订文本仍保留且不导出。合集始终排除来源网址字段、上下文快照、历史、恢复副本及关联提示词正文；正文和注释中的私人信息仍原样保留，并未脱敏。文件为 `local-itab-collection-results.md`，不是恢复备份。零结果不启动，状态变化使旧审阅失效；取消、重复及过期回调不产生额外下载，也不自动重试。已开始的浏览器下载不会被宣称撤销。[完整范围与验证限制](collection-result-markdown-validation.md#中文)。
