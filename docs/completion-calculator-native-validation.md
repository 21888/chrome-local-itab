# Completion Undo and scientific calculator: native validation

Verified on 2026-10-10 with official Chrome for Testing 155.0.8059.39 on the cloud Linux desktop, using a separate synthetic profile. All 60 runtime files matched commit `b9597564fe36af268a2d69ce7e440a6409f04b12` byte-for-byte. Native controls and screenshots were used; no external destination was opened.

## Passed

- Ordinary task completion offered Undo completion and restored the same active task. Unsaved input and the current filter remained.
- Pinned Next action completion offered Undo completion. Undo restored the active task without automatically pinning it again; the draft and filter remained.
- Existing removal Undo still restored the removed task.
- English dark mode and a 400×618 dark viewport displayed the Undo action and restoration correctly.
- Chinese ordinary completion displayed “撤销完成” and restored the active task.
- English light calculator: `=1/10000000` returned `1e-7`; `=1e-7*2` returned `2e-7`; malformed `=1e+` and overflow `=1e309` produced their local errors.

The owned test browser was closed afterward; other existing desktop windows were preserved.

## Scope and evidence

This pass did not test Chinese pinned completion, every template, other operating systems, assistive technology, real storage exhaustion, every concurrent interaction or clipboard behavior. Deterministic tests separately cover stale versions, uncertain writes and retry ownership. The full integrated suite passed 717 Node tests and 19 Python packaging tests before this documentation-only update.

Three original unmodified desktop captures and their hashes are in [the current screenshot directory](screenshots/completion-calculator-1.1.7/capture-metadata.json). Browser chrome is retained; images were not cropped or redrawn. The runtime manifest SHA256 is `ed207751bb386dfed5617e52c4cd2935532c736205793fb58129cd62afbb980d`.
