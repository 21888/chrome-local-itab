# Prompt Unicode search excerpt correction

Development fix on 1.1.98. Searching lowercase-expanded text (for example repeated U+0130, İ) could find a prompt but place its excerpt after the actual match. The search offset now maps folded UTF-16 positions back to original code points before slicing. Matching and filters are unchanged; the existing 180-code-point content window and surrogate-pair preservation remain intact.

Five deterministic regression cases cover expansion before matches, mixed supplementary characters and exact excerpt bounds. The implementation strict full suite passed 2532 Node tests and 81 Python tests; the same two frozen implementation files are included here. The five targeted tests were also rerun in this prepared checkout.

Limited Chinese desktop-light native smoke passed: empty prompt library search/clear and unsaved title draft discard, with zero saved records and dashboard baseline preserved. Actual long Unicode excerpt rendering was not observed natively. Unicode input and long expansion-boundary matching are synthetic coverage until separately observed. This fix adds no storage writes, network requests, permissions or version bump; ordinary feature publication remains skipped.
