# Same-prompt model comparison

Open the Prompt library, select a saved prompt version, fill its variables and choose **Compare models** beside the completed preview. Create connections beforehand with **Run with your model**. Comparison uses those same device-local connection metadata presets and the shared bounded Chat Completions transport.

1. Select one or two connections; both initially default to “Do not send”. Keys are separate optional password inputs. No selection, opening or review starts a request.
2. Choose **Review comparison requests**. Each labeled target shows the full normalized HTTPS endpoint, model ID and exactly the same completed prompt. The review states the maximum request count and separate potential provider charges. Duplicate normalized endpoint/model pairs are rejected.
3. Use each target's **Allow this endpoint** button only if needed. Each permission action requests just its reviewed origin; allowing never sends the prompt.
4. Enter each target's own temporary key and choose **Send reviewed comparison**. There are at most two calls, one per selected target, with no automatic retries. Each request rechecks host permission. Saved connection metadata is re-read before starting calls; edited/deleted selections fail closed.
5. Review the two plain-text results side by side (stacked on narrow screens). One target's failure or Stop does not remove the other's response. Stopping cannot guarantee the provider stops billing already-started work.
6. Explicitly save each desired result to the AI collection. The result records its actual reviewed model/origin and original saved prompt-version reference. Repeated Save is guarded; an uncertain save retries the exact same operation. Nothing edits the prompt or saves a reply automatically.

## Boundaries and privacy

No ambient workspace, other prompt, collection, history or settings are included. The shared transport rejects unsafe endpoints and limits request/response size, timeout and response format. Keys remain in dialog/request memory only, never in presets, collection fields, logs or exports. They are cleared from controls when a request starts, on target changes, interruption and close, and are never copied between targets. Local saved responses may repeat input and enter unencrypted collection/complete backups.

Prompt selection/version/value changes invalidate both reviews and suppress late output. Workspace/restore changes, pagehide and controller disposal fence the comparison. Close discards unsaved results after confirmation. Saving while a source is stale is blocked; permission completion and transport responses are ignored after cancellation or invalidation. Connection changes require a fresh review; comparison currently requires closing and reopening after a send to start another batch.

## Synthetic validation

Focused tests exercise the shipped dialog and shared transport boundary with synthetic DOM and provider fixtures. They cover exact same payload, per-target keys and grants, duplicate targets, one-target batches, denied permission versus success, independent provider failure/cancellation, profile changes after review, workspace switch while permission is pending, prompt epoch changes, pagehide/late result suppression, explicit per-target saves and repeated/uncertain save receipts. They perform no actual grants, real keys, provider calls, billed requests or user-device operations.

    timeout 60 node --max-old-space-size=256 --test tests/ai-model-comparison.test.js tests/ai-model-client.test.js tests/local-prompts-view.test.js

Native extension/provider verification is separate; these synthetic checks do not claim real compatibility, billing behavior or Chrome permission UI validation.
