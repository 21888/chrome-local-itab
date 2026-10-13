# Reviewed prompt refinement

In the prompt library, choose a saved prompt and **Refine saved prompt**. This refines the **current saved template**, even if the completed-preview section is showing another historical version. Filled variable values, source excerpts, history, and other prompts are excluded.

1. Enter a refinement instruction and choose or enter your model connection. Connection presets save only device-local metadata; the API key remains temporary.
2. Review the exact destination/model and full outbound text. The request contains a fixed plain-text/placeholder-preservation instruction and JSON with your instruction and stored template. Nothing sends on open, preset selection, review, or permission grant.
3. Allow the endpoint if necessary, then explicitly send. Your chosen provider may charge. Existing transport limits, timeout, cancellation, and temporary-key clearing apply.
4. Choose **Compare template text differences** to inspect the current saved template against the exact unsaved proposal. Edit the draft locally, including repairing invalid placeholders, without making another provider request. The original model response remains available in a separate read-only disclosure. Both are untrusted plain text, never rendered as HTML or executed.
5. Choose **Accept as new prompt version** to save. The original remains in history. Closing discards an unsaved proposal. No automatic application, follow-up request, or save occurs.

Acceptance rejects removed, changed, or restored sources. Both source body and immutable body-version ID are checked again inside the existing prompt-store lock alongside the record version. A stale dialog requires reopening. Exact placeholder spelling/count and parsed active-placeholder semantics must survive; introducing/removing placeholders or escaping a live variable prevents acceptance. Identical output creates no version. The existing history limit is respected and is never bypassed by automatically making a copy.

Editing never sends, saves, or accepts anything. Each edit revalidates the exact placeholder spelling/count and active-placeholder semantics; invalid, empty, oversized, or unchanged drafts cannot be tested or accepted.

An uncertain save locks the exact submitted draft and retries the same command/receipt; editing and trial are unavailable while its outcome is unresolved. Do not assume an uncertain save failed; inspect the prompt history if leaving the dialog. Model output can still be wrong or change the meaning of ordinary prose: review it before accepting. Saved versions are local and included in unencrypted prompt backups. No real provider requests are used by the automated tests.

Navigating away (`pagehide`) discards any unsaved refinement proposal and invalidates request review. Returning from the browser cache requires a new review and request; an old proposal cannot be accepted. Any already-started uncertain local write retains its original receipt in the existing controller retry flow.

## Read-only template differences

The explicit comparison groups **− Removed from saved template**, **+ Added in
draft** and **= Unchanged** lines. It compares the current saved template captured
when refinement opened with the current proposal, not an older selected history
version, a filled preview, or the original model reply after the draft is edited.
No request, permission grant, clipboard write or save occurs. These are literal
text differences, not a quality score or confirmation that variables are valid.
Completed drafts with broken placeholders, empty drafts and identical drafts can
be inspected; their existing trial/acceptance restrictions still apply.

CRLF, CR, LF and final newlines remain part of exact comparison and acceptance.
Separate line-ending counts expose otherwise invisible changes. Native textarea
display normalization never replaces an unedited model response; intentional
editing uses the resulting draft text. Trials retain that same exact proposal.
The existing bounded line comparator caps its LCS table at 250,000 cells; large
changes disclose that only common beginning and ending lines are matched, with
the middle shown as removed/added blocks. Drafts over the 32,000-character limit
cannot open comparison.

Each edit clears the comparison, even when edited back to previous text. Source
refresh, source changes, editor navigation, failed reads, document hiding, trial
opening, acceptance, pagehide and Close also clear it. Returning from a hidden
tab or closing a trial never rebuilds comparison automatically. The draft stays
available after a simple tab switch. Pending, failed, stopped or late requests
cannot expose comparison. Pending or uncertain acceptance disables comparison
without changing its locked draft or retry operation.

Synthetic tests cover exact reconstruction, native textarea normalization,
localized controls, literal HTML, Unicode, variable isolation, empty/invalid
drafts, bounded maximum-length comparison, edited snapshots, interrupted focus,
source/read invalidation, hidden/trial/close lifecycle, and uncertain retry.
No real provider, key, grant, billing or user data is used. Native visual and
keyboard acceptance is tracked separately.

The final feature candidate, based on 1.1.125, passed 3,121/3,121 Node tests with
strict unhandled rejections, serial execution and a 1 GiB heap, plus 84/84 Python
tests. All JavaScript syntax, locale/manifest JSON, whitespace and the unchanged
123-file runtime inventory passed. The development ZIP retains manifest 1.1.125;
its SHA-256 is `c41b0cd8258550dad8f9d0c763836aaeef64081d9c7fea4b2acd1b64a07a60c9`.
These automated results do not establish a published release or real-provider
acceptance.

## Optional original-versus-proposal trial

After a valid refinement arrives or its draft is repaired locally, **Test original versus proposal** opens a temporary trial without accepting the proposal. Enter a fresh test value for each variable once. The original saved template and the unsaved proposal use exactly that same mapping and the same endpoint/model chosen for refinement. Previously filled preview values are not copied into the trial.

Review both exact completed outgoing prompts and the full endpoint/model before explicitly sending. This can add up to two provider requests beyond the refinement request; each may cost money. One optional temporary API key is used for both requests and cleared afterward. Endpoint access alone sends nothing. There are no automatic requests, retries, scores or winner selection.

The two answers are independently labeled **Original saved template answer** and **Unsaved proposal answer**. They cannot be saved from this trial, so an unsaved proposal is never represented as a saved template version. The proposal editor is read-only while a trial is open, including during requests. Closing clears the trial values and answers and returns to the exact proposal tested. Editing afterward requires a fresh trial to see answers for the new draft; old answers are never retained. Acceptance saves exactly the current edited draft. **Accept as new prompt version** remains a separate action with the existing source, history and placeholder checks.

Changing test values clears the prior review and answers. Source/proposal/connection changes invalidate the trial; pending or late responses cannot replace current results. Closing stops pending requests, although already-started work may still be billed.

Synthetic DOM/transport tests cover shared values/model/key, exact previews and cost disclosure, no save/accept side effects, invalid placeholders, edit/review fencing, source refresh during permission checks, connection revalidation, independently failed requests, cancellation, late results and return focus. No real provider calls, keys, grants, billing or user data are used. Editable-draft coverage also includes local-only edits, invalid-placeholder repair, exact edited trial/acceptance text, post-trial edits, in-flight edit freezing, stale source protection, uncertain-save retry locking, and Close/pagehide behavior. Native-browser layout has not been verified for this addition.
