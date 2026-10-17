# 选择并恢复已移除待办 / Batch restoration

2026-10-17。功能 65 为展开的「已移除」增加原生选择入口，使用既有设备本地 Store/Controller、单一写入锁及 operation-ID receipt。manifest 仍为 1.1.155。

## 产品契约

- 候选只来自打开时实际显示、符合当前筛选的已移除行，按保存顺序排列，初始不选。可逐项勾选、全选、清空。选择与预览不写入。
- 编号预览把完整原文与恢复去向分开显示。空格、换行、重复项、中文、表情及 HTML 字面量不被修剪、解析或替换。每项明确显示「恢复到：未完成」或「恢复到：已完成」。只有明确确认才整批保存。
- 所选记录各自回到 removedFrom，并将 removedFrom 清空；保留原文、记录顺序、未选行、当前 Next up、enabled 及恢复副本。不恢复旧置顶、不新增撤销/重做、不改变 500 条记录容量。原有无关撤销仍可用，成员变化则旧撤销失效。
- 修改选择或观察到来源更新使预览失效。若无关写入只刷新行而原候选、原文、顺序、筛选与去向完全相同，可明确重新预览；不静默替换候选。
- READ/WRITE/VERIFY 不确定时保留原始不可变命令及编号预览，只能明确重试；改选不能替换待重试批次。关闭不能撤回已发送写入，卡片 Retry 仍可继续。远程隐藏保留未完成的选择/重试，不写回显隐偏好。

## 存储与界面边界

`reviewRestoration` 在等待既有锁之前复制严格的 id/version/removedFrom 目标，在锁内读取原文及目的地并验证完整下一个快照和字节预算。`restoreBatch` 命令深冻结，要求精确非负安全整数 revision，预分配每个 nextVersion 与时间。锁内先检查全部目标状态、来源、版本及 revision；任一不符零写入。成功只产生一次快照写入、一次 revision 增量及一个既有格式 receipt，并校验完整回读。

latest receipt 重试先校验命令类型及全部固定结果（各自恢复后的状态、空移除来源、nextVersion 和时间），再允许承认旧 revision 的已完成操作。后续 mutation、过期 receipt 或部分结果不能被承认为成功或重放。旧 completeBatch/reopenBatch/batchTargets 语义保持不变，旧批量完成 Undo 仍无 revision 围栏，允许无关编辑和新置顶。

恢复专属来源校验固定原按钮、分区、summary、controls、列表、行、标题、文档和父级，以及当前显示顺序、原文、状态、版本、来源、筛选、revision 和工作区身份/会话/代次。隐藏、inert、CSS、关闭分区、断开/重新挂接、过期节点、错误、待保存、输入法和重复激活不能授权恢复。对话框只豁免自身这次打开所拥有的单个背景 inert 写入；外部变化不能借此获得权限。

新窗口与旧异步回调分别检查所有权，旧回调不能关闭新窗口、清理新草稿或夺取焦点。恢复后分区为空或已收起时焦点回到可见快速输入。剪贴板沿用原有在途锁：打开窗口和刷新不会提前释放已发出的系统写入。本功能无剪贴板写入。

## 验证状态

新增 `tests/local-tasks-restore-batch-store.test.js` 与 `tests/local-tasks-restore-batch-view.test.js`。测试直接使用实际 Store/Controller/View 和合成存储、DOM、故障与有限反射属性 observer 模型。覆盖混合来源、深冻结、严格目标形状/revision、锁等待冲突、全体保存或失败、500 条记录、恢复副本字节预算、I/O 不确定重试、receipt 边界、原文/去向、筛选/来源所有权、取消/反复打开、输入法、焦点、旧 Undo 与复制在途锁。

四项 Node syntax 检查通过；最终资源受控的 16 文件聚焦回归 **855/855 通过**，包括新增 Store **39 项**、新增 View **90 项**，exit 0，未跳过。堆上限 512 MiB，单并发。首轮 816/849 通过、33 个新增 View 正例失败，定位到生产代码首次加载时在安装新 observer 后才启用恢复按钮，使自身 disabled 变化被识别为过期。修复为先 drain/disconnect 旧 observer、同步本次按钮状态、再安装新 observer；未改测试断言或旧测试。第二轮完整重跑 849/849 通过。随后把工作区对象/id/generation/session 同时固定到构造时 owner，并增加 5 项跨工作区正式 redraw 拒绝与 1 项原工作区 redraw 正例；第三轮同 16 文件 855/855 通过。另行独立合成复核最终 **35/35 通过**：12 项 Store、19 项 View、4 项工作区身份改变后正式 redraw 负例；与最终聚焦运行合计 **890 项成功检查**，不重复累计早先运行。独审首轮 30/31 的唯一失败为临时焦点 fixture 在打开的 modal 后尝试聚焦已由 Dialog 正确设为 inert 的后台 search；修正为先关闭待保存 modal、再聚焦 search，并断言已取得焦点。该 fixture 修正未引起生产代码改动，原失败日志保留。

