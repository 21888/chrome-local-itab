# Scratchpad “Copy saved text” / 便笺“复制已保存文本”验证范围

2026-10-17。冲突视图增加原生“Copy saved text / 复制已保存文本”按钮，保留既有 Store、Controller、schema 和保存/恢复/导入/导出协议。

## Source and behavior / 来源与行为

- 按钮与“Latest saved text / 最新保存的文本”及冲突操作相邻，仅在冲突预览显示时出现。使用原生 button/type=button 与既有样式，暂时不可用只设置 aria-disabled，不主动 disabled 或 focus。
- 来源严格为显示中保存快照的完整 `controller.state.content`。保留原始 CRLF、CR、空白、BOM、表情、组合字符和字面标记，不截断、不加标签或末尾换行。预览必须等于原始内容或原生 textarea 的 CRLF/CR→LF 展示；规范化仅用于核验展示，不改变 API payload。
- 不取本地草稿、主编辑区选区、Find 查询或导入预览。空保存文本单独提示且不清空剪贴板；不完整 Unicode 也不写入。Store 正常返回已验证数据；额外拒绝缺失/类型错误/非法 revision 或 accessor 形式的保存状态字段，不调用这些字段的 getter。
- 仅允许已加载、有冲突、非 pending/pendingWrite/readError 的已知保存快照。CONFLICT 与本地草稿 TEXT/TEXT_LIMIT/SIZE_LIMIT 允许；WRITE/VERIFY、READ/CORRUPT、WORKSPACE_* 及未知错误拒绝。不笼统检查 writeError，以免阻止仅本地草稿超限的情形。主 textarea 只读或本地草稿过长本身不影响此来源。
- 不增加 Controller 的 refresh-in-flight 状态或包装，不读取/刷新/写入存储，不解决冲突，不编辑 textarea，不移动焦点、光标、选区或滚动位置。
- 默认剪贴板仍由 View 构造时的 `root.navigator.clipboard` 提供。明确激活在同一调用栈调用一次 `writeText`，前面没有 await、权限查询、剪贴板读取或旧式回退。缺失 API、同步异常和异步拒绝给出明确重试/手动复制帮助；没有自动重试。

## Receipt ownership / 回执归属

新路由使用独立的 saved executor/currentness helpers，复用已有每 View 单个 `copyAttempt`、`copyReceipt`、独立 copyStatus 及清理。原全文/选区执行器和事件语义保持；只新增必要的 saved receipt 分支。主 editor input 对 saved receipt 留给其快照检查，全文/选区原失效规则不变；compositionstart 仍保守使三路反馈失效。

构造时固定原 host/controller/store/backend、savedLabel/savedPreview/button/controls/copyStatus、document 和整条 host 祖先链，以及 workspace 对象/id/generation/session。没有 workspace/session 的既有单设备路径仍允许。有 workspace 时必须与 session 同一对象。旧 View 不能通过新 render 重新授权到变化后的 workspace；同 host 新挂载通过私有 WeakMap 撤销旧 owner。不存在跨 View 全局剪贴板锁。

激活时固定 revision/content/enabled 和预览 DOM 值；相同 revision/content/enabled/展示的重新读取可保留反馈，不绑定 state 对象身份、本地 draft generation 或选区。更新保存版本、解决冲突、改变预览、来源替换、隐藏/脱离、workspace 变化、关闭或离开会使旧反馈失效。render 在覆盖预览之前先检查 saved receipt，防止更改的展示被 render 掩盖。

共享尝试槽在读取 DOM/state/clipboard getter 之前占用；getter 同步重入其他复制入口也不能开始第二次写入。调用前检查保存快照和 owner，在最后一次布局/祖先读取后再次检查完整 controller/workspace/session/页面可见性资格，再核验保存数据字段；最后这一步不再次读取布局或祖先。调用后与 promise 结算时再核验。已发出的系统写入即使来源失效或 View 销毁，也要等原 promise 结算后才释放锁。

MutationObserver 只观察原 source 与祖先节点，排空排队记录，覆盖源属性及移除/接回 ABA；savedLabel/button 文本变更和 savedPreview input/change 也会使回执失效。copyStatus 自身属性不属于失效条件，避免执行器自己的 hidden 更新取消回执；其替换或移除仍被固定身份/原父节点的 childList 记录阻止。没有新增全局持久 selection 监听或保存计时器。

Visibility, closed-details, disabled, IME/composing/repeat/keyCode229/default-prevented, departure, original-node ownership and workspace checks are evaluated at activation/currentness. The saved route does not borrow main-editor selection or draft eligibility. A workspace-only mutation with no render, observed DOM/lifecycle event or later check does not promise immediate removal of settled feedback. Completely silent property ABA without events or observable generation cannot be detected retroactively.

## Synthetic evidence / 合成证据

新独立 `tests/local-scratchpad-copy-saved.test.js` 使用真实 View、Store、Controller；通过真实 backend 更新建立冲突。旧测试、旧断言和共享 `tests/helpers/task-dom-model.js` 不变。测试文件自行明确补 textarea LF 规范化、selection 属性、聚焦/滚动检测、剪贴板替身和 observer 记录，不将它们视为浏览器原生实现。

共享模型不自动在 append 时从旧父节点脱离；重定父节点测试显式 remove。键盘测试明确模拟原生默认 click，不以合成事件声称物理键盘复制。MutationObserver 记录按用例显式提供，并不等价于 Chromium 的真实布局或调度。

### Run history / 运行记录

