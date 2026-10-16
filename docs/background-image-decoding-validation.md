# Background upload decoding validation — 2026-10-16

## Reproduced defect and bounded change

Against `3350ee0da50e794aa433d0ac70c23e8ec8860b4a`, selecting or dropping a
file labelled `image/png` whose data URL encodes the synthetic text
`not-an-image` reached the background writer, replaced the preview, and reported
success. The upload path checked MIME and size, but never asked an image decoder
to accept the bytes. Three targeted pre-change regressions failed: file selection,
drop, and waiting for decoding before writing.

The Options upload UI now decodes its locally read data URL with
`HTMLImageElement.decode()` before calling the existing background commit path.
A rejected decode leaves the current preview and text controls alone and reports
that **this file** was not saved. The file input is cleared so the same file can
be selected again. The existing ownership check runs both after reading and after
decoding, before a commit can start.

The JPEG/PNG/GIF/WebP MIME allowlist and 5 MiB limit are unchanged, including the
accepted exact-size boundary. There is no added byte-signature matching, extension
rule, dimension limit, format conversion, storage schema, permission, remote
request or migration. This is browser-decodability validation of new background
uploads, not format authentication or validation of every saved/imported image.
Movie-poster handling is unchanged.

## Asynchronous boundaries

- A later upload, remove-image action or background type choice owns the UI;
  successful or failed completion of an older decode cannot submit its image or
  replace the newer feedback.
- Cancelling the picker, rejecting an unsupported MIME, or rejecting an oversized
  selection does not retire an accepted in-flight decode.
- The existing same-page reset/import wrapper retires pending reads/decodes before
  their commit. Existing Settings generation/conflict checks still own cross-page
  replacements and workspace write rejection.
- A decode rejection is not a rollback. If image A has already entered the writer
  when a later corrupt image B is chosen, A can still commit. B is then rejected,
  while the old displayed preview can remain because A no longer owned the UI.
  The error therefore says only that B was not saved; it does not promise storage
  was unchanged or that an already committed A was restored. There is no retry or
  rollback of an uncertain acknowledgement.

## Automated evidence

`tests/background-image-decoding.test.js` adds 24 tests using the actual Options
change/drop/remove/type listeners and FileReader adapter with a controlled image
decoder and storage model. They cover corrupt-image selection/drop and successful
retry, delayed success/failure, newer upload/remove/color choices, cancel events
and empty selections, invalid MIME/size selections, pending text drafts, the real
same-page replacement ownership wrapper, already-started writes, stale reads,
workspace write rejection, locale guidance, and the existing MIME/size boundaries.
The MIME boundary tests model successful decoding; they do not run four codecs.

Focused command, **180 passed, zero failed/skipped/cancelled**:

```sh
node --test --test-concurrency=1 \
  tests/background-image-decoding.test.js \
  tests/background-image-persistence.test.js \
  tests/dashboard-customization.test.js \
  tests/dashboard-customization-contrast.test.js \
  tests/appearance-concurrency.test.js \
  tests/appearance-preferences.test.js \
  tests/settings-stale-save.test.js \
  tests/dialog-focus.test.js tests/dialog-ime.test.js \
  tests/workspace-lifecycle.test.js
```

The existing persistence and stale-save fixtures explicitly model successful
image decoding; their writer/conflict assertions are unchanged. Syntax checks
for modified JavaScript and parsing both locale catalogs pass. `git diff --check`
passes.

The accompanying bounded customization audit found no additional change needed:
existing tests cover Reset/Cancel/saved reopen, invalid hex/numeric drafts,
pending Save, IME Escape, external saved return targets and focus restoration.
Four additional temporary DOM probes checked Reset focus/no write, pending Save
followed by injected workspace rejection retaining the draft and focus, Cancel
restoring the launch control/inert state, and a failed read on reopen leaving the
launch control focused with an error. These are injected-fault/model observations,
not a claim that every real workspace invalidation timing was exercised.

## Limits

No native browser, real OS picker, native image codec, animated-image playback,
rendered screenshot, assistive technology or actual multi-window workspace
invalidation was tested by this patch. Native acceptance should select valid
JPEG/PNG/GIF/WebP files and a corrupt allowed-MIME file, confirm cancel/reselect,
then repeat with a newer image/type/removal during decoding. Native codec failures
and focus behavior remain distinct release checks. The full Node suite and
Python/package checks were not run by this bounded audit.
