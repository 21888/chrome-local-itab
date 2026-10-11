# Reviewed AI context and task drafts

Open **AI context Q&A** from the new-tab navigation. This workflow reuses the direct-model client's user-chosen HTTPS Chat Completions endpoint. It adds no provider, permission, storage key or backup module; the optional answer snapshot described below extends collection records with reviewed historical input.

## What can be selected

- Active saved AI collection bodies, explicitly labeled **global collection**: these are existing cross-workspace library records, not workspace-local copies.
- The **saved workspace note** from the current pinned workspace session. Unsaved editor text is not included.
- No source is selected by default. No browsing, URL fetching, source-page scraping, clipboard reads, hidden collection annotations, archive/recovery records or other workspace notes are included.
- Selected excerpts remain temporary unless you explicitly save the optional question/source snapshot with an answer. Selecting one reveals its outgoing editable text; unchecking removes it. Editing an excerpt never edits the saved original. Saved sources changing later do not silently replace the exact reviewed excerpt.

## Exact outbound review

Enter the endpoint, model, optional key and question; choose **Answer** or **Draft tasks for review**. **Review exact request** shows the complete endpoint URL, model and complete request text, including the mode instruction and JSON-encoded source IDs, labels and excerpts. IDs and labels are untrusted data, not executable instructions. Editing the question, target, mode or selected excerpts invalidates the review. The endpoint changes clear the key.

**Allow this endpoint** requests only the reviewed endpoint's origin using the common client permission contract. Approval does not send a request. **Send reviewed request** verifies access, then makes one foreground request with no automatic retry. Providers may charge. Stop aborts the request, but cannot undo work or charges already incurred. Responses are literal plain text, without HTML, Markdown links, code execution or verified-provenance styling. A model may invent source references: displayed claims and citations are not verified evidence.

Limits: 12 excerpts, 16,000 UTF-16 units per excerpt, 4,000 for the question, 32,000 for the complete outgoing prompt or response. Requests exceeding any bound fail rather than silently truncate. The common client's bounded response parser, redirects/cookie restrictions, 60-second deadline and exact endpoint validation remain unchanged.

## Saving answers and tasks

**Save answer to AI collection** explicitly adds the full reply to the existing global collection store. By default it saves no question or source snapshot and does not assert that model citations are verified. The answer may repeat private input and joins existing unencrypted local backups. No prompt-version reference is fabricated for a context question. Failed or uncertain save acknowledgement retains the immutable command for an explicit idempotent retry.

Task generation does not write anything. The response must be exactly a JSON object with one `tasks` array of 1–50 nonempty, single-line strings, each at most 1,000 UTF-16 units. Extra keys, objects, code fences, malformed JSON and multiline values fail closed. Users can edit the JSON; edits invalidate the task review. **Review extracted tasks** uses the existing task store's full-state batch validator and shows every exact task in order, including duplicates and literal markup. **Add these tasks** is the sole task write action, using the existing atomic batch path and existing capacities. Tasks are never executed.

The task-store API accepts an optional synchronous, ephemeral pre-write guard under its existing lock, after exact receipt recognition. Context confirmation uses it to reject a newer task revision or superseded draft. Existing task callers retain their behavior. A confirmed receipt retry never appends twice. A pristine revision conflict requires another review. Uncertain read/write/verify errors retain the identical command; if a later mutation makes its receipt conflict, the original identities stay fenced and a new review is blocked. The user is told the earlier tasks may already exist and to inspect Tasks before proceeding. All context stores use the existing workspace fence; a closed or replaced session cannot initiate a queued new save. A write already committed cannot be undone by closing.

## Dismissal and lifecycle

The new-tab dialog uses the existing focus trap and IME-aware Escape behavior. Closing restores the entry's focus. Unsaved responses prompt before discard; pending saves block dismissal. Cancel clears volatile source selection and draft text without saving. Workspace departure/reload guards include the open panel and active work. Page departure aborts outstanding network work, clears the key and invalidates callbacks; it does not save drafts automatically. Nothing saves an API-key field or authentication header. Private context snapshots are saved only by the explicit answer-save option below; nothing is persisted merely by selecting, reviewing or sending.

