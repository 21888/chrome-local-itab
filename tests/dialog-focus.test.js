const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Native Chrome regression: animating visibility leaves the initial focus call
// at the hidden transition start. Only opacity should transition on the overlay.
const overlayCss = fs.readFileSync('newtab.css', 'utf8').match(/\.modal-overlay\s*\{([^}]+)\}/)[1];
assert.match(overlayCss, /transition:\s*opacity\s+var\(--transition-base\)/);
assert.doesNotMatch(overlayCss, /transition:\s*(?:all|visibility)\b/);
const descendantsCss = fs.readFileSync('newtab.css', 'utf8').match(/\.modal-overlay \.modal,\s*\.modal-overlay \.modal \*\s*\{([^}]+)\}/)[1];
assert.match(descendantsCss, /transition-property:\s*background-color, border-color, box-shadow, color, opacity, transform;/);
assert.doesNotMatch(descendantsCss, /\b(?:all|visibility)\b/);

// Minimal DOM model: exercises event/focus ownership, not browser layout or AT.
function createDocument() {
    const doc = { activeElement: null, addEventListener() {} };
    class Element {
        constructor(tag) {
            this.tagName = tag;
            this.children = [];
            this.attributes = {};
            this.listeners = new Map();
            this.style = {};
            this.inert = false;
            this.tabIndex = tag === 'button' || tag === 'input' ? 0 : -1;
            const classes = new Set();
            this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
            this.ownerDocument = doc;
        }
        append(...children) { children.forEach(child => { child.parentElement = this; this.children.push(child); }); }
        appendChild(child) { this.append(child); }
        remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name]; }
        addEventListener(name, fn) { this.listeners.set(name, fn); }
        removeEventListener(name) { this.listeners.delete(name); }
        focus() { doc.activeElement = this; }
        get isConnected() { return this === doc.body || Boolean(this.parentElement?.isConnected); }
        contains(element) { return element === this || this.children.some(child => child.contains(element)); }
        closest(selector) { return ((selector.includes('[hidden]') && this.hidden) || (selector.includes('[inert]') && this.inert)) ? this : this.parentElement?.closest(selector) || null; }
        getClientRects() { return this.hidden ? [] : [{}]; }
        querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); }
        querySelector(selector) { return this.querySelectorAll().find(child => child.id === selector.slice(1)) || null; }
        dispatch(name, props = {}) {
            const event = { target: this, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...props };
            this.listeners.get(name)?.(event);
            return event;
        }
    }
    doc.createElement = tag => new Element(tag);
    doc.body = new Element('body');
    doc.getElementById = id => doc.body.querySelector(`#${id}`);
    return doc;
}

const document = createDocument();
const context = { document, window: { addEventListener() {} }, console, URL, setTimeout() { throw new Error('Dialog cleanup must not use stale timers'); } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent;', context);
const open = context.window.LocalItabDialog.open;
const opener = document.createElement('button');
const alreadyInert = document.createElement('div');
alreadyInert.inert = true;
const overlay = document.createElement('div');
const first = document.createElement('button');
const input = document.createElement('input');
const hidden = document.createElement('button'); hidden.hidden = true;
const disabled = document.createElement('button'); disabled.disabled = true;
const last = document.createElement('button');
overlay.append(first, input, hidden, disabled, last);
document.body.append(opener, alreadyInert, overlay);
opener.focus();
let close;
close = open(overlay, input, () => close());
assert.equal(document.activeElement, input);
assert.equal(opener.inert, true);
assert.equal(overlay.getAttribute('aria-hidden'), 'false');
last.focus();
assert.equal(overlay.dispatch('keydown', { key: 'Tab' }).prevented, true);
assert.equal(document.activeElement, first);
first.focus();
overlay.dispatch('keydown', { key: 'Tab', shiftKey: true });
assert.equal(document.activeElement, last);
input.focus();
assert.equal(overlay.dispatch('keydown', { key: 'Tab' }).prevented, false);
const escape = overlay.dispatch('keydown', { key: 'Escape' });
assert.equal(escape.prevented, true);
assert.equal(escape.stopped, true);
assert.equal(document.activeElement, opener);
assert.equal(opener.inert, false);
assert.equal(alreadyInert.inert, true);
assert.equal(overlay.getAttribute('aria-hidden'), 'true');
assert.equal(overlay.listeners.size, 0);
// A repeated old cleanup cannot undo the next opening's inert/focus state.
const closeAgain = open(overlay, first, () => {});
close();
assert.equal(opener.inert, true);
assert.equal(document.activeElement, first);
closeAgain();
overlay.remove();

const component = Object.create(context.ShortcutsComponent.prototype);
const shortcut = { title: 'Example', url: 'https://example.com/' };
let deletes = 0;
component.showConfirmDialog('Delete shortcut', 'Confirm removal?', shortcut, () => { deletes++; });
const oldOverlay = component.confirmDialog;
assert.equal(oldOverlay.children[0].getAttribute('role'), 'alertdialog');
assert.equal(document.activeElement.id, 'confirm-cancel');
const oldDelete = oldOverlay.querySelector('#confirm-delete');
oldOverlay.dispatch('keydown', { key: 'Escape' });
assert.equal(component.confirmDialog, null);
assert.equal(document.activeElement, opener);
component.showConfirmDialog('Delete shortcut', 'Confirm removal?', shortcut, () => { deletes++; });
oldDelete.dispatch('click');
assert.equal(deletes, 0);
assert.equal(component.confirmDialog.isConnected, true);
const deleteButton = component.confirmDialog.querySelector('#confirm-delete');
deleteButton.dispatch('click');
deleteButton.dispatch('click');
assert.equal(deletes, 1);
assert.equal(component.confirmDialog, null);
assert.equal(opener.inert, false);
console.log('dialog focus tests ok (DOM model)');
