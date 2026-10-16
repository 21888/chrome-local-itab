# Countdown Edit workspace routing — 2026-10-16

Countdown 卡片的「编辑」现在携带当前标签页已经捕获的工作空间 ID，并继续定位设置页的 Countdown 区域。另一页选择 B 作为新标签页默认空间后，仍停在 A 的旧页会编辑 A。点击入口或打开设置不会把新标签页偏好改回 A。

The card reuses `LocalItabWorkspacesView.settingsUrl(session.id, 'countdown-settings')`. Its compatibility URL also preserves a known workspace ID. The native anchor retains `_blank`, `noopener` and `#countdown-settings`; no click handler or workspace-selection write was introduced.

Startup was checked in source: `newtab.html` loads the workspace and Countdown definitions before `newtab.js`; the new-tab `DOMContentLoaded` handler awaits `mountPage()` before `initializeDashboard()` mounts the Countdown card. `mountPage()` awaits the workspace view's readiness, which awaits `session.ready()`. Normal dashboard mounting therefore uses the captured page identity rather than the mutable `lastUsedId`. A standalone view without a workspace retains the previous unscoped compatibility URL.

## Focused verification

The five cases in `tests/local-countdown-workspace-navigation.test.js` produced four expected failures and one pass against the unchanged production baseline, then five passes with the fix. The two main cases use the real Workspace Manager/Session and Countdown Controller/Store with synthetic in-memory storage and the existing DOM model:

- Default A and named A remain captured while another session selects B.
- The real settings-URL helper receives A and the Countdown section.
- Synthetic link activation and opening the linked settings session leave all stored values and the write count unchanged.
- A later explicit settings save changes A's Countdown only; B's Countdown and `lastUsedId` remain unchanged.
- Extension/relative compatibility URLs retain a known workspace; the no-session fallback stays usable.

The prior unscoped URL expectation in the Countdown view test now exercises a Default session and the real helper. All 132 tests in these four explicit files passed:

```sh
node --test tests/local-countdown-workspace-navigation.test.js tests/local-countdown-view.test.js tests/local-countdown-integration.test.js tests/workspaces-view.test.js
```

Changed JavaScript syntax checks and `git diff --check` passed. This is focused synthetic regression evidence. No full Node suite, Python packaging suite, real Chrome/navigation, provider, upgrade, screenshot or release acceptance was performed for this change.
