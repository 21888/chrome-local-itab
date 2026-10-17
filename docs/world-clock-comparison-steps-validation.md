# World-clock comparison: 24-hour navigation — 2026-10-17

## Behavior

**Back 24 hours** and **Forward 24 hours** move the fixed comparison by exactly 1,440 elapsed minutes per activation. The initial anchor, seconds/milliseconds and the existing −1,440 to +1,440-minute, 15-minute-step slider are retained. The local reference reports the sum of navigation and slider offsets from the original anchor. Every row's time and Gregorian date use that same instant. Daylight-saving transitions can change the local hour after a 24-hour step; this is not calendar-day or same-wall-time navigation.

Navigation is page-local, with no new storage, backup field, network request, permission or timer. Formatting, order, language, rerenders and hide/show preserve the preview. Back to now, removal of all clocks and page recreation clear it. The new controls are inside the comparison panel. They use native button activation and describe themselves through the existing reference and new help text; there is no additional live region. Copy still exports only the exact displayed reference and ordered clock rows.

Each accepted step invalidates old copy feedback, including a forward/back ABA. An already-issued clipboard write remains globally locked until it settles, including across component replacement. No clipboard read or permission query is added. Hidden/inert/detached/retired/departing hosts and repeated, prevented or composing activations cannot step. Focus is not moved by stepping; rerenders retain a focused navigation control without stealing unrelated focus.

## Navigation edges

The stepped UTC base (anchor plus accumulated 24-hour offset, before the slider) must be between `0001-01-03T00:00:00.000Z` and `9999-12-29T23:59:59.999Z`, inclusive. These deliberately conservative edges leave room for the full ±24-hour slider and at least a full additional day for named-zone offsets. Thus changing the device or configured zones does not require narrowing the slider or exposing BCE/extended-year dates. The help text discloses years 0001–9999 and reserved edge dates.

Anchor, offsets, products and resulting timestamps are checked as safe integers; invalid Dates and out-of-range candidates are rejected before changing state or rendering. An unavailable direction is `aria-disabled`, with an activation guard, so keyboard focus stays on the invoking button at the edge. The opposite direction remains available. The shared `WorldClocks` implementation and its independently supported BCE/extended-year formatting are unchanged.

## Focused automated checks

The new actual-component test was run against unchanged runtime source first and failed because the 24-hour controls did not exist. The original source, red test, raw failure and exit status are retained outside the repository. An intermediate focused run exposed the card's existing one-live-region invariant; the added announcement region was removed rather than changing the old test. The final runtime passes:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/world-clock-comparison-steps.test.js \
  tests/world-clock-comparison.test.js \
  tests/world-clock-comparison-copy.test.js \
  tests/world-clocks.test.js \
  tests/world-clocks-card.test.js \
  tests/world-clocks-live.test.js \
  tests/clock-calendar.test.js \
  tests/localized-date-display.test.js \
  tests/locale-defaults.test.js
# 83 passed; 0 failed, skipped or cancelled

NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/world-clock-editor-layout.test.js \
  tests/world-clocks-options.test.js \
  tests/world-clocks-storage.test.js
# 31 passed; 0 failed, skipped or cancelled
```

The dedicated suite contains 11 tests using shipped `ClockComponent`, real `WorldClocks`/Intl and a bounded DOM/clipboard model. It covers repeated positive/negative steps, slider extremes, year/leap rollover, US spring/fall DST, date-line separation, half-/quarter-hour zones, preserved milliseconds, shared row instants, total reference offsets, format/order/language changes, focus, visibility and owner lifecycle, unsafe arithmetic/Date inputs, conservative year edges after time-zone changes, and successful/rejected pending-copy ABA plus replacement-owner locking. The existing tests and helpers are unchanged. Syntax checks cover only the edited runtime and new suite; this is not a full local or scale run.

## Native verification limits

No new native Chrome, keyboard/IME, assistive-technology, actual OS clipboard or visual-layout verification was performed. The wrapping CSS and DOM-model assertions do not prove narrow-card layout or native behavior. Earlier screenshots predate these controls and are not evidence for them. No screenshot is added. All fixtures use synthetic clock labels and dates. Manifest, Release/CWS metadata, workflows and shared time-zone algorithms are unchanged.

## 中文说明

新增“前移 24 小时／后移 24 小时”可连续比较多天。每步是真实经过的 1,440 分钟，保留首次捕获时刻、秒／毫秒及原有每步 15 分钟的前后 24 小时滑块。本地参考显示步进与滑块的总偏移，各行时间和完整日期共享同一个时刻；跨夏令时不承诺钟面时间相同。

导航限于公历 0001–9999 年，实际 UTC 基准范围为 0001-01-03 至 9999-12-29，给完整滑块及更换时区保留安全余量。到边界的按钮标记为不可用并保留焦点，反方向仍可使用。比较仅属于当前页面，不增加持久化、网络、权限或计时器。有效步进会废弃旧复制反馈；已经发出的系统写入仍须等待结算，往返到同一预览也不能绕过待处理锁。

最小真实入口先红后绿。9 个限定入口通过 83 项，另 3 个相邻世界时钟入口通过 31 项，均无失败／跳过／取消；旧测试与共享算法未修改。原生 Chrome、真实键盘／输入法、辅助技术、视觉布局和操作系统剪贴板尚未验收，旧截图不能代替新增控件的验证。没有本地全量或规模测试结论。
