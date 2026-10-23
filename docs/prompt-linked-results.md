# Saved results for an exact prompt version

Prompt details now show active AI collection records explicitly linked to the exact prompt ID and immutable body-version ID. Cards contain only the saved result’s title and tool label. They are not ratings, recommendations, or a full-body preview. Unlinked, archived, differently linked and recovery-only collection records are excluded.

- Below the completed preview, the version scope follows the body actually used by that preview. If variable values retain an older body after a saved edit, its result section stays on that older version. Clear values to use the latest body.
- Inside body-version history, select a version to inspect its separate result list. This selection does not change the usable preview or its variables.
- Each card opens the existing exact collection-record destination in a new tab. Drafts and variable values remain in the prompt tab. The collection page independently handles missing or archived destinations.
- A loading message is not a zero-result count. Read failures show an unavailable state and an explicit retry. A new read immediately removes old cards; superseded responses cannot replace a newer result list.
- Collection notifications refresh only these result sections, preserving focused variable inputs, unsaved prompt drafts and the selected history version. Navigation, archive, unlink, read failures and disposal invalidate old card handlers.

The integration receives only collection read and subscription capabilities through the existing fenced backend. It adds no permissions, storage schema, automatic writes, network/model calls or clipboard actions. Existing full-backup behavior is unchanged. English and Simplified Chinese labels are provided; other locales use the existing English fallback.

## Return from a saved result to its prompt

An active saved collection detail offers **Open current details in prompt library (new tab)** in its exact prompt-link section. It appears only when the loaded prompt-library snapshot contains an active prompt with that exact version in its own body history. Archived prompts, recovery-only records or versions, missing versions and unavailable reads do not qualify.

The new tab opens that prompt's **current saved details**, even when the collection is linked to an older version. The collection keeps its exact historical link and unchanged excerpt. This is navigation, not selecting a version for preview, copying text or applying a prompt. No return action is added to collection drafts, picker previews or historical-question reviews. Other drafts remain in their existing tab.

Availability follows successfully loaded local snapshots and their existing refresh/subscription lifecycle. Starting a read withdraws stale navigation; read failures require a successful refresh. This does not promise instant knowledge of a change made in another tab before a notification or read arrives. The destination independently handles a now-missing or archived prompt through its existing target checks. No new storage reads, writes, schema, permissions, network/model calls or clipboard operations are added.

`tests/collection-prompt-navigation.test.js` checks the mounted collection detail with synthetic stores, native-anchor attributes, exact current/old version eligibility, recovery exclusion, read generations, stale click/auxclick rejection, hidden pages, BFCache lifecycle, dialogs, unchanged saved data and retained drafts/focus, plus Chinese/English/fallback text. These are bounded Node DOM-model checks. Real Chrome tab creation, context-menu navigation, Tab/Enter behavior, screen-reader behavior and visual layout have not been accepted for this new return action.

## Verification scope

`tests/local-prompts-linked-results.test.js` covers exact ID matching, active-only and recovery exclusion, safe native new-tab destinations, literal text rendering, retained old sessions, independent history scope, loading/error/empty distinctions, corrupt reads, out-of-order success and failure, disposal, archive/unlink events, focused input and draft retention, stale click/auxclick rejection, prompt navigation/read failure, subscription failure and Chinese labels.

These are synthetic unit/UI-model checks. Independent native Chrome acceptance on 2026-10-11 verified exact new-tab destinations, retained old-version previews, live version scopes, archive/restore updates, dark theme and Tab/Enter navigation on the 1.1.32 runtime. Native read-error injection was not performed; failure coverage above remains model-only. The acceptance used a disposable synthetic profile without user data. A representative keyboard-focus screenshot is included in docs/qa/prompt-linked-results.

## 中文

提示词详情现在可查看明确关联「此提示词 + 此正文版本」且未归档的已保存结果。卡片仅显示结果标题和工具说明，不作质量排序，也不展开结果正文。

