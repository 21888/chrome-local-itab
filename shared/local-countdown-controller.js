/* Explicit, device-local countdown editing. No autosave, clocks, or network work. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-countdown-store.js'));
    else Object.assign(root.LocalItabCountdown, factory(root.LocalItabCountdown));
})(typeof window === 'undefined' ? globalThis : window, function (api) {
    'use strict';
    const KEYS = ['enabled', 'title', 'targetDate'];
    const values = state => Object.fromEntries(KEYS.map(key => [key, state[key]]));
    const sameValues = (a, b) => KEYS.every(key => a[key] === b[key]);
    const sameState = (a, b) => a.schemaVersion === b.schemaVersion && a.revision === b.revision && sameValues(a, b);
    const editableErrors = new Set(['INVALID', 'TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT', 'DATE', 'UNCONFIGURED']);

    class Controller {
        constructor(store = new api.Store(), { onChange = () => {} } = {}) {
            this.store = store; this.onChange = onChange;
            this.state = null; this.draft = { enabled: false, title: '', targetDate: '' };
            this.loaded = false; this.pending = false; this.error = null; this.readError = false;
            this.conflict = false; this.composing = false; this.closed = false; this.status = 'loading';
            this.generation = 0; this.enabledGeneration = 0; this.readGeneration = 0;
            this.refreshNeeded = false; this.lastAttempt = null; this.listeners = new Set();
        }
        subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
        emit() { if (!this.closed) { this.onChange(this); this.listeners.forEach(fn => fn(this)); } }
        updateStatus() {
            this.status = this.pending ? 'saving' : this.error ? 'error' : !this.loaded ? 'loading' :
                this.dirty() || this.conflict ? 'unsaved' : 'saved';
        }
        async init() {
            if (this.closed) return;
            if (!this.unsubscribe) this.unsubscribe = this.store.subscribe(() => {
                if (this.pending) this.refreshNeeded = true;
                else this.refresh().catch(() => {});
            });
            return this.refresh();
        }
        dirty() { return Boolean(this.loaded && !sameValues(this.draft, this.state)); }
        hasUncommittedWork() { return Boolean(this.pending || this.composing || this.dirty() || this.conflict || this.error); }

        // A partial field object is merged. Pending reads and writes never disable draft ownership.
        setDraft(partial) {
            if (!this.loaded || this.closed || !partial || typeof partial !== 'object' || Array.isArray(partial)) return;
            let changed = false;
            const draft = { ...this.draft };
            for (const key of KEYS) {
                if (Object.hasOwn(partial, key) && partial[key] !== draft[key]) {
                    draft[key] = partial[key]; changed = true;
                    if (key === 'enabled') this.enabledGeneration++;
                }
            }
            if (!changed) return;
            this.draft = draft; this.generation++;
            if (editableErrors.has(this.error?.code)) { this.error = null; this.lastAttempt = null; }
            this.updateStatus(); this.emit();
        }
        setComposing(value) {
            if (this.closed) return;
            value = Boolean(value);
            if (value === this.composing) return;
            this.composing = value; this.generation++; this.updateStatus(); this.emit();
        }
        checked(next) {
            try { api.validate(next); } catch (_) { throw api.fault('CORRUPT'); }
            // A fresh lower revision can mean that the saved key was removed. Never turn that
            // into a writable blank baseline while this page still owns an older draft.
            if (this.state && next.revision < this.state.revision) {
                this.conflict = true; throw api.fault('CORRUPT');
            }
            return { ...next };
        }
        fail(error) {
            this.error = error;
            if (['READ', 'CORRUPT'].includes(error.code)) this.readError = true;
            if (error.code === 'CONFLICT') this.conflict = true;
            this.updateStatus();
        }
        async refresh() {
            if (this.closed) return;
            if (this.pending) { this.refreshNeeded = true; return; }
            const read = ++this.readGeneration;
            try {
                const result = await this.store.read();
                if (this.closed || read !== this.readGeneration) return;
                const next = this.checked(result);
                const retain = this.dirty() || this.composing || this.conflict || Boolean(this.error && this.loaded);
                if (this.state && !sameState(next, this.state) && retain) this.conflict = true;
                if (!retain) { this.draft = values(next); this.error = null; }
                this.state = next; this.loaded = true; this.readError = false;
                this.updateStatus(); this.emit(); return next;
            } catch (error) {
                if (this.closed || read !== this.readGeneration) return;
                this.fail(error); this.emit(); throw error;
            }
        }
        adoptCommitted(next, attempt) {
            this.state = next; this.loaded = true; this.readError = false;
            this.error = null; this.conflict = false; this.lastAttempt = null;
            if (attempt.kind === 'save') {
                // Canonicalize the submitted title only if no newer user input owns the draft.
                if (this.generation === attempt.generation && !this.composing) this.draft = values(next);
            } else if (this.enabledGeneration === attempt.enabledGeneration && attempt.draft.enabled === attempt.baseline.enabled) {
                // Hide changes only visibility. Unrelated edits, including an edited checkbox,
                // stay in the editor and cannot be published by this card action.
                this.draft = { ...this.draft, enabled: next.enabled };
            }
        }
        async finishPending() {
            this.pending = false;
            const refresh = this.refreshNeeded || this.conflict; this.refreshNeeded = false;
            if (refresh && !this.closed) await this.refresh().catch(() => {});
            this.updateStatus(); this.emit();
        }
        async run(kind, value, revision, originalAttempt) {
            if (this.pending || this.closed) return;
            let expected;
            try {
                expected = api.fields(kind === 'save' ? value : { ...values(this.state), enabled: value });
            } catch (error) {
                this.lastAttempt = null; this.fail(error); this.emit(); throw error;
            }
            const attempt = originalAttempt || {
                kind, value: kind === 'save' ? { ...value } : value,
                baseline: { ...this.state }, expected,
                draft: { ...this.draft }, generation: this.generation, enabledGeneration: this.enabledGeneration
            };
            this.lastAttempt = attempt;
            ++this.readGeneration; this.pending = true; this.updateStatus(); this.emit();
            try {
                const result = await this.store.mutate({ kind, value: kind === 'save' ? { ...value } : value, revision });
                if (this.closed) return;
                const next = this.checked(result);
                if (next.revision !== revision + 1 || !sameValues(next, expected)) throw api.fault('VERIFY');
                this.adoptCommitted(next, attempt); return next;
            } catch (error) {
                if (!this.closed) this.fail(error);
                throw error;
            } finally { await this.finishPending(); }
        }
        save() {
            if (!this.loaded || this.closed || this.readError || this.pending || this.composing || this.conflict || this.error || !this.dirty()) return Promise.resolve();
            return this.run('save', { ...this.draft }, this.state.revision);
        }
        setEnabled(value) {
            if (!this.loaded || this.closed || this.readError || this.pending || this.composing || this.conflict || this.error || value === this.state.enabled) return Promise.resolve();
            return this.run('visibility', value, this.state.revision);
        }
        async retry() {
            if (this.pending || this.closed || this.composing) return;
            if (!this.loaded) return this.refresh();
            const attempt = this.lastAttempt, read = ++this.readGeneration;
            let replay = false, outcome;
            this.pending = true; this.updateStatus(); this.emit();
            try {
                const result = await this.store.read();
                if (this.closed || read !== this.readGeneration) return;
                const next = this.checked(result);
                if (attempt) {
                    // Only the original canonical submission proves a failed acknowledgement
                    // succeeded. Comparing the current draft could acknowledge unrelated edits.
                    if (next.revision > attempt.baseline.revision && sameValues(next, attempt.expected)) {
                        this.adoptCommitted(next, attempt);
                    } else if (sameState(next, attempt.baseline) && !this.conflict) {
                        this.state = next; this.readError = false; this.error = null; replay = true;
                    } else {
                        this.state = next; this.readError = false; this.fail(api.fault('CONFLICT'));
                    }
                } else {
                    const retain = this.dirty() || this.composing || this.conflict;
                    if (!sameState(next, this.state) && retain) this.conflict = true;
                    if (!retain) this.draft = values(next);
                    this.state = next; this.readError = false; this.error = null;
                }
                outcome = next;
            } catch (error) {
                if (this.closed || read !== this.readGeneration) return;
                this.fail(error); throw error;
            } finally {
                // A retry may safely replay only the exact failed action, after proving its
                // baseline is unchanged. Newer draft inputs still require their own Save.
                if (replay && !this.closed) this.pending = false;
                else await this.finishPending();
            }
            if (replay && !this.closed) return this.run(attempt.kind, attempt.value, attempt.baseline.revision, attempt);
            return outcome;
        }
        async useSaved() {
            if (this.pending || this.closed) return;
            const generation = this.generation, read = ++this.readGeneration;
            this.pending = true; this.updateStatus(); this.emit();
            try {
                const result = await this.store.read();
                if (this.closed || read !== this.readGeneration) return;
                const next = this.checked(result);
                this.state = next; this.loaded = true; this.readError = false;
                if (generation !== this.generation || this.composing) {
                    this.conflict = true; this.error = api.fault('CONFLICT'); return next;
                }
                this.draft = values(next); this.error = null; this.conflict = false; this.lastAttempt = null;
                return next;
            } catch (error) {
                if (this.closed || read !== this.readGeneration) return;
                this.fail(error); throw error;
            } finally { await this.finishPending(); }
        }
        cancel() { return this.useSaved(); }
        replaceWithDraft() {
            if (!this.loaded || this.closed || this.readError || !this.conflict || this.pending || this.composing) return Promise.resolve();
            // The view confirms replacement. A further unseen write must conflict again.
            return this.run('save', { ...this.draft }, this.state.revision);
        }
        destroy() { this.closed = true; ++this.readGeneration; this.unsubscribe?.(); this.listeners.clear(); }
    }
    return { Controller };
});
