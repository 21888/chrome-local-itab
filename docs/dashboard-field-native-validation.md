# Dashboard field-write native acceptance — 2026-10-09

Integrated automated verification: 564 Node tests, including 29 dashboard
regressions, plus 19 Python packaging tests. An independent reviewer reproduced
both original defects with actual entrypoints and storage, then checked the
fix against exact runtime hashes. These are separate from browser evidence.

## Native cloud Linux Chrome

Normal-sandbox Chrome for Testing 155.0.8059.39 used synthetic local data in an
owned disposable profile. The dashboard was opened before the corresponding
Settings changes:

- Settings saved `https://example.com/new?q=%s`; selecting Bing in the older
  dashboard preserved that exact custom URL. A fresh Settings reload showed both
  Bing and the new URL. No search or external navigation was executed.
- Settings saved Shortcut Titles off, horizontal gap 24, icon size 96 and title
  size 24. These are the actual observed/clamped values, not originally attempted
  input values. Double-clicking the older dashboard to hide it preserved all four
  preferences in fresh Settings reloads. Showing the dashboard again survived a
  reload.
- A complete synthetic backup was restored while the dashboard retained its old
  baseline. Its attempted Bing-to-DuckDuckGo choice was rejected with visible
  English conflict guidance. The control returned to its last confirmed Bing
  selection rather than displaying an unsaved choice.

Frozen runtime: 60 files, 1,243,604 source bytes. Exact canonical ZIP:
1,250,866 bytes, SHA256
`b6d4f479240eea7892f67c2f9189068ac2a38f9a63ec33fbcd003d324d5ed79f`.

Native coverage is limited to these cloud Linux flows. Custom-template conflicting
draft retention, injected read/write failures, pending-write ordering and detached
control events have source/model coverage, not additional native acceptance here.
No macOS/Windows, real provider accounts, live Sync/Drive authentication, permission
prompt, or exhaustive theme/viewport claim is made.
