# Local iTab Privacy Policy

Effective date: May 12, 2026

Documentation clarified: October 13, 2026

Local iTab is designed to be a private, local-first Chrome new tab page for search, shortcuts, and user-controlled dashboard settings.

## Data Stored On Your Device

Local iTab stores user configuration, shortcuts, categories, layout preferences, theme settings, uploaded backgrounds, local cards, and privacy settings in `chrome.storage.local` on your device. Website icons use a local IndexedDB cache, with a browser Cache API fallback. Some interface state, such as the selected shortcut category, is stored in browser local storage.

Tasks, including completed and removed items and previous local copies, and the Focus timer session are stored separately on this device. They are excluded from configuration exports, Chrome Sync and Google Drive snapshots. Tasks has a separate user-initiated export/import; configuration reset/import/restore preserve task content and the Focus session. Tasks/Focus visibility and Focus durations are also device-only and excluded. In contrast, visibility settings for the weather, topic and movie cards remain ordinary configuration and may be exported or synced.

Countdown is optional and hidden by default. Its title, target date and visibility remain separately in this browser profile on this device. Configuration exports, Chrome Sync, Google Drive and recovery snapshots exclude them. Settings reset/import/restore preserve the record. Explicit text export downloads saved values or the current draft. Countdown uses local calendar calculations without notifications or network services. Removing the extension or clearing browser data can erase the record.

Scratchpad is optional and off by default. Its plain text and visibility are stored separately on this device and excluded from configuration exports, Chrome Sync, Drive and configuration recovery snapshots. Settings reset/import/restore preserve it. Its explicit text export downloads the current draft, including unsaved text. Scratchpad content is not sent automatically. In optional AI context Q&A, you may explicitly select, edit and review the saved workspace note before sending it to your chosen model provider. Removing the extension or clearing browser data can erase saved text.

Calculator expressions beginning with `=`, results and errors remain in the current tab's memory. The calculator does not save them as history in storage or send them to a search provider.

Local storage is the primary copy of your configuration. Optional Chrome Sync and Google Drive features can send data to Google as described below. Images excluded from Chrome Sync can still be included in a Google Drive backup.

## Network Behavior

The core new tab page can work offline. The extension does not send search text anywhere while you type. Submitting a search or opening a URL visits the selected search provider or destination website.

Online favicon fetching is disabled by default. When enabled and granted the optional host permission on the current device, Local iTab sends shortcut domain names to Google's favicon service at `https://www.google.com/s2/favicons` to retrieve icons. Valid cached icons can be reused locally.

Version checks are manual by default. When you click Check GitHub now or opt in to at-most-daily checks while using the new-tab page, Local iTab requests public project release metadata from api.github.com. GitHub receives your IP address and ordinary connection details. The request sends no bookmarks, tasks, settings, installed-version parameter, account, token, cookies or request body. Version-check preferences and cached metadata remain on this device and are excluded from configuration exports, Chrome Sync and Drive backups. Settings reset clears them. No update is installed or reloaded automatically; opening a GitHub release page is a separate explicit navigation.

Weather, topic, and movie cards display locally configured content. They do not fetch weather, trending topics, or movie feeds. Uploaded backgrounds are local image data.

### Browser Bookmark Import

A browser-bookmark HTML export is read locally as text for preview and explicit additive import. The importer does not render the file as HTML, upload the source file, or fetch icons. Applied bookmark links and categories become ordinary saved records and are included in subsequent configuration exports and Drive snapshots. If Chrome Sync is already enabled, those records may subsequently sync. If online website icons are enabled and the current device has granted permission, normal dashboard icon behavior may contact Google. Import does not change either preference. Calculator use and bookmark import do not disable unrelated enabled network features.

### Chrome Sync

Chrome Sync is optional and disabled in the default configuration. When enabled, supported configuration, including shortcuts, categories, layout, theme, and configurable weather/topic/movie card settings (excluding task content and the Focus session), is shared through `chrome.storage.sync` using your Chrome account. Later configuration changes can also sync automatically.

At initialization, Local iTab checks Chrome Sync for an existing enabled configuration. A new installation using the same Chrome account may automatically apply that configuration. Embedded background images, movie posters, and shortcut icons are omitted or replaced with defaults in the Chrome Sync payload because of its storage limits.

