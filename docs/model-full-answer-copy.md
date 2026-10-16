# Copy complete model answers / 复制完整模型回答

The prompt library's **Run with your model** result and each **Compare models**
column now have a **Copy full answer** button. A completed original-versus-proposal
trial answer has the same action. Editable refinement proposals do not.

- Copying requires an explicit click and a complete, nonblank, still-current
  response. Opening, reviewing, streaming, stopping, failing, saving or switching
  Reading/Original does not copy anything.
- The clipboard receives only that target's exact original answer string,
  including Markdown, CRLF/CR/LF, Unicode and leading/trailing whitespace. It does
  not include the request, model labels, endpoint, temporary key or diff view.
- Reading, Original, parser fallback and reader-unavailable paths all use the
  same immutable response. Full-answer copy does not reparse, save or export it.
- A completed comparison target can be copied while its peer remains pending,
  fails or undergoes a separately reviewed retry. Each column has independent
  polite feedback and a target-specific accessible button name.
- Existing prompt, full-answer and code-block copies share one clipboard lock.
  Repeated clicks are ignored, never queued or retried automatically. Closing
  or hiding a dialog cannot cancel a write already started or free its lock
  before the original promise settles.
- Failure offers manual selection/copy of the original text, without showing
  success, exposing the clipboard error or replacing save/provider feedback.
- Closing, source/workspace changes, hidden-page round trips, replacement
  responses and detached/hidden/inert views suppress late feedback. A blurred
  copy button can regain focus when the visible dialog returns, but never steals
  newer focus; clipboard completion itself never changes focus.

中文：单模型回答和模型对比各列新增“复制完整回答”。只复制该回答的完整原文，
保留原始格式与空白；流式未完成、失败、已失效的回答不可复制。两列与代码块复制共用
防重复锁，反馈各自独立。复制不发送请求、不保存回答、不新增权限，也不改变存储结构。

## Focused verification

Synthetic Node/DOM tests cover exact-text fidelity and independent attribution,
Reading/Original/fallback display, shared full/code locks, duplicate clicks,
missing/rejected/throwing clipboard adapters, explicit retry, incomplete and
stopped streams, actual transport rejection of blank answers, independent
comparison completion/retry, trial-value invalidation, close/reopen ownership,
source/workspace/preset changes, hide/return and focus preservation, inert/detached
controls, English/Chinese labels, and unchanged collection-save payloads.

    node --test --test-concurrency=1 tests/ai-model-view.test.js tests/ai-model-comparison.test.js tests/safe-answer-reader.test.js tests/local-prompts-view.test.js tests/ai-model-client.test.js

All inputs and responses are synthetic. These checks do not exercise an actual
clipboard, provider, browser layout, keyboard default actions or screen reader,
and do not establish native Chrome upgrade acceptance. Manifest stays 1.1.155;
this development commit does not publish a release.
