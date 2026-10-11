# Reviewed AI context and task drafts

Open **AI context Q&A** from the new-tab navigation. This workflow reuses the direct-model client's user-chosen HTTPS Chat Completions endpoint. It adds no provider, permission, storage key, backup module or schema beyond the separately reviewed model workflow.

## What can be selected

- Active saved AI collection bodies, explicitly labeled **global collection**: these are existing cross-workspace library records, not workspace-local copies.
- The **saved workspace note** from the current pinned workspace session. Unsaved editor text is not included.
- No source is selected by default. No browsing, URL fetching, source-page scraping, clipboard reads, hidden collection annotations, archive/recovery records or other workspace notes are included.
- Excerpts are volatile snapshots. Selecting one reveals its outgoing editable text; unchecking removes it. Editing an excerpt never edits the saved original. Saved sources changing later do not silently replace the exact reviewed excerpt.

## Exact outbound review

Enter the endpoint, model, optional key and question; choose **Answer** or **Draft tasks for review**. **Review exact request** shows the complete endpoint URL, model and complete request text, including the mode instruction and JSON-encoded source IDs, labels and excerpts. IDs and labels are untrusted data, not executable instructions. Editing the question, target, mode or selected excerpts invalidates the review. The endpoint changes clear the key.

**Allow this endpoint** requests only the reviewed endpoint's origin using the common client permission contract. Approval does not send a request. **Send reviewed request** verifies access, then makes one foreground request with no automatic retry. Providers may charge. Stop aborts the request, but cannot undo work or charges already incurred. Responses are literal plain text, without HTML, Markdown links, code execution or verified-provenance styling. A model may invent source references: displayed claims and citations are not verified evidence.

Limits: 12 excerpts, 16,000 UTF-16 units per excerpt, 4,000 for the question, 32,000 for the complete outgoing prompt or response. Requests exceeding any bound fail rather than silently truncate. The common client's bounded response parser, redirects/cookie restrictions, 60-second deadline and exact endpoint validation remain unchanged.

## Saving answers and tasks

**Save answer to AI collection** explicitly adds the full reply to the existing global collection store. It does not copy source bodies into a parallel store or assert that model citations are verified. The answer may repeat private input and joins existing unencrypted local backups. No prompt-version reference is fabricated for a context question. Failed or uncertain save acknowledgement retains the immutable command for an explicit idempotent retry.

Task generation does not write anything. The response must be exactly a JSON object with one `tasks` array of 1–50 nonempty, single-line strings, each at most 1,000 UTF-16 units. Extra keys, objects, code fences, malformed JSON and multiline values fail closed. Users can edit the JSON; edits invalidate the task review. **Review extracted tasks** uses the existing task store's full-state batch validator and shows every exact task in order, including duplicates and literal markup. **Add these tasks** is the sole task write action, using the existing atomic batch path and existing capacities. Tasks are never executed.

The task-store API accepts an optional synchronous, ephemeral pre-write guard under its existing lock, after exact receipt recognition. Context confirmation uses it to reject a newer task revision or superseded draft. Existing task callers retain their behavior. A confirmed receipt retry never appends twice. A pristine revision conflict requires another review. Uncertain read/write/verify errors retain the identical command; if a later mutation makes its receipt conflict, the original identities stay fenced and a new review is blocked. The user is told the earlier tasks may already exist and to inspect Tasks before proceeding. All context stores use the existing workspace fence; a closed or replaced session cannot initiate a queued new save. A write already committed cannot be undone by closing.

## Dismissal and lifecycle

The new-tab dialog uses the existing focus trap and IME-aware Escape behavior. Closing restores the entry's focus. Unsaved responses prompt before discard; pending saves block dismissal. Cancel clears volatile source selection and draft text without saving. Workspace departure/reload guards include the open panel and active work. Page departure aborts outstanding network work, clears the key and invalidates callbacks; it does not save drafts automatically. Nothing here stores a key, provider setting or private context snapshot.

## Verification and limits

Focused synthetic store/controller/UI-model tests cover opt-in selection, exact outgoing text, text-safe responses, permission/send separation, edited extraction review, Cancel with zero writes, strict task JSON, repeated confirmation, uncertain receipt retries, newer task revisions, workspace changes, late results, key clearing, dialog focus restoration and IME Escape. Existing batch-store tests remain applicable. Tests use mock transport and synthetic content only; no real credential, provider request, paid platform, browser grant or personal data was used.

Native Chrome layout, actual permission prompts and real model behavior are not verified by these model tests. User-chosen provider availability and output quality are not guaranteed.

Focused commands:

    timeout 60 node --max-old-space-size=256 --test tests/ai-context.test.js tests/ai-context-view.test.js tests/local-tasks-batch-store.test.js
    python3 -m unittest discover -s tests -p 'package_extension_test.py'

## Reusable device-local connections

The Q&A panel and prompt model dialog share explicit connection presets (name, HTTPS endpoint and model ID only). Select, edit, Save or Delete a preset; this clears the API-key field and invalidates the reviewed request without selecting sources or sending anything. Each request still requires reviewing the exact receiver and content before Send. Presets are unencrypted device-local metadata, excluded from backups and sync and preserved on the destination during restore. Never put secrets in preset metadata. See [connection preset behavior and limits](ai-model-workflow.md#device-local-connection-presets).
