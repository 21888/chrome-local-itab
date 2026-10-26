const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);

function flow() {
    const document = createDocument({ blurUnavailableFocus: true }); document.documentElement.lang = 'en';
    // Extend only this fixture's selector model for the production grid's :not.
    const elements = Object.getPrototypeOf(document.body), matches = elements.matches;
    elements.matches = function(selector) { return selector.split(',').some(raw => {
        const excluded = raw.match(/:not\(([^)]+)\)/);
        return (!excluded || !matches.call(this, excluded[1])) && matches.call(this, raw.replace(/:not\([^)]+\)/g, ''));
    }); };
    const container = document.createElement('section'); container.id = 'shortcuts-container';
    const categoryList = document.createElement('div'); categoryList.id = 'category-list'; document.body.append(categoryList, container);
    const raw = { links: [{title:'Twin',url:'https://example.com/twin',icon:'A',category:'work',marker:'first'}, {title:'Twin',url:'https://example.com/twin',icon:'B',category:'work',marker:'second'}, {title:'Reading item',url:'https://example.org/reading',icon:'R',category:'reading'}, {title:'Orphan item',url:'https://example.org/orphan',icon:'O',category:'orphan'}],
        categories: [{ id: 'work', name: 'Work' }, { id: 'reading', name: 'Reading' }, {id:'later',name:'Later'}], layout: { autoArrange: true, positions: {} },
        privacy: { onlineFavicons: false }, sync: { enabled: false } };
    const writes = [], preferences = [], opened = [], errors = [], results = [], storageListeners = new Set();
    const storage = new StorageManager(); storage._syncInitialized = true; let queue = Promise.resolve();
    storage.withLocalWriteLock = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
    Object.defineProperty(storage, '_local', { value: { async get() { return structuredClone(raw); }, async set(value) { writes.push(structuredClone(value)); const changes = Object.fromEntries(Object.entries(value).map(([key, next]) => [key, { oldValue: structuredClone(raw[key]), newValue: structuredClone(next) }])); Object.assign(raw, structuredClone(value)); for (const listener of storageListeners) listener(changes, 'local'); } } });
    storage.onLocalChanged = listener => { storageListeners.add(listener); return () => storageListeners.delete(listener); };
    storage.scheduleShortcutUndoSync = async () => {};
    const context = { document, storageManager: storage, URL, Intl, console, setTimeout, clearTimeout, window: null,
        addEventListener() {}, removeEventListener() {}, open: url => opened.push(url),
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }),
        localStorage: { getItem() { return 'work'; }, setItem(...args) { preferences.push(args); } },
        LocalItabWorkspaces: { session: { id: 'synthetic-workspace', generation: 1 } } };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/stored-shortcut-url.js', 'shared/shortcut-organizer.js', 'shared/shortcut-organizer-view.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent=ShortcutsComponent; this.CategoryNavigation=CategoryNavigation;', context);
    context.showErrorMessage = message => errors.push(message);
    const component = context.shortcutsComponentInstance = new context.ShortcutsComponent(structuredClone(raw.links), raw.layout, raw.categories);
    // Real grid/card rendering and filtering; layout geometry and unrelated edit
    // modal setup are outside this DOM-model flow.
    component.applyLayoutMode = () => {}; component.createModal = () => {};
    const navigation = context.categoryNavigation = Object.create(context.CategoryNavigation.prototype);
    navigation.currentCategory = 'work'; navigation.storageKey = 'currentCategory'; navigation.categories = raw.categories;
    component.render(); navigation.render({ reflow: false });
    const grid = document.getElementById('shortcuts-grid');
    return { document, raw, writes, preferences, opened, errors, results, storage, context, component, navigation, grid, view: component.organizerView,
        tile(index) { return grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').find(node => node.dataset.index === String(index)); } };
}

const clone = value => JSON.parse(JSON.stringify(value));
function ui(h) {
 const byText = text => h.document.querySelectorAll('button').find(n=>n.textContent===text);
 return {click(text){const n=byText(text);assert(n,text);n.dispatch('click',{detail:1});},
 target(value){const n=h.document.querySelector('.organizer-panel select');n.value=value;n.dispatch('change');},
 query(value){const n=h.document.querySelector('.organizer-search-input');n.value=value;n.dispatch('input');},
 check(index){const n=h.document.querySelectorAll('.organizer-row').find(n=>n.querySelector('strong').textContent.startsWith(`${index+1}. `)).querySelector('input');n.checked=true;n.dispatch('change');},
 selected(){return h.document.querySelectorAll('.organizer-row').filter(n=>n.querySelector('input').checked).map(n=>Number(n.querySelector('strong').textContent.split('.')[0])-1);}};
}
test('real organizer cross-filter review/back/destination change moves only exact reviewed records and updates home',async()=>{
 const h=flow(), before=clone(h.raw), a=ui(h); await h.view.open();
 a.target('later');a.query('Twin');a.check(1);a.query('Reading item');a.check(2);a.query('Orphan item');a.check(3);a.query('no-match');
 a.click('Review move');assert.equal(h.document.querySelectorAll('.organizer-list li').length,3);
 a.click('Back');assert.equal(h.document.querySelector('.organizer-search-input').value,'no-match');a.target('reading');a.click('Clear search');
 assert.deepEqual(a.selected(),[1,3]);a.click('Review move');assert.equal(h.document.querySelectorAll('.organizer-list li').length,2);
 h.component._shortcutUndoReceipt={oldDeletion:true};a.click('Move reviewed sites');await tick();await tick();
 assert.equal(h.writes.length,1);const expected=clone(before);expected.links[1].category='reading';expected.links[3].category='reading';assert.deepEqual(h.raw,expected);
 assert.equal(h.document.querySelector('.organizer-overlay'),null);assert.equal(h.navigation.currentCategory,'work');assert.equal(h.preferences.length,0);assert.equal(h.opened.length,0);
 assert.equal(h.component._shortcutUndoReceipt,null);assert.equal(h.tile(0).getClientRects().length>0,true);assert.equal(h.tile(1).getClientRects().length,0);
 assert.equal(h.document.querySelector('#shortcuts-heading').textContent,'Work · 1');
 h.navigation.selectCategory('reading');assert.equal(h.document.querySelector('#shortcuts-heading').textContent,'Reading · 3');assert.equal(h.tile(1).getClientRects().length>0,true);assert.equal(h.tile(3).getClientRects().length>0,true);
});

test('real reviewed move stays single while pending and Cancel before submission leaves all data unchanged',async()=>{
 const h=flow(),before=clone(h.raw),a=ui(h);await h.view.open();a.target('reading');a.check(1);a.click('Review move');a.click('Cancel');
 assert.equal(h.writes.length,0);assert.deepEqual(h.raw,before);
 await h.view.open();a.target('reading');a.check(1);a.click('Review move');
 const save=h.storage._local.set.bind(h.storage._local);let release;const gate=new Promise(resolve=>{release=resolve;});h.storage._local.set=async value=>{await gate;return save(value);};
 const submit=h.document.querySelectorAll('button').find(n=>n.textContent==='Move reviewed sites');submit.dispatch('click');await tick();submit.dispatch('click');
 assert.equal(h.view.pending,true);assert.equal(h.view.close(),false);assert.equal(h.view.destroy(),false);assert.equal(h.writes.length,0);assert.equal(h.component._shortcutWritesPending,1);
 release();await tick();await tick();assert.equal(h.writes.length,1);assert.equal(h.raw.links[1].category,'reading');assert.equal(h.raw.links[0].category,'work');assert.equal(h.view.pending,false);assert.equal(h.component._shortcutWritesPending,0);
});
