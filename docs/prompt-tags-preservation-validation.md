# Preserve unchanged prompt tags — development validation

This ordinary fix retains manifest1.1.95 and is not a release. Editing/saving
or copying a prompt with unchanged displayed tag text retains the original tags
array exactly. Explicit tag edits continue using the existing split/trim parser.
No backup schema or accepted imported values are restricted.

Frozen implementation passed2505 Node and64 Python tests, including seven new
regressions with the real Store and synthetic data, plus runtime packaging.
Native verification is pending. Comma-bearing imported-tag save fidelity is
synthetic evidence unless explicitly exercised natively; routine empty-tag UI
smoke would not certify that boundary. No new permissions, network requests or
automatic writes. Formal release awaits a useful second feature and accurately
bounded native/final identity checks, rather than a single-fix extra version.
