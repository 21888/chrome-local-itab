# 便笺当前编辑区行数：验证范围

2026-10-17，本项只在原有字符配额后追加 `Lines: N` / `行数：N`。保留 `${Unicode 字符数} / 32,000` 前缀，沿用同一普通文本段和已有可换行样式，不新建 live region、控件或持久化数据。

## 实现合同

- 原 render 完成既有 textarea 同步后，仅取一次主编辑区 DOM 文本快照。对同一个快照使用 `for…of` 单遍统计 Unicode 字符与行数，额外状态为常量；不生成行数组、匹配列表或后台索引。逐 Unicode 码点计数与原 `Array.from(text).length` 配额显示语义一致，包括不完整代理项的显示计数；Store 的完整 Unicode、32,000 字符及 128 KiB 保存检查未改。
- 空字符串 0 行，任何非空文本至少 1 行。CRLF 为一次换行，单独 CR/LF 各为一次；末尾换行及连续空行均计入。制表符、视觉软换行、NEL、LS、PS、ZWSP、BOM、组合符号和字面标记不是额外 CR/LF 换行。不 trim、normalize 或 truncate。
- 统计当前 DOM 编辑区，而不是控制器原始文本、最新保存冲突预览或导入预览。浏览器原生 textarea 若已把 CRLF/CR 变为 LF，则使用其 DOM 值。没有把控制器原始偏移套进 DOM，也没有新增选区操作。
- 沿既有 Controller 通知和 render 生命周期更新。保留原加载/只读/IME 同步规则、保存状态、错误、Retry、Find、copy 与 import 各自反馈；不新增保存、读取、网络、剪贴板、timer、全局或选区监听、焦点/选区/滚动操作。页面隐藏事件不额外统计；已有 render 若发生仍读其实际 DOM。销毁后的 render 保持原短路行为。
- 修改仅涉及 View 的统计与英文 fallback、EN/zh_CN 词条、新增独立测试和双语说明。Store、Controller、共享 DOM helper、旧测试和断言、schema、CSS、manifest、权限及完整免费 CI 门禁均保持不变。manifest 仍为 1.1.155。

## 合成模型与诚实边界

新建 `tests/local-scratchpad-line-count.test.js`，运行真实 View、Store 和 Controller 源码，复用未修改的 `tests/helpers/task-dom-model.js`。测试自己的内存 backend、可计数的虚拟 timer、clipboard 和网络哨兵用于隔离副作用；虚拟 timer 不实际触发自动保存，原有 View/Store/boundary 回归另行验证既有流程。

覆盖空/空白、CRLF/CR/LF、末尾及连续换行、Unicode 字面内容及不完整代理项、几何/软换行无关性、32,000 边界与超限不截断；用可计数 getter 核对同一次 DOM 快照的两项数字。加载、保存中与更新输入、写入失败/Retry、保留只读草稿、冲突及显式使用保存文本、导入预览和确认、Find 与复制回执的独立性均通过实际 View/Store/Controller 路径检查。

普通共享 DOM 模型不实现 textarea 原生换行正规化。只有此新测试的一个可选局部 setter 合成模拟 CRLF/CR→LF，用来区分 DOM、控制器和存储文本；它不是原生 Chrome 的测试结果，也不改共享模型。IME 用例记录程序赋值次数、焦点/选区操作、滚动值和合成 undo 哨兵，证明这些模型路径未新增编辑赋值；不宣称已检验浏览器真实撤销栈或物理输入法。

另外核对隐藏/恢复事件无新增 DOM 读取、timer 或 I/O，销毁清理；英文、中文、无 i18n 和缺词 fallback；计数仍为原段落中的纯文本、无新播报/交互控件，并以源码约束检查单遍常量状态、没有新 I/O 或生命周期钩子。可换行依据现有 CSS 静态规则，不冒充窄屏视觉验收。

未在基线运行红例，不宣称 RED。以下是获准单 Node 窗口内的首次运行结果；没有失败或重跑。未运行本地 full/scale 测试或修改完整 CI 门禁。

## 本次执行记录

- 源码与测试编写前：只读核验工作区干净，HEAD `78e3abb44e60193f624e451478a374745a2d9e4f`；原 View 只有字符配额，无重复行数功能。
- 静态检查先完成：Python 解析 EN/zh_CN JSON 并核对新增词条的精确 `{count}` 占位符；manifest JSON 与 1.1.155 冻结；四份双语文档链接；`git diff --check` 均通过。原 Store、Controller、共享 helper、CSS、manifest、旧测试与 `.github/workflows` 的 diff 均为空。
- 获准后依次运行下列两项 syntax 和一个七文件测试命令，均首次退出 0。新行数测试 19/19；七文件合计 298/298，通过数 298，失败、取消、跳过和 todo 均为 0，测试命令耗时约 5.04 秒。实现阶段的 Node 执行仅这两项 syntax 与七文件测试；交接后的独立审核另记如下。

```sh
NODE_OPTIONS=--max-old-space-size=512 node --check shared/local-scratchpad-view.js
NODE_OPTIONS=--max-old-space-size=512 node --check tests/local-scratchpad-line-count.test.js
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-scratchpad-line-count.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-store.test.js \
  tests/local-scratchpad-boundary.test.js \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-copy-selection.test.js
```

测试通过后源码和新测试冻结，只更新本验证记录中的准确结果；再次完成 JSON/版本及 diff 静态复核。

### 交接后的独立复核

独立审核者未修改源码或测试，在另一个单 Node 窗口首次运行额外的 10 项独立检查，10/10 通过，失败、取消、跳过和 todo 均为 0（约 176.91 ms）。它们使用原共享 DOM 模型、真实 Store/Controller 和独立 CR/LF `split` oracle，覆盖空/末尾空行与 Unicode、DOM 与原始控制器文本差异、IME/焦点/光标、较旧保存完成时保留较新草稿、冲突预览隔离、只读保留、保存失败/超限、英文/中文/fallback、Find/import/状态及在途复制回执独立性、销毁与无新增生命周期副作用。生产计数本身不使用 `split`。

因此是两次独立成功运行：聚焦回归 298 + 独立审核 10，合计 308 次通过；不是单次 308，也不是失败后重跑。独立审核日志为本地 `itab155-scratchpad-line-count-independent.tap`。

独立审核者还首次完成 Python 测试 84/84（约 2.087 秒，`itab155-scratchpad-line-count-python.log`），以及静态 package build + verify（`itab155-scratchpad-line-count-runtime.log`）：133 个 runtime 文件，source bytes 3,894,975，包 SHA-256 为 `286dce5562145b44a3ffd347645eb8880c891c75da2112de60cbebb987a1f89f`。此包来自上述 HEAD 的修改中工作区，版本仍为 1.1.155；它是本地静态打包证据，不是已提交候选或新发布产物。打包工具明确没有执行浏览器测试。

本次补录只更新验证文档，没有修改冻结源码或测试，没有测试重跑。

## 未验证与发布状态

原生 Chrome、实际撤销栈、物理键盘/输入法、窄屏实际布局、屏幕阅读器均未验收。没有新浏览器操作、截图、用户设备、网络服务或付费平台验证；已有截图不能证明本项的原生效果。

上述独立审核已通过；准确候选提交与完整免费 CI 仍由主流程核对。本记录不表示已 commit/push，不声明新 tag、GitHub Release、版本升级或商店发布。
