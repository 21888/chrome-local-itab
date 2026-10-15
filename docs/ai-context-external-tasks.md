# Review external task JSON locally

## Workflow

In **AI context Q&A**, choose **Draft tasks for review**, then open **Review external task JSON**. Paste a plain JSON response from your chosen service and choose **Load task JSON for review**. A question, selected sources, endpoint, model and key are not required.

Accepted shape:

    {"tasks":["Review the draft","Prepare the synthetic demo"]}

Use exactly one `tasks` field with 1–50 nonempty single-line strings. Each string is limited to 1,000 UTF-16 units and the complete pasted JSON to 32,000; some emoji count as two units. Code fences, extra fields, nested task objects, malformed Unicode and multiline task strings are rejected. The input does not use native `maxlength` truncation: an overlong paste is retained for repair and rejected as a whole. Existing task-store validation additionally rejects unsupported control characters and full-capacity batches before writing.

Loading creates a temporary local task candidate list. Uncheck unwanted items, choose **Review extracted tasks**, inspect the exact selected list, and separately choose **Add these tasks**. Duplicate strings remain distinct choices and retain their original order. Markup and URLs are literal task text, never links or executable content. Editing loaded JSON resets its selection; editing selection or the surrounding question/source/connection invalidates the final task review.

## Ownership and privacy

- No automatic clipboard read, file import, URL fetch, provider request or endpoint grant occurs. Pasting does not parse or select tasks until explicit loading.
- The result is labeled **manually pasted external tasks**, with no verified service, model, endpoint or original question/source lineage. It is independent of the question, connection and excerpts shown elsewhere in the panel.
- External task JSON cannot be saved as a collection answer or as a question/source snapshot. Its provenance marker is session-only. Confirmed tasks use the unchanged ordinary Tasks schema and join existing task exports and Complete local backups.
- Replacing an unsaved response or incomplete answer asks for confirmation. Cancel retains the response, selection, task review and pasted draft. Editing during that confirmation invalidates it. Invalid input also leaves the previous response intact.
- The unparsed paste participates in departure/clear draft checks. Closing clears temporary input and loaded results; there is no saved manual-import draft to resume.

## Storage and interruption behavior

Only **Add these tasks** writes, through the existing task-store review, command, lock, revision check and receipt path. Existing active/completed/removed records, pin and recovery copies remain unchanged. The entire selected batch must fit; no partial import or silent deduplication occurs.

Async loading is fenced to the original draft and active workspace. Changes to question, source, connection, mode, pasted input, selection, document visibility or panel lifetime prevent a late import from replacing current work. A newer task revision requires fresh final review. A workspace invalidated while waiting on the store lock cannot receive a new write.

An uncertain write keeps the same operation and task identities, freezes replacement and retains the existing retry/verification controls. Retrying never creates a fresh batch; **Check existing task batch** only reads evidence. Unchanged matching evidence can confirm the existing batch, while missing or changed evidence stays locked.

## Validation scope

`tests/ai-context-external-tasks.test.js` exercises the real controller/store and a synthetic DOM. It covers parser limits and dangerous extra keys, literal markup/URLs, manual provenance, task subsets and order, preexisting records/recovery/pin, capacity, no writes before confirm, replacement cancellation, async draft/workspace/lifetime fences, repeated confirm and write-before/write-after/readback failures. Both English and Chinese labels are included.

Run the focused suite with:

    node --test tests/ai-context-external-tasks.test.js tests/ai-context.test.js tests/ai-context-view.test.js tests/ai-context-prompt-reuse.test.js tests/collection-context-handoff.test.js tests/local-tasks-batch-store.test.js

These tests use synthetic local data and mock transport only. They do not establish native-browser keyboard, layout or clipboard behavior, provider compatibility or a full repository pass. Native acceptance and aggregate release checks are recorded separately.
