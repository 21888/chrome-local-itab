# Exact prompt-version links: native acceptance

2026-10-10. The bounded native gate passed against a frozen 82-file candidate with manifest version 1.1.21. Local release source 1.1.25 differs only in the manifest version; all other runtime bytes match. This is local verification, not evidence of remote publication.

- Full final regression: **1,458 Node tests and 52 Python tests passed**, including independent adversarial tests.
- Native Chrome: select an older prompt version without typing IDs; inspect literal body; selection alone does not link; Apply changes draft only; discard preserves saved state; explicit Apply + Save survives reload.
- Renaming the prompt and creating newer body versions do not rebind the linked body. Archived prompts retain exact resolution with honest provenance. Draft unlink and discard preserve the saved link.
- The 566-pixel outer-window picker was usable with native keyboard controls at 100% and 125% zoom. This is not a measured CSS viewport or physical phone test.
- An original 3,649-byte complete backup preserves exact linked IDs, all three prompt bodies, archived state and unchanged collection body/history.

[Detailed native report](qa/prompt-links-native/acceptance-notes.md) · [Download comparisons](qa/prompt-links-native/comparison.json) · [Historical 82-file source verification](qa/prompt-links-native/source-integrity.json).

Reproduce download verification with `node docs/qa/prompt-links-native/verify.cjs`. The optional `--runtime-dir` argument checks the included original source hash manifest against a preserved candidate directory. It is not expected to match the release manifest, whose version was changed explicitly. Original download and screenshot bytes are unchanged.

## Not verified natively

Read/corruption fault injection, missing-version races, recovery-only provenance, uncertain writes, asynchronous Apply races, DOM identity, physical mobile devices, all locales/themes, IME/Unicode/CRLF matrices, full backup restore replay and persistent unlink via Save were not exercised in this bounded native gate. Relevant automated checks do not constitute native verification.
