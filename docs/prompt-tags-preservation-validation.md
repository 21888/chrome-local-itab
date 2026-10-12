# Preserve unchanged prompt tags — development validation

This ordinary fix retains manifest1.1.95 and is not a release. Editing/saving
or copying a prompt with unchanged displayed tag text retains the original tags
array exactly. Explicit tag edits continue using the existing split/trim parser.
No backup schema or accepted imported values are restricted.

Frozen implementation passed2505 Node and64 Python tests, including seven new
regressions with the real Store and synthetic data, plus runtime packaging.
## Safe native smoke — 2026-10-12

Independent CfT155 Chinese desktop-light synthetic profile loaded112-file dev95
ZIP `cea4fdff4bcfca81e1510342ee0f02ac8d94d3f0df9860dbe1cd5dcdfcdbdb5e`.
The prompt library had0 saved records. A new unsaved ASCII title draft displayed
empty tags/help. Closing confirmed discard and retained0; reopening showed blank
title/body. Default14/Clarity light/Grid restored. No save/import or fixture added.
Imported comma-tag preservation, existing-record edits and save/copy round trips
remain synthetic-only. This is empty-library draft/discard smoke, not native
core-fidelity proof. No provider, permissions, external links or uploaded images;
dark/320 and full focus matrices were not run.
