# Reviewed direct-model workflow

The prompt library can run a completed saved prompt with a user-selected OpenAI-compatible Chat Completions HTTPS endpoint. This extends the existing prompt → reusable variables → saved AI results workflow. No provider is selected by default. No model runs on startup, input, review, permission approval or workspace switch.

1. Select a saved prompt and fill its variables, then choose **Run with your model**.
2. Enter the full HTTPS `/chat/completions` endpoint and model ID. Enter a key only if required by that provider. The key is held only in the dialog, cleared when its endpoint/model or connection preset changes, after each send, on dismissal and on page departure; it is never written to extension storage, Sync, ordinary backups or logs.
3. **Review request** displays the full final URL, model and exact single user-message text. No collection, workspace, browsing history, notes, tools or system messages are automatically attached.
4. **Allow this endpoint** requests only that reviewed HTTPS hostname and port, not every website. This step alone never sends a model request. Chrome manages revocation through extension site-access settings. The optional manifest declaration allows arbitrary HTTPS provider selection; it is not an install-time grant. Wildcard hostnames, embedded credentials, query parameters, fragments and non-HTTPS addresses are rejected.
5. **Send reviewed prompt** sends one POST, without browser cookies, cache or referrer. Redirects are rejected so Authorization cannot follow a redirect to another destination. Providers may charge for this request. Stop aborts it but cannot reverse provider work already started or billing.
6. Inspect the plain-text response, then explicitly **Save response to AI collection**. The collection entry links to the exact saved prompt body version and is searchable/comparable through existing collection features. Filled variables are not separately saved; responses may repeat them. Saved responses join the existing unencrypted local backup format. Saving is protected by the existing collection/workspace/complete-restore transaction fence and a current prompt-reference check. Failed verification retries the same operation, avoiding duplicate results.

## Limits and compatibility

- One foreground request per dialog; no background calls, auto-retry, agent tools or automatic save.
- HTTPS Chat Completions format: `{model, messages: [{role: "user", content}], stream: false}`. Non-streaming remains the default. The single-prompt runner also offers the explicitly reviewed optional streaming mode described below.
- Input and result are each limited to 32,000 UTF-16 code units; response wire body to 512,000 bytes; request deadline 60 seconds.
- Non-JSON, empty, oversized, incomplete and filtered responses are rejected without saving. Provider error bodies and raw network errors are never displayed or logged.
- A non-streaming answer must explicitly report `finish_reason: "stop"`. Missing, null, empty or false-like completion markers are rejected, as are length, filtering and tool/function finishes. Nonempty `message.tool_calls`, `message.function_call` or `message.refusal` also reject a mixed text response even if it says `stop`. Missing/null optional metadata and empty arrays, objects or strings remain accepted; unrelated response metadata is not subject to new schema restrictions. This closes a result-completeness/save-gate gap, not a credential leak or tool-execution vulnerability. The application never executes returned tools.
- Nonstandard compatible-provider proxies that omit the final `stop` marker now fail closed. They must supply that completion evidence before results can enter the run, comparison, refinement or context save workflows. A complete HTTP/JSON body by itself does not establish answer completion.
- No model list discovery, persistent key vault, HTTP localhost endpoints, parallel provider comparison or automated prompt optimization in this first increment.
- All UI, transport and persistence tests use synthetic fixtures. No real provider, paid model, credentials or browser permission grants were used. Native Chrome permission parsing and a real provider request remain user-controlled verification steps.

## Validation

Focused command: `timeout 60 node --max-old-space-size=192 --test tests/ai-model-client.test.js tests/ai-model-view.test.js`.

Tests cover exact endpoint scope, wildcard rejection, denied permissions, request preview/send separation, duplicate clicks, redirects configuration, omitted cookies/referrer, credential clearing, opaque error messages, response bounds, cancellation/late responses, pagehide invalidation, explicit result save and idempotent retry.

Official API references checked on 2026-10-11:
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

The [official Chat Completions response schema](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) was rechecked on 2026-10-12: the non-streaming choice has a non-optional completion-reason enum; null completion markers are used by intermediate streaming chunks, not by a completed non-streaming choice. Synthetic client and context-controller tests cover rejection before local persistence/JSON/Markdown export, plus successful explicit saving with normal null optional metadata. No real provider requests or credentials were used.

## Device-local connection presets

Both **Run with your model** and **Ask your saved context** share the same connection presets. Choose a preset, or leave **New / unsaved connection** selected and enter a name, full HTTPS endpoint and model ID. **Save connection preset** explicitly saves those three fields; selecting an existing preset lets you edit/rename it and explicitly save, or delete it. At most 30 presets are stored, with unique names up to 80 characters. Nothing is selected automatically when reopening either entry point.

