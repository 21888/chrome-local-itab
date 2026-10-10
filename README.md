# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

一个以本地数据为中心的 Chrome 新标签页。把搜索、常用网站和自己的小看板放在一处，让每次打开新标签页都简洁、顺手。

**离线优先 · 分类快捷方式 · 自定义布局 · 可选同步与备份**

无需构建，也无需注册 Local iTab 账号。时钟、快捷方式管理、本地图片和手动填写的卡片可离线使用；搜索、打开网站和可选云端功能需要网络。

[界面预览](#preview) · [安装](#install) · [功能](#features) · [隐私与备份](#privacy) · [开发](#development)

<a id="preview"></a>

## 界面预览

以下为不同功能阶段拍摄的真实扩展截图。模版预览采用英文界面和中文示例分类；功能截图的界面语言见各节说明。网站选择、图标与卡片内容仅作展示；天气、热榜和电影卡片均为手动填写的示例，不是实时数据。

[窄屏模板、焦点间距与升级保留验收](docs/narrow-template-and-upgrade-validation.md)

### 最新操作实拍 · 撤销完成与科学记数法

误点完成后可立即“撤销完成”，恢复任务但不会自动重新置顶；现有草稿和筛选会保留。计算器现在接受科学记数法结果再次参与计算，例如 `=1e-7*2`。以下为 1.1.7 开发版原始桌面截图，保留浏览器边框，未裁切或重绘。

<details>
<summary>查看中文 / 英文深色待办和浅色计算器实拍</summary>

![中文深色待办：撤销完成](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-zh.jpg)

![英文深色待办：保留草稿与筛选并撤销完成](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-en.jpg)

![英文浅色计算器：科学记数法结果再次计算](docs/screenshots/completion-calculator-1.1.7/calculator-scientific-light-en.jpg)

[截图来源记录](docs/screenshots/completion-calculator-1.1.7/capture-metadata.json)

</details>

### 最新功能实拍 · 待办与专注

置顶的“下一件事”可以直接完成，不必展开长列表。专注分钟数尚未保存时，“开始”会暂时禁用；保存只更新时长，不会自动启动计时。以下为 1.1.7 开发版真实截图，示例任务为英文：浅色图是中文界面的已保存 30 分钟状态；深色局部图显示未保存的 30 分钟输入与原有 25 分钟计时。

![中文浅色：置顶待办直接完成与已保存的专注时长](docs/screenshots/tasks-focus-1.1.7/tasks-focus-light-zh.png)

![英文深色：未保存分钟数时显示保存按钮并禁用开始](docs/screenshots/tasks-focus-1.1.7/tasks-focus-draft-dark-en.png)

[截图来源与裁切记录](docs/screenshots/tasks-focus-1.1.7/capture-metadata.json) · [待办验收范围](docs/tasks-pinned-completion-validation.md) · [专注草稿保护](docs/focus-duration-draft-validation.md)

### 更多操作实拍

每个网站卡片现在都有常显的“⋯”按钮，打开、编辑、删除和排序集中在同一个菜单中，也支持键盘操作。下图为英文界面、六个测试网站的真实截图；仅裁切，没有重绘。

![最新浅色宽屏：网站更多操作菜单](docs/screenshots/shortcut-menu/more-light-wide.png)

<details>
<summary>查看深色窄屏菜单</summary>

![深色窄屏：靠近边缘的网站菜单仍位于可见区域](docs/screenshots/shortcut-menu/more-dark-narrow.png)

</details>

[操作说明与验收范围](docs/shortcut-order.md) · [截图版本和裁切记录](docs/screenshots/shortcut-menu/capture-metadata.json)

**A「澄明」· 浅色 · 网格布局**

![Local iTab A 澄明浅色模版：分类快捷方式、搜索与时钟](docs/screenshots/clarity-light-grid.png)

### 十二种新增模版 · 浅色 / 深色

以下为当前十二种新增模版的真实界面截图：同一份 18 个网站的示例配置，英文界面、中文分类。仅裁去浏览器顶部测试提示和底部浏览器栏，没有重绘界面。图片展示截取时可见的页面区域，较长内容可向下滚动；天气等卡片为手动示例，不是实时数据。

以下总览是现有真实截图缩小排列的缩略图拼图；单张截图与裁切来源记录见链接。

![十二种新增模版浅色总览，按编排、留白、工作室、终端、棱镜、书架、地平线、条理、草间、蓝图、层台、专栏排列](docs/screenshots/templates/overview-light.png)

![十二种新增模版深色总览，与浅色图采用相同顺序](docs/screenshots/templates/overview-dark.png)

[查看 24 张独立截图与模版说明](docs/template-gallery.zh-CN.md#截图画廊) · [截图来源与裁切记录](docs/screenshots/templates/capture-manifest.json)

<details>
<summary>更多模版与功能实拍</summary>

### 当前功能实拍

使用示例数据拍摄的实际界面（英文控件）；仅裁切画面，未重绘。待办图片聚焦卡片区域，其余图片展示当时可见的页面区域；部分内容需要滚动查看。

**本地待办与专注计时器 · 浅色 / 深色**：浅色图展示 `review` 筛选后的单条匹配与清除按钮；深色图展示未筛选的两条待办。

![浅色待办卡片：筛选出一条匹配，旁边为专注计时器](docs/screenshots/current-features/tasks-filter-light.png)

![深色待办卡片：未筛选的两条待办与专注计时器](docs/screenshots/current-features/tasks-filter-dark.png)

**本地计算器**：在搜索框输入 `=(12+3)/2`，显示结果 `7.5`。

![搜索框中的本地计算结果](docs/screenshots/current-features/calculator.png)

**书签导入预览**：保存前查看新增数量、文件夹映射和隐私设置。

![书签 HTML 导入预览及确认按钮](docs/screenshots/current-features/bookmark-preview.png)

[原始截图、版本与裁切记录](docs/screenshots/current-features/capture-manifest.json)

### 原有 A / B / C 模版与自由布局

**B「墨序」· 深色 · 按分类网格展示**

![Local iTab B 墨序深色模版：快捷方式按真实分类分组](docs/screenshots/graphite-dark-grid.png)

**C「拾页」· 浅色 · 按分类网格展示**

![Local iTab C 拾页浅色模版：首屏两个分类分组及示例天气、热榜卡片](docs/screenshots/folio-light-grid.png)

**A「澄明」· 深色 · 网格布局**

![Local iTab A 澄明深色模版：同一份示例配置](docs/screenshots/clarity-dark-grid.png)

**B「墨序」· 浅色 · 按分类网格展示**

![Local iTab B 墨序浅色模版：快捷方式按真实分类分组](docs/screenshots/graphite-light-grid.png)

**C「拾页」· 深色 · 按分类网格展示**

![Local iTab C 拾页深色模版：首屏两个分类分组及示例天气、热榜卡片](docs/screenshots/folio-dark-grid.png)

**A「澄明」· 浅色 · 自由布局（不吸附网格）**

![Local iTab A 澄明浅色自由布局：GitHub 拖动后的位置与已保存状态](docs/screenshots/free-layout.png)

</details>

<a id="install"></a>

## 安装与开始使用

1. 下载并解压仓库源码，或克隆本仓库。源码可以直接加载，不需要运行构建命令。
2. 在 Chrome 地址栏打开 `chrome://extensions/`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择**直接包含 `manifest.json` 的文件夹**，通常是 `chrome-local-itab/` 或下载后解压得到的仓库目录。不要选择 ZIP 文件或它的上级目录。
4. 打开新标签页，添加常用网站，再进入设置调整外观、搜索和模块。

更新源码后，在扩展管理页点击「重新加载」，再刷新已打开的新标签页和设置页。卸载扩展或清理数据前，请先导出备份。

运行环境为支持 Manifest V3 的 Chrome。快捷方式与布局的并发写入保护还使用 `navigator.locks`；相关浏览器 API 不可用时，这些写入会失败并显示错误。

**备份提醒：** 配置 JSON 和 Drive 快照不包含待办、专注计时器、便签或倒计时。待办需单独导出/导入；便签和倒计时需分别导出文本；专注会话不可迁移。世界时钟偏好属于配置。卸载或清理数据前，请按[迁移清单](docs/migration.zh-CN.md)保存所需副本。

<a id="features"></a>

## 主要功能

- **导出浏览器书签**：在设置 → 数据中，将已保存的网站标题、完整网址和分类文件夹导出为本地 HTML 文件。导出前请阅读隐私确认；不包含未保存的修改、图标、设置和本地小工具。[范围与限制](docs/bookmark-export.md)。

- **搜索与直达**：支持 Google、Bing、DuckDuckGo 和自定义搜索地址，也可以直接打开网址。自定义模板可用 `%s` 表示关键词，例如 `https://example.com/search?q=%s`。
- **分类快捷方式**：添加、编辑、删除常用网站，按分类筛选；首页与设置可选网格（默认，可拖拽排序）、自由摆放（不吸附网格）或手动吸附网格；切换保留已保存的位置。右键菜单提供网站操作及打开分类内全部网站的入口。
- **十五种工作台模版**：保留 A「澄明」、B「墨序」、C「拾页」，新增十二种不同排版，均支持浅色和深色。新安装仍默认 A / 浅色。切换只保存外观，不改动网站、分类、待办、背景、布局模式或已有坐标。分组式模版在网格模式展示真实分类，自由布局仍使用同一个坐标平面。[模版说明](docs/template-gallery.zh-CN.md)。
- **按习惯调整外观**：使用模版背景、纯色或本地背景图片，调整列数、间距、图标和标题样式，按需显示或隐藏模块。
- **轻量本地卡片**：时钟、天气、热榜、电影和一句话。天气、热榜、电影内容由你手动维护，默认隐藏，不会自动获取实时数据。
- **本地 JSON 备份**：导出配置和本地图片，或导入已有备份。导入会校验数据并要求确认；恢复会替换当前配置，建议先导出一份。超过 10 MiB 的文件会在读取前提示内存风险，你可以取消；大文件能否恢复仍受浏览器可用内存限制。恢复时会保留本设备原有的同步状态。
- **可选云端功能**：Chrome Sync 用于轻量配置同步；Google Drive 用于按电脑名称管理手动备份快照。两者用途和限制见下文。

- **查找设置**：搜索六个设置标签页中的内置设置名称，点击或使用键盘打开对应区域。搜索词仅临时保留在本地，不搜索已保存内容或输入值。[使用说明](docs/settings-search.md#中文)。

多标签页编辑时，设置只保存修改的字段；发生冲突会保留草稿并提示复核。首页切换搜索引擎或显隐看板时，会保留最新保存的自定义搜索地址、快捷方式样式等其他偏好。整体恢复、重置或应用 Chrome 同步快照后，请重新打开设置页和首页。[保存保护与范围](docs/settings-save-safety.md)。

## 搜索与网站管理

快捷方式和待办编辑器会保留输入法组字期间按 Esc 时的对话框与草稿；组字结束后，普通 Esc 仍会关闭对话框。[行为与验证范围](docs/dialog-ime-validation.md#中文)。

新增或编辑快捷方式时，若字段有未保存改动或保存尚未完成，刷新或关闭标签页会请求 Chrome 原生离页提醒。未改动或完全还原的表单不提醒；取消、×、点击遮罩和普通 Esc 仍会丢弃草稿，保存成功后解除保护。Chrome 可能不显示提醒，未保存草稿不会持久化。[范围与验证](docs/shortcut-departure-validation.md#中文)。

[本地功能断网测试与范围](docs/offline-local-validation.md)。

### 查找已保存的网站

使用本地查找面板，按标题、地址和分类搜索已保存的网站，不向网页搜索服务发送查询。打开前会核对最新记录，查询不修改布局或待办。[查找使用说明](docs/shortcut-finder.zh-CN.md)。

### 导入浏览器书签

从本地 Chrome、Edge 或 Firefox HTML 导出文件预览并追加书签，不替换已有主页数据。应用前检查重复跳过、文件夹分类对应关系及现有同步/图标设置。[书签导入指南](docs/bookmark-import.zh-CN.md)。

删除快捷方式后，可在当前页点击**撤销删除**恢复最近一次删除。刷新后失效；后续修改可能使撤销失效。[使用范围与安全说明](docs/shortcut-undo.md)。

### 本地计算器

在搜索框中以 `=` 开头，按 Enter 或“计算”，例如 `=(12 + 3) / 2` → `7.5`。支持小数、一元正负号、`+ - * /` 和括号。表达式、结果和错误仅留在当前标签页，不发送搜索请求，也不保存历史或写入存储；自定义搜索地址未设置时也如此。删除开头的 `=` 即恢复普通搜索。编辑输入会清除旧结果。

计算成功后，可按 Tab 移动到只读结果框，选中完整数值，再按 Ctrl/Cmd+C 使用浏览器复制。计算不会移动表达式输入框的焦点；编辑或开始输入法组合输入会清除结果框。结果可能显示为科学记数法，可粘贴到新的计算中，例如 `=1e-7 * 2`。

<details>
<summary>计算器的范围与精度限制</summary>

限制：`=` 后最多 256 个字符，括号与一元正负号的合计嵌套最多 32 层。使用 JavaScript 浮点数，存在小数舍入、下溢和大整数精度限制（`=0.1 + 0.2` 得到 `0.30000000000000004`），不适合精确财务计算。除以零和非有限结果会显示本地错误。十进制数后可接 `e`/`E`、可选的 `+`/`-` 和至少一位指数数字，数值内部不能有空格（例如 `.5E+2`）。指数数字也计入 256 字符限制；上溢报错，下溢可能变成零。不支持百分比、变量或单位换算。保留计算器输入时，设置同步触发的重新加载会延后；主动重新加载可能丢弃输入。

</details>

## 本地效率工具

### 本地待办

在模块显示设置中启用可选的待办卡片，默认关闭且不填充示例。支持添加、编辑、完成、按文字本地筛选各状态任务、置顶下一件事和恢复已移除项目。待办及恢复副本仅保存在此设备，不会进入设置导出、Chrome 同步或云盘备份。重置/导入/恢复设置会保留待办。请使用独立的待办导出/导入进行备份和迁移。[待办使用说明](docs/local-tasks.zh-CN.md)。

通过「批量添加待办」粘贴每行一项的内容，查看编号预览后一次性确认添加全部非空行。空格、项目符号和重复行均保留；普通添加仍支持 Shift+Enter 在同一项内换行。预览和取消不写入数据。仍限制 500 条记录（含已完成/已移除）、每项 1,000 个 Unicode 字符及 2 MiB 集合/文件预算。验证失败不添加任何项目，保存结果不确定时安全重试同一批内容。 [批量待办实测与截图](docs/tasks-batch-capture-validation.md)。

### 本地专注计时器

在设置中启用可选的专注计时器。默认隐藏，专注 25 分钟、休息 5 分钟；待开始时可将各阶段设为 1–180 的整数分钟。开始、暂停/继续、停止/重置均需手动操作，选择下一阶段不会自动开始。

所有打开的扩展页面共享本设备上的一个会话。隐藏卡片会保留会话；仅重置设置会完整保留其状态，切换模版或导入配置不会启动或替换它。配置导出、Chrome 同步和 Drive 备份均不包含计时器。没有任务关联、历史记录、声音、网络请求或系统通知，也不需要新权限。

<details>
<summary>计时与恢复限制</summary>

页面活动时，会用单调时钟核对经过时间。所有页面关闭后，再次打开只能根据设备时钟估算剩余时间；无法区分关闭期间的时钟调整和实际经过时间。检测到时钟不一致时会提示重置。完成状态仅在本地页面显示，不保证所有页面关闭时准点提醒。存储失败时可读取最新状态；保存确认失败不一定表示未保存，重试前请先查看刷新后的状态。

</details>

### 本地便签

在设置的“模块显示”中开启便签，可随手记录文字、网址或片段。默认关闭；停止输入后自动保存在本设备。多标签页发生冲突时保留草稿，让你明确选择使用已保存内容或替换它。支持导出当前草稿为 TXT，也可选择一个 UTF-8 TXT 文件预览，再明确确认替换已保存的便笺。导入前需完成保存并解决冲突；最多 32,000 个 Unicode 字符、128 KiB，取消不会写入。[文本导入、限制与恢复说明](docs/local-scratchpad.zh-CN.md)。

便签不进入配置导出、Chrome Sync 或 Google Drive 备份。卸载扩展或清理浏览器数据前，请单独导出。[功能边界与验收记录](docs/local-scratchpad-validation.md)。

<details>
<summary>便笺 TXT 导入实拍</summary>

![便笺 TXT 导入预览：英文浅色真实界面](docs/screenshots/scratchpad-import/scratchpad-import-light-wide.png)

![便笺 TXT 导入预览：英文深色真实界面](docs/screenshots/scratchpad-import/scratchpad-import-dark-wide.png)

[截图来源与裁切记录](docs/screenshots/scratchpad-import/capture-metadata.json)

</details>

### 本地月历

点击时钟日期下方的「日历」，即可在本地查看月份。「上个月 / 下个月 / 今天」用于切换视图；日期仅供查看，不提供事件或提醒。无需联网，不保存浏览月份，也没有需要备份或同步的月历状态。[月历指南](docs/month-calendar.zh-CN.md) · [验证范围](docs/month-calendar-validation.md)。

<details>
<summary>月历实拍与尺寸记录</summary>

浅色宽图为简体中文界面，深色窄图为英文界面。

![月历中文浅色宽窗口实拍：本地化日期与展开的月历](docs/screenshots/month-calendar/calendar-light-wide.png)

![月历英文深色窄窗口实拍：展开的月历与日期](docs/screenshots/month-calendar/calendar-dark-narrow.png)

[月历实拍与尺寸记录](docs/screenshots/month-calendar/capture-metadata.json)

</details>

### 离线世界时钟

在设置中添加最多四个时区和可选的简短名称。沿用时钟格式，完全离线，并显示相对设备日历日期。使用「上移 / 下移」调整顺序，再点击「保存时钟」或「保存设置」应用草稿。保存后会直接更新已打开的首页，并在配置备份和可选同步中保留顺序。[使用及备份说明](docs/world-clocks.zh-CN.md)。

点击世界时钟卡片上的**比较时间**可预览通话时间。滑块以 15 分钟为步长，在进入比较时捕获的时刻前后 24 小时内移动；它表示真实经过的分钟数。预览保持固定，主时钟、日历和计时器仍按当前时间运行。本地参考显示日期、时间和时区缩写；同一天／前一天／后一天（或带正负号的天数）相对于该参考日期。夏令时以及半小时、四分之一小时时区均采用浏览器的时区规则。滑块支持方向键和 Home/End；点击**返回当前时间**恢复实时世界时钟。比较状态仅属于当前页面，不保存、不同步、不备份，无网络请求或新增权限。修改时钟设置或模板时，只要卡片仍存在就保留预览；移除全部时钟或重新加载会清除预览。

### 离线倒计时

为一个里程碑设置名称和日期，显示还有几天、今天或已过几天。默认隐藏，仅保存在此设备，支持明确保存、取消及文本导出。[使用和隐私说明](docs/local-countdown.zh-CN.md)。

<details>
<summary>倒计时实拍</summary>

倒计时卡片的真实浅色与深色界面（英文控件）：

![本地倒计时：浅色实拍](docs/screenshots/countdown/countdown-en-light-wide.png)

![本地倒计时：深色实拍](docs/screenshots/countdown/countdown-en-dark-wide.png)

[截图来源与裁切记录](docs/screenshots/countdown/capture-metadata.json)

</details>

## 外观与工作空间

### 推荐工作空间

独立预览并应用模板推荐的本地待办与专注计时器显示状态，保留内容与计时会话；切换视觉模板不会改变模块。[使用指南](docs/workspace-presets.zh-CN.md)。

<a id="privacy"></a>

## 数据、隐私与联网行为

**备份提醒：** 配置 JSON 和 Drive 快照不包含待办、专注计时器、便签或倒计时。待办需单独导出/导入；便签和倒计时需分别导出文本；专注会话不可迁移。世界时钟偏好属于配置。卸载或清理数据前，请按[迁移清单](docs/migration.zh-CN.md)保存所需副本。

### 更换浏览器或设备

配置备份不包含待办、专注计时器、便笺或倒计时。卸载扩展或清理数据前，请按[迁移清单](docs/migration.zh-CN.md)分别保留副本。

日常配置、快捷方式和上传的图片主要保存在 `chrome.storage.local`；网站图标使用本地 IndexedDB 缓存，部分界面状态保存在浏览器本地存储中。扩展不包含分析或广告脚本。

- **搜索**：输入过程中不发送搜索内容；提交搜索或打开网址时才访问所选服务或目标网站。
- **网站图标**：在线获取默认关闭。开启后还需在当前设备授予 `https://www.google.com/*` 的可选访问权限，扩展才会向 Google favicon 服务发送网站域名以获取图标。有效缓存可离线复用，当前缓存有效期为 7 天。
- **本地卡片与背景**：天气、热榜、电影内容和上传的背景不依赖远程内容源。
- **Chrome Sync**：默认配置为关闭。开启后通过 `chrome.storage.sync` 同步配置；若同一 Chrome 账号已有本扩展的已启用同步配置，新安装也可能自动读取并应用它。
- **Google Drive**：需要单独进行 Google 授权。连接、刷新、备份、下载、恢复和删除快照会访问 Google API；没有定时自动备份。

离线优先指核心页面可在本地运行。启用云端功能或主动访问网站后，相应服务仍会接收完成操作所需的数据。

### Chrome Sync：轻量配置同步

适合在使用同一 Chrome 账号的浏览器之间同步快捷方式和设置，受 Chrome 同步状态与存储配额限制。嵌入式背景、海报和图标图片会从同步内容中省略或替换为默认值；需要完整图片时，请使用 JSON 导出或 Drive 快照。

重复网址也可独立摆放；旧坐标会保留。包含独立位置的备份使用格式 2，需要新版导入。旧客户端可能丢弃这些字段，因此 Chrome Sync 遇到不兼容副本会保留本机数据并提示检查。恢复副本与明确替换步骤见[独立位置与兼容说明](docs/layout-identities.md)。

### Google Drive：手动快照备份

- 在设置中连接 Google Drive，并为备份选择一个电脑名称。
- 快照包含配置和本地图片，保存在 Drive 的隐藏应用数据目录 `appDataFolder`，使用 `drive.appdata` 授权范围。
- 可以按电脑名称查看、下载、恢复或删除快照。普通备份完成后会尝试清理该电脑名称下的旧快照，保留最近 20 条。
- 单个快照上限为 25 MiB；超过 5 MiB 时会先提示确认。
- 从 Drive 恢复前，会尝试把当前配置也上传为安全快照。若失败，会询问是否继续；恢复会覆盖本设备当前配置。

此功能依赖 Chrome Identity API、可用的 OAuth 配置和 Google 授权。开发版或自行打包的版本，请确认相应配置可用；本地使用和 JSON 导入导出不依赖 Drive。

### 扩展权限

[manifest.json](manifest.json) 中声明的权限包括：

- `storage`、`unlimitedStorage`：保存配置及本地图片数据。
- `identity` 和 `https://www.googleapis.com/*`：供可选的 Google Drive 授权与备份使用。
- 可选的 `https://www.google.com/*`：供在线网站图标获取使用。

## 文档与界面语言

本 README 默认使用简体中文，另有 [English](README.en.md) 和 [Español](README.es-ES.md) 版本。

扩展目前包含简体中文（`_locales/zh_CN`）和英文（`_locales/en`）界面资源，通过 `chrome.i18n` 使用浏览器语言，默认回退语言为英文。西班牙语目前仅为文档翻译。

主时钟的完整日期（包括日期顺序、星期和月份名称）优先使用当前中英文消息资源内的明确语言标记；不可用或无效时依次回退到 Chrome 预定义的 `@@ui_locale` 消息、Chrome 界面语言、浏览器首选语言和运行环境默认语言。年内天数和 ISO 周数的标签也使用当前界面语言。时间格式及自定义语句中的日期占位符保持不变。新生成的欢迎语会本地化；已保存或导入的语句（包括旧版英文欢迎语）不会被翻译或迁移。原有语句校验行为不变，包括去除首尾空格及空字符串回退为英文欢迎语。缺少语句字段时使用新的本地化默认值。

<a id="development"></a>

## 本地开发与检查

项目使用 Manifest V3、原生 JavaScript 和 CSS，没有依赖安装或打包步骤。安装 Node.js 后，在仓库根目录运行：

```bash
# 运行全部回归测试
node --test tests/*.test.js

# 检查 JavaScript 语法
for file in *.js shared/*.js tests/*.js tests/helpers/*.js assets/*.js; do
  node --check "$file" || exit 1
done

# 校验扩展清单和语言资源 JSON
node -e 'const fs = require("node:fs"); for (const file of ["manifest.json", ...fs.readdirSync("_locales").map(locale => "_locales/" + locale + "/messages.json")]) JSON.parse(fs.readFileSync(file, "utf8")); console.log("JSON OK");'

git diff --check
```

这些检查覆盖逻辑回归、JavaScript 语法和 JSON 格式，不能代替真实浏览器验证。发布前还应加载扩展，检查中英文界面、键盘操作、拖拽、跨标签页编辑、导入恢复及可选联网流程。更多发布事项见[发布检查清单](docs/release-checklist.md)。

### 生成并验证扩展 ZIP

加载已解压的开发版无需构建。要离线生成仅包含运行文件的 ZIP，请安装 Python 3.10+（仅使用标准库），在仓库根目录运行：

```bash
python3 tools/package_extension.py --output dist/local-itab-current.zip
python3 tools/package_extension.py --verify dist/local-itab-current.zip
python3 -m unittest discover -s tests -p '*_test.py'
```

上面的命令显式使用已被 Git 忽略的 `dist/local-itab-current.zip`。若省略 `--output`，文件名会自动使用 `manifest.json` 中的版本号（`dist/local-itab-<版本>.zip`），不会覆盖已有文件。可使用 `--output /path/to/new-package.zip` 指定新的输出路径；仓库内的输出必须位于 `dist/`。历史 `release/*.zip` 保持不变，不是当前打包的输入。

显式运行文件清单包含共享模块、两种界面语言资源和实际使用的图标。清单文件缺失，或 HTML 的本地 script/link/image、CSS 的 `url()`/`@import`、manifest 的入口/图标引用缺失时，检查会失败。新增依赖需更新工具中的 `RUNTIME_FILES`；JavaScript 动态生成的路径和动态导入仍需人工检查。测试、文档、截图、工具、未列入清单的文件及旧压缩包均不打包。ZIP 使用排序路径、固定时间戳及不压缩的原始字节，确保相同输入可复现。

命令输出源 Git 提交及工作区状态（下载的源码可能没有提交信息）、文件数量和 ZIP 的 SHA256。`--verify` 将 ZIP 与当前源码字节及规范化 ZIP 元数据比较，因此其他提交生成的包可能无法通过。通过仅代表打包验证，不代表浏览器测试通过或已批准发布。上传前，请把新 ZIP 解压到独立目录，在 Chrome 中加载该目录并完成[发布检查](docs/release-checklist.md)。打包不会修改 manifest 版本，也不会发布扩展。

**提交与发布约定：** 每项功能或修复整理成一个完整提交，提交前把 `manifest.json` 的补丁版本加一，然后立即单独推送到 `master`（每次 push 一个版本化提交）。GitHub Actions 只在这个公开仓库的 `master` push 上运行，测试通过后，按该 push 的准确源码提交生成对应版本 tag、Release、精简运行 ZIP 和校验文件；同一版本指向其他提交时拒绝发布，已发布文件不覆盖。测试包文件名的短源码哈希只用于追溯，不是扩展版本号。`master` 和 GitHub Releases 可以领先于商店审核版本；Chrome 商店仍按 UTC+08 自然日每天至多提交一个合并版本，仅在有新的已测试变更且没有版本正在审核时提交，否则跳过。CI 不自动追加版本提交，也不提交 Chrome 商店；此约定不保证每日上架或审核完成时间。每个版本同时在 `docs/releases/<版本>.md` 记录真实的新增、修复、注意事项及简短英文摘要，Release 先展示改动、最后展示安装方法。见 [GitHub 发布流程与恢复说明](docs/github-releases.md)。

### 代码结构

- `newtab.html` / `newtab.css` / `newtab.js`：新标签页界面与交互。
- `options.html` / `options.css` / `options.js`：设置与数据管理。
- `storage.js`：本地存储、数据校验、导入导出和 Chrome Sync。
- `drive-backup.js`：Google Drive 快照备份。
- `favicon-cache.js`：网站图标缓存。
- `shared/`：搜索模板、对话框等共享逻辑。
- `_locales/`：界面翻译；`assets/`：图标与截图；`tests/`：本地回归测试。

## 许可

原有项目文档将许可证标为 MIT；仓库目前尚未包含独立的 `LICENSE` 文件。
