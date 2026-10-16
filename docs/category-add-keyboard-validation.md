# Category Add keyboard ownership

## Reachable defect and primary evidence

Baseline: `bd4f5932b1118496c52266832b61ddbd8808bf2e`.

Settings renders Add Category as an enabled native `button` with `type="button"`.
It is reachable by keyboard in the category panel. Its click handler appends a
default-named row and schedules the existing 800 ms autosave, without moving
focus off Add or disabling it. Subsequent held-Enter activation therefore still
targets the same Add button.

The keyboard model is grounded in these primary sources:

- [W3C UI Events: keyboard sequence and keydown defaults](https://www.w3.org/TR/uievents/#events-keyboard-event-order)
  describes repeated keydown events while holding a key. Its
  [keydown contract](https://www.w3.org/TR/uievents/#event-type-keydown) assigns
  activation to Enter/Space on state-changing elements and suppresses associated
  default actions after cancellation.
- [Chromium HTMLButtonElement, fixed revision 9b8b876](https://chromium.googlesource.com/chromium/src/+/9b8b876833a6ed372718e44f90fbadfca6a0fced/third_party/blink/renderer/core/html/forms/html_button_element.cc)
  delegates keyboard handling to `HandleKeyboardActivation` and has default
  tab index zero.
- [Chromium HTMLElement, fixed revision b937d392](https://chromium.googlesource.com/chromium/src/+/b937d39273b52034e8542dea4b040587be0a127f/third_party/blink/renderer/core/html/html_element.cc)
  dispatches a simulated click for Enter keypress; Space keydown marks the
  control active and Space keyup clicks an active control. There is no repeat
  filter in that helper.

These sources support the event-chain inference; they are not an execution of
this extension in Chrome. With the real Options and StorageManager code plus
the explicit DOM/default-action model, one initial Enter and three repeats
produced six category rows from two existing rows. The normal autosave persisted
all six in one write. Focus remained on Add. No native-browser reproduction is
claimed.

## Minimal correction

Add now cancels repeated, composing, or key-code 229 activation keydowns for
Enter, Space and the existing `Spacebar` compatibility alias. This follows the
world-clock Add guard. The existing click handler remains the only Add action;
no key handler synthesizes a click. Previously consumed keydowns retain native
cancellation ownership. Ordinary clicks and separate Enter/Space activations
remain available, with no new modifier policy or focus move.

Space's initially accepted keydown still owns its one release activation even
if later repeat keydowns are cancelled. The tests do not claim that held Space
previously duplicated rows. Composing/229 checks are defensive event-ownership
coverage, not a reproduced native IME defect. Category input composition and
autosave policy, deletion focus, incomplete-name validation, StorageManager,
schemas, recovery, permissions and manifest 1.1.155 remain unchanged.

## Automated verification

Ten focused tests run actual Options initialization, event listeners, save queue
and StorageManager against synthetic DOM, timers, serialized Web Locks and
Chrome storage. The test-local default model explicitly supplies Enter's
keydown/keypress/click chain and Space's down/arm/up/click chain. It honors
previous cancellation and preserves an already armed Space across repeats.
`Spacebar` is an application compatibility test, not a claim about current
Chromium's key value.

The final tests on the unchanged baseline report **3 passes, 7 failures**. The
held-Enter failure records both rendered and persisted counts: six rather than
three, with one write. Existing ordinary and consumed activation contracts pass
on that baseline. The correction passes **10/10** focused tests and **102/102**
across these eight named related files, with no failures or skips:

```sh
node --test --test-concurrency=1 tests/category-add-keyboard.test.js tests/category-name-draft.test.js tests/category-save-conflicts.test.js tests/category-mutations.test.js tests/category-locale-defaults.test.js tests/world-clocks-options.test.js tests/settings-keyboard.test.js tests/settings-stale-save.test.js
node --check options.js
node --check tests/category-add-keyboard.test.js
git diff --check
```

Coverage includes held Enter through autosave; cancelled/composing/229 events;
ordinary clicks and discrete activation in both UI locales; held Space's single
release; untouched modifier/unrelated keys and category inputs; reinitialization
without duplicate listeners; focus retention; and a newer discrete Add surviving
an older delayed save. Modifier tests verify only that the app does not intercept
or synthesize their activation; operating-system shortcut behavior is not modeled.

No browser, real IME, assistive technology, screenshot, full Node or Python suite,
package, remote push or publication was run for this work item. Native input
delivery and platform differences remain unverified. Integration and independent
review are separate gates.
