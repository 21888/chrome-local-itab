const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function model(options = {}) {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    const b = { fail: false, delay: null, failRead: options.failRead, workspace: options.workspace,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (b.failRead) throw new Error("Storage unavailable"); return raw && structuredClone(raw); },
        async write(value) { if (b.delay) await b.delay; if (b.fail) return false; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => raw
    };
    const store = new tasks.Store(b), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: options.blurUnavailableFocus }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: options.i18n,
        ...(options.workspace ? { LocalItabWorkspaces: { session: options.workspace } } : {}) };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout: options.setTimeout || setTimeout, URL: options.URL || URL, Blob, console });
    const dialogPath = path.resolve(__dirname, '../shared/dialog-focus.js');
    vm.runInContext(fs.readFileSync(fs.existsSync(dialogPath) ? dialogPath : path.resolve(__dirname, '../source-model/shared/dialog-focus.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../shared/local-tasks-view.js'), 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: options.alwaysVisible ?? true, onVisibility: options.onVisibility });
    return { b, store, controller, document, host, search, api, view, window };
}
const button = (parent, text) => parent.querySelectorAll('button').find(node => node.textContent === text);
const click = (parent, text) => { const node = button(parent, text); assert(node, `button ${text}`); node.dispatch('click'); return node; };
const setInput = (input, value) => { input.value = value; input.dispatch('input'); };
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => h.document.querySelector('.tasks-editor');
async function seed(h, text = 'first') { await h.controller.action('add', { text }); await settle(); return h.controller.state.records.at(-1); }

test('complete daily task flow preserves duplicate identity through filtered edit, pin, complete and Undo',async()=>{
 const h=model({blurUnavailableFocus:true});await settle();
 for(let i=0;i<2;i++){setInput(h.view.input,'Synthetic duplicate');h.view.input.dispatch('keydown',{key:'Enter'});await settle();}
 const [first,second]=h.controller.state.records;assert.notEqual(first.id,second.id);
 setInput(h.view.filterInput,'duplicate');
 const rows=h.view.list.children;assert.equal(rows.length,2);
 rows[1].querySelector('.tasks-row-menu').open=true;click(rows[1],'Edit');setInput(editor(h),'Synthetic changed second');click(modal(h),'Save task');await settle();
 assert.equal(h.controller.state.records.find(r=>r.id===first.id).text,'Synthetic duplicate');
 assert.equal(h.controller.state.records.find(r=>r.id===second.id).text,'Synthetic changed second');
 assert.equal(h.view.list.children.length,1);assert.equal(h.document.activeElement,h.view.input);
 setInput(h.view.filterInput,'changed');assert.equal(h.view.list.children.length,1);
 h.view.list.children[0].querySelector('.tasks-row-menu').open=true;click(h.view.list.children[0],'Pin next');await settle();assert.equal(h.controller.state.pinnedId,second.id);
 h.view.nextComplete.focus();h.view.nextComplete.dispatch('click');await settle();
 assert.equal(h.controller.state.pinnedId,null);assert.equal(h.controller.state.records.find(r=>r.id===second.id).state,'done');assert.equal(h.document.activeElement,h.view.input);
 h.view.completed.box.open=true;assert.equal(h.view.completed.list.children.length,1);assert.equal(h.view.completed.list.children[0].dataset.taskId,second.id);
 click(h.host,'Undo completion');await settle();
 assert.equal(h.controller.state.records.find(r=>r.id===second.id).state,'active');
 assert.equal(h.controller.state.records.find(r=>r.id===first.id).text,'Synthetic duplicate');
 assert.equal(h.controller.state.pinnedId,null);assert.equal(h.view.list.children.length,1);h.view.destroy();
});

test('complete edit recovery flow keeps newer text and the other duplicate, then pins the confirmed latest revision',async()=>{
 const h=model({blurUnavailableFocus:true});await settle();for(let i=0;i<2;i++){setInput(h.view.input,'Synthetic duplicate');h.view.input.dispatch('keydown',{key:'Enter'});await settle();}
 const [first,second]=h.controller.state.records;setInput(h.view.filterInput,'duplicate');const row=h.view.list.children[1];row.querySelector('.tasks-row-menu').open=true;click(row,'Edit');
 setInput(editor(h),'Synthetic attempted edit');const wait=deferred();h.b.delay=wait.promise;h.b.fail=true;click(modal(h),'Save task');setInput(editor(h),'Synthetic latest edit');wait.resolve();await settle();
 assert.equal(editor(h).value,'Synthetic latest edit');assert.equal(h.controller.state.records.find(r=>r.id===second.id).text,'Synthetic duplicate');
 h.b.delay=null;h.b.fail=false;click(modal(h),'Save task');await settle();assert.equal(modal(h),null);
 setInput(h.view.filterInput,'latest');const saved=h.view.list.children[0];assert.equal(saved.dataset.taskId,second.id);saved.querySelector('.tasks-row-menu').open=true;click(saved,'Pin next');await settle();
 assert.equal(h.controller.state.pinnedId,second.id);assert.equal(h.controller.state.records.find(r=>r.id===second.id).text,'Synthetic latest edit');assert.deepEqual(h.controller.state.records.find(r=>r.id===first.id),first);h.view.destroy();
});
