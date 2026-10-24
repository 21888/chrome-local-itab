# Unconfirmed AI answer save: explicit receipt check

Development feature on 1.1.102. An explicit Check earlier save action calls the existing collection Store inspectOperation with the original immutable command. Only committed === true clears the uncertainty lock and acknowledges the original operation. Missing, conflicting or unreadable evidence leaves the command, title and snapshot choice intact. This check does not save content, contact a provider or grant permission; historical confirmation does not guarantee a record still exists or has not later changed.

Deterministic tests cover original-command receipt verification with the real Store, strict acknowledgement, missing/error/stale/closed results, single-flight behavior, locked inputs and localized UI. Implementation-source full tests passed 2582 Node and 81 Python. Combined with navigation empty-state recovery, actual strict serial Node 2589/2589 and Python 81/81 passed with no failures, skips or cancellations.

Limited Chinese desktop-light no-response native smoke passed: recovery button absent, existing alpha source selected for exact local preview, clear/reset and empty close normal. No save, provider call or write fault was induced; temporary endpoint/model were cleared. Actual receipt-bearing uncertain-save faults and recovery remain synthetic-only unless separately exercised. No real provider call or browser fault injection is claimed.


## Production-page bounded acceptance · 2026-10-22

Cloud Chromium exercised the production new-tab UI at master `89df9e7cd0c007a4eaf7411e2aefc76efca453d0` (manifest 1.1.157); all 138 packaged runtime files matched the frozen SHA-256 inventory. The only injected adapter supplied synthetic page-memory browser APIs and a visible one-shot collection readback failure control. Production controller, Store, command and receipt checks were unchanged. This was not an installed extension.

In English/light mode, Review external answer loaded a synthetic multiline answer containing Chinese and literal HTML. A separate newer unparsed draft remained in the paste field. Explicit Save wrote one record, then the adapter rejected the next collection read once. The production unconfirmed-save message appeared; title and paste controls were disabled without replacing their values. The saved body/history contained the loaded original, not the newer unparsed draft.

Keyboard Enter on Check earlier save confirmed the original receipt without another write: the visible counter remained 6 (5 initialization writes plus 1 save), collection revision stayed 1, and the single record ID, title, body, history and receipt remained unchanged. The newer paste draft was retained and unlocked; Save for the already-confirmed answer was disabled. Feedback explicitly described historical confirmation, not a guarantee that the record still exists, and received focus. Closing showed the real discard-draft confirmation; accepting it returned focus to AI context Q&A, with the saved record still present and no extra write.

External/file action count remained zero; no provider, account, clipboard, import/export or permission flow was used. The test tab and local server were closed. This closes only this actual-browser readback-failure/receipt-recovery gap: missing receipts, repeated unreadable receipts, other languages/viewports, actual installed persistence/restart and the historical upgrade incident are not established by this page-memory run. No runtime change or new release is implied.
