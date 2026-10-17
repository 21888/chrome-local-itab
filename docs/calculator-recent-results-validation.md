# Calculator: recent results on this page

Date: 2026-10-17. This is a small extension of the existing local calculator, not a correction to its previous single-result behavior. It adds a temporary recent list without changing the evaluator, shared content lifecycle, manifest version (1.1.155), permissions or clipboard APIs.

## Behavior and boundaries

- A native `details` disclosure starts collapsed. It contains an ordered list of at most five successful, explicitly submitted calculations, newest first. Every successful submission adds a record, including a deliberately repeated expression. Typing, errors, failed/unavailable calculations, ordinary searches and IME do not add records. Successful calculation does not automatically expand the disclosure or focus a record.
- Each record displays the original input expression, including whitespace, and the same complete `String(result.value)` used by the current result. Values are not rounded or localized. Both fields use `textContent`; narrow layouts wrap expressions, results and buttons.
- A record's native “Use result” button replaces the current writable search draft with `=` plus that complete number, focuses the input and moves the caret to the end. It clears the current result and copy feedback using the existing edit/hint path. It does not evaluate, submit, navigate, copy or write storage. The user must explicitly submit another calculation. The existing current-result button remains unchanged.
- Editing, calculation errors, ordinary searches, clearing the current result and hiding the search area retain the recent list. Hiding only blocks hidden actions; it does not claim to erase records. “Clear recent calculations” removes only the recent list, without changing the current draft or result. The empty-state text and disabled clear button show when no records remain.
- Records are held only in the mounted initializer's memory. A new mount starts empty; a page reload discards them. There is no persistence, sync, export, network access or new permission. Entries alone are excluded from `hasUncommittedWork`; a reused draft retains the existing unsaved-input protection. These temporary entries can be lost during a settings-sync reload once no unfinished draft remains.

## Ownership and interrupted actions

- A row action requires the exact record to remain in the bounded list, the exact current button for that record, the row to remain in the current list, the current mounted owner, and a connected, visible, writable input. Disabled, readonly, hidden, inert, aria-hidden, CSS-hidden, closed-details, detached, moved-outside-container, background-page and departing contexts are rejected.
- Clear and row actions reject repeat, IME/composition/key-code-229, modifier-key, already-prevented and double-click-tail activations. Native Enter/Space activation remains available; the code does not synthesize clicks.
- Before focusing the input, reuse snapshots its text, edit revision and submission revision. After focus it rechecks those snapshots, active focus, record membership and all availability/ownership guards. Synchronous focus handlers that edit away and back, directly change the value, submit without an edit, clear/evict a record, change visibility or remount cannot have newer work overwritten. The final caret update also checks the current input, revisions and focus.
- Clearing, eviction, redraw and owner replacement invalidate old row callbacks. Reattaching a cleared/evicted button cannot restore its record authority.
- A historical result can be reused during an existing copy attempt. The old feedback is invalidated through the unchanged edit path, but the global copy lock remains until the already-issued write settles. Late success or failure cannot replace the new draft/result, show stale feedback or move focus. No history action accesses the clipboard API.

## Executed deterministic checks

The 14 new named tests were first run against the unchanged implementation and failed because the recent-list feature did not exist. The new test file then passed against the implementation. The final bounded combined run passed 42 tests with no failures:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/local-calculator-recent-results.test.js \
  tests/local-calculator-continue-result.test.js \
  tests/local-calculator-copy-result.test.js \
  tests/local-calculator-integration.test.js \
  tests/search-draft-lifecycle.test.js \
  tests/search-regression.test.js
```

The new tests exercise the real search initializer and cover both English and Chinese; initial collapsed state and empty/list transitions; exact values `0`, `-12`, `0.125`, `0.30000000000000004`, `1e+21` and `1e-7`; the five-entry bound/order; repeated explicit successes; preservation across errors/search/edit/IME; exact historical continuation with a calculation counter; explicit subsequent calculation; clear and eviction; detached/reattached old controls; remount/fresh-page emptiness; reload protection only for drafts; activation guards; visible/writable/owner guards; focus reentry/ABA/submission races; pending-copy success/failure; clipboard independence; reentrant evaluator submission; fallback labels and CSS wiring. Test-local I/O traps reject storage, network, clipboard reads and legacy copy paths.

The existing tests and shared DOM helper were not changed. Byte checks confirm that all bytes outside `initializeSearchComponent` in `newtab.js` and its 1,408 existing CRLF sequences are unchanged; CSS additions are append-only. Evaluator, shared lifecycle and manifest bytes remain unchanged. README language was updated only for the current behavior; earlier verification reports remain historical records.

## Limits

These are bounded Node/VM checks with the existing DOM model and test-local selection, focus, observer, clipboard and reload-notice stand-ins. They do not establish native keyboard click synthesis, native focus/IME behavior, browser mutation timing, assistive-technology behavior, operating-system clipboard contents, contrast or visual layout. No browser acceptance or screenshots were produced for this feature. Existing screenshots predate it. Full-suite, scale, packaging, CI, commit, push, release and store publication are separate stages and are not claimed here.
