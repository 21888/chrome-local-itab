# Tasks: canonically equivalent Unicode search

## User behavior

A task saved with `Café` could not be found by a query containing visually identical `Cafe` plus a combining acute accent, and the reverse direction also failed. Both representations are retained verbatim by Tasks, so a pasted query could miss existing tasks solely because its Unicode representation differed.

The task filter now compares canonically equivalent text through NFC after the existing case-insensitive conversion. It is still literal substring search, **not fuzzy or accent-insensitive search**: `Cafe` does not match `Café`. No NFKC compatibility folding is added; full-width letters, ligatures and circled digits are not converted to their ASCII lookalikes. Emoji ZWJ sequences remain distinct.

Only comparison keys are normalized. Saved task strings, displayed task text, copied text, quick-entry/editor drafts and the visible search field remain exact originals. The existing trimmed/lowercase `filterQuery` and raw-input ownership comparisons are unchanged. An uncommitted raw filter edit cannot adopt an existing action/review merely because the text is canonically equivalent.

All five result comparisons use the same private matcher: visible rows/counts, active copy, completed copy, removed copy, and the removed-task restoration preview's expected result set. Search does not write storage or bypass a review/confirmation.

## Regression evidence

Two new tests using the real Tasks Store/Controller/View first failed in both NFC-to-NFD and NFD-to-NFC directions (zero visible active matches rather than one). After the fix, matching works across active, completed and removed tasks without changing their stored records.

Nine new tests cover:

- Both Latin composed/decomposed directions, reordered combining marks, Japanese kana plus dakuten, decomposed Korean Hangul, unchanged Chinese matching and existing case-insensitive matching.
- Accent, compatibility-character and emoji-ZWJ boundaries: no unintended accent stripping or NFKC folding.
- Copies of active/completed/removed results contain exact original Unicode strings, not normalized display copies.
- IME event deferral, raw search text, independent task drafts, whitespace-only filters and Clear retain their prior behavior.
- A canonically matched removed task opens an exact-original restoration review, while an uncommitted raw filter change remains rejected. Cancelling that review performs no write.

The final complete Tasks View file passes **85/85**. An intermediate new preview assertion targeted the parent `li`, whose synthetic DOM model does not aggregate child text; it was corrected to assert the actual `.tasks-recovery-text` node, leaving product code and the expected original text unchanged. Local reproduction logs are retained under `evidence/tasks-canonical-search/` and are not uploaded.

Final applicable acceptance: the complete Node suite (`node --test --test-concurrency=1 tests/*.test.js`, 430 files) passed **17,033/17,033**, zero failures, exit 0. The complete Python suite (`python3 -m unittest discover -s tests -p '*_test.py'`) passed **91/91**, exit 0. Both changed JavaScript files pass syntax checks and `git diff --check` passes.

The test fixture accepts an explicit synthetic workspace only to exercise the existing workspace-bound restoration review. No live task data is used. This is model/logic validation, not native OS IME or installed-upgrade proof. No file-import approval, permission, storage schema, version, Release or Web Store action is changed.
