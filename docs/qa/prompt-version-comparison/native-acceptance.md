# Native prompt comparison acceptance — 2026-10-11

Runtime ZIP SHA-256: 05e935eb069b5f0e061687a72d979d0a711622c1ad12d6f3ccab15296d9efff3.

Actual unpacked extension 1.1.35 in cloud Chrome for Testing, English desktop, synthetic records only. No user data or credentials.

Passed:
- Two saved versions show unchanged/removed/added groups with literal {{x}} placeholders and LF/final-newline summaries.
- Original text expands literally; keyboard From/To reversal changes comparison direction.
- Close and Escape restore launcher focus, while preview x=tea, the retained old body and v1 history selection remain unchanged.
- Dark theme and 200% browser zoom reflow keep controls, diff groups and Close usable.

Limits: physical narrow-window resize was not achieved with available bound QA controls; 200% zoom is recorded as zoom/reflow coverage, not a full device-width matrix. Screen-reader acceptance and native read-error injection were not performed. Automated algorithm/race checks are separate. Screenshot preserves reviewed synthetic JPEG capture with corrected suffix.
