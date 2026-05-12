# Chrome Web Store Listing

## Basic Details

- Extension name: Local iTab
- Primary category: Productivity
- Language: English, Chinese (Simplified)
- Homepage URL: https://github.com/21888/chrome-local-itab
- Support URL: https://github.com/21888/chrome-local-itab/issues
- Privacy policy URL: publish `store-assets/privacy-policy.md` to a public URL before final submission

## Short Description

Private local-first new tab with search, shortcuts, and opt-in online enhancements.

## Detailed Description

Local iTab turns Chrome's new tab page into a private, local-first dashboard for search, shortcuts, and lightweight personal context.

Highlights:

- Organize favorite sites with categories and a desktop-style shortcut grid.
- Search with Google, Bing, DuckDuckGo, or a custom search URL.
- Customize themes, spacing, icon sizes, shortcut labels, and backgrounds.
- Keep local weather, topic, and movie cards that you control manually.
- Import and export settings as JSON.
- Optionally sync settings through Chrome Sync, with large local assets kept on the current device.

Privacy by default:

- New installs work offline by default.
- Search text is not sent anywhere while you type; a request happens only after you submit a search or open a URL.
- Online random wallpapers and online favicon fetching are off by default and require both an in-app setting and the matching optional host permission.
- User configuration, shortcuts, uploaded backgrounds, local cards, and cached icons are stored in Chrome local storage on the user's device.
- Local iTab does not include analytics, tracking scripts, ads, accounts, or remote content feeds.

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
- 可选通过 Chrome Sync 同步设置，大型本地资源会保留在当前设备。

隐私说明：

- 新安装默认离线工作。
- 输入搜索词时不会发送数据；只有提交搜索或打开网址后才会发起请求。
- 在线随机壁纸和在线网站图标默认关闭，必须在应用内开启并授予对应可选主机权限后才会联网。
- 用户配置、快捷方式、上传背景、本地卡片和缓存图标保存在用户设备的 Chrome 本地存储中。
- Local iTab 不包含分析、追踪脚本、广告、账号系统或远程内容 Feed。

## Single Purpose

Provide a private, customizable Chrome new tab dashboard for search, shortcuts, local cards, and user-controlled settings.

## Permission Justifications

- `storage`: Stores shortcuts, categories, layout, theme, search preferences, local cards, privacy settings, optional cached favicons, and optional Chrome Sync metadata.
- `unlimitedStorage`: Allows users to keep uploaded backgrounds, local configuration, and cached icon data on the device without losing data to small local quota limits.
- Optional host permission `https://www.google.com/*`: Used only when the user enables online favicon fetching and grants permission; fetches shortcut favicon images from Google's favicon endpoint.
- Optional host permission `https://api.paugram.com/*`: Used only when the user enables online random wallpapers and grants permission; loads wallpaper images from Paugram when API background is selected.

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
- Optional wallpaper loading contacts Paugram only after the user enables online random wallpapers, grants the optional host permission, and selects the API background.

## Reviewer Notes

Local iTab is a Manifest V3 new tab replacement. On a fresh install it works offline by default. To test optional network features, open Settings > Privacy and enable online random wallpapers or online favicon fetching, then grant the optional host permission requested by Chrome.

## Screenshots

Upload the files from `store-assets/screenshots-1280x800/` in this order:

1. `01-dashboard-overview-1280x800.png`
2. `02-shortcuts-grid-1280x800.png`
3. `03-settings-appearance-1280x800.png`
4. `04-privacy-controls-1280x800.png`
5. `05-sync-data-controls-1280x800.png`

Fallback accepted dimensions are available in `store-assets/screenshots-640x400/`.

