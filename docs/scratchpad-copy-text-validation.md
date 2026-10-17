# 便笺「复制当前全文」：验证范围

2026-10-17 的本地合成验证。为既有便笺增加明确的原生复制按钮与独立状态，不改变保存、冲突、导入、导出或查找语义。

## 实现与真实宿主

- 新标签页在 `newtab.js` 的 `initializeDashboard` 中把 `LocalItabScratchpad.mount` 挂到 `newtab.html` 的 `#local-scratchpad-card`，默认 View 使用 `root.navigator.clipboard`。测试可以注入剪贴板替身。
- 默认 Store 的 `createChromeBackend` 使用现有 `LocalItabWorkspaces.session.createBackend`。本项检查实际 `controller.store.backend.workspace` 的对象、`id`、`generation`、`invalidated`、`_suspended` 及当前全局 session；没有添加或假设 `workspacechange` 事件，也不读取工作区存储来复制。
- 复制来源是完整 `controller.draft`，包括未保存、保存中、保存失败、冲突、超限及读取失败后保留的只读草稿。传给 `writeText` 的字符串不去空白、不正规化、不截断，保留原始 CRLF、CR、BOM、Unicode 和字面 HTML；不取 textarea 规范化后的换行，不取最新保存文本或导入预览。空字符串和无效 Unicode 不调用剪贴板 API。
- 点击内直接调用 `writeText`，没有等待存储、权限预查询或后台任务。没有 `readText`、`execCommand`、新增权限、网络请求、存储键或历史记录。系统剪贴板自身的历史、同步和其他应用访问范围由操作系统决定。
- 独立纯文本状态使用 `role=status`、`aria-live=polite`、`aria-atomic=true`。复制不写保存状态、错误或草稿，不触发 Retry，不更改焦点或选区。按钮保持原生 button；运行中使用 `aria-disabled` 和点击守卫，避免通过原生 disabled 把已聚焦按钮移出焦点。
- 保存并非复制的前提。当前 draft、编辑 generation、实际编辑区文本和宿主/工作区仍相同即可回执；正常同文保存更换 state 对象不使复制失效，远端保存冲突仍保留当前草稿与原有警告。

## 生命周期与异步归属

每个 View 最多一个系统写入在途。编辑，包括 A→B→A，组合输入、页面隐藏/恢复、卡片隐藏/恢复或脱离/重新挂载、页面离开或视图销毁，使旧回执失效。MutationObserver 记录短暂的祖先属性变化和被移除的控件，即使结算前 DOM 已恢复，也不能发布旧成功/失败。结算时再次排空未投递记录并检查当前归属。

工作区对象、身份和可用性在新操作 admission、controller render 及异步 settle 时核验，届时失效/更换会阻止新写入或抑制在途旧回执。本项没有新增 Manager 订阅：仅收到工作区通知、且没有本卡 render 或相关宿主/生命周期事件时，不承诺立即清除已经结算的“已复制”提示；该提示仍记录先前确已完成的复制。没有把这类单独通知宣称为即时回执清理。

已经发给系统的写入无法取消。旧回执失效会清除复制状态及其监听，但在途锁直到 promise 结算才释放；重复点击不能提前发起第二次写入。成功、失败、空内容和非法文字的已完成状态仍有一个有界的回执归属，后续编辑、隐藏或销毁会清除它。新点击替换旧反馈并解绑旧监听；销毁解绑自己的监听，不清除其他功能的监听。重新显示或重新挂载不会自动复制。

## RED 与本地模型证据

实现前只运行新文件中的首个真实 View 入口断言。基线没有 `copyButton`，实际为 `undefined`，1 项失败、0 项通过、exit 1。不是测试夹具错误；没有把未运行的其他用例宣称为基线红例。

- RED 日志 SHA256：`f839c2ddd14e3ef7daa7e047e53c6a89d21ce1a8c71ee9171df193e8e410a6ea`
- 新专项首轮 55/55 通过，exit 0。
- 最终五文件限定回归 149/149 通过，0 失败、跳过或取消，exit 0。日志 SHA256：`c90857d4973089c19e4da3b9ead66bb77960323f7345e83a5084c3f8d0f28cc9`

新测试实例化真实 View、Store 与 Controller，复用未改动的既有有限 DOM 模型，仅在新测试文件内补剪贴板替身和显式 MutationObserver 记录。覆盖原文、换行、BOM、组合 Unicode、超限、空和非法文本，保存中/失败/冲突/只读草稿，API 缺失、同步异常、异步拒绝与明确重试，直接点击调用时机，无保存/读存储/读剪贴板/权限/网络/焦点/选区副作用，IME 和 229 守卫，同文 autosave、编辑 ABA、隐藏/恢复、脱离/重挂、pagehide、工作区身份、过期成功/拒绝、监听清理、旧 View 结算与中英文文案。

MutationObserver 的记录投递和排空是显式有限模型，不是原生 Chromium 的 MutationObserver 或布局实测。键盘默认激活由原生按钮负责，本次没有以合成 keydown 冒充物理 Enter/Space 复制成功。

## 限定命令

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  --test-name-pattern="explicit native entry" tests/local-scratchpad-copy-text.test.js

NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-scratchpad-copy-text.test.js

NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-store.test.js \
  tests/local-scratchpad-boundary.test.js
```

首条是实现前的预期 RED，其余为实现后的通过检查。另检查变更 JavaScript 的语法、中英文语言与 manifest JSON 解析、`git diff --check`。没有运行本地全仓库、通配符或 dashboard 规模矩阵。

## 未改动与未验证

Store、Controller、schema、旧测试与辅助模型、CSS、manifest、版本、workflow 和升级事故材料均未修改。此项没有发布、上传截图、用户设备操作、收费平台或模型服务请求。

本次没有原生浏览器验证。系统剪贴板实际内容和操作系统换行转换、真实用户激活或权限拒绝、原生 Enter/Space/IME、窄屏布局、焦点绘制以及辅助技术播报仍需验收；模型与 API 实参精确相等不能替代这些检查。独立审查及准确提交的 CI 由主流程另行核对，本记录不宣称完整 CI、GitHub Release、商店发布或升级事故已解除。
