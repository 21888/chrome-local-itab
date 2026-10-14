# Visible line breaks in saved-excerpt comparisons

Native Chrome for Testing 155 acceptance found that a bare CR inside a comparison `pre` visually joined the adjacent lines. The DOM still contained the exact saved string, and raw equality was correct, but the visual comparison could hide a line break. CRLF and LF did not show this problem.

Both **Compare any saved excerpts** and **Compare saved results** now normalize only their displayed body copies using CRLF/CR → LF, matching the existing prompt-preview approach. The dialog explicitly explains that displayed line breaks are normalized, saved originals and exact equality preserve their original line endings, and visually identical text can still differ. No special markup or synthetic break nodes are used.

The stored bodies, body-version IDs, historical snapshots and original equality operands are unchanged. A CRLF answer and its LF-only equivalent display the same lines but are not reported as exactly identical. Spaces, tabs, leading/trailing/repeated line breaks, Unicode and literal code/HTML-like text otherwise retain their content. Existing copy, Markdown export and JSON backup paths still receive raw saved text; no new copy/export action is introduced.

Synthetic checks cover both comparison scopes, CRLF/LF, CR/LF, CR/CRLF, identical mixed endings, normalization-equivalent but raw-different text, leading/trailing/repeated breaks, Unicode/tabs, independent source/version metadata, raw existing copy/exports, no automatic clipboard/network/storage effect, and English/Chinese disclosure. Existing invalidation, archival, read-failure and exact-link scope regressions also run.

This is a separate rendering-only fix following native QA, with no store, controller, schema, permission, dependency or provider changes. Model tests do not replace the final native visual recheck.

    node --test --test-concurrency=1 tests/manual-saved-excerpt-comparison.test.js tests/saved-result-comparison.test.js
    node --test --test-concurrency=1 tests/*.test.js
    python3 -m unittest discover -s tests -p '*_test.py'
