# Comparison save confirmation

A comparison result is written only on its first explicit Save. If that call cannot confirm success, the button becomes **Check whether this result was saved**. Further clicks only inspect the same frozen operation ID and exact command digest. They never send provider requests or perform another collection write. The result remains visible until the user closes the comparison.

Collections retain the latest 64 successful operation receipts. Read-only confirmation requires the exact operation digest and a valid latest-state digest. It confirms a historical commit, not that an answer remains unchanged or active. Missing, mismatched or expired evidence stays unconfirmed, even if a record has identical text. A failed write may therefore require manual review of the collection; there is no automatic fresh-operation fallback.

The normal mutation API still accepts only its latest exact receipt for idempotent replay and preserves existing record/version checks. Earlier receipts do not authorize writes. Replacement and recovery clear historical evidence; full-backup collection replacement also clears all receipts. Interrupted full-restore rollback restores the exact prior state, including its prior evidence, under the existing restore fence.

## Compatibility and limits

- Existing schema-1 collection states with zero or one receipt remain readable. New states retain the same receipt fields, with a bounded array of up to 64.
- Collection-only and complete backup content formats are unchanged. Receipts are not exported, so imported text cannot claim a prior operation succeeded.
- Receipt metadata counts toward the existing total byte limit; capacity refusal is atomic and never truncates records or answers.
- Older extension builds that only accept one receipt cannot read a live state containing multiple receipts. Keep extension pages/builds current; downgrade migration is not provided. Content backups retain their existing format.
- Q&A, collection editing, prompt links and other consumers keep their existing mutation behavior. This change introduces read-only recovery to comparison saves only.

Verification uses synthetic in-memory storage and DOM tests, including lost acknowledgement A, later save B, read-only confirmation of A, missing/mismatched evidence, receipt expiry, restore invalidation, duplicate clicks, close during checking, and source changes. These checks are not native-browser acceptance.
