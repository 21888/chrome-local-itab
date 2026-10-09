# Fail-closed configuration backup reads

Manual settings export and Google Drive snapshot preparation now use a dedicated configuration reader. A rejected authoritative storage read, rejected lock acquisition, invalid root result, or validation exception prevents backup creation. The existing manual-export error feedback is shown; the Drive draft promise rejects before a draft can be handed to upload. A successful read of an empty profile still exports defaults.

The reader requests only keys in the configuration schema. Tasks, Focus, Scratchpad, Countdown, provider bookkeeping and unknown top-level keys are outside the request and backup. Runtime `getAll()` recovery and successful-read normalization are unchanged. This fix deliberately does not change tolerant legacy/corrupt-value normalization or expand the backup schema.

## Automated checks

- `node --test tests/backup-read-safety.test.js`: actual `options.exportSettings()` and `DriveBackupManager.createSnapshotDraft()` with real storage validation and synthetic storage/DOM fixtures.
- Covers populated quote, site, world clock, image and poster; a fresh empty profile; private-key getters that throw if read; storage/lock/validation failures; invalid root results; existing malformed layout identity rejection; successful retry; no writes or successful download/draft on failure.
- Legacy URL/title normalization, missing optional fields and existing tolerant record filtering remain byte-equivalent at the data boundary.
- `node --test tests/*.test.js` and `python3 -m unittest discover -s tests -p '*_test.py'` cover the complete repository regression suite.

Sync initialization and Drive device-state setup are stubbed in these focused fixtures. The no-write assertions apply to the tested configuration boundary, not a claim that ordinary provider initialization never updates its bookkeeping. No real account, browser, Drive upload, OAuth flow or network was used for these fixtures. Native-browser failure injection remains outside this automated validation. The manual-export success notice means the browser download was requested, not that operating-system file saving completed.


## Integrated checks and actual export

The integrated repository passed 415 Node tests, 19 Python packaging tests, all
JavaScript syntax checks and the independent actual-entrypoint read/lock probe.
A deterministic 57-file package matched source bytes.

On 2026-10-09, a normal-sandbox official Chrome for Testing 155.0.8059.39 Linux
profile saved a synthetic quote and a UTC world clock through actual Settings
controls. Manual Export Settings produced a real 2,510-byte downloaded JSON:

- `data.quote`: `Backup check quartz 2026`
- `data.clock.worldClocks`: `[{"timeZone":"UTC","label":"Quartz"}]`
- `schemaVersion`: `1`; no private `__localItab` key in exported data
- File SHA256: `a4c18b8497767e1f6a58e6070a854ac4f982437d9ffbeab544cb022cec9130b0`

The downloaded bytes were independently parsed and checked, rather than relying
only on the success notice. All 57 frozen runtime hashes matched production.
The calculator still returned `7.5`, and Settings search still returned both
clock results. A transient desktop input-provider error required inspecting the
actual screen and using supported native key input; no security settings or
browser restrictions were changed.

This native pass verifies normal manual export. Failed storage reads and locks
remain injected model tests; no actual Drive account, upload, OAuth, Sync service,
macOS or Windows export was exercised. Existing normalization limits remain as
stated above.
