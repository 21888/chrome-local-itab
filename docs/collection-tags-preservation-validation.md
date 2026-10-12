# Preserve unchanged collection tags — development validation

This ordinary fix retains manifest1.1.94 and is not a release. When the displayed
tag-input string is unchanged, editing/saving or saving a copy retains the
original tags array exactly, including valid imported comma-containing labels.
Only an actual change to the tag text invokes the existing parser. Existing
validation, body history and backup format are not relaxed.

The two implementation/test files match the frozen source with2495 Node/64 Python
and five targeted tests passed. The actual combined Unicode-label plus tag-fix
tree passed2498 Node with strict unhandled rejections and64 Python tests.
Native edit/save representative verification is pending. Imported comma-label
and Unicode boundaries are synthetic evidence until explicitly observed in a
native browser. No new permission, automatic write or network action; final
release remains gated on accurately bounded native and runtime identity checks.
