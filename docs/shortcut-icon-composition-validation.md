# Shortcut icon requests at composition start

## Event-sequence evidence

This is a UI request-ownership correction supported by primary event/engine
sources and an application-level regression model. It is not a newly reproduced
native Chrome/OS IME defect.

- [UI Events: compositionstart](https://www.w3.org/TR/uievents/#event-type-compositionstart)
  places the start event before composition changes the DOM. Its
  [handwriting example](https://www.w3.org/TR/uievents/#events-composition-handwriting)
  also separates starting the session from producing composed text.
- In the pinned [Chromium InputMethodController source](https://chromium.googlesource.com/chromium/src/+/013ae87e2a42b041bda654a94ab2f5c218cf6499/third_party/blink/renderer/core/editing/ime/input_method_controller.cc),
  `SetCompositionFromExistingText` dispatches `compositionstart` for a new
  session, marks the existing range, and dispatches `compositionupdate`, without
  replacing the text or dispatching `input`.
- A pinned [Windows TSF implementation](https://chromium.googlesource.com/chromium/src/+/ce6d12c81b7d61fbff70d4389c098c6a92a1c57c/ui/base/ime/win/tsf_text_store.cc)
  supplies a platform path as well: `RequestLock` handles a new composition on
  existing text by calling `StartCompositionOnExistingText` and returning. That
  helper calls the input client's `SetCompositionFromExistingText`. This is
  evidence of a platform integration path, not only a synthetic test API.
- The historical upstream [inputevent-ime regression test](https://chromium.googlesource.com/chromium/src/+/852ab8bfa27da53f0790a230bbabeac5f4175729/third_party/WebKit/LayoutTests/fast/events/inputevents/inputevent-ime.html)
  has a `setMarkedTextFromExistingText` case on an actual input element and
  expects only those two composition events. This upstream test was read, not
  executed here. None of the pinned revisions is claimed to be this environment's
  current Chrome build.

The application-level inference is therefore narrower than assuming that a
network task can interrupt two synchronous native events: an existing-text
composition can start/update and return with the field value unchanged and no
input event. An outstanding icon result can then settle before the user makes
another text change. This is consistent with the
[HTML event-loop model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops),
which processes asynchronous resource work as tasks. The regression dispatches
start/update synchronously and settles the deferred result on a later Node task.
It does not claim to reproduce a specific native IME's reconversion gesture.

## Defect and smallest correction

At baseline `e285c40cb1145234039b67a1d152614f5bb1b4bb` (tree
`a542b04601068de5f00801cf2202ce51071e9718`), the shortcut URL/icon listeners
revoked icon ownership on input/change, while fetch completion checked the
session and unchanged raw URL/icon fields. A composition beginning on unchanged
text satisfied those checks: the old result replaced the icon, or an old
rejection attached an error to the newer intent. Pending Refresh could also
clear the icon after that intent.

The two URL/icon inputs now call the existing `cancelIconRequest` on
`compositionstart`. This revokes UI ownership and restores the Fetch control;
it does not abort the already-started network request. It also advances the
existing intent token checked by Refresh. No extra state or composition-end
handler is needed, so ending/canceling composition cannot revive old work.

Title/category intent remains independent of icon ownership. Composition alone
does not repaint or read the preview, start a lookup, modify fields or write
storage. A later explicit Fetch remains available, keeps its own spinner and
failure feedback, and uses the existing privacy gate and null-result fallback.
Save's separate draft-intent listener remains in place. Storage, schema, APIs,
permissions, manifest version `1.1.155`, and the read-only preview implementation
are unchanged.

## Focused verification

The new `tests/shortcut-icon-composition.test.js` has 23 deterministic cases:
Add/Edit, URL/icon, old success/rejection, unchanged end/cancel, a newer explicit
Fetch, unrelated title/category intent, repeated composition without a request,
pending Refresh, current failure feedback and privacy-disabled fetch.
The unmodified baseline fails 18 cases and passes 5 controls; the correction
passes all 23. Raw fields, focus, error text, preview identity, request count and
button state are asserted. Real network and implicit storage writes are blocked
by the harness.

```sh
node --max-old-space-size=1024 --unhandled-rejections=strict --test --test-concurrency=1 --test-reporter=tap \
  tests/shortcut-icon-composition.test.js \
  tests/shortcut-favicon-session.test.js \
  tests/shortcut-edit-preview.test.js \
  tests/shortcut-save-draft.test.js \
  tests/shortcut-save-session.test.js \
  tests/shortcut-departure.test.js \
  tests/dialog-ime.test.js \
  tests/dialog-focus.test.js
```

Result: **103 passed**, zero failures, cancellations or skips. Syntax checks for
the changed runtime and new test, manifest version parsing, and `git diff
--check` also pass. The related tests retain cache-only preview, session changes,
privacy/null-result handling, Save draft preservation, departure ownership and
dialog composition behavior.

No complete Node/Python suite, runtime package, browser session, screenshot,
user profile, publication or store submission was used for this slice. Native
acceptance still needs an appropriate OS/IME and controlled icon delay to check
actual reconversion events, candidate UI, selection/focus painting and their
interaction with the extension. Integration owns independent review and full
release gates.