## Verification and limits

Focused synthetic store/controller/UI-model tests cover opt-in selection, exact outgoing text, text-safe responses, permission/send separation, edited extraction review, Cancel with zero writes, strict task JSON, repeated confirmation, uncertain receipt retries, newer task revisions, workspace changes, late results, key clearing, dialog focus restoration and IME Escape. Existing batch-store tests remain applicable. Tests use mock transport and synthetic content only; no real credential, provider request, paid platform, browser grant or personal data was used.

Native Chrome layout, actual permission prompts and real model behavior are not verified by these model tests. User-chosen provider availability and output quality are not guaranteed.

Focused commands:

    timeout 60 node --max-old-space-size=256 --test tests/ai-context.test.js tests/ai-context-view.test.js tests/local-tasks-batch-store.test.js
    python3 -m unittest discover -s tests -p 'package_extension_test.py'

## Reusable device-local connections

The Q&A panel and prompt model dialog share explicit connection presets (name, HTTPS endpoint and model ID only). Select, edit, Save or Delete a preset; this clears the API-key field and invalidates the reviewed request without selecting sources or sending anything. Each request still requires reviewing the exact receiver and content before Send. Presets are unencrypted device-local metadata, excluded from backups and sync and preserved on the destination during restore. Never put secrets in preset metadata. See [connection preset behavior and limits](ai-model-workflow.md#device-local-connection-presets).

## Optional historical question/source snapshot

After an answer arrives, **Also save this exact question and reviewed source excerpts** is OFF by default. Selecting it shows the exact JSON that the answer-save action will retain: question, reviewed edited source IDs/labels/text, exact full reviewed prompt, canonical endpoint and exact model. It copies the immutable reviewed request without rereading originals. The preview warns that this may contain private information or secrets supplied in the text; inspect it before saving. API-key fields and authentication headers are never copied. Clearing or editing the request resets the choice.

The snapshot belongs to the first saved answer body version. Collection detail displays that version ID and the historical payload as plain text. It remains unchanged after answer revisions and after source edits, archival or deletion; it does not claim that a later edited answer was generated from that request. Source IDs and labels identify reviewed input. Answer citations remain unverified model claims. Imported metadata is user-provided, not cryptographic proof of model output. No automatic reuse, source resolution, fetching or model request is added.

The optional creation-only `contextSnapshot` record field uses schemaVersion 1 and exactly `question`, `sources`, `endpoint`, `model`, `prompt`. Bounds are no looser than the request: 4,000 UTF-16 question units, 12 sources, 300/200/16,000 units for source ID/label/text, 120 for model, 2,048 for endpoint, 32,000 for the exact prompt, and a separate 128 KiB UTF-8 serialized snapshot ceiling. The structured input must exactly match the prompt's JSON suffix. Collection storage still has its existing 2 MiB total ceiling and reserve. Overflow refuses the complete write without trimming any text or silently dropping the snapshot. An explicit subsequent uncheck can save only the answer if that fits. Uncertain saves instead retain the identical operation and scope; users are directed to inspect the global collection before starting another save.

Legacy records and snapshot-free backups retain their original shape. The optional metadata round-trips through collection JSON and full backups, including recovery. It is intentionally included even when attribution source URLs are omitted: that option does not redact text or historical endpoint URLs. Older extension versions reject records with this new optional field instead of silently discarding it; update the extension before restoring such backups. Same-record restore cannot replace the snapshot or rebind it to a different original answer version. Standalone saved-item Markdown continues to exclude the historical snapshot.

Focused synthetic coverage adds exact edited-source retention, default-off save scope, text-safe preview, source changes/removal, immutable body-version association, forged import refusal, strict field/credential-URL rejection, actual 128 KiB and near-2 MiB refusal, answer-only retry after a definite capacity refusal, uncertain/interleaved receipts, and complete-backup restore. Test fixtures contain synthetic text only.