### Google Drive Backups

Google Drive backups require separate Google authorization. When you create a backup, Local iTab uploads a JSON snapshot to the app-specific `appDataFolder` in your Google Drive using the `drive.appdata` authorization scope.

The snapshot includes:

- Validated application settings, including shortcuts and their URLs, categories, layout, theme and appearance, search preferences, privacy settings, and configurable weather/topic/movie card content. Task content, previous task copies and the Focus session are excluded.
- Local background images, movie posters, and image data embedded in shortcut icons, when present in the configuration. The separate favicon cache is not included.
- A generated device identifier, the selected computer name, snapshot identifier and creation time, extension and backup format versions, backup reason, and item counts.

The snapshot's Chrome Sync state is replaced with disabled defaults. Connecting to Drive, listing or refreshing snapshots, uploading, downloading, restoring, deleting, and cleaning up older snapshots can contact Google APIs.

There is no scheduled automatic Drive backup. After you confirm a restore, Local iTab first attempts to upload the current configuration as a safety snapshot, including the same types of settings, images, and metadata. If that upload fails, it asks whether to continue. Restoring downloads the selected snapshot and replaces the current configuration on this device.

## Data Collection

The developer does not collect, sell, transfer, or use user data for advertising, analytics, creditworthiness, or unrelated purposes. The optional service transmissions described in this policy support the corresponding search, icon, sync, backup, version-check, explicitly requested model features and the optional Claude session-organization experiment. Local iTab does not include analytics, tracking scripts, ads, or remote content feeds. Local use does not require an account; optional Chrome Sync and Google Drive use your Chrome or Google account.

## Google API Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Explicit selected-text capture

An explicit selection context-menu action may temporarily hold the browser-provided text and an optional sanitized source address in `chrome.storage.session` for review. It opens an unsaved draft; only explicit Save writes the existing local collection. Temporary entries expire after ten minutes and are removed on subsequent handoff activity, or when the browser session ends. Source addresses exclude query and fragment and remain unchecked by default. Editable and incognito selections are excluded. No automatic page capture, new network request, analytics or model execution occurs. See [scope and limits](../docs/selection-capture.md).

## Permissions

- Optional `scripting` and exact `https://claude.ai/*` access support the off-by-default Claude session-organization experiment described below. The manifest HTTPS wildcard also permits user-selected model origins, but this experiment requests only the Claude origin at runtime.

- `storage` saves settings and shortcut data locally and supports optional Chrome Sync.
- `unlimitedStorage` supports user-controlled local image data and cached icons.
- `contextMenus` provides the explicit selected-text review action.
- `identity` supports Google authorization for the optional Drive backup feature.
- The declared host permission `https://www.googleapis.com/*` allows Google Drive API requests. The declared OAuth scope `https://www.googleapis.com/auth/drive.appdata` is used for the app's backup data in Drive. These permissions are declared in the extension manifest; using Drive remains optional and requires Google authorization.
- The optional host permission `https://www.google.com/*` supports online favicon lookup and is requested when you enable that feature on the current device.

## Contact

For support or privacy questions, use the project issue tracker:

https://github.com/21888/chrome-local-itab/issues

## Optional direct-model requests

Optional direct-model requests send only the reviewed single prompt, model ID and any entered API key to the user-selected HTTPS Chat Completions endpoint after an explicit Send. The provider receives ordinary connection metadata and may charge. No ambient workspace, collection or browsing content is attached. Keys remain only in the dialog and are cleared after each request, endpoint edit or page departure; no key is saved in extension storage, Sync, backups or logs. Responses are saved only on explicit Save and then join the existing unencrypted collection/complete-backup formats; they may repeat private input. The optional `https://*/*` manifest declaration enables user-selected providers, but runtime permission requests name only the reviewed HTTPS hostname and port. Redirects are rejected and cookies/referrer omitted. See [reviewed model workflow](../docs/ai-model-workflow.md).

## Device-local model connection presets

Connection presets are optional, explicitly saved device-local metadata shared by the prompt-model dialog and saved-context Q&A panel. Only the preset name, validated HTTPS endpoint and model ID are stored as unencrypted text. The dedicated API-key/password field is never included. Do not put credentials or other secrets in preset names, endpoint paths or model IDs. Presets are excluded from manual exports, complete backups, Chrome Sync and Drive snapshots; restoring a backup preserves the destination device’s existing presets. Selecting or saving a preset never grants endpoint permission or sends a request; every request still needs exact destination/content review and explicit Send.

