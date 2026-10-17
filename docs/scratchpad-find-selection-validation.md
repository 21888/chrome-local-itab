# 便笺“用选中文字查找”：验证范围

2026-10-17 的本地合成模型验证。新增主工具栏原生按钮“用选中文字查找 / Find selected text”，紧邻既有“查找文字”，只把当前主编辑区的有效选区预填到查找框。本记录不代表已在原生 Chrome 验收。

## 行为与实现边界

- 点击时读取主 textarea 的实际 DOM value、UTF-16 selectionStart/selectionEnd；编辑区失去焦点后仍可使用保留的选区。正向和反向选区均使用同一升序范围，保留 selectionDirection，不读取全局页面选择、已保存预览或历史选区。
- 完整、非空、单行 Unicode 选区原样替换查询，包括大小写、空格、中文、emoji、组合字符及正则/HTML 字面符号。不修剪、不规范化、不解释标记。32,000 是保存上限，不用保存内容验证器限制选区长度。
- 只展开面板、清除旧匹配和 held Enter、聚焦输入框并预填，不扫描/计数/设置编辑区选区。普通 Find text 仍只展开或关闭，不预填。后续明确 Next/Previous/新 Enter 继续使用原有重叠匹配、计数及绕回路径。
- 空、非整数、负数、逆序、越界、跨 CR/LF 或半个代理对选区不替换旧查询。按钮保留原生可聚焦性；标题给出简短说明，点击无效选区时在已有查找面板的 polite/atomic 状态区显示选择指导，不静默复用旧选区。
- 沿用已加载、可见、非组字、非 inert、未关闭且节点属于当前 view 的查找守卫。预填前的焦点操作后再次核对 DOM 文本、选区、查询和 view；同步更改不被旧选区覆盖。聚焦未生效时显示失败提示，不声称定位成功。
- 新按钮依靠原生 Enter/Space 默认 click，不新增快捷键。Enter 激活后焦点进入查找框，原有 findEnter 会拦截 repeat Enter，且不执行导航；松开后的新 Enter 才定位。
- 不调用 View.render、setDraft、save、Retry、剪贴板、网络或存储接口。不修改控制器、Store、schema、权限、manifest、版本及生命周期接口；没有新查询历史、后台索引或匹配位置列表。

## 红例与修正记录

实现前只新增并运行一个真实绑定入口用例：要求主工具栏存在明确原生 Find selected text 按钮。基线实际没有该按钮，断言失败。其余新增用例没有在基线上运行，不宣称全部取得独立红例。

补齐测试时，一个合成 Unicode 样例的 UTF-16 长度是 12，测试却给了 end=13；实现按越界规则正确保留旧查询。只将该样例终点修正为 12，未放宽断言或产品边界。原失败日志保留，最终相关回归另存新日志。

## 模型覆盖

沿用既有有限 DOM/event helper，无辅助模型、scale 入口或旧断言改动。查找测试新增 10 项，合计 32 项：

- 原生按钮位置、文案、展开与聚焦、反向选择保持；普通入口不预填。
- 中文、emoji、组合字符、大小写、空白与字面符号原样复制；全局 selection 和 savedPreview 不参与。对实际运行作用域的 indexOf/lastIndexOf 计数，确认预填不扫描。
- 旧查询替换、旧匹配和 held Enter 清除；随后 Next/Previous/Enter 保持重叠计数与绕回，不重复使用历史选区。
- 无效/空/越界/CRLF/半代理对选区保留原查询且明确显示帮助。
- DOM 的 CRLF→LF 归一化偏移与控制器原文分离；超过 32,000 字符的完整 DOM 选区不被截断或保存校验拒绝。
- 模拟原生按钮 Enter/Space 的默认点击，再向实际 activeElement 发送 repeat Enter；不自动搜索，新 Enter 可正常定位。
- 可见性、加载、输入法、inert、关闭、脱离与同 host 重挂载守卫；旧按钮不操作新实例。
- 聚焦同步改变查询、文本、选区、隐藏/移除/销毁，以及聚焦抛错或未生效；新用户输入不被旧快照覆盖。
- 一个实际 Store + Controller 的已加载模型，依次形成未保存、真实保存失败、冲突、读取失败只读保留草稿和真实 TEXT_LIMIT 状态。预填前后 reads/writes、state、draft、generation、pending、error、conflict、timer、dirty、未提交状态和保存提示均相同；预览、编辑区选区不变，剪贴板/网络/设置选区均零调用。
- 英文、中文和 fallback 的纯文本标签与无效选区帮助。

这些是有限 DOM/事件与存储控制器模型，并非真实浏览器或真实系统键盘验收。

## 限定检查

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-store.test.js \
  tests/local-scratchpad-boundary.test.js \
  tests/local-scratchpad-copy-text.test.js
```

五个明确文件共 159/159 通过，无失败、跳过或取消。View JavaScript 语法检查、中英文 JSON 解析及 git diff --check 通过。未运行本地全仓库、通配符、dashboard scale 或 20k 规模矩阵。生产与测试冻结后释放 Node 窗口，文档另行完成；独立审核与准确提交的 CI 由主流程记录。

## 未验证与发布边界

未执行原生 Chrome 的鼠标正反向选择、真实 Enter/Space 长按、选择保持/绘制、输入法、滚动、窄屏布局或屏幕阅读器验收。没有本项的新截图；历史截图不能作为新按钮的验收证据。未使用用户设备、收费平台或额外权限。本文不宣称 GitHub Release、Chrome Web Store 发布或任何新版本已经可用。
