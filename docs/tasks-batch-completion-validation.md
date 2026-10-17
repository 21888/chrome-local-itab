# 选择并完成待办：验证范围 / Batch completion validation

2026-10-17。本项在既有本地待办中新增独立选择、完整预览、一次整批完成和一次整批撤销。以下为实际 Store、Controller、View 的合成测试，不代表原生 Chrome、布局或输入法已经实测。

## 用户行为

- 入口位于未完成列表上方，候选严格来自打开窗口时实际显示的 `visibleTasks`：收起四条、展开全部、筛选全部匹配。已完成/已移除和不可见的下一件事不加入。初始不选，可全选或逐项取消；重复文字仍按记录区分。
- 完整原文以纯文本显示，不截短、不解析 HTML。预览读取并核验所选身份/版本，列出编号原文、数量及是否清除下一件事。开始、改选、预览和取消没有待办写入。改选或观察到列表更新后，必须重新预览。
- 只有“确认完成这 N 项”提交一个不可变整批命令。同一工作区锁/写入围栏中再次检查已审阅 revision 和所有所选 active/id/version；任一前置条件不符，整批零写。一次成功只有一份快照写入、一个 revision 增量和一个 operation-ID receipt，并完整回读核验；没有逐条 complete 循环或 replace/recover 模拟。仅清除属于所选项目的 pin。
- READ/WRITE/VERIFY 无法确认时不宣称部分成功，也不自动重试。用户明确重试同一 operationId、所选身份/版本、结果版本及时间；改选不会改写待重试的编号列表。关闭不取消已发写入，未知结果仍保留卡片 Retry；同期远程隐藏时临时保留入口，不修改 enabled 偏好。后来 mutation 或过期 receipt 不会被旧命令覆盖。
- 撤销与单条完成/移除共用一个本页槽。未确认、预览和取消保留旧槽；只有当前整批精确结果已确认才替换。整批 reopen 再次检查每个成员的完成状态与结果版本；任一变更，全部停止。新置顶和其他记录保留，不恢复旧 pin。无持久化撤销队列、批量 redo 或刷新后撤销承诺。
- 完成不删除记录，不释放 500 条容量。每项 1,000 个 Unicode 字符、8 个恢复副本、2 MiB 集合/文件预算及持久化集合预留 4 KiB 的校验保持原样。schema、任务字段、receipt 格式及 128 条上限、导入恢复协议、Controller 通用接口和 manifest 均未改变。

## 已运行的验证

- 新增两份测试共 73/73：Store 32，View 41。只使用合成原文与记录，不含个人资料或凭据；未修改既有 assertions、helpers 或 scale 用例。
- 基线红例：Store 首个真实调用因缺少 `reviewCompletion` 失败；中英 View 两个真实挂载用例因缺少选择入口失败。随后新增的两个“部分结果写入但 receipt 已落盘”用例及一个“远程隐藏后关闭未知结果”用例也先失败，再通过。未宣称其他用例都曾在基线运行。
- Store 核验重复/多行中文/HTML 字面量、深冻结选中数组及身份、单写/单 revision/单 receipt、选中/未选中 pin、原文顺序/恢复副本/可见性不变；锁等待中的 edit/complete/remove/moveFirst/pin/import 及工作区失效均阻止旧确认。
- 真实 Controller 执行链覆盖读取失败、拒写、丢写、写后丢失确认、写后回读失败；显式原命令重试及重复确认不重复写入。receipt 后续变更及超过 128 条后的旧操作均安全冲突。latest receipt 仍须核对每个固定结果版本/状态/时间，不能以一条 receipt 将部分结果当作整批成功。
- 整批撤销覆盖单成员 edit/remove/reopen 冲突时零额外写入、无关编辑与新 pin 保留、未知撤销原命令重试、later/expired receipt 拒绝。500 条全选及含 8 份副本的接近字节上限完整集合验证成功或整批拒绝；预览同时计入下一 revision/receipt/版本/时间开销。
- View 覆盖 4 条/展开/筛选/零匹配来源、全选/取消/逐项更改、无默认选择、准确中英数量及 pin 文案、旧单条 Undo 保留/替换/恢复、未知保存后改选仍重试原编号列表、关闭后卡片 Retry。
- 中断模型覆盖延迟预览、更新预览、取消重开、销毁、DOM 断开、工作区失效/暂停、离页、页面隐藏、窗口 hidden/inert/CSS visibility、重复激活、remote hide、草稿/筛选/展开保持、pending 离页保护和共享 modal IME Escape/焦点路由。旧 callback 不可更新新窗口；旧 success 不可覆盖新 action 的 Undo/Retry，也不可抢走新草稿焦点。
- 最终聚焦回归 21 个文件 674/674 通过，Node 堆上限 512 MiB、单并发；包含全部 18 个 `local-tasks-*.test.js`、两个 AI tasks 邻接测试和语言默认值测试。JavaScript 语法检查及 `git diff --check` 通过。双语语言文件仅插入新条目，原有条目保持不变。

