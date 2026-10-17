# 单条待办复制原文：验证范围

2026-10-17 的本地合成验证。本项是待办模块的小增强，不代表此前已有承诺未完成或已修复某个已证实缺陷。

## 已验证

- 在实现前，仅运行了新增文件中的首个用例：基线因为缺少 `task_0000` 的 Copy text 按钮而失败。其余后续用例没有在基线上运行，不宣称它们也已经得到红例。
- 实现后，`tests/local-tasks-copy-text.test.js` 的 48 个合成用例通过。它们使用实际 Tasks View、Controller、Store 和独立合成存储，沿用现有小型 DOM 模型，未更改共享测试辅助文件。
- 未完成、已完成、已移除行的当前保存文本；空格、CRLF、多行、中文、emoji、HTML 字面量和 1,000 个 Unicode 字符保持原样。展开后的第 5 条以上记录、筛选结果及相同标题不同 ID 均只复制点击的那一行。
- 点击处理器直接同步调用注入的或 navigator 上的 `clipboard.writeText`，不等待存储读取或权限查询。模拟后端计数验证复制自身没有存储读写；整个保存集合（包括顺序、置顶、版本、receipt、恢复副本）保持一致。
- pending、closed、loading/saving/error 及 READ/WRITE/VERIFY/工作区错误会拒绝复制；隐藏、inert、断开、关闭的 details、旧 ID/版本/文本、工作区失效/暂停和页面离开同样拒绝。
- 单个未结算 promise 阻止重复点击和其他行并发复制，重绘后仍不提前解锁。缺少 API、同步异常、异步拒绝只在当前行显示手动复制提示，不自动重试。
- 晚到成功或失败不覆盖新编辑器、保存错误、Retry、Undo、筛选和草稿，不移动焦点。重绘/筛选/编辑/移除/隐藏后返回/移除后重挂/窗口失焦/页面隐藏/离开/销毁均有覆盖。MutationObserver 的显式记录覆盖已投递与尚未投递的隐藏恢复事件；它仍是合成模型，不等同于原生事件时序。
- 中英文按钮与独立状态反馈通过；元素是原生 `button`，`type=button`，可聚焦。使用 `aria-disabled` 保留当前焦点，真实点击处理器另外检查可用性。
- 复制测试与现有 11 个相邻 Tasks 测试文件合计 338/338 通过，单并发、Node 堆上限 512 MiB。两份语言 JSON 解析和 `git diff --check` 通过。

运行命令：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-tasks-copy-text.test.js tests/local-tasks-view.test.js \
  tests/local-tasks-completion-undo.test.js tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-visibility.test.js tests/local-tasks-edit-return-focus.test.js \
  tests/local-tasks-dialog-composition.test.js tests/local-tasks-departure.test.js \
  tests/local-tasks-batch-view.test.js tests/local-tasks-store.test.js \
  tests/local-tasks-batch-store.test.js tests/local-tasks-boundary.test.js
```

## 未验证及不可保证的范围

本地候选阶段没有运行仓库全量测试或额外规模测试，也没有原生浏览器、系统剪贴板、真实 Enter/空格激活、屏幕阅读器、权限提示、跨设备剪贴板同步或截图验收。合成点击与焦点模型不能替代这些验收；没有使用真实个人内容或凭据。

复制只使用当前页面已经显示的保存版本。它不额外查询全局存储，不能保证另一个页面尚未通知到此页的最新更改。已调用的系统剪贴板写入不可撤回，离开后仍可能完成；只丢弃失效 UI 的晚到反馈。代码不主动网络发送，但不能控制操作系统或其他软件的剪贴板同步。

未修改 Store、Controller、schema、manifest、备份/迁移协议或权限。版本与发布由主流程的独立审核及准确源码 CI 决定；此文档不宣称候选已发布。
