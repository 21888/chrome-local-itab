/* Page-owned drafts and variable values stay in memory, never in settings. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./local-prompts-store.js') : root.LocalItabPrompts, typeof module === 'object' && module.exports ? require('./local-ai-collections-store.js') : root.LocalItabAICollections, typeof module === 'object' && module.exports ? require('./local-prompt-starters.js') : root.LocalItabPromptStarters);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabPromptsController = api;
})(typeof window === 'undefined' ? globalThis : window, function (Core, Collections, Starters) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const SESSION_LIMIT = 100, SESSION_VALUE_LIMIT = 2 * 1024 * 1024;
    const editable = ['title', 'body', 'category', 'tool', 'favorite'];
    const uncertain = code => ['WRITE', 'READ', 'VERIFY'].includes(code);
    function fields(record) {
        const draft = Core.createDraft(record);
        return { ...Object.fromEntries(editable.map(key => [key, draft[key]])), tagsText: draft.tags.join(', ') };
    }
    function values(input, originalTags = null) {
        // Display separators are ambiguous for imported tags. Preserve the exact
        // original array until the text actually changes (including edit/revert).
        const tags = originalTags && input.tagsText === originalTags.join(', ')
            ? [...originalTags]
            : input.tagsText.split(/[,，\n]/u).map(tag => tag.trim()).filter(Boolean);
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
            this.draftPreview = null; this.draftPreviewEpoch = 0;
            this.filters = { query: '', mode: 'all', category: '', tag: '' };
            this.busy = false; this.error = null; this.notice = ''; this.readGeneration = 0; this.pendingReadGeneration = null;
            this.excerptEpoch = 0; this.pendingCommand = null; this.pendingInspection = false; this.disposed = false; this.refreshQueued = false;
        }
        notify(kind = 'render') { if (!this.disposed) this.onChange(kind); }
        async start() {
            this.unsubscribe = this.store.subscribe(() => { if (this.busy) this.refreshQueued = true; else void this.refresh(); });
            try { this.unsubscribeCollections = this.collectionStore?.subscribe(() => { void this.refreshCollections(); }); }
            catch (_) { this.collectionSubscriptionError = true; }
            await Promise.all([this.refresh(), this.refreshCollections()]);
        }
        dispose() {
            if (this.disposed) return;
            this.invalidateDraftPreview(); this.excerptEpoch++; this.disposed = true; this.readGeneration++; this.collectionGeneration++; this.collectionState = null; this.sessions.clear(); this.activeSessions.clear();
            // Teardown must invalidate cards even if one backend's cleanup fails.
            for (const unsubscribe of [this.unsubscribe, this.unsubscribeCollections]) { try { unsubscribe?.(); } catch (_) { /* Continue independent cleanup. */ } }
            this.onChange('dispose');
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
            this.excerptEpoch++; const generation = ++this.readGeneration;
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
            const results = Core.search(this.state, this.filters.query, options);
            return this.filters.tag ? results.filter(({ record }) => record.tags.includes(this.filters.tag)) : results;
        }
        filter(patch) { Object.assign(this.filters, patch); this.notify('list'); }
        select(id) { if (this.busy) return false; this.invalidateDraftPreview(); this.excerptEpoch++; this.selected = id; this.error = this.pendingCommand ? this.error : null; this.notice = ''; this.notify(); return true; }
        makeDraft(record) {
            if (record?.id) {
                const input = fields(record);
                return { input, baseline: copy(input), originalTags: Core.createDraft(record).tags, id: record.id, version: record.version, conflict: false };
            }
            const initial = fields(record);
            const draft = { baseline: copy(initial), originalTags: Core.createDraft(record).tags, id: record?.id, version: record?.version, conflict: false, revision: 0 };
            // Also invalidate direct assignments and edit/revert between asynchronous writes.
            const changed = () => {
                draft.revision++;
                if (this.draftPreview?.draft === draft) {
                    this.invalidateDraftPreview();
                    if (!this.updatingDraftInput) this.notify('draftPreview');
                }
            };
            const wrap = input => new Proxy(input, {
                set(target, name, value) { changed(); return Reflect.set(target, name, value); },
                deleteProperty(target, name) { changed(); return Reflect.deleteProperty(target, name); },
                defineProperty(target, name, descriptor) { changed(); return Reflect.defineProperty(target, name, descriptor); }
            });
            let input = wrap(initial);
            Object.defineProperty(draft, 'input', { enumerable: true, get: () => input, set: value => { changed(); input = wrap(value); } });
            return draft;
        }
        edit(id = this.selected) {
            if (this.busy || this.pendingCommand) return false;
            const record = this.record(id);
            if (!record || record.deletedAt) return false;
            this.invalidateDraftPreview(); this.excerptEpoch++; if (!this.drafts.has(id)) this.drafts.set(id, this.makeDraft(record));
            this.selected = id; this.notify(); return true;
        }
        create() {
            if (this.busy || this.pendingCommand) return false;
            this.invalidateDraftPreview(); this.excerptEpoch++; if (!this.drafts.has('new')) this.drafts.set('new', this.makeDraft());
            this.selected = 'new'; this.error = null; this.notice = ''; this.notify(); return true;
        }
        starterReady() {
            return !this.disposed && !this.busy && !this.pendingCommand && Boolean(this.state) &&
                this.pendingReadGeneration === null && !this.linkedPromptUnavailable && this.error?.scope !== 'read';
        }
        createFromStarter(id, language = 'en') {
            if (!this.starterReady()) return false;
            const starter = Starters.get(id, language);
            if (!starter) return false;
            // A second selection never replaces any existing nonempty new draft.
            if (this.dirty('new')) return false;
            this.invalidateDraftPreview();
            const draft = this.makeDraft();
            draft.input.title = starter.title; draft.input.body = starter.body;
            this.drafts.set('new', draft); this.selected = 'new'; this.excerptEpoch++;
            this.error = null; this.notice = ''; this.notify(); return true;
        }
        draft() { return this.drafts.get(this.selected); }
        dirty(id = this.selected) {
            const draft = this.drafts.get(id);
            return Boolean(draft && JSON.stringify(draft.input) !== JSON.stringify(draft.baseline));
        }
        update(field, value) {
            const draft = this.draft();
            if (!draft || this.busy || this.pendingCommand || ![...editable, 'tagsText'].includes(field)) return;
            this.updatingDraftInput = true;
            try { draft.input[field] = value; } finally { this.updatingDraftInput = false; }
            this.error = null; this.notice = ''; this.notify('draft');
        }
        discard() {
            if (this.busy || this.pendingCommand) return false;
            this.invalidateDraftPreview(); const key = this.selected; this.drafts.delete(key);
            if (key === 'new') this.selected = this.results()[0]?.record.id || null;
            this.error = null; this.notice = ''; this.notify(); return true;
        }
        invalidateDraftPreview() { this.draftPreview = null; this.draftPreviewEpoch++; }
        newDraftReady() {
            return !this.disposed && !this.busy && !this.pendingCommand && this.selected === 'new' && Boolean(this.draft()) && !this.draft().id;
        }
        previewValueSize() {
            return [...this.sessions.values(), ...(this.draftPreview ? [this.draftPreview] : [])]
                .reduce((sum, item) => sum + Object.values(item.values).reduce((n, text) => n + (typeof text === 'string' ? text.length : SESSION_VALUE_LIMIT + 1), 0), 0);
        }
        draftPreviewCurrent(session = this.draftPreview) {
            let current = false;
            try { current = Boolean(session && session === this.draftPreview && this.newDraftReady() && session.draft === this.draft() &&
                session.revision === this.draft().revision && session.snapshot === JSON.stringify(this.draft().input) && session.epoch === this.draftPreviewEpoch); } catch (_) { /* Fail closed. */ }
            if (!current && session === this.draftPreview && session) this.invalidateDraftPreview();
            return current;
        }
        startDraftPreview() {
            this.invalidateDraftPreview();
            if (!this.newDraftReady()) return false;
            const draft = this.draft();
            try {
                if (typeof draft.input.body !== 'string' || !draft.input.body.trim()) throw Core.fault('INVALID');
                const snapshot = JSON.stringify(draft.input), result = Core.previewTemplate(draft.input.body);
                this.draftPreview = { draft, snapshot, revision: draft.revision, epoch: this.draftPreviewEpoch, values: Object.create(null), result, error: null, valueRevision: 0 };
            } catch (error) {
                this.draftPreview = { draft, snapshot: JSON.stringify(draft.input), revision: draft.revision, epoch: this.draftPreviewEpoch, values: Object.create(null), result: null, error: error.code || 'INVALID', valueRevision: 0 };
            }
            this.notify('draftPreview'); return true;
        }
        draftPreviewResult() {
            const session = this.draftPreview;
            if (!this.draftPreviewCurrent(session)) return null;
            if (session.error) return { text: '', variables: session.result?.variables || [], missing: [], complete: false, error: session.error };
            try {
                if (this.previewValueSize() > SESSION_VALUE_LIMIT) throw Core.fault('SESSION_LIMIT');
                return Core.previewTemplate(session.draft.input.body, session.values);
            } catch (error) { return { text: '', variables: session.result?.variables || [], missing: [], complete: false, error: error.code || 'INVALID' }; }
        }
        setDraftVariable(name, value) {
            const session = this.draftPreview;
            if (!this.draftPreviewCurrent(session)) return false;
            session.valueRevision++;
            if (!session.result?.variables.includes(name)) { session.error = 'VARIABLE'; this.notify('draftPreviewValues'); return false; }
            try {
                if (typeof value !== 'string' || Array.from(value).length > Core.LIMITS.value ||
                    this.previewValueSize() - (session.values[name]?.length || 0) + value.length > SESSION_VALUE_LIMIT) throw Core.fault('SESSION_LIMIT');
                const next = Object.assign(Object.create(null), session.values); next[name] = value;
                Core.previewTemplate(session.draft.input.body, next);
                session.values = next; session.error = null;
            } catch (error) {
                // Never retain a previously valid hidden value after a rejected edit.
                delete session.values[name]; session.error = error.code || 'INVALID';
                this.notify('draftPreviewValues'); return false;
            }
            this.notify('draftPreviewValues'); return true;
        }
        draftCopyTicket() {
            const result = this.draftPreviewResult(), session = this.draftPreview;
            return result?.complete ? Object.freeze({ session, epoch: session.epoch, revision: session.valueRevision, values: JSON.stringify(session.values), text: result.text }) : null;
        }
        draftCopyCurrent(ticket) {
            if (!ticket || !this.draftPreviewCurrent(ticket.session) || ticket.epoch !== this.draftPreviewEpoch || ticket.revision !== ticket.session.valueRevision || ticket.values !== JSON.stringify(ticket.session.values)) return false;
            const result = this.draftPreviewResult(); return Boolean(result?.complete && result.text === ticket.text);
        }
        sessionSourceCurrent(record = this.record(), session = this.session(record)) {
            return Boolean(record && !record.deletedAt && session && !session.capacity &&
                record.history.some(version => version.id === session.versionId && version.body === session.body));
        }
        sessionReady() {
            return !this.disposed && !this.busy && !this.pendingCommand && this.pendingReadGeneration === null &&
                !this.linkedPromptUnavailable && !this.draft() && this.sessionSourceCurrent();
        }
        cachedSession(record, version) {
            // Include the exact body: a backup may reuse IDs with different content.
            const key = JSON.stringify([record.id, version.id, version.body]);
            if (!this.sessions.has(key)) {
                // Empty, inactive sessions carry no user input and can be reclaimed.
                for (const [oldKey, session] of this.sessions) {
                    if (this.sessions.size < SESSION_LIMIT) break;
                    if (!session.literal && !Object.keys(session.values).length && ![...this.activeSessions.values()].includes(oldKey)) this.sessions.delete(oldKey);
                }
                if (this.sessions.size >= SESSION_LIMIT) return null;
                this.sessions.set(key, { values: Object.create(null), literal: false, body: version.body, versionId: version.id });
            }
            this.activeSessions.set(record.id, key); return this.sessions.get(key);
        }
        session(record = this.record()) {
            if (!record) return null;
            if (this.disposed) return { values: Object.create(null), literal: false, body: record.body, versionId: record.currentVersionId };
            const previous = this.sessions.get(this.activeSessions.get(record.id));
            if (previous && (previous.explicit || previous.literal || Object.keys(previous.values).length || !this.sessionSourceCurrent(record, previous))) return previous;
            return this.cachedSession(record, { id: record.currentVersionId, body: record.body }) ||
                { values: Object.create(null), literal: false, body: record.body, versionId: record.currentVersionId, capacity: true };
        }
        useVersion(versionId, expectedBody, recordId = this.selected) {
            const record = this.record();
            if (this.disposed || this.busy || this.pendingCommand || this.pendingReadGeneration !== null || this.linkedPromptUnavailable || this.draft() || !record || record.deletedAt || record.id !== recordId) return false;
            const version = record.history.find(item => item.id === versionId && (expectedBody === undefined || item.body === expectedBody));
            if (!version) return false;
            // Materialize current input before switching, even when it has no variables.
            this.session(record);
            const session = this.cachedSession(record, version);
            if (!session) { this.error = { code: 'SESSION_LIMIT', scope: 'preview' }; this.notify(); return false; }
            session.explicit = true; this.excerptEpoch++; this.error = null; this.notify(); return true;
        }
        returnToCurrent() { const record = this.record(); return record ? this.useVersion(record.currentVersionId, record.body) : false; }
        variables(record = this.record()) { try { return record ? Core.previewTemplate(this.session(record).body).variables : []; } catch (_) { return []; } }
        setVariable(name, value) {
            const record = this.record();
            if (!this.sessionReady() || !this.variables(record).includes(name)) return false;
            const session = this.session(record);
            const total = this.previewValueSize();
            if (typeof value !== 'string' || Array.from(value).length > Core.LIMITS.value || total - (session.values[name]?.length || 0) + value.length > SESSION_VALUE_LIMIT) {
                this.error = { code: 'SESSION_LIMIT', scope: 'preview' }; this.notify(); return false;
            }
            this.excerptEpoch++; if (this.error?.scope === 'preview') this.error = null; session.values[name] = value; this.notify('preview'); return true;
        }
        clearVariables() {
            const session = this.session(); if (!session || this.disposed || this.busy || this.pendingCommand) return;
            this.excerptEpoch++;
            // Keep the shipped reset-to-current semantics. Clear both source and
            // destination so a cached current template never resurrects input.
            session.values = Object.create(null); session.literal = false; session.explicit = false;
            const record = this.record();
            const currentKey = JSON.stringify([record.id, record.currentVersionId, record.body]);
            const current = this.sessions.get(currentKey);
            if (current) { current.values = Object.create(null); current.literal = false; current.explicit = false; }
            const oldKey = this.activeSessions.get(this.selected);
            this.activeSessions.delete(this.selected); this.sessions.delete(oldKey);
            this.error = null; this.notify();
        }
        clearPreviewSessions() {
            if (this.disposed || this.busy || this.pendingCommand) return;
            this.excerptEpoch++; this.sessions.clear(); this.activeSessions.clear(); this.error = null; this.notify();
        }
        setLiteral(value) { const session = this.session(); if (session && this.sessionReady()) { this.excerptEpoch++; session.literal = value; this.notify('preview'); } }
        preview() {
            const record = this.record(), session = this.session(record);
            if (!record) return null;
            try {
                const preview = Core.previewTemplate(session.body, session.literal ? {} : session.values, { literal: session.literal });
                if (!this.sessionReady()) return { ...preview, complete: false, error: session.capacity ? 'SESSION_LIMIT' : 'PREVIEW_UNAVAILABLE' };
                return preview;
            } catch (error) { return { text: '', variables: [], missing: [], complete: false, error: error.code || 'INVALID' }; }
        }
        // One review capability belongs to one exact prompt/session/variable. Never persist it.
        excerptContext(name) {
            const record = this.record(), session = this.session();
            if (!this.sessionReady() || session.literal || !this.variables().includes(name)) return null;
            return { name, id: record.id, version: record.version, session, epoch: this.excerptEpoch, cancelled: false };
        }
        excerptCurrent(context) {
            return Boolean(context && this.sessionReady() && !context.cancelled && !this.disposed && !this.busy && !this.pendingCommand && this.pendingReadGeneration === null && !this.linkedPromptUnavailable && !this.draft() &&
                this.excerptEpoch === context.epoch && this.record()?.id === context.id && this.record()?.version === context.version && !this.record()?.deletedAt && this.session() === context.session && !context.session.literal);
        }
        excerptRows(context) {
            if (!this.excerptCurrent(context) || this.collectionLoading || this.collectionError || !this.collectionState) return [];
            return this.collectionState.records.filter(record => record.deletedAt === null).map(record => ({ id: record.id, title: record.title, generation: this.collectionGeneration }));
        }
        reviewExcerpt(context, row) {
            if (!this.excerptCurrent(context) || row.generation !== this.collectionGeneration || this.collectionLoading || this.collectionError) return null;
            const record = this.collectionState?.records.find(item => item.id === row.id && item.deletedAt === null);
            if (!record) return null;
            return { context, id: record.id, version: record.version, bodyVersion: record.currentVersionId, body: record.body, generation: this.collectionGeneration, used: false };
        }
        excerptReviewCurrent(review) {
            return Boolean(review && this.excerptCurrent(review.context) && review.generation === this.collectionGeneration && !this.collectionLoading && !this.collectionError);
        }
        async applyExcerpt(review) {
            if (!this.excerptReviewCurrent(review) || review.used) return { ok: false, code: 'STALE' };
            review.used = true;
            try {
                // Re-read both sources before applying: subscription delivery may be delayed.
                const [collections, prompts] = await Promise.all([this.collectionStore.read(), this.store.read()]);
                const source = Collections.validate(collections).records.find(item => item.id === review.id);
                const prompt = Core.validate(prompts).records.find(item => item.id === review.context.id);
                if (!this.excerptReviewCurrent(review) || !source || source.deletedAt !== null || source.version !== review.version || source.currentVersionId !== review.bodyVersion || source.body !== review.body || !prompt || prompt.deletedAt !== null || prompt.version !== review.context.version || !this.sessionSourceCurrent(prompt, review.context.session)) return { ok: false, code: 'STALE' };
                const { session, name } = review.context;
                Core.previewTemplate(session.body, { ...session.values, [name]: review.body });
                return this.setVariable(name, review.body) ? { ok: true } : { ok: false, code: this.error?.code || 'STALE' };
            } catch (error) { return { ok: false, code: error.code || 'READ' }; }
        }
        hasUncommittedWork() {
            return this.busy || Boolean(this.pendingCommand) || [...this.drafts.keys()].some(id => this.dirty(id)) ||
                [...this.sessions.values()].some(session => session.literal || Object.keys(session.values).length > 0) || Boolean(this.draftPreview && Object.keys(this.draftPreview.values).length);
        }
        draftCount() { return [...this.drafts.keys()].filter(id => this.dirty(id)).length; }
        async save(asCopy = false) {
            if (this.busy || this.pendingCommand) return false;
            const draftKey = this.selected, draft = this.draft();
            if (!draft || (draft.conflict && !asCopy)) return false;
            this.invalidateDraftPreview(); this.notify('draftPreview');
            try {
                const command = this.store.request(draft.id && !asCopy ? 'edit' : 'add', {
                    ...values(draft.input, draft.originalTags), ...(draft.id && !asCopy ? { id: draft.id, version: draft.version } : {})
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
        async retry() { if (this.busy || !this.pendingCommand) return false; return this.execute(this.pendingCommand, this.pendingInspection); }
        async execute(operation, inspect = false) {
            if (this.busy) return false;
            this.excerptEpoch++; this.busy = true; this.error = null; this.notice = ''; ++this.readGeneration; this.notify();
            try {
                let state;
                if (inspect) {
                    const result = await this.store.inspectOperation(operation.command);
                    if (!result.committed) throw Core.fault('OUTCOME_UNCERTAIN');
                    state = result.state;
                } else state = await this.store.mutate(operation.command);
                if (this.disposed) return false;
                this.pendingCommand = null; this.pendingInspection = false;
                if (operation.action === 'save') {
                    // Add IDs are the owned operationId, including exact retries.
                    const savedId = operation.command.kind === 'edit' ? operation.command.id : operation.command.operationId;
                    const saved = state.records.find(record => record.id === savedId);
                    this.drafts.delete(operation.draftKey);
                    if (saved) this.selected = saved.id;
                }
                this.accept(state); this.notice = inspect ? 'reconciled' : operation.action === 'save' ? 'saved' : operation.action;
                return true;
            } catch (error) {
                if (this.disposed) return false;
                this.error = { code: error.code || 'WRITE', scope: operation.action };
                if (this.pendingCommand === operation) {
                    // A later rejection proves nothing about an earlier lost acknowledgement.
                    // Keep the same frozen command and allow only read-only inspection now.
                    if (!uncertain(error.code) || inspect) this.pendingInspection = true;
                    this.error = { code: this.pendingInspection ? 'OUTCOME_UNCERTAIN' : error.code || 'WRITE', scope: operation.action };
                } else if (uncertain(error.code) || !error.code) this.pendingCommand = operation;
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
    return { Controller, fields, values, linkedResults, SESSION_LIMIT, SESSION_VALUE_LIMIT };
});
