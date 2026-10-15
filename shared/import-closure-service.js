/* Explicit keep-current decisions. Only this private review-owned path installs
 * the independent root slot. It never rewrites the original import receipt. */
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const api = factory(root, node ? require('./import-closure.js') : root.LocalItabImportClosure,
        node ? require('./workspaces.js') : root.LocalItabWorkspaces);
    if (node) module.exports = api; else root.LocalItabImportClosureService = api;
})(typeof window === 'undefined' ? globalThis : window, function (root, C, W) {
    'use strict';
    const services = new WeakMap();
    const SOURCE_LIMITS = Object.freeze({ bytes: 32 * 1024 * 1024, depth: 80, nodes: 300000 });
    const own = (value, key) => Boolean(value && Object.hasOwn(value, key));
    const check = (value, code) => { if (!value) throw C.error(code); };
    const now = () => new Date().toISOString();
    const receiptKey = '__localItabRestoreReceiptV1', recoveryKey = '__localItabRestoreRecovery';
    const summaryOwner = owner => ({ id: owner.workspaceId, generation: owner.generation, name: owner.label, migrationId: owner.migrationId });
    function create(storage) {
        if (services.has(storage)) return services.get(storage);
        const session = storage.workspace, manager = session?.manager;
        const reviews = new WeakMap(), importReviews = new WeakMap(), importTickets = new WeakMap();
        let activeReview = null, epoch = 0;
        const available = () => check(C && W && manager?.chrome?.storage?.local && manager.locks?.request && session, 'UNAVAILABLE');
        const get = async keys => {
            const raw = await manager.chrome.storage.local.get(keys);
            check(raw && typeof raw === 'object' && !Array.isArray(raw), 'READ');
            check(C.isPlainObject(raw), 'READ');
            for (const key of Reflect.ownKeys(raw)) {
                const descriptor = Object.getOwnPropertyDescriptor(raw, key);
                check(typeof key === 'string' && descriptor?.enumerable && own(descriptor, 'value'), 'READ');
            }
            return raw;
        };
        async function slot() {
            const raw = await get([C.KEY]);
            const descriptor = Object.getOwnPropertyDescriptor(raw, C.KEY);
            if (!descriptor) return C.inspect(undefined, { present: false });
            if (!descriptor.enumerable || !own(descriptor, 'value')) return { status: 'invalid' };
            return C.inspect(descriptor.value);
        }
        const sourceKeys = (includeProvider = false, withSlot = false) => [W.REGISTRY_KEY, W.ACTIVATION_KEY, W.LEGACY_CONFLICT_KEY, W.RESTORE_TRANSACTION_KEY, W.bundleKey(session), 'privacy', ...(includeProvider ? ['sync', '__localItabSyncIdentityState'] : []), ...(withSlot ? [C.KEY] : [])];
        function sourceFromRaw(direct, { includeProvider = false, slotExpected } = {}) {
            available(); check(!session.invalidated && session.id && session.generation, 'IDENTITY');
            const key = W.bundleKey(session), keys = sourceKeys(includeProvider, slotExpected !== undefined);
            if (slotExpected !== undefined) {
                check(slotExpected === null ? !own(direct, C.KEY) : own(direct, C.KEY) && C.same(direct[C.KEY], slotExpected), 'CONFLICT');
            }
            const selected = {};
            for (const name of keys) if (name !== C.KEY && own(direct, name)) {
                const descriptor = Object.getOwnPropertyDescriptor(direct, name);
                check(descriptor?.enumerable && own(descriptor, 'value'), 'SOURCE_INVALID'); Object.defineProperty(selected, name, descriptor);
            }
            const headers = C.copy(selected, SOURCE_LIMITS);
            const marker = headers[W.RESTORE_TRANSACTION_KEY];
            check(marker === undefined || marker && marker.schemaVersion === 1 && ['verified', 'recovered'].includes(marker.status), 'RESTORE_PENDING');
            check(!headers[W.LEGACY_CONFLICT_KEY] || headers[W.LEGACY_CONFLICT_KEY].resolvedAt, 'LEGACY_CONFLICT');
            const registry = W.validateRegistry(headers[W.REGISTRY_KEY]); manager.validateActivation(headers[W.ACTIVATION_KEY], registry);
            const entry = registry.workspaces.find(item => item.id === session.id);
            check(entry && entry.deletedAt === null && entry.generation === session.generation && !manager._legacyConflict, 'IDENTITY');
            const bundle = headers[key];
            check(bundle && Object.keys(bundle).sort().join(',') === 'generation,id,schemaVersion,values' && bundle.schemaVersion === 1 && bundle.id === entry.id && bundle.generation === entry.generation, 'SOURCE_INVALID');
            W.validateValues(bundle.values);
            const raw = { ...bundle.values, ...(own(headers, 'privacy') ? { privacy: headers.privacy } : {}) };
            storage.validateWorkspaceConfig(raw);
            for (const key of [storage.layoutGenerationKey, storage.settingsGenerationKey]) check(!own(raw, key) || typeof raw[key] === 'string' && raw[key].length > 0, 'SOURCE_INVALID');
            const source = { owner: { migrationId: registry.migrationId, workspaceId: entry.id, generation: entry.generation, label: entry.name }, current: C.inventory(raw) };
            if (own(raw, receiptKey)) source.receipt = C.copy(raw[receiptKey]);
            if (own(raw, recoveryKey)) source.recovery = C.copy(raw[recoveryKey]);
            // Presence is part of equality; missing receipt/recovery never hashes
            // as null or an empty default. Provider state is bound only to fresh
            // imports, and is never added to the closure archive.
            const provider = {};
            for (const key of ['sync', '__localItabSyncIdentityState']) if (own(headers, key)) provider[key] = headers[key];
            return { source, signature: C.canonical(source), importSignature: C.canonical({ source, provider }) };
        }
        async function readSource(options = {}) {
            available(); check(!session.invalidated && session.id && session.generation, 'IDENTITY');
            await manager.assertRestoreSettled(); await manager.checkLegacySource({ readOnly: true });
            const direct = await get(sourceKeys(options.includeProvider, options.slotExpected !== undefined));
            return sourceFromRaw(direct, options);
        }
        async function withDecisionLock(action) {
            available(); await session.readyExisting();
            return manager.locks.request(W.LOCK, { mode: 'exclusive' }, () => manager.legacyLock(action));
        }
        function equivalent(envelope, source) {
            const body = envelope.body;
            return C.same({ owner: body.owner, current: body.current, receipt: body.receipt, recovery: body.recovery }, source);
        }
        function recorded(envelope, source, status) {
            return C.freeze({ status, recorded: true, archiveId: envelope.id, sourceUnchanged: equivalent(envelope, source) });
        }
        function cancel(review) { const ticket = reviews.get(review); if (ticket) ticket.canceled = true; }
        async function review({ isCurrent = () => true } = {}) {
            if (activeReview) cancel(activeReview); activeReview = null; const turn = ++epoch;
            return withDecisionLock(async () => {
                check(isCurrent() && turn === epoch, 'CANCELED');
                const captured = await readSource(), state = await slot(), source = captured.source;
                const base = { eligible: false, workspace: summaryOwner(source.owner), reviewedAt: now(), capacity: 1 };
                const result = status => C.freeze({ ...base, status });
                if (state.status !== 'empty') {
                    if (state.status !== 'valid') return result(state.status === 'unsupported' ? 'SLOT_UNSUPPORTED' : 'SLOT_INVALID');
                    if (C.matches(state.envelope, { ...source.owner, receipt: source.receipt })) return result(equivalent(state.envelope, source) ? 'ALREADY_CLOSED' : 'ALREADY_CLOSED_HISTORY_ONLY');
                    return result('SLOT_OCCUPIED');
                }
                if (!own(source, 'receipt')) return result('NO_PENDING_IMPORT');
                storage.validateRestoreReceipt(source.receipt);
                if (source.receipt.status !== 'pending') return result('NO_PENDING_IMPORT');
                C.receipt(source.receipt);
                if (!source.recovery || typeof source.recovery !== 'object' || Array.isArray(source.recovery)) return result('ORIGINAL_RECOVERY_UNAVAILABLE');
                const recoveryDigest = await C.digest(source.recovery);
                if (recoveryDigest !== source.receipt.recovery) return result('ORIGINAL_RECOVERY_UNAVAILABLE');
                const currentDigest = await C.digest(source.current);
                if (currentDigest === source.receipt.target) return result('NORMAL_VERIFICATION_REQUIRED');
                const body = C.freeze(C.copy({ action: C.ACTION, reviewedAt: base.reviewedAt, decidedAt: base.reviewedAt, ...source,
                    receiptDigest: await C.digest(source.receipt), currentDigest, recoveryDigest }));
                const candidate = await C.validate({ schemaVersion: 1, id: await C.digest(body), body });
                // No ticket escapes on a stale/canceled read, including async hash.
                const latest = await readSource({ slotExpected: null });
                check(latest.signature === captured.signature, 'CONFLICT');
                check(isCurrent() && turn === epoch, 'CANCELED');
                const review = C.freeze({ ...base, eligible: true, status: 'READY', bytes: new TextEncoder().encode(C.canonical(candidate)).length });
                reviews.set(review, { captured, body, isCurrent, turn, consumed: false, canceled: false }); activeReview = review; return review;
            });
        }
        async function confirm(review, { confirmed = false, isCurrent = () => true } = {}) {
            const ticket = reviews.get(review);
            check(confirmed === true && ticket && !ticket.consumed && !ticket.canceled, 'REVIEW_REQUIRED');
            ticket.consumed = true;
            const current = () => !ticket.canceled && ticket.turn === epoch && ticket.isCurrent() && isCurrent();
            return withDecisionLock(async () => {
                check(current(), 'CANCELED');
                let captured = await readSource(), state = await slot();
                if (state.status === 'valid' && C.matches(state.envelope, { ...ticket.captured.source.owner, receipt: ticket.captured.source.receipt })) {
                    check(current(), 'CANCELED');
                    return recorded(state.envelope, captured.source, equivalent(state.envelope, captured.source) ? 'ALREADY_CLOSED' : 'ALREADY_CLOSED_HISTORY_ONLY');
                }
                check(state.status === 'empty', 'SLOT_OCCUPIED');
                check(captured.signature === ticket.captured.signature, 'CONFLICT');
                const body = C.copy(ticket.body); body.decidedAt = now();
                const envelope = await C.validate({ schemaVersion: 1, id: await C.digest(body), body });
                // All expensive hashing is finished before the final storage
                // reads. No public Store writers, prompts or remote calls occur.
                captured = await readSource({ slotExpected: null });
                check(captured.signature === ticket.captured.signature, 'CONFLICT');
                check(current(), 'CANCELED');
                // The sole write. False/throw is an uncertain acknowledgment;
                // there is never an automatic retry, cleanup or rollback.
                try { await manager.chrome.storage.local.set({ [C.KEY]: C.copy(envelope) }); } catch (_) {}
                try {
                    const saved = await slot();
                    if (saved.status !== 'valid' || !C.same(saved.envelope, envelope)) return C.freeze({ status: 'UNCERTAIN', recorded: false, sourceUnchanged: false });
                    // Bind the final source proof to the same exact evidence in
                    // one combined read. Slot damage/read failure is uncertainty;
                    // only an intact slot with source drift is recorded-changed.
                    const proof = await get(sourceKeys(false, true));
                    if (!own(proof, C.KEY) || !C.same(proof[C.KEY], envelope)) return C.freeze({ status: 'UNCERTAIN', recorded: false, sourceUnchanged: false });
                    let unchanged = false;
                    try { unchanged = sourceFromRaw(proof).signature === ticket.captured.signature; } catch (_) {}
                    return C.freeze({ status: unchanged ? 'RECORDED' : 'RECORDED_LIVE_CHANGED', archiveId: envelope.id, recorded: true, sourceUnchanged: unchanged });
                } catch (_) { return C.freeze({ status: 'UNCERTAIN', recorded: false, sourceUnchanged: false }); }
            });
        }
        async function recheck() {
            if (activeReview) cancel(activeReview); ++epoch; activeReview = null;
            available(); const state = await slot();
            if (state.status !== 'valid') return C.freeze({ status: ({ empty: 'EMPTY', invalid: 'INVALID', unsupported: 'UNSUPPORTED' })[state.status], relation: 'unknown' });
            const envelope = state.envelope; let relation = 'unknown', initialRegistry = null, initialOwner = null;
            try {
                const initial = C.copy(await get([W.REGISTRY_KEY, W.ACTIVATION_KEY]), SOURCE_LIMITS);
                initialRegistry = own(initial, W.REGISTRY_KEY) ? W.validateRegistry(initial[W.REGISTRY_KEY]) : null;
                initialOwner = initialRegistry?.workspaces.find(entry => entry.id === envelope.body.owner.workspaceId && entry.deletedAt === null);
            } catch (_) {}
            // One final consistent storage read includes the evidence and every
            // identity used for attribution. No hash awaits follow this read.
            const finalDirect = await get([C.KEY, W.REGISTRY_KEY, W.ACTIVATION_KEY, ...(initialOwner ? [W.bundleKey(initialOwner)] : [])]);
            try {
                if (!own(finalDirect, C.KEY) || !C.same(finalDirect[C.KEY], envelope)) return C.freeze({ status: 'INVALID', relation: 'unknown' });
            } catch (_) { return C.freeze({ status: 'INVALID', relation: 'unknown' }); }
            try {
                const final = C.copy(Object.fromEntries(Object.entries(finalDirect).filter(([key]) => key !== C.KEY)), SOURCE_LIMITS);
                if (!own(final, W.REGISTRY_KEY)) relation = 'historical';
                else {
                    const registry = W.validateRegistry(final[W.REGISTRY_KEY]); manager.validateActivation(final[W.ACTIVATION_KEY], registry);
                    const owner = registry.workspaces.find(entry => entry.id === envelope.body.owner.workspaceId && entry.deletedAt === null);
                    if (!owner || registry.migrationId !== envelope.body.owner.migrationId || owner.id !== session.id) relation = 'historical';
                    else {
                        check(initialRegistry && C.same(registry, initialRegistry) && initialOwner && !session.invalidated && owner.generation === session.generation && !manager._legacyConflict, 'CONFLICT');
                        const bundle = final[W.bundleKey(owner)];
                        check(bundle && Object.keys(bundle).sort().join(',') === 'generation,id,schemaVersion,values' && bundle.schemaVersion === 1 && bundle.id === owner.id && bundle.generation === owner.generation, 'SOURCE_INVALID');
                        W.validateValues(bundle.values);
                        relation = C.matches(envelope, { migrationId: registry.migrationId, workspaceId: owner.id, receipt: bundle.values[receiptKey] }) ? 'active' : 'historical';
                    }
                }
            } catch (_) {}
            return C.freeze({ status: 'RECORDED', archiveId: envelope.id, workspace: summaryOwner(envelope.body.owner), relation });
        }
        const alive = ticket => ticket && !ticket.parent?.canceled && !ticket.canceled && !ticket.consumed && Date.now() <= ticket.expires && ticket.isCurrent();
        function cancelClosedRestore(value) { const ticket = importReviews.get(value) || importTickets.get(value); if (ticket) ticket.canceled = true; }
        async function closedState(receiptHint) {
            const state = await slot();
            // Preserve existing ordinary import semantics. Closure-only bounds
            // and source validation apply only to this archived operation; they
            // must not reject unrelated legacy layouts or recovery histories.
            if (state.status !== 'valid' || state.envelope.body.owner.workspaceId !== session.id ||
                receiptHint !== undefined && !C.same(state.envelope.body.receipt, receiptHint)) return { state, matches: false };
            const metadata = C.copy(await get([W.REGISTRY_KEY, W.ACTIVATION_KEY]));
            const registry = W.validateRegistry(metadata[W.REGISTRY_KEY]); manager.validateActivation(metadata[W.ACTIVATION_KEY], registry);
            if (registry.migrationId !== state.envelope.body.owner.migrationId) return { state, matches: false };
            const captured = await readSource({ includeProvider: true });
            return { captured, state, matches: C.matches(state.envelope, { ...captured.source.owner, receipt: captured.source.receipt }) };
        }
        async function reconcile(raw, values, options) {
            if (!session) return false;
            const latest = await closedState(raw[receiptKey]);
            if (!latest.matches) return false;
            const request = await storage.restoreRequestHash(values);
            const ticket = importTickets.get(options.closedRestoreTicket);
            if (alive(ticket) && ticket.request === request && ticket.signature === latest.captured.importSignature && ticket.archiveId === latest.state.envelope.id) {
                ticket.consumed = true;
                // The importer rechecks this private guard after its asynchronous
                // recovery preparation, immediately before the replacement set.
                return { admit: true, guard: async () => {
                    check(!ticket.parent?.canceled && !ticket.canceled && ticket.isCurrent() && Date.now() <= ticket.expires, 'CANCELED');
                    const fresh = await readSource({ includeProvider: true, slotExpected: latest.state.envelope });
                    check(fresh.importSignature === ticket.signature, 'CONFLICT');
                    check(!ticket.parent?.canceled && !ticket.canceled && ticket.isCurrent(), 'CANCELED');
                } };
            }
            const review = Object.freeze({});
            importReviews.set(review, { request, signature: latest.captured.importSignature, archiveId: latest.state.envelope.id, expires: Date.now() + 5 * 60000, canceled: false, consumed: false, isCurrent: () => true });
            const failure = storage.restoreReceiptError('RESTORE_CLOSED_RECONFIRM'); failure.closureReview = review; throw failure;
        }
        async function confirmClosedRestore(review, { confirmed = false, isCurrent = () => true } = {}) {
            const pending = importReviews.get(review);
            check(confirmed === true && alive(pending) && isCurrent(), 'REVIEW_REQUIRED'); pending.consumed = true;
            return storage.withLocalWriteLock(async () => {
                const latest = await closedState();
                check(!pending.canceled && isCurrent() && latest.matches && latest.state.envelope.id === pending.archiveId && latest.captured.importSignature === pending.signature, 'CONFLICT');
                const ticket = Object.freeze({});
                importTickets.set(ticket, { ...pending, parent: pending, consumed: false, isCurrent, expires: Date.now() + 5 * 60000 }); return ticket;
            }, true);
        }
        async function assertUnclosedReceipt(receipt) {
            const latest = await closedState(receipt);
            if (latest.matches && C.same(latest.captured.source.receipt, receipt)) throw storage.restoreReceiptError('RESTORE_CLOSED_RECONFIRM');
        }
        const api = Object.freeze({ assertUnclosedReceipt, review, confirm, cancel, recheck, reconcile, confirmClosedRestore, cancelClosedRestore }); services.set(storage, api); return api;
    }
    return Object.freeze({ create });
});
