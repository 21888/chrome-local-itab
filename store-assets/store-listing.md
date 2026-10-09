# Chrome Web Store Listing

## Basic Details

- Extension name: Local iTab
- Primary category: Productivity
- Language: English, Chinese (Simplified)
- Homepage URL: https://github.com/21888/chrome-local-itab
- Support URL: https://github.com/21888/chrome-local-itab/issues
- Privacy policy URL: publish `store-assets/privacy-policy.md` to a public URL before final submission

## Short Description

Private local-first new tab with search, shortcuts, and optional favicon fetching.

## Detailed Description

Local iTab turns Chrome's new tab page into a private, local-first dashboard for search, shortcuts, and lightweight personal context.

Highlights:

- Organize favorite sites with categories and a desktop-style shortcut grid.
- Search with Google, Bing, DuckDuckGo, or a custom search URL.
- Customize themes, spacing, icon sizes, shortcut labels, and backgrounds.
- Keep local weather, topic, and movie cards that you control manually.
- Import and export settings as JSON.
- Optionally sync supported settings through Chrome Sync, excluding embedded images; use a local JSON export or an authorized Google Drive snapshot when those images are needed.
- Optionally connect Google Drive for manual configuration snapshots, including local images, grouped by computer name.

Privacy by default:

- The core page works offline. Chrome Sync is off in the default configuration, but a new installation may apply existing enabled sync data from the same Chrome account.
- Search text is not sent anywhere while you type; search or navigation requests happen only after you submit a search or explicitly open a URL.
- Online favicon fetching is off by default and requires both an in-app setting and the matching optional host permission.
- Configuration, shortcuts, uploaded backgrounds and local cards are primarily stored in `chrome.storage.local`; website icons use local IndexedDB with a Cache API fallback, and some interface state uses browser local storage.
- Tasks, previous task copies and the Focus session stay separate from configuration exports, Chrome Sync and Drive snapshots. Tasks has its own export/import. Tasks/Focus visibility and Focus durations are also device-only and excluded; weather/topic/movie visibility remains ordinary configuration.
- Calculator expressions, results and errors stay in the current tab's memory, without search submission or saved history.
- Bookmark HTML files are read locally for preview and additive import. Saved links follow existing Sync and online-icon preferences; the importer neither uploads the source file nor enables those features.
- Local iTab does not include analytics, tracking scripts, ads, or remote content feeds. Local use needs no account; optional Chrome Sync and Drive use the user's Chrome or Google account.

## 中文简介

隐私优先、本地优先的新标签页，包含搜索、快捷方式与可选在线增强。

## 中文详细说明

Local iTab 会把 Chrome 新标签页变成一个隐私优先、本地优先的个人仪表盘，用于搜索、快捷方式和轻量个人信息整理。

主要能力：

- 用分类和桌面风格网格管理常用网站。
- 支持 Google、Bing、DuckDuckGo 和自定义搜索 URL。
- 可调整主题、间距、图标大小、快捷方式标题和背景。
- 天气、热榜、电影卡片由用户本地手动维护。
- 支持 JSON 导入和导出设置。
- 可选通过 Chrome Sync 同步支持的设置，不含嵌入式图片；需要图片时可使用本地 JSON 导出或已授权的 Google Drive 快照。
- 可选连接 Google Drive，按电脑名称管理包含本地图片的手动配置快照。

隐私说明：

