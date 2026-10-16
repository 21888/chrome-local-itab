# Settings background-image localization

## Scope and reproduced gap

Frozen baseline: `9b436138327b3ca936c1cae21c2746b4631d102c`, tree
`9157c6ef29ca08f8db1b03c70f9b1fe36877220b`; manifest remains **1.1.155**.

The real Settings background-image entry points had English-only selection and
format/size hints, Remove text, type/size validation, upload progress/success,
removal confirmation/success and generic error prefixes. These now use eleven
new keys in each existing English and Simplified Chinese catalog. No additional
interface language is added. Existing English wording is preserved.

The three static elements retain their existing classes, type and behavior, with
`data-i18n` attributes added. Immediately after ordinary document localization,
`localizeBackgroundImageControls` uses the existing Options `t` helper for only
these three nodes, before the existing Settings search mount. This keeps their
English fallback readable when a message or helper is unavailable. The shared
`i18n.js` implementation and unrelated static fallback behavior are unchanged.

`BACKGROUND_IMAGE_INVALID` and `SETTINGS_*` retain their original branches and
dedicated notices. Generic details are concatenated after the localized prefix,
never passed through substitution replacement. Literal `$&`, `$1`, `$$`, `$\``
and `$'`, line breaks and HTML-like content remain intact through the actual
`showMessage` textContent path. These generic messages make no rollback claim,
including when a write completed but its acknowledgement failed.

Image reading, decoding and persistence remain local. Allowed MIME types are
still JPEG, PNG, GIF and WebP; the exact `file.size > 5 * 1024 * 1024` rejection
test is unchanged, including acceptance at the boundary. The pre-existing
English 5MB wording is retained. `Image.decode` must still succeed before a
candidate reaches the writer. Filenames, image bytes and saved content are not
translated.

The request/session ownership checks, newer-intent protection, background and
other form drafts, CAS baseline, serialized write queue, file-input cleanup,
message severity/roles and local-write-before-Sync scheduling are unchanged.
No storage/controller/schema, permission, network or manifest code is modified.
Movie posters, topics, general import/export/reset and the shared translation
helper are outside this change.

## Automated verification

The new `tests/settings-background-localization.test.js` invokes the real
`DOMContentLoaded` callback, `i18n.js`, Options initialization, file input/drop/
removal handlers, `showMessage`, departure protection and `StorageManager`.
The fixture reads the three controls and their actual attributes from
`options.html`. It uses RAM Chrome storage, serialized Web Locks, synthetic DOM
and event dispatch, controlled timers, catalogs, FileReader data and decoding.
The file-to-data-URL adapter, save methods and message renderer are not stubbed.
An observation hook verifies the final labels seen by the Settings search mount;
it does not claim to test the search implementation itself.

The final new suite run against unchanged baseline production files reports
**27 passes / 34 failures**. With the correction it passes **61/61**. The eight
explicitly named related test files below pass **177/177** as reported by Node,
with no failures, cancellations or skips:

```sh
node --test --test-concurrency=1 \
  tests/settings-background-localization.test.js \
  tests/background-image-decoding.test.js \
  tests/background-image-persistence.test.js \
  tests/settings-stale-save.test.js \
  tests/document-language.test.js \
  tests/settings-category-localization.test.js \
  tests/settings-search.test.js \
  tests/settings-keyboard.test.js
node --check options.js
node --check tests/settings-background-localization.test.js
git diff --check
```

Both changed locale files also parse as JSON. Coverage includes:

- Actual EN/zh_CN catalog use despite a conflicting modeled browser locale;
  unsupported French using modeled Chrome English fallback; missing, throwing,
  absent and key-returning message APIs; missing helper; each missing static key.
- Final three-control text after real document localization and before the
  Settings search mount, while unrelated static fallback behavior stays intact.
- Localized progress, success, validation, confirmation, generic failure and
  exact raw details. File-read/decode failure, ordinary failed-save result,
  retry, write rejection and uncertain post-write acknowledgement.
- Real RAM-backed settings CAS conflicts, unavailable baseline and missing
  locks, preserving their specific existing messages and saved state.
- Picker/drop routes; all four MIME types at exactly 5 MiB; oversized/invalid
  selections and empty/native picker cancellation; cancelled removal;
  newer upload/removal/color intent; a newer unsaved color text draft.
- Preserved unrelated saved categories, links, quote, personal/recovery data
  and live quote draft; no success for superseded writes or failed operations;
  accepted decoding still owning its outcome after cancellation.
- Existing enabled Sync scheduling after the local write. The controlled Sync
  timer is not executed, so this verifies ordering, not remote Sync transfer.

No native Chrome session, browser image codec, OS file picker, real drag-and-drop,
accessibility tooling, screenshot, package, full Node or Python suite, remote
push, tag, Release or CWS publication was run for this work item. Real Chrome
catalog selection and native presentation remain separate validation boundaries.
