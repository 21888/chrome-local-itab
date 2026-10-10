# Offline calculator validation — 2026-10-09

At the initial calculator milestone, the integrated source matched the frozen reviewed and native-tested runtime, and all 123 tests then present passed. Independent review additionally compared 30,000 generated arithmetic expressions and exercised 100,000 malformed/random inputs. Syntax, manifest/locale JSON, and patch checks passed.

Native Chrome for Testing verified English arithmetic precedence, unary signs, zero-division/malformed/depth errors without external navigation, stale-result clearing, retained input focus, and Graphite dark layout at a 510×848 browser window. These are window dimensions, not a measured content viewport. Twenty original screenshots and runtime hashes were recorded.

Chinese native rendering, native IME, ordinary localhost URL submission and all-template coverage were not completed because the disposable browser became unresponsive. Automated initializer checks cover Chinese/English, IME suppression, ordinary URL/search behavior and local-only error paths; these do not replace native verification. No permissions or external network consent were changed.

A cloud execution interruption terminated an integration run. After recovery, the full final suite was rerun successfully; the incomplete run is not counted as a pass.

Arithmetic uses standard JavaScript floating-point numbers, not exact decimal arithmetic; for example 0.1 + 0.2 can display 0.30000000000000004. Input and nesting bounds and supported grammar are documented in the README. There is no calculator history or persistent storage.

## Follow-up native acceptance after recovery

On 2026-10-09, the published runtime at `7242483` was reloaded in the recovered official Chrome for Testing profiles; all seven tracked runtime files matched production. Chinese Clarity/light at a 510×848 native window correctly rendered the calculator controls, evaluated precedence/unary expressions, displayed localized zero-division/syntax errors, and cleared stale output on ordinary input. English Graphite/dark arithmetic, error and ordinary-input regression also passed. Ordinary localhost URLs opened the exact requested destination in a new tab; connection refused was expected because no local server was running, so this verifies routing, not successful page serving.

These observations close the earlier Chinese rendering and localhost routing gaps for the executed cases. Real IME composition, screen-reader output, all-template coverage and an actual Sync-triggered reload remain unverified. The earlier interruption record remains historical, not a current blanket browser blocker.

## Keyboard-selectable output

Successful calculations now also show a labeled readonly text field. Tab to it to select the exact displayed numeric value, then use the browser's ordinary Ctrl/Cmd+C copy command. Calculation never moves focus into it. Enter in this field is suppressed so it cannot submit the surrounding search form. Editing the expression, starting IME composition, errors and remounts clear and hide it. The live status remains unchanged, and selecting a result does not release the expression's reload protection.

The value is `String(result.value)`, including zero, negatives, floating-point rounding and exponential output. At that milestone, exponential notation remained unsupported as calculator input; the scientific-literal follow-up below changes that grammar. There is no clipboard API, clipboard permission, history, persistence or new network use.

Deterministic real-initializer tests cover English/Chinese labels, exact values and selection ranges, retained expression focus, unchanged native copy key handling, Enter/repeat/composition suppression, error and missing-helper paths, stale clearing, remount/reentrant ownership and ordinary-search transitions. A test-local selection stub supplies only the DOM model's missing selection/focus event behavior; actual OS clipboard contents, native Tab order, screen-reader announcements and all-template visual layout still require browser acceptance. Existing native observations above predate this output field.

The final isolated-copy checks passed 407 Node tests, 19 Python packaging tests, JavaScript syntax checks and manifest/locale JSON parsing. The isolated review did not operate a browser; the subsequent native checks below cover the integrated change.


### Integrated native output acceptance

On 2026-10-09, official Chrome for Testing 155.0.8059.39 on Linux with a normal
sandbox and disposable synthetic profile passed the following bounded checks:

- `=(12+3)/2` displayed `7.5` without moving expression focus. Tab through
  Calculate into the readonly output visibly selected the complete number.
- Ordinary Ctrl+C and Ctrl+V into the unsent expression field reproduced exactly
  `7.5`. Enter while output was focused did not submit or open another tab.
- `=1000000000000000000000` displayed `1e+21`, and native selection, copy and
  paste reproduced that exact text. The pasted value was not submitted.
- Editing hid the old field. `=1/0` displayed the error without stale output.
- English Clarity light/dark were readable at 1188 × 848 wide and 510 × 848 narrow
  outer-window sizes. Folio light also passed at 510 × 848 and 1260 × 848.
- Settings search still occupied its full row and returned both clock results.
  All 57 runtime files matched their frozen hashes, and 407 Node plus 19 Python
  packaging checks passed after integration.

No clipboard API or direct clipboard inspection was used: copy/paste was tested
through ordinary UI gestures and visible destination text. The disposable
browser was closed normally. These window sizes are not CSS viewport claims.
Chinese, actual IME, assistive technology, held-key repeat, injected storage
faults, network instrumentation and all-template coverage were not performed
in this output-specific native pass. Prior calculator coverage remains separate.

Frozen output-specific hashes:
- `newtab.js`: `038c6bbeb61075b3753425c61a66b5df0f389f43ad71d9f8e3e895bc5614d3e1`
- `newtab.css`: `8013358613294eb1649428598c8e9dc4f25cfd49b81e83d6f240d810a670bd86`


### Chinese output-label follow-up

The same final 57-file runtime (`f6b4c80`) was subsequently checked in an actual
Chinese-language browser profile. `=(12+3)/2` returned `7.5` with the localized
result and native-copy guidance. The label and field were readable in light and
dark mode at a 514 × 848 outer window, and light mode at 1188 × 848. This closes
the output-label rendering gap; native result-copy behavior was not repeated
in Chinese, and real IME/assistive technology remain unverified. All runtime
hashes matched; the owned browser was closed normally.

## Scientific-literal roundtrip follow-up

The decimal number grammar is now `(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`.
Examples include `1e2`, `.5E+2`, `1.e-2` and `-1e-7` (the leading minus remains a unary operator). The exponent's optional sign belongs to its literal and does not consume a unary nesting level. Whitespace within a literal, incomplete or repeated exponents, implicit multiplication, variables and executable expressions remain unsupported. Calculations still require the explicit leading `=` in search; ordinary `1e2` remains a search query.

All exponent digits count toward the unchanged 256-character expression limit. The combined parentheses/unary depth limit remains 32. There is no separate token-count limit in the existing evaluator; the expression-length bound also bounds token work. Literals and arithmetic must produce finite IEEE-754 numbers. Overflow gives a local range error; underflow retains the existing rounding-to-zero behavior (`1e-324` becomes `0`, and dividing by it gives a zero-division error). There is no new exponent-magnitude limit: long zero-padded or underflowing exponents are permitted within the expression-length bound. Negative zero is still normalized to zero.

An isolated archive based on `bfa9f4548d5687de31767ac552f43052a52ff330` passed all 691 Node tests and 19 Python packaging tests. Targeted tests cover upper/lowercase exponents, signed and trailing-dot decimals, unary/operator ambiguity, malformed and long exponents, overflow, underflow, smallest/largest finite doubles, expression/depth bounds, exact result-to-literal-to-arithmetic roundtrips, and the real search initializer in both locales without navigation, storage or clipboard I/O. JavaScript syntax and patch whitespace checks passed. No browser acceptance was performed for this follow-up; prior native checks above describe earlier milestones.
