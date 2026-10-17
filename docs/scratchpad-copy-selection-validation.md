# Scratchpad “Copy selected text” / 便笺“复制选中文本”验证范围

2026-10-17。新增原生工具栏按钮与选区回执，复用原有独立复制状态和每 View 单个在途写锁；没有变更保存或导入/导出协议。

## Source and behavior / 来源与行为

- 真实新标签页仍通过 `newtab.js` 挂载 `LocalItabScratchpad.View`，默认剪贴板是 `root.navigator.clipboard`。选区按钮紧邻全文复制按钮。
- 选区 payload 是点击时主 textarea 的 `value.slice(selectionStart, selectionEnd)`。范围为 UTF-16，原生 textarea 的 CRLF/CR 规范化由 DOM 自身完成。本操作不把控制器偏移套到 DOM，也不取浏览器全局选区、最新保存文本或导入预览。全文复制仍向 API 传入完整原始 `controller.draft`，保留 CRLF。
- 仅验证选区是否非空、整数、范围有效且为完整 Unicode。保留空白、多行、BOM、表情、组合字符和字面标记；不截断。片段外非法 Unicode 及超出保存限制的合法片段不阻止复制。
- 已加载、可见的保留草稿可复制，包括只读读取失败、保存中、保存失败、冲突和超限。未加载、组合输入、隐藏/inert/脱离、页面离开或工作区不可用阻止选区操作。
- 两条复制路由在点击调用栈内通过同一个参数化执行器调用 `writeText`，没有等待存储、预查询权限、剪贴板读取、旧式回退或自动重试。保存/Retry/冲突状态、Find 与导入反馈不属于复制操作。
- 不调用 focus、setSelectionRange、setDraft 或 save；失败后原文字和选区仍保留，可手动复制或明确再次点击重试。原生鼠标点按钮本身的默认焦点行为由浏览器决定，代码不强行恢复焦点。

## Receipt ownership / 回执归属

选区回执固定原 editor、按钮、host、controls、copyStatus 及 document，DOM 文本、精确范围和方向、原 controller 身份及 draft/generation，以及 workspace 对象/id/generation 和 session。每 host 的 WeakMap 仅区分当前 selection owner，不是全局剪贴板锁。未 destroy 的旧 View 也不能在新挂载后通过重新接回旧控件取回选区权限。

源节点替换、重定父节点、document/status/controls 不匹配，或旧回调指向新控件，均不能发布旧选区反馈。回执始终清理自己固定的状态节点。MutationObserver 捕获在途/已结算回执期间的隐藏/脱离 ABA；仅选区路由还观察按钮 disabled→enabled 以及固定状态节点的移除/接回 ABA。状态节点自身属性不纳入失效判定，避免把执行器主动显示/隐藏状态当作外部失效。全文观察范围不变，结算和调用前排空排队记录。editor 的 select/selectionchange，以及有关的 document selectionchange，会撤销选区反馈；不相关的全局选区不会撤销同范围回执，也不会撤销全文复制反馈。

范围改变但没有事件时会在下一次 currentness 检查中核验。没有新增 workspace 订阅；仅 workspace 通知而没有 render、相关 DOM/生命周期事件或后续检查时，不承诺即时清除已结算提示。模型不把完全无事件、无可观察 generation 变化的历史 ABA 说成可检测。

clipboard getter 和实际调用可能同步重入。执行器预先占住本 View 的尝试槽，取 getter 后重新核验，写入调用后再次核验；已发写入即使被编辑、隐藏、销毁或重新挂载作废，锁也要等该 promise 真正结算后才释放。新 View 维持原有独立锁范围。相同草稿正常保存只更换 state，不会凭此撤销仍有效的选区回执。

有 backend workspace 时，选区要求全局 session 与其为同一对象，缺失 session 也阻止操作；不收紧旧全文路由的 admission。

新按钮单独处理 defaultPrevented、双击第二次、held Enter/Space 和 IME 守卫；未重写旧全文按钮的键盘语义。

## Synthetic evidence / 合成验证

新独立测试文件：`tests/local-scratchpad-copy-selection.test.js`。真实 View、Store、Controller；既有测试断言和共享 `tests/helpers/task-dom-model.js` 未改动。

