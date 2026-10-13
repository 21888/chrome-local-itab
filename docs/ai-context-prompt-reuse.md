# Reuse a saved prompt as a context-workbench question

## Interaction and scope

Open **AI context Q&A**, then **Use a saved prompt** beside the question. This explicitly reads the current unarchived records in the device's global prompt library. No template is selected by default. Pick one, fill its variables (or explicitly choose **Use an empty value**), and choose **Preview replacement question**. The plain-text preview shows the entire replacement and its exact UTF-16 count. Only **Replace this question** applies it to the current in-memory question. Reload and Close never apply a template.

Replacing clears previous local/request/task review tickets and requires another full review before copying the complete prompt or sending. It preserves selected and hidden sources, temporary excerpt edits, filters, output mode and progressive setting, connection and API-key field, and any previous response with its original request and save metadata. The previous response remains associated with its old question, including when saving its optional snapshot. Reuse does not add a `promptRef` or claim the old answer was generated from the newly selected template.

The picker never sends a model request, grants an endpoint permission, copies text, saves a variable value or draft, changes a saved prompt, or adds a storage key or dependency. The unchanged review/allow/send and explicit answer/task-save flows remain separate. Current active templates only are selectable: archive, recovery and historical-version records do not silently become candidates. Empty and failed reads do not choose a fallback record.

## Exact text and safety checks

The existing prompt store owns template parsing and rendering, including escaped braces, non-recursive substitutions, repeated variables, Unicode and own-property names such as `__proto__`. Missing values differ from explicitly empty values. Whitespace-only or more-than-4,000-UTF-16-unit expansions cannot be applied; nothing is shortened. Emoji may use two units. Selected-source and complete-prompt budgets still apply at the subsequent request review.

The preview normalizes only its displayed line breaks from CRLF/CR to LF, so a lone CR appears as a new line rather than joining adjacent text. Its count and apply ticket still use the exact raw text. Applying a template retains its raw CRLF/CR/LF and trailing whitespace. Browsers display textarea values using LF; the workbench keeps the raw applied question alongside that display baseline. Budgets and both review routes use the raw value until a real question input event makes the user's edited textarea text the new draft. The template is never rewritten to match the browser's display. Full local prompts serialize the exact question as JSON, so CR characters are explicitly escaped there.

Before applying, the workbench rereads the fenced prompt store and checks the selected record's ID, metadata version, current body-version ID, exact body and unarchived state. Current-workspace checks bracket the asynchronous read. A prompt-store subscription starts before reading: library-change notifications invalidate pending reads and previews without automatically rereading or changing the question. Closing unsubscribes; old queued callbacks cannot affect a reopened picker. Generation, operation and question ownership checks refuse late results after newer edits, reviews, close/reopen, reset, departure or detached UI. Busy model/save/preset work and uncertain save/task operations retain their existing locks. Read, restore-fence or workspace failures leave the question unchanged and require another explicit attempt.

Labels and status messages are available in English and Chinese. The picker uses an associated select label, labeled variable textareas, uniquely described empty-value buttons, a keyboard-focusable read-only plain-text preview, and a live status region. Opening, closing and asynchronous apply move focus without leaving it on a hidden or disabled control; a newer focus outside the picker is retained.

## Reference and implementation

Only the interaction idea of reusing saved prompts with variables informed this feature. LibreChat's official [v0.7.4 announcement](https://www.librechat.ai/changelog/v0.7.4) describes that prompt-library capability; its [project license](https://github.com/LibreChat-AI/LibreChat/blob/main/LICENSE), checked 2026-10-13, is MIT. This is an independent vanilla-JavaScript implementation using Local iTab's existing parser and fenced stores. No LibreChat source, templates, CSS, assets, runtime dependencies or backend behavior was copied. No AGPL source was used.

## Validation

Synthetic tests in `tests/ai-context-prompt-reuse.test.js` cover explicit-only reads, empty/archived libraries, parser semantics, missing/empty values, exact raw line endings through real-textarea-like normalization, 4,000/4,001-unit and emoji boundaries, late callbacks, edited/reverted drafts, template changes, workspace/read/fence failures, busy and uncertain-operation locks, existing-answer ownership, both language catalogs and focus recovery. Mock counters assert no provider, grant, clipboard or persistent write from the picker. Separate existing-flow assertions explicitly invoke a mock send/copy/save to verify retained provenance; no real service is used.

Run:

    node --test --test-concurrency=1 tests/ai-context-prompt-reuse.test.js tests/ai-context-view.test.js
    node --test --test-concurrency=1 tests/*.test.js
    python3 -m unittest discover -s tests -p '*_test.py'

These are controller/store/DOM-model checks, not native layout or actual provider acceptance. Native browser QA is recorded separately. No screenshot, real account, live provider request, paid platform or optional browser-permission grant was used to implement this change.

The final development candidate, including the display-only lone-CR correction, on the 1.1.126 baseline passed 3,197/3,197 strict-serial Node tests, 84/84 Python tests, JavaScript syntax and locale/manifest JSON checks, and a 123-file runtime build/source verification. Focused feature plus existing-view checks passed 204/204; independent synthetic review passed 26/26 additional cases and 268/268 affected feature/controller/view checks. These counts do not claim native browser acceptance or real-provider compatibility.
