# Calculator: remove one recent calculation

Date: 2026-10-17. Feature 62 adds **Remove calculation / 移除这条计算** to each page-local recent-calculation row. Manifest remains 1.1.155. No tag, Release or store publication is part of this change.

## Scope and safety boundaries

- A fourth native button removes the exact record object, never all records matching its expression or value. Remaining order, the five-entry bound and successful-calculation-only insertion stay unchanged. Empty-list text and Clear-all availability use the existing renderer; the disclosure stays expanded.
- No evaluator, search submission, draft-edit marker, persistence, network, Date, timer, clipboard API, global shortcut or permission is added. Input text, selection, current result and its feedback stay unchanged. A readonly/disabled input does not prevent valid history management.
- The action captures its exact record, row, button, expression/value nodes and literal source text at binding. Current record/view identity, original node documents and parent relationships, current search owner, availability, expanded disclosure, IME and lifecycle must still match. Reattached old controls cannot borrow replacement rows after redraw, removal, clear, eviction or remount. Use/Edit/Copy/status/current-result sibling availability is independent.
- Existing recent-action guards reject default-prevented, modified, repeated, composing, key-code-229 and double-click-tail activations while leaving ordinary native Enter/Space processing in place.
- Only a previously focused Remove button grants potential recovery focus. After redraw, owner/draft revisions, target identity/availability and activeElement are checked again. Recovery is allowed only if focus remains on the removed button or fell to body. Focus is the final side effect; its callbacks may edit, move focus, remove again or remount without later draft/caret writes or another focus attempt.
- Redraw cancels all old historical copy feedback but does not release the global system-write lock. The old copy executor is unchanged. Pending current-result copies and settled current-result feedback are independent. Stale recent receipts cannot affect a replacement row or unlock a newer write.

## Test changes

The independent `tests/local-calculator-recent-remove.test.js` uses the real search initializer and the unchanged shared DOM model. Its 25 named tests cover bilingual/missing/empty labels; exact duplicate identity; all removal positions and continued five-entry insertion; no draft/evaluation/I/O effects; focus recovery and non-stealing; native-event guards; unavailability and restored availability; readonly/disabled input; exact source/node/owner/parent identity; stale callbacks; sibling independence and surviving Use/Edit/Copy behavior; pending/settled recent and current copy receipts; remount and retired callbacks; redraw/focus reentry; reload protection; and existing wrapping/focus selectors.

One explicitly authorized existing-test adjustment changes the recent-copy row button count from 3 to 4. Its prior purpose was to assert the three existing native actions; the new contract retains those actions and adds a fourth native Remove button. Every other pre-existing assertion and helper remains unchanged. The new tests separately verify the original actions’ identities and surviving behavior.

## Run history

One authorized serialized Node window was run with a 512 MiB heap. The first focused run passed **99/99** tests (including all 25 new named tests), with **0 failed, 0 cancelled, 0 skipped and 0 todo**, exit code 0, in **6706.845724 ms**. There were no earlier failed runs and no reruns for this feature. The complete first-run log was retained. Source and tests were frozen after this run; the validation note was then updated with the observed result.

Executed focused command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-calculator-recent-remove.test.js \
  tests/local-calculator-recent-copy.test.js \
  tests/local-calculator-recent-results.test.js \
  tests/local-calculator-continue-result.test.js \
  tests/local-calculator-copy-result.test.js \
  tests/local-calculator-integration.test.js \
  tests/search-draft-lifecycle.test.js \
  tests/search-regression.test.js
```

## Frozen-source static checks

- `newtab.js` SHA256: `8008690317c0cf8be2fb392e4706c8571c3bb8c85266f61997f9ca4e80d44096`.
- New independent test SHA256: `3b38c3830b128d43dd50e782f1357b5e098a553f27d9ff0ae3ab983e4b323608`.
- Byte comparison against the starting HEAD preserved all **1,408 CRLF** sequences and every byte outside the search initializer, including ClockComponent. The clipboard executor is byte-identical.
- Both locale catalogs add only `calculatorRecentRemove`; existing translations are unchanged. The single authorized old-test count/comment adjustment was checked byte-for-byte. All other existing tests and shared helpers, the manifest, evaluator, lifecycle, styles and CI workflow remain untouched. Existing broad button selectors style the new action without new CSS.
- `git diff --check` passed. All fixtures are synthetic; no personal information, credentials or screenshots were added.

## Independent review and package verification

A separate independent first run passed **10/10** probes. The focused run and independent review are **two distinct runs totaling 109/109** (99 + 10), both successful on their first attempt; no failed run or rerun is omitted. The independent probes cover duplicate-record identity; adjacent/empty-state focus; readonly-input preservation; current-to-recent and recent-to-current copy locks; stale reattached nodes; absent sibling buttons; replaced/cross-document source nodes; external focus acquired during redraw; and the original Use/Edit/Copy behavior.

Python regressions passed **84/84**. Offline ZIP construction and source verification each confirmed **133 runtime files**, with runtime ZIP SHA256 `2efb6b6b4c01bd823919eb4e094911058c74a9c251ff9b733cd1c26860100478`. These checks do not establish native-browser acceptance or an exact-commit CI result. Source and tests stayed frozen during independent review; only these observed verification results were added to the documentation afterward.

## Unverified boundaries and later stages

These are bounded VM/DOM-model checks, not native Chrome acceptance. Native Enter/Space synthesis, held keys, IME, focus painting/timing, real mutation delivery, assistive-technology announcements, layout/contrast and system clipboard contents remain unverified. No screenshots, user device, paid service or security-denial workaround were used. Local full/scale Node, exact-commit CI and publication are separate stages and are not claimed here. The bounded independent review, Python regressions and offline package checks are recorded above. Existing CI gates, manifest, evaluator, lifecycle helper and ClockComponent are outside this feature’s edit scope.

## 中文

“移除这条计算”按记录身份仅移除一条，重复表达式或相同结果的其他记录不受影响。输入、光标、当前结果和其复制提示不变；列表重绘丢弃旧记录提示，但系统写入锁等待真实结算。原节点/文本/父链/记录/所有者与可见生命周期共同限制操作。焦点仅在被删按钮原本持焦点且重绘后仍有归还权时移到下一条、前一条或空列表标题；焦点回调之后不再写入或抢焦点。

新增独立测试复用真实初始化函数与未修改共享模型。唯一获准的旧测试改动是原生按钮数量 3→4，其余旧断言不变。聚焦99项与独审10项是两次独立首跑，共109/109；Python为84/84，离线打包和源码比对各133文件。实际运行结果以上述运行史为准；尚未完成的原生浏览器、截图、完整本地测试、准确提交CI和发布阶段不算通过。