The password/API-key field is never passed to preset storage. Do not put credentials or other secrets in preset names, endpoint paths or model IDs: these metadata fields are stored as unencrypted local text. The endpoint rejects embedded credentials, query parameters and fragments. Presets contain no sources, prompts, responses, permission grants or API keys from the password field.

Presets are intentionally device-local connection preferences, excluded from manual exports, complete backups, workspace copies and sync. A backup restore preserves the destination device's presets; it does not import, clear or grant access to connections. Recreate presets manually on another device. Explicit Save/Delete is protected by a cross-tab lock; stale edits are rejected rather than overwriting newer values. Use **Reload saved connections** to refresh after a conflict without closing the dialog. Reload changes only the device-local list: it preserves current fields, request review, question/source edits and any response, and never applies a connection or sends a request. If the selected saved record changed or disappeared, the current fields become an unsaved/manual connection; explicitly select the latest record to apply it. An unchanged saved record stays selected even if its fields have local edits. A failed reload leaves the list and draft unchanged and can be retried, including after an initial read failure. Reload is unavailable during transport, permission requests and pending or uncertain saves; results arriving after edits, hiding or closing are ignored. Invalid stored data is not silently overwritten; manual connection entry remains available if preset loading fails.

Selecting, saving or deleting a connection, or editing its endpoint/model, clears the key and invalidates the request review. Always review the exact endpoint, model and outgoing text again, then separately allow the endpoint if needed and press Send. Preset selection does not select Q&A sources or alter the task/question. No preset action makes a network call or requests permission.

Focused preset validation: `timeout 60 node --max-old-space-size=256 --test tests/ai-model-presets.test.js tests/ai-model-view.test.js tests/ai-context-view.test.js tests/complete-backup.test.js`.

## Refine a saved template

Use **Refine saved prompt** to review an instruction and the current stored template, receive a plain-text proposal, then explicitly accept a new history version. Filled variables are excluded and placeholder changes block acceptance. [Refinement workflow and safeguards](ai-prompt-refinement.md).

## Optional streamed single-prompt response

In **Run with your model**, **Show response as it arrives (optional)** starts unchecked every time the dialog opens. It is temporary UI state, never a preset or backup field. Change it before **Review request**: review shows either streaming or complete-response mode, and changing the checkbox clears the key and invalidates that review. **Send reviewed prompt** captures the reviewed mode, exact endpoint, model and prompt in one POST. There is no fallback, retry, second request or new permission. Refinement, comparisons, refinement trials and saved-context Q&A keep their existing non-streaming behavior.

Streaming sends the same Chat Completions body with `stream: true`, accepting only `text/event-stream`. The reader incrementally decodes UTF-8 and SSE (including fragmented code points, CRLF, multi-line data and comments), taking only choice zero's plain-text `delta.content`. An explicit `finish_reason: "stop"` followed by `data: [DONE]` is required before it becomes a complete result. EOF, malformed/error events, tool/refusal results, non-stop finishes and exceeded limits never create a saveable response. Usage-only events do not affect the answer. Provider error text is never displayed.

The whole request, including stalled response headers or body reads, keeps the 60-second deadline. Limits remain 512,000 wire bytes and 32,000 output UTF-16 code units, with an additional 65,536-character SSE event budget (including comments and fields). These defensive limits can reject unusually verbose compatible-provider streams. The stream reader is cancelled after completion, failure or Stop.

Partial text is shown in a read-only textarea, not interpreted as HTML, and marked explicitly as incomplete. It cannot be saved. Updates are coalesced to at most one scheduled textarea paint per 100 ms, with a final immediate flush on success, failure or Stop. Successful completion alone enables the existing explicit collection save; no schema or storage fields change. Stop clears the key and leaves any received partial text labelled as incomplete. Closing, page departure, source changes or workspace interruption clear/invalidate stream state; scheduled paints and late old callbacks cannot overwrite a newer request. Saving rechecks the source.

Focused synthetic validation (run serially, no provider calls or credentials):

- `timeout 60 node --max-old-space-size=256 --test --test-concurrency=1 tests/ai-model-client.test.js tests/ai-model-stream.test.js`
- `timeout 60 node --max-old-space-size=256 --test --test-name-pattern='stream:' tests/ai-model-view.test.js`
- Existing model-view, context and comparison suites retain their non-streaming coverage. This does not certify native browser/provider compatibility.

Protocol references checked on 2026-10-12:
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events
- https://developers.openai.com/api/docs/guides/streaming-responses
