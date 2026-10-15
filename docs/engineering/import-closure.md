# Local import closure: immutable one-slot evidence

The first core checkpoint contains the strict pure codec, independent read-only slot validation, and protected-key guards. It exposes no installer and changes no import admission. The slot is `__localItabImportClosureV1`, outside workspace scoped/global inventories, portable configuration and workspace migration sources.

The exact schema stores the original pending receipt, current presence-preserving configuration inventory (root privacy included, live Sync excluded), complete original recovery, lineage/workspace/generation provenance, action and review/decision timestamps. SHA-256 matches StorageManager's sorted-key JSON fingerprints. Recovery digest must equal the pending receipt's original recovery digest; current target must differ. Unknown fields, hidden properties, symbols, accessors, invalid prototypes, unsupported values, sparse arrays and unsafe keys fail closed. The 8 MiB, depth 64 and 200000-node limits apply conservatively to the whole envelope. No truncation is performed.

## Mutation boundaries

- StorageManager's ordinary key writers reject the root key. Legacy root reset enumerates removals while excluding even corrupt/future slot bytes. Workspace reset cannot see the slot through its scoped facade.
- Manager.verifiedSet rejects the key, including direct recovery and topology writes. Session read/write/remove inventories do not admit it. legacySource omits it from migration and branch comparisons.
- Complete Backup and workspace-preset generic write backends reject it. Other direct local-storage writers have fixed owned names. Combined restore's prior/next authorities remain restricted to registry, prompts and collections; the new key is not an authority.
- Manual, Drive, Sync and Complete serializers use their existing explicit configuration/module allowlists. No receipt or archive becomes portable.

## Lock audit for the forthcoming explicit service

Workspace configuration/privacy writers acquire lifecycle shared, then workspace-origin write exclusive. Lifecycle/topology writers acquire lifecycle exclusive. Legacy configuration writes use `local-itab-local-write`; presets use tasks then focus. The closure service must acquire lifecycle exclusive, then the existing legacy compatibility chain tasks → focus → local config. It must perform direct strict storage reads before any existing permissive copying and never call ready/initialize or reentrant public writers inside these locks. Combined restore and unresolved legacy state block closure. Source reads and pre-submit checks remain inside the lock; UI confirmation remains outside it.

This contract excludes uninstall, browser Clear extension data, profile deletion, arbitrary DevTools writes, and incompatible older binaries. There is no downgrade guarantee, archive retirement, second slot, automatic cleanup or provider/network work.
