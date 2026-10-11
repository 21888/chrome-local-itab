# Native excerpt-variable acceptance — 2026-10-11

Runtime ZIP SHA-256: 6ca3dcfed9e3376b65d4c822c35082f8f0c5af9c7633a7075e058916ac29ab6a.

Actual unpacked extension 1.1.33 on cloud Chrome for Testing. English desktop, light/dark, synthetic qa records only; no user data or credentials.

Passed:
- Apply remains disabled until a saved excerpt is selected; exact body shown for review.
- Keyboard selection/review/apply fills only variable a with tea; b stays keep and saved template stays {{a}} {{b}}.
- Escape cancels unchanged and returns focus to the initiating variable button.
- Archiving the source in another tab invalidates the open review, disables Replace and moves focused Replace to Cancel; Escape still exits unchanged.
- Fresh selection excludes archived source; restoring makes it available again.
- Dark review and current-value replacement warning remain legible.

No product defect observed in this bounded native scope. Read-error injection and full locale/device/screen-reader coverage were not performed; automated race/error tests remain separate. Representative screenshot preserves original JPEG bytes with corrected suffix.
