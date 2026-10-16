# Prompt save completion focus ownership

## Reproduced behavior

At baseline `9997114a57cebc35453013f2c4b3efb86d144f85`, saving a prompt
remounted and disabled the editor while retaining an unconditional focus key.
The library search and filters remained available. If the user focused search
or a filter while the write was pending, success could pull focus to the saved
heading; a definitive save rejection could pull it back to the editor action.
The newer search/filter value itself was retained.

The minimal reproduction uses the actual **Save draft as new prompt** button,
a deferred real Store backend write, and search focus/input before releasing
the write. The failure variant injects a definitive `CAPACITY` fault at the
Store mutation boundary before writing. Both fail their newer-focus assertion
on the baseline. A backend write failure is separately tested as uncertain,
not incorrectly treated as a definitive capacity rejection.

## UI-only change

A pending focus return is revoked by newer focus, pointer or keyboard activity,
window blur, visibility changes, pagehide or disposal. The view also checks the
active element before rebuilding the status and list, so those rebuilds cannot
hide a newer focus owner. Temporary event listeners are removed when ownership
is revoked or the save reaches its UI completion.

With no newer interaction, existing completion behavior remains: a successful
save focuses its detail heading; a definitive failed copy returns to the copy
action. An uncertain save keeps the draft and immutable operation, disables the
editor, and exposes the existing status retry. An exact retry can confirm the
already committed write without creating another copy.

This changes only the view's focus handling. Prompt fields, original records,
variable sessions, draft retention, save commands, receipt checking, storage,
backup/recovery, permissions and APIs are unchanged. Manifest is still 1.1.155.

## Focused verification

Synthetic fixtures only. The 43 new cases have **33 failures / 10 passes** on
the frozen baseline, and **43 passes** with the change. Coverage includes:

- English and Chinese; new-form submit, editor Ctrl+S and save-as-new click
- Real Store write success and uncertain acknowledgement; injected definitive
  pre-write capacity rejection; unchanged draft/original data and write counts
- Newer search input, focus-only search, category/tag selectors and Favorites,
  including a subsequent library refresh
- Focus moving away and back to body; pointer/key activity; blur, visibility
  round trip and persisted pagehide
- The still-owned success/failure fallback, uncertain-save browsing, the exact
  status-button retry, disabled busy cards and disposal/listener cleanup

The following explicit related Node files passed **273/273** with strict
unhandled rejections, serial execution and a 512 MiB heap:

```sh
node --unhandled-rejections=strict --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-prompts-controller.test.js tests/local-prompts-view.test.js \
  tests/local-prompts-draft-preview.test.js tests/local-prompts-draft-excerpts.test.js \
  tests/local-prompts-excerpt-variables.test.js tests/local-prompt-starters.test.js \
  tests/collection-prompt-draft.test.js tests/local-prompts-save-focus.test.js \
  tests/library-search-shortcut.test.js tests/local-prompts-linked-results.test.js \
  tests/local-prompts-tag-filter.test.js tests/local-prompts-integration.test.js \
  tests/local-prompts-lock-errors.test.js
```

The existing related cases additionally exercise cancellation/reopening,
external refreshes, source rereads, stale excerpt application, temporary
variable invalidation, save-as-new conflicts and uncertain receipt recovery.
JavaScript syntax and `git diff --check` passed for the changed files.

These are source-driven Node/DOM-model checks, not native Chrome, OS keyboard,
IME, visual, clipboard, accessibility or cross-tab browser acceptance. No
browser was launched, no provider called, and no screenshots uploaded. Full
Node/Python suites, packaging, integrated CI and release checks are separate.
