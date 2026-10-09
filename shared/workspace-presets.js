/* Opt-in, device-local visibility presets. Never route personal content through configuration/providers. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-tasks-store.js'), require('./local-focus-store.js'), require('./dashboard-template-registry.js'));
    else root.LocalItabWorkspace = factory(root.LocalItabTasks, root.LocalItabFocus, root.LocalItabTemplates);
})(typeof window === 'undefined' ? globalThis : window, function (tasks, focus, templates) {
    'use strict';
    const clone = value => JSON.parse(JSON.stringify(value));
    const same = (a, b) => a === b || Boolean(a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key])));
    function fault(code) { const error = new Error(`Workspace preset: ${code}`); error.code = code; return error; }
    function createBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks) {
        if (!chromeApi?.storage?.local || !locks?.request) throw fault('UNAVAILABLE');
        return {
            // No existing writer acquires both locks. Always tasks -> focus; never call Store.read/mutate under these locks.
            lock: fn => locks.request(tasks.LOCK, { mode: 'exclusive' }, () => locks.request(focus.LOCK, { mode: 'exclusive' }, fn)),
            read: () => chromeApi.storage.local.get([tasks.KEY, focus.KEY]),
            write: values => chromeApi.storage.local.set(values)
        };
    }
    class Store {
        constructor(backend = createBackend()) { this.backend = backend; }
        async read() {
            const raw = await this.backend.read();
            return { tasks: clone(raw[tasks.KEY] === undefined ? tasks.initial() : tasks.validate(raw[tasks.KEY])),
                focus: clone(raw[focus.KEY] === undefined ? focus.initial() : focus.validate(raw[focus.KEY])) };
        }
        prepare(template) {
            if (!templates.isValid(template)) return Promise.reject(fault('INVALID'));
            return this.backend.lock(async () => ({ template, before: await this.read() }));
        }
        apply(preview, isCurrent = () => true) {
            return this.backend.lock(async () => {
                if (!isCurrent()) throw fault('CANCELLED');
                if (!templates.isValid(preview?.template)) throw fault('INVALID');
                const current = await this.read();
                if (!same(current, preview.before)) throw fault('CONFLICT');
                const target = templates.get(preview.template).recommendedWorkspace;
                const values = {};
                for (const [name, api] of [['tasks', tasks], ['focus', focus]]) {
                    if (current[name].enabled === target[name]) continue;
                    const next = clone(current[name]); next.enabled = target[name]; next.revision++;
                    api.validate(next); values[api.KEY] = next;
                }
                if (!isCurrent()) throw fault('CANCELLED');
                if (!Object.keys(values).length) return { changed: false };
                // One local call, never an automatic retry or rollback. An error may mean a partially/fully saved result.
                try {
                    await this.backend.write(values);
                    const saved = await this.read();
                    for (const [name, api] of [['tasks', tasks], ['focus', focus]]) {
                        if (!same(saved[name], values[api.KEY] || current[name])) throw fault('VERIFY');
                    }
                } catch (_) { throw fault('UNCONFIRMED'); }
                return { changed: true };
            });
        }
    }
    return { Store, createBackend };
});
