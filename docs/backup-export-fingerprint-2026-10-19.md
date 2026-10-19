# Complete backup export fingerprint

Ordinary complete-backup preparation now shows SHA-256 of the exact UTF-8 JSON
string handed to the explicit download action. It does not serialize a second
copy, reread storage, or change the backup schema, saved modules, import,
recovery, or migration logic. The fingerprint is computed locally, without a
network request or additional storage write.

The prepared backup is immediately downloadable while hashing. Missing,
rejected, or invalid-length Web Crypto output shows an unavailable message; a
provider that never settles cannot block downloading. A late result can update
only the same still-prepared snapshot, guarded by both generation and object
identity. Cancellation, changing modules, leaving the page, destroying the
view, or requesting download retires that authority.

Compare the displayed fingerprint with SHA-256 of the downloaded file if byte
identity is important. This is not an authenticity signature, evidence of
successful download, a restore test, or proof of a safe browser upgrade.

## Verification scope

The focused suite covers all 127 nonempty module selections, legacy export,
Unicode JSON, real Web Crypto, missing/rejected/invalid digest providers,
nonsettling providers, cancellation and late results. Test data is synthetic and
RAM-only. Browser visual verification has not been performed for this change.
The existing release freeze remains in force; version and release settings are
unchanged.
