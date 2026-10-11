/* Exact preview reference -> a new, empty, unsaved collection draft. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./local-prompts-store.js') : root.LocalItabPrompts);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabPromptDraft = api;
})(typeof window === 'undefined' ? globalThis : window, function (Prompts) {
    'use strict';
    const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
    function href(promptId, bodyVersionId) {
        return validId(promptId) && validId(bodyVersionId) ? `collections.html?promptId=${encodeURIComponent(promptId)}&bodyVersionId=${encodeURIComponent(bodyVersionId)}` : null;
    }
    function target(search) {
        const params = new URLSearchParams(search);
        // No two startup handlers may claim the same tab, including legacy routes.
        const legacy = ['record', 'capture', 'captureError'];
        if (legacy.some(key => params.getAll(key).length > 1) || legacy.filter(key => params.has(key)).length > 1) return { error: 'invalid' };
        if (!params.has('promptId') && !params.has('bodyVersionId')) return null;
        if ([...params.keys()].some(key => !['promptId', 'bodyVersionId'].includes(key)) ||
            params.getAll('promptId').length !== 1 || params.getAll('bodyVersionId').length !== 1 ||
            !validId(params.get('promptId')) || !validId(params.get('bodyVersionId'))) return { error: 'invalid' };
        return { promptId: params.get('promptId'), bodyVersionId: params.get('bodyVersionId') };
    }
    function resolve(state, reference) {
        if (!reference || !href(reference.promptId, reference.bodyVersionId)) return null;
        const checked = Prompts.validate(state), record = checked.records.find(item => item.id === reference.promptId && !item.deletedAt);
        const version = record?.history.find(item => item.id === reference.bodyVersionId);
        return version ? { record, version } : null; // Never consult recovery or substitute latest.
    }
    class Handoff {
        constructor({ controller, request, blocked = () => false, clearURL = () => {} }) {
            this.controller = controller; this.request = request; this.blocked = blocked; this.clearURL = clearURL;
            this.ticket = controller.captureTicket(); this.finished = false;
            this.eligible = controller.selected === null && !controller.drafts.size && !controller.hasUncommittedWork() && this.ticket === 0;
            if (this.eligible) controller.selected = '';
            controller.resultDraftStatus = request.error ? 'invalid' : this.eligible ? 'loading' : 'unavailable';
        }
        async run() {
            const c = this.controller;
            if (this.finished || c.disposed) return false;
            this.finished = true;
            if (this.request.error || !this.eligible) { c.notify(); return false; }
            const generation = c.promptGeneration + 1, state = await c.refreshPrompts();
            if (c.disposed) return false;
            const safe = state && generation === c.promptGeneration && !c.promptLoading && !c.promptError &&
                !this.blocked() && c.state && !c.error && c.pendingReadGeneration === null && !c.busy && !c.pendingCommand &&
                !c.drafts.size && c.captureTicket() === this.ticket && c.selected === '';
            if (!safe || !resolve(state, this.request)) { c.resultDraftStatus = 'unavailable'; c.notify(); return false; }
            const draft = c.makeDraft();
            draft.input.promptId = this.request.promptId; draft.input.bodyVersionId = this.request.bodyVersionId;
            draft.exactResult = true;
            c.drafts.set('new', draft); c.selected = 'new'; c.interactionGeneration++;
            c.resultDraftStatus = 'ready';
            try { this.clearURL(); } catch (_) { /* No save or replay in this page. */ }
            c.notify(); return true;
        }
    }
    return { href, target, resolve, Handoff };
});
