# Current saved item → Markdown

In a saved prompt or collection item's detail view, choose **Export current saved item as Markdown**. Review the item identity, saved record version, body version, and literal content, then choose **Download Markdown**. Cancel or Escape makes no download request. The browser controls where the file goes; “Download requested” does not confirm that it was saved to disk.

- Prompts export the current saved template, including literal `{{variables}}`, plus saved metadata. Filled-in variable values are excluded.
- Collection items export the current excerpt, annotations, type, tool, tags, and exact linked prompt IDs when present. Linked prompt bodies are never resolved or included.
- Only one saved item is exported. Unsaved drafts, proposed revisions, other records, body history, and recovery snapshots are excluded. An archived selected item can also be exported.
- Source URLs are excluded by default. For collections with a source, an unchecked opt-in exposes the exact saved URL for review and includes it only when checked. No source is fetched or previewed remotely. Text and annotations can still contain private information even when source URLs are excluded.
- The file is an unencrypted, readable Markdown copy, not a recovery backup. Keep it private. The existing collection JSON backup remains available and unchanged.
- User content and metadata are fenced as literal text with a delimiter longer than any embedded backtick run. Unicode, original line endings, tabs, whitespace, HTML and template variables are not interpreted or transformed. Framing newlines are added around each literal section.
- A changed selection/version, closed page, pending or uncertain save, or active editor prevents a stale download. Duplicate clicks while review is pending do not start another export. There is no deferred download or automatic retry.

Files use the fixed names `local-itab-prompt.md` and `local-itab-collection.md`, with UTF-8 Markdown content. Export does not modify saved data, add permissions, or use network access.

## 中文

在已保存的提示词或收藏条目详情中，选择“将当前已保存条目导出为 Markdown”。检查条目、已保存版本、正文版本及原文后，再选择“下载 Markdown”。取消或按 Escape 不会请求下载。“已请求下载”仅表示已向浏览器发出请求，不代表文件已写入磁盘。

仅导出当前单个已保存条目。提示词保留 `{{变量}}` 模板原文，不含临时变量值；收藏包含原文、注释和元数据，关联提示词仅包含精确 ID，不包含关联正文。草稿、修订提案、其他条目、历史版本和恢复快照均不导出。来源网址默认不包含，需手动勾选，并可检查保存的网址原文；不会访问网址。即使不包含网址，正文和注释仍可能含私人信息。

这是未加密的可读副本，不是恢复备份。原有 JSON 备份功能不变。条目或版本在检查期间改变，或保存状态不确定时，需重新发起导出。
