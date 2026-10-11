/* Page-owned drafts and variable values stay in memory, never in settings. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./local-prompts-store.js') : root.LocalItabPrompts, typeof module === 'object' && module.exports ? require('./local-ai-collections-store.js') : root.LocalItabAICollections);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabPromptsController = api;
})(typeof window === 'undefined' ? globalThis : window, function (Core, Collections) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const editable = ['title', 'body', 'category', 'tool', 'favorite'];
    const uncertain = code => ['WRITE', 'READ', 'VERIFY'].includes(code);
    function fields(record) {
        const draft = Core.createDraft(record);
        return { ...Object.fromEntries(editable.map(key => [key, draft[key]])), tagsText: draft.tags.join(', ') };
    }
    function values(input) {
        const tags = input.tagsText.split(/[,，\n]/u).map(tag => tag.trim()).filter(Boolean);
        return { ...Object.fromEntries(editable.map(key => [key, input[key]])), tags };
    }
    // Exact immutable IDs only: no title matching, latest-version fallback or recovery copies.
    function linkedResults(state, promptId, bodyVersionId) {
        if (!promptId || !bodyVersionId) return [];
        return (state?.records || []).filter(record => record.deletedAt === null &&
            record.promptRef?.promptId === promptId && record.promptRef.bodyVersionId === bodyVersionId)
            .map(record => ({ id: record.id, version: record.version, title: record.title, tool: record.tool }));
    }
    class Controller {
        constructor({ store = new Core.Store(), collectionStore = null, onChange = () => {} } = {}) {
            this.store = store; this.onChange = onChange;
            this.collectionStore = collectionStore; this.collectionState = null; this.collectionLoading = false;
            this.collectionError = null; this.linkedPromptUnavailable = false; this.collectionGeneration = 0; this.collectionSubscriptionError = false;
            this.state = null; this.selected = null; this.drafts = new Map(); this.sessions = new Map(); this.activeSessions = new Map();
            this.filters = { query: '', mode: 'all', category: '' };
            this.busy = false; this.error = null; this.notice = ''; this.readGeneration = 0; this.pendingReadGeneration = null;
            this.pendingCommand = null; this.disposed = false; this.refreshQueued = false;
        }
        notify(kind = 'render') { if (!this.disposed) this.onChange(kind); }
        async start() {
            this.unsubscribe = this.store.subscribe(() => { if (this.busy) this.refreshQueued = true; else void this.refresh(); });
            try { this.unsubscribeCollections = this.collectionStore?.subscribe(() => { void this.refreshCollections(); }); }
            catch (_) { this.collectionSubscriptionError = true; }
            await Promise.all([this.refresh(), this.refreshCollections()]);
        }
        dispose() {
            this.disposed = true; this.readGeneration++; this.collectionGeneration++; this.collectionState = null;
            // Teardown must invalidate cards even if one backend's cleanup fails.
            for (const unsubscribe of [this.unsubscribe, this.unsubscribeCollections]) { try { unsubscribe?.(); } catch (_) { /* Continue independent cleanup. */ } }
        }
        async refreshCollections() {
            if (this.disposed) return;
            const generation = ++this.collectionGeneration;
            this.collectionState = null; this.collectionLoading = true; this.collectionError = null; this.notify('linkedResults');
            try {
                if (!this.collectionStore || this.collectionSubscriptionError) throw new Error('Unavailable');
                const state = Collections.validate(await this.collectionStore.read());
                if (this.disposed || generation !== this.collectionGeneration) return;
                this.collectionState = state;
            } catch (_) {
                if (this.disposed || generation !== this.collectionGeneration) return;
                this.collectionError = 'READ';
            }
            this.collectionLoading = false; this.notify('linkedResults');
        }
        linkedResults(promptId, bodyVersionId) {
            if (this.disposed || this.collectionLoading || this.collectionError || !this.collectionState || this.linkedPromptUnavailable || this.pendingReadGeneration !== null) return [];
            return linkedResults(this.collectionState, promptId, bodyVersionId).map(row => ({ ...row, generation: this.collectionGeneration }));
        }
        linkedResultCurrent(row, promptId, bodyVersionId) {
            return this.selected === promptId && !this.draft() && !this.busy && !this.pendingCommand &&
                row.generation === this.collectionGeneration && this.linkedResults(promptId, bodyVersionId).some(item => item.id === row.id && item.version === row.version);
        }
        async refresh() {
            if (this.busy) { this.refreshQueued = true; return; }
            const generation = ++this.readGeneration;
            this.pendingReadGeneration = generation; this.notify('linkedResults');
            try {
                const next = await this.store.read();
                if (this.disposed || generation !== this.readGeneration) return;
                this.accept(next); this.linkedPromptUnavailable = false;
                if (!this.pendingCommand && this.error?.scope === 'read') this.error = null;
            } catch (error) {
                if (this.disposed || generation !== this.readGeneration) return;
                this.linkedPromptUnavailable = true; this.error = { code: error.code || 'READ', scope: 'read' };
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
        record(id = this.selected) { return this.state?.records.find(record => record.id === id) || null; }
        results() {
            if (!this.state) return [];
            const options = { removed: this.filters.mode === 'trash' };
            if (this.filters.mode === 'favorites') options.favorite = true;
            if (this.filters.category) options.category = this.filters.category;
            return Core.search(this.state, this.filters.query, options);
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
            if (!draft || this.busy || this.pendingCommand || ![...editable, 'tagsText'].includes(field)) return;
            draft.input[field] = value; this.error = null; this.notice = ''; this.notify('draft');
        }
        discard() {
            if (this.busy || this.pendingCommand) return false;
            const key = this.selected; this.drafts.delete(key);
            if (key === 'new') this.selected = this.results()[0]?.record.id || null;
            this.error = null; this.notice = ''; this.notify(); return true;
        }
        session(record = this.record()) {
            if (!record) return null;
            const previousKey = this.activeSessions.get(record.id), previous = this.sessions.get(previousKey);
            if (previous && Object.keys(previous.values).length) return previous;
            const key = `${record.id}:${record.currentVersionId}`;
            if (!this.sessions.has(key)) this.sessions.set(key, { values: Object.create(null), literal: false, body: record.body, versionId: record.currentVersionId });
            this.activeSessions.set(record.id, key); return this.sessions.get(key);
        }
        variables(record = this.record()) { try { return record ? Core.previewTemplate(this.session(record).body).variables : []; } catch (_) { return []; } }
        setVariable(name, value) {
            const record = this.record();
            if (!record || !this.variables(record).includes(name)) return;
            this.session(record).values[name] = value; this.notify('preview');
        }
        clearVariables() { const session = this.session(); if (!session) return; session.values = Object.create(null); session.literal = false; this.activeSessions.delete(this.selected); this.notify(); }
        setLiteral(value) { const session = this.session(); if (session) { session.literal = value; this.notify('preview'); } }
        preview() {
            const record = this.record(), session = this.session(record);
            if (!record) return null;
            try { return Core.previewTemplate(session.body, session.literal ? {} : session.values, { literal: session.literal }); }
            catch (error) { return { text: '', variables: [], missing: [], complete: false, error: error.code || 'INVALID' }; }
        }
        hasUncommittedWork() {
            return this.busy || Boolean(this.pendingCommand) || [...this.drafts.keys()].some(id => this.dirty(id)) ||
                [...this.sessions.values()].some(session => Object.keys(session.values).length > 0);
        }
        draftCount() { return [...this.drafts.keys()].filter(id => this.dirty(id)).length; }
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
        async action(kind, versionId, expectedVersion) {
            if (this.busy || this.pendingCommand) return false;
            const record = this.record();
            if (!record || this.drafts.has(record.id)) return false;
            const data = { id: record.id, version: expectedVersion || record.version };
            if (kind === 'favorite') data.favorite = !record.favorite;
            if (kind === 'restoreVersion') data.versionId = versionId;
            return this.execute({ command: this.store.request(kind === 'favorite' ? 'edit' : kind, data), recordId: record.id, action: kind });
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
                    if (error.code === 'HISTORY_LIMIT' && operation.action === 'restoreVersion') {
                        const record = this.record(operation.recordId), version = record?.history.find(item => item.id === operation.command.versionId);
                        if (record && version) { const draft = this.makeDraft(record); draft.input.body = version.body; this.drafts.set(record.id, draft); this.selected = record.id; }
                    }
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
    return { Controller, fields, values, linkedResults };
});
