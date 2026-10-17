# World-clock comparison dates — 2026-10-17

## Scope

Compare times now appends the target zone's full Gregorian calendar date to each existing relative-day span, for example `Tokyo · 00:00 · Next day · 2027-01-01`. The date uses ASCII `YYYY-MM-DD` in either interface language and every 12/24-hour or seconds setting; ISO extended signed years are preserved outside 0000–9999. Live rows retain their existing Today / Yesterday / Tomorrow or signed-day text, and Back to now removes the extra dates.

The independent `WorldClocks.calendarDate(entry, instant)` helper reuses the existing target-zone Gregorian civil-day ordinal. UTC midnight is used only to encode that civil date; it does not take the UTC date of the preview instant, assume a fixed offset, or add 24 hours to infer another zone's date. The mature `format()` result and its day-difference calculation are unchanged. Every row's time and date receive the same captured-and-shifted comparison instant.

The existing day node and conditional text-write path are retained. Copy comparison exports the actual rendered dates as part of the existing displayed text, without reading time or calling either formatter during activation. Its global pending-write lock, mutation observation, receipt invalidation and cleanup are unchanged. A display change can retire feedback but cannot cancel an already-issued system clipboard write. No new control, preference, schema, catalog key, permission, storage/network access or timer is added. CSS is unchanged.

## Focused automated verification

A new actual-component assertion was run first against unchanged runtime source. It failed because the Tokyo year-end row displayed `Next day` instead of `Next day · 2027-01-01`. The original source, failing test, command, exit status, raw output and hashes were retained outside the repository.

The six named test files below pass 62 tests, with zero failures, cancellations or skips, using real Intl and the existing bounded DOM/clipboard models:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/world-clocks.test.js \
  tests/world-clock-comparison.test.js \
  tests/world-clock-comparison-copy.test.js \
  tests/world-clocks-card.test.js \
  tests/world-clocks-live.test.js \
  tests/clock-calendar.test.js
```

Coverage includes:

- Tokyo's December 31 / January 1 boundary, Kolkata's February 29 / March 1 boundary, and both directions of the two-day date-line separation.
- US daylight-saving gaps/repeats and adjacent civil midnights; Kathmandu and Chatham quarter-hour dates in standard/daylight time.
- Years 0000, 0001 and 0099 without the JavaScript 1900 adjustment, crossing from 0099 to 0100, BCE years and positive extended years without truncation.
- English/Chinese relative labels with stable ASCII Gregorian dates across 12/24-hour and seconds settings, including a non-Gregorian browser time-locale extension.
- Fixed preview dates across later live ticks, live-mode helper exclusion, exit-to-live date removal, existing card nodes and shared clock lifecycle.
- Exact copied multiline displayed dates, zero date reads/time-format/date-helper calls at copy activation, and date-text/ABA invalidation. Existing pending, same-value/ABA, replacement, hidden/detached, lifecycle and calendar assertions remain.
- Pending and settled copy receipts surviving unchanged fixed-preview ticks, with the existing single timer and live main clock.

Only the changed source/test files receive focused syntax checks. Source-byte checks also retain all 1,408 CRLF sequences and every byte outside `updateWorldClocks` in the mixed-newline `newtab.js`. No full local suite or scale test is claimed here; full exact-source CI remains a separate gate.

## Native verification boundary

This feature has not been exercised in a native browser. No new screenshot, actual OS clipboard check, browser mutation-scheduler check or assistive-technology acceptance is claimed. Existing screenshots in the earlier comparison report predate the full row dates and cannot validate the new layout or announcements. The existing wrapping CSS is unchanged, which alone does not establish narrow-layout acceptance.

Native acceptance would still need English/Chinese narrow and wide layouts, long labels and extended-year wrapping, keyboard focus and screen-reader behavior, and explicit copy/paste into a separate target. Fixtures use synthetic clocks/dates only; no personal data or screenshots are added by this change.

## 中文摘要

比较模式在每行相对日期后追加对应时区的完整公历日期，固定使用 `YYYY-MM-DD`；超出 0000–9999 的年份保留 ISO 扩展形式。返回实时模式后移除附加日期。复制仍逐字读取已显示内容，点击时不会重新计算时间或日期，原有待处理锁和反馈失效规则不变。

已验证跨年、闰日、日期线正负两天、夏令时与非整点时区、早期／公元前年份、双语和时钟格式、固定预览及复制生命周期。上述 6 个限定入口共 62 项模型测试通过；没有执行本地全量或规模测试。本功能尚无新增原生浏览器、截图、真实剪贴板或辅助技术验收，不能沿用旧截图作新日期布局的证明。
