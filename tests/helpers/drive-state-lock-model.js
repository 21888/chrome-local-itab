'use strict';
// Explicit cross-instance Web Locks model: do not depend on Node's navigator.
module.exports = function installDriveStateLocks() {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const queues = new Map();
    const locks = {request(name, options, callback) {
        const operation = typeof options === 'function' ? options : callback;
        const result = (queues.get(name) || Promise.resolve()).then(operation);
        queues.set(name, result.catch(() => {}));
        return result;
    }};
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {locks}});
    return () => { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; };
};
