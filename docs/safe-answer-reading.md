# Safe answer reading / 安全答案阅读

完整成功的上下文 AI Answer、提示词单模型回答、模型对比各列回答（含原稿/提案试用答案），以及 AI 收藏的当前正文默认显示只读阅读视图，可随时切换“原文”。段落、标题、列表、粗斜体、删除线、代码、引用与表格仅改变展示；整篇复制、保存、JSON/Markdown 导出和历史版本继续使用未经修改的原始字符串；块级“复制代码”只复制 Reading 中所见的代码文本。

- 任务 JSON、发送前审阅、提示词/正文编辑器、可编辑优化提案及其原始模型答复、历史正文、历史输入快照和未完成的流式正文均不进入阅读器。
- 链接与图片只显示标签/替代文字和 URL 文字；不生成可点击链接、图片、预览或网络请求。来源元数据中的原有用户提供链接不受影响。
- HTML/SVG 等 token 原文显示，不执行。实体如 `&amp;` 保留字面写法，不经过 HTML 解码。
- 长代码和宽表各自横向滚动；长正文的阅读区可聚焦并滚动。没有语法高亮、公式、图表、自动折叠或编辑能力。
- 排版不可用或超预算时显示完整原文，不截断、不丢失。保守预算可能让合法但复杂的长表格、代码或列表回退原文；切换不写存储。

## Implementation boundary

Pinned Marked 18.1.1 was obtained from the official npm registry tarball. The tarball was checked against its registry SHA-512 integrity. `vendor/marked/PROVENANCE.json` records source URL, tarball/file SHA-256, exact shipped byte count and the sole modification (removing the local source-map comment). Full upstream MIT license information is shipped in `vendor/marked/LICENSE`. The shipped UMD is 47,917 bytes. No CDN, remote script, third-party plugin or runtime dependency resolution is used.

Only a fresh local `Lexer` instance is used. Default Marked HTML rendering is never called. Tokens are converted with an explicit tag allowlist through `createElement` and `textContent`; input never supplies element names, classes, styles, IDs, event handlers or URL attributes. A validated bounded integer may set ordered-list numbering. The shipped full upstream build contains its unused renderer implementation; it is not an application execution path.

Bounds: 32,000 UTF-16 code units; a linear preflight budget of 512 ASCII punctuation characters; lexer nesting 24, 6,000 recursive calls, 512,000 cumulative input code units; renderer token/item count 6,000, nesting 24 and 8,000 DOM nodes. The preflight is a conservative character count, not a replacement Markdown parser. It rejects punctuation-dense inputs before expensive lexer regular expressions run. Exceptions and exceeded budgets discard the detached render and return the entire original text. These are finite input/complexity limits, not a universal wall-clock performance guarantee.

A completed Answer is parsed on response identity change, not on streaming chunks or view updates. Saved current bodies reuse their component while the same record/body stays selected; edit, body/record change, BFCache departure and destruction discard the component. Existing response ownership, previous-request warnings and partial-save/copy restrictions are unchanged.

## Verification

Node tests cover whitelist elements, HTML/SVG/XSS-like strings, dangerous URL schemes, no URL-bearing elements or network APIs, raw copy/save/export/history equality, 32k plain text, dense malicious inputs, nested quotes, unclosed fences, wide tables, budget failures, parse caching, stream/Stop/late-result ownership, record switches, editor exclusion and destruction. Official dependency bytes/license hashes and explicit runtime packaging are checked. These synthetic tests do not call a real model or validate provider accounts. DOM model assertions are not native-browser layout, keyboard or screen-reader acceptance evidence.

References: https://marked.js.org/using_pro#lexer and https://marked.js.org/license

## Prompt model result integration

The prompt page loads the same already-packaged local lexer, reader and CSS. No new parser, package, permissions, provider endpoint or storage fields are introduced. Each successful single-run response or comparison target mounts one independent reader only at final completion. Ordinary status changes, saves, failures/retries in another column, and Reading/Original switches do not reparse. Per-target headings, reviewed connection provenance and exact response strings continue to own collection saves.

Streaming chunks, stopped/failed partial answers, outgoing reviews, saved prompt originals, editable refinement proposals and the refinement's original-model-response textarea remain literal. Trial answers can use the reader because they are completed read-only results, but their existing no-save/no-accept behavior is unchanged. Closing a trial clears its two readers before returning to the editable proposal; a later trial starts empty.

Retry, invalidation, source interruption, close and destruction release the affected reader. A hidden document releases formatted DOM and retains whatever literal output the pre-existing flow permits. Returning to the tab does not reparse or relabel an old result as new; the old original stays selectable. A request completed while hidden stays on the original-text path. Prompt View destruction now invokes its existing model-dialog interruption hook so completed reader DOM is also released on controller teardown. No request is sent by reader controls or visibility changes.

Additional synthetic regression coverage: localized English/Chinese shared controls; single-run completion and streaming failure/stop/late retry; two-column partial failure and isolated retry; exact CRLF/Unicode/trailing-whitespace original and collection-save payload; independent model/origin attribution; unchanged refinement edit/cancel/accept; trial close/reopen and edited-proposal ownership; source/visibility/close/controller cleanup; URL-bearing/active DOM exclusion; two near-32k cards with repeated toggles and save updates parsing only twice total. The coarse two-card timing assertion is a regression guard in the modeled DOM, not a browser performance promise. The existing full suite also covers collection copy/export; native clipboard, focus, layout and actual provider calls are not established by these tests.


