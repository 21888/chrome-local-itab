# Invalid local-copy review feedback

Ordinary fix on 1.1.106. If workspace validation invalidates the local review during an explicit copy attempt, the view removes stale copy-ready feedback and shows accurate expired-review status. This can occur when another page trashes the owning workspace before or after the clipboard operation. It does not imply ordinary workspace switching is broken. A clipboard operation already completed cannot be undone; feedback does not claim otherwise.

Frozen strict serial Node2665/2665 and Python81/81 passed;112-file runtime package verified. Real Workspaces regressions include15 cases: eight invalidation cases fail on the old baseline and pass after the fix, with seven controls retained. Independent review found no blocker, including additional race/focus checks. Successful-copy and ordinary-denial focus behavior is unchanged. No storage, provider, permission or clipboard-read operation added.

Limited Chinese desktop-light normal-path native regression passed: blank connection, no-source local review, explicit OS copy/paste of a286-character synthetic prompt into local unsaved question, visible text/count match, edit invalidation and Escape discard/cancel. No workspace deletion/failure was induced; workspace trash/copy races remain synthetic evidence until separately observed. No full browser/platform/accessibility matrix is claimed.
