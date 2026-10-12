# Consistent navigation country labels — development validation

This ordinary fix retains manifest1.1.92 and is not a release. A shared country
label helper is used by the dropdown, active chip and expanded details. Unknown
values stay localized unknown; unavailable, throwing or invalid Intl display
names fall back to the ISO code. Catalog data and exact filtering are unchanged.

The actual combined contrast-plus-label tree passed2478 Node tests with strict
unhandled rejections and64 Python tests. The two implementation/test files match
the independent frozen source. Native consistency checks are pending; synthetic
Intl fallback cases do not certify every browser/locale display or full UI matrix.
No new permission, storage or network action. Formal publication requires bounded
native verification and final package identity checks.
