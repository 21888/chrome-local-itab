# Repairable saved-answer titles

Development fix on **1.1.155**, tested on 2026-10-16. Baseline: `6e182a01e953208d6798ba78a4935b87a801de0a`.

## Behavior

A provider question containing a TAB can become the suggested saved-answer title. Previously, Save created an immutable operation before the collection Store rejected that single-line title. No content was written, but the retained operation locked the title and Cancel; editing the title could not repair that operation. The complete answer remained in memory and visible. This was a blocked save flow, not loss of an existing saved record or a change to copying.

`saveAnswer` now checks every answer title for the Store's existing C0/DEL restrictions before the active-workspace check or command creation. It leaves the literal title, complete answer and snapshot choice untouched. English, Chinese and fallback feedback asks the user to edit the title and save again. A corrected title is saved only on another explicit Save, with the original answer and, if selected, the original reviewed snapshot. Nothing strips TABs, rewrites saved content or resends a request.

The guard is local to answer saving. Shared source-label validation, collection schema/Store, write-error handling, permissions and transport are unchanged. In particular, `TEXT` was not added to the command-clearing error list.

## Compatibility and uncertain writes

- Control-character rejection now uses `ANSWER_TITLE`. Provider titles previously reached the Store's `TEXT` error; manually loaded answers previously used `LIMIT` for this case. Empty/whitespace-only, oversized and malformed-Unicode titles keep their existing `LIMIT` behavior. Manual-answer provenance and context restrictions are unchanged.
- Existing `READ`/`WRITE`/`VERIFY` uncertainty retains the exact operation and lock. Its feedback takes priority over the title error. Checking receipts still uses the original command.
- As with the previous manual-answer precheck, a programmatic retry with an invalid title is refused before attempting persistence. For provider answers, a retry title containing controls now also returns `ANSWER_TITLE` instead of being ignored in favor of the retained command. It does not clear or replace that command; a subsequent valid retry still uses the original title, body and snapshot. Normal UI users cannot edit the locked title.

## Focused checks

`tests/ai-context-answer-title.test.js` adds eight checks using the real controller, collection Store and view with synthetic storage, transport and DOM:

- All 33 C0/DEL code points reject without a workspace check, storage read/write or retained operation; corrected-title save preserves literal body, history and original question/source snapshot.
- Suggested TAB title, local feedback in English/Chinese/fallback, editable title, usable Cancel, explicit correction and repeated Save clicks.
- Reviewing a newer question does not change the earlier answer's saved snapshot.
- Actual Store `WRITE` acknowledgement failure and `VERIFY` readback mismatch keep the original command, UI lock and uncertainty feedback. Invalid programmatic retries cannot unlock them; valid retries recognize the original receipt without a second write.

The new suite failed **8/8 on the baseline**, then passed **8/8** with this fix. The new suite plus `ai-context.test.js` and `ai-context-view.test.js` passed **214/214**. A focused selection of existing manual-answer save, title and receipt tests passed **14/14**:

```sh
node --test tests/ai-context-answer-title.test.js tests/ai-context.test.js tests/ai-context-view.test.js
node --test --test-name-pattern='manual invalid title|manual answer is exact|manual answer cannot include|manual.*receipt|manual.*save|UI.*uncertain save' tests/ai-context-external-answer.test.js
```

Changed JavaScript syntax, manifest/locale JSON and `git diff --check` were checked. These are focused results, not a full Node/Python or release-package pass.

The UI model applies the [HTML text-input value sanitization rule](https://html.spec.whatwg.org/multipage/input.html#text-(type=text)-state-and-search-state-(type=search)): CR/LF are removed while TAB remains. TAB drives the UI regression; programmatic CR/LF coverage is at the controller boundary. No real Chrome, provider, clipboard, screenshot or native-keyboard acceptance was performed for this change. All fixtures are synthetic; no user device or paid platform was used. The existing saved-answer reuse workflow is not expanded by this fix.
