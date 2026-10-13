# Use a saved excerpt in a prompt variable

Each prompt variable has **Choose saved excerpt**. Open it, select one active saved
excerpt, review its exact current body and the existing value it would replace,
then choose **Replace this variable**. Nothing is preselected. Only that one
variable changes; other values and the saved template remain unchanged.

The chooser contains all active collection records, not only linked results.
Archived records and recovery copies are excluded. Titles identify choices, but
only the reviewed body is inserted: notes, tool labels, URLs and version history
are not copied. HTML, code and `{{template syntax}}` inside the excerpt remain
literal text, with their original whitespace and Unicode characters.

## Safety and lifecycle

- Selection is tied to one prompt, its exact in-memory preview session, one
  variable and the current collection read. Retained older prompt previews stay
  on their existing body version; insertion never silently switches to latest.
- Selecting another prompt, editing/resetting variable values, entering the
  editor, switching literal mode, prompt refresh, collection refresh, archival,
  read failure and page departure invalidate pending selections.
- Apply rereads both libraries before changing memory, to reject source or prompt
  changes even when cross-tab notifications have not arrived. Both immutable
  source-body identity and exact body text must still match the review.
- While applying, choices and Apply are disabled. Cancel and Escape still work;
  cancellation during either read or apply cannot cause a late insertion.
- Escape respects active IME composition. The dialog uses the existing keyboard
  focus trap and returns focus to its opener when that opener remains available.
- Unavailable or invalid storage is not reported as an empty library. Cancel and
  reopen to retry a read or select a changed excerpt.
- Completed-preview size limits are checked before replacing the variable. A
  limit error leaves all values unchanged.

This flow is read-only for persistent storage. Variable values live only in the
current prompt tab. It adds no schema, permissions, network/model requests,
clipboard actions, automatic prompt links or backup content. Copying a completed
prompt remains a separate explicit action. English and Simplified Chinese labels
are included; other locales follow the existing English fallback.

## Verification

`tests/local-prompts-excerpt-variables.test.js` uses synthetic prompt and collection
fixtures. It exercises explicit review/application, literal rendering and Unicode,
nonempty replacement and preservation of other variables, no writes/autocopy,
English/Chinese labels, keyboard cancellation/focus and IME, initial-read cancel,
apply cancellation/page departure, stale navigation and edits, delayed cross-tab
changes, archival, read errors/corruption, superseded reads, duplicate apply,
selection locking, preview expansion limits and retained older preview versions.

These automated DOM-model tests do not establish native-browser layout, actual
focus behavior or browser clipboard acceptance. Native acceptance and screenshots
are recorded separately; no native pass is claimed here.

## 中文

在某个变量旁点击「选择已收藏摘录」，明确选择一条未归档的收藏，核对完整正文
和将被替换的旧值，再点击「替换此变量」。只替换这个变量；其他变量、已保存的
模板和当前预览所用的正文版本不变。笔记、链接、工具说明和历史不会一起填入。

摘录中的 HTML、代码、花括号、空白和 Unicode 均按字面保留。填入只发生在当前
标签页内存中，不自动保存、复制、联网、调用模型或建立关联。

选择过期、归档、跨页更新、读取失败和预览超限都会阻止填入。正在核验时仍可
取消；取消、Escape 或离开页面之后不会延迟填入。读取失败与真正的空列表有
不同提示，需要重试时请取消后重新打开。

## Unsaved new drafts

After **Preview unsaved draft**, each temporary variable also offers **Choose
saved excerpt**. Review the full body and previous value, then explicitly replace
that one variable. This is available only for a new, unsaved prompt, not the
editor for a saved prompt. The template, placeholders and other variables stay
unchanged. There is no automatic save, copy, model run or prompt-library read.

A separate draft ticket binds the exact draft/preview identity, field revision,
input snapshot, preview epoch, variable-value revision and full value snapshot.
Editing and reverting any field or variable, restarting the preview, switching,
discarding, saving, cancellation and departure invalidate it. Apply rereads the
collection and checks its archive state, record/body version and exact body.
Single-value and expanded-output limits plus the shared 2,097,152 UTF-16-code-unit
value budget are validated before one atomic replacement. Any failure preserves
all previous values; this deliberately differs from a rejected manual edit.

`tests/local-prompts-draft-excerpts.test.js` covers the new flow with real Stores
and deferred reads, including atomic limit failures, Unicode/CRLF/prototype keys,
late cancellation, superseded reads, bilingual review, duplicate Apply and UI
rerenders. Native browser acceptance remains separate.

新建但未保存的 Prompt 在「预览未保存草稿」后，也可为单个临时变量选择已收藏
摘录。核对完整正文和旧值后明确替换；不改模板、其他变量，不自动保存、复制或
调用模型。编辑后改回、重新预览、切换、取消、丢弃或保存均使旧选择失效。
读取失败、来源变更或超限时，所有原变量值保持不变。

### Integrated draft-excerpt verification

The final implementation passed2765/2765 strict Node tests and81/81 Python.
Integration on the exact punctuation-fix parent preserved both punctuation
regressions and passed2767/2767 strict serial Node tests (1 GiB heap),81/81 Python,
and113-file packaging. Final24 new tests,41 prior focused tests and8 independent
adversarial checks passed. Apply synchronizes only the target input so another
variable's invalid unsaved text remains untouched. Native browser acceptance
is pending for this development commit; fault/race coverage is synthetic.
Manifest remains1.1.111; this ordinary feature does not publish a release.
