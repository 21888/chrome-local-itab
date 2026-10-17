'use strict';
const { createDocument: baseDocument, deferred } = require('./finder-dom-model');

// A focused event/MutationObserver extension of the existing Finder model.
// DOM mutations enqueue records automatically; takeRecords exercises same-task
// detach/reconnect before the queued observer callback can run.
function createDocument(options) {
    const document = baseDocument(options), groups = new Map(), observers = new Set();
    document.addEventListener = function (type, listener) {
        if (!groups.has(type)) groups.set(type, new Set());
        groups.get(type).add(listener);
        this.listeners.set(type, (...args) => { for (const callback of [...groups.get(type) || []]) callback(...args); });
    };
    document.removeEventListener = function (type, listener) {
        groups.get(type)?.delete(listener);
        if (!groups.get(type)?.size) { groups.delete(type); this.listeners.delete(type); }
    };
    const queue = record => {
        for (const observer of observers) {
            if (![...observer.targets].some(([target, config]) => (record.target === target || config.subtree && target.contains(record.target)) &&
                (record.type === 'childList' ? config.childList : config.attributes && (!config.attributeFilter || config.attributeFilter.includes(record.attributeName))))) continue;
            observer.records.push(record);
            if (!observer.scheduled) {
                observer.scheduled = true;
                queueMicrotask(() => { observer.scheduled = false; const records = observer.takeRecords(); if (records.length) observer.callback(records); });
            }
        }
    };
    const prototype = Object.getPrototypeOf(document.body);
    for (const method of ['append', 'replaceChildren', 'remove']) {
        const original = prototype[method];
        prototype[method] = function (...args) {
            const parent = method === 'remove' ? this.parentElement : this;
            const removed = method === 'remove' ? [this] : method === 'replaceChildren' ? [...this.children] : [];
            const result = original.apply(this, args);
            if (parent) queue({ type: 'childList', target: parent, removedNodes: removed });
            return result;
        };
    }
    const setAttribute = prototype.setAttribute;
    prototype.setAttribute = function (name, value) { const result = setAttribute.call(this, name, value); queue({ type: 'attributes', target: this, attributeName: name }); return result; };
    for (const property of ['hidden', 'inert', 'open', 'className']) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
        Object.defineProperty(prototype, property, { configurable: true,
            get() { return descriptor?.get ? descriptor.get.call(this) : this[`_${property}`]; },
            set(value) { const previous = this[property]; if (descriptor?.set) descriptor.set.call(this, value); else this[`_${property}`] = value;
                if (previous !== value) queue({ type: 'attributes', target: this, attributeName: property === 'className' ? 'class' : property }); }
        });
    }
    // Existing elements' own plain properties must use the observable descriptors.
    for (const node of [document.documentElement, document.body]) for (const property of ['inert', 'open']) { const value = node[property]; delete node[property]; node[property] = value; }
    document.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.records = []; this.targets = new Map(); this.scheduled = false; }
        observe(target, options) { this.targets.set(target, options); observers.add(this); }
        takeRecords() { return this.records.splice(0); }
        disconnect() { this.targets.clear(); this.records.length = 0; observers.delete(this); }
    };
    return document;
}
module.exports = { createDocument, deferred };
