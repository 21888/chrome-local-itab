/* Collection drafts remain in this page. No implicit body revisions or fallback writer. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./local-ai-collections-store.js') : root.LocalItabAICollections);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCollectionsController = api;
})(typeof window === 'undefined' ? globalThis : window, function (Core) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const editable = ['title', 'body', 'type', 'tool', 'sourceUrl', 'notes'];
    const uncertain = code => ['WRITE', 'READ', 'VERIFY'].includes(code);
    function fields(record) {
        const draft = Core.createDraft(record);
        return { ...Object.fromEntries(editable.map(key => [key, draft[key]])), tagsText: draft.tags.join(', '), promptId: draft.promptRef?.promptId || '', bodyVersionId: draft.promptRef?.bodyVersionId || '' };
    }
    function values(input) {
        const tags = input.tagsText.split(/[,，\n]/u).map(tag => tag.trim()).filter(Boolean);
        return { ...Object.fromEntries(editable.map(key => [key, input[key]])), tags, promptRef: input.promptId || input.bodyVersionId ? { promptId: input.promptId, bodyVersionId: input.bodyVersionId } : null };
    }
    class Controller {
        constructor({ store, onChange = () => {} } = {}) {
            if (!store) throw new Error('A fenced collection backend is required'); this.store = store; this.onChange = onChange;
            this.state = null; this.selected = null; this.drafts = new Map();
            this.filters = { query: '', mode: 'all', type: '', tool: '', tag: '' };
            this.busy = false; this.error = null; this.notice = ''; this.readGeneration = 0;
            this.pendingCommand = null; this.disposed = false; this.refreshQueued = false;
        }
        notify(kind = 'render') { if (!this.disposed) this.onChange(kind); }
        async start() {
            this.unsubscribe = this.store.subscribe(() => { if (this.busy) this.refreshQueued = true; else void this.refresh(); });
            await this.refresh();
        }
        dispose() { this.disposed = true; this.readGeneration++; this.unsubscribe?.(); }
        async refresh() {
            if (this.busy) { this.refreshQueued = true; return; }
            const generation = ++this.readGeneration;
            try {
                const next = await this.store.read();
                if (this.disposed || generation !== this.readGeneration) return;
                this.accept(next);
                if (!this.pendingCommand && this.error?.scope === 'read') this.error = null;
            } catch (error) {
                if (this.disposed || generation !== this.readGeneration) return;
                this.error = { code: error.code || 'READ', scope: 'read' };
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
        record(id = this.selected) { return this.state?.records.find(record => record.id === id) || null; }
        results() {
            if (!this.state) return [];
            const options = { removed: this.filters.mode === 'trash' };
            if (this.filters.type) options.type = this.filters.type;
            return Core.search(this.state, this.filters.query, options).filter(({ record }) => (!this.filters.tool || record.tool === this.filters.tool) && (!this.filters.tag || record.tags.includes(this.filters.tag)));
        }
        filter(patch) { Object.assign(this.filters, patch); this.notify('list'); }
        select(id) { if (this.busy) return false; this.selected = id; this.error = this.pendingCommand ? this.error : null; this.notice = ''; this.notify(); return true; }
        makeDraft(record) {
            const input = fields(record);
            return { input, baseline: copy(input), id: record?.id, version: record?.version, conflict: false };
        }
        edit(id = this.selected) {
            if (this.busy || this.pendingCommand) return false;
            const record = this.record(id);
            if (!record || record.deletedAt) return false;
            if (!this.drafts.has(id)) this.drafts.set(id, this.makeDraft(record));
            this.selected = id; this.notify(); return true;
        }
        create() {
            if (this.busy || this.pendingCommand) return false;
            if (!this.drafts.has('new')) this.drafts.set('new', this.makeDraft());
            this.selected = 'new'; this.error = null; this.notice = ''; this.notify(); return true;
        }
        draft() { return this.drafts.get(this.selected); }
        dirty(id = this.selected) {
            const draft = this.drafts.get(id);
            return Boolean(draft && JSON.stringify(draft.input) !== JSON.stringify(draft.baseline));
        }
        update(field, value) {
            const draft = this.draft();
            if (!draft || this.busy || this.pendingCommand || ![...editable, 'tagsText', 'promptId', 'bodyVersionId'].includes(field)) return;
            draft.input[field] = value; this.error = null; this.notice = ''; this.notify('draft');
        }
        discard() {
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
                    ...values(draft.input), ...(draft.id && !asCopy ? { id: draft.id, version: draft.version } : {})
                });
                return await this.execute({ command, draftKey, action: 'save' });
            } catch (error) { this.error = { code: error.code || 'INVALID', scope: 'save' }; this.notify(); return false; }
        }
        async action(kind) {
            if (this.busy || this.pendingCommand || !['remove', 'restore'].includes(kind)) return false;
            const record = this.record(); if (!record || this.drafts.has(record.id)) return false;
            return this.execute({ command: this.store.request(kind, { id: record.id, version: record.version }), recordId: record.id, action: kind });
        }
        async retry() { if (this.busy || !this.pendingCommand) return false; return this.execute(this.pendingCommand); }
        async execute(operation) {
            if (this.busy) return false;
            this.busy = true; this.error = null; this.notice = ''; ++this.readGeneration; this.notify();
            try {
                const state = await this.store.mutate(operation.command);
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
    return { Controller, fields, values };
});
