# 倒计时卡片复制日期：验证范围

2026-10-17 的本地合成验证。本项在已有单里程碑倒计时卡片中增加“复制日期”，不改变设置页保存语义。

## 已验证

- 实现前只运行新增文件中的首个用例，基线因缺少 Copy date 按钮失败；没有宣称其他新增用例也在基线上得到红例。
- 最终 `tests/local-countdown-copy-date.test.js` 的 106 个合成用例通过。实际 Countdown View、Controller、Store 配合独立合成存储及现有小型 DOM 模型执行，没有修改共享测试辅助文件或削弱原有断言。
- 仅复制当前卡片已载入且显示的保存日期，严格为十字符 `YYYY-MM-DD`；不附标题、换行、剩余天数、当前时间或设置草稿。覆盖公元 0001 年、0099 年、闰日及 9999 年末。设置页没有新增复制控件，未保存标题、日期和显示开关不被复制或保存。
- 点击处理器同步调用 `navigator.clipboard.writeText`，此前没有 await 存储/权限步骤。合成计数核验复制本身没有存储读取或写入；没有剪贴板读取、权限查询、`execCommand`、下载或网络回退。缺少 API、同步抛错和异步拒绝均显示独立失败提示，可再次显式点击，日期仍留在卡片中供手动选择。
- 成功、待决及失败反馈使用独立 polite 状态，不覆盖 Hide、Retry、冲突、读写错误或导出反馈。原生 `button` 使用 `type=button` 和 `aria-disabled`，点击处理器另行检查可用性，不以禁用按钮造成焦点丢失；没有任何复制后的自动聚焦。
- 未载入、保存中、错误、读取失败、冲突、输入法组合、关闭控制器、过期保存对象/版本/日期、篡改显示文本、隐藏、inert、CSS 隐藏、关闭的 details、断开 DOM、错误 document、离开/暂停及失效或替换的工作区均拒绝复制。
- 捕获精确保存对象与字段、readGeneration，以及挂载时工作区/页面 session 身份。新的保存状态、刷新、组合输入、Hide、Hide 失败、页面隐藏/离开、销毁及隐藏/移除后恢复均丢弃晚到成功或失败，不抢焦点。显式 MutationObserver 记录也覆盖尚未投递的隐藏/移除恢复；这些是合成记录，并非原生浏览器时序验收。
- 模块级未结算写入锁覆盖重复点击、多卡片及同一 host 重挂载；旧 View 的引用和晚到结果不能覆盖新挂载。销毁或失效不会提前释放系统写入锁。写入结算后只更新现有拥有者的控件状态；无效的新卡片仍不可复制。
- 正常每分钟及跨午夜重绘保留目标未变的复制反馈，不重复写 live-region 文本；原剩余天数仍不是 live region。后台读取已经在途时允许复制此前已验证的显示快照，不发起额外读取；读取交付或其后新起的读取会使旧回执失效。
- 两个真实 Manager/Session 命名空间探针分别覆盖 Default A 与命名 A：当普通新标签页偏好已改为 B，A 卡片仍只复制 A 的保存日期，不读取或写入任何额外存储，不改变 A 的设置草稿，也不碰 B 的保存数据；换成错误 session/backend 身份会拒绝复制。
- 中英文按钮、待决、成功和失败标签通过。两份语言 JSON 解析及 `git diff --check` 通过。

## 运行范围

第一轮有界回归包含当时的 104 个新增用例及 138 个已有 Countdown 用例，共 **242/242** 通过：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-countdown-copy-date.test.js tests/local-countdown-view.test.js \
  tests/local-countdown-controller.test.js tests/local-countdown-store.test.js \
  tests/local-countdown-relative-date.test.js tests/local-countdown-boundary.test.js \
  tests/local-countdown-workspace-navigation.test.js tests/local-countdown-integration.test.js
```

随后只追加“复制后开始真实后台读取”和“无效重挂载卡片不被结算解锁”两个用例，没有再改生产代码；重新运行最终复制文件得到 **106/106**：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-countdown-copy-date.test.js
```

不把两个执行结果合写成一次未执行的 244 项全绿运行。所有本地 Node 检查使用 512 MiB 堆上限及单并发。

## 未验证及不可保证的范围

候选阶段没有跑仓库全量或规模测试，没有原生 Chrome、系统剪贴板、真实 Enter/空格激活、屏幕阅读器、窄屏/多主题布局、权限提示或跨设备剪贴板同步验收，没有新增截图。合成 DOM 的焦点与 MutationObserver 记录不能替代这些验收。现有 README 截图不代表新增复制按钮已经接受截图验收。测试数据仅为合成里程碑和日期，没有个人资料或凭据。

复制使用当前页面已经载入的保存快照，不能保证另一页面尚未通知到此页的最新全局保存值。已发出的系统剪贴板写入不能撤回，即使页面离开仍可能完成；代码只能丢弃失效 UI 的回执。代码不主动发送网络请求，但不能控制操作系统或其他软件的剪贴板同步。

未修改 Controller、Store、schema、manifest、权限、备份、迁移协议、计算器求值器或公共 lifecycle 接口。版本与发布由独立审核及准确源码 CI 决定；此记录不宣称候选已经发布。
