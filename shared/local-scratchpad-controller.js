(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-scratchpad-store.js'), root);
    else Object.assign(root.LocalItabScratchpad, factory(root.LocalItabScratchpad, root));
})(typeof window === 'undefined' ? globalThis : window, function (api, root) {
    'use strict';
    class Controller {
        constructor(store = new api.Store(), { onChange = () => {}, delay = 500 } = {}) {
            this.store = store; this.onChange = onChange; this.delay = delay;
            this.state = null; this.draft = ''; this.loaded = false; this.pending = false;
            this.pendingWrite = false; this.writeError = false;
            this.error = null; this.readError = false; this.conflict = false; this.composing = false; this.closed = false;
            this.generation = 0; this.timer = null; this.status = 'loading'; this.listeners = new Set();
        }
        subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
        emit() { if (!this.closed) { this.onChange(this); this.listeners.forEach(fn => fn(this)); } }
        async init() {
            if (!this.unsubscribe) this.unsubscribe = this.store.subscribe(() => {
                if (this.pending) this.refreshNeeded = true;
                else this.refresh().catch(() => {});
            });
            return this.refresh();
        }
        dirty() { return this.loaded && this.draft !== this.state.content; }
        // Background read failures do not own a draft or an unfinished write.
        hasUncommittedWork() { return Boolean(this.pendingWrite || this.composing || this.dirty() || this.conflict || this.writeError); }
        cancelTimer() { clearTimeout(this.timer); this.timer = null; }
        schedule() {
            this.cancelTimer();
            if (!root.LocalItabContentLifecycle?.autosavePaused && this.loaded && this.dirty() && !this.pending && !this.composing && !this.conflict && !this.error && !this.closed)
                this.timer = setTimeout(() => { this.timer = null; this.save().catch(() => {}); }, this.delay);
        }
        setDraft(value) {
            if (!this.loaded || this.closed || (this.readError && !this.composing)) return;
            this.draft = value; this.generation++;
            // A corrected over-limit draft can resume saving, while storage failures require Retry.
            if (['TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT'].includes(this.error?.code)) { this.error = null; this.writeError = false; }
            this.status = this.dirty() ? 'unsaved' : 'saved'; this.schedule(); this.emit();
        }
        setComposing(value) { this.composing = value; if (value) this.cancelTimer(); else this.schedule(); this.emit(); }
        async refresh() {
            if (this.closed) return;
            if (this.pending) { this.refreshNeeded = true; return; }
            try {
                const next = await this.store.read(); if (this.closed || this.pending) { this.refreshNeeded = true; return; }
                if (this.state && next.revision < this.state.revision) return;
                const changed = this.state && (next.revision !== this.state.revision || next.content !== this.state.content || next.enabled !== this.state.enabled);
                const retain = this.dirty() || this.composing || this.conflict || this.writeError;
                if (changed && retain) { this.conflict = true; this.cancelTimer(); }
                if (!retain) this.draft = next.content;
                this.state = next; this.loaded = true; this.readError = false;
                if (!retain) { this.error = null; this.status = 'saved'; }
                this.emit(); return next;
            } catch (error) { if (!this.closed) { this.error = error; this.readError = true; this.status = 'error'; this.cancelTimer(); this.emit(); } throw error; }
        }
        async run(kind, value, revision) {
            if (this.pending || this.closed) return;
            this.cancelTimer(); this.pending = true; this.pendingWrite = true; this.status = 'saving'; this.emit();
            try {
                const next = await this.store.mutate({ kind, value, revision });
                if (!this.closed) { this.state = next; this.loaded = true; this.readError = false; this.error = null; this.writeError = false; this.conflict = false; this.status = this.dirty() ? 'unsaved' : 'saved'; }
                return next;
            } catch (error) {
                if (!this.closed) { this.error = error; this.writeError = true; if (['READ', 'CORRUPT'].includes(error.code)) this.readError = true; this.status = 'error'; if (error.code === 'CONFLICT') this.conflict = true; }
                throw error;
            } finally {
                this.pending = false; this.pendingWrite = false;
                const refresh = this.refreshNeeded || this.conflict; this.refreshNeeded = false;
                if (refresh && !this.closed) await this.refresh().catch(() => {});
                this.schedule(); this.emit();
            }
        }
        save() {
            if (!this.loaded || this.readError || this.pending || this.composing || this.conflict || this.error || !this.dirty()) return Promise.resolve();
            return this.run('content', this.draft, this.state.revision);
        }
        async retry() {
            if (this.pending || this.closed) return;
            if (!this.loaded || !this.hasUncommittedWork()) return this.refresh();
            this.cancelTimer(); this.pending = true; this.emit();
            const revision = this.state.revision;
            let save = false;
            try {
                const next = await this.store.read(); if (this.closed) return; this.readError = false;
                // A failed acknowledgement may already have committed this exact draft.
                if (next.content === this.draft) {
                    this.state = next; this.error = null; this.writeError = false; this.conflict = false; this.status = 'saved';
                } else if (next.revision !== revision || next.content !== this.state.content || this.conflict) {
                    this.state = next; this.conflict = true; this.error = api.fault('CONFLICT');
                } else { this.error = null; this.writeError = false; save = true; }
            } catch (error) { this.error = error; this.readError = true; this.status = 'error'; throw error; }
            finally { this.pending = false; this.emit(); }
            if (save) return this.save();
        }
        async useSaved() {
            if (this.pending || this.closed) return;
            const generation = this.generation; this.cancelTimer(); this.pending = true; this.emit();
            try {
                const next = await this.store.read(); if (this.closed) return; this.readError = false;
                this.state = next; this.loaded = true; this.readError = false;
                if (generation !== this.generation || this.composing) { this.conflict = true; return; }
                this.draft = next.content; this.error = null; this.writeError = false; this.conflict = false; this.status = 'saved';
            } catch (error) { this.error = error; this.readError = true; this.status = 'error'; throw error; }
            finally { this.pending = false; this.emit(); }
        }
        replaceWithDraft() {
            if (!this.loaded || this.readError || !this.conflict || this.pending || this.composing) return Promise.resolve();
            // The displayed latest revision is the baseline; another change must conflict again.
            return this.run('content', this.draft, this.state.revision);
        }
        setEnabled(value) {
            if (!this.loaded || this.readError || this.pending || this.conflict || this.error) return Promise.resolve();
            return this.run('visibility', value, this.state.revision);
        }
        destroy() { this.closed = true; this.cancelTimer(); this.unsubscribe?.(); this.listeners.clear(); }
    }
    return { Controller };
});
