# Background color complete flow

The text color field now accepts the same three- or six-digit hexadecimal forms
on its existing immediate `change` save path as ordinary Save Settings. Optional
`#`, surrounding whitespace, and existing case handling are unchanged. This does
not add autosave: six-digit color changes and the native picker already saved
immediately. Invalid text remains a draft without a background write.

The production change is one validation expression in `options.js`. Storage,
queueing, conflict checks, generation ownership, failed-save draft retention,
image handling, and read/population behavior are unchanged. A historical saved shorthand
such as `#abc` stays that spelling on read and unrelated Save. The immediate
helper already reads the native picker value: in the verified Chromium, a new
`abc` change therefore saves the picker-serialized `#aabbcc`. This is not a
new migration or a new storage canonicalization routine.

## Original-source evidence

Actual Options/StorageManager complete-file regression: 73 tests, 72 pass and
one expected failure. After entering a six-digit color, text `abc` followed by
`change` left the saved old color; ordinary Save accepted the same `abc` as `#abc`.
The unsaved draft was retained, so this is inconsistent immediate saving, not
loss of stored data or a discarded draft.

Native Chromium baseline on isolated loopback fixture 8795 reproduced that
sequence with real text entry and Tab blur. Solid Color selection wrote once;
`#224466` changed and saved (write 2); `abc` emitted input/change/blur but did not
save; explicit Save wrote `#abc` (write 3). The actual homepage showed
`rgb(170, 187, 204)`. Native picker displayed `#aabbcc`, including on reopening
settings, while the text/storage retained `#abc`.

A preliminary model assumed native color inputs would reject shorthand as black.
The native observation disproved that assumption for this Chromium; that model
was removed, not treated as a product defect. Likewise, an initial programmatic
fill emitted no change event; only the subsequent native text/Tab sequence is
used as change-save evidence.

## Final regression scope

- Complete `settings-stale-save.test.js`: 83/83, including twelve new cases.
  The final two explicitly model the observed native picker serialization;
  the generic fixture otherwise uses string-valued controls.
- Valid shorthand/prefixed/mixed-case/whitespace and six-digit forms; reopened
  controls and unrelated Save retain the stored spelling.
- Invalid text does not write or substitute black.
- Failed shorthand saving retains a retryable draft; explicit Save retries.
- A newer queued shorthand color wins after a paused first write.
- Existing complete-file pending draft, storage failure, stale writer, import,
  reset and replacement ownership tests remain applicable and passed.

## Final aggregate and native complete flow

Final production code passed all 440 complete Node files: **17,274/17,274**, exit
0; Python **91/91**, exit 0. The 19 related complete files passed **544/544**.
After that run, two test-only cases added the observed native picker model and
historical shorthand read/unrelated-save protection; the entire updated file
passed **83/83**. Those two additional cases are not counted in the 17,274 total.
Production did not change after those aggregate or native runs.

Native 8796 used the exact final `options.js` bytes. Real Solid Color selection
wrote once, native `#224466` + Tab wrote once more, and native `abc` + Tab now
saved the equivalent `#aabbcc` immediately (write 3). Unchanged ordinary Save
succeeded with no fourth write. Selecting Column template was write 4; actual
Back to Dashboard showed the Column heading, both original sites, and
`rgb(170, 187, 204)` background. Switching to the other workspace and returning
produced the existing workspace registry updates (writes 5 and 6), not background
or site-content changes. Its bundle stayed exact; all target personal modules
and shared privacy/sync/Prompt/Collection data remained exact. The registry is
not claimed byte-identical after explicit workspace switching.

Actual Open Settings opened a new owned local tab; picker and text both read
`#aabbcc` with Column retained. The synthetic adapter permits only same-origin
Options/homepage opens, not outside sites. Owned tabs 46/47 were closed, only the
untouched original tab 9 remained, and server 8796 plus its dedicated Terminal
tab were stopped/closed normally. No screenshot was uploaded.

All native data are synthetic, origin-local fixture data with real production
controllers and browser Web Locks, not installed-extension upgrade acceptance.
No file input, import, external account/model request or clipboard permission is
part of this color test. Original browser tab 9 remains untouched.
