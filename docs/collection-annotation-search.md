# 收藏页批注搜索 / Saved annotation search

收藏页搜索覆盖当前已保存的标题、摘录正文、标签及批注。多个空白分隔的关键词必须全部命中，可以分别命中不同字段；匹配不区分大小写。关键词命中批注时，列表优先展示批注的纯文本摘录，并标明“匹配已保存批注”。没有搜索词时仍展示正文摘要。

查询与类型、工具和标签筛选取交集。“已保存”和“已归档”保持隔离。清除筛选只重置查询、类型、工具及标签，不切换分区、不改变所选详情、不丢弃编辑草稿。搜索不包含尚未保存的编辑、旧正文版本、恢复快照、上下文快照、来源链接或工具名称；工具仍可以通过专用筛选选择。所有查找和筛选都是只读操作，不调用模型或写入存储。

The collection page searches current saved titles, excerpt bodies, tags and annotations. Whitespace-separated terms all have to match, including across different fields, using case-insensitive matching. Annotation matches show a bounded plain-text annotation excerpt and an explicit saved-annotation source label. An empty query retains the body preview.

Query, type, tool and tag filters intersect. Saved and Archived remain separate. Clear filters resets only query, type, tool and tag, preserving the current section, selected detail and unsaved editor. Search excludes unsaved changes, old body versions, recovery snapshots, context snapshots, source links and tool names. Tools remain selectable through the dedicated filter. Search and filtering neither write storage nor call a provider.

## Regression coverage

- Annotation-only and multiword cross-field matches; literal markup and Chinese/emoji text.
- Unicode excerpt positions after lowercase expansion (İ), without split surrogate pairs.
- History, context, recovery and draft exclusion; archived scope isolation.
- Query/type/tool/tag intersections and filter clearing, with actual backend write counts unchanged.
- Editor node, draft object and selected detail preservation; English and Chinese labels.

Tests are synthetic Node model-DOM/store checks, not native browser validation. No permissions, manifest version or storage schema changes are needed.

## Combined development validation

The exact-tag prompt feature and this collection annotation search were tested together: strict Node 2527/2527 and Python 81/81 passed. Limited Chinese desktop-light native smoke passed: updated search label, clearing search while retaining Archived, unsaved gamma title preserved across filtering and then explicitly discarded, with three saved records unchanged. No note sample was added or saved; actual notes-only matching and Unicode excerpt mapping remain synthetic-only. Dark/responsive and exhaustive focus matrices were not tested. Manifest stays 1.1.97, and this ordinary feature commit does not publish a release.
