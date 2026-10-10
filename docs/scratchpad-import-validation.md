# Scratchpad TXT import validation

## Scope

One local UTF-8 TXT file; explicit preview and whole-note replacement only. No new schema, storage keys, permissions, network requests, file watchers or history. Existing Scratchpad Store/Controller remain unchanged. The file must be at most 128 KiB before reading; returned bytes are checked again, fatal UTF-8 decoding preserves a leading BOM, and existing content validation enforces 32,000 Unicode characters / 128 KiB. Import is disabled until the visible saved note is settled. Export remains available.

Chooser and async selection own a captured state reference plus edit generation. Editing (including edit then undo), IME, refreshed/changed state, errors, cancellation, a new chooser and destruction invalidate earlier work. Preview text and filename use textContent. Selection writes nothing. Apply hands original decoded text to the existing draft/save path, preserving line endings independently of textarea normalization. Store compare-and-swap handles unseen remote changes, and verified readback governs saved status. Failed imports after Apply retain an ordinary recoverable draft.

## Automated acceptance — 2026-10-09

- Full Node suite: 460 tests passed.
- Full Python packaging suite: 19 tests passed.
- JavaScript syntax checks passed across the isolated candidate.
- Actual View/Controller/Store model coverage includes own-export roundtrip with BOM, Chinese, emoji, CRLF/CR/LF, whitespace and literal HTML; filename injection; Cancel/Escape/file-picker dismissal with zero writes; byte preflight without reading; oversized returned bytes; character limit and invalid UTF-8; read failures; multiple files and wrong extensions; stale async completion through editing, IME, refresh, remote changes, read errors, cancel, destroy and new chooser; completed-preview invalidation; remote hidden-state privacy; empty replacement; unseen remote CAS; failed save and Retry; failed acknowledgement and verified recovery.
- Independent reviewer: 26 adversarial cases passed against view SHA256 `3f27b41f4ac7e9732e0184bfc7e4745ecea8e8e81eb1b846f9d90d7b39a702b6`, including edits during pending replacement, conflict Retry behavior and focus fallback when preview invalidates.

## Integrated and native acceptance

The integrated repository passed 465 Node tests, 19 Python packaging tests,
all JavaScript syntax checks, JSON parsing and the 26 independent adversarial
cases. A normal-sandbox Chrome for Testing 155.0.8059.39 Linux profile loaded
the exact 58-file frozen runtime on 2026-10-09.

- A real local TXT file containing Chinese, English, emoji and literal HTML
  showed a read-only preview without changing the saved `original42` note.
  Typing into the preview did not edit it. Cancel kept the original note.
- Explicit Replace saved the imported text, and it survived refresh.
- A real exported TXT download was independently compared with the input file:
  both were exactly 87 bytes, SHA256
  `cfea74994a9d4ec849ec14a8792ae20c33cdfbadb8fd6462175f7e9b317b815e`.
- A file with invalid UTF-8 was rejected with a visible error; the current note
  remained unchanged.
- English light and dark wide previews were inspected. In a dark window with
  native outer width 514 pixels, the long filename and metadata wrapped and
  the preview and Replace/Cancel controls remained readable and reachable.
- All 58 runtime hashes matched. Current README images are exact RGB crops of
  the actual light/dark wide frames; [metadata](screenshots/scratchpad-import/capture-metadata.json)
  records originals, hashes, bounds and runtime identity. No resizing,
  retouching or reconstructed interface was used.

## Remaining limits

Actual IME, screen-reader announcements, exhaustive keyboard/focus combinations,
Chinese-interface narrow layout, all templates, other browsers/operating systems,
native simultaneous remote changes and Chrome storage failure injection remain
unverified. Their applicable model coverage is listed above; it is not native
browser proof. Native fixture line endings were LF; exact BOM/CRLF/CR handling
was verified in the model tests, not by this downloaded fixture.

## Later bounded cross-tab check — 2026-10-10

Public 1.1.19 passed native completed-preview invalidation after an observed
other-tab save, newer-note reload/export preservation, and fresh explicit TXT
replacement with exact downloaded bytes. See [two-tab native validation](scratchpad-cross-tab-native-validation.md).
This does not extend coverage to unseen concurrent writes or fault injection.
