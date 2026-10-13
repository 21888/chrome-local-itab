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

Search excerpt titles to narrow the already-loaded list, with a match count and
Clear title search. Search matches every space-separated term in the title,
ignoring case and Unicode compatibility differences (including full-width letters
and composed/decomposed accents). It does not search bodies or read storage again.
Changing or clearing the query clears the current review and disables Apply;
select a visible result again. Duplicate titles keep their separate original IDs.
Search is disabled during loading, Apply or a stale/error state; Cancel and reopen
to retry after an error. This also works in unsaved new-draft previews.

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

`tests/local-prompts-excerpt-search.test.js` also covers title-only matching,
Unicode normalization, duplicates/original IDs, empty/no-match states, review
invalidation, stale detached choices, read counts, loading/Apply locks and IME
cancellation for both saved and unsaved-draft previews in English and Chinese.

These automated DOM-model tests do not establish native-browser layout, actual
focus behavior or browser clipboard acceptance. Native acceptance and screenshots
are recorded separately; no native pass is claimed here.

## 中文

在某个变量旁点击「选择已收藏摘录」，明确选择一条未归档的收藏，核对完整正文
和将被替换的旧值，再点击「替换此变量」。只替换这个变量；其他变量、已保存的
模板和当前预览所用的正文版本不变。笔记、链接、工具说明和历史不会一起填入。

可搜索当前已读取的摘录标题，查看匹配数量并清空搜索。以空白分隔的词均需
匹配标题，忽略大小写和 Unicode 兼容形式；不搜索正文，不额外读取存储。
更改或清空搜索会撤销审阅并禁用替换，须重新选择可见结果；同名摘录仍保留
各自的原始身份。读取、替换核验、过期或错误期间禁用搜索；可取消后重开。
新草稿临时预览同样支持。

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
variable's invalid unsaved text remains untouched. Limited Chinese-light native acceptance passed full alpha/old-value review,
cancel preserving three values, keyboard target-only Apply at ordinary200% zoom,
other values/template preservation and returned opener focus. Discard restored
Prompt0 and baseline. No native save/copy/provider, invalid/max input, external
mutation or fault/race coverage; those remain synthetic.
Manifest remains1.1.111; this ordinary feature does not publish a release.

### Title-search development verification

The frozen implementation passed2776/2776 strict Node tests with1 GiB heap and
81/81 Python tests. Independent6-case audit and49 related tests passed after
ensuring invalidated review text moves focus to Cancel before removal. Runtime
packaging verifies113 explicit files, with no controller, Store, permission or
schema change. Limited native Chinese-light and English-dark title search validation passed match/empty/clear, query invalidation and modal keyboard paths at100%/200% representatives. Chinese beta Apply changed only its target; English supplement canceled without applying. No native Unicode/limit/race/read-count claim;
manifest remains1.1.112 and no release is created by this commit.
