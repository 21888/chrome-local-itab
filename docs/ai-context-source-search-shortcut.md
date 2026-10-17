# AI context source-search shortcut

## English

Within **AI context Q&A**, press `/` from a non-editing area to focus the source
search and select its existing query. The initial **Close** button is included.
A visible hint next to the search and `aria-keyshortcuts="/"` expose the shortcut
in English and Chinese. It works in both the new-tab and collection-page dialogs.

This only moves focus and selects the query. It does not change the query, scope,
selected-only or excerpt-search options; filter or rebuild sources; alter source
selection or excerpt text; invalidate local/API review; or touch answers, saved
snapshots or uncertain write receipts. It performs no storage, clipboard,
workspace-check, permission or network operation. It remains available while a
model request is pending, without changing that request.

Typing in inputs, textareas, selects or editable descendants is left alone,
including typing `/` in the source search itself. IME composition, repeated keys,
Ctrl/Meta/Alt/AltGraph combinations and already-handled events are ignored. A
literal `/` produced with Shift is accepted, matching the existing library
shortcuts across keyboard layouts. This does not implement a Ctrl/Cmd shortcut.

The shortcut is local to the current dialog (or the mounted context panel when
used alone). It does not intercept keys outside it, from hidden/inert/disconnected
controls, after workspace departure/invalidation or panel destruction, while the
saved-prompt picker is open, or under another visible modal. Its own modal wrapper
is allowed. It prevents the key's default only after focus has actually moved to
the search, so the collection library's document-level `/` handler does not take
focus. Closing the dialog restores the opener and the collection library's normal
shortcut. Existing Tab trapping, IME-safe Escape and discard confirmation remain.

## 中文

在「AI 资料问答」的非编辑区域按 `/`，即可聚焦来源搜索并全选已有关键词；
刚打开面板时聚焦的「关闭」按钮也支持。新标签页和收藏页入口使用相同功能。
搜索框旁有中英文提示，并提供 `aria-keyshortcuts="/"`。

快捷键只定位搜索框、全选关键词，不改查询、范围、「只看已选」或正文搜索选项，
不重新筛选或加载来源，也不改勾选、摘录、问题、审阅请求、回答、快照或不确定写入
回执。不读取存储、剪贴板或工作区，不请求权限、不发送或保存。等待模型回答时也可使用。

输入框、文本框、选择框及可编辑区域中的 `/` 保持正常输入。中文输入法组合期间、
按键重复、Ctrl/Meta/Alt/AltGraph 组合键和已处理事件不会触发；部分键盘布局使用
Shift 产生的字面 `/` 仍可触发。模板选择器展开或另一个可见模态层覆盖面板时不抢焦点。
隐藏、失效、销毁的面板不处理快捷键。Tab、Escape、取消丢弃及返回原入口焦点保持原流程。

## Verification boundary

Local regression uses the real context view/controller/stores and shared dialog
wrapper, plus the actual collection page scripts and existing test harness.
Only the new tests extend their local event dispatch to model browser
`defaultPrevented`, document bubbling and text selection; no shared harness is
changed. Fixtures, transport replies and uncertain-write failures are synthetic.

Focused coverage includes:

- English/Chinese visible hint, initial Close focus, exact query selection
- Editable targets and ancestors, independently editable active focus, IME flags,
  composition end/blur/removal/hidden-page cleanup, repeats and modifiers
- Hidden/inert/disconnected/disabled controls, focus failure, page departure,
  stale workspace session, template picker and foreign modal boundaries
- Unchanged query/filter/draft, selected hidden excerpt, local/API review,
  pending request, answer snapshot and uncertain answer/task receipts; zero
  extra read/write/permission/clipboard/network/workspace-check calls
- Tab/Escape/discard cancellation, opener restoration, standalone mount,
  close/reopen/pagehide cleanup and collection document-shortcut routing

These are synthetic DOM and transport checks, not native Chrome keyboard/IME,
focus painting, screen-reader or visual-layout acceptance. No browser screenshot,
real provider request or personal data was used. Repository-wide CI, release and
store publication remain separate gates; this feature does not change the
extension version or publish a release.

Local checks on 2026-10-17 used Node with a 512 MiB heap and test concurrency 1:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  --test-name-pattern='source slash:' \
  tests/ai-context-source-search-shortcut.test.js tests/collection-context-handoff.test.js
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/ai-context-source-search-shortcut.test.js tests/ai-context-view.test.js \
  tests/ai-context-prompt-reuse.test.js tests/collection-context-handoff.test.js \
  tests/library-search-shortcut.test.js
```

The final 11 focused cases ran against the original view first: 1 passed and 10
failed on the missing shortcut. With the implementation, the five-file adjacent
suite passed all 385 tests. Changed JavaScript syntax, both locale JSON files and
`git diff --check` passed. No full-suite or scale-test rerun was made locally.
