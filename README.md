# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

一个以本地数据为中心的 Chrome 新标签页。把搜索、常用网站和自己的小看板放在一处，让每次打开新标签页都简洁、顺手。

**离线优先 · 分类快捷方式 · 自定义布局 · 可选同步与备份**

无需构建，也无需注册 Local iTab 账号。时钟、快捷方式管理、本地图片和手动填写的卡片可离线使用；搜索、打开网站和可选云端功能需要网络。

## 界面预览

<img width="640" height="400" alt="Local iTab 界面预览 1" src="https://github.com/user-attachments/assets/f072e511-7ded-45da-9cd5-4725efd4cd28" />

<details>
<summary>更多截图（4 张）</summary>

<img width="640" height="400" alt="Local iTab 界面预览 2" src="https://github.com/user-attachments/assets/74106bd6-98f8-4ac1-8328-02f2323687ec" />

<img width="640" height="400" alt="Local iTab 界面预览 3" src="https://github.com/user-attachments/assets/d020a9a6-6971-48f0-9abd-10da306d5731" />

<img width="640" height="400" alt="Local iTab 界面预览 4" src="https://github.com/user-attachments/assets/56076d9f-9d46-4fde-bff7-0f104512d889" />

<img width="640" height="400" alt="Local iTab 界面预览 5" src="https://github.com/user-attachments/assets/26868e31-a6f5-4811-a1d1-730755638a3d" />

</details>

## 主要功能

- **搜索与直达**：支持 Google、Bing、DuckDuckGo 和自定义搜索地址，也可以直接打开网址。自定义模板可用 `%s` 表示关键词，例如 `https://example.com/search?q=%s`。
- **分类快捷方式**：添加、编辑、删除常用网站，按分类筛选；支持拖拽排序、自由布局和网格对齐。右键菜单提供网站操作及打开分类内全部网站的入口。
- **按习惯调整外观**：选择主题、渐变或纯色背景，上传本地背景图片，调整列数、间距、图标和标题样式，按需显示或隐藏模块。
- **轻量本地卡片**：时钟、天气、热榜、电影和一句话。天气、热榜、电影内容由你手动维护，默认隐藏，不会自动获取实时数据。
- **本地 JSON 备份**：导出配置和本地图片，或导入已有备份。导入会校验数据并要求确认；恢复会替换当前配置，建议先导出一份。超过 10 MiB 的文件会在读取前提示内存风险，你可以取消；大文件能否恢复仍受浏览器可用内存限制。恢复时会保留本设备原有的同步状态。
- **可选云端功能**：Chrome Sync 用于轻量配置同步；Google Drive 用于按电脑名称管理手动备份快照。两者用途和限制见下文。

## 安装与开始使用

1. 下载并解压仓库源码，或克隆本仓库。源码可以直接加载，不需要运行构建命令。
2. 在 Chrome 地址栏打开 `chrome://extensions/`，开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择**直接包含 `manifest.json` 的文件夹**，通常是 `chrome-local-itab/` 或下载后解压得到的仓库目录。不要选择 ZIP 文件或它的上级目录。
4. 打开新标签页，添加常用网站，再进入设置调整外观、搜索和模块。

更新源码后，在扩展管理页点击「重新加载」，再刷新已打开的新标签页和设置页。卸载扩展或清理数据前，请先导出备份。

运行环境为支持 Manifest V3 的 Chrome。快捷方式的并发写入保护还使用 `navigator.locks`；相关浏览器 API 不可用时，写入会失败并显示错误。

## 数据、隐私与联网行为

日常配置、快捷方式和上传的图片主要保存在 `chrome.storage.local`；网站图标使用本地 IndexedDB 缓存，部分界面状态保存在浏览器本地存储中。扩展不包含分析或广告脚本。

- **搜索**：输入过程中不发送搜索内容；提交搜索或打开网址时才访问所选服务或目标网站。
- **网站图标**：在线获取默认关闭。开启后还需在当前设备授予 `https://www.google.com/*` 的可选访问权限，扩展才会向 Google favicon 服务发送网站域名以获取图标。有效缓存可离线复用，当前缓存有效期为 7 天。
- **本地卡片与背景**：天气、热榜、电影内容和上传的背景不依赖远程内容源。
- **Chrome Sync**：默认配置为关闭。开启后通过 `chrome.storage.sync` 同步配置；若同一 Chrome 账号已有本扩展的已启用同步配置，新安装也可能自动读取并应用它。
- **Google Drive**：需要单独进行 Google 授权。连接、刷新、备份、下载、恢复和删除快照会访问 Google API；没有定时自动备份。

离线优先指核心页面可在本地运行。启用云端功能或主动访问网站后，相应服务仍会接收完成操作所需的数据。

### Chrome Sync：轻量配置同步

适合在使用同一 Chrome 账号的浏览器之间同步快捷方式和设置，受 Chrome 同步状态与存储配额限制。嵌入式背景、海报和图标图片会从同步内容中省略或替换为默认值；需要完整图片时，请使用 JSON 导出或 Drive 快照。

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

## 本地开发与检查

项目使用 Manifest V3、原生 JavaScript 和 CSS，没有依赖安装或打包步骤。安装 Node.js 后，在仓库根目录运行：

```bash
# 运行全部回归测试
node --test tests/*.test.js

# 检查 JavaScript 语法
for file in *.js shared/*.js tests/*.js assets/*.js; do
  node --check "$file" || exit 1
done

# 校验扩展清单和语言资源 JSON
node -e 'const fs = require("node:fs"); for (const file of ["manifest.json", ...fs.readdirSync("_locales").map(locale => "_locales/" + locale + "/messages.json")]) JSON.parse(fs.readFileSync(file, "utf8")); console.log("JSON OK");'

git diff --check
```

这些检查覆盖逻辑回归、JavaScript 语法和 JSON 格式，不能代替真实浏览器验证。发布前还应加载扩展，检查中英文界面、键盘操作、拖拽、跨标签页编辑、导入恢复及可选联网流程。更多发布事项见[发布检查清单](docs/release-checklist.md)。

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
