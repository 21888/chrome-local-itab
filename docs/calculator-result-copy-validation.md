# Calculator result copy: deterministic validation

Date: 2026-10-17. This small enhancement adds an explicit “Copy result” button beside a successful local calculation. The native button is outside the readonly field's label. The field still selects its complete value on focus and supports ordinary Ctrl/Cmd+C; Enter in that field still cannot submit the search form.

## Behavior and ownership

- Only deliberate button activation calls `navigator.clipboard.writeText`, synchronously before any awaited work, with the successful result's complete `String(result.value)`. Calculation, input, selection and ordinary search never use the clipboard API. No expression, equals sign or label is included, and copying does not run the calculator again.
- Pending, success and failure messages belong to a separate local live region. Missing API support, a synchronous exception or a rejected promise leaves the expression and readonly value available for manual copy. There is no automatic retry, clipboard read, legacy `execCommand` fallback, storage write, network use or new permission.
- A result belongs to its expression, edit revision, submission revision and mounted search owner. New input (including changing away and back), IME composition, submission, errors, clearing and remounting discard old copy feedback. Visibility, departure and ancestor-mutation guards prevent obsolete completion messages, including when an ancestor is briefly hidden and restored.
- A single unfinished clipboard write remains locked across search remounts. Invalidation removes the attempt's observer/listeners and clears its feedback, but cannot cancel or reverse a system write already issued. Settlement restores the current owner's button without publishing the previous owner's outcome or moving focus. The focused button uses `aria-disabled` and a click guard while pending.
- English and Chinese copy text are included. The result row wraps on narrow layouts and uses existing theme colors and focus tokens.

## Executed deterministic checks

A baseline run of the single “copy control exists outside the result label” test failed because the button did not exist. After implementation, the following bounded command passed 16 Node tests (12 named copy checks and four existing regression files):

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-calculator-copy-result.test.js \
  tests/local-calculator-integration.test.js \
  tests/local-calculator.test.js \
  tests/search-draft-lifecycle.test.js \
  tests/search-regression.test.js
```

Coverage includes exact `0`, `-12`, `0.125`, `0.30000000000000004`, `1e+21` and `1e-7`; both locales; no API use on non-copy paths; missing API/throw/reject and explicit retry; repeated activation; selection and result Enter; new and same-value submissions; input roundtrips; IME; ordinary search and calculation errors; clearing; three successive remounts during one pending write; hidden/inert/aria-hidden/CSS visibility/detachment/document-hidden/departing guards; delivered and queued transient-mutation records; blur/pagehide/visibility interruption; synchronous reentry; late resolution/rejection; and pending-only listener cleanup. Existing calculator integration continues to use its original forbidden-clipboard mock.

## Limits

The harness uses the real search initializer with the existing bounded DOM model, explicit observer records and a controllable clipboard mock. It does not prove native user activation, operating-system clipboard contents, real browser mutation scheduling, native IME, screen-reader announcements, contrast or visual layout. No browser acceptance, screenshots, user-device access, release or store publication was performed for this change. Earlier native calculator observations in [the calculator validation history](local-calculator-validation.md) predate this button and do not validate it. Full-suite, packaging and release checks are separate from the focused checks described here.
