# World-clock comparison: device-local date/time entry — 2026-10-17

## Behavior and interpretation

The existing comparison panel now has a labeled `datetime-local` input with `step="1"` and an explicit **Preview** button. Plain Enter in the field also applies it; modified Enter, repeat, prevented and composing activations do not. Editing alone is a draft. A successful submission replaces the anchor, sets both the slider and accumulated 24-hour offset to zero, and marks this page-local comparison as an entered-time preview. The existing slider and day navigation remain elapsed-time operations with their original limits. The captured-now path still keeps its original seconds/milliseconds and “from start” reference; the entered-time path says “from current comparison base.”

The parser accepts only four-digit Gregorian years 0001–9999, complete `YYYY-MM-DDTHH:mm` or `YYYY-MM-DDTHH:mm:ss` strings, and valid local calendar fields. Omitted seconds mean `00`, and milliseconds are zero. Empty/incomplete values, whitespace, overlong years, offsets or Z, fractional seconds, `24:00`, leap seconds, and normalized invalid calendar days are rejected. It never reads `valueAsNumber` as UTC. Local ISO parsing avoids the numeric Date constructor's 1900 adjustment for years 00–99; a complete local-field round trip rejects normalization, including DST gaps and an entire skipped calendar date.

Repeated local times follow JavaScript Date's earlier-occurrence rule. The help discloses this before activation. The entered-time reference includes the current device IANA zone and the actual numeric GMT offset at the displayed instant, using Intl `longOffset` first. The fallback derives the offset from the actual local fields, preserving historical seconds; it does not scan intervals or assume whole-minute offsets. All displayed rows, row dates, reference and copied text describe the same applied instant.

The new anchor must lie within the existing conservative UTC base interval `0001-01-03T00:00:00.000Z` through `9999-12-29T23:59:59.999Z`. User input has whole-second precision. No existing slider/window edge is widened or narrowed. These bounds leave room for the full ±24-hour slider and device/configured-zone changes without BCE or extended-year output.

Primary behavior references: [HTML local date/time input](https://html.spec.whatwg.org/multipage/input.html#local-date-and-time-state-(type=datetime-local)) and [ECMAScript local-to-UTC conversion](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-utc-t). Browser input sanitization and segment editing are browser behaviors, not simulated by the DOM model below.

## Drafts, ownership and copying

The input/error state is separate from the applied comparison. Ticks, formatting, language, order, template rerenders and hide/show retain unsubmitted input and errors. Rerenders retain owned input/button focus without taking focus from unrelated controls. Device-zone changes keep the applied timestamp. Clean unfocused fields can reformat; dirty, composing or focused fields remain intact, show an associated error and require a different edit before submission. A zone change observed only during Preview also blocks that submission, even for a clean unfocused field, rather than reinterpreting an old wall-clock string. An observed change away and back remains blocked until another edit.

The entry controls use the existing current-owner, connected, visible, non-inert, non-departing guard, and submission checks both the input and Preview control. Composition Enter is suppressed through the corresponding release convention. Invalid submissions keep the previous preview and the field. Errors are associated with the field and exposed with `aria-invalid`; no extra live region or timer is introduced. Back to now, all-clock removal and owner replacement clear entry drafts/errors and the entered-time marker. Merely stopping the existing timer for visibility is not destruction.

Editing or submitting retires old clipboard feedback, including same-value input; an already-issued system write remains locked until settlement. Copy still takes exactly the visible applied reference and ordered rows. It excludes draft, error and help text. No event, invitation, storage field, permission or network request is added.

## Automated evidence

A new actual-component test first failed against unchanged production source because the input and Preview button were absent; the original source, first red test and raw failing log were retained outside the repository. After the implementation, an additional review found and reproduced a clean/unfocused/no-tick device-zone race: clicking Preview had reinterpreted stale UTC wall-clock text in New York. A small submit-time guard fixes that case, with a dedicated regression. The original tests, helpers and frozen historical codec fixtures were not edited.

Focused final checks:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/world-clock-time-entry.test.js \
  tests/world-clock-comparison-steps.test.js \
  tests/world-clock-comparison.test.js \
  tests/world-clock-comparison-copy.test.js \
  tests/world-clocks.test.js tests/world-clocks-card.test.js \
  tests/world-clocks-live.test.js tests/clock-calendar.test.js \
  tests/localized-date-display.test.js tests/locale-defaults.test.js
# 103 passed; 0 failed, skipped or cancelled

NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/world-clock-editor-layout.test.js tests/world-clocks-options.test.js \
  tests/world-clocks-storage.test.js tests/configuration-codec-parity.test.js
# 47 passed; 0 failed, skipped or cancelled
```

The new suite has 20 tests. It uses shipped ClockComponent and WorldClocks code, real Date/Intl under controlled Node process time zones, and a bounded synthetic DOM/clipboard model. Async zone fixtures restore the previous zone only after their awaited work settles. Coverage includes New York spring gap/fall fold, Lord Howe's half-hour gap/fold, Kathmandu's 45-minute offset, Apia's skipped date, Paris's year-0099 seconds offset and an explicitly modeled Intl-without-longOffset fallback. It also covers parsing, exact UTC edges, unchanged slider bounds, common instants, seconds/milliseconds, drafts, focus, language/fallback, zone-change ABA and pre-tick submission, composition, lifecycle guards, copy lock and local-only I/O constraints. Syntax checks pass for both edited JavaScript files and the new suite.

## Native verification limits

These are synthetic component/DOM tests with real Node Date/Intl, not native or installed Chrome tests. No new browser screenshots were captured or uploaded. Native date-field segment behavior, real keyboard/IME, assistive technology, narrow-card layout, focus painting and OS clipboard behavior remain unverified. The minimal CSS reuses existing wrapping/focus/error hooks; static width assertions do not prove visual fit. Earlier screenshots do not validate these controls. Fixtures contain synthetic labels and times only. No full local test run, scale benchmark, Store upload or Release result is claimed here.

## 中文说明

世界时钟比较面板新增“设备本地日期和时间”与“预览”。仅编辑不应用；普通 Enter 可提交。四位公历年份和完整日期时间严格校验，省略秒按 00、毫秒归零；无效日期、夏令时跳过时间、24:00、秒 60、时区后缀和超长年份均不应用。重复时间采用较早的一次，帮助提前说明。成功后重置比较基准与两种偏移，原滑块／24 小时导航仍按实际经过时间计算。参考显示设备 IANA 时区及真实 GMT 数值偏移，保留必要历史秒偏移。

已应用时刻不因设备换区而改变。未提交草稿和错误跨 tick、设置／语言／排序／模板更新保留；换区时保留已编辑或聚焦输入，并要求再次修改后应用。提交早于下一次 tick 时发现换区，也不会把旧墙钟字符串直接当新时区解释。复制仅取已显示结果，输入与提交使旧反馈失效，但不释放待完成的系统写入锁。返回当前时间、移除全部时钟和替换实例清除草稿。没有持久化、网络、计时器、权限、日程或邀请。

新增 20 项，连同既有入口共 103 项通过；另外 47 项相邻检查通过。旧测试和助手未改。真实缺功能红测及换区竞态红测均有最小修复和绿测。所有日期／时区覆盖仍是 Node Date/Intl 与合成 DOM 验证，不能当成已安装 Chrome、真实输入法、辅助技术、剪贴板或窄屏布局验收；未上传截图，未做全量／规模测试。
