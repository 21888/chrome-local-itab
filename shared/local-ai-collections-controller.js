/* Collection drafts remain in this page. No implicit body revisions or fallback writer. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./local-ai-collections-store.js') : root.LocalItabAICollections, typeof module === 'object' && module.exports ? require('./local-prompts-store.js') : root.LocalItabPrompts, typeof module === 'object' && module.exports ? require('./collection-capture.js') : root.LocalItabCollectionCapture);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCollectionsController = api;
})(typeof window === 'undefined' ? globalThis : window, function (Core, Prompts, Capture) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const editable = ['title', 'body', 'type', 'tool', 'sourceUrl', 'notes'];
    const uncertain = code => ['WRITE', 'READ', 'VERIFY'].includes(code);
    function fields(record) {
        const draft = Core.createDraft(record);
        return { ...Object.fromEntries(editable.map(key => [key, draft[key]])), tagsText: draft.tags.join(', '), promptId: draft.promptRef?.promptId || '', bodyVersionId: draft.promptRef?.bodyVersionId || '' };
    }
    function values(input, originalTags = null) {
        // Display separators are ambiguous for imported tags. Preserve the exact
        // original array until the text actually changes (including edit/revert).
        const tags = originalTags && input.tagsText === originalTags.join(', ')
            ? [...originalTags]
            : input.tagsText.split(/[,，\n]/u).map(tag => tag.trim()).filter(Boolean);
        return { ...Object.fromEntries(editable.map(key => [key, input[key]])), tags, promptRef: input.promptId || input.bodyVersionId ? { promptId: input.promptId, bodyVersionId: input.bodyVersionId } : null };
    }
    // Active saved records only. Never search drafts, history or recovery snapshots.
    function comparisonCandidates(state, sourceId) {
        const source = state?.records.find(record => record.id === sourceId && !record.deletedAt);
        const ref = source?.promptRef;
        if (!ref?.promptId || !ref.bodyVersionId) return [];
        return state.records.filter(record => record.id !== sourceId && !record.deletedAt &&
            record.promptRef?.promptId === ref.promptId && record.promptRef?.bodyVersionId === ref.bodyVersionId);
    }
    class Controller {
        constructor({ store, promptStore = null, onChange = () => {} } = {}) {
            if (!store) throw new Error('A fenced collection backend is required'); this.store = store; this.onChange = onChange;
            this.promptStore = promptStore; this.promptState = null; this.promptError = null; this.promptLoading = false; this.promptGeneration = 0;
            this.state = null; this.selected = null; this.drafts = new Map();
            this.filters = { query: '', mode: 'all', type: '', tool: '', tag: '' };
            this.busy = false; this.error = null; this.notice = ''; this.readGeneration = 0; this.pendingReadGeneration = null;
            this.interactionGeneration = 0; this.pendingCommand = null; this.disposed = false; this.refreshQueued = false;
        }
        notify(kind = 'render') { if (!this.disposed) this.onChange(kind); }
        async start() {
            this.unsubscribePrompts = this.promptStore?.subscribe(() => { void this.refreshPrompts(); });
            this.unsubscribe = this.store.subscribe(() => { if (this.busy) this.refreshQueued = true; else void this.refresh(); });
            await Promise.all([this.refresh(), this.refreshPrompts()]);
        }
        dispose() {
            if (this.disposed) return;
            this.disposed = true; this.readGeneration++; this.promptGeneration++;
            for (const unsubscribe of [this.unsubscribe, this.unsubscribePrompts]) { try { unsubscribe?.(); } catch (_) { /* Continue independent cleanup. */ } }
            this.onChange('dispose');
        }
        async refreshPrompts() {
            if (!this.promptStore || this.disposed) return null;
            const generation = ++this.promptGeneration;
            this.promptLoading = true; this.promptError = null; this.notify('prompts');
            try {
                const state = Prompts.validate(await this.promptStore.read());
                if (this.disposed || generation !== this.promptGeneration) return null;
                this.promptState = state; this.promptLoading = false; this.notify('prompts'); return state;
            } catch (error) {
                if (this.disposed || generation !== this.promptGeneration) return null;
                this.promptLoading = false; this.promptError = error.code || 'READ'; this.notify('prompts'); return null;
            }
        }
        promptOptions() {
            if (!this.promptState || this.promptError || this.promptLoading) return [];
            const seen = new Set(), result = [];
            for (const group of [{ records: this.promptState.records, recoveryId: null }, ...this.promptState.recovery.map(item => ({ records: item.content.records, recoveryId: item.id }))]) {
                for (const record of group.records) for (const version of record.history) {
                    const key = JSON.stringify([record.id, version.id]); if (seen.has(key)) continue; seen.add(key);
                    result.push({ promptId: record.id, bodyVersionId: version.id, title: record.title, archived: Boolean(record.deletedAt), recoveryId: group.recoveryId,
                        current: !group.recoveryId && version.id === record.currentVersionId, createdAt: version.createdAt });
                }
            }
            return result;
        }
        promptResolution(reference) {
            if (!reference) return { status: 'unlinked', reference: null };
            if (this.promptLoading) return { status: 'loading', reference };
            if (!this.promptState || this.promptError) return { status: 'unavailable', reference };
            // Use the collection validator and the prompt library's exact lookup.
            const shell = this.record() || null;
            const record = shell ? { ...shell, promptRef: reference } : null;
            const version = Prompts.getVersion(this.promptState, reference.promptId, reference.bodyVersionId);
            const resolved = record ? Core.resolvePromptReference(record, () => version) : { status: version ? 'resolved' : 'unresolved', reference, version };
            return { ...resolved, provenance: this.promptOptions().find(item => item.promptId === reference.promptId && item.bodyVersionId === reference.bodyVersionId) };
        }
        choosePrompt(promptId, bodyVersionId = '') { this.interactionGeneration++;
            const draft = this.draft(); if (this.disposed || !draft || this.busy || this.pendingCommand || this.promptLoading || this.promptError) return false;
            draft.promptCandidate = { promptId, bodyVersionId }; this.notify('prompts'); return true;
        }
        async applyPrompt() {
            const draft = this.draft(), selected = this.selected, candidate = draft?.promptCandidate;
            if (this.disposed || !candidate?.promptId || !candidate.bodyVersionId || this.busy || this.pendingCommand || this.promptLoading || this.promptError) return false;
            const input = draft.input, exact = { ...candidate }, generation = this.promptGeneration + 1, state = await this.refreshPrompts();
            if (!state || this.disposed || generation !== this.promptGeneration || this.promptLoading || this.promptError || this.selected !== selected || this.draft() !== draft || draft.input !== input || this.busy || this.pendingCommand || JSON.stringify(draft.promptCandidate) !== JSON.stringify(exact)) return false;
            const version = Prompts.getVersion(state, exact.promptId, exact.bodyVersionId);
            if (!version || version.recordId !== exact.promptId || version.id !== exact.bodyVersionId) return false;
            // Both IDs enter the draft together; persistence belongs only to Save.
            draft.input = { ...draft.input, promptId: exact.promptId, bodyVersionId: exact.bodyVersionId };
            this.notify('prompts'); this.notify('draft'); return true;
        }
        unlinkPrompt() { this.interactionGeneration++;
            const draft = this.draft(); if (this.disposed || !draft || this.busy || this.pendingCommand) return false;
            draft.input = { ...draft.input, promptId: '', bodyVersionId: '' }; this.notify('prompts'); this.notify('draft'); return true;
        }
        async refresh() {
            if (this.busy) { this.refreshQueued = true; return; }
            const generation = ++this.readGeneration;
            this.pendingReadGeneration = generation;
            this.notify('comparison');
            try {
                const next = await this.store.read();
                if (this.disposed || generation !== this.readGeneration) return;
                this.accept(next);
                if (!this.pendingCommand && this.error?.scope === 'read') this.error = null;
            } catch (error) {
                if (this.disposed || generation !== this.readGeneration) return;
                this.error = { code: error.code || 'READ', scope: 'read' };
            } finally {
                if (this.pendingReadGeneration === generation) this.pendingReadGeneration = null;
            }
            this.notify();
        }
        accept(next) {
            if (this.state && next.revision < this.state.revision) return;
            this.state = next;
            for (const [id, draft] of this.drafts) {
                if (id === 'new') continue;
                const record = this.record(id);
                if (!record || record.version !== draft.version || record.deletedAt) {
                    if (this.dirty(id) || this.pendingCommand?.draftKey === id) draft.conflict = true;
                    else if (record && !record.deletedAt) this.drafts.set(id, this.makeDraft(record));
                    else this.drafts.delete(id);
                }
            }
            if (this.selected === null) this.selected = this.results()[0]?.record.id || null;
        }
        comparisonReady() {
            return !this.disposed && Boolean(this.state) && !this.busy && !this.pendingCommand && !this.error &&
                this.pendingReadGeneration !== this.readGeneration;
        }
        comparisonCandidates(id = this.selected) { return this.comparisonReady() ? comparisonCandidates(this.state, id) : []; }
        record(id = this.selected) { return this.state?.records.find(record => record.id === id) || null; }
        results() {
            if (!this.state) return [];
            const options = { removed: this.filters.mode === 'trash' };
            if (this.filters.type) options.type = this.filters.type;
            return Core.search(this.state, this.filters.query, options).filter(({ record }) => (!this.filters.tool || record.tool === this.filters.tool) && (!this.filters.tag || record.tags.includes(this.filters.tag)));
        }
        clearFilters() { this.filter({ query: '', type: '', tool: '', tag: '' }); }
        filter(patch) { this.interactionGeneration++; Object.assign(this.filters, patch); this.notify('list'); }
        select(id) { this.interactionGeneration++; if (this.busy) return false; this.selected = id; this.error = this.pendingCommand ? this.error : null; this.notice = ''; this.notify(); return true; }
        makeDraft(record) {
            const input = fields(record);
            return { input, baseline: copy(input), originalTags: Core.createDraft(record).tags, id: record?.id, version: record?.version, conflict: false };
        }
        edit(id = this.selected) { this.interactionGeneration++;
            if (this.busy || this.pendingCommand) return false;
            const record = this.record(id);
            if (!record || record.deletedAt) return false;
            if (!this.drafts.has(id)) this.drafts.set(id, this.makeDraft(record));
            this.selected = id; this.notify(); return true;
        }
        create() { this.interactionGeneration++;
            if (this.busy || this.pendingCommand) return false;
            if (!this.drafts.has('new')) this.drafts.set('new', this.makeDraft());
            this.selected = 'new'; this.error = null; this.notice = ''; this.notify(); return true;
        }
        captureTicket() { return this.interactionGeneration; }
        hydrateCapture(payload, ticket) {
            if (this.disposed || !this.state || this.busy || this.pendingCommand || this.drafts.size || ticket !== this.interactionGeneration) return false;
            let checked; try { checked = Capture.validatePayload(payload); } catch (_) { return false; }
            const draft = this.makeDraft();
            draft.input.body = checked.body; draft.input.type = 'other';
            draft.captureSource = checked.sourceCandidate; draft.captured = true;
            this.drafts.set('new', draft); this.selected = 'new'; this.error = null; this.notice = '';
            this.interactionGeneration++; this.notify(); return true;
        }
        draft() { return this.drafts.get(this.selected); }
        dirty(id = this.selected) {
            const draft = this.drafts.get(id);
            return Boolean(draft && JSON.stringify(draft.input) !== JSON.stringify(draft.baseline));
        }
        update(field, value) { this.interactionGeneration++;
            const draft = this.draft();
            if (!draft || this.busy || this.pendingCommand || ![...editable, 'tagsText', 'promptId', 'bodyVersionId'].includes(field)) return;
            draft.input[field] = value; this.error = null; this.notice = ''; this.notify('draft');
        }
        discard() { this.interactionGeneration++;
            if (this.busy || this.pendingCommand) return false;
            const key = this.selected; this.drafts.delete(key);
            if (key === 'new') this.selected = this.results()[0]?.record.id || null;
            this.error = null; this.notice = ''; this.notify(); return true;
        }
        hasUncommittedWork() { return this.busy || Boolean(this.pendingCommand) || [...this.drafts.keys()].some(id => this.dirty(id)); }
        duplicates() { const draft = this.draft(); return draft && this.state ? Core.findDuplicates(this.state, { body: draft.input.body, sourceUrl: draft.input.sourceUrl }).filter(item => item.id !== draft.id) : []; }
        async reviewBody(body, versionId) {
            if (this.busy || this.pendingCommand) return null;
            const record = this.record(); if (!record || record.deletedAt || this.draft()) return null;
            try {
                return await (versionId ? this.store.reviewVersionRestore({ id: record.id, version: record.version, versionId }) : this.store.reviewRevision({ id: record.id, version: record.version, body }));
            } catch (error) { this.error = { code: error.code || 'READ', scope: 'review' }; this.notify(); return null; }
        }
        async acceptRevision(plan) {
            if (this.busy || this.pendingCommand || !plan) return false;
            return this.execute({ command: this.store.request('revise', plan), recordId: plan.id, action: 'revise' });
        }
        async save(asCopy = false) {
            if (this.busy || this.pendingCommand) return false;
            const draftKey = this.selected, draft = this.draft();
            if (!draft || (draft.conflict && !asCopy)) return false;
            try {
                const command = this.store.request(draft.id && !asCopy ? 'edit' : 'add', {
                    ...values(draft.input, draft.originalTags), ...(draft.id && !asCopy ? { id: draft.id, version: draft.version } : {})
                });
                const validatePrompt = draft.exactResult && command.promptRef ? (raw, reference) => {
                    try {
                        const state = Prompts.validate(raw), record = state.records.find(item => item.id === reference.promptId && !item.deletedAt);
                        return Boolean(record?.history.some(version => version.id === reference.bodyVersionId));
                    } catch (_) { return false; }
                } : null;
                return await this.execute({ command, draftKey, action: 'save', validatePrompt });
            } catch (error) { this.error = { code: error.code || 'INVALID', scope: 'save' }; this.notify(); return false; }
        }
        async action(kind) {
            if (this.busy || this.pendingCommand || !['remove', 'restore'].includes(kind)) return false;
            const record = this.record(); if (!record || this.drafts.has(record.id)) return false;
            return this.execute({ command: this.store.request(kind, { id: record.id, version: record.version }), recordId: record.id, action: kind });
        }
        async retry() { if (this.busy || !this.pendingCommand) return false; return this.execute(this.pendingCommand); }
        async execute(operation) { this.interactionGeneration++;
            if (this.busy) return false;
            this.busy = true; this.error = null; this.notice = ''; ++this.readGeneration; this.notify();
            try {
                const state = await this.store.mutate(operation.command, operation.validatePrompt);
                if (this.disposed) return false;
                this.pendingCommand = null;
                if (operation.action === 'save') {
                    // Add IDs are the owned operationId, including exact retries.
                    const savedId = operation.command.kind === 'edit' ? operation.command.id : operation.command.operationId;
                    const saved = state.records.find(record => record.id === savedId);
                    this.drafts.delete(operation.draftKey);
                    if (saved) this.selected = saved.id;
                }
                this.accept(state); this.notice = operation.action === 'save' ? 'saved' : operation.action;
                return true;
            } catch (error) {
                if (this.disposed) return false;
                this.error = { code: error.code || 'WRITE', scope: operation.action };
                if (uncertain(error.code) || !error.code) this.pendingCommand = operation;
                else {
                    this.pendingCommand = null;
                    if (error.code === 'CONFLICT' && operation.draftKey) {
                        const draft = this.drafts.get(operation.draftKey); if (draft) draft.conflict = true;
                    }
                }
                this.refreshQueued = true; return false;
            } finally {
                this.busy = false; this.notify();
                if (this.refreshQueued && !this.disposed) { this.refreshQueued = false; void this.refresh(); }
            }
        }
    }
    return { Controller, fields, values, comparisonCandidates };
});
