const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(page) {
    const document = createDocument(), events = [], timers = [];
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    let reloads = 0, confirms = 0, decision = false, pulls = 0;
    const storageManager = {
        syncMetaKey: 'sync-meta', syncChunkPrefix: 'sync-chunk-', syncIdentityStateKey: 'sync-guard',
        shouldIgnoreRemoteSyncChange: async () => false,
        pullFromSync: async () => { pulls++; return { applied: true }; },
        getSyncCompatibilityStatus: async () => null
    };
    const window = { storageManager, location: { reload() { reloads++; } }, confirm() { confirms++; return decision; } };
    const context = { window, document, storageManager, console,
        chrome: { storage: { onChanged: { addListener(listener) { events.push(listener); } } } },
        setTimeout(fn) { timers.push(fn); }, clearTimeout() {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    if (page) vm.runInContext(fs.readFileSync(page, 'utf8'), context);
    context.showMessage = () => {};
    return { document, window, context, events, timers, api: window.LocalItabContentLifecycle,
        get reloads() { return reloads; }, get confirms() { return confirms; }, get pulls() { return pulls; },
        allow() { decision = true; } };
}
(async () => {
    for (const mode of ['draft', 'dialog', 'review', 'view-save', 'settings-save']) {
        const h = harness();
        let unfinished = true;
        h.window.localTasksView = { controller: { pending: mode === 'view-save' ? {} : null }, hasUncommittedWork: () => unfinished };
        if (mode === 'settings-save') h.window.localTasksSettingsController = { pending: {} };
        assert.equal(h.api.reload(), false); assert.equal(h.reloads, 0);
        const notice = h.document.getElementById('local-content-reload-notice'), button = notice.querySelector('button');
        assert(notice); h.api.reload(); assert.equal(h.document.querySelectorAll('#local-content-reload-notice').length, 1);
        button.dispatch('click'); assert.equal(h.reloads, 0);
        if (mode.endsWith('save')) {
            assert.equal(h.confirms, 0, 'cannot reload while a task write is pending');
            h.window.localTasksView.controller.pending = null;
            if (h.window.localTasksSettingsController) h.window.localTasksSettingsController.pending = null;
        }
        h.allow(); button.dispatch('click'); assert.equal(h.reloads, 1, 'explicit confirmed dismissal can reload');
        unfinished = false; assert.equal(h.api.reload(), true); assert.equal(h.reloads, 2);
    }
    // Exercise real configuration listeners. A task-only storage event does no
    // remote work. Applied configuration respects the guard at actual reload time.
    for (const page of ['newtab.js', 'options.js']) {
        const h = harness(page);
        h.context.setupCloudSyncChangeListener(); await tick();
        assert.equal(h.events.length, 1);
        await h.events[0]({ __localItabPersonalTasksV1: { newValue: { text: 'PRIVATE_SENTINEL' } } }, 'local');
        assert.equal(h.pulls, 0); assert.equal(h.reloads, 0); assert.equal(h.timers.length, 0);
        if (page === 'newtab.js') h.window.localTasksView = { controller: {}, hasUncommittedWork: () => true };
        await h.events[0]({ 'sync-meta': { newValue: {} } }, 'sync');
        assert.equal(h.pulls, 1);
        if (page === 'options.js') {
            assert.equal(h.timers.length, 1);
            h.window.localTasksSettingsController = { pending: {} }; // began after scheduling
            h.timers.shift()();
        }
        assert.equal(h.reloads, 0); assert(h.document.getElementById('local-content-reload-notice'));
    }
    for (const template of ['clarity', 'graphite', 'folio']) {
        const h = harness('newtab.js');
        h.document.documentElement.dataset.dashboardTemplate = template;
        const main = h.document.createElement('main'); main.className = 'dashboard-main'; h.document.body.append(main);
        const cards = h.document.createElement('section'); cards.id = 'info-cards-container'; main.append(cards);
        const show = { clock: false, search: false, shortcuts: false, weather: false, hot: false, movie: false };
        h.context.applyModuleVisibility(show); assert(cards.classList.contains('module-hidden'));
        h.window.localItabTasksVisible = true; h.context.applyModuleVisibility(h.window.localItabModuleVisibility);
        assert(!cards.classList.contains('module-hidden')); assert(main.classList.contains('has-info-cards'));
        assert.deepEqual(JSON.parse(JSON.stringify(h.window.localItabModuleVisibility)), show, 'task visibility never enters general show config');
        h.window.localItabTasksVisible = false; h.context.applyModuleVisibility(h.window.localItabModuleVisibility);
        assert(cards.classList.contains('module-hidden'), template); assert(!main.classList.contains('has-info-cards'), template);
    }
    {
        const h = harness('newtab.js');
        const card = h.document.createElement('article'); card.className = 'local-tasks-card';
        const summary = h.document.createElement('summary'), taskText = h.document.createElement('span');
        card.append(summary, taskText); h.document.body.append(card);
        for (const target of [card, summary, taskText]) assert.equal(h.context.shouldToggleFromEvent({ target }), false,
            'task text selection and details actions cannot save dashboard visibility or schedule Sync');
        const overlay = h.document.createElement('div'); overlay.className = 'tasks-overlay';
        h.document.body.append(overlay);
        assert.equal(h.context.shouldToggleFromEvent({ target: overlay }), false);
        assert.equal(h.context.shouldToggleFromEvent({ target: h.document.body }), true, 'blank dashboard retains the existing toggle');
    }

    for (const page of ['newtab', 'options']) {
        const html = fs.readFileSync(`${page}.html`, 'utf8');
        for (const dependency of ['local-tasks-store', 'local-tasks-controller', 'local-tasks-view', 'local-content-lifecycle']) {
            assert(html.indexOf(`shared/${dependency}.js`) < html.indexOf(`${page}.js`));
        }
        const source = fs.readFileSync(`${page}.js`, 'utf8');
        assert(!source.includes('window.location.reload()'), 'all configuration reload paths go through the task guard');
    }
    // The template's defensive CSS absence rule must recognize a Tasks-only
    // dashboard as well as legacy information cards. Otherwise display:none
    // overrides the correct JS visibility state in all three templates.
    const css = fs.readFileSync('dashboard-templates.css', 'utf8');
    const absenceRules = css.split('}').filter(rule => rule.includes(':not(:has(>') && rule.includes('info-cards-container'));
    assert.equal(absenceRules.length, 2);
    for (const rule of absenceRules) {
        assert(rule.includes(':is(.info-card, .world-clocks-card, .local-tasks-card, .local-focus-card, .local-scratchpad-card):not(.module-hidden):not([hidden])'));
    }
    console.log('local content lifecycle tests ok (real page listeners and DOM/event models; no native or live-provider claim)');
})().catch(error => { console.error(error); process.exitCode = 1; });
