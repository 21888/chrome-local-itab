# Find Countdown's relative-date controls — 2026-10-19

## Natural-flow finding

Baseline master `3306a64871ba9fba10dacb701d18c62a60c3f651` passed exact-source
[CI 39190736483](https://github.com/21888/chrome-local-itab/actions/runs/39190736483),
with 16,597 Node tests, 84 Python tests and 138 runtime files.

The existing Countdown editor exposes Days from today, Direction from today,
After today, Before today and Fill date. Its English/light and Chinese/dark
390-pixel production-renderer previews passed normal date filling, invalid-input
preservation, explicit save and native Cancel confirmation checks. However,
searching the visible label **Days from today** returned **No matching settings**.
The search allowlist had not been updated when those controls were added.

In that same baseline browser, World clocks search plus native Tab, Tab, Return
correctly selected Appearance and focused the visible World clocks heading.
Typing a query did not change the selected tab. Searching a synthetic saved
Countdown title returned no result; Clear search retained the tab and focused
the search field. The defect was missing public labels, not broken navigation.

## Bounded fix

Add the five existing translation keys and English fallback strings to Countdown's
existing settings-search entry. No new destination, DOM indexing, saved-content
search or action is introduced. The original navigation, native key guards,
focus/scroll behavior, translation resolution and query normalization are unchanged.
Opening a result only navigates to the Countdown section. It never invokes Fill
date or Save. Runtime change is limited to `shared/settings-search.js`.

The guide's obsolete fixed count of six Settings tabs is also replaced with
"all tabs"; the implementation already searches seven tabs and 21 destinations.

## Regression evidence

All 15,689 bytes of the pre-existing settings-search test and its helpers remain
unchanged. Eleven tests were appended: each of five labels in both locales, plus
English fallback without localization. They check the unique existing destination,
matching label detail, typing without navigation, no search-input Enter action,
heading focus rather than an action button, exact draft identity and field values,
Clear focus, private sentinel/date exclusion, and zero writes or remounts.

All eleven failed against the baseline for the missing result. The changed source
passed all 17 search tests and all 58 focused search, Settings keyboard and
Countdown relative-date/direction tests. An independent read of the source diff
and a separate 17-test search run passed. All 84 Python tests, syntax checking
and `git diff --check` passed.

One initial new-test assertion used `parentNode`, which the bounded DOM helper
does not implement. That failed run was retained; only the new assertion changed
to the helper's existing `parentElement`, comparing the same actual focused
heading's parent. No old assertion, helper or production behavior was weakened.

## Browser verification boundary

The baseline and candidate each freeze all 138 runtime files and the synthetic
preview inputs. Only `shared/settings-search.js` differs; candidate SHA-256 is
`badcd7e6873daf00d35fe4bd1ca2b7ed0d0763f949859f799d33b5b629b1886e`.
The preview serves production options.html with a separately injected page-memory
Chrome API bridge, inside a local 390 × 844 CSS-pixel iframe. It is not an
installed extension, real-profile storage or an upgrade-persistence test.

## Candidate native-keyboard GREEN

In English/light, Days from today and Fill date each returned one Countdown
result with the relevant public-label detail. From the focused query, native Tab,
Tab, Return (and, separately, Space) activated the result and focused the
Countdown H2. Enter in the query did not invoke an action. The exact draft
`  Synthetic unfinished Countdown title  `, date `2027-03-04`, empty day count
and After today direction remained unchanged, with Unsaved changes still shown.
Searching that private draft returned no matches; Clear search restored input
focus without changing the selected tab.

In Chinese/dark, 填入日期 returned one 倒计时 result. Native Tab, Tab, Space
focused the 倒计时 H2, retaining the original title, 2026-11-15 date, empty count,
After today direction and saved-state feedback. Both pages had document
client/scroll widths 375/375. Section geometry was read inside the 390-pixel
iframe; this is not a claim about an installed extension or assistive-technology
operation. The scoped local image confirms the Chinese fields remain unchanged.

The first candidate navigation timed out and reset the UI tool kernel. Binding
that existing tab then reported Emulation.setFocusEmulationEnabled timeouts,
while window/tab inventory remained available. After releasing and reacquiring
the shared desktop, the documented new-tab route in the same cloud browser
succeeded. No browser setting, permission or security control was changed.
Failure and recovery records are retained. Screenshots remain local and
publishing stays subject to the existing release/upgrade gates.
