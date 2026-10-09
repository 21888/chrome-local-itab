(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-focus-store.js'));
    else Object.assign(root.LocalItabFocus, factory(root.LocalItabFocus));
})(typeof window === 'undefined' ? globalThis : window, function (api) {
    'use strict';
    class Controller {
        constructor(store = new api.Store(), { monotonic = () => performance.now(), wall = () => Date.now() } = {}) {
            this.store = store; this.monotonic = monotonic; this.wall = wall; this.listeners = new Set();
            this.state = null; this.error = null; this.pending = null; this.closed = false; this.anchor = null; this.clockUncertain = false;
            this.unsubscribe = store.subscribe(() => { this.refresh().catch(() => {}); });
        }
        subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
        snapshot() {
            if (!this.state) return null;
            const now = this.wall(), result = api.project(this.state, now);
            if (this.state.session.status === 'running' && this.anchor) {
                const mono = this.monotonic() - this.anchor.mono, wall = now - this.anchor.wall;
                const remaining = Number.isFinite(mono) && mono >= 0 ? Math.max(0, this.anchor.remaining - mono) : this.anchor.remaining;
                const epochRemaining = result.session.remainingMs;
                // A boundary disagreement is material even if its drift is below the broad clock tolerance.
                // Never display or persist completion while our active monotonic witness has time left.
                const uncertain = this.clockUncertain || !Number.isFinite(mono) || !Number.isFinite(wall) || mono < 0 || wall < 0 ||
                    Math.abs(wall - mono) > api.LIMITS.clockToleranceMs || result.session.status === 'uncertain' ||
                    ((remaining === 0) !== (epochRemaining === 0));
                result.session.remainingMs = remaining;
                result.session.status = uncertain ? 'uncertain' : remaining === 0 ? 'completed' : 'running';
            }
            return result;
        }
        emit() { if (!this.closed) this.listeners.forEach(fn => fn(this.snapshot())); }
        accept(state) {
            if (this.closed || (this.state && state.revision < this.state.revision)) return;
            // Visibility changes do not reset clock-discontinuity evidence for the same run.
            const sameRun = this.state?.session.id === state.session.id && this.state?.session.startedAt === state.session.startedAt && this.state?.session.deadline === state.session.deadline && state.session.status === 'running';
            if (!sameRun) { this.anchor = { mono: this.monotonic(), wall: this.wall(), remaining: api.project(state, this.wall()).session.remainingMs }; this.clockUncertain = false; }
            this.state = state;
        }
        async refresh() {
            try { const state = await this.store.read(); this.accept(state); if (!this.closed) { this.error = null; this.tick(); this.emit(); } return state; }
            catch (error) { if (!this.closed) { this.error = error; this.emit(); } throw error; }
        }
        tick(expectedRevision = this.state?.revision) {
            if (this.closed || !this.state || expectedRevision !== this.state.revision || this.state.session.status !== 'running') return false;
            const status = this.snapshot().session.status;
            if (status === 'uncertain') {
                this.clockUncertain = true;
                // One local transition, never a disk write every tick. Failed saves remain visibly uncertain.
                if (!this.pending && !this.error) this.action('uncertain').catch(() => {});
            }
            if (status === 'completed' && !this.pending && !this.error) this.action('complete').catch(() => {});
            this.emit(); return true;
        }
        action(kind, value) {
            if (this.closed || !this.state) return Promise.reject(api.fault('READ'));
            if (this.pending) return this.pending;
            if (['start', 'pause', 'resume'].includes(kind)) {
                this.tick();
                if (this.pending) return this.pending;
                if (this.snapshot().session.status === 'uncertain') return Promise.reject(api.fault('CLOCK'));
            }
            const command = { kind, value, revision: this.state.revision };
            this.error = null;
            const promise = this.store.mutate(command).then(state => { this.accept(state); return state; }).catch(async error => {
                if (!this.closed) { this.error = error;
                    // Do not replay an uncertain write or a stale command. Read committed state; user can choose again.
                    try { this.accept(await this.store.read()); } catch (_) {}
                }
                throw error;
            }).finally(() => { if (this.pending === promise) this.pending = null; this.emit(); });
            this.pending = promise; this.emit(); return promise;
        }
        hasUncommittedWork() { return Boolean(this.pending); }
        destroy() { this.closed = true; this.unsubscribe(); this.listeners.clear(); }
    }
    return { Controller };
});
