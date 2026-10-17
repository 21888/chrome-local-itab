# Search loaded titles and current excerpts

AI context Q&A searches **loaded source titles** by default. Turn on **Also search
current excerpt text** to match the title or current outgoing excerpt. Matching is
local, case-insensitive and literal: punctuation is not a regular expression.

This option only examines saved and manual sources already loaded in this panel.
It uses the original exact text until you edit an excerpt, then your current edited
text. The source list is never reloaded by searching. Other workspaces, source URLs,
IDs, annotations and unadded temporary text are not searched. Untouched CRLF/CR
line endings remain intact in the outgoing review.

Text matching is combined with the scope and selected-only filters. Hidden
selections remain selected and included in review/sending. Batch selection still
counts every hidden selection toward the 12-source limit and never partially adds
an over-limit batch. Editing an excerpt can make its row stop matching; existing
keyboard focus recovery moves to another visible source or the selected-only button.

In title-only mode, **Clear title search** clears only the query. When excerpt
search is on, the same button is named **Clear source search**. Neither clears the
scope, selected-only view or excerpt-search choice. **Clear source filters** resets
all four view controls, including returning to title-only search. Clearing the
whole draft or explicitly applying a reviewed collection excerpt also restores
that default view.

Changing a search or its mode does not edit the request, select text for sending,
read storage, request permissions, send a request or save anything. Existing local
and API reviews, previous answers and optional snapshot consent stay unchanged.
The option remains usable during a model request and is disabled when the page is
hidden or the panel closes. A newer mode choice is included in draft-consistency
checks, so an older pending reload or host replacement cannot replace it.

## 中文

「AI 资料问答」默认只搜索**已加载来源的标题**。明确勾选「同时搜索当前摘录正文」
后，会匹配标题或当前将用于请求的摘录正文。搜索仅在本地进行，不区分大小写；
标点按字面匹配，不作为正则表达式。

只搜索面板中已加载的已保存来源和手动临时摘录。未编辑时使用原始正文，编辑后使用
当前编辑文本；搜索不会重新加载来源，不搜索其他工作区、来源网址、ID、批注或尚未
添加的临时文字。未编辑的 CRLF/CR 换行在请求审阅中原样保留。

文字条件与范围、「只看已选」取交集。隐藏的勾选仍保留并参与审阅和发送；批选的
12 条上限仍计入所有隐藏选择，超限时不会只选一部分。编辑正文后若该行不再匹配，
键盘焦点沿用原有规则移到其他可见来源，或「只看已选」按钮。

默认模式的「清除标题搜索」只清关键词；正文模式中同一按钮改名为「清除来源搜索」。
两者均保留范围、「只看已选」和正文搜索选择。「清除来源筛选」一次重置这四项视图
设置，恢复只搜标题。清空整个草稿或明确应用已审阅的收藏摘录时，也会恢复默认视图。

搜索和切换模式不会编辑请求、改变勾选、读写存储、申请权限或发送内容。已审阅请求、
先前回答及回答来源快照同意均保留；等待模型回答时仍可改变视图，页面隐藏或面板关闭
后不能操作。模式变化参与草稿一致性检查，较早的待完成重载或面板替换不能覆盖新视图。

## Verification boundary

Focused synthetic DOM/transport tests exercise default/opt-in matching, Chinese and
literal symbols, raw line endings, edited text and restore focus, mixed manual/saved
sources, filter intersections and hidden-selection limits, unchanged local/API
reviews and answer snapshot consent, zero-I/O search, pending transport/reload/host
replacement, bilingual copy and lifecycle guards. These are not native browser or
real-provider acceptance. Full validation and publication remain separate gates.
