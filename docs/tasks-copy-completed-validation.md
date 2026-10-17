# 复制当前显示的已完成待办：验证范围

2026-10-17。本项仅在展开的「已完成」区增加「复制当前显示的已完成待办（N）」，复用既有已完成快照核验和复制执行器。

## 行为和合成检查

- 按当前筛选与保存列表顺序复制全部实际显示的已完成行。只增加 `1. ` 编号前缀及项间换行；空格、CRLF、多行、重复原文、中文、emoji、HTML 字面量及 1,000 字符正文均逐字保留。未完成、已移除、置顶重复项、草稿、ID、日期、receipt 和历史副本不加入输出。
- 收起时不可复制；零匹配时禁用。点击直接同步调用剪贴板，不先等待存储或权限工作。检查复制前后的完整存储集合及读写计数，验证复制不产生待办存储 I/O。
- 本视图的已完成批量、未完成批量与所有状态的单行复制共用既有 `copyAttempt`。失效反馈不释放已发出的系统写入锁，只有请求完成或失败才解锁。重复挂载同一容器复用原视图；本项没有新增跨视图、跨页面或全局剪贴板锁。
- 当前记录身份、版本、文字、状态、顺序、筛选、渲染版本和实际可见性均须吻合。读取/保存错误、在途保存、隐藏/inert/断开、工作空间失效/暂停、离页及编辑/导入/重新打开窗口均阻止新复制。
- 晚到成功及失败分别覆盖收起、收起后展开（已投递与排队观察器记录）、筛选、重绘、任务编辑/移除/重新打开、打开后取消重新打开窗口、短暂隐藏或拆卸、文字改回、失焦、页面隐藏/离开、工作空间变化和销毁。旧反馈丢弃，不自动重试、不抢焦点；已经发出的系统写入无法撤回。
- 独立 polite status 不替换 Save、Retry、Undo 或草稿。缺少 API、同步异常和异步拒绝只显示安全的手动复制提示。实际 Store 路径覆盖 READ、WRITE、VERIFY、写后丢失确认、在途保存及原命令重试，确认 receipt 与目标任务不重复。
- 中英文和英文回退均覆盖数量、等待、成功及失败。原生按钮保持同一节点：零项使用 disabled，其他不可用状态沿用 aria-disabled 与点击检查。双击尾部和 Enter/空格连按被抑制，普通键盘激活仍交给原生按钮。独立快捷输入组字不改变已保存的复制来源。

`tests/local-tasks-copy-completed.test.js` 的 117 个新用例使用独立合成后端、实际 View/Controller/Store 与既有小型 DOM 模型，不修改共享测试辅助文件或此前断言。唯一一次本地聚焦 Node 运行覆盖新旧复制、批量完成/重新打开、相邻待办与语言回归，16 个文件共 **668/668 通过**，零失败、跳过或取消，耗时 16.12 秒。Node 堆上限 512 MiB、单并发。双语及 manifest JSON 解析、`git diff --check` 通过。

聚焦命令：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-reporter=tap \
  tests/local-tasks-copy-completed.test.js tests/local-tasks-copy-visible.test.js \
  tests/local-tasks-copy-text.test.js tests/local-tasks-reopen-batch-view.test.js \
  tests/local-tasks-complete-batch-view.test.js tests/local-tasks-view.test.js \
  tests/local-tasks-reuse-draft.test.js tests/local-tasks-visibility.test.js \
  tests/local-tasks-departure.test.js tests/local-tasks-edit-return-focus.test.js \
  tests/local-tasks-dialog-composition.test.js tests/local-tasks-completion-undo.test.js \
  tests/local-tasks-pinned-completion.test.js tests/local-tasks-store.test.js \
  tests/local-tasks-boundary.test.js tests/locale-defaults.test.js
```

独立复核另运行 8 条合成探针，全部通过：剪贴板调用重入、调用内部同步重绘、孤立 CR/Unicode 分隔符原文、非 Promise 返回、快速失败后的双击尾部、祖先 details 收起再展开的排队记录（成功/失败），以及真实审阅整批重新打开后再次复制的新范围。探针只使用独立临时脚本，没有修改生产逻辑或既有断言。初次探针拒绝分支误用了无 reject 的测试 helper；修正探针后通过。聚焦与独审共 676 条通过。

Python 打包/发布工具回归 84 条通过；离线构建及复核 133 个 runtime 文件，SHA256 为 `59e3efcaee034ad3995fd689661c4c376ac5dc6369c56e63ed6f4b455ffd879e`。

## 验证边界

未进行原生 Chrome、真实系统剪贴板、原生键盘事件生成、布局/屏幕阅读器、权限提示或截图验收；合成事件、观察器及焦点模型不能替代这些测试。没有个人资料、凭据、用户设备、外部 provider 或收费平台。本地不运行仓库全量或额外规模测试。

复制使用当前页面已显示的保存版本，不查询其他页面尚未通知到此处的更新。成功提示仅代表过去一次请求完成，不是后来筛选或剪贴板的实时状态。扩展不主动联网，也不控制操作系统或其他软件的剪贴板同步。

改动限于 View、少量样式、双语文案、指南和新增测试；Store、Controller、schema、备份/恢复协议、manifest 1.1.155、权限、工作流与发布配置保持不变。此文档不宣称已经推送、发布或通过远端完整 CI。
