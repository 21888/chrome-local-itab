# 选择并重新打开已完成待办 / Batch reopening

2026-10-17。本功能沿用批量完成的选择、预览、保存和明确重试流程，以及既有 `reopenBatch` 与 operation-ID receipt。

## 行为与边界

- 入口位于展开的「已完成」分区。候选仅来自打开窗口时实际显示、符合当前筛选的已完成行；初始不选，可逐项勾选、全选和清空。关闭的 details、隐藏/断开的入口和过期 DOM、文字、身份、版本、状态、顺序、筛选或 revision 均不能开始选择。
- 选择与预览显示完整原文，含重复文字、空格、换行、中文、表情及 HTML 字面量。预览只读；明确「确认重新打开这 N 项」才一次整批保存。改选或观察到更新会使预览失效。
- 不改变持久化 schema。审阅后的 `reopenBatch` 带可选的精确 revision，在既有锁/写入围栏中与每个 done/id/version 一起校验，任一失败零写入。旧批量完成 Undo 不带 revision，仍允许无关编辑及新置顶。成功仅一次完整快照写入、一次 revision 增量及一个 receipt，并回读整个结果。
- 保留原文、记录顺序、未选记录、enabled、恢复副本和当前 Next up；不恢复旧 pin、不新增 Undo/redo。原有无关 Undo 保留；若其成员因重新打开而变化，旧槽不再可用。重新打开不删除记录，不释放 500 条容量。
- READ/WRITE/VERIFY 不确定时保留原始不可变命令和编号预览，只由明确 Retry 重试；改选不能替换待重试内容。关闭不能取消已发送写入，未知结果可从卡片 Retry 继续。latest receipt 校验位于 revision 前置条件之前，并验证全体固定结果；后续 mutation、过期 receipt 或部分结果均不能被当作成功或自动重放。
- 共享对话框继续保留草稿、离页保护、工作区失效/暂停及焦点所有权处理。远程隐藏后，未完成的选择/重试暂时保持可达，不写回 enabled。旧回调不能关闭新窗口、改变其草稿或抢走焦点。完成分区变空或关闭后不把焦点送入不可见按钮。
- manifest 保持 1.1.155；无 Controller 通用接口、导入恢复格式、receipt 格式、权限、网络/provider、工作流或发布产物修改。

## 验证

新增 `tests/local-tasks-reopen-batch-store.test.js` 和 `tests/local-tasks-reopen-batch-view.test.js`，使用合成数据与实际 Store/Controller/View。最终 11 文件聚焦回归 **403/403 通过**；另有 **13/13 独立合成复核通过**，合计 416 项，exit 0。初次聚焦运行的一项新测试未为人为更改的状态递增 revision，被既有过期 DOM 防护正确拦截；修正该测试准备后完整重跑通过，无对应生产代码变更。

覆盖：精确原文与深冻结命令、可选 revision 的严格类型校验、单写/全体失败、锁等待冲突、旧 Undo 兼容、500 条记录及含 8 份恢复副本的字节预算；读取/写入/回读故障与明确重试、receipt 时效及部分结果；中英入口、显示/筛选范围、无默认选择、改选、取消、重复激活、旧 Undo、延迟/旧回调、工作区/离页/隐藏状态、远程隐藏、草稿和焦点路由。

补充检查：Python 测试 **84/84 通过**；runtime 构建及校验通过，包含 **133 个文件**，SHA-256：`4fd4601db4d8cbc89e84580326c9b9523d9da074096c1bbf263e1da126c17991`。这些结果不等于远端完整 CI。

复现聚焦回归（Node 堆上限 512 MiB、单并发）：

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-reopen-batch-store.test.js tests/local-tasks-reopen-batch-view.test.js \
  tests/local-tasks-complete-batch-store.test.js tests/local-tasks-complete-batch-view.test.js \
  tests/local-tasks-store.test.js tests/local-tasks-view.test.js \
  tests/local-tasks-completion-undo.test.js tests/local-tasks-copy-visible.test.js \
  tests/local-tasks-departure.test.js tests/local-tasks-visibility.test.js \
  tests/locale-defaults.test.js
```

13 项独立复核补充检查了无关整批 Undo、非空已完成分区在保存中收起、窗口 blur 后焦点所有权、行身份/数量/隐藏/CSS/断开/DOM 顺序及工作区替换。原有测试、assertions 和 helpers 未修改。静态检查确认 en/zh 各新增 14 条翻译、所有旧条目不变，英文 fallback 与新增英文目录值一致；`git diff --check` 通过。

未运行仓库全量或 scale；无原生 Chrome、真实布局、系统输入法、屏幕阅读器或截图验收。DOM/事件/焦点及存储故障为合成模型。未使用用户设备或收费平台，不含个人资料或凭据。本文件不宣称已提交、推送、发布 Release 或通过远端完整 CI。

## English

Open **Completed** and choose **Select completed tasks to reopen**. Only the completed rows actually displayed at opening are eligible, including the current text filter. Select any subset, review its complete numbered originals, then explicitly confirm one all-or-nothing save. Selecting, reviewing and canceling write nothing. A closed section, hidden/detached entry or stale rendered snapshot cannot open the selector.

The shared batch dialog retains its existing lifecycle, draft, focus and explicit-retry protections. Reviewed reopening uses the existing `reopenBatch` command with an optional strictly validated revision checked inside the write lock. Revision-free completion Undo still permits unrelated edits and new pins. All selected completed identities/versions must match. Text, stored order, other records, visibility, recovery copies and Next up remain unchanged; no new Undo/redo action is created. Reopening does not free record capacity.

Unknown saves retain the exact original command and numbered preview, even after checkbox changes or closing. An explicit retry acknowledges a matching latest receipt before checking the old revision, avoiding duplicate writes. Later mutations, expired receipts and partial results stop replay. An existing unrelated Undo stays usable; changed members invalidate its availability.

The final 11-file focused regression passes **403/403**, including the unchanged completion regression and new reopening Store/View tests; **13/13** additional independent modeled checks pass, for 416 checks total, exit 0. The command above uses a 512 MiB heap and concurrency 1. A new test fixture initially omitted its synthetic revision increment and was correctly rejected by the stale-DOM guard; correcting the fixture required no production change. Independent checks add disjoint batch Undo, collapsing a nonempty Completed section during save, window-blur focus ownership, stale/hidden/detached/reordered rows and workspace replacement. Each locale adds 14 entries without changing old values; English fallbacks match the new catalog, and diff whitespace checks pass. Python checks also pass **84/84**; runtime build and verification pass for **133 files** with the SHA-256 recorded above. These checks do not establish native Chrome, layout, OS IME, accessibility, screenshots, repository-wide/scale tests or remote full CI. Schema, recovery and receipt protocols, manifest 1.1.155, workflows and release artifacts stay unchanged. No publication is claimed.
