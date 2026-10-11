# Explicit selection capture: bounded native acceptance

2026-10-11. The integrated local 1.1.27 candidate passed **1,524 Node tests and 52 Python tests**. Native acceptance used the frozen 88-file runtime, manifest 1.1.25, in an isolated dot-cloud Chrome for Testing 155.0.8059.39 profile with synthetic data. Integrated runtime bytes match that candidate except for manifest version 1.1.27. This is not publication or installation on a user's device.

[Detailed native sequence and limitations](qa/selection-capture-native/acceptance-notes.md) · [Usage and privacy](selection-capture.md).

## Verified natively

- Native selection context menu opened a fresh unsaved collection draft. Title and saved-source fields started blank; the optional sanitized source was unchecked.
- An export before Save had exactly the same durable content and recovery as the empty baseline. Explicit source opt-in and Save produced one record with one body-history entry.
- Query and fragment were absent from the opted-in source. Literal HTML-like text and multilingual Unicode remained text.
- Successful real session claim/ack exercised extension-page sender frame/tab checks and removed the opaque capture token from the URL.
- Saved-record reload retained exactly one record. An editable-field selection opened a fixed error with no durable change.
- A second unsaved capture, post-consumption duplicate tab and subsequent reload did not replay or save a draft. The final export's durable content, identifiers, revision/history and timestamps exactly matched the first saved export.

## Formatting limitation

The selected multiline preformatted fixture arrived as one line: the original two newlines became spaces. The implementation preserves Chrome's provided selectionText unchanged; source inspection supports browser normalization as the cause, but the raw API payload was not instrumented. Do not claim preservation of original page formatting or original multiline code. Users should review captured text carefully and use manual copy/paste when that formatting matters.

## Not verified natively

Incognito and forced service-worker termination/recovery were **not tested**. Expiry boundaries, session failure injection, oversized/full queues, hostile frames, spoofed senders, pre-ack duplicate binding and late-edit hydration races have automated coverage only. There was no exhaustive responsive/accessibility matrix, real account content, or repeated full backup/restore acceptance.

## Portable original evidence

The evidence directory retains ten original screenshots, four untouched synthetic JSON downloads, the static fixture, original checksums and a standalone verifier. Browser profiles, logs and launchers are excluded.

Run `node docs/qa/selection-capture-native/verify.cjs` to validate evidence hashes and export semantics without a source checkout. Its optional `--runtime-dir` mode compares the **original frozen 1.1.25 manifest**, so it intentionally rejects the integrated 1.1.27 manifest. The separately recorded `source-integrity.json` establishes that all other 87 runtime file hashes match and that the manifest differs only in version. Historical evidence and original hashes are not rewritten to imply native execution of the version-bumped build.
