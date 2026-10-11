# Saved results for an exact prompt version

Prompt details now show active AI collection records explicitly linked to the exact prompt ID and immutable body-version ID. Cards contain only the saved result’s title and tool label. They are not ratings, recommendations, or a full-body preview. Unlinked, archived, differently linked and recovery-only collection records are excluded.

- Below the completed preview, the version scope follows the body actually used by that preview. If variable values retain an older body after a saved edit, its result section stays on that older version. Clear values to use the latest body.
- Inside body-version history, select a version to inspect its separate result list. This selection does not change the usable preview or its variables.
- Each card opens the existing exact collection-record destination in a new tab. Drafts and variable values remain in the prompt tab. The collection page independently handles missing or archived destinations.
- A loading message is not a zero-result count. Read failures show an unavailable state and an explicit retry. A new read immediately removes old cards; superseded responses cannot replace a newer result list.
- Collection notifications refresh only these result sections, preserving focused variable inputs, unsaved prompt drafts and the selected history version. Navigation, archive, unlink, read failures and disposal invalidate old card handlers.

The integration receives only collection read and subscription capabilities through the existing fenced backend. It adds no permissions, storage schema, automatic writes, network/model calls or clipboard actions. Existing full-backup behavior is unchanged. English and Simplified Chinese labels are provided; other locales use the existing English fallback.

## Verification scope

`tests/local-prompts-linked-results.test.js` covers exact ID matching, active-only and recovery exclusion, safe native new-tab destinations, literal text rendering, retained old sessions, independent history scope, loading/error/empty distinctions, corrupt reads, out-of-order success and failure, disposal, archive/unlink events, focused input and draft retention, stale click/auxclick rejection, prompt navigation/read failure, subscription failure and Chinese labels.

These are synthetic unit/UI-model checks. Independent native Chrome acceptance on 2026-10-11 verified exact new-tab destinations, retained old-version previews, live version scopes, archive/restore updates, dark theme and Tab/Enter navigation on the 1.1.32 runtime. Native read-error injection was not performed; failure coverage above remains model-only. The acceptance used a disposable synthetic profile without user data. A representative keyboard-focus screenshot is included in docs/qa/prompt-linked-results.

## 中文

提示词详情现在可查看明确关联「此提示词 + 此正文版本」且未归档的已保存结果。卡片仅显示结果标题和工具说明，不作质量排序，也不展开结果正文。

预览下方的结果跟随当前预览实际使用的版本：如果保留的变量会话仍使用旧正文，结果也继续对应旧版本。清空变量后才切换至最新正文。历史记录内另有独立结果区，选择旧版本不会改变正在使用的预览。卡片在新标签页打开，当前页的草稿和变量不丢失。

读取中、读取失败和确实没有关联结果是不同状态。刷新会立即撤下旧卡片，读取失败可重试；不会将失败误报为没有结果。仅查询已有的精确关联，不按标题猜测、不自动改关联、不调用模型，也不增加联网、权限或数据结构。
