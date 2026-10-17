# Tasks: read-only local recovery-copy preview

## Scope

**Task data → Previous local copies → Review restore** now includes a collapsed **Contents of this local copy** disclosure. It shows every original task in saved record order, exact plain text, state and the saved **Next up** marker. Duplicate text, whitespace, CRLF/CR/LF line endings, Chinese, emoji and literal HTML are retained. Removed records also show **Removed from: Active/Completed**, with help explaining that this is their individual restoration state; restoring the entire copy keeps them removed. Empty copies are labeled explicitly.

The content is a frozen snapshot of the same successful `Store.read()` used for the current/replacement counts and captured confirmation revision. Expanding does not reread storage. A later change cannot silently update the preview while leaving an earlier confirmation active: the existing revision guard rejects stale confirmation, and the old preview stays visible for review. Uncertain-save retries retain the same command.

Preview rows use `textContent` and contain no live task controls. Native disclosure is explicitly included in the shared dialog's Tab loop; the expanded bounded scroll list is also keyboard focusable. The list preserves line breaks and wraps long text. File-import review has no recovery-copy disclosure. Store/schema, limits, permissions, quick-entry drafts, Undo, error ownership and shared focus behavior are unchanged.

## Focused verification — 2026-10-17

Seven new cases in `tests/local-tasks-view.test.js` use the real Store/Controller with the existing DOM model and synthetic task data. Before implementation, all seven failed against baseline `b6f749621e17f7826fa5e5e0f96d7cf94862fe29` on missing preview/content assertions. After implementation all seven pass:

- Mixed states in original order, duplicate multiline Chinese/emoji/HTML text, correct pin and both removed-from states. Disclosure starts collapsed; modeled forward/reverse focus wrapping includes its summary. Preview/toggle/cancel use one read and zero writes, keep the entire persisted state, quick-entry draft and Undo, and return focus. A detached confirmation cannot save.
- Two copies with identical counts display different complete text, each at the 1,000-Unicode-character task limit.
- Another page consumes the selected copy after review. The old text stays unchanged; even mutation of a retained read result cannot change the captured revision. Confirmation reports CONFLICT, hides the action and preserves newer storage; Cancel retains focus and Escape closes.
- Late reads cannot reopen a canceled review, replace a newer editor or outlive view destruction.
- At the eight-copy limit, a write that commits before reporting failure is retried with the exact same command and no second write. The original current list is retained as the eighth copy; the other seven copies remain exact, recovered records preserve all fields except regenerated live versions, and the pin is restored.
- Empty copies are explicit. Opening and canceling file-import review adds no recovery preview and changes no storage.
- Chinese catalog labels cover all states, the pin and both removal origins, while preserving the original task text.

The six-file focused regression run passed **143/143**:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-name-pattern='recovery preview:' tests/local-tasks-view.test.js
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 tests/local-tasks-view.test.js tests/local-tasks-store.test.js tests/local-tasks-departure.test.js tests/local-tasks-completion-undo.test.js tests/local-tasks-boundary.test.js tests/local-tasks-dialog-composition.test.js
NODE_OPTIONS=--max-old-space-size=512 node --check shared/local-tasks-view.js
NODE_OPTIONS=--max-old-space-size=512 node --check tests/local-tasks-view.test.js
git diff --check
```

Both locale catalogs and the manifest were parsed as JSON. New English fallback strings were checked against the English catalog.

## Limits

This is source, Store/Controller and DOM-model verification. No new native Chrome, screenshot, screen-reader, layout, cross-platform, full-suite or scale validation was performed. The model sets the native disclosure's open state explicitly; it does not establish real Enter/Space activation, rendered wrapping/scrolling or native focus painting. No personal data, user device, live service, paid platform, network request, publication or Chrome Web Store submission was used. Manifest version remains unchanged.
