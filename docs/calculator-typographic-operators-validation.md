# Calculator typographic operators — 2026-10-18

## User-facing contract

An explicitly submitted calculation beginning with `=` now accepts exactly three
additional operator characters: `×` (U+00D7) as `*`, `÷` (U+00F7) as `/`, and `−`
(U+2212) as `-`. For example, `=(12×3−6)÷2` evaluates to `15`. The minus alias also
works for unary signs and exponent signs: `=1e−7×2` evaluates to `2e-7`.

Only the evaluator's private string is mapped, after its existing string-type
and 256-code-unit length checks. The three replacements are each one UTF-16 code
unit, so the grammar's length and combined 32-level parentheses/unary bounds do
not change. There is no Unicode normalization, input rewriting, implicit
multiplication, extra precision, network operation or persistent storage.
Full-width digits/operators, other dashes, multiplication dots, fractions,
variables and executable expressions continue to be rejected.

The search draft and recent calculation preserve the exact original expression,
including these symbols and whitespace. “Edit expression” restores that original;
“Copy calculation” copies it, one newline and the numeric result. “Use result”
still starts a new draft from the numeric result and waits for explicit submit.
Without the leading `=`, the same text remains ordinary search.

## Baseline and explicit test-contract change

The baseline is remote `6da9f43258b42df896ab97e2c7f7ecfd7dcb2db7`, local equivalent
`77912f567e944b3f9c7edd18274535838fce9e23`, tree
`7d9ca203a535b6d361a0fcfd3db3f8b405744fc5`. Before changing production, the new
ten-test file ran against that source: 3 passed, 7 failed. Unsupported-lookalike
and ordinary-search controls passed; the newly supported grammar and integrated
calculation cases failed. The original production, test file and failure log
were preserved before implementation.

This is a deliberate grammar extension. The old `tests/local-calculator.test.js`
negative-list entry `2−1` was moved to a positive assertion in the new named test,
where its exact result is `1`. That single list item is the only old test change.
Every other old assertion and shared helper remains unchanged. New negative
cases explicitly preserve rejection of full-width minus, other dashes, dots,
division lookalikes, invisible formatting, executable input and malformed
aliases. This is not a general relaxation of the parser's safety grammar.

## Executed checks

The owner ran the new tests plus the existing calculator, search-draft, search
regression, Clarity and toolbar-focus tests: **12 files, 135 passed, zero failed,
cancelled or skipped** (3,150.599827 ms). Coverage includes:

- Mixed ASCII/typographic precedence, left associativity, unary signs,
  scientific notation, underflow, overflow and division by positive/negative zero.
- Exact 256/257-length and 32/33-depth boundaries, with no non-string coercion.
- Real search initialization in English and Chinese: exact draft/history text,
  explicit copy payload, edit restoration and caret, result reuse, unsaved-input
  reload protection and no unintended storage/network/navigation/clipboard reads.
- IME composition refusal, local error feedback retaining successful history,
  and ordinary search through Google, Bing, DuckDuckGo and configured custom search.
- The complete existing calculator regressions, including pending-copy locks,
  recent-entry removal and the preceding clear-focus repair.

Two initial failures in the new integration test's cleanup assertions were
corrected without changing production: a settled copy retains its existing
receipt observer until the next edit, and the existing reload guard retains a
separate listener. The test now verifies the successful copy receipt, performs
the real edit, then checks the copy observer and its blur/pagehide/visibility
listeners are gone. Both intermediate failure logs are retained.

JavaScript syntax and patch whitespace checks passed. The standard Python
packaging suite passed **84/84** (1.858 s). An earlier command used the wrong
filename pattern and ran zero tests; that result is retained and is not counted
as a pass. Exact CI and runtime packaging results are recorded with the delivered
commit rather than inferred from these focused tests.

## Validation limits

These checks execute the real parser and search initializer in the existing
bounded DOM model. Clipboard writing, native paste/IME, focus and browser
activation are modeled; no native extension or visual acceptance is claimed.
The change does not alter storage, migration, recovery or schema protocols and
does not establish the cause or recovery of the historical data-loss incident.
Manifest version, release/store publication gates and CI workflow are unchanged.
