# Settings save native acceptance — 2026-10-09

The integrated Settings repair passed 535 Node tests and 19 Python packaging
tests. Independent review also ran five actual-source reproduction scripts and
39 focused tests. Those storage/DOM models are separate from the native checks
below.

## Cloud Linux Chrome for Testing

Normal-sandbox Chrome for Testing 155.0.8059.39, an owned disposable profile and
synthetic local data were used. Two real Settings tabs were loaded from the same
configuration before these operations:

- Tab B saved quote `quote42`; older A disabled the Clock Module. Reloading B retained
  both quote `quote42` and the unchecked Clock setting.
- B saved quote `quote84`; older A attempted quote `draft99`. Explicit Save showed the
  conflict guidance, A retained its draft, and an independent B reload retained
  the saved `quote84`.
- With A loaded before the replacement, B imported a complete synthetic JSON
  backup containing quote/category `restored77` and Clock=false. A then attempted
  only Clock=true. The pre-restore stored Clock value was also false, so refusal
  isolated replacement invalidation from an ordinary changed-field conflict.
  Explicit Save was refused. Independent B reload retained quote `restored77`
  and Clock=false; A retained its checked Clock=true draft. The imported category
  was not separately visually rechecked.

The frozen runtime contains 60 files. Its exact canonical ZIP SHA256 is
`162279ddf35b4ff0232b447c45a351b3a78151861c10a20e5131e15601035f09`
(1,240,996 archive bytes; 1,233,734 source bytes).

These checks do not cover macOS/Windows, native permission prompts, live Drive
or Chrome Sync accounts, injected I/O failures, or every helper interaction.
Those untested native areas must not be inferred from automated model coverage.
The separate dashboard cached-parent-object writers are outside this snapshot.

All 60 runtime hashes matched before and after the native checks. Owned browser
windows were closed normally, discarding only the recorded synthetic draft.
