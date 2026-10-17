# Countdown Copy milestone：有界验证范围

2026-10-17，Feature 57。可见的单里程碑倒计时卡片新增 **Copy milestone / 复制里程碑**，保留原有 **Copy date / 复制日期**。本文只记录本次明确执行的合成检查，不代表浏览器、系统剪贴板、原生键盘或视觉验收。

## 实现边界

- 新按钮使用卡片当前已验证、已显示的保存快照，输出严格为 `saved title + "\n" + saved YYYY-MM-DD`。只有一个 LF 分隔符，没有末尾换行、天数、标签、ID、设置草稿或其他元数据。原 Copy date 仍只输出十字符日期；TXT 导出／导入格式未改。
- 两个按钮复用同一个同步调用剪贴板的 executor、保存状态验证及模块级 `copyFlight` 锁。写入之前没有 await、存储读取／写入、权限查询、剪贴板读取或回退写入。失败后只能再次显式选择；没有自动重试。
- 回执记录动作类型、真实来源按钮、标题／日期／状态节点、保存对象及字段、readGeneration；同时验证挂载拥有者、固定工作区／session、页面生命周期及 DOM 可见性。旧／已替换按钮的回调不能借用新的按钮。MutationObserver 只因当前回执来源或标题／日期及其祖先变化失效；移除另一个复制按钮不应影响当前动作。
- 两个复制动作共用独立 polite 反馈，最新显式动作的待决／成功／失败文案对应其动作；保存、Hide、恢复、重试、冲突和导出状态不被复制覆盖。隐藏、编辑、保存／读取变化、离开、销毁及拥有者变更使回执失效，但不提前释放已经发出的系统写入锁。
- 使用现有可换行的 controls 样式和稳定的原生 `button type=button`，以 aria-disabled 表示不可用并由点击处理器强制检查，不自动聚焦。新按钮拒绝双击后续点击、已取消点击、held-key repeat 和 IME；没有新增全局快捷键。Copy date 的原入口保留；共享新增 Edit、disabled-source 和 characterData 边界有追加回归用例。

## 追加用例范围

`tests/local-countdown-copy-date.test.js` 原有测试、断言和本地 harness 保持原样，只在文件末尾追加 Feature 57 用例；共享 `tests/helpers/task-dom-model.js` 未修改。使用实际 View、Controller、Store，独立合成数据及既有小型 DOM 模型。

- 保存值与设置草稿隔离；精确 Unicode（组合字符、中英文、emoji）、80 字符标题、HTML 样式字面文本及日期上下界；没有字符串正规化或 HTML 解释。
- 两动作顺序及同步 reentrancy、未结算全局锁、多卡片、同 host 重挂载及旧 owner；删除兄弟按钮仍可独立复制，旧来源按钮回调失败关闭。
- 未载入／保存中／错误／冲突／输入法组合／过期保存对象与字段、被篡改的 DOM 日期／标题、隐藏／inert／CSS 不可见／关闭 details、错 document、失效或错误 workspace/session。
- 晚到成功和失败，Hide 失败恢复、Edit、刷新、保存、readGeneration、销毁、隐藏／移除后恢复，以及排队未交付的 source/title/date/characterData 变更。合成记录不代表原生 MutationObserver 时序验收。
- 真实 Store 读失败、写失败、Hide 失败及显式 Retry；另页真实保存导致冲突、保留草稿和 Load saved；真实后台 held read；Default 和命名 A 的真实 Manager/Session 命名空间，当普通新标签页偏好是 B 时仍只复制 A。
- 缺少 API／方法、同步异常、异步拒绝、方法 getter 异常及显式重试；无复制自动重试、存储 I/O、权限查询或读取剪贴板。
- 原生按钮属性、合成 Enter／空格激活和 held/IME 防护、焦点保留、每分钟／跨午夜稳定控件与不重复 live 文本；EN、zh_CN 和缺失翻译回退文案。

## 本地执行记录

2026-10-17 的唯一一次本地有界 Node 运行：**440/440 通过**，0 失败、0 取消、0 跳过、0 todo；进程退出码 0，耗时 9474.074072 ms。没有失败后的修复或重跑，也没有把不同执行合并成一次运行。实际命令：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-countdown-copy-date.test.js tests/local-countdown-view.test.js \
  tests/local-countdown-controller.test.js tests/local-countdown-store.test.js \
  tests/local-countdown-relative-date.test.js tests/local-countdown-relative-direction.test.js \
  tests/local-countdown-boundary.test.js tests/local-countdown-workspace-navigation.test.js \
  tests/local-countdown-integration.test.js
```

本地不运行全仓或规模套件。源码及测试已在此有界检查通过后冻结，由独立审核和准确源码 CI 决定发布。`git diff --check` 通过。

## 独立审核与打包核验

独立追加的临时探针首次运行 **9/9 通过**：80 个 Unicode 码点与字面标记原文、双路复制分别移除兄弟按钮、两路旧按钮回调不能借用替换控件、排队的标题字符变更与 ABA、反馈节点替换、剪贴板 API getter 重入，以及跨卡片和销毁后的全局写入锁。采用既有未改 DOM 模型与真实 Store/Controller，没有修改实现或既有测试来通过审核。两次不同检查合计 449/449，不称为同一次执行。

Python 回归 **84/84 通过**。离线运行时 ZIP 构建与源码逐文件核验均通过：**133 个文件**，SHA256 `65521257d3712827af3a62fc1ddbb3245063aa391822e322b4eb3f32d89bb2fb`。该校验不运行原生浏览器。原有 26,742 字节复制测试前缀、共享 DOM helper、Store、Controller、工作区模块、生命周期、新标签页主脚本、manifest 1.1.155 和 CI workflow 均与基线逐字节一致；仅增加四个 EN/zh 消息键，未改旧翻译。

## 未验证与限制

没有运行原生 Chrome、系统剪贴板读写、真实 Enter／空格事件合成、屏幕阅读器、窄屏／多主题布局或权限提示验收，没有新增截图。原生 Chrome 的已知安全拒绝未被绕过；没有使用用户设备或收费平台。现有截图不代表新按钮已经接受视觉验收。测试标题、日期、workspace 名称与错误内容均为合成数据，不含个人资料或凭据。

页面只复制已经载入且显示的保存快照，不能保证另一页尚未通知的全局最新值。已经发出的系统写入无法撤回，离开或隐藏后仍可能完成；只能丢弃失效 UI 回执。扩展不主动发送网络请求，但不能控制操作系统或其他软件同步剪贴板。

未修改 Controller、Store、schema、恢复／导入／导出协议、manifest、权限、workflow 或发布逻辑；本文件不宣称发布已经完成。