- 核心页面可离线使用。默认配置关闭 Chrome Sync，但同一 Chrome 账号的新安装可能应用已有的已启用同步配置。
- 输入搜索词时不会发送搜索内容；只有提交搜索或明确打开网址后才会发起相应的搜索或导航请求。
- 在线网站图标默认关闭，必须在应用内开启并授予对应可选主机权限后才会联网。
- 配置、快捷方式、上传背景和本地卡片主要保存在 `chrome.storage.local`；网站图标使用本地 IndexedDB 缓存及 Cache API 回退，部分界面状态保存在浏览器本地存储中。
- 待办、待办恢复副本和专注会话不进入配置导出、Chrome Sync 或 Drive 快照；待办有独立导出/导入。待办与专注的显示状态、专注时长也仅保存在本设备，不进入这些配置副本；天气、热榜和电影的显示设置仍属于普通配置。
- 计算器表达式、结果和错误仅留在当前标签页内存中，不提交搜索或保存历史。
- 书签 HTML 文件在本地读取、预览并追加导入；保存后的链接遵循原有同步与在线图标设置，导入器不会上传源文件或开启这些功能。
- Local iTab 不包含分析、追踪脚本、广告、账号系统或远程内容 Feed。本地使用无需账号；可选的 Chrome Sync 和 Drive 使用你的 Chrome 或 Google 账号。

## Single Purpose

Provide a private, customizable Chrome new tab dashboard for search, shortcuts, local cards, and user-controlled settings.

## Permission Justifications

- `storage`: Stores configuration, shortcuts, categories, layout, local card settings, separate Tasks/Focus state and privacy settings locally; supports optional Chrome Sync for supported configuration.
- `unlimitedStorage`: Allows users to keep uploaded backgrounds, local configuration, and cached icon data on the device without losing data to small local quota limits.
- `identity`: Supports Google authorization for the optional Drive backup feature.
- Declared host permission `https://www.googleapis.com/*` and OAuth scope `https://www.googleapis.com/auth/drive.appdata`: Allow authorized manual backups in Drive's hidden app-specific data folder, including snapshot listing, upload, download, restore, deletion and old-snapshot cleanup. These are declared manifest permissions; using Drive remains optional.
- Optional host permission `https://www.google.com/*`: Used only when the user enables online favicon fetching and grants permission; fetches shortcut favicon images from Google's favicon endpoint.

## Privacy Practices Form

Recommended selections:

- Data collected: No user data is collected by the developer.
- Data sale: No.
- Third-party use unrelated to extension purpose: No.
- Creditworthiness or lending use: No.
- Remote code: No remote code is executed. Extension pages run packaged JavaScript only.

Notes for reviewer:

- Search queries are sent only by the user's explicit submitted navigation to their selected search engine.
- Optional favicon lookup may send a shortcut domain to Google only after the user enables online favicon fetching and grants the optional host permission.
- Enabled Chrome Sync shares supported configuration and subsequent changes; initialization may apply an existing enabled configuration from the same Chrome account.
- Authorized Drive snapshots include configuration, shortcut URLs, local images and device/snapshot metadata. Connecting, refreshing, uploading, downloading, restoring, deleting and pruning snapshots may contact Google APIs. A confirmed restore first attempts a safety upload of the current configuration and asks whether to continue if it fails. There is no scheduled automatic Drive backup.
- Tasks, previous task copies and the Focus session are excluded from configuration exports, Sync and Drive. Calculator data is memory-only. The bookmark importer reads the source file locally; applied records follow existing enabled network preferences. These local features do not disable unrelated network activity. See [the privacy policy](privacy-policy.md) for details.

## Reviewer Notes

Local iTab is a Manifest V3 new tab replacement whose core page works offline. Test a fresh profile without enabled sync data separately from a same-account installation with an existing enabled configuration. To test online icons, open Settings > Privacy, enable online favicon fetching and grant the optional host permission. Drive is a separate optional flow in Settings requiring Google authorization; verify connect, snapshot listing, manual backup, download, restore, delete and cleanup. Restore attempts a safety upload before replacing configuration. Do not present Identity/API permissions as optional manifest permissions.

## Screenshots

Upload the files from `store-assets/screenshots-1280x800/` in this order:

1. `01-dashboard-overview-1280x800.png`
2. `02-shortcuts-grid-1280x800.png`
3. `03-settings-appearance-1280x800.png`
4. `04-privacy-controls-1280x800.png`
5. `05-sync-data-controls-1280x800.png`

Fallback accepted dimensions are available in `store-assets/screenshots-640x400/`.

