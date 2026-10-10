# Shortcut editor reload guard validation

Application-triggered configuration reloads now wait while an Add/Edit dialog is
open or a shortcut save is pending. Empty Add and unchanged Edit dialogs are also
preserved. Cancel or completion of the current save releases the guard. A closed
editor's pending write still blocks reload; an older save completion cannot
release a newer open editor. Explicit discard asks its existing custom confirmation once and is unavailable
while a write is pending. The later departure guard can additionally request a
native warning for dirty shortcut drafts; canceling either prompt preserves them. Browser refresh/close protection was outside that original
change; the later [shortcut departure guard](shortcut-departure-validation.md)
adds dirty-draft and pending-save protection without changing these automatic
reload rules.

## Automated regression

Run `node --test tests/shortcut-reload-guard.test.js` from the repository root.
The regression fails the preceding production implementation on empty Add and
passes this implementation. It covers Add/Edit with and without draft changes,
Cancel/current-save release, closed pending writes, stale success/false/rejection,
explicit discard, and the actual page Sync listener. Local shortcut/category,
Tasks and focus-timer events do not invoke that Sync reload path. The listener's
applied remote Sync event is modeled; no live Chrome Sync account was tested.

Related lifecycle, save-session and write-conflict regressions also pass.

## Native evidence and limits

An isolated copy of base `5814d3745d809c5b946341cf6b8ef6551d930408` with the
identical lifecycle file passed ordinary native Add Cancel, Add Save, Edit Cancel,
Edit Save and reload-persistence checks in Chrome for Testing 155.0.8059.39 on
the dot cloud Linux desktop. Synthetic local shortcut data only was used.
The tested lifecycle file SHA256 is
`92e77cb5f8934cdc315d14d2a24e9688ecea6b8eed1e379ea930912639735781`.

Remote Sync while editing, pending-save races and storage failures were not
exercised natively. Their evidence is the DOM/event model, not browser acceptance.
That original reload change did not alter provider permissions, accounts,
network behavior or browser unload warnings. The later departure guard is
validated separately.
