# Read-only world-clock and saved-prompt comparison: bounded native acceptance

2026-10-27, dot cloud Linux Chrome. Both runs used the final 138 runtime files from local `7f91cb5ac9f34f9f7015b69b8fc924b8256b19e2`, published as `29761cec4b93437fd3a4bf7fae38f4588919ef92`. Runtime hash inventories and text evidence remain local. These checks found no product defect and introduce no production change.

The fixtures used legal synthetic workspace/library data, production controllers/views/codecs, a local translation/Chrome-storage bridge, and same-origin resources. External requests were denied; online icons and Sync were disabled. Any clipboard call was captured by an in-memory adapter, not the system clipboard. No model, account login, provider, file import, permission grant, clock/time-zone change, recovery or restore was performed. This is not installed-extension upgrade acceptance or resolution of the historical data-loss incident.

## World-clock comparison and native local-time entry

The [time-entry validation](world-clock-time-entry-validation.md) explicitly distinguished model coverage from unverified native segmented input. Port 8810 exercised the real `datetime-local` control on the complete new-tab page, not DOM assignment or synthetic keyboard events. The observed device zone was America/Los_Angeles. Saved synthetic rows were Tokyo, Kathmandu and New York, in that order.

- Clicking the input and pressing Up changed its seconds segment from 09 to 10. The already-applied comparison retained 09 until plain Enter. Enter applied 10 with the device IANA zone and GMT−07:00 and reset the offsets.
- Left/Up changed minutes as a new draft. Copy comparison captured the **previous applied** reference and all three ordered rows, not the unsubmitted minute value.
- Preview applied the newer draft. Forward/Back 24 hours retained seconds and changed the full displayed dates consistently. Slider Home then Right produced −1,425 minutes, preserving the base and seconds.
- Clearing the optional seconds segment was correctly accepted as 00. Clearing the required minutes segment was rejected; the prior applied reference and row values remained intact.
- Back to now cleared transient input/error and resumed live rows.

The valid run recorded **zero synthetic storage writes** and no captured application errors. Its clipboard capture contained the exact visible applied reference and three clock rows. The sampled outer Chrome window was 1,188 pixels wide; this does not establish narrow-card fit, mobile, OS IME, screen-reader or system-clipboard coverage. DST gaps/folds and time-zone changes remain covered only by the separately described models, not by this run.

Two seed errors were retained and corrected without weakening production validation:

1. Editing both legacy and scoped clocks conflicted with the frozen pre-migration legacy baseline. The existing older-tab guard correctly stopped startup. No recovery/download control was used. The corrected seed left legacy values unchanged and configured only the active workspace's saved clocks.
2. Strict stored validation rejected noncanonical `Asia/Kathmandu`; the shipped normalizer/Intl returns `Asia/Katmandu`. Using the canonical stored spelling with a fresh synthetic backend key allowed startup. This is fixture correction, not a product fix or an explanation of an earlier incident.

Owned tab 70, server 8810 and its dedicated Terminal tab were closed at 08:18 UTC. The pre-existing blank tab 69 was not operated.

## Saved prompt body comparison and temporary version values

The [saved-version comparison guide](prompt-version-comparison.md) previously reported synthetic DOM coverage, not native keyboard acceptance. Port 8811 used one prompt with two versions produced by the actual Store and Controller: an older CRLF body ending with a newline, and a current LF body without a final newline. Both contained `{{topic}}` and literal `<script>literal-only</script>` text.

The complete real-control sequence passed:

1. Fill `current temporary` in v2. Selecting v1 in history only inspects its body and leaves the usable v2 preview unchanged.
2. Explicitly choose Use this version, then fill `older temporary` in v1's independent session.
3. Open Compare saved versions. From v1 → To v2 shows removed/added literal saved bodies, **not filled variables**, plus CRLF/LF counts and final-newline Yes/No summaries.
4. Use native selector keys to compare v1 with itself: the panel reports identical bodies. Return To to v2 and expand both original saved texts; placeholders and literal markup remain text.
5. Escape closes comparison and returns focus to its opener. Return to current version restores `current temporary`; using v1 again restores `older temporary`.
6. Reload returns to current v2 with an empty temporary variable value; the two saved body versions remain intact.

The complete run recorded **zero synthetic storage writes**, unchanged serialized saved-library state and no captured application errors. No version was restored, new draft saved, result linked, model called or clipboard copied. This supplements the older exact-version-link acceptance; it does not repeat or claim full restore/import or model-provider verification. The sampled desktop run does not establish small-screen visual fit, assistive technology or OS IME behavior.

Owned tab 71, server 8811 and its dedicated Terminal tab were closed at 08:31 UTC. Inventory showed no Electron and only the pre-existing blank Chrome tab 69.

## Verification boundary

The source had already passed **17,304 Node tests** and **91 Python tests** for the preceding calendar fix, with exact-commit CI successful. Those counts identify the runtime baseline, not a newly executed aggregate for this documentation-only batch. This document was checked with `git diff --check`; no screenshots, binaries, private data or credentials are included. Publication/version and historical-incident gates are unchanged.
