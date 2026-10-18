# Fixed shortcut-column setting: clearer help text

2026-10-18. Baseline: `7203552254d4efcd0984130ca8aec204113cad8f`.

## Observed issue and retained contract

A real Clarity static-renderer check at a 390px iframe viewport showed six saved
shortcut columns remaining six columns, leaving very narrow tiles. This is the
existing fixed-column contract, not a responsive-layout defect. The saved
number must not be silently reduced, replaced by an automatic mode or rewritten.

The existing English hint said “Limit how many shortcuts appear in each row
when auto arrange is on”; Chinese named the count but did not explain its
narrow-window behavior. The settings control currently accepts 1–10, defaults
to 6, and has no automatic-column choice.

Only the existing visible hint is clarified in English, Chinese and the English
HTML fallback: grid mode keeps the fixed count even in narrow windows; users
can choose a smaller count for wider, more readable tiles; free placement does
not use this setting. The original input now references that same hint through
`aria-describedby`. No new control, default, layout algorithm, script, CSS,
storage key, schema or write path is added or changed.

## Validation

Three new tests failed on the unchanged source: missing input-description
association and the two old localized strings. All existing tests/helpers
remain byte-for-byte unchanged.

The new tests extract the actual input, label and hint markup and run the real
`i18n.js` against both catalogs in the existing DOM model. They verify the
visible shared description, unique ID, label association, 1–10 range/default6,
localized text, unchanged typed draft/focus, and zero storage/network activity.
The initial test fixture was corrected to mirror the DOM model's explicit
`dataset` mapping and its undefined return for absent attributes; these were
fixture corrections, not production changes.

Focused validation: 47 Node tests passed across the new hint, layout modes,
layout drafts/write conflicts, shortcut toolbar and Clarity suites. Python:
84 tests passed. `git diff --check` passed. Full unchanged CI remains required.

This is copy and accessibility-association validation, not a new screen-reader
or native-extension acceptance claim. The preceding static visual observation
motivates the explanation; no automatic responsive-column behavior is claimed.

Independent review verified the actual fixed-column/free-placement code paths,
unchanged defaults, unique visible description and real localization harness.
It separately passed the same 47-test focused set and a 29-test combination
including free-layout fitting. The two test runs overlap; their counts are not
presented as distinct test coverage.
