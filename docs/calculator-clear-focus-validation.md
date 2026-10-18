# Calculator: keep keyboard focus after clearing recent calculations

Date: 2026-10-18. This is a focused correction to the existing page-local recent-calculation list. It adds no controls, settings, storage schema, permissions or calculator grammar.

## User flow and correction

After calculating an expression such as `=1+2`, expand **Recent calculations on this page**, focus **Clear recent calculations** and activate it with Enter or Space. Clearing the list disables that same button. The existing DOM model, configured to model focus loss when a focused control is disabled, leaves `activeElement` on `body`. Unlike removing the last individual record, Clear previously provided no return to the disclosure summary.

The Clear handler now records whether its own button held focus, plus the current draft, edit/submission revisions and the exact cleared list. After the existing redraw, it returns focus to the same summary only if those snapshots still belong to the action, the original form/container relationship remains intact, the summary is available, and focus remains on the old button or body. A newer focus target, edit, submission, record insertion or remount prevents recovery. Focus is the final side effect, so a focus callback can start new work without later writes from Clear.

Unfocused Clear does not redirect focus. The current expression, its selection, current result and current-result feedback retain their existing behavior. Clearing still affects only the in-memory recent list. The existing event guards, clipboard executor and pending-write lock are unchanged.

## Baseline evidence

The owner ran the existing `tests/local-calculator-recent-results.test.js` with four appended regression tests against unchanged production code. The result was **30 tests: 28 passed, 2 failed**; the original 26 tests passed. Exit code was **1**, duration **7227.73464 ms**. The two new failures were the focused-clear summary assertion and the summary assertion while a clipboard write was pending: both observed body rather than the expected summary. This is a real-initializer DOM-model reproduction, not native Chrome acceptance.

The appended coverage includes:

- English and Chinese calculation → expansion → focused Clear → explicitly modeled native Enter/Space activation; retained draft, selection, result and local-only behavior
- Unfocused input/result/outside/body focus; empty-list, repeated and composing activations
- Pending current-result and recent-record copying, with late success/failure, preserved newer typing and no premature clipboard unlock; without another edit, current-result feedback completes normally while a removed recent receipt stays empty
- Concentrated synchronous redraw interruptions: newer focus, a changed or edited-away-and-back draft, same-value submission, a new calculation and remounting
- A summary-focus callback that starts another calculation, showing that Clear performs no later draft, list or focus write

Only new tests are appended to the existing test file. Its original content and shared DOM helper are unchanged. Production changes are confined to the existing Clear click handler in `newtab.js`; all 1,408 CRLF sequences are retained. CSS, locale catalogs, evaluator, shared lifecycle and clipboard executor are unchanged.

## Validation status and limits

The baseline RED run is recorded above. The owner then ran the corrected, frozen candidate with all seven appended regression tests and the related suites below. The serialized focused run passed **125/125 tests**, with **0 failed, 0 cancelled and 0 skipped**, in **6416.018731 ms**. The run included exactly these 11 files:

- `tests/local-calculator.test.js`
- `tests/local-calculator-integration.test.js`
- `tests/local-calculator-copy-result.test.js`
- `tests/local-calculator-continue-result.test.js`
- `tests/local-calculator-recent-results.test.js`
- `tests/local-calculator-recent-copy.test.js`
- `tests/local-calculator-recent-remove.test.js`
- `tests/search-draft-lifecycle.test.js`
- `tests/search-regression.test.js`
- `tests/clarity-dashboard.test.js`
- `tests/shortcut-toolbar-focus-padding.test.js`

These results cover the real evaluator/search initializer, current/recent calculator actions and their modeled draft/focus/clipboard lifecycle, plus the named search, Clarity and shortcut-toolbar regressions. They are a bounded focused run, not a full-project or native-browser pass. `node --check` passed for `newtab.js` and the changed recent-results test; `git diff --check` passed.

Independent read-only review passed against the same frozen production/test hashes. It confirmed the narrow handler change, preservation of the original 42,442-byte test-file prefix, 33 tests in the expanded recent-results file, and the recorded 125-test focused result. This review inspected source and existing evidence; it did not execute an additional test run and adds no extra test count.

The owner also reported **84/84 Python regression tests passed in 2.101 seconds**. CI, packaging, commit and publication had not run at this update; none is claimed as complete here. Later observed results should be recorded separately.

The tests use the real shipped initializer with the existing bounded DOM/event model. They explicitly model button activation and disabled-control focus loss. They do not prove Chrome's native Enter/Space synthesis, focus painting/timing, real IME behavior, screen-reader announcements, browser mutation timing or operating-system clipboard contents. No browser, screenshots, user device or paid service was used for this correction.
