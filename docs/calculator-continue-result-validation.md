# Calculator: use a result in the next calculation

Date: 2026-10-17. A successful local calculation now offers a native “Use result” / “用结果继续计算” button beside “Copy result”. This change keeps the existing expression syntax, JavaScript floating-point behavior and manifest version (1.1.155).

## Behavior and ownership

- Deliberate activation replaces the expression with `=` plus the complete stored result string, without rounding or localization. It focuses the search input and places the cursor at the end so the user can append an operation and explicitly submit again. It does not calculate, submit, navigate, read or write the clipboard, access storage, or save a preference.
- The action is shown in the successful-result row, outside the readonly result label. It clears the old result and copy feedback through the existing edit/hint lifecycle. The resulting expression remains an unsaved draft and retains the existing settings-reload protection.
- The successful result must still match the current expression, edit revision, submission revision, readonly value and mounted search owner. Both the action and writable input must be connected and visible in the current container, with no active composition or departure. Editing away and back, clearing, errors, composition and remounting discard the old result.
- Focusing an input may synchronously trigger handlers. The action rechecks the complete snapshot and active input after focus, before replacing text; a newer edit, same-value submission, new result or remount cannot be overwritten. The selection update also checks current ownership, text, revisions and focus.
- Native Enter/Space button activation remains available. Repeat, composition and key-code-229 activation are suppressed; a double-click tail cannot apply another continuation. The action checks its own control, so a missing or hidden copy button does not block continuation.
- Continuation can proceed while a copy is pending. It invalidates the old copy's feedback/owner eligibility and removes its observer/listeners, while the global clipboard lock remains held until the issued promise settles. An already-issued system write cannot be cancelled or reversed. Late success/failure neither changes the new input/result nor moves focus. The existing copy observer and pending-lock behavior are otherwise unchanged.
- The button shares the existing wrapping result-row layout, themed button styling and focus outline. It does not inherit the copy button's pending/wait state. English and Chinese catalogs contain the label; other missing translations fall back to English.

## Executed deterministic checks

The baseline test exercised the real `initializeSearchComponent` and failed because the new button did not exist. The completed bounded run passed 28 Node tests (13 new named checks, 12 existing copy checks and three other existing regression files):

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-calculator-continue-result.test.js \
  tests/local-calculator-copy-result.test.js \
  tests/local-calculator-integration.test.js \
  tests/search-draft-lifecycle.test.js \
  tests/search-regression.test.js
```

The new tests cover:

- Exact continuation of `0`, `-12`, `0.125`, `0.30000000000000004`, `1e+21` and `1e-7` in both locales, then explicitly submitted multiplication with expected results. A calculation counter proves continuation and typing do not calculate automatically.
- No result, calculation errors, ordinary drafts, input ABA, custom-template edits, direct snapshot mismatches, newer/reentrant submissions, clearing, repeated activation and detached old buttons.
- Native-button handler routing, repeat/IME/229 guards, hidden/inert/aria-hidden/CSS-hidden/departing contexts, disabled/readonly inputs, detached or moved inputs/buttons and closed-details ancestors.
- Focus-callback edits, ABA, same-value resubmission, new calculation, IME, readonly/disabled/hidden states, detachment, departure, transferred focus and remounting. Stale handlers cannot overwrite the draft or its selection.
- Independence from the copy control/API, pending-copy continuation with late success and failure, remounts while locked, explicit copy after settlement, and clearing completed copy feedback.
- Deferred reload and declined discard of the continued draft; no storage/network/clipboard-read/legacy-copy I/O; no automatic navigation or clipboard writes on continuation. Existing regression assertions and shared DOM helpers remain unchanged.

Byte checks preserve all 1,408 CRLF sequences and all `newtab.js` bytes outside the search initializer. CSS changes are exactly the two added shared selectors; no prior CSS declarations or existing tests are changed.

## Limits

These checks use the real search initializer with the existing bounded DOM model and test-local selection/focus, reload-notice and clipboard/observer stand-ins. They do not prove native keyboard click synthesis, native focus/IME behavior, browser mutation timing, assistive-technology announcements, operating-system clipboard contents, contrast or visual layout. No browser acceptance, screenshots, user-device access, release or store publication was performed for this feature. Earlier calculator screenshots predate this action and do not validate it. Full-suite, packaging and release checks remain separate.
