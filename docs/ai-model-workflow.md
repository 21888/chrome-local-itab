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
- HTTPS Chat Completions format: `{model, messages: [{role: "user", content}], stream: false}`. This deliberately uses a bounded non-streaming response in this first delivery; token streaming is not implemented.
- Input and result are each limited to 32,000 UTF-16 code units; response wire body to 512,000 bytes; request deadline 60 seconds.
- Non-JSON, empty, oversized, incomplete and filtered responses are rejected without saving. Provider error bodies and raw network errors are never displayed or logged.
- No model list discovery, persistent key vault, HTTP localhost endpoints, parallel provider comparison or automated prompt optimization in this first increment.
- All UI, transport and persistence tests use synthetic fixtures. No real provider, paid model, credentials or browser permission grants were used. Native Chrome permission parsing and a real provider request remain user-controlled verification steps.

## Validation

Focused command: `timeout 60 node --max-old-space-size=192 --test tests/ai-model-client.test.js tests/ai-model-view.test.js`.

Tests cover exact endpoint scope, wildcard rejection, denied permissions, request preview/send separation, duplicate clicks, redirects configuration, omitted cookies/referrer, credential clearing, opaque error messages, response bounds, cancellation/late responses, pagehide invalidation, explicit result save and idempotent retry.

Official API references checked on 2026-10-11:
- https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

## Device-local connection presets

Both **Run with your model** and **Ask your saved context** share the same connection presets. Choose a preset, or leave **New / unsaved connection** selected and enter a name, full HTTPS endpoint and model ID. **Save connection preset** explicitly saves those three fields; selecting an existing preset lets you edit/rename it and explicitly save, or delete it. At most 30 presets are stored, with unique names up to 80 characters. Nothing is selected automatically when reopening either entry point.

The password/API-key field is never passed to preset storage. Do not put credentials or other secrets in preset names, endpoint paths or model IDs: these metadata fields are stored as unencrypted local text. The endpoint rejects embedded credentials, query parameters and fragments. Presets contain no sources, prompts, responses, permission grants or API keys from the password field.

Presets are intentionally device-local connection preferences, excluded from manual exports, complete backups, workspace copies and sync. A backup restore preserves the destination device's presets; it does not import, clear or grant access to connections. Recreate presets manually on another device. Explicit Save/Delete is protected by a cross-tab lock; stale edits are rejected rather than overwriting newer values. Reopen the dialog to refresh after a conflict. Invalid stored data is not silently overwritten; manual connection entry remains available if preset loading fails.

Selecting, saving or deleting a connection, or editing its endpoint/model, clears the key and invalidates the request review. Always review the exact endpoint, model and outgoing text again, then separately allow the endpoint if needed and press Send. Preset selection does not select Q&A sources or alter the task/question. No preset action makes a network call or requests permission.

Focused preset validation: `timeout 60 node --max-old-space-size=256 --test tests/ai-model-presets.test.js tests/ai-model-view.test.js tests/ai-context-view.test.js tests/complete-backup.test.js`.
