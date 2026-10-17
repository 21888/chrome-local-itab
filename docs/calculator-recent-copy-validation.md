# Calculator: copy a recent calculation

Date: 2026-10-17. This adds an explicit third action to each existing page-local recent-calculation row. Manifest 1.1.155, evaluator, history bound, storage/schema, shared lifecycle, permissions, release workflow and existing tests/helpers are unchanged.

## Behavior and implementation

- **Copy calculation / 复制计算记录** copies exactly `record.expression + "\n" + record.value`. It preserves original expression whitespace, equals sign and scientific notation, and the complete already-computed numeric value. No extra trailing newline, labels, history numbering, metadata or current draft is added.
- A native button and a separate per-row polite, atomic live status use explicit English/Chinese text and English fallbacks. The existing wrap/focus styles apply; only full-width/error-color status rules are new. The action never moves focus/caret, recalculates, searches, saves, appends/reorders history or reads the clipboard. Missing/throwing/rejecting APIs preserve both source strings for manual selection; retries are explicit.
- One parameterized clipboard executor serves current and historical copies. The existing global lock remains until the issued system promise actually settles. Editing, clearing, folding, hiding, reparenting or remounting can invalidate feedback, but do not release that lock. The API call stays synchronous within the explicit activation, with no permission query or fallback.
- Each row snapshots its owner, exact record/rendered row, source button, expression/value nodes and literal text, draft text, and input edit/submission revisions. It checks current history membership/row association, node document/parents, visible expanded disclosure, composition, lifecycle and document visibility. Old controls cannot borrow replacement rows or controls after redraw, eviction or remount. Removing the sibling Use/Edit action does not revoke Copy.
- Mutation guards cover relevant ancestor attributes, source child/text mutations and removal of origin nodes. Queued records are consumed before issuing a write or publishing feedback, so hide/detach/text ABA cannot restore stale authority. Feedback cancellation is idempotent; a retired receipt callback cannot clear a later retry's receipt.
- Historical receipts retain their own lightweight mutation/departure guards after settlement until relevant edit, redraw/clear, fold or departure. They describe a past copy action and make no live-clipboard assertion. Current-result and search/recovery feedback remain independent. Tests explicitly clear retained receipts and verify listener/observer cleanup.

## Bounded deterministic checks

`tests/local-calculator-recent-copy.test.js` uses the real search initializer in a VM and the existing shared DOM helper, unchanged. Its 20 named tests cover:

- EN/Chinese/missing/empty labels and statuses; exact whitespace/Unicode/literal source, scientific and complete rounding values; same-valued distinct records; saved records versus newer drafts.
- Missing, synchronous throwing/getter and rejecting clipboard APIs, explicit retry, preserved manual-selection source and focus, and no evaluator/network/storage/history side effects.
- All current-to-recent, recent-to-current and cross-row lock directions; edit, clear, collapse, hide, redraw, five-entry eviction and repeated remount before settlement; synchronous API reentry.
- Exact source/row/owner origin, stale reattached rows/buttons, source-node replacement, edit/submission/owner ABA, delivered and queued mutations, sibling-removal independence and retired receipt callbacks.
- Default-prevented/repeat/IME/key-code-229/modifier/double-click rejection; source/input/control/ancestor/document/lifecycle unavailability; unchanged focus/caret and independent copy/search feedback.
- Settled receipt invalidation and teardown; unchanged history-only reload-guard behavior; reuse of existing wrapping/focus CSS.

Requested focused command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-calculator-recent-copy.test.js \
  tests/local-calculator-recent-results.test.js \
  tests/local-calculator-continue-result.test.js \
  tests/local-calculator-copy-result.test.js \
  tests/local-calculator-integration.test.js \
  tests/search-draft-lifecycle.test.js \
  tests/search-regression.test.js
```

First focused run: 74 tests, 73 passed, 1 failed, 0 cancelled and 0 skipped (6.45 seconds). The new interruption-matrix test incorrectly treated a dispatched event returned by its clear callback as replacement search controls, causing `TypeError: current.expand is not a function`. The new test now explicitly distinguishes returned replacement controls from event objects. Production source and every pre-existing test/helper were unchanged by this correction. The separate corrected rerun passed 74/74, with 0 failed, 0 cancelled and 0 skipped (5.99 seconds). The first failed run remains recorded and is not counted as a pass. The source and new test were then frozen for independent review. Byte comparison verified all 1,408 existing CRLF sequences and every byte outside the search initializer; old tests, the shared DOM helper, evaluator, shared lifecycle, manifest and workflow remained unchanged.

## Limits and later stages

These are deterministic source/DOM-model checks, not native browser acceptance. Native keyboard synthesis, held-key/IME behavior, focus painting, mutation timing, assistive-technology announcements, OS clipboard contents, layout and contrast remain unverified. No browser or screenshots were used; old screenshots predate this action and are not evidence for it. Local full/scale Node runs and native-browser checks were not run. Exact-commit CI, commit/push, Release and store publication remain separate stages and are not claimed here. Earlier validation notes remain historical.

## Independent review and package verification

Nine additional independent probes passed on their first run, using the original unchanged recent-results harness and real search initializer. They cover Unicode whitespace/scientific spelling against a newer draft, removal of both sibling actions, same-value edits clearing settled receipt guards, independent historical rows/current-result feedback, a clipboard getter editing the draft before any system write, queued nested expression mutations, rebuilt-record callbacks, own status mutations/manual retry, and eviction/remount while a historical write remains unresolved. The successful focused and independent runs total **83/83**, while the earlier 73/74 fixture-failure run remains recorded separately above.

Python regressions passed **84/84**. Offline runtime construction and source comparison both verified **133 files**, SHA256 `eb292e6efad20f725ac184bdddfcfc9ab2a1835bad956fe2ecf994d73635810e`. Protected files and all prior calculator tests/helpers remained byte-identical; `newtab.js` keeps 1,408 CRLF sequences and every byte outside the search initializer. Only the four new message keys were added in EN/zh. No native-browser acceptance is implied.

## 中文

“复制计算记录”只复制对应记录的原始表达式、一个 LF 换行和已计算的完整数值，保留空白、等号与科学记数法，不加入当前草稿、标签或额外结尾换行。复制不改变输入、焦点、光标或历史，不重新计算或搜索；失败仍保留原文和数值供手动选择，不自动重试。

当前结果与所有历史行共用系统写入锁，只有已发出的写入真实结束才解锁。精确记录/行/按钮/文本节点、编辑与提交修订号、可见性、生命周期和排队的 DOM 变动共同限制旧回调；隐藏、折叠、清空、淘汰和重新挂载只使旧提示失效，不提前放开锁。已完成提示继续受对应行守卫保护，并与当前结果及搜索反馈独立；提示仅说明过去这次操作，不断言当前剪贴板内容。

新增测试使用真实初始化函数和未修改的共享 DOM 模型，执行结果以上述记录为准。未进行原生浏览器、截图、视觉或系统剪贴板验收；本次独立复核、Python 和静态打包结果见上文；准确提交 CI 与发布仍是独立阶段。
