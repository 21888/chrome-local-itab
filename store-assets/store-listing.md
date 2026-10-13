# Chrome Web Store Listing

## Basic Details

- Extension name: Local iTab
- Primary category: Productivity
- Language: English, Chinese (Simplified)
- Homepage URL: https://github.com/21888/chrome-local-itab
- Support URL: https://github.com/21888/chrome-local-itab/issues
- Privacy policy URL: verify the actual public URL entered in the Developer Dashboard opens without sign-in and contains the policy for the selected release. `store-assets/privacy-policy.md` is the repository source, not a verified live URL; publish or update it as needed and record the real URL before submission.

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
- An off-by-default Claude experiment requires optional browser access, manual selection of an existing Claude page and organization, and requests a one-time session usage snapshot. Real-account behavior remains unverified; see the experiment disclosure below.

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
- 默认关闭的 Claude 实验需浏览器可选授权，手动选择已有 Claude 页面和组织后读取一次会话用量快照；尚未真实账号验证，详见下方实验披露。

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
- Optional `https://*/*`: Supports user-chosen HTTPS model providers, requested only for the reviewed hostname and port. For model requests, granting access alone does not send the prompt; explicit reviewed Send is required. Separately, the default-off Claude experiment requests only `https://claude.ai/*` for a manually selected tab and organization. The full wildcard is never requested at runtime.
- Optional `scripting`: Used only for the default-off Claude session-organization snapshot experiment. After explicit enablement, permission approval and tab selection, packaged code reads organizations through the existing page session; selecting an organization requests one usage snapshot. It handles organization IDs/names, usage percentages and reset times, without conversation scraping, background polling or persistent result storage.
- 可选 `scripting` 与 HTTPS 主机：Claude 实验默认关闭，用户明确启用并授予 `scripting` 和精确 `https://claude.ai/*` 后，手动选页读取组织、选组织读取一次用量。模型请求仍只对审阅的主机和端口授权；运行时不请求整个HTTPS通配范围。
- `contextMenus`: Adds the explicit selection-capture action that opens a local draft for review; it does not automatically scrape pages or send selected text to a model.

## Privacy Practices Form

Submission review guidance, not a record of the live Dashboard answers:

- Review the data-type checkboxes individually against the selected release's actual handling, storage and transmissions. “The developer has no collection backend” is an architectural fact, not a substitute for the form's data disclosures. Do not copy a blanket “no user data” answer.
- Inventory user-entered text and saved content; selected text and optional source addresses; shortcut URLs/domains; reviewed prompts, questions, excerpts and responses; temporary API-key authentication; configuration, images and snapshot metadata; Claude organization identifiers/names, usage/reset data and browser-managed existing-session authentication for explicit experimental requests. Map these to the Dashboard's current definitions, including authentication, website/content or browsing-related categories where applicable. This list is a review input, not a claim that every named category must be selected; resolve the mapping from actual behavior before submission.
- Distinguish device-local handling from user-initiated transfers to the selected search engine/model provider and enabled Google services. Optional features and explicit Send do not by themselves settle the disclosure categories. Check the public policy, listing, in-product disclosures and saved form for consistency.
- Separately review the data-use certifications: no sale, no unrelated third-party use, and no creditworthiness/lending use. Verify the selected build supports these statements before certifying them; this document has not inspected or changed the Dashboard.
- Remote code: the extension runs packaged JavaScript; provider responses are displayed as text, not executed. Verify this separately from the data disclosures.

Official references checked on 2026-10-11: [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) and [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq). The FAQ also addresses local-only/Sync storage and user-specified servers; review those provisions in context rather than assuming the absence of a developer backend removes all obligations.

Notes for reviewer:

- Search queries are sent only by the user's explicit submitted navigation to their selected search engine.
- Optional favicon lookup may send a shortcut domain to Google only after the user enables online favicon fetching and grants the optional host permission.
- Enabled Chrome Sync shares supported configuration and subsequent changes; initialization may apply an existing enabled configuration from the same Chrome account.
- Authorized Drive snapshots include configuration, shortcut URLs, local images and device/snapshot metadata. Connecting, refreshing, uploading, downloading, restoring, deleting and pruning snapshots may contact Google APIs. A confirmed restore first attempts a safety upload of the current configuration and asks whether to continue if it fails. There is no scheduled automatic Drive backup.
- Tasks, previous task copies and the Focus session are excluded from configuration exports, Sync and Drive. Calculator data is memory-only. The bookmark importer reads the source file locally; applied records follow existing enabled network preferences. These local features do not disable unrelated network activity. See [the privacy policy](privacy-policy.md) for details.
- Optional BYOK requests send the exact reviewed prompt and model ID, with any entered temporary API key, directly to the user-selected HTTPS Chat Completions endpoint only after explicit Send. The provider receives ordinary connection metadata and may charge. Keys from the password field are not persisted in extension storage, Sync, backups or logs; closing/changing the connection or completing a request clears them. Responses remain temporary until explicitly saved. No developer relay backend is used.
- AI context Q&A sends only the question and explicitly selected, editable, reviewed global collection excerpts/saved workspace note, within the complete reviewed prompt. No sources are selected automatically; no ambient browsing or page scraping is attached. Task proposals require a separate exact-list review and Add action and are never executed.
- Saving a Q&A answer normally excludes its question/source snapshot. A separate default-off option retains the reviewed question, source IDs/labels/text, complete prompt, endpoint and model with the saved answer. That historical input and saved responses can contain private text and enter unencrypted collection/complete local backups. API-key fields and authentication headers are excluded, but user-entered secrets in ordinary text are not automatically removed. This optional input snapshot is distinct from Google Drive configuration snapshots; global AI libraries do not enter ordinary settings exports, Chrome Sync or Drive snapshots. See [Q&A scope](../docs/ai-context-workflow.md) and [the privacy policy](privacy-policy.md).

