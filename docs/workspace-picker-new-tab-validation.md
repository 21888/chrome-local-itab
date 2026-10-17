# Open a workspace in a new tab — validation / 工作空间另开新页验证

Date: 2026-10-17. Baseline: local `9c84f40e`, tree `f69c4831` (equivalent pushed master source `9e45047c`). This feature does not change manifest version 1.1.155 or permissions.

## Behavior / 行为

The switch picker gives every active workspace an independent native **Open in new tab / 在新标签页打开** anchor, including the current workspace. Same-name entries keep distinct exact IDs. The destination is always `newtab.html?workspace=` plus the encoded ID, using the extension runtime URL when available. Other current-page query parameters and the hash are not inherited. `target="_blank"` and `rel="noopener"` delegate opening to the browser; no `window.open` call, programmatic click or success message claims that a tab opened.

The entry does not invoke `requestSwitch`, `manager.select`, lifecycle save/wait/departure/autosave controls, downloads, permissions or storage writes. It preserves this page and its drafts. It does not change the last-selected workspace used by ordinary new tabs. The destination still performs normal existing startup, reads and Focus initialization; timers keep progressing normally. It is not a promise that a newly opened page performs no I/O or that time is frozen.

The original name button still uses the existing pending-write and Stay/Save/Discard chain; its current-space button remains disabled. One narrow safety change applies to both controls: a known removed, trashed or generation-replaced snapshot target is permanently disabled for that opening. A failed list read or conflict revokes every old action in that opening. A subsequent successful refresh does not revive them; close and reopen to inspect the current list. A healthy read that is merely pending does not revoke the known snapshot. Displayed names, order, query and caret remain stable during refresh.

Links retain ordinary browser default behavior for valid click, modified click, middle click, context menu, Enter and Space; Space is not converted to a click. IME/composition, repeated or already-prevented activation, unavailable UI, stale ownership and pending in-tab operations block the event's default. Filtering/repainting, close and destroy remove old `href` attributes, mark links `aria-disabled` and remove them from the tab order. Reattaching a retired node does not restore it. Retiring a focused target moves focus to the still-usable picker search field without stealing newer focus elsewhere.

A deletion between native link activation and the new page's session validation is rejected by the existing destination checks without selecting or falling back to another workspace. The URL carries only the ID: this is not an atomic cross-tab identity/generation transaction. A replacement unknown to the old page can be admitted by normal destination startup if it is valid when read. No session/storage/schema/lifecycle protocol was changed.

每个正常空间（包括当前空间）都能通过独立原生链接另开新页，同名空间严格使用各自 ID，固定打开首页且不继承其他查询参数或 hash。本次入口保留原页和草稿，不调用切换、保存、等待、离页、自动保存暂停或专注控制，也不修改普通新标签页默认使用的最后选择空间。新页仍按现有逻辑正常启动、读取并初始化专注，时间继续推进。

原本页打开仍经过既有保存等待与草稿确认；当前空间的本页按钮仍禁用。已知目标删除、消失或代次替换会使本次快照的对应两种操作都失效，读取失败或冲突使本次旧操作全部失效。稍后成功刷新不会复活旧入口，关闭重开才能重新检查；仅仅读取尚未完成时，健康的已知快照链接仍保留。筛选、关闭和销毁会清理旧链接地址，重插旧 DOM 也不能恢复。激活后的删除竞争由新页现有校验拒绝，不回退到其他空间；只携带 ID 的 URL 不保证跨页代次原子性。

## Bounded automated evidence / 有界自动化证据

The final command below passed **296 tests, 0 failed, 0 skipped**, including **22 tests** in the new file. It used a 512 MiB Node heap limit and concurrency 1. The real Manager tests use synthetic persisted registries and per-lock-name queues; the UI tests use the existing DOM model and real page lifecycle module. Existing test assertions were retained; two picker result selectors now explicitly select their original name buttons inside row wrappers. The shared DOM helper was not changed.

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/workspace-picker-new-tab.test.js \
  tests/workspace-picker-search.test.js \
  tests/workspace-reorder-view.test.js \
  tests/workspaces-view.test.js \
  tests/workspaces-invariants.test.js \
  tests/workspace-lifecycle.test.js \
  tests/workspace-reorder-store.test.js
```

Coverage includes English/Chinese labels and accessible exact-name labels, fixed/encoded URL and runtime fallback, current and same-name IDs, Trash exclusion, native-default admission, no original-page I/O or switch/save/Focus-control calls, dirty text preservation, stable search snapshots, sticky invalidation, delayed reads, errors/conflicts, stale/reparented controls, composition/repeat/default-prevented guards, close/reopen/destroy and focus containment. Real Manager coverage verifies explicit requested-ID capture without selection, unchanged whole synthetic storage and `lastUsedId`, ordinary capture still using the old default, missing/trashed IDs rejecting without fallback, and deletion after activation.

Before implementation the completed red run had **2 passed / 19 failed**: the two existing Manager rejection behaviors already worked and the new UI/CSS entry was absent. An earlier scaffold run was interrupted after 17 missing-entry failures because its newly written test fixture incorrectly serialized different lock names through one queue. The fixture was corrected to independent per-name queues and given bounded timeouts; this was not a production defect. One intermediate UI run had **146 passed / 1 failed** because the new composition test held an old filtered link while asserting against its replacement. Resolving the current control at each test step fixed that fixture error. Those logs are retained separately from the final green evidence.

最终有界七文件测试 **296/296 通过，无失败、无跳过**，其中新增 **22 项**。真实 Manager 测试证明指定 ID 捕获不调用选择、不改变最后选择空间、缺失或已删除目标不回退，使用全合成数据；DOM 模型覆盖旧入口撤销、焦点、输入法、原生事件默认行为与原页草稿保留。旧断言未删除，只把两处结果选择器明确改为行内原名称按钮。首次红测夹具跨锁队列卡住和一次组合输入测试旧引用错误均已保留记录，未修改生产锁或共享测试模型。

## Limits / 未验证范围

This is bounded automated model evidence, not a full-suite pass or native-browser acceptance. Native Chrome tab creation, modifier-key synthesis, context-menu timing, extension storage events, real multi-tab races, IME, screen-reader output, focus painting, narrow/zoom/light/dark layout and timer behavior across real tabs remain unverified for this feature. CSS assertions establish rules, not rendered fit. No browser route was substituted, and no screenshots, user data, user device, paid service or new permission were used. No commit, push, release or upload is part of this implementation evidence.

这是有界模型验证，不是全量测试或真实浏览器验收。真实开页、组合键、右键菜单时序、跨页存储事件与竞争、输入法、读屏、焦点描边、窄屏/缩放/明暗布局及真实跨页计时仍待原生验收。CSS 断言不能证明实际排版。未生成截图，也未使用用户资料、用户设备、收费服务或新增权限；本实现证据不包含提交、推送、发布或上传。
