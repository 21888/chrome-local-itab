# Safe answer reading / 安全答案阅读

完整成功的上下文 AI Answer、提示词单模型回答、模型对比各列回答（含原稿/提案试用答案），以及 AI 收藏的当前正文默认显示只读阅读视图，可随时切换“原文”。段落、标题、列表、粗斜体、删除线、代码、引用与表格仅改变展示；复制、保存、JSON/Markdown 导出和历史版本继续使用未经修改的原始字符串。

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
