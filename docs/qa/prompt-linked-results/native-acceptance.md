# Native Chrome acceptance — 2026-10-11

Runtime ZIP SHA-256: c6fdfa0c8d354ee766fc890d99090b63158ca7c821a7f688438b25a0d40202f4.

Scope: actual unpacked extension 1.1.32 on cloud Chrome for Testing, synthetic records, English desktop, light and dark themes. No user data or credentials were used.

Passed:
- Saved collection linked to exact prompt version appears live.
- Card opens its exact collection in a new tab; closing that tab preserves the original preview.
- Saving v2 retains the v1 variable session and linked result until values are cleared.
- Clearing values switches scope to v2 and excludes v1-only links; relinking updates the result live.
- Archiving removes the card; restoring brings it back.
- Dark theme remains legible; Tab focuses the result and Enter opens the exact destination.

Limitations: native read-error injection was not performed because the production UI has no safe deterministic trigger. Automated UI-model tests separately cover read failures, stale responses, and cleanup. This is not a full locale/device matrix or Chrome Web Store publication proof.

Representative screenshot: 07-dark-keyboard-card.jpg. The original captured bytes are JPEG and retain their original dimensions; only the file suffix was corrected.
