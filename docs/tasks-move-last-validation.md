# Move an active task to the list end — validation / 移末验证

Date: 2026-10-17 UTC. Local implementation baseline: `2e11819bd6a439ed8987ec23de5c8dc0556323fb`. Manifest remains `1.1.155`; no schema, recovery/export protocol, Controller, permission, global shortcut or release-version changes.

## Behavior / 行为

**Actions → Move to list end** / **操作 → 移到列表末位** moves one active task to the last active position in one atomic local save. The independent `moveLast` command validates the target ID/version, active state and complete active ID order inside the existing lock, then rotates only active slots from that target to the end. This equals repeated Move down operations with one save. Other active records retain relative order; inactive records keep their absolute slots. Every record's text, state, ID, version and timestamps, the separate Next up pin, recovery copies and enabled preference remain intact.

`moveLast` 在既有锁内检查目标身份/版本、未完成状态及完整未完成 ID 顺序，只轮转目标至末尾的未完成槽位。一次 finish、revision、receipt、write 与完整回读，不循环调用多个 move。末项、目标改变或未完成顺序改变均冲突且零写入；无关记录编辑和重新置顶允许，并保留最新值，不新增全局 revision 限制。确切重试复用原有 receipt 规则：最新已确认操作不重复移动，后来有其他 receipt 时旧重试冲突。不延长原有 128 条 receipt 历史。

The native button exists only inside active-row Actions; it is disabled for the last task and while filtering, with English, Simplified Chinese and English fallback help. Only this new action captures its original button, row, title, Actions/menu/summary, parent chain, ownerDocument, render generation and workspace/session identity, ID and generation. Stale, reattached or replaced controls, hidden/inert/aria-hidden/style-hidden ancestors, closed menus, unavailable/error/pending states, dialogs/reviews, departure, invalidated/suspended/replaced workspaces, prevented/repeated/IME/double-click-tail activations are rejected. Sibling controls retain their existing behavior and are not dependencies. After a conflict refresh, a newly rendered row may start a new explicit move; the old command is never automatically retried, and unresolved READ/WRITE/VERIFY errors remain blocked. Saved-task movement remains independent of quick-entry composition and never reads its draft as task content.

视图使用原有 perform/render 与焦点恢复：移出四条预览后保持收起，旧控件失去焦点时回到快捷输入；仍显示的目标已是末项，回到同项「操作」。不会自动展开，也不会抢走新快捷输入、搜索或编辑窗口焦点。筛选、刷新或重新挂接后的旧行不能重新获得操作权属。

## Evidence and run history / 证据与运行史

- Read-only inspection found no pre-existing moveLast command or Move-to-end control.
- Added independent `tests/local-tasks-move-last-store.test.js` and `tests/local-tasks-move-last-view.test.js`; existing tests, assertions and shared DOM model are unchanged.
- Tests use real Store and Controller classes against a serialized local-storage model and the existing DOM/event model. All fixtures are synthetic.
- Store coverage: all active positions in contiguous/interleaved small lists; bounded 500-record first/middle/penultimate/last cases; duplicate Unicode/multiline text; equivalence to repeated downward swaps; one write/revision/receipt; complete records and inactive slots; reload/export; exact full active order; queued target/order/replacement/recovery races; workspace invalidation; unrelated edits and repins; READ/WRITE/VERIFY and uncertain acknowledgement; exact retry and later/expired receipts.
- View coverage: language/fallback, active-only button, last/filter disable, collapsed/expanded previews, current-row/quick-entry focus recovery, pending coalescing, newer draft/search/editor focus, stale and reattached full rows, fixed source nodes and original ancestor ownership, guard negatives, saved-task independence from quick-entry IME and sibling actions, real conflict and retry flows.
- Pre-run static checks passed: `git diff --check`, locale JSON parsing and manifest `1.1.155` verification; the prior move/moveFirst Store branches and MoveFirst view body were checked unchanged. No RED run was performed or claimed.
- The sole approved Node window on 2026-10-17 at 22:10:55 UTC passed four `node --max-old-space-size=512 --check` invocations: `shared/local-tasks-store.js`, `shared/local-tasks-view.js`, and the two new test files.
- Its first eight-file bounded regression run passed **347 tests, 0 failed, 0 cancelled, 0 skipped**, exit **0**, duration **9.087 s**. The new independent files contain **50 Store tests + 103 View tests = 153 tests**. There was no failed test run, local full-suite run or retry of this window.
- 首轮有界模型检查 347/347 通过；四份语法检查通过。新增 Store 50 项、View 103 项；旧断言、共享 DOM 模型、Controller 和完整 CI 门禁未改。没有伪称 RED、全量或原生验证。

Exact bounded test command:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-tasks-move-last-store.test.js \
  tests/local-tasks-move-last-view.test.js \
  tests/local-tasks-move-first-store.test.js \
  tests/local-tasks-move-first-view.test.js \
  tests/local-tasks-store.test.js \
  tests/local-tasks-view.test.js \
  tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-edit-return-focus.test.js
```

## Independent review and packaging / 独立审阅与打包

- The independent 12-probe review first reported **11 passed, 1 failed**. That failure was in its new unrelated-edit-plus-repin fixture: after editing another task, the fixture attempted to pin it using its pre-edit version. The existing Store correctly returned CONFLICT before moveLast was reached.
- Only that temporary independent fixture was corrected to use the latest edited task version. Production code and committed tests were unchanged. The second independent run passed **12/12**. Both run histories were retained; this was not a first-run clean independent pass.
- The two final passing Node runs total **347 + 12 = 359 checks**. This excludes, rather than conceals, the separately disclosed initial independent fixture failure.
- Python checks passed **84/84**. ZIP build and source verification each reported **133 runtime files**. ZIP SHA-256: `10930e97d07c851c44e624ff8286e2a7c63652cc027e8ea02cb65532d0fb3f6f`. The manifest stayed `1.1.155`; packaging did not publish a tag, Release or store submission.
- 独审首轮 11/12，失败为独审临时夹具使用编辑前版本执行置顶，尚未运行移末；仅修正该夹具后第二轮 12/12。源码及正式测试未改。最终两次通过的 Node 窗口共 359 项，Python 84 项通过，打包与来源核验均为 133 个运行文件。

## Limits / 未验证边界

The passing results above are bounded model-based evidence only. No local full suite, scale run, native Chrome, native keyboard/IME, assistive-technology, screenshot or visual-layout validation is claimed. No user device or paid platform was used. The existing free exact-source CI remains unchanged and is the full gate after review/push.

未进行原生浏览器或视觉验证；后续人工浏览器检查应覆盖双语长菜单、窄屏/明暗模式、原生 Enter/Space/IME，以及可见或移出四条预览后的焦点。模型事件不能证明原生事件时序。保存已发出后，隐藏或离开页面无法取消该写入；继续使用现有存储层保护及明确重试机制。