## Reviewer Notes

For the default-off Claude experiment, use the separate [session-organization disclosure](#optional-claude-session-organization-snapshot-experiment) and its account-free testing boundary. It is not the BYOK reviewed-prompt Send flow.

Local iTab is a Manifest V3 new tab replacement whose core page works offline. Test a fresh profile without enabled sync data separately from a same-account installation with an existing enabled configuration. To test online icons, open Settings > Privacy, enable online favicon fetching and grant the optional host permission. Drive is a separate optional flow in Settings requiring Google authorization; verify connect, snapshot listing, manual backup, download, restore, delete and cleanup. Restore attempts a safety upload before replacing configuration. Do not present Identity/API permissions as optional manifest permissions.

For BYOK and Q&A, use synthetic content to verify review → origin-specific optional permission → explicit Send separation; granting permission alone must not send content. Inspect the exact endpoint, model and outgoing prompt. API-key entry is temporary; connection presets persist only name/endpoint/model metadata locally and are excluded from exports, Sync and Drive. Do not put credentials in those metadata fields. Real provider calls need the reviewer's own authorized credentials and may incur charges; do not treat synthetic tests as live-provider acceptance. Verify cancellation, explicit response saving, the default-off Q&A input snapshot and unencrypted backup warnings. Imported snapshots and model citations are not proof of model output. Technical scope: [model workflow](../docs/ai-model-workflow.md), [Q&A workflow](../docs/ai-context-workflow.md).

## Screenshots

Choose images using [the asset and release-selection guidance](README.md). Existing versioned and unversioned screenshot directories are historical; verify their content against the selected release before reuse, retain provenance, and check global/localized image order in the Dashboard. Do not infer that old screenshots cover BYOK, Q&A or later features.

## Optional Claude session-organization snapshot experiment

This experiment is off by default and has not been validated with a real account. After explicit enablement and browser approval of optional `scripting` and `https://claude.ai/*` access, it lists eligible existing Claude tab IDs for manual selection. Selecting a tab runs packaged extension code in that tab's top-frame MAIN world and requests its organization list; selecting an organization rechecks the list and requests that organization's usage once. It does not bind or verify an account identity and is not a stable subscription balance or billing source. Internal endpoints may change.

The fixed same-origin GET endpoints are `/api/organizations` and `/api/organizations/{UUID}/usage`. Browser-managed existing session credentials authenticate these requests automatically (`credentials: same-origin`); extension code does not read or export cookie/token values. Claude (Anthropic) receives these requests and ordinary connection metadata. The experiment handles organization names/UUIDs and available five-hour/seven-day utilization percentages, reset timestamps and retrieval time in memory. It does not scrape conversations, inspect arbitrary page content, send prompts, use a developer relay, poll in the background, or persist results in extension storage, exports, Sync or backups.

Close/clear or leaving the page removes the local in-memory result and invalidates later callbacks. Closing does not revoke browser-granted permissions. An already-issued page request may continue until it completes or, under normal browser fetch behavior, reaches its ten-second timeout; immediate cancellation is not guaranteed. Organization-list continuity does not prove stable account identity. Verification so far is synthetic testing and account-free local UI checks, without a real permission grant or live account usage request.

### 中文说明

Claude 会话组织快照实验默认关闭，尚未真实账号验收。用户明确启用并通过浏览器授予可选 `scripting` 与精确 `https://claude.ai/*` 权限后，手动选择已有 Claude 标签页；扩展内打包的函数在该页顶层 MAIN 环境读取组织列表，选择组织后再次核对组织集合并读取一次用量。它不绑定或证明账号身份，不是稳定的订阅余额或账单依据，内部接口可能变化。

固定同源 GET 为 `/api/organizations` 和 `/api/organizations/{UUID}/usage`。浏览器通过页面现有会话自动认证（`credentials: same-origin`）；扩展不读取或导出 cookie/token 值。Claude（Anthropic）会收到请求和通常的连接信息。组织名称/UUID、可用的五小时/七天使用百分比、重置时间和读取时间仅在内存中处理。不抓取对话或任意页面内容、不发送提示词、不经过开发者中转、不后台轮询，结果不写入扩展存储、导出、Sync或备份。

关闭/清除或离页会清空本地内存结果并使迟到回调失效，但不撤销浏览器已授予权限。已发出的页面请求可能继续至完成，或在正常浏览器 fetch 行为下达到十秒超时，不能保证立即取消。组织集合未变不代表账号身份稳定。当前证据仅为合成测试和无账号本地UI验收，未实际授权或请求真实账号用量。
