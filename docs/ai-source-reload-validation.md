# AI saved-source reload

“Reload saved sources” explicitly rereads the current workspace's saved note and
the global AI collection. It uses the same fixed-workspace source loader as panel
opening. There is no polling, provider request, permission request, new storage
key or persistence write.

A selection or an edited excerpt anywhere in the current list requires
confirmation, including filtered-out and unselected edits. Cancel performs no
read and changes no state. Successful reload replaces the entire source list
with unselected rows. Title, scope and selected-only filters remain unchanged.
The question, connection fields, answer title, previous response, original
response snapshot and snapshot-save choice are retained. Request and task
reviews become stale; the existing response retains its original provenance.
Individual excerpt restoration now uses the most recently loaded baseline.

Rows are built off-screen before the existing list or reviews change. Failed
reads/builds preserve them, and initial read failures can retry in the same
panel. The reload button is disabled during source loading, other pending UI
operations, permission requests, transport, preset persistence and unresolved
answer/task saves. Double clicks share no additional read. Close, pagehide,
workspace departure and generation changes reject late results.

## Automated coverage

- Atomic list replacement, added/removed sources and literal HTML-looking text.
- Selected and unselected edited hidden rows require confirmation; cancel is
  zero-read and preserves generation, review, editors and status.
- Clean/empty lists reload without confirmation; new rows are never selected.
- Existing answer, original snapshot and save metadata survive reload.
- Read/build failures retain row identity, request review and task review.
- Initial failures can retry; a successful retry clears old task review.
- Repeated/direct clicks during pending and uncertain operations are rejected.
- Close/pagehide and workspace/generation changes prevent late replacement.
- Source loader checks generation before and after the saved-source read.

Limited Chinese desktop-light native validation passed with one edited alpha source: cancellation preserved query, selected edit and request review; confirmed reload cleared selection/edit and old review while preserving query, question and connection. Reselecting restored saved alpha original49. No external source changes or writes occurred. External additions/deletions, read failures, races and existing-answer preservation remain synthetic-only; no dark/responsive/full-filter matrix.
