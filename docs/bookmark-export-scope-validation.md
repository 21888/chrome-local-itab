# Bookmark HTML scope preview validation

## Feature and compatibility boundary

The previous export intentionally downloaded all saved bookmarks immediately after
its privacy confirmation. This feature adds a separate, saved-only scope/count
preview and explicit final download action. It is a new workflow, not a claim that
the previous one-step export was defective.

The original `serialize(config)` implementation and its limits remain unchanged.
The new pure preparation helper copies only export fields, validates the complete
source with that serializer before filtering, and freezes the copied snapshot and
selected HTML. All output is byte-identical to the previous serializer. A category
selection uses its real ID, retains the one folder and all matching links in order,
and includes empty categories. Same-name category labels show their IDs; a literal
`all` ID cannot collide with the typed All choice. Orphans are included only in All.
No extra runtime file, package allowlist entry, permission or network call was added.

Download performs a second successful-read-boundary read and compares the complete
ordered export fields, including unselected records. It uses the reviewed HTML
without regenerating it. Related changes/read failure retire the preview; appearance
and other unrelated saved fields are excluded from comparison. Existing appearance
CSS custom-property repaints are also excluded from visibility invalidation.

The Options view binds its generation to the page Settings generation, both captured
workspace session references/identities and the visible DOM host. Cancellation,
changed scope, hide/show history, detach/reinsert, pagehide, destroy, invalidated or
replaced workspace and departure cannot revive an older read or verification.
The existing lifecycle receives only this view's pending/work flags, departure
cancellation and beforeunload guard. Complete restore respects its open preview;
Save drafts does not download it. Focus remains on an enabled Cancel action while
verifying, returns to the opener after an owned completion, and is not stolen from
an unrelated control the user deliberately focused.

## Reproduction and finite local checks

Baseline: commit `41c1acf498232b12400645d7efeb6817b059085d`, tree
`9685067b9f907e1aa06c9ebf6077504584bb1f6d`.

Before runtime changes, the new explicit-preview entry assertion failed because
the original click immediately created one Blob. Five pure preparation tests failed
because the new API did not exist. The sixth test only expected throwing and thus
already passed on the absent API; it is not independent baseline validation evidence.
The original source hashes, full red test sources and raw failure logs were retained
outside the checkout for review. One subsequent run found a syntax typo in a new
regular expression; that test syntax was corrected, with its failed log retained.
No existing serializer capacity test or assertion was weakened or removed.

Final bounded commands use Node v24.19.0, a 512 MiB heap and test concurrency 1:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/bookmark-export-scope.test.js tests/bookmark-export-options.test.js tests/local-content-lifecycle.test.js tests/complete-backup-options.test.js tests/workspace-lifecycle.test.js
node --max-old-space-size=512 --test --test-concurrency=1 --test-name-pattern='^(deterministic folders, duplicate URLs, same names, empty folders and root fallback|ordinary exported fixture parses with folder and title content intact|escapes text/attributes and whitespace, derives absolute HREF and preserves source Unicode|reads only titles URLs category membership and category identity/name|rejects whole export for unsafe URLs, malformed fields and duplicate category IDs)$' tests/bookmark-export.test.js
node --max-old-space-size=512 --check options.js
node --max-old-space-size=512 --check shared/bookmark-export.js
node --max-old-space-size=512 --check shared/local-content-lifecycle.js
git diff --check
```

The main finite selection passes 42 tests and the exact original serializer-name
selection passes 5, all without failures or skips. Coverage includes:

- Full-output byte parity, real `all` ID, same-name categories, duplicates, Unicode,
  HTML escaping, full query/hash, empty category, orphan and strict selection identity
- Full-source malformed field, unsafe URL, duplicate-ID and cardinality rejection
  before filtering; independent frozen snapshots and no non-export-field reads
- Privacy-prompt cancellation before all storage reads/Blobs, counts with no file,
  explicit download, re-open resets, saved-only source and no Settings save
- Every relevant field and order, including outside the selected category; harmless
  saved appearance/icon changes; read-back failure requiring a new preview
- Repeated clicks, initial-read and verification cancellation, late completion after
  a newer preview/scope, stale selector values, visibility/detachment history and
  workspace/session/generation/replacement/suspension/departure fences
- Existing MIME/filename, delayed URL revocation, anchor cleanup and failure retry;
  final output is the previously prepared HTML, with no fresh serialization
- Restore/reload/draft/departure guards, pending lifecycle flags, English/Chinese/
  fallback labels, Escape and focus behavior using the model's native-disable blur
  option; the focus model remains a test double, not browser acceptance

A byte comparison verifies that the Options prefix outside the replaced export
function is unchanged except for the one complete-backup guard line, preserving
its original mixed line endings. A second comparison verifies the original
serializer prefix and entire original serializer test file are unchanged. Exact
commands, source SHA256s, candidate tree, exit codes and raw logs accompany the
handoff rather than being substituted by this narrative.

## Not established by these checks

The large existing 20,000-link / 32 MiB case was deliberately not run in this finite
window. Its original assertions remain intact for exact-source CI. No full suite,
scale suite, packaging build, real browser, screenshot, upload, push or release ran
as part of this implementation window. Independent review and exact-source CI are
separate gates and are not claimed here.

The Chrome download/import evidence dated 2026-10-09 in the main export guide is
preserved historical evidence for the earlier one-step all-bookmarks flow. It does
not establish native acceptance of these new controls, accessibility, keyboard,
asynchronous recheck/cancellation behavior or browser/disk download completion.
