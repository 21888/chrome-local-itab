/* One explicit browser selection -> one unsaved draft. No persistent writes. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./collection-capture.js') : root.LocalItabCollectionCapture);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCapturePage = api;
})(typeof window === 'undefined' ? globalThis : window, function (Capture) {
    'use strict';
    const errors = new Set(['editable', 'incognito', 'invalid', 'oversize', 'unsupported', 'unavailable', 'full', 'expired', 'forbidden', 'missing', 'guarded']);
    class Handoff {
        constructor({ controller, search, send, clearURL, blocked = () => false }) {
            this.controller = controller; this.send = send; this.clearURL = clearURL; this.blocked = blocked;
            const params = new URLSearchParams(search);
            this.token = params.get('capture'); this.ticket = controller.captureTicket(); this.running = false; this.hydrated = false; this.finished = false;
            if (params.has('captureError')) { this.token = null; this.status('error', errors.has(params.get('captureError')) ? params.get('captureError') : 'invalid'); }
            else if (params.has('capture')) {
                if (params.getAll('capture').length !== 1 || !Capture.parseToken(this.token)) { this.token = null; this.status('error', 'invalid'); }
                else this.status('ready');
            }
        }
        status(state, error = '') {
            if (this.controller.disposed) return;
            this.controller.capture = { state, error, retry: () => this.run(true) }; this.controller.notify('capture');
        }
        async run(explicitRetry = false) {
            if (!this.token || this.running || this.finished || this.controller.disposed) return false;
            this.running = true;
            if (explicitRetry && !this.hydrated) this.ticket = this.controller.captureTicket();
            this.status('loading');
            try {
                if (!this.hydrated) {
                    const result = await this.send({ type: 'collection-capture-claim', token: this.token });
                    if (this.controller.disposed) return false;
                    if (!result?.ok) { this.status('error', errors.has(result?.error) ? result.error : 'unavailable'); return false; }
                    if (this.blocked() || !this.controller.hydrateCapture(result.payload, this.ticket)) { this.status('error', 'guarded'); return false; }
                    this.hydrated = true;
                }
                const result = await this.send({ type: 'collection-capture-ack', token: this.token });
                if (this.controller.disposed) return false;
                if (!result?.ok) { this.status('ack'); return false; }
                this.finished = true; this.token = null;
                try { this.clearURL(); } catch (_) { /* Consumed tokens cannot replay even if history cleanup is blocked. */ }
                this.status('done'); return true;
            } catch (_) { this.status(this.hydrated ? 'ack' : 'error', 'unavailable'); return false; }
            finally { this.running = false; }
        }
    }
    return { Handoff };
});