## Explicit code-block copy

Each non-empty fenced or indented code block in a completed Reading view has a native “Copy code” button when its host supplies a clipboard adapter. Inline code, empty blocks, raw-text fallback, Original view and readers without that adapter have no active code-copy action. The safe renderer remains a pure whitelist renderer with no clipboard, storage or network access.

The copied string is the same parser token snapshot assigned to code.textContent: no fence, language hint, explanation, trimming or appended newline. This is displayed-code fidelity, not Markdown byte fidelity; lexer newline/indent normalization is reflected in both Reading and code copy. Full-answer copy, saving, history and export still use the untouched source.

A user click starts the clipboard write directly, never queued or automatically retried. Blocks share their host's pending clipboard lock with existing whole-answer/prompt copying; both comparison columns and reopened model dialogs share the prompt view lock. A pending write remains locked until its original promise settles, including when a reader closes or its answer changes. Closing or switching view cannot undo a clipboard write already started. Late feedback requires the same answer and live Reading lifecycle and never changes focus. If copying is unavailable or rejected, select the code and copy manually; no legacy execCommand fallback is used.

English and Chinese labels number code blocks without trusting language strings. One polite status region per reader announces feedback. Code remains separately selectable and horizontally scrollable; locking a focused copy button moves focus synchronously to its code region, while completion never takes focus.

Regression coverage includes displayed whitespace/Unicode/CRLF/HTML equality, optional adapters, partial-render fallback, multiple blocks, whole-answer/history sharing, comparison-column races, hidden/raw/destroyed controls, old promises and rejection. These are synthetic source/DOM checks; native browser layout, clipboard permissions, keyboard activation and assistive-technology announcements require separate acceptance.

## Saved-answer sections / 收藏答案章节定位

仅 AI 收藏的当前正文（含已归档收藏）开启章节定位：同一次安全解析产生至少两个非空根级 Markdown 标题时，在正文滚动区上方显示默认折叠的“章节（N）”。h1–h6、Setext 和跳级标题均按正文顺序列出；引用、列表、代码及原样 HTML 块中的伪标题不计入。重复标题以序号区分，超长目录文字换行并限制显示高度，完整正文不裁剪。

选择目录项仅滚动该答案的正文区，并把焦点移到对应标题；目录保持展开以便再次定位。目录使用原生 details/summary 和按钮，支持正常 Tab/Shift+Tab 导航及 Enter/Space 激活。关闭目录、切换原文或销毁阅读器后，旧目录操作无效。切回阅读模式不自动跳转；同一正文重绘沿用原目录和内部滚动位置；目录或目标标题的焦点在重挂后保留，忙碌时安全返回目录摘要，用户已移到别处的焦点不会被抢回。保存、读取待定及错误状态会暂停目录操作，恢复后可继续使用。原文切换和同正文重绘仅保留当前阅读器的临时阅读位置；隐藏时的零值不会覆盖此前所见位置。没有新快捷键、滚动跟踪、跨阅读器或跨会话的位置记忆、哈希链接或存储字段。

Only the current saved-answer Reading view opts into this control. History, editors, Original text, safe-render fallbacks, model-run pages and readers without explicit opt-in are unchanged. Every item keeps its render's actual heading-node reference; titles are plain text, never IDs, fragments, URLs or executable markup. A user activation writes only the answer content's vertical scroll position and focuses the heading with preventScroll. It does not call scrollIntoView, change the outer-page position, change code-block horizontal scrolling, update location/history, copy text, call providers or write storage. Existing parser limits and original-body/copy/export/history semantics remain unchanged.

### Reference and implementation

The interaction was informed by MarkText's official [table of contents](https://github.com/marktext/marktext/blob/c2c4bcc4b28d99dbd2d9b5bfdedc519bb0366e7d/packages/desktop/src/renderer/src/components/sideBar/toc.vue) and [TOC navigation](https://github.com/marktext/marktext/blob/c2c4bcc4b28d99dbd2d9b5bfdedc519bb0366e7d/packages/desktop/src/renderer/src/util/tocNavigation.ts), under its [MIT license](https://github.com/marktext/marktext/blob/c2c4bcc4b28d99dbd2d9b5bfdedc519bb0366e7d/LICENSE). This is an independent native-DOM implementation: no MarkText source, framework, HTML-rendering path, dependency or permissions were added.

### Focused verification

`tests/collection-section-navigation.test.js` exercises root-only/all-level/Setext headings, repeated/empty/long/hostile titles, code and HTML exclusions, parser fallback, explicit opt-in, bilingual labels, closed/Original/hidden/inert/detached/destroyed guards, current DOM references, repeated top/middle/end navigation, focus options and vertical-only scrolling. A Chrome-style detach model also checks exact Reading offsets (including zero), busy and deferred-read redraws with outside focus, and one-shot position captures that cannot outlive a newer capture, section action, Reading generation or reader. Hidden-Reading getter/latent-offset models cover Original→busy redraw→Reading, repeated mode switches, deferred reads and new-body ownership without replaying hidden zero or an earlier Reading position. Collection integration checks same-reader reuse, busy/pending/failure recovery, archive/edit/cancel/selection/body-change/BFCache retirement, and exact copy/export/history preservation with no navigation writes. All fixtures are synthetic. These DOM-model tests do not establish real-browser layout, keyboard default actions, zoom, theme rendering or screen-reader acceptance; those require separate native validation.
