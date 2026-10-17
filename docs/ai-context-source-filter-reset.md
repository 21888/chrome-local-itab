# Clear AI context source filters

In AI context Q&A, **Clear source filters** clears the source query, resets
scope to **All sources**, turns off **Show selected only**, and returns to the default
title-only search in one step. Optional
[current-excerpt search](ai-context-loaded-excerpt-search.md) is turned off. It reveals the existing loaded rows in their original order. It does not load other
workspaces or read fresh saved content.

Selections, original and edited excerpt text, the question, reviewed requests,
previous answers and the optional saved-answer snapshot choice remain unchanged.
Hidden selections stay selected. The existing **Clear title search** (named
**Clear source search** in excerpt mode) still clears only the query, leaving scope, selected-only and excerpt-search mode in place. **Cancel / clear
draft** remains a separate action that clears the draft.

The filter-reset button is disabled when all four filter controls are at their defaults.
Activating it moves keyboard focus to the title search before disabling itself.
It remains usable while a model request is pending; request and save controls keep
their existing guards. Hiding the page or closing the panel disables this action. Like the
existing filters, it changes the view captured by pending draft-consistency checks;
it does not authorize an older asynchronous operation to replace a newer view.

## 中文

在「AI 资料问答」中，点击「清除来源筛选」会一次清除来源搜索关键词、将范围设为
「全部来源」，关闭「只看已选」和「同时搜索当前摘录正文」，恢复默认只搜标题。
所有已加载行按原顺序重新显示，不会读取其他工作区或重新加载已保存资料。

原有勾选、原始及编辑后的摘录、问题、已审阅请求、先前回答和回答来源快照选择
均保留。隐藏的已选资料仍保持选中。「清除标题搜索」（正文模式中为「清除来源搜索」）
仍只清关键词，保留正文搜索模式；「取消 / 清空草稿」是另一项操作，不会被此按钮触发。

没有筛选时按钮禁用；点击后焦点回到标题搜索框。等待模型回答时仍可清筛选，
不会改变正在发送的请求。页面隐藏或面板关闭后不能继续操作此按钮。

## Verification boundary

Actual-view tests exercise separate/combined filters, empty results, mixed saved
and manual sources, row identity/order, original CRLF text, hidden edits, local and
API review identity, zero controller/storage/permission/transport calls, pending
transport, completed-answer snapshot consent, bilingual controls and focus/lifecycle
behavior. These are synthetic DOM/transport tests, not native browser or provider
acceptance. The repository-wide validation and publication gates remain separate.
