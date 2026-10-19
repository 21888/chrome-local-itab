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
RAM-only. The browser checks below cover the later copy-enabled view as well.
The existing release freeze remains in force; version and release settings are
unchanged.

## Explicit fingerprint copying

When hashing succeeds, **Copy fingerprint** writes only the displayed 64-character
hex fingerprint to the clipboard, directly from that explicit click. Preparation
never copies data. Missing, rejected or throwing clipboard support leaves manual
selection and download available. A pending copy prevents duplicate copy requests
without disabling backup download or moving keyboard focus. Cancellation, a new
selection, download, page departure or destruction prevents late copy feedback
from updating another snapshot. An already-requested clipboard write cannot be
withdrawn by subsequently cancelling the summary.


## Browser check of the copy-enabled view

On 2026-10-19, a fresh localhost page served 138 frozen production runtime files
with a synthetic in-memory Chrome API bridge. English/light mode prepared an
all-module summary with a visible 64-hex fingerprint. Clicking Copy showed its
success message and retained button focus; Tab then Enter on Cancel removed the
summary and returned focus to Prepare. Chinese/dark mode repeated preparation
with Scratchpad only, localized copy feedback and Escape cancellation.

No download, file chooser, import, restore, browser extension installation, or
actual-user profile was involved. Browser automation's virtual clipboard did
not expose the value written by the page: exact OS clipboard-byte verification
remains unperformed. Automated tests independently verify the exact 64-hex
argument sent to clipboard support. UI success feedback alone is not proof that
a system paste target received those bytes. This remains no upgrade certification.
