const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// A small DOM/event model for ownership and routing. Real native-key behavior,
// focus painting and browser dragging remain a separate unpacked-extension check.
function createDocument() {
    const doc = { activeElement: null, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type) { this.listeners.delete(type); } };
    class Element {
        constructor(tag) { this.tagName = tag.toUpperCase(); this.value = ''; this.hidden = false; this.open = false; this.children = []; this.dataset = {}; this.attributes = {}; this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } }; this.listeners = new Map(); this.inert = false; this.ownerDocument = doc; this._classes = new Set(); this.classList = { add: name => this._classes.add(name), remove: name => this._classes.delete(name), contains: name => this._classes.has(name), toggle: (name, enabled) => enabled ? this._classes.add(name) : this._classes.delete(name) }; }
        set className(value) { this._classes = new Set(value.split(/\s+/).filter(Boolean)); }
        get className() { return [...this._classes].join(' '); }
        get tabIndex() { return this._tabIndex ?? (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(this.tagName) ? 0 : -1); }
        set tabIndex(value) { this._tabIndex = value; }
        get isConnected() { return this === doc.body || Boolean(this.parentElement?.isConnected); }
        append(...children) { for (const child of children) { if (child.tagName === '#FRAGMENT') { this.append(...child.children); continue; } child.parentElement = this; this.children.push(child); } }
        appendChild(child) { this.append(child); }
        replaceChildren(...children) { for (const child of this.children) { if (child.contains(doc.activeElement)) doc.activeElement = doc.body; child.parentElement = null; } this.children = []; this.append(...children); }
        remove() { if (this.contains(doc.activeElement)) doc.activeElement = doc.body; if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(item => item !== this); this.parentElement = null; } }
        contains(element) { return element === this || this.children.some(child => child.contains(element)); }
        setAttribute(name, value) { this.attributes[name] = value; if (name === 'tabindex') this.tabIndex = Number(value); }
        getAttribute(name) { return this.attributes[name]; }
        matches(selector) {
            return selector.split(',').some(raw => {
                const parts = raw.trim().split(/\s+/); const current = parts.pop();
                let rule = current;
                const attributes = [...rule.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
                for (const attr of attributes) {
                    const name = attr[1];
                    const value = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : ['hidden', 'inert', 'open'].includes(name) ? (this[name] ? '' : undefined) : this.attributes[name];
                    if (attr[2] === undefined ? value === undefined : value !== attr[2]) return false;
                }
                rule = rule.replace(/\[[^\]]+\]/g, '');
                const classes = [...rule.matchAll(/\.([\w-]+)/g)].map(item => item[1]);
                if (!classes.every(name => this._classes.has(name))) return false;
                rule = rule.replace(/\.[\w-]+/g, '');
                if (rule.startsWith('#')) { if (this.id !== rule.slice(1)) return false; }
                else if (rule && rule !== '*' && rule.toUpperCase() !== this.tagName) return false;
                if (!parts.length) return true;
                let parent = this.parentElement;
                while (parent) { if (parent.matches(parts.join(' '))) return true; parent = parent.parentElement; }
                return false;
            });
        }
        closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
        querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
        removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
        getClientRects() { for (let node = this; node; node = node.parentElement) { if (node.hidden || node.style.display === 'none' || (node.classList.contains('modal-overlay') && !node.classList.contains('active'))) return []; if (node.parentElement?.tagName === 'DETAILS' && !node.parentElement.open && node.tagName !== 'SUMMARY') return []; } return this.isConnected ? [{}] : []; }
        getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 80, height: 80 }; }
        focus() { if (this.getClientRects().length && !this.disabled && !this.closest('[inert]')) doc.activeElement = this; }
        setPointerCapture() {}
        releasePointerCapture() {}
        dispatch(type, fields = {}) { const event = { target: this, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; }, ...fields }; for (let node = this; node && !event.stopped; node = node.parentElement) for (const fn of node.listeners.get(type) || []) { fn(event); if (event.immediateStopped) break; } return event; }
    }
    doc.documentElement = new Element('html'); doc.body = new Element('body'); doc.documentElement.append(doc.body); doc.activeElement = doc.body;
    doc.createElement = tag => new Element(tag); doc.createDocumentFragment = () => new Element('#fragment');
    doc.getElementById = id => doc.body.querySelector(`#${id}`); doc.querySelectorAll = selector => doc.body.querySelectorAll(selector); doc.querySelector = selector => doc.body.querySelector(selector);
    return doc;
}
module.exports = { createDocument, deferred };
