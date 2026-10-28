(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-tasks-store.js'));
    else Object.assign(root.LocalItabTasks, factory(root.LocalItabTasks));
})(typeof window === 'undefined' ? globalThis : window, function (api) {
    'use strict';
    const sources = new WeakMap();
    const current = (controller, source) => !controller.closed && controller.store === source.store && source.store.backend === source.backend;
    class Controller {
        constructor(store = new api.Store()) {
            this.store = store; this.state = null; this.status = 'loading'; this.error = null;
            this.pending = null; this.retryCommand = null; this.listeners = new Set(); this.closed = false;
            // State revisions, subscription notifications and retries share one
            // construction source. Replacing public fields is not a source switch.
            const source = { store, backend: store.backend, refresh: 0, feedback: 0 }; sources.set(this, source);
            this.unsubscribe = () => {};
            try {
                this.unsubscribe = store.subscribe(() => { if (!source.subscriptionFailed && current(this, source)) this.refresh().catch(() => {}); });
            } catch (_) {
                source.subscriptionFailed = true;
                this.status = 'error'; this.error = api.fault('SUBSCRIPTION');
            }
        }
        get subscriptionFailed() { return sources.get(this).subscriptionFailed === true; }
        subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
        emit() { if (!this.closed) this.listeners.forEach(fn => fn(this)); }
        async refresh() {
            const source = sources.get(this);
            if (!current(this, source)) throw api.fault('UNAVAILABLE');
            if (source.subscriptionFailed) { this.emit(); throw api.fault('SUBSCRIPTION'); }
            const refresh = ++source.refresh, feedback = source.feedback;
            try {
                const state = await source.store.read();
                if (this.closed) return;
                if (!current(this, source) || refresh !== source.refresh) return state;
                if (!this.state || state.revision >= this.state.revision) this.state = state;
                // A notification may observe a real commit whose acknowledgement
                // failed. Publish that state for Undo/render without clearing the
                // newer mutation's error, retry or Saved feedback.
                if (feedback === source.feedback && (this.status === 'loading' || (['READ', 'WORKSPACE_READ'].includes(this.error?.code) && !this.retryCommand))) {
                    this.status = 'ready'; this.error = null;
                }
                this.emit(); return state;
            } catch (error) {
                if (current(this, source) && refresh === source.refresh && feedback === source.feedback) { this.status = 'error'; this.error = error; this.emit(); }
                throw error;
            }
        }
        run(command) {
            if (this.pending) return this.pending;
            const source = sources.get(this);
            if (!current(this, source)) return Promise.reject(api.fault('UNAVAILABLE'));
            if (source.subscriptionFailed) return Promise.reject(api.fault('SUBSCRIPTION'));
            // Older refreshes cannot replace this mutation's pending/outcome
            // feedback, including a read started while the mutation was pending.
            source.feedback++;
            this.status = 'saving'; this.error = null; this.retryCommand = command;
            const promise = source.store.mutate(command).then(state => {
                source.feedback++;
                if (!this.closed) {
                    if (current(this, source) && (!this.state || state.revision >= this.state.revision)) this.state = state;
                    // A dispatched original transaction still reports its real
                    // outcome; a source gap only prevents publishing its state.
                    this.status = 'saved'; this.error = null; this.retryCommand = null;
                }
                return state;
            }).catch(async error => {
                source.feedback++;
                if (!this.closed) {
                    this.status = 'error'; this.error = error;
                    // Read latest committed rows; never replace a draft or retry on its behalf.
                    if (error.code === 'CONFLICT' && current(this, source)) await this.refresh().catch(() => {});
                }
                throw error;
            }).finally(() => {
                if (this.pending === promise) this.pending = null;
                this.emit();
            });
            this.pending = promise; this.emit();
            return promise;
        }
        dismissRetry(operationId) {
            if (sources.get(this).subscriptionFailed) return;
            if (!this.pending && this.retryCommand?.operationId === operationId) {
                this.retryCommand = null; this.error = null; this.status = 'ready'; this.emit();
            }
        }
        retry() { return this.pending || (this.retryCommand ? this.run(this.retryCommand) : this.refresh()); }
        action(kind, values) {
            if (this.pending) return this.pending;
            const source = sources.get(this);
            if (!current(this, source)) return Promise.reject(api.fault('UNAVAILABLE'));
            if (source.subscriptionFailed) return Promise.reject(api.fault('SUBSCRIPTION'));
            return this.run(source.store.request(kind, values));
        }
        destroy() { this.closed = true; this.unsubscribe(); this.listeners.clear(); }
    }
    return { Controller };
});
