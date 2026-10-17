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
