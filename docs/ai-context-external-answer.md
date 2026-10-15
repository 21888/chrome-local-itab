# Review and save a manually pasted external answer

## Workflow and scope

In **AI context Q&A**, leave the mode on **Answer**, open **Review external answer**, paste plain text and choose **Load answer for review**. No question, source selection or connection is required. Inspect the read-only loaded original, enter a title, then separately choose **Save loaded answer to global AI collection**.

This closes the local-prompt workflow without leaving the workbench: review/copy a local prompt, use your chosen external service yourself, then bring its answer back for explicit review and saving. The existing collection library's manual capture remains available. There is no clipboard read, file import, provider request, endpoint grant or automatic saving. Text that looks like task JSON remains literal answer text in Answer mode. Choose Tasks and explicitly load it to use the separate task workflow.

Answer and Tasks reuse the same disclosure and paste field; switching modes preserves the unparsed draft. Typing there never changes a previously loaded response. Save acts only on the loaded original, even when a different unparsed draft is present. The loaded answer is read-only. The existing safe reader may format it locally; HTML, links and images remain text, without navigation or fetching. Whole-answer copying and collection export/save retain the loaded original, not the rendered Markdown.

## Limits, title and honest origin

- The complete answer must be nonempty valid Unicode and at most 32,000 UTF-16 units; some emoji count as two. The existing collection multiline control-character restrictions also apply: tabs and line breaks are allowed, unsupported controls such as NUL are rejected before loading.
- There is no textarea `maxlength`, trimming, truncation or automatic JSON interpretation. An over-limit or invalid paste remains complete in the input for repair, and the previous response stays unchanged.
- The controller preserves its exact input, including CRLF. Native textarea paste/value handling may normalize line endings before the controller receives the text. This feature cannot recover original clipboard line endings that the browser already normalized.
- The title is user-visible save metadata. A successful manual load clears any automatically suggested title from an unrelated provider question; an explicitly typed title is preserved for the user's review. Invalid or canceled loading preserves the old title. Invalid single-line title characters are refused before a save command exists, so the title can be corrected.
- Manual results have no request review, verified provider, model, endpoint, question or excerpt lineage. Saving uses empty tool/source URL fields, no prompt link, and a note that the answer was manually pasted and its origin/model/source references are unverified. The record uses the existing answer schema.
- Manual answers have no question/source snapshot option. A programmatic `includeContext: true` is explicitly rejected before workspace checks or command creation, including when retrying an earlier save; it is never silently omitted.

## Privacy, storage and interrupted work

The disclosure and loaded-response explanation warn before saving that the full text joins the existing **global AI collection** and unencrypted local backups. It is cross-workspace library content, not a workspace-local collection. Review the text for private information first; claims inside an answer are not verified evidence.

Loading writes nothing. Save reuses the existing collection command, lock, capacity validation, receipt and readback verification. Existing records, old answer versions, archived items and recovery copies stay unchanged. Capacity refusal writes nothing and preserves the loaded answer, title and unparsed draft; it does not silently shorten or drop text. A workspace/session change invalidates the operation rather than redirecting a queued save.

Replacing an unsaved response or incomplete answer requires confirmation. Cancel preserves the previous result, title, task selection/review, snapshot choice and pasted draft. Draft edits during confirmation or an asynchronous workspace check invalidate that load. Question, connection, source, selection, mode, paste, visibility and lifetime fences prevent late callbacks from replacing newer work. Existing invalid-task-edit protection is unchanged.

An uncertain save keeps the exact operation while this panel remains open. Load, reset and edits stay locked; retry uses the same command, title and body. **Check earlier save** reads receipt evidence without writing. Missing or unreadable evidence leaves the operation locked. A successful receipt confirms the historical save, not that the record could never have been edited or removed afterward.

Closing follows the existing host behavior: active local saves block normal dismissal; explicit confirmed discard or page departure ends the volatile session, clears input/results and does not provide a persistent retry draft. A write already committed remains saved. Check the global collection before manually starting a new save after an uncertain session has been discarded.

## Validation scope

`tests/ai-context-external-answer.test.js` uses synthetic local data and real controller/store code with a DOM model. It covers full UTF-16/Unicode/control limits, exact raw text and export, manual-only metadata, early context/title refusal, replacement cancellation, incomplete answers, draft/lifetime/workspace fences, safe preview, explicit copying, duplicate save, actual record/byte capacity, old global data retention, before/after/readback failures and read-only verification. One copy test explicitly models LF normalization of the displayed textarea; this is not a native browser paste or clipboard test.

The existing external-task test changes one presentation expectation: the shared disclosure is also visible in Answer mode. Task parsing, selection, editing, review and confirmation stay separate.

Focused command:

    node --test tests/ai-context-external-answer.test.js tests/ai-context-external-tasks.test.js tests/ai-context-task-edit.test.js tests/ai-context.test.js tests/ai-context-view.test.js tests/ai-context-prompt-reuse.test.js tests/collection-context-handoff.test.js

No real provider, credential, paid service, native-browser acceptance or full repository/release check is claimed by this focused suite. No permission, persistence key, storage schema or version changes are part of this feature.
