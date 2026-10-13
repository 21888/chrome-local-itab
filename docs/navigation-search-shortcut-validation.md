# Navigation-library search shortcut validation

## Scope

Adds `/` inside the open navigation-library panel to focus and select the existing search query. The listener belongs to one panel opening and is removed on close. No global shortcut, shared focus-trap change, storage behavior, permission, provider, or manifest change is included.

## Regression coverage

Nine focused cases in `tests/navigation-library-view.test.js` verify:

- English/Chinese visible hint, `aria-keyshortcuts` and associated description.
- Exact query, active tag/company/saved-state filters, destination, selection, category draft, result nodes and source disclosure state remain unchanged; no additional snapshot read or save call.
- Editable/native controls, contenteditable ancestors, ARIA editing widgets, shadow edit paths and design mode are excluded.
- IME events and lifecycle, consumed events, repeat, Ctrl/Meta/Alt/AltGraph and non-slash characters remain untouched; Shift-produced `/` is supported.
- Review and its immutable confirmation remain in place; pending reads/writes, component/layout changes, departure and blocked saves cannot take focus.
- Hidden/inert/disabled/disconnected nodes, hidden document, other dialogs and menus are excluded without blocking the library's own dialog.
- A closed disclosure remains excluded even when descendant layout rectangles persist; its summary works normally.
- Detached result/search nodes and old panels cannot affect a reopened panel, including direct invocation of a stale callback.
- IME target cleanup on blur, removal and changed focus; failed focus is not consumed.

Existing navigation and shared focus tests continue to cover Tab, Shift+Tab, Escape, IME Escape, closing/reopening and saved-state protections.

## Checks

- Focused navigation view: 95/95 passed.
- Strict full Node suite, serial execution, 1 GiB heap: 2557/2557 passed.
- Python unittest discovery: 81/81 passed.
- Runtime package build and byte verification: passed, 112 files.
- `git diff --check` and changed JavaScript syntax: passed.

Limited Chinese desktop-light native validation passed on one representative PhET card: summary/card slash focused and selected the query; literal slash stayed in search/new-category inputs; selected site, purpose filter, target and category draft persisted. Review retained confirmation-button focus without activating it; closing/reopening reset transient state. No site/category save occurred. Dark/responsive, other languages, IME/modifier/repeat/alternate layouts, all focus targets and pending-save combinations were not native-tested. Synthetic guards are not a full accessibility or browser-matrix claim.