运行命令：

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-*.test.js \
  tests/ai-context-external-tasks.test.js \
  tests/ai-context-task-edit.test.js \
  tests/locale-defaults.test.js
```

## 验证边界

未运行仓库全量、scale 或额外 20k 测试；未进行原生 Chrome、真实鼠标/键盘激活、布局、系统 IME、屏幕阅读器或截图验收。DOM/事件/焦点和存储故障为明确的合成模型，不能替代原生验证。无截图上传、用户设备、外部 provider、收费平台、凭据或权限变更。此文档不宣称候选已 commit/push、发布 Release/CWS 或完成远端完整 CI。

---

## English

**Select tasks to complete** opens an initially unselected snapshot of the active rows actually displayed: four while collapsed, all while expanded, or all filter matches. The review shows complete numbered originals, count and the exact Next up effect. Choosing, reviewing and canceling write nothing. Changing the selection or observing a newer list requires another review.

Explicit confirmation sends one deeply immutable batch command. The existing workspace lock/fence checks the reviewed revision and every active identity/version before writing. A failed precondition writes nothing. Success requires one complete-state write, one revision/receipt and full readback. Only a selected pin is cleared; text, order, other records and recovery copies stay intact. The operation does not free record capacity.

An uncertain READ/WRITE/VERIFY outcome keeps the same command and original review for explicit retry, even after checkbox changes. Closing cannot cancel a sent write. Card Retry remains reachable after remote hiding without changing that preference. Only the latest receipt may acknowledge the operation, and all fixed result versions/states/timestamps must match. Later mutations, expired receipts or partial results stop the old attempt rather than replaying it.

A fully confirmed, current batch replaces the one page-local Undo slot shared with ordinary completion/removal. Undo reopens all members together only if every completed version still matches. Unrelated records and a newer pin survive; the old pin is not restored. Preview, cancel and uncertain saves preserve the prior slot. No persistent undo queue or batch redo is added.

Two new test files pass 73/73 real Store/Controller/View modeled cases; final bounded regression passes 674/674 across 21 files using a 512 MiB heap and concurrency 1. Coverage includes visible-list scope, exact duplicate/multiline/Chinese/HTML text, immutable commands, lock-waiting conflicts, read/write/verification uncertainty, duplicate activation, receipt aging, all-or-nothing Undo, 500 records, 8 recovery copies near the full byte budget, interrupted dialogs, focus ownership, workspace/lifecycle gates and retained drafts. Existing tests/helpers are unchanged.

These are synthetic checks, not native Chrome, layout, IME, accessibility, screenshot or device validation. The repository-wide/scale suites and remote full CI are outside this local result. No schema, task fields, receipt protocol, generic Controller API, recovery format, manifest, permissions or provider behavior changed. Publication is not claimed here.
