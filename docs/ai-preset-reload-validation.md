# Reload device-local AI connections

Both context Q&A and the saved-prompt model dialog now expose **Reload saved
connections**. This is an explicit read of the existing device-local preset
store. It makes no provider request, permission request or storage write and
adds no storage format, module, runtime file or extension permission.

The fields, key, question, edited source excerpts, exact request review and
existing response are retained. A selected record is retained only when its
name, URL and model all still match. Otherwise the draft is detached into the
manual/unsaved selection, retaining its current text. Reload never applies the
latest endpoint or resurrects a deleted record. Applying a connection remains
an explicit selection, with the existing key-clearing and review-invalidating
behavior. Explicit future Save remains a separate user action.

A failed read or option construction preserves the previous list. Initial read
failures can retry. Pending reads block duplicate reload, transport, permission
requests and saves. Transport and pending/uncertain writes block reload. Close
remains available; epoch, owner and field checks reject results after hiding,
closing or intervening edits. English and Simplified Chinese share the same
message keys across both entry points; the UI retains English fallbacks.

## Synthetic verification

The six focused suites passed **379 tests, 0 failures**:

- `tests/ai-context-view.test.js`
- `tests/ai-model-view.test.js`
- `tests/ai-model-presets.test.js`
- `tests/ai-context.test.js`
- `tests/ai-model-client.test.js`
- `tests/ai-model-stream.test.js`

New cases cover preserved response/provenance and source edits, unchanged
selection with edited fields, changed/deleted records, real store conflict
recovery, no accidental writes, initial/read failure recovery, duplicate
clicks, draft edits, visibility round trips, close/pagehide, and reload while
transport is running followed by Stop. Existing error/cancellation tests also
pass. JavaScript syntax, locale JSON parsing and whitespace checks passed.

These are deterministic DOM/storage tests using synthetic data. Native browser,
OS clipboard, real provider, paid API, permission grant and public release
validation were not performed for this feature commit. No screenshots or test
payloads were uploaded. Full combined regression and packaging remain the
release integrator's separate verification step.
