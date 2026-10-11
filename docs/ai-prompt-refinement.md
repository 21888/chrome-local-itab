# Reviewed prompt refinement

In the prompt library, choose a saved prompt and **Refine saved prompt**. This refines the **current saved template**, even if the completed-preview section is showing another historical version. Filled variable values, source excerpts, history, and other prompts are excluded.

1. Enter a refinement instruction and choose or enter your model connection. Connection presets save only device-local metadata; the API key remains temporary.
2. Review the exact destination/model and full outbound text. The request contains a fixed plain-text/placeholder-preservation instruction and JSON with your instruction and stored template. Nothing sends on open, preset selection, review, or permission grant.
3. Allow the endpoint if necessary, then explicitly send. Your chosen provider may charge. Existing transport limits, timeout, cancellation, and temporary-key clearing apply.
4. Compare **Before: current saved template** with **After: proposed template**. The response is untrusted plain text, never rendered as HTML or executed.
5. Choose **Accept as new prompt version** to save. The original remains in history. Closing discards an unsaved proposal. No automatic application, follow-up request, or save occurs.

Acceptance rejects removed, changed, or restored sources. Both source body and immutable body-version ID are checked again inside the existing prompt-store lock alongside the record version. A stale dialog requires reopening. Exact placeholder spelling/count and parsed active-placeholder semantics must survive; introducing/removing placeholders or escaping a live variable prevents acceptance. Identical output creates no version. The existing history limit is respected and is never bypassed by automatically making a copy.

An uncertain save retries the same command/receipt. Do not assume an uncertain save failed; inspect the prompt history if leaving the dialog. Model output can still be wrong or change the meaning of ordinary prose: review it before accepting. Saved versions are local and included in unencrypted prompt backups. No real provider requests are used by the automated tests.

Navigating away/page hiding discards any unsaved refinement proposal and invalidates request review. Returning from the browser cache requires a new review and request; an old proposal cannot be accepted. Any already-started uncertain local write retains its original receipt in the existing controller retry flow.
