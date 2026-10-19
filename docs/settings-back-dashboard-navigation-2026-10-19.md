# Protected Settings: safe same-page Back navigation

## Reproduction

The Back to Dashboard button was bound only after ordinary Settings initialization succeeded. A prepared restore or structural protection failure left the visible button without a handler. Repeated successful initialization also added another listener. Real startup tests reproduced both faults; the previous test logs are retained separately from final validation.

An initial early-binding proposal reused the old active-tab query. Review identified an existing risk: an asynchronous active/current-window lookup could select another tab. The final design removes that route entirely. It navigates the current page using a relative `newtab.html` URL and preserves the captured workspace identity, falling back only to the Session's already validated requested identity. It neither queries nor updates any browser tab, selects a workspace, nor guesses Default.

## Departure guard

An intermediate synthetic cloud-browser check demonstrated actual same-tab navigation. However, after inspecting a pending restore, the browser/tool did not display a cancellable beforeunload prompt and left the page. That check is not counted as successful draft protection; its cause is unknown.

The final Back handler therefore refuses navigation while Settings initialization, a lifecycle operation, a busy complete-backup read, an open review or any reported draft is present. A localized message tells the user to finish the action, cancel the review or handle the draft first. Only a clean, settled page can use Back. This handler does not confirm, discard, save, set `allowDeparture`, or retire a review. Existing beforeunload handling remains available for other departure methods, subject to the browser's own behavior.

Binding is idempotent by button node and occurs before the first initialization await. Ordinary settings and their storage protections are unchanged. This navigation fix does not diagnose or repair the reported 1.1.71 upgrade data-loss incident; version and Release/store gates remain unchanged.

## Validation

- Real Settings startup focused tests: 26/26 passed. A separate test-only removal of the final click guard produced four failures (22/26 passed); this is a mutation check, not an old-HEAD result. Earlier reproduction logs remain separate.
- The test DOM initially omitted the actual category editor container and Add button, leaving the production category baseline unset. Adding those real elements lets production initialization establish the baseline; no lifecycle checks were stubbed or relaxed.
- Blocking Back adds no storage/provider calls or navigation requests. Cancelling the review, returning a draft to its baseline, or settling the operation allows one same-page request per click. Initialization itself is not asserted to perform zero I/O.
- Native dot-cloud Chromium, synthetic page-memory fixture: Inspect → Back kept the same Settings URL and review controls, showing the localized refusal. Cancel review → Back navigated the same tab to `newtab.html?workspace=work`. No restore or download was requested. The destination preview resets its fixture and showed the existing missing-bundle protection; this does not establish successful data recovery.
- All 138 production runtime file hashes matched the frozen native-preview server. The only subsequent runtime change was an explanatory comment: exact reverse-byte replacement reproduces that native-preview hash.
- Initial full run: 16,756/16,757 passed; the existing source guard rejected the word `beforeunload` in the new comment. Only that comment was reworded, retaining the original test. Final focused 27/27 and complete serial run 16,757/16,757 passed (0 failures/cancellations). Python 84/84 and the 138-file runtime package also passed.

Synthetic preview tests are not installed-extension upgrade certification.
