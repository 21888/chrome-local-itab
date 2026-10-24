# Countdown 清空后的 Hide 恢复入口

## 范围

修复首页卡片的一条跨页面恢复路径：本页 Hide 写入失败后，另一页通过真实 Controller 保存关闭、空标题和空日期。原 View 因没有有效天数隐藏整张卡片，导致 Retry / Load saved 虽然自身未隐藏，仍被隐藏祖先挡住。

恢复表面仍只归本卡未决的 Hide 所有：原操作必须是 `visibility(false)`，操作基线为已显示，且仍存在 pending、error、readError 或 conflict。普通隐藏、空状态及没有本卡 Hide 的远端清空，不会因后台读取失败被显示。

无有效日期时标题、日期和天数保持空白，不生成虚假日期、NaN 天数或日历刷新定时器。Store、Controller、页面生命周期、存储结构及 manifest 版本不变，Retry / Load saved 命令语义不变。

## 回归证据

以 `d4879c22b2e40c98d7f1084082920bc8f9cc7825`（tree `fb2c6da1816175528c42dc5db516512543159349`）为基线，先加入三个测试，再修改 View：

```sh
node --test --test-name-pattern='failed Hide remains reachable|cleared Countdown keeps|empty or clean remotely cleared' tests/local-countdown-view.test.js
```

- 基线：2 个失败、1 个通过。失败断言分别为恢复卡被隐藏，以及 Load saved 的祖先导致可见区域为空。
- 修复后：3 / 3 通过。
- 使用真实 Store、真实 Controller 及 View，后端模拟实际写入失败；第二个 Controller 通过 `setDraft` / `save` 保存清空状态，revision 从 1 变为 2。没有直接伪造 Controller 的错误或冲突字段。
- 实际点击 Retry，暂停并恢复其读取：pending 期间卡片保持显示，随后只读确认冲突，不重放 Hide、不恢复旧数据。
- 实际点击 Load saved，暂停并恢复其读取：pending 期间卡片保持显示，完成后清掉未决状态并隐藏；另覆盖读取失败后保留恢复入口、再次成功读取后隐藏。
- 负对照覆盖初始空状态、无未决 Hide 的远端清空、后台读取错误与 pending Retry，均保持隐藏。既有测试继续覆盖有标题日期的故意隐藏和失败确认。

相关六个 Countdown 文件合计 115 / 115 通过：

```sh
node --test tests/local-countdown-store.test.js tests/local-countdown-controller.test.js tests/local-countdown-view.test.js tests/local-countdown-integration.test.js tests/local-countdown-boundary.test.js tests/local-countdown-workspace-navigation.test.js
node --check shared/local-countdown-view.js
node --check tests/local-countdown-view.test.js
git diff --check
```

## 验证限制

以上为 Node 与 DOM 模型验证，仅使用合成数据；未运行全套 Node 回归、真实浏览器、原生键盘/屏幕阅读器或视觉验收，没有截图。此修复不代表发布或商店验收。

原问题阻断卡片内恢复入口，但现有通知的 Reload page 仍可明确放弃页面后离开，不能将它描述为绝对无法离开或数据丢失。

## 生产页面限定复验 · 2026-10-21

云端 Chromium 加载 master `89df9e7cd0c007a4eaf7411e2aefc76efca453d0` 的生产首页，全部 138 个运行文件 SHA-256 与冻结记录一致，manifest 为 1.1.157。英文浅色合成夹具使用页面内存浏览器 API 桥接，保留真实 Workspace Session、Countdown Store/Controller/View；没有安装扩展。

初始化产生 5 次 RAM 写入。通过夹具按钮仅让下一次包含 Countdown 的 bundle 写入在修改前失败，再点击生产 Hide：失败被拒绝一次，写入数仍为 5。随后夹具创建另一个真实 Countdown Controller，经 init、setDraft、save 保存 enabled=false、空标题、空日期，revision 0→1；成功写入总数为 6。此时生产卡片仍未 hidden，实际布局矩形存在，日期内容为空，Retry 与 Load saved 在可访问性树中可达，并显示先加载较新数据再选择 Hide 的提示。

键盘 Enter 激活 Retry 后，卡片仍可见，Retry 消失、Load saved 保留；写入数仍为 6，已保存空状态和 revision 1 未变。再用 Enter 激活 Load saved，卡片 hidden=true、布局矩形数归零，写入数仍为 6。没有恢复旧日期或重放 Hide，没有手工伪造 Controller 错误/冲突字段，也没有生产代码修改。两步完成后的焦点快照均为页面根，不宣称恢复到某个指定控件。

这是同一合成页面中两个生产 Controller 的可观察恢复流程，不是真实跨标签竞争、扩展落盘、浏览器重启、崩溃/配额或历史事故恢复证明；没有重跑受控延迟读取、Load saved 读取失败、中文/深色及读屏矩阵。外部/文件动作计数为零，自有页面和服务已关闭。
