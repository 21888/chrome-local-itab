# Scratchpad text export keeps save-recovery guidance

## Reproduced user-facing failure

Two new tests first failed on `920d039ef807840609b5fc78002dde90f0abacf3` using the real Scratchpad Store, Controller and View with synthetic text and injected export failure:

- After a failed write, Export text replaced the explanation that the save was unconfirmed and the draft needed Retry or a recovery copy.
- With a not-yet-saved draft, an export error replaced `Unsaved changes`. A later successful export request left that unrelated error in the shared status.

The source-ownership tests previously prevented old callbacks from overwriting newer feedback, but did not keep a current export's error separate from existing storage guidance.

## Changed behavior

Scratchpad now has a separate polite export-status region. Controller-owned saving, unsaved, validation, read-error and conflict feedback remains unchanged, as do the existing recovery controls, autosave, departure protection and storage protocol.

Export failure uses the existing translated error text and semantic error color. A successful download **request** clears only the previous export error. It does not claim that the browser saved a file, clear unsaved work, or acknowledge a failed storage operation. Same-source renders keep an export error; a changed exported draft retires it. During IME composition, the export still uses the current DOM text. Exact saved/draft CRLF, BOM, Unicode and over-limit recovery-copy behavior is unchanged.

The new region is included in the original private construction ownership, source checks and teardown. The original main-status and generation guards remain in place. Export still captures the original URL/anchor cleanup methods, rejects re-entry and source transfer, and cleans up only its own resources. Successful cleanup cannot clear a replacement owner's export message. No new permission query, clipboard access, network request, storage operation or file-import action is added.

## Recovery and boundary coverage

- Actual failed write → failed export → successful export request → explicit Retry preserves the draft and then saves it once.
- Lost acknowledgement keeps the uncertain-save explanation through export failure/retry. Explicit storage Retry confirms the already-committed draft without another write.
- English and Chinese read-error, conflict and pending-save states retain their exact draft, storage state, generation, selection, focus and available recovery choices.
- Same-source rendering, genuine newer edits and composing DOM text preserve the right feedback owner.
- Replacement, same/cross-document transfer, translation callbacks, cleanup, teardown and feedback-getter transfer cannot authorize writes to the new region after ownership changes.
- The empty export region is hidden by CSS; active errors use the existing theme error token.

Existing source/cleanup/Unicode tests now check the export region while requiring the main status to remain exactly unchanged. The shared DOM model, Controller and Store are not modified.

The first complete Scratchpad run passed 3,023/3,024: the existing line-count boundary test rejected export-feedback cleanup placed inside the count-only source section. An intermediate relocation was still inside that section and also failed. Cleanup was then moved after the main status update, outside the original counting block. The line-count test was not changed or weakened; its complete 19-test file and the subsequent complete 3,024-test Scratchpad run passed. Those failed runs remain diagnostic records, not passing evidence.

## Validation boundary

Final local checks on the changed source:

- `node --test --test-concurrency=1 tests/local-scratchpad*.test.js`: **3,024/3,024**, exit 0.
- `node --test --test-concurrency=1 tests/*.test.js`: **17,506/17,506** across **446** files, with zero failures, cancellations, skips or TODOs; exit 0.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91**, exit 0.
- README's documented JavaScript syntax checks, manifest/locale JSON parsing, and `git diff --check`: passed. Changed JavaScript and diff checks were repeated after moving the export cleanup outside the count block.

All added text, failures and event sequences are synthetic. No screenshot or artifact upload, native GUI file selection, browser download/readback, OS IME, screen-reader or installed-upgrade acceptance is claimed. The existing restricted extension-page navigation is not retried or bypassed. Manifest version, permissions, CI and release workflow remain unchanged; source integration and a future versioned Release are separate stages.
