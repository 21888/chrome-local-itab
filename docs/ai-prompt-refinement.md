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

## Optional original-versus-proposal trial

After a valid refinement arrives, **Test original versus proposal** opens a temporary trial without accepting the proposal. Enter a fresh test value for each variable once. The original saved template and the unsaved proposal use exactly that same mapping and the same endpoint/model chosen for refinement. Previously filled preview values are not copied into the trial.

Review both exact completed outgoing prompts and the full endpoint/model before explicitly sending. This can add up to two provider requests beyond the refinement request; each may cost money. One optional temporary API key is used for both requests and cleared afterward. Endpoint access alone sends nothing. There are no automatic requests, retries, scores or winner selection.

The two answers are independently labeled **Original saved template answer** and **Unsaved proposal answer**. They cannot be saved from this trial, so an unsaved proposal is never represented as a saved template version. Closing clears the trial values and answers and returns to the unchanged proposal. **Accept as new prompt version** remains a separate action with the existing source, history and placeholder checks.

Changing test values clears the prior review and answers. Source/proposal/connection changes invalidate the trial; pending or late responses cannot replace current results. Closing stops pending requests, although already-started work may still be billed.

Synthetic DOM/transport tests cover shared values/model/key, exact previews and cost disclosure, no save/accept side effects, invalid placeholders, edit/review fencing, source refresh during permission checks, connection revalidation, independently failed requests, cancellation, late results and return focus. No real provider calls, keys, grants, billing or user data are used. Native-browser layout has not been verified for this addition.
