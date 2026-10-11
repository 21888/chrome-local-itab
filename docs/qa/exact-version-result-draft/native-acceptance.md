# Native exact-version result draft acceptance — 2026-10-11

Runtime ZIP SHA-256: 79fd58d7713b93696955f68fbf0293a911a0f6f99e022606880cd98749aa7c87.

Actual unpacked extension 1.1.36 in cloud Chrome for Testing, English desktop, synthetic records only. No personal data or credentials.

Passed:
- Retained oldtea preview after saving new{{x}} opens a new blank result draft referencing old{{x}}, with zero saved records before explicit save.
- Only stable exact IDs are transferred; no copied body or automatic save.
- Explicit save persists the exact old reference and its result appears live under the retained source version.
- Keyboard Enter opens the new tab; returning preserves the source tea preview.
- Archiving source after draft opening blocks Save with actionable error and preserves entered destination text.
- Opening the observed exact route after source archive fails closed, selects no alternative saved record and leaves existing synthetic items intact.

No product defect observed in this bounded scope. Dark theme, narrow layout, a separate unsaved source-editor scenario, full locale/device/screen-reader matrix and injected read failures were not exercised. Independent model tests cover additional malformed routes, races, guarded retries and restore-body mismatches. Screenshot is an unchanged reviewed JPEG capture with corrected suffix.
