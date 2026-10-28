# Device-local Countdown validation

## Scope and storage

Countdown stores exactly one optional named target: schema version, monotonic revision, enabled flag, canonical plain-text title and strict YYYY-MM-DD date. The default is disabled with empty content. Hiding preserves content. Only explicit Save changes a draft; Cancel/Load saved read the latest state and confirm draft discard. Replacement of a conflicting saved state also requires confirmation.

The dedicated key is registered alongside Tasks, Focus and Scratchpad in the private local-content boundary. All configuration writers reject that key before provider activity. Configuration export, Drive snapshots, Chrome Sync and configuration recovery omit it. Reset/import/restore preserve its opaque record, including corrupt or future data. The component never calls configuration providers, schedules notifications, requests location or adds permissions.

The store uses the existing origin-wide Web Lock, revision comparison and exact validated readback. Commands own an immutable snapshot before yielding to the lock. A failed acknowledgement remains uncertain until a fresh read verifies the submitted values. Failed reads and invalid stored records are not authoritative defaults. The controller preserves newer draft generations throughout saves, retry, external changes and Cancel/read races. It never autosaves.

## Calendar semantics

Strict parsing validates four-digit years 0001–9999, real months/days and leap years by native Gregorian roundtrip. UTC calendar ordinals are constructed with setUTCFullYear, avoiding both daylight-saving elapsed-time errors and JavaScript’s special treatment of years 0–99. Today is derived from the device’s local year, month and day. No derived offset, timestamp or day count is stored.

The card uses a single bounded one-minute refresh timeout only while visible; focus and visibility changes refresh immediately. Hidden/pagehide/destroy paths cancel it. Only a card with its own unresolved local Hide retains recovery controls after an uncertain Hide until Retry or Load saved resolves the operation; a disabled recovery card does not run the timer. An intentionally hidden card stays hidden when an unrelated background read fails. Calendar ticks are not live announcements. Templates use existing semantic tokens, flexible wrapping and visible focus styles. Countdown visibility contributes only to information-card layout, never to another widget’s saved visibility preference.

## Validation and limitations

Automated coverage includes strict Gregorian/year/leap boundaries, fresh timezone processes across DST and quarter-hour offsets, corrupt/unknown records, revisions, lock serialization, failures before and after write, exact readback, concurrent draft edits, uncertain save recovery, plain-text export and resource cleanup. Integration tests verify private boundaries for reset/import/Drive/Sync, cardinality of packaging, card-only visibility, safe double-click behavior, reload deferral and English/Chinese catalog parity. Runtime exports remain text, never HTML. Recovery export intentionally accepts bounded invalid/incomplete draft strings, while saved records remain strictly validated.

The integrated suite passes 391 Node tests and 19 Python packaging tests. Artifact hashes are recorded beside the candidate files. Node DOM/event models establish logic and ownership; they do not prove native visual layout, screen-reader behavior or cross-profile storage behavior.

## Native check plan

1. Start with no Countdown data: card hidden, no Countdown timer, normal homepage unchanged. Open Settings → Search & cards and verify padded section layout.
2. Enter a title and valid date, enable and Save. Keep another homepage open: card appears without navigation. Edit and Cancel with keyboard; confirm draft remains until deliberate discard. Try impossible dates, leap-day boundaries, short/long years and an 81-character title.
3. Check a future date, today and past date against the device calendar. Verify focus/hidden-page refresh and no live-region announcement on calendar ticks.
4. Check all fifteen templates, light/dark and 320/375px widths: long titles wrap, controls remain accessible, date label and focus rings are clear. Check English and Chinese labels.
5. Edit concurrently in two Settings pages. Verify stale Save cannot overwrite, newer draft edits survive delayed saves, conflict preview is accurate, and replacement uses the displayed latest revision. Simulate failed read/write acknowledgement; verify Retry and text export retain data.
6. Hide/re-enable; confirm content retained. Export saved and unsaved/invalid drafts as text. Configuration export/restore/reset must not include or erase Countdown. An unfinished Countdown draft must defer configuration-triggered reloads; intentional confirmed discard remains possible.

