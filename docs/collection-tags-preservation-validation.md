# Preserve unchanged collection tags — development validation

This ordinary fix retains manifest1.1.94 and is not a release. When the displayed
tag-input string is unchanged, editing/saving or saving a copy retains the
original tags array exactly, including valid imported comma-containing labels.
Only an actual change to the tag text invokes the existing parser. Existing
validation, body history and backup format are not relaxed.

The two implementation/test files match the frozen source with2495 Node/64 Python
and five targeted tests passed. The actual combined Unicode-label plus tag-fix
tree passed2498 Node with strict unhandled rejections and64 Python tests.
## Safe native smoke — 2026-10-12

Independent CfT155 Chinese desktop-light synthetic profile loaded112-file dev94
ZIP `72d3d878a4846cdb84e1e9f1a54b947eaf62aa2e2ce8ed13a48fa152aa579246`.
Existing gamma showed original title/body, empty tags and1/20 body versions.
Editing only its title as a temporary draft, then explicitly discarding and
reopening, retained original title/empty tags/body version. Three records and
Default14/Clarity light/Grid remained. No save/import or new record/version.

Existing native fixtures contain no comma-bearing tags. Imported comma-tag
round-trip fidelity and save/copy preservation remain synthetic-only; native
coverage is ordinary empty-tag rendering and title-draft discard/reopen. No
provider, permissions, injection, DevTools, screenshot upload or dark/320 matrix.
