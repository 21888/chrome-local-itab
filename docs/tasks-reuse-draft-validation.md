# 用原文新建待办草稿：验证范围

2026-10-17 的本地合成验证。此项为待办模块新增的小功能：已保存记录的文字可用来开启独立草稿，只有明确点击「添加」才保存一条新的未完成待办。

## 已验证的行为

- 实现前只运行了新增文件首个用例，真实行入口因缺少 `New task from text` 按钮失败。初始断言帮助文字沿用了 `copy button`，实际查询参数是新按钮的完整标签；后续已改为显示实际标签。其余后续用例没有在基线上运行，不宣称取得红例。
- 新测试使用真实 Tasks View、Controller、Store 和独立合成存储，沿用现有 DOM 辅助模型，未修改任何旧测试辅助文件或容量/安全断言。
- 未完成、已完成、已移除均可用。打开、修改、取消不发生待办存储读写或剪贴板调用。快捷输入框、筛选、原记录所有字段、完成/移除状态、顺序、置顶、历史副本和现有 Undo 不被替换；显式添加只在末尾增加一条新的 active 记录。
- 保存原文保留空格、多行、中文、emoji、HTML 字面量及最多 1,000 个 Unicode 字符。多行仍是一项。独立的 textarea 值归一化模型验证：未发生实际 input 编辑时提交保存原文（含 CRLF/CR），编辑后提交 textarea 值（CRLF/CR 归一化为 LF）。这是 HTML 值规范的模型验证，不是 Chrome 的原生事件实测。
- 来源打开后的编辑不重写草稿、不增加源版本冲突。打开前，失效版本/状态/文字/行身份、隐藏/inert/脱离 DOM、关闭的 details、过时渲染、等待/错误/编辑/导入窗口、工作区失效/暂停和离页均拒绝新入口。
- READ、WRITE、VERIFY 类失败保留同一 operationId 和上次确切文本，单独显示「重试上次添加」和待重试原文；不能用普通添加覆盖未确认尝试。写入前失败、写入后回执不确定、回读失败和未落盘核验失败均覆盖。重试不自动添加新草稿；新草稿需要独立的明确添加。
- 保存中/失败后的新输入、ABA 改回、无 input 的 compositionstart 不被旧结果关闭。旧结果只有在当前窗口、世代、文本、控制器 revision 与最新 receipt 都仍对应时才能关闭；后续确认操作后的老 receipt 重试返回 CONFLICT，保留草稿且不自动新建。
- 在途重复点击、双击、重复键和组字 Enter/Escape 不重复提交；遗漏 compositionend 的 blur 次轮释放可恢复后续操作。按钮禁用前只将其拥有的焦点移到当前编辑器。关闭时按任务身份寻找重绘后的同一按钮，否则回到可见快捷输入；外部新输入、移除的外部焦点或窗口失焦不被晚到结果夺取。
- 开启草稿保持离页/重载保护，`saveDrafts` 不自动添加本窗口或旁边快捷草稿。远端隐藏偏好不会隐藏仍打开的窗口或其在途添加；保存结束后才遵从偏好。工作区退役、暂停、更换或离页阻止后续提交；已经发出的写入不能被关闭窗口取消。关闭后到达的成功/失败不能清除后续窗口草稿或抢外部焦点。
- 已有 500 条记录、1,001 字符、空白文本和接近 2 MiB 的集合均被既有校验拒绝，完整保留当前草稿与所有原数据；不截断、不删除。中英文入口、说明、反馈及英文 fallback 均有覆盖。

## 本次限定检查

仅运行下列八个明确文件，单并发、Node 堆上限 512 MiB，不运行通配符、全仓库或额外规模矩阵：

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-reuse-draft.test.js \
  tests/local-tasks-copy-text.test.js \
  tests/local-tasks-batch-view.test.js \
  tests/local-tasks-dialog-composition.test.js \
  tests/local-tasks-edit-return-focus.test.js \
  tests/local-tasks-departure.test.js \
  tests/local-tasks-store.test.js \
  tests/local-content-lifecycle.test.js
```

新增文件 56/56 通过；八个限定文件合计 241/241 通过，无失败、跳过或取消。JavaScript 语法检查、中英文语言 JSON 与 manifest JSON 解析、`git diff --check` 均通过。未修改 manifest 或任何发布文件。

## 未验证与继承边界

没有新原生浏览器、系统剪贴板、真实输入法、原生 Enter/空格触发、屏幕阅读器、截图、用户设备、网络接口或付费平台验收。模型事件和焦点不能替代原生时序与可访问性验证。已有待办原生记录和截图只代表对应历史功能/源码，不覆盖本功能；[历史待办验收](local-tasks-validation.md)已注明此范围。

新窗口不改变 Store、Controller、schema、manifest、备份/迁移格式、权限或工作区协议。沿用单条 add 与最多 128 条 receipt 的既有幂等范围，不承诺 receipt 过期后的无限期防重，也不扩展旧记录移至恢复副本后的协议保证。来源快照是当前页面显示的已保存版本，不额外查询尚未通知到本页面的其他页面更新。

草稿只在当前页面内，关闭窗口/页面不会持久保存未提交文字；浏览器是否展示离页警告仍由浏览器决定。独立审核、准确候选源码 CI、发布状态由主流程另行核对，此记录不宣称 GitHub Release 或商店已发布。