Native results are recorded separately; no native validation is claimed by this implementation record.

## Recorded native checks — 2026-10-09

Official Chrome for Testing 155.0.8059.39 on cloud Linux used an owned synthetic profile and the final 56-file runtime snapshot. The default card was hidden. Saving a named date and enabling it through Settings immediately updated an already-open homepage; full reload retained it. Against the observed device-local date 2026-10-09, 2026-10-10 displayed “1 day left”; the Today and past-date displays also passed.

The impossible date 2026-02-30 was rejected with its draft retained. Edit opened the correct Settings section. Cancel's discard confirmation kept the draft when declined and restored saved values when accepted. Two actual Settings pages produced a stale-save conflict: the first draft remained alongside the latest saved comparison; Load saved recovered the latest values. Hiding the card and re-enabling it through Settings retained its title/date. Original captures and all runtime hashes were retained separately.

These checks do not establish native injected failure/uncertain-ack recovery, corrupt-storage handling, actual IME, assistive-technology announcements, all-template combinations or other operating systems. Those that have source/model coverage remain identified as such.

The actual browser download flow produced a 25-byte text export, and the native text viewer displayed the saved title/date. Clean light/dark captures at a 1188×848 native window and dark card/Settings captures at 510×848 were readable with reachable controls. The [published card crops](screenshots/countdown/capture-metadata.json) are exact pixels from native screenshots, without resizing or retouching. Original images and source hashes are included; the CSS viewport was not instrumented.

## Exported TXT import into an unsaved draft

Focused command: `node --test tests/local-countdown-{store,view,controller,boundary,integration}.test.js`.

Added parser and DOM-model coverage for literal Chinese, emoji, multiline/leading/trailing title newlines, HTML-looking text, real leap days and year bounds; BOM/CRLF handling; missing final newline/title/date, invalid dates, controls, invalid Unicode/UTF-8 and size limits; exact draft-only apply with unchanged saved state and visibility; existing Save rejection followed by correction; Cancel/Escape/native picker cancellation; same-file retry after failure; delayed completion after newer edit, IME, cancellation, another file, pagehide, detachment and destruction; reviewed-preview invalidation on remote conflict, visibility edit, save and failed read. Existing Countdown storage/controller/boundary/integration tests remain included.

These are automated model checks, not native-browser or operating-system file-picker acceptance. Native focus, IME and file selection remain separate acceptance checks.

## Integrated TXT-import checks — version 1.1.44

The complete serial Node suite passed 1,791 tests with no failures or skips; all 53 Python packaging tests passed. The 90-file verified runtime ZIP SHA-256 is 32777f03b2a8e0400bb26e7e425dcb99cc9f1477a516bcacaf90a116e91e07c1. Parent-document rebases changed no runtime files.

Independent review passed 78 focused Countdown tests and six additional adversarial probes, covering leap-date validation across Gregorian years 1–9999, malformed UTF-8/controls/surrogates, file-size mismatches, late reads, IME models, cancellation/departure, repeated Apply without storage writes, preserved visibility and unchanged Save validation. This evidence is deterministic, not native IME or file-picker coverage.

## Bounded native TXT-import acceptance — 2026-10-11

Cloud Chrome for Testing 155.0.8059.39 used a fresh synthetic extension, ordinary Settings controls, the real GTK chooser, explicit Save, reload and genuine TXT downloads. Runtime hashes before/after were identical.

- A valid Chinese/emoji title and leap date 2028-02-29 displayed literally in preview. Escape preserved the baseline and returned Import focus.
- Apply changed title/date in the unsaved draft, focused the title and left visibility off. Explicit draft Cancel restored the baseline, demonstrating no automatic save. Reapplying and choosing Save persisted the imported values.
- Invalid 2027-02-29 text failed closed with an explanation and disabled Apply. Multiline recovery text retained its literal markup/newline in preview and draft; existing Save validation rejected it. Discarding that draft and reloading restored the previously saved valid data.
- Four genuine exports were compared without normalization. Baseline and canceled exports were exactly 30 bytes, SHA-256 fdce03d28e81a28df8b921c8292ed731ec7473e54ce5905a7d530fa8bb5e28e6. Saved and reopened exports both exactly matched the 38-byte input, SHA-256 9d36fe8def56487023bdaa1304e72b2466d7e84ea11d3754ffc4a8b6da4fcc8e.

