# Settings category editor and save-feedback localization

## Scope and reproduced gap

Frozen baseline: `81f748a30d73a84f8fcf3c447b95f735c982a66b`, tree
`2b05a8906a875d42349d63baec9c04cf25aacc8f`; manifest remains **1.1.155**.

The Settings category editor used English-only `icon` / `name` accessible labels,
Chinese-only action titles and a Chinese-only default for Add Category. The main
save path displayed English-only progress, success, false-result failure and
error prefixes even with the Chinese catalog selected.

The correction adds ten message keys to each existing EN / zh_CN catalog, uses
the existing Options `t` helper, and adds explicit accessible names to the three
arrow/delete buttons. Their glyphs, types and action classes stay unchanged.
Only a newly appended row receives a localized initial name. Existing row names,
including old defaults, imported and user-entered names, are not translated.
Category IDs, icons, order and the normal trim-on-save policy are unchanged.

Error details are concatenated after the translated prefix, never passed through
substitution replacement. Literal `$&`, `$1`, `$$`, `$\`` and `$'`, newlines and
HTML-like text are retained through the real `showMessage` textContent path.
`SETTINGS_*` still shows only its existing dedicated notice; clock conflicts keep
the existing localized clock detail, and category conflicts keep their full
original reason. Generic errors do not claim rollback or that nothing was saved.

No storage/controller/schema, permission, network or manifest change is included.
The existing save queue, atomic field transaction, category CAS, raw draft
ownership, stale-session guard and Add keyboard-repeat guard are unchanged.
Other Settings operations are outside this localization scope.

## Automated verification

The new `tests/settings-category-localization.test.js` runs the real `i18n.js`,
`initializeOptionsPage`, event setup, category Add, autosave, `saveAllSettings`,
`showMessage`, departure-protection code and `StorageManager` against RAM Chrome
storage and serialized Web Locks. Its DOM, event dispatch, timers and Chrome
catalog selection are synthetic. The fixture does not stub the save method or
message renderer. Rejected-write tests inject a synthetic propagating workspace
error into the RAM storage adapter, including a write-then-reject outcome.

The final 32 tests against the unchanged frozen production files report **15
passes / 17 failures**. The corrected files pass **32/32**. Eight explicitly named
related files pass **133/133** as reported by Node, with no failures or skips:

```sh
node --test --test-concurrency=1 \
  tests/settings-category-localization.test.js \
  tests/category-add-keyboard.test.js \
  tests/category-name-draft.test.js \
  tests/category-save-conflicts.test.js \
  tests/category-locale-defaults.test.js \
  tests/settings-stale-save.test.js \
  tests/world-clocks-options.test.js \
  tests/settings-keyboard.test.js
node --check options.js
node --check tests/settings-category-localization.test.js
git diff --check
```

Coverage includes:

- EN and zh_CN actual selected catalogs, deliberately conflicting browser locale,
  unsupported French using the modeled Chrome English catalog fallback, absent /
  empty / throwing / key-valued message APIs, no helper and one missing key.
- Localized field labels, action titles and accessible names, unchanged glyphs,
  localized Add name, one real atomic autosave and English/Chinese reopening
  without rewriting prior names or unrelated personal/recovery data.
- Saving and success notices; real false-result failure and retry; exact rejected
  error details as text; uncertain acknowledgement after a write with no success
  or invented rollback claim.
- Real category and clock conflicts, repeated stale category saves, existing
  settings conflict / baseline / lock / permission notices without extra prefix.
- Empty new names preserving the whole form draft, later completion, and a newer
  draft surviving an older successful write without losing raw input or focus.
- Existing held-key/IME Add guards, discrete keyboard activation, category
  mutation ownership and broader stale-save protection in the named suites.

No native Chrome session, assistive technology, OS input method, screenshot,
package, full Node or Python suite, remote push, tag, Release or CWS publication
was run for this work item. Chrome catalog resolution and native keyboard/
accessibility delivery remain unverified here; the tests model those boundaries.