预览下方的结果跟随当前预览实际使用的版本：如果保留的变量会话仍使用旧正文，结果也继续对应旧版本。清空变量后才切换至最新正文。历史记录内另有独立结果区，选择旧版本不会改变正在使用的预览。卡片在新标签页打开，当前页的草稿和变量不丢失。

读取中、读取失败和确实没有关联结果是不同状态。刷新会立即撤下旧卡片，读取失败可重试；不会将失败误报为没有结果。仅查询已有的精确关联，不按标题猜测、不自动改关联、不调用模型，也不增加联网、权限或数据结构。

### 从已保存结果返回提示词

未归档的已保存收藏详情，在精确提示词关联区提供「在提示词库打开当前详情（新标签页）」。只有当前已加载提示词快照中，该提示词未归档，且精确版本仍在它自己的正文历史内，才提供入口；归档、仅在恢复快照中存在、精确版本缺失或读取不可用时均不提供。

新标签页打开此提示词**当前已保存的详情**。即使收藏关联旧版，本页的精确历史关联与收藏正文仍保持不变；不会选择任何版本用于预览、复制或应用。编辑草稿、选择器预览和历史问题审阅中不增加此入口；其他草稿仍留在原标签页。

可用性以实际成功加载的本地快照为准，沿用既有刷新与订阅；开始读取即撤下过时入口，读取失败须成功刷新后恢复。不承诺其他标签页尚未通知、尚未重新读取时也能瞬时同步。目标页沿用原有缺失、归档目标处理；不增加存储读写、数据结构、权限、联网、模型或剪贴板操作。

新入口验证仅为合成数据的有界 Node DOM 模型测试，覆盖精确版本、恢复排除、读取代际、旧 click/auxclick、隐藏页面、BFCache、对话框以及双语文案和草稿/焦点保留。尚未对本入口进行真实 Chrome 新标签页、上下文菜单、Tab/Enter、屏幕阅读器或视觉布局验收。

## Cross-library subscription journey (2026-10-23)

`tests/collection-prompt-subscription-journey.test.js` connects both production Stores, Controllers and mounted Views with synthetic RAM backends. A saved result linked to an older immutable version returns through its generated URL and the production target resolver to the current saved prompt/body session. Navigation adds no writes. Archiving and restoring through the target Controller’s actual actions propagates through backend subscriptions, withdrawing and rebuilding the source return entry without manually refreshing or replacing controller snapshots. Retained old click/auxclick handlers reject navigation. The collection’s complete raw value and write count stay unchanged, and a separate unsaved result draft retains its identity and text throughout.

This adds a connected model journey, not native Chrome acceptance: URL resolution is invoked by the harness, archive/restore uses the real Controller action rather than a browser confirmation dialog, and DOM/RAM adapters do not prove browser tab creation, keyboard focus, installed persistence or upgrade recovery. The attempted native return journey remains unaccepted because the cloud browser could not reach the local fixture and terminal input encountered ambiguous window identity. No product defect was established or runtime change made.

双库订阅完整流程使用真实 Store、Controller 和已挂载 View：旧版本关联经生成的 URL/目标解析器打开当前正文，目标端实际归档/恢复操作通过后端订阅撤下并重建来源入口，旧处理器拒绝导航，收藏原始值与写次数不变，另一未保存草稿对象和正文保留。此为合成 DOM/RAM 集成模型，不是原生新标签页、键盘焦点、确认对话框、安装持久化或升级恢复验收；本次原生流程受环境连接和窗口身份限制，仍未验。未发现产品缺陷，未修改运行代码。

## Auxiliary subscription failure isolation (2026-10-23)

If registration of the collection page's auxiliary prompt listener throws while its own collection backend remains available, startup now continues to show saved collections with an explicit prompt-read-unavailable state. Previously that exception escaped before the collection's first read. The page does not read or admit prompt snapshots without the subscription, and Refresh cannot revive linked-prompt navigation in that instance. A dedicated English/Chinese message advises keeping unsaved draft pages open and reopening this page to attempt registration again; ordinary read failures retain their Refresh guidance. The main collection subscription, fenced writes and all exact-link validators are unchanged; this does not promise recovery if the main backend is also unavailable.

