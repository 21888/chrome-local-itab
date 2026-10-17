# 复制可见已移除任务 / Copy visible removed tasks

2026-10-17。仅在展开的「已移除」区增加「复制可见已移除任务（N）」，复用既有 `copyText` 执行器及本视图 `copyAttempt`，不改变单行、未完成或已完成复制的既有激活语义。

## 范围与合成检查 / Scope and synthetic checks

- 按当前筛选与保存顺序复制实际显示的全部已移除行，包含从未完成和已完成移除的项目。只增加 `1. ` 编号及项间 LF；原有空格、CRLF/CR/LF、多行、Unicode 分隔符、中文、emoji、重复正文和 HTML 字面量逐字保留，不额外添加末尾换行。其他状态、移除前标签、ID、日期、草稿、receipt 与历史副本不进入输出。
- 收起时不可复制，零匹配时禁用。每次点击同步调用已有剪贴板接口，不预先读取存储、请求权限或联网；合成检查核对完整保存集合和读写计数。
- 三个批量按钮及所有状态单行复制共用一个视图内在途锁。失效只丢弃旧反馈，已经发出的系统写入无法撤回，直到 promise 完成或失败才解锁。重复挂载同一容器继续复用该视图；没有新增跨视图或全局锁。
- 独立来源核验检查任务状态、身份、版本、原文、顺序、移除前状态、筛选及渲染版本，并锁定原始区块、按钮、控制行、列表、每行及原文节点的身份、所属文档、父子关系和可见性。旧按钮回调捕获原按钮；不能借用替换按钮的身份。原生 disabled 同样阻止新动作。
- 成功与失败都覆盖收起再展开、筛选、重绘、实际恢复到未完成／已完成、恢复再移除、隐藏或拆卸后返回、源节点替换后还原、已投递和排队观察器记录、状态对象替换、窗口、失焦、页面隐藏／离开、工作空间失效／暂停／替换和销毁。
- 缺少 API、同步异常或异步拒绝保留可选原文，只显示独立手动复制提示；必须再次明确点击才重试。独立 polite status 不覆盖 Save、Retry、Undo、快捷输入草稿或筛选。真实 Store/Controller 路径覆盖 READ、WRITE、VERIFY、写后丢失确认、在途保存与原命令重试，核对单个 receipt 与目标任务。
- 新按钮独立抑制双击尾部、按住 Enter／空格、组字与已阻止的事件；普通键盘激活仍交给原生按钮。测试使用 native-shaped 事件并只在默认动作未取消时模拟 click；独立快捷输入组字不影响已保存的复制来源。
- EN、zh_CN 与英文回退覆盖数量、等待、成功和失败；使用现有可换行紧凑样式。测试包含空集合、500 条上限、1,000 字符原文、重复／多行／Unicode／字面量及所有复制路由互锁。

The new action copies only currently displayed removed rows, in saved order, with exact original strings and only numbered prefixes plus LF separators. It shares the existing per-view clipboard executor and lock, keeps its own live feedback, and never reads or writes task storage. The new scoped predicate checks original section/control/list/row/title ownership and visibility. Stale or interrupted attempts cannot report late results or release an issued write early. All tests use synthetic records and the actual View, Controller and Store with the existing small DOM model; no existing assertions or shared helpers are changed.

## 执行记录 / Execution record

新增 `tests/local-tasks-copy-removed.test.js` 的 **158 个用例**。唯一一次授权聚焦 Node 执行覆盖新旧复制、待办视图／存储、撤销、可见性与离页共 9 个文件：**560/560 通过**，退出码 0，失败／取消／跳过／todo 均为 0，耗时 **6.339 秒**。首跑通过，没有修复后重跑；通过后冻结源码与测试。Node 堆上限 512 MiB，单并发。双语和 manifest JSON 解析、`git diff --check` 通过。Python 工具回归、打包及独立复核由交付复核方另行执行，结果单列下方。

The one authorized focused run passed all **560 tests**, including **158 new removed-copy cases**, with no failures, cancellations, skips or todos. This was the first run; no fixes or reruns followed it. The source and tests were frozen afterward. JSON parsing and whitespace checks also passed; independent review and packaging are separately reported.

聚焦命令 / Focused command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-tasks-copy-removed.test.js tests/local-tasks-copy-completed.test.js \
  tests/local-tasks-copy-text.test.js tests/local-tasks-copy-visible.test.js \
  tests/local-tasks-view.test.js tests/local-tasks-store.test.js \
  tests/local-tasks-completion-undo.test.js tests/local-tasks-visibility.test.js \
  tests/local-tasks-departure.test.js
```

验证指纹 / SHA256:
- View: `32e8a3cec79585453b264d63adcbb3544f381aa2a97c439f5497e79e9e21500c`
- 新测试 / New tests: `fa18029f27baba165c1ab84a7e60b2869766db1602d2029203c745ad81e3d189`
- 聚焦日志 / Focused log: `048056abc5762958876545563f15a7c42ab7827bc4faea1480951d8e97ed2727`

## 独立复核与打包 / Independent review and packaging

独立追加的 **10/10** 临时探针首跑通过，使用原有未改测试模型与真实 Tasks Store/Controller：两种移除来源的相同原文、兄弟批量按钮缺失、旧按钮不能借用替代控件、等价列表替换、三路批量与单行互锁、真实恢复再移除、排队的行拆卸回接，以及禁用和跨文档来源。聚焦和独审两次执行合计 **570/570**，不称为同一次运行。

Python 回归 **84/84**。离线 ZIP 构建及逐文件源码核验均通过，运行时 **133 个文件**，SHA256 `3c01f7d48e17c9bd675c54449b75ef1d01bb957cbf598ad9c288338612edb0e6`。已有 `copyText` executor、Store、Controller、生命周期、工作区、新标签页主脚本、所有旧复制测试及共享 helper 均与基线逐字节一致。仅新增四个 EN/zh 消息键，不改既有翻译；manifest 保持 1.1.155。

Ten independently written probes passed first try. Python passed 84 tests, and both offline build/source-verification passes matched 133 runtime files. These model/static checks do not establish native-browser or OS-clipboard acceptance; exact-commit remote CI remains a separate gate.

## 验证边界 / Validation limits

未进行原生 Chrome、真实系统剪贴板、原生键盘事件生成、输入法时序、屏幕阅读器、布局或截图验收。合成 DOM、焦点、事件及观察器不能替代这些测试。未运行本地全量或独立规模测试，未使用个人数据、凭据、用户设备、外部 provider 或收费平台。

No native Chrome, real system clipboard, actual keyboard/IME timing, screen-reader, layout or screenshot acceptance has been performed. Synthetic checks cannot establish those behaviors. Copying uses the saved version currently displayed in this page and does not query changes from another page that have not reached it. A success message records a past request, not the current clipboard or later filter state. The extension does not control operating-system or other software clipboard synchronization.

改动限于 View、共用样式选择器、双语文案、指南与新增测试。Store、Controller、schema、恢复／导入／导出协议、移除／恢复行为、manifest 1.1.155、权限及工作流不改。此记录不表示已推送、创建标签、发布 GitHub Release、提交 CWS 或通过远端完整 CI。