Python 测试首轮 **84/84 通过**；runtime build 与 verify 通过，包含 **133 个文件**，SHA-256：`d4d39108d240624fd0d21e9e824c1888ea1cf793ec07653b6d03f9dae289f0f5`。这些结果仍不等于远端完整 CI。静态核对确认旧 View complete/reopen/transitionBatch 与 Store batchTargets/transitionBatch 片段逐字不变，EN/zh 各增加 16 条翻译且旧值不变，新增英文 fallback 与目录一致；`git diff --check` 通过。

没有宣称实现前 RED、全量 CI、原生 Chrome、真实布局、系统输入法、屏幕阅读器或截图通过。原测试与共享 helpers 不变；无依赖安装、用户设备、收费平台、schema/恢复/receipt 格式、Controller 公共接口、权限、网络、工作流或发布产物变更。

## English

Open **Removed** and choose **Select removed tasks to restore**. Select only from the currently displayed, filtered removed rows. Review the full numbered originals and each separate **Restore to: Active/Completed** label, then explicitly confirm one all-or-nothing save. Each task returns to its own removal origin and clears that origin. Text, record order, unselected tasks, Next up, visibility, recovery copies and capacity stay unchanged. Restoration creates no Undo/redo; unrelated existing Undo remains available.

A separate strictly validated, deeply immutable restore command preserves every target identity, version, origin, next version and time. Review and mutation use the existing backend lock and full snapshot validation. A save requires the exact reviewed revision and every removed target to match, writes one snapshot/receipt, and verifies the complete result. Exact latest-receipt retries acknowledge fixed results before comparing the old revision; later mutations, expired receipts and partial results stop replay. Unknown results retain their original preview/command and require explicit Retry even after selection changes or closing.

The source is fenced to its original native control, section, row/title nodes and parents, displayed values/order/filter/revision, and workspace identity/session/generation. The modal's own background inert transition has a narrow ownership exception; external or stale changes remain blocked. Late callbacks cannot affect a newer dialog or draft. Closing does not cancel an issued write. Existing clipboard-flight ownership is unchanged.

The two new test files use real application classes with synthetic storage, DOM/events and a limited reflected-attribute observer model. They are not native Chrome, layout, OS IME, screen-reader, screenshot or full-CI verification. Four Node syntax checks pass. The final 16-file focused run passes **855/855**, including **39 new Store checks and 90 new View checks**, with a 512 MiB heap, concurrency 1, exit 0 and no skipped checks. The first run passed 816/849; 33 new View positive cases exposed a production ordering bug: the first source observer saw the control’s own loading-to-ready disabled transition as staleness. Synchronizing that render’s button availability after draining/disconnecting the old observer and before installing the new one fixes it. Assertions and old tests were unchanged; the second complete focused run passes 849/849. Pinning workspace object/id/generation/session to the constructor owner adds five rejecting redraw checks and one valid same-workspace redraw check; the third run of the same 16 files passes 855/855. Independent modeled verification passes **35/35** (12 Store, 19 View, four workspace-redraw checks), for **890 checks across the two final successful runs** without counting earlier runs again. The first independent run passed 30/31; its only failure was a temporary focus fixture trying to focus a background search field while the actual dialog helper correctly made it inert. The fixture now closes the pending modal first, focuses search and explicitly verifies that focus was obtained; no production change followed from that fixture correction, and its original log remains preserved. Python tests pass **84/84** on the first run. Runtime build and verification pass for **133 files**, with SHA-256 `d4d39108d240624fd0d21e9e824c1888ea1cf793ec07653b6d03f9dae289f0f5`. Static checks confirm the old transition implementations and locale values remain unchanged, the 16 new English fallbacks match the catalog, and diff whitespace checks pass. These results do not establish remote full CI. No publication is claimed.


### 聚焦复现 / Focused reproduction

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-restore-batch-store.test.js tests/local-tasks-restore-batch-view.test.js \
  tests/local-tasks-reopen-batch-store.test.js tests/local-tasks-reopen-batch-view.test.js \
  tests/local-tasks-complete-batch-store.test.js tests/local-tasks-complete-batch-view.test.js \
  tests/local-tasks-copy-removed.test.js tests/local-tasks-copy-completed.test.js \
  tests/local-tasks-copy-visible.test.js tests/local-tasks-copy-text.test.js \
  tests/local-tasks-store.test.js tests/local-tasks-view.test.js \
  tests/local-tasks-completion-undo.test.js tests/local-tasks-visibility.test.js \
  tests/local-tasks-departure.test.js tests/locale-defaults.test.js
```