### Optional model comparison

When you explicitly choose Compare models, you can select up to two saved model connections and review each full endpoint, model ID and the same completed prompt. Only Send starts up to two provider requests; each provider may charge separately. Each target uses its own temporary API key and separate optional origin-permission action. Opening, selecting, reviewing or granting access never sends the prompt. Keys are not saved or copied between targets. Responses remain transient unless you explicitly save each result to local AI collections, where the original prompt-version reference and response may enter unencrypted backups.

## Optional historical Q&A input snapshots

Optional AI context Q&A sends only explicitly selected and reviewed global collection excerpts and the saved workspace note after Send. Saving an answer normally excludes the question and source snapshot. A separate, default-off choice can also retain the exact reviewed question, edited source IDs/labels/text, complete prompt, endpoint and model in the global collection and unencrypted collection/complete backups. API-key fields and authentication headers are excluded; text may still contain user-entered secrets. Omitting attribution source URLs does not remove this snapshot. It is historical input for the first saved answer version; later answer edits may differ, and imported snapshots and model citations are not proof of model output. Connection presets themselves remain excluded from backups; an opted-in answer snapshot separately retains that request's endpoint and model.

## Optional Claude session-organization snapshot experiment

This experiment is off by default and has not been validated with a real account. After explicit enablement and browser approval of optional `scripting` and `https://claude.ai/*` access, it lists eligible existing Claude tab IDs for manual selection. Selecting a tab runs packaged extension code in that tab's top-frame MAIN world and requests its organization list; selecting an organization rechecks the list and requests that organization's usage once. It does not bind or verify an account identity and is not a stable subscription balance or billing source. Internal endpoints may change.

The fixed same-origin GET endpoints are `/api/organizations` and `/api/organizations/{UUID}/usage`. Browser-managed existing session credentials authenticate these requests automatically (`credentials: same-origin`); extension code does not read or export cookie/token values. Claude (Anthropic) receives these requests and ordinary connection metadata. The experiment handles organization names/UUIDs and available five-hour/seven-day utilization percentages, reset timestamps and retrieval time in memory. It does not scrape conversations, inspect arbitrary page content, send prompts, use a developer relay, poll in the background, or persist results in extension storage, exports, Sync or backups.

Close/clear or leaving the page removes the local in-memory result and invalidates later callbacks. Closing does not revoke browser-granted permissions. An already-issued page request may continue until it completes or, under normal browser fetch behavior, reaches its ten-second timeout; immediate cancellation is not guaranteed. Organization-list continuity does not prove stable account identity. Verification so far is synthetic testing and account-free local UI checks, without a real permission grant or live account usage request.

### 中文说明

Claude 会话组织快照实验默认关闭，尚未真实账号验收。用户明确启用并通过浏览器授予可选 `scripting` 与精确 `https://claude.ai/*` 权限后，手动选择已有 Claude 标签页；扩展内打包的函数在该页顶层 MAIN 环境读取组织列表，选择组织后再次核对组织集合并读取一次用量。它不绑定或证明账号身份，不是稳定的订阅余额或账单依据，内部接口可能变化。

固定同源 GET 为 `/api/organizations` 和 `/api/organizations/{UUID}/usage`。浏览器通过页面现有会话自动认证（`credentials: same-origin`）；扩展不读取或导出 cookie/token 值。Claude（Anthropic）会收到请求和通常的连接信息。组织名称/UUID、可用的五小时/七天使用百分比、重置时间和读取时间仅在内存中处理。不抓取对话或任意页面内容、不发送提示词、不经过开发者中转、不后台轮询，结果不写入扩展存储、导出、Sync或备份。

关闭/清除或离页会清空本地内存结果并使迟到回调失效，但不撤销浏览器已授予权限。已发出的页面请求可能继续至完成，或在正常浏览器 fetch 行为下达到十秒超时，不能保证立即取消。组织集合未变不代表账号身份稳定。当前证据仅为合成测试和无账号本地UI验收，未实际授权或请求真实账号用量。