未做本功能 pre-implementation RED，也没有声称基线失败。首次实现准备期间原云执行器离线，未启动任何 Node；恢复后原 `/tmp` checkout 不存在，从已通过 CI 的 feature65 远端 master `7f34ee45ef27a22bd271f1c4090f1c10d00774eb`（tree `fb930fddaee078d81c369059422e2e5805a2fd15`）重新读取并实现。本次执行证据保留在持久工作区，未依赖丢失的临时草稿。

静态检查：`git diff --check` 通过；两份语言 JSON 可解析。原 `copyText` / `copySelectedText` / `executeCopy` 整段与基线逐字节相同。

首次获准窗口使用 heap 512 MiB、并发 1，先执行生产 View 与新测试的 `node --check`，两项均通过，然后执行下列限定八文件回归。修复独审发现后，第二个获准窗口用相同参数、相同八文件和两项语法检查重跑：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-scratchpad-copy-saved.test.js \
  tests/local-scratchpad-copy-selection.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-line-count.test.js \
  tests/local-scratchpad-store.test.js \
  tests/local-scratchpad-boundary.test.js
```

- 2026-10-17 23:43 UTC，首轮 exit 0：570/570 passed，0 failed/cancelled/skipped/todo，5.91 秒。新 saved-copy 文件贡献 272 项；其余 298 项来自七个未修改旧文件。这是修复前的首轮限定回归；此后独审发现下述四个真实漏洞触发用例。
- 完整运行日志 SHA256：`49d280dcc4959c0ea7ee97053f0bd1413e2701c30880680618e13fc23e001928`。
- 覆盖真实 backend 冲突、raw/LF 展示差异、空值/不完整 Unicode、双语/fallback、错误白名单、真实 CAS/WRITE/本地校验失败、三路单锁、pending/settled 来源失效、构造期 workspace/owner、getter 重入、IME/重复按键、DOM ABA、原 copyStatus 隔离、两 textarea 的选区/滚动及无额外 I/O。
- 首轮冻结后，主流程独审 round1 37/37 通过。随后扩充最终 DOM getter 探针，独审 round2 为 41 项、37 passed / 4 failed。失败日志保留，其 SHA256 为 `a7f582523f100d9482e0ee15f8f39fe04308fe63ad509dbb5de3a88c14b3fd28`。
- 四个失败确为实现缺口：clipboard getter 安装的最后一次 controls layout 读取可撤销 conflict、开启 pendingWrite、使 workspace invalidated 或 document hidden；原最终检查只复核 revision/content/enabled，仍会发出写入。先报告并保留失败，再获准修复，没有删减失败断言或改旧测试/helper。
- 修复仅在新 saved 路由拆分身份、DOM 结构和资格检查，在最后一次布局/祖先读取后重核全部保存来源资格，然后再核原始保存快照。新文件加入四个对应回归用例，仍由共享锁覆盖 getter 重入。
- 2026-10-17 23:46 UTC，第二个获准八文件窗口 exit 0：574/574 passed（276 新 saved-copy + 298 旧项），0 failed/cancelled/skipped/todo，6.02 秒。两项 syntax check 均通过。日志 SHA256：`60455981f42e57a76fd49ce020e372d665a02c18cd29f01fdb3c0125f4a87bd8`。
- 最终源码的主流程独审 round3 为 41/41 passed，0 failed/cancelled/skipped/todo，0.25 秒。四个末次 DOM 负例均验证探针确实触发，且 system write 被阻止。日志 SHA256：`78641bdb7cd1e71ce80aad5b215e83c388799f2290f15d3aff204f13c9008030`。
- 最终成功结果为限定八文件 574 项与独审 41 项，分两轮共 615 项通过，并非单个 615 项进程。首轮 570/37 和中间失败的 41 项没有累加为最终测试数。源码、新测试和语言文件在最终两轮后冻结。

### Python and runtime package / Python 与运行包

主流程在修复前、最终源码上分别运行 Python；两轮均为 84/84，最终轮日志 SHA256：`a132c4dbdd7cd9e6d323b6f48e3c7f5da58bf677ef4e573391b6d3a2ece4d8e8`。此处最终验收使用修复后的那一轮。

首次打包输出参数含 `../`，打包工具按已有路径规则拒绝并报 `Output path must not contain parent traversal`，未写出 ZIP；保留失败日志。随后仅将同一目标改为绝对路径，未改工具或检查规则，create 与 verify 均通过。最终 ZIP 含 133 个 runtime 文件，与源码核验一致；SHA256：`702016a4b4a3b4b795f50400fa20aa14f940f0843cac13cbbe2649d1bb1f827c`。最终打包日志 SHA256：`c0721fcadedbb1fc2d50bea7f28638fe3b44d244c543307b355c6a90a892cd80`。工具明确没有进行浏览器测试。

以上独审、Python 与打包由主流程实际运行，实施者已读回日志；实施者没有另开 Python 测试或打包进程。没有本地全套或规模矩阵，也未将既有 feature65 CI 当作 feature66 通过。原冻结记录、失败日志和成功日志均保留。

## Unchanged and unverified / 未改动与未验收

未改 Store、Controller、schema、recovery、导入/导出协议、manifest 1.1.155、CI、旧测试或共享模型。未添加权限、网络、计时器或存储格式。没有 native Chrome、截图、用户设备、收费平台或系统剪贴板验收；真实换行转换、浏览器激活/拒绝、物理 Enter/Space/IME、原生焦点绘制、窄屏布局与辅助技术均不作通过声明。

此记录不宣称本地全套、完整 CI、GitHub Release、tag 或 CWS 已通过/发布。既有升级数据丢失事故仍未解除。