Native scope was English desktop/light UI with Chinese fixture text, not Chinese UI localization. Dark/narrow layouts, actual IME, file-size/encoding boundaries, asynchronous races and revision-token equality were not retested natively. TXT exports contain neither visibility nor revisions; retained unchecked visibility was observed in the UI. A temporary host-wide tool stall recovered without source changes and was not treated as a product defect. New screenshots and raw exports remain local.

## Settings action focus ownership — 2026-10-16

A focused Settings Save, Cancel, Load saved, confirmed Replace, or Retry after an already-loaded read/save failure could lose focus when its own synchronous render disabled or hid the initiating button. The editor now lets the existing action and synchronous busy/validation/error render finish, then moves only that lost button focus from `document.body` to the existing, visible status paragraph. The paragraph has explicit `tabIndex = -1`, so it can receive programmatic focus without adding a Tab stop. Its existing text, live-region semantics and theme focus style are retained.

Focus is repaired only if the originating button was focused, connected, visible, enabled and inside this editor when the action began; the button must still belong to the same live editor and must have become unavailable. Hidden documents, hidden/display-none/visibility-hidden or collapsed/inert ancestors, detached elements and destroyed/replaced editors do not acquire focus. Empty status content is not a focus target because `.countdown-status:empty` has `display: none`. A usable button, canceled confirmation, no-op action, existing input focus or external focus is left alone. There is no focus callback at promise settlement, so later edits, IME composition and navigation retain their own focus. The existing synchronous-throw/rejected-promise containment, controller calls, confirmation counts, immutable save snapshots, CAS checks and storage writes are unchanged.

This checkpoint was intentionally limited to synchronous button unavailability. At that time, Retry after a failed **initial** load called `refresh()` without entering a synchronous pending state, and its later hidden-button focus loss remained outside the change. The [subsequent initial-read recovery fix](countdown-initial-retry-validation.md) routes that explicit Retry through the existing read-only recovery path with a synchronous busy state, reusing the same focus handoff without an asynchronous focus callback. Card controls and import lifecycle remain outside this focus change.

Validation: the final 29 focused tests produced 18 expected failures and 11 passes against the unchanged baseline, then 29 passes against the fix. All 107 tests in these five explicit files passed: `local-countdown-view.test.js`, `local-countdown-controller.test.js`, `local-countdown-store.test.js`, `local-countdown-boundary.test.js` and `local-countdown-integration.test.js`. JavaScript syntax and `git diff --check` passed. This is a focused result, not a new full-suite or Python-packaging result.

The tests use the real Countdown controller and store with synthetic data. Their DOM model explicitly drops disabled/hidden focus to body, rejects hidden/inert/disconnected focus, requires an explicitly focusable status paragraph and models the status `:empty` rule. Additional probes cover successful and failed operations, newer draft inputs, external/body focus, declined confirmations, validation failure, synchronous throws/rejections, hidden/detached/destroyed/remounted editors and the initial-load Retry boundary. Synthetic click dispatch does not prove native Enter/Space activation or Tab order. Layout, focus painting, exact blur timing, assistive-technology announcements and actual Chrome behavior were not executed for this change.

The [W3C keyboard-interface guidance](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#kbd_general_between) explains persistent focus and `tabindex="-1"`; [Chromium's form-control implementation](https://chromium.googlesource.com/chromium/src/+/f33685b561f5319561ed75d572a58b5763a718d8/third_party/blink/renderer/core/html/forms/html_form_control_element.cc) explicitly blurs a focused control when it becomes disabled. These primary sources ground the model and chosen behavior; they are not native acceptance evidence for this build.
