# Calculator: edit a recent expression

Date: 2026-10-17. This adds a second action to each existing page-local recent-calculation row. The evaluator, five-entry bound, current-result continuation, clipboard APIs, storage, shared lifecycle, manifest version (1.1.155), permissions and release workflow are unchanged.

## Behavior

- “Edit expression” / “编辑表达式” restores that record's exact original input, including its original `=`, leading/trailing whitespace, spacing and scientific-notation spelling. It does not substitute or format the result. The existing “Use result” action still restores `=` plus the complete result.
- The new native `type="button"` uses the existing recent-row wrapping and keyboard-focus styles. It focuses the writable search input and places the caret at the end. Existing English and Chinese translations are explicit; a missing or empty translation uses the English fallback.
- The existing edit/hint path clears the old current result, copy feedback and search status. Editing an expression does not evaluate, submit, navigate/search, access the clipboard, save, append a history record, reorder the list, clear it or redraw it. Another explicit submission is required to calculate and append a successful record.
- The expression becomes the same unsaved draft protected by the existing reload guard. History alone adds no reload blocker. Remounting or reloading still discards these page-local entries.

## Ownership and interruption boundaries

The two row actions share one small draft-handoff helper while keeping separate exact control ownership: the existing result action retains `record.control`, and the expression action uses `record.editControl`. Both check record membership, their exact current control, the closure's exact row in the current list, mounted ownership, visibility, lifecycle, composition and a writable connected input before acting. Disabling or removing a sibling action does not revoke the other action.

Before focus, each action snapshots the draft value and both edit/submission revisions. After focus it rechecks the record/control/row authority, focus, text and revisions. New edits (including edit-away-and-back), custom-input edits, submissions, record clearing/eviction/redraw, hidden or unavailable controls and owner replacement cannot authorize the old action to overwrite newer work. Reattaching old rendered controls or whole old rows after redraw, clearing or eviction cannot restore their authority. Moving a live control into another record's row is rejected. The final caret update retains the existing revision, focus and current-action checks.

A pending calculator clipboard write remains globally locked until that already-issued write actually settles. Expression editing only invalidates its old feedback via the existing edit path. Late success/failure cannot overwrite the draft, result, focus or history, including after a replacement owner mounts. The expression action itself never reads or writes the clipboard.

## Bounded deterministic checks

Twelve appended named tests exercise the real search initializer and existing DOM model, leaving the previous fourteen recent-history tests and shared harness unchanged. They cover:

- Exact raw expression restoration in both locales, including whitespace, exponent case/sign, decimal rounding, large values and negative zero; full result reuse remains covered by the original tests.
- Explicit subsequent submission, no automatic calculation or I/O, unchanged record order/bound and row identity, existing copy/error feedback clearing, and unsaved-draft reload protection.
- Native-button wiring, keyboard eligibility without synthetic clicks, modifier/repeat/composition/key-code-229/prevented/double-click-tail rejection, and unavailable input/control/row/ancestor/page/lifecycle states.
- Independent sibling controls, exact row membership, stale controls and entire rows reattached after redraw/clear/eviction, owner remount, synchronous focus reentry, edit ABA, submission revisions and a newer sibling action during focus.
- Pending clipboard success/failure, shared lock through settlement and owner replacement, stale feedback suppression, clipboard independence, fallback labels and reuse of existing wrap/focus CSS.

The bounded command is:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-calculator-recent-results.test.js \
  tests/local-calculator-continue-result.test.js \
  tests/local-calculator-copy-result.test.js \
  tests/local-calculator-integration.test.js \
  tests/search-draft-lifecycle.test.js \
  tests/search-regression.test.js
```

The exact bounded command passed on 2026-10-17: 54 tests, 54 passed, 0 failed, 0 cancelled and 0 skipped. No implementation or test correction was needed after this run. The fourteen original recent-history tests remain an unchanged prefix; the twelve new tests are appended. Source and tests were then frozen for independent review. Byte checks also verified all 1,408 existing CRLF sequences and every byte outside the search initializer, with CSS, evaluator, shared lifecycle, shared DOM helper, manifest and the historical recent-results validation note unchanged.

## Independent review

Eight additional temporary probes passed against the shipped search initializer: separate original expressions with equal numeric results, consecutive result/expression reuse, old retained-record callbacks after redraw, reciprocal action during focus, same-value edits and same-expression submissions during focus, unresolved clipboard ownership across remount, and clipboard-free restoration preserving custom-search drafts. The focused and independent checks total 62/62.

Python regression: 84/84. Offline runtime package construction and source verification: 133 files, SHA256 `619f399004db9edb50cb14ff4112c80b776a0a6fae0cc6f5ed7283dadc5984a3`. These are source/model checks; they do not establish native browser acceptance. Manifest and release configuration remain unchanged.

## Limits

These Node/VM checks use test-local focus, selection, clipboard, observer and reload-notice stand-ins. They do not establish native browser keyboard synthesis, IME/focus or mutation timing, assistive-technology behavior, OS clipboard contents, visual layout or contrast. No native-browser acceptance or screenshots were produced; existing screenshots predate this action. Full-suite/scale runs, CI, commit, push, release and store publication are separate stages and are not claimed here. Earlier validation documents remain historical records.

## 中文

“编辑表达式”会把对应记录的原始表达式原样放回搜索草稿，保留 `=`、前后空白和科学记数法写法，聚焦并将光标放到末尾。它通过现有编辑提示路径清除旧结果及复制提示，不会自动计算、搜索、复制、保存、新增、重排或清空记录；需要再次明确提交。原有“用结果继续计算”仍使用完整结果数值。

两种操作各自校验当前按钮、所属记录和行，在聚焦前后检查草稿与提交修订号，避免覆盖新编辑、ABA 修改、新提交或重新挂载后的状态。已发出的剪贴板写入仍会锁定到真实结束；编辑仅使旧提示失效，不触碰剪贴板。新增测试限定于现有 Node/VM 模型；未进行原生浏览器、截图或视觉验收，不把旧截图当成本功能证据。
