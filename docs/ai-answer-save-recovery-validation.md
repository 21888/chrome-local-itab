# Unconfirmed AI answer save: explicit receipt check

Development feature on 1.1.102. An explicit Check earlier save action calls the existing collection Store inspectOperation with the original immutable command. Only committed === true clears the uncertainty lock and acknowledges the original operation. Missing, conflicting or unreadable evidence leaves the command, title and snapshot choice intact. This check does not save content, contact a provider or grant permission; historical confirmation does not guarantee a record still exists or has not later changed.

Deterministic tests cover original-command receipt verification with the real Store, strict acknowledgement, missing/error/stale/closed results, single-flight behavior, locked inputs and localized UI. Implementation-source full tests passed 2582 Node and 81 Python. Combined with navigation empty-state recovery, actual strict serial Node 2589/2589 and Python 81/81 passed with no failures, skips or cancellations.

Native safe UI smoke is pending. Actual receipt-bearing uncertain-save faults and recovery remain synthetic-only unless separately exercised. No real provider call or browser fault injection is claimed.
