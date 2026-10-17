# Focus expected end (device local time)

## 使用说明 / Usage

已确认运行的专注或休息阶段，在现有进度下方显示“预计结束（设备本地时间）”，包括完整年、月、日、时、分、秒和设备本地 UTC 偏移。旁边说明：**按设备时钟估计，暂停后重新计算；无后台提醒**。

The optional Focus card shows **Expected end (device local time)** below the existing interval progress, with the full local date, time including seconds, and UTC offset. The accompanying notice reads: **Estimated using the device clock; recalculated after a pause. No background alert.**

- The row is visible only for a valid, confirmed running Focus or Break interval in a visible, connected, current workspace view.
- Ready, paused, completed, uncertain and invalid states clear and hide both lines. Pending actions and read/write/verification failures also clear them; the previous result cannot imply that an unconfirmed change succeeded.
- Pause removes the date. A successful Resume displays that session's newly saved deadline. Reset and choosing the next phase leave the row hidden until Start succeeds. Typed or retained minute drafts never determine it.
- Hiding the page/card, CSS-hidden hosts/ancestors, hiding an ancestor or the dashboard, leaving the page, retiring/replacing its workspace, disconnecting the host and destroying the View clear the text through the existing render/lifecycle paths. A destroyed or retired View cannot revive the result through late callbacks.
- Date and offset formatting uses the document's display language, falling back to English. Invalid dates, unavailable Intl, invalid locales or formatter failures hide only this presentation; the existing timer controls, remaining digits and guidance continue to work.

## Calculation and reliability boundary

`View.renderExpectedEnd(state)` receives the same snapshot that `View.render()` already uses for the remaining digits and progress. It formats `state.session.deadline` directly. It does not read another snapshot, calculate `Date.now() + remainingMs`, read the minute draft or change persisted state.

The native `Intl.DateTimeFormat` uses year, month, day, hour, minute, second and `timeZoneName: 'longOffset'`, without an explicit `timeZone`. A fresh small formatter is constructed on each existing render so changes to the device's local time zone are reflected without another timer, listener or cache. Date-aware formatting covers midnight/year rollover and the offset in force at the deadline, including daylight-saving transitions. It does not assume that the start and end occur on the same local date or UTC offset.

This is an estimate tied to the device clock, not an alarm or a new timing guarantee. The existing Controller still detects clock disagreement while it has a monotonic witness. After all pages have closed, reopening still estimates elapsed time using the device clock and cannot distinguish an offline clock change from elapsed time. The new row does not strengthen that existing detection limit.

Store, Controller, schema, Start/Pause/Resume/reset protocol, original progress, duration submission, tab-title behavior, temporary focus, workspace ownership and the existing 250 ms presentation tick remain unchanged. This change adds no CSS, permissions, network requests, storage operations, listeners, observers, timers or persistent caches. The two plain text lines have no Tab stop or live-region role, and do not move focus or add per-second announcements. The manifest version is unchanged.

## Automated validation

A minimal entry test first failed against unchanged production source because the expected-end presentation did not exist (1 test, 1 expected failure). The same entry test passed after implementation. The focused final command is:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-focus-expected-end.test.js \
  tests/local-focus-view.test.js \
  tests/local-focus-controller.test.js \
  tests/local-focus-boundary.test.js \
  tests/local-focus-duration-draft.test.js \
  tests/local-focus-retired-workspace.test.js \
  tests/local-focus-progress.test.js \
  tests/local-focus-temporary-view.test.js
```

The new 20 cases cover entry, start/pause/resume/completion/reset/next phase, pending duration and visibility changes, failed and saved-but-unacknowledged operations, clock uncertainty, a single shared render snapshot, retained drafts, full date/offset formatting across midnight/year rollover and both DST boundaries, changed device zone, English/Chinese/fallback labels, malformed values and an out-of-range Date, Intl failures, visible/hidden/detached/departing views, retired/replaced workspaces, zero additional storage I/O or ticker, stable focus/coarse status and teardown/late settlement. Reopening coverage confirms the saved deadline and existing offline clock limits remain unchanged.

The model runs the production View, Store and Controller over deterministic synthetic storage and DOM/event fixtures. Time-zone cases use native Intl formatting with a controlled default-zone adapter; they do not alter the operating system time zone or clock. Existing regression files also exercise the real workspace manager/session retirement notification paths and unchanged timer boundaries, focus and temporary-view behavior. There is no claim that these models reproduce browser layout or assistive technologies.

A separate post-review model RED check showed that an already-rendered CSS `display: none` host kept its expected-end text. The fix checks the host’s rendered rectangles and optional computed visibility after the existing card visibility update; hidden/collapsed CSS and layout/style-check errors clear the row without changing the original tick. The same minimal check then passed. The expanded test uses only a computed-style contract stub, not a browser CSS engine.

The final focused result is 99 passed, zero failed, cancelled or skipped. No fixture failures were encountered. The two expected product failures are the pre-implementation entry RED and the separate CSS-hidden model RED. Full-suite, Python packaging, build, native browser, screenshots and publication are separate stages and were not performed for this feature.

## Native acceptance still outstanding

In a disposable unpacked-extension profile with synthetic data, check English/Chinese, light/dark and narrow layouts; a running Focus and Break interval; pause/resume and hide/show; dates near midnight and DST; and a device time-zone change. Confirm keyboard order and screen-reader navigation without live announcements. Existing browser/upgrade release gates remain independent of the model checks above. No native browser or accessibility acceptance, screenshot, release or store-readiness claim is made here.
