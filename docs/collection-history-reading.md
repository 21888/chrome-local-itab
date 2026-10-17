# Read two saved collection body versions

In an unarchived collection item's **Excerpt version history**, choose **Read two saved body versions** when at least two saved versions exist. The dialog initially shows the two most recently saved versions. Each selector includes only this item's saved history, with its sequence number, local date/time, exact body-version ID and a Current marker. Choose either side independently; selecting the same ID on both sides is explicitly labeled.

This is side-by-side reading, not a line-by-line added/removed diff or a quality assessment. Distinct IDs can contain exactly identical original text. Equality compares the raw saved strings; only the display copy converts CRLF and bare CR to LF, with the existing explanation that visually matching text may still differ in original line endings. HTML, code, spaces, tabs and Unicode are literal text. Each body can receive keyboard focus and scroll independently; existing comparison CSS places the bodies side by side, stacking below 700 pixels.

## Read-only boundaries

- The two selectors read the loaded, verified history of one unarchived record. They exclude other records, recovery snapshots, unsaved metadata/body drafts and proposed revisions.
- There is no restore, save, copy, export, model call, network access, permission request or storage read/write in this dialog. The separate **Review restoring this text** flow remains unchanged.
- Current body, annotations, source metadata, exact prompt reference and historical context snapshot remain unchanged. Existing drafts and proposals are retained. The two existing cross-record comparison actions still read current saved bodies with their original candidate scopes.
- Sidebar filtering may leave an unchanged history dialog open. Refresh, failed or out-of-order reads, uncertain/pending saves, editing, navigation, detail rerender, archival and replacement clear displayed bodies and disable selectors. An absent or changed selected version is never silently substituted. Close, refresh successfully when needed, and reopen.
- Clearing a read-error notice by selecting another item does not reverify cached data. The existing comparison-read generation fence must pass before opening.
- Close, page departure, BFCache suspension and destruction clear text. Detached old selectors, openers or cleanup callbacks cannot revive it or take ownership from a newer dialog. Returning focus to the opener requires the original source/detail to remain valid and focus still to belong to this dialog; a newer editor keeps focus.

No controller, store, schema, storage key, runtime module, manifest, dependency, release configuration or helper changes are required. English and Chinese labels are supplied; other catalogs use English fallback.

## Bounded development verification

`tests/collection-history-reading.test.js` uses synthetic data with the real collection store/controller and the existing DOM/event model. It covers two and twenty versions, original-text equality across distinct IDs, same-ID labels, mixed CRLF/CR/LF, Unicode and HTML literals, zero IO, retained metadata/references/context/drafts/proposals, exact-ID refusal, lifecycle/read-generation fencing, keyboard/focus behavior, and English/Chinese/fallback labels. Two initial tests failed on the missing entry before implementation. Existing cross-record comparison, history restoration, collection import/outcome and shared-dialog suites are run unchanged alongside it.

Focused command:

    NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 tests/collection-history-reading.test.js tests/manual-saved-excerpt-comparison.test.js tests/saved-result-comparison.test.js tests/collection-revision-lifecycle.test.js tests/local-ai-collections-ui.test.js tests/local-ai-collections-store.test.js tests/local-ai-collections-outcome.test.js tests/local-ai-collections-import.test.js tests/dialog-focus.test.js tests/dialog-ime.test.js tests/dialog-details-focus.test.js

These bounded checks are not a full-suite pass or native Chrome acceptance. No screenshots, user-device tests, provider accounts, credentials, paid services, uploads or publication are included in this development change. Native visual layout, scrollbar interaction, real key scrolling and screen-reader announcements remain unverified here.

## 中文

未归档收藏已有至少两个已保存正文版本时，可在「摘录版本历史」选择「并排阅读两个已保存正文版本」。默认显示最近保存的两版，两侧都可按序号、日期、精确版本 ID 和「当前」标记重新选择。相同 ID 会明确提示；不同 ID 的原始正文完全相同时显示精确相同，否则仅提示并非完全相同。

这不是逐行增删对比，也不判断质量。只将显示副本的 CRLF/CR 换行为 LF；保存的原文及精确相等判断保持原始换行。正文是纯文本，宽屏双列、窄屏上下堆叠，每列可单独键盘聚焦和滚读。

面板只读取已加载且已核验的同一条记录历史，不混入其他记录、恢复快照、草稿或拟修订，不提供恢复、保存或复制操作，也不发起存储读写、网络请求或权限申请。原正文、注释、来源、精确提示词关联、历史输入快照及现有草稿均保留。原两种跨记录对照和「审阅恢复此文本」不变。

数据刷新开始、读取失败、保存不确定、编辑、导航、详情重绘、归档或替换都会清空正文并禁用选择器，不自动替换失效版本。侧栏筛选可保留未变记录的阅读面板。旧节点重接或迟到回调不能复活正文；关闭失效面板不会抢走新编辑器焦点。本项为有界合成测试，不代表完整回归、真实浏览器或发布验收。
