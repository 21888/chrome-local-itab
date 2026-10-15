# Read-only import receipt review

Recovery now separates **current workspace import status** from retained configuration copies. The status section reads current registry-attributed bundles only, including their current Trash membership and generation. A historical copy with the same ID never becomes the current import. The existing workspace query filters both sections independently; invalid/repeated queries require an explicit **Show all saved copies** choice. No copy is selected or downloaded automatically.

## What a comparison means

- **Recorded as pending / verified** reports the saved receipt's status, not a new verification performed by Recovery.
- **Match / mismatch** compares the complete, currently readable source against its recorded SHA-256 fingerprint.
- **Missing** identifies an absent retained recovery object. **Unavailable** means an input cannot be trusted or completely read; it is never treated as a mismatch or a match.
- **No receipt**, **invalid receipt**, and **unsupported version** remain separate states.
- No original import file is supplied here. Its request fingerprint is only displayed as recorded; file identity is never checked.

Even matching target and recovery fingerprints do not complete, unlock or settle an earlier import, prove recoverability, or grant a download capability. Normal file verification remains a separate flow in Settings. A mismatch does not reconstruct the original target configuration: the receipt contains only its fingerprint. The inspection time and Refresh control make the point-in-time scope explicit. Stable repeated reads detect edits during inspection; they are not an atomic transaction or a promise of live status after the final read.

## Read boundary and digest parity

The inspector reads an explicit fixed key set plus keys derived from the bounded registry. The only new root key is `privacy`. It never reads all storage, enumerates orphan keys, loads a storage/workspace manager, starts a provider, or calls a writer.

The target inventory is presence-preserving: the production `StorageManager.restoreReceiptState` default fields except `sync`, plus schema version and both generation fences. Privacy belongs to root storage; forged bundle globals or unknown bundle keys make the source unavailable. Absent privacy stays absent. No defaults, URL canonicalization, link deduplication or layout normalization occur before hashing. Tests pin both target field ownership and workspace scoped-key ownership to the production definitions.

Canonical JSON sorts object keys recursively while preserving array order, then applies UTF-8 SHA-256 exactly as production. Direct production-parity tests cover missing/null fields, numeric object keys, Unicode, exact URL spelling, duplicate links, hidden layout coordinates, generations and global privacy.

Receipt schema is exact: version 1, `pending` or `verified`, and three lowercase 64-hex digests with no extra keys. The original target and entire retained recovery object must be bounded plain JSON, including recovery ancestry and provider bookkeeping. Hidden, symbol, accessor or pollution-key data cannot be discarded and then reported as a match. Unsupported or unsafe records yield only fixed categorical messages. Conservative rejection may make an otherwise readable historical field name unavailable for fingerprint comparison; no normalization is attempted.

Only attribution, fixed status enums and validated digest strings enter import summaries. No recovered configuration, URLs, provider fields or credential values are exposed in this section. Existing investigation projection and independently checksummed recovery-file review gates are unchanged. Receipt comparisons never make an ineligible recovery representation downloadable.

## Verification scope

Focused inspector tests cover production parity, privacy/generation/ancestry changes, malformed/future/unsafe/oversized records, attribution, explicit read scope, write traps, missing input, digest-time mutation and superseded reads. Production-script DOM-model integration tests cover English/Chinese, current/historical filtering, invalid/repeated queries, absent bundles, refresh/hide/stale completions and strict file-review separation. This is logic and DOM-model evidence; native Chrome acceptance is a separate release-stage check.
