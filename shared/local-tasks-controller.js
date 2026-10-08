(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-tasks-store.js'));
    else Object.assign(root.LocalItabTasks, factory(root.LocalItabTasks));
})(typeof window === 'undefined' ? globalThis : window, function (api) {
    'use strict';
    class Controller {
        constructor(store = new api.Store()) {
            this.store = store; this.state = null; this.status = 'loading'; this.error = null;
            this.pending = null; this.retryCommand = null; this.listeners = new Set(); this.closed = false;
            this.unsubscribe = store.subscribe(() => { this.refresh().catch(() => {}); });
        }
        subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
        emit() { if (!this.closed) this.listeners.forEach(fn => fn(this)); }
        async refresh() {
            try {
                const state = await this.store.read();
                if (this.closed) return;
                if (!this.state || state.revision >= this.state.revision) this.state = state;
                if (this.status === 'loading' || (this.error?.code === 'READ' && !this.retryCommand)) {
                    this.status = 'ready'; this.error = null;
                }
                this.emit(); return state;
            } catch (error) {
                if (!this.closed) { this.status = 'error'; this.error = error; this.emit(); }
                throw error;
            }
        }
        run(command) {
            if (this.pending) return this.pending;
            this.status = 'saving'; this.error = null; this.retryCommand = command;
            const promise = this.store.mutate(command).then(state => {
                if (!this.closed) {
                    if (!this.state || state.revision >= this.state.revision) this.state = state;
                    this.status = 'saved'; this.error = null; this.retryCommand = null;
                }
                return state;
            }).catch(async error => {
                if (!this.closed) {
                    this.status = 'error'; this.error = error;
                    // Read latest committed rows; never replace a draft or retry on its behalf.
                    if (error.code === 'CONFLICT') await this.refresh().catch(() => {});
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
            if (!this.pending && this.retryCommand?.operationId === operationId) {
                this.retryCommand = null; this.error = null; this.status = 'ready'; this.emit();
            }
        }
        retry() { return this.retryCommand ? this.run(this.retryCommand) : this.refresh(); }
        action(kind, values) { return this.run(this.store.request(kind, values)); }
        destroy() { this.closed = true; this.unsubscribe(); this.listeners.clear(); }
    }
    return { Controller };
});