`tests/collection-prompt-subscription-failure.test.js` reproduced the rejecting startup before the fix and now verifies the corrected behavior with real Stores, a mounted collection View and a second case using the actual Workspace Manager fenced backends. Only the RAM/DOM and Chrome-event fault are synthetic. Own saved content remains visible, exact links stay unavailable, raw values and write counts remain unchanged, and independent listener cleanup runs. This is conditional API-failure coverage, not proof that Chrome normally throws here, a native-browser acceptance or an explanation of the historical upgrade incident.

收藏页的辅助提示词订阅注册抛错、但自身收藏后端仍可用时，现在隔离该错误并继续展示已有收藏，提示词关联保持明确不可用；不会读取或接纳缺少订阅保护的快照，刷新不能在该页面实例内恢复关联导航，须重新打开页面才能重新注册。主收藏订阅、存储写入栅栏与精确关联校验不变，也不保证主后端同时失效时仍可用。合成故障回归使用真实 Store/View 及 Workspace 后端，未归因历史事故或宣称原生验收通过。

## Main-library startup subscription failure (2026-10-23)

The independent prompt and collection pages now catch failure of their own Store's initial event subscription and display a specific English/Chinese unavailable message, instead of leaving startup rejected at its loading screen. In that page instance no main-library read or mutation is admitted, and an ineffective read-retry control is not offered. Keeping existing draft pages open and opening the library again attempts a new registration; successful registration reads the unchanged saved data. Ordinary read errors retain their existing retry behavior. Page bootstrap also stops before capture/result handoffs and further appearance-listener registration when this main subscription failed; it does not consume or acknowledge a capture token as a recovery step.

The two-library regression uses actual Stores, Controllers and mounted Views with synthetic event failure and RAM/DOM adapters. It reproduced both startup rejections before the fix, then checks visible failure, disabled creation, rejected Refresh/direct mutation, unchanged raw values/write count, and a fresh controller's successful registration/read. Three additional checks execute the actual page bootstrap with real controllers/views and verify zero main-library reads/writes, capture messages, result handoff reads, URL cleanup or post-start listeners after the failure; the appearance adapter can still perform its separate harmless read. It does not simulate native Chrome installation, screen-reader behavior or actual browser reopening, and does not attribute the historical upgrade incident. No storage format, permission, default-write, automatic restoration or CWS publication change is involved.

提示词库和收藏库自身订阅注册失败时，现在展示明确的双语不可用提示，不再停在启动加载状态；该页面实例拒绝主库读取及写入，不提供无效的刷新按钮。保留已有草稿页面并另开库页面后，只有新注册成功才读取原保存内容。启动流程不会在此失败后认领/确认摘录交接；普通读取失败的重试不变。验证为真实Store/Controller/View配合合成事件及DOM/RAM，不是原生重开、安装升级或历史事故归因。

## Reverse-link subscription recovery guidance (2026-10-23)

When the prompt page cannot register its auxiliary saved-result subscription, its already fail-closed result section now explains that a separate reopening is needed and omits the ineffective “Read results again” action. Keep the old page open for its unsaved prompt draft and variable values; this does not transfer them to a new page. Normal result-read failures still offer the original retry action. No controller, storage, link identity or mutation behavior changes.

The English/Chinese regression reproduces the misleading action before the fix, then uses real Stores, Controller and mounted View with synthetic RAM/DOM event failure. It verifies the retained prompt, absent unsafe result cards, zero result reads in the failed instance even after the backend recovers, unchanged raw data/write counts, a fresh controller's successful result linkage, and the old instance's same draft/session objects and values. A later ordinary read failure recovers via the actual retry button. This is not native page reopening, cross-tab Chrome storage persistence, or historical upgrade-incident recovery.

提示词页的辅助结果监听注册失败后，现在提示保留旧页草稿及变量、另开页面重试，不再显示无法恢复该实例的“重新读取结果”；普通读取失败仍保留有效重试。双语合成回归验证原内容、草稿及变量保留和新实例重新注册，不宣称草稿迁移、真实浏览器重开或历史事故修复。