测试内显式补 textarea LF 规范化、selectionStart/End/Direction、剪贴板替身和 MutationObserver 记录。这些不是浏览器原生行为。共享模型不会自动改变 selection，也不会在 append 时自动把旧父节点脱离；重定父节点测试先显式 remove。键盘测试显式模拟一次默认 click，并检查重复 keydown 被阻止，不以合成事件声称物理键盘完成复制。

Coverage includes exact slices and full-text CRLF compatibility; malformed outside Unicode and over-limit slices; invalid ranges and surrogate cuts; retained error/save/conflict states; both shared-lock directions; rejection and explicit retry; selection/draft/source/workspace ownership and ABA; queued mutations; same-draft save; stale callbacks/remounts; focus/range/direction and Find/import isolation; English/Chinese/fallback messages; and no additional I/O.

No pre-implementation RED was run for this feature; no baseline-red claim is made.

三轮均使用同一精确四文件窗口，heap 512 MiB、并发 1：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-scratchpad-copy-selection.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-find-text.test.js
```

- 首轮 exit 1：260 tests，259 passed、1 failed、0 skipped/cancelled/todo。唯一失败为新测试的导入隔离夹具：共享模型没有 `importFile.click`，在调用 chooseImport 时抛 TypeError，还未进入复制断言。先报告并保留日志，再只在新测试补显式 chooser click 空替身，未改旧模型或旧断言。
  - Log SHA256: `bb63681c69723e95f71fb3353c741e92a94aa10a84b2243e14d3485f43fb38d6`
- 第二轮 exit 0：262/262 passed，0 failed/skipped/cancelled/todo。包含仅选区的缺失 session 与原 controller 身份用例。
  - Log SHA256: `310b057781c62120b11bb0b12995ac4ed5a3460818d00df15327ab7a4f6b75e1`
- 第三轮 exit 0：265/265 passed，0 failed/skipped/cancelled/todo。增加 disabled ABA、固定状态移除/接回，以及执行器自身 status.hidden 不误伤回执的针对性覆盖。新选区文件贡献 120 tests；其余 145 项来自未修改的三个旧测试文件。随后冻结源码与测试。
  - Log SHA256: `ffe9ee6e940f2c4f5f82b60bb0490bd7c6eadf80479b66ae84db5d9b72e74cc8`

`git diff --check` 通过。这是限定四文件模型回归，没有运行本地全套测试。

## Independent review / 独立复核

主流程对冻结源码另外执行了 15 项独立用例，首轮 15/15 通过：CRLF 两路来源区别、未选区域非法 Unicode、选区/全文互锁、选区 ABA、同稿保存、getter 重入、旧 View 重挂、状态节点替换/回接、disabled ABA，以及缺失 session 和 controller 身份。实现者最后一轮 265 项和独立审查 15 项为两次独立运行，共 280 项通过；不是单个 280 项测试进程，也没有将前两轮重复累计到这个数字。

主流程另行报告 Python 84/84 通过。ZIP 构建及与源码内容核验通过，两者均包含 133 个 runtime 文件；ZIP SHA256：`e108f5823d8838e18a5551ddb2e69f7269bd32636023dddc88d839bf163ff453`。以上为主流程复核结果，实施者没有另外运行 Python/package 或本地全套。

## Unchanged and not tested / 未改动与未验收

Store、Controller、schema、recovery、导入/导出协议、manifest 1.1.155、workflow、旧测试及共享模型未修改。没有新 worktree/repository copy，没有删除源码或证据，没有本地全仓库或规模矩阵，没有运行浏览器/nativeChrome、用户设备或收费服务。

没有截图，也没有真实 Chromium/系统剪贴板结果。实际系统换行转换、用户激活与权限拒绝、物理 Enter/Space/IME、原生选区事件时序、窄屏布局、焦点绘制和屏幕阅读器仍需验收。精确 API 实参及有限 DOM 模型不能替代这些检查。

本记录只声明上文限定模型回归与主流程报告的独立/Python/package 复核，不宣称完整 CI、GitHub Release、tag 或 CWS 已通过/发布。既有升级数据丢失事故仍未解除。
