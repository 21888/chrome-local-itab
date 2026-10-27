'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const source = fs.readFileSync('options.js', 'utf8');

// Exercise the actual delegated Download event, action wrapper and panel render.
// Every provider response, saved name and download is a synthetic local model.
async function harness() {
    const document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const ids = { 'drive-device-name': 'input', 'drive-device-select': 'select',
        'drive-rename-device': 'button', 'drive-add-device': 'button',
        'drive-refresh-list': 'button', 'drive-backup-now': 'button',
        'drive-backup-status': 'div', 'drive-backup-history': 'div' };
    for (const [id, tag] of Object.entries(ids)) { const element = document.createElement(tag); element.id = id; document.body.append(element); }
    const get = id => document.getElementById('drive-' + id);
    const saved = { deviceId: 'home', deviceName: 'Saved home', connectedAt: '2026-01-01T00:00:00Z', lastError: '',
        knownDevices: [{ id: 'home', name: 'Saved home' }, { id: 'work', name: 'Saved work' }] };
    const snapshot = { id: 'synthetic-snapshot', name: 'synthetic-backup.json', deviceId: 'home', size: 24 };
    const calls = { downloads: 0, clicks: 0, errors: [], renames: [], renameIds: [], additions: [], selections: [], reads: 0,
        payloadGate: null, panelGate: null, renameGate: null, addGate: null, selectGate: null, failRead: false,
        failClick: false, failRename: false, failAdd: false, failSelect: false, failPanelRead: false, fallbacks: 0,
        listings: 0, uploads: 0, uploadGate: null, failUpload: false, messages: [], timers: [] };
    const manager = {
        getAvailabilityStatus: () => ({ apiAvailable: true, oauthConfigured: true, storageAvailable: true }),
        async getState() { calls.reads++; if (calls.panelGate) await calls.panelGate.promise;
            if (calls.failPanelRead) throw new Error('Synthetic saved-profile read failed'); return structuredClone(saved); },
        normalizeState: () => ({ deviceId: 'fallback-' + ++calls.fallbacks, deviceName: 'Unsaved fallback', knownDevices: [] }),
        groupSnapshotsByDevice: (snapshots, devices) => devices.map(device => ({ deviceId: device.id,
            deviceName: device.name, snapshots: snapshots.filter(item => item.deviceId === device.id) })),
        async downloadSnapshotPayload() { calls.downloads++; if (calls.payloadGate) await calls.payloadGate.promise;
            if (calls.failRead) throw new Error('Synthetic payload unavailable'); return { data: { synthetic: true } }; },
        async setLastError(error) { calls.errors.push(error.message); saved.lastError = error.message; },
        async renameDevice(name, id) { calls.renames.push(name); calls.renameIds.push(id); if (calls.renameGate) await calls.renameGate.promise;
            if (calls.failRename) throw new Error('Synthetic rename failed');
            saved.knownDevices.find(item => item.id === id).name = name.trim();
            if (saved.deviceId === id) saved.deviceName = name.trim(); return structuredClone(saved); },
        async addDevice(name) { calls.additions.push(name); if (calls.addGate) await calls.addGate.promise;
            if (calls.failAdd) throw new Error('Synthetic add failed'); saved.deviceId = 'new'; saved.deviceName = name.trim();
            saved.knownDevices.push({ id: 'new', name: saved.deviceName }); return { deviceCreated: true }; },
        async selectDevice(id) { calls.selections.push(id); if (calls.selectGate) await calls.selectGate.promise;
            if (calls.failSelect) throw new Error('Synthetic selection failed'); saved.deviceId = id;
            saved.deviceName = saved.knownDevices.find(item => item.id === id).name; },
        async listSnapshots() { calls.listings++; return [structuredClone(snapshot)]; },
        async createSnapshotDraft() { return { sizeBytes: 24 }; },
        async uploadSnapshotDraft() { calls.uploads++; if (calls.uploadGate) await calls.uploadGate.promise;
            if (calls.failUpload) throw new Error('Synthetic upload failed'); return {}; },
        maximumSizeBytes: 1000, warningSizeBytes: 500
    };
    const create = document.createElement.bind(document);
    document.createElement = tag => {
        const element = create(tag);
        if (tag === 'a') element.click = () => { if (calls.failClick) throw new Error('Synthetic trigger rejected'); calls.clicks++; };
        return element;
    };
    const context = { document, window: { driveBackupManager: manager }, storageManager: {}, Blob,
        URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
        setTimeout(fn, delay) { calls.timers.push({ fn, delay }); }, console: { log() {}, error() {}, warn() {} } };
    vm.createContext(context); vm.runInContext(source, context);
    context.showMessage = (message, status) => calls.messages.push({ message, status });
    await context.renderDriveBackupPanel([snapshot]);
    context.setupDriveBackupEventListeners();
    const download = () => {
        const button = get('backup-history').querySelector('[data-drive-action="download"]');
        button.focus();
        return get('backup-history').listeners.get('click')[0]({ target: button });
    };
    const event = (id, type = 'click') => { const element = get(id); element.focus(); return element.listeners.get(type)[0](); };
    const noNameWrites = () => { assert.deepEqual(calls.renames, []); assert.deepEqual(calls.additions, []); assert.deepEqual(calls.selections, []); };
    return { document, get, calls, saved, context, download, event, noNameWrites };
}

for (const failure of ['', 'read', 'click']) test(`download ${failure || 'request'} retains a blurred computer-name draft through real panel refreshes`, async () => {
    const h = await harness();
    assert.equal(h.get('device-name').value, 'Saved home');
    h.get('device-name').value = '  Unsaved synthetic name  ';
    h.calls.failRead = failure === 'read'; h.calls.failClick = failure === 'click';
    await h.download();
    assert.equal(h.get('device-name').value, '  Unsaved synthetic name  ');
    assert.equal(h.saved.deviceName, 'Saved home');
    assert.equal(h.calls.downloads, 1);
    assert.equal(h.calls.clicks, failure ? 0 : 1);
    assert.equal(h.calls.messages.at(-1).status, failure ? 'error' : 'info');
    assert.equal(h.get('device-select').disabled, false);
    assert.equal(h.get('rename-device').disabled, false);
    assert.equal(Boolean(h.get('backup-history').querySelector('[data-drive-action="download"]').disabled), false);
    if (failure) assert.match(h.get('backup-status').textContent, /Synthetic (payload unavailable|trigger rejected)/);
    h.noNameWrites();
});

for (const value of ['', '   ']) test(`download keeps an intentionally blank name draft ${JSON.stringify(value)}`, async () => {
    const h = await harness(); h.get('device-name').value = value;
    await h.download();
    assert.equal(h.get('device-name').value, value);
    assert.equal(h.saved.deviceName, 'Saved home'); h.noNameWrites();
});

test('new typing while payload and later panel reads are pending is retained without allowing duplicate downloads', async () => {
    const h = await harness(); h.calls.payloadGate = deferred();
    h.get('device-name').value = 'First draft';
    const pending = h.download();
    await h.download();
    assert.equal(h.calls.downloads, 1);
    h.get('device-name').value = 'Newer payload draft';
    h.calls.panelGate = deferred(); const before = h.calls.reads;
    h.calls.payloadGate.resolve();
    const deadline = Date.now() + 2000;
    while (h.calls.reads === before && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
    assert(h.calls.reads > before, 'download reached the pending panel read');
    h.get('device-name').value = '  Newest panel-read draft  ';
    h.calls.panelGate.resolve();
    await pending;
    assert.equal(h.get('device-name').value, '  Newest panel-read draft  ');
    assert.equal(h.calls.clicks, 1);
    assert.equal(h.saved.deviceName, 'Saved home'); h.noNameWrites();
});

test('retry after a rejected payload keeps the same draft and permits another download request', async () => {
    const h = await harness(); h.get('device-name').value = 'Retry draft'; h.calls.failRead = true;
    await h.download();
    h.calls.failRead = false;
    await h.download();
    assert.equal(h.get('device-name').value, 'Retry draft');
    assert.equal(h.calls.downloads, 2); assert.equal(h.calls.clicks, 1);
    assert.match(h.calls.messages.at(-1).message, /download requested/);
    assert.equal(h.saved.deviceName, 'Saved home'); h.noNameWrites();
});

test('the existing explicit Rename action still displays the saved canonical name', async () => {
    const h = await harness(); h.get('device-name').value = '  Renamed home  ';
    await h.event('rename-device');
    assert.deepEqual(h.calls.renames, ['Renamed home']);
    assert.equal(h.saved.deviceName, 'Renamed home'); assert.equal(h.get('device-name').value, 'Renamed home');
    assert.equal(h.calls.downloads, 0);
});

test('the existing explicit Add Computer action still displays the new saved profile name', async () => {
    const h = await harness(); h.get('device-name').value = '  New computer  ';
    await h.event('add-device');
    assert.deepEqual(h.calls.additions, ['New computer']);
    assert.equal(h.saved.deviceId, 'new'); assert.equal(h.get('device-name').value, 'New computer');
    assert.equal(h.calls.downloads, 0);
});

test('explicitly choosing a different computer does not carry the previous profile name into the new target', async () => {
    const h = await harness(); h.get('device-name').value = 'Unsubmitted home name'; h.get('device-select').value = 'work';
    await h.event('device-select', 'change');
    assert.deepEqual(h.calls.selections, ['work']);
    assert.equal(h.saved.deviceId, 'work'); assert.equal(h.get('device-name').value, 'Saved work');
    assert.equal(h.calls.downloads, 0);
});

test('a changed saved computer during download cannot present the old name draft as the new target', async () => {
    const h = await harness(); h.get('device-name').value = 'Unsubmitted home name';
    h.calls.payloadGate = deferred();
    const pending = h.download();
    h.saved.deviceId = 'work'; h.saved.deviceName = 'Saved work';
    h.calls.payloadGate.resolve();
    await pending;
    assert.equal(h.get('device-select').value, 'work');
    assert.equal(h.get('device-name').value, 'Saved work');
    h.noNameWrites();
});

for (const failure of ['', 'read', 'click']) test(`focused ${failure || 'requested'} download draft stays with its original computer across target changes and repeated downloads`, async () => {
    const h = await harness(); h.get('device-name').value = 'Home draft'; h.calls.payloadGate = deferred();
    h.calls.failRead = failure === 'read'; h.calls.failClick = failure === 'click';
    const pending = h.download();
    h.get('device-name').focus(); h.get('device-name').value = 'Home draft edited during download';
    h.saved.deviceId = 'work'; h.saved.deviceName = 'Saved work';
    h.calls.payloadGate.resolve(); await pending;
    assert.equal(h.get('device-select').value, 'work');
    assert.equal(h.get('device-name').value, 'Saved work');
    await h.download();
    assert.equal(h.get('device-name').value, 'Saved work', 'a second download cannot reclassify the home draft as work');
    h.noNameWrites();
    h.get('device-name').value = 'Separate work draft';
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Home draft edited during download');
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Separate work draft');
    assert.deepEqual(h.calls.renames, []); assert.deepEqual(h.calls.additions, []);
    assert.deepEqual(h.saved.knownDevices, [{ id: 'home', name: 'Saved home' }, { id: 'work', name: 'Saved work' }]);
});

test('a newer name typed while Rename is pending remains a draft after the submitted name is saved', async () => {
    const h = await harness(); h.calls.renameGate = deferred(); h.get('device-name').value = '  Submitted home  ';
    const pending = h.event('rename-device');
    h.get('device-name').focus(); h.get('device-name').value = 'Newer home draft'; h.get('device-select').focus();
    h.calls.renameGate.resolve(); await pending;
    assert.equal(h.saved.deviceName, 'Submitted home');
    assert.equal(h.get('device-name').value, 'Newer home draft');
    await h.download(); assert.equal(h.get('device-name').value, 'Newer home draft');
    assert.deepEqual(h.calls.renames, ['Submitted home']);
});

test('Add Computer does not discard a newer original-profile draft typed while the submitted name is pending', async () => {
    const h = await harness(); h.calls.addGate = deferred(); h.get('device-name').value = '  Submitted new computer  ';
    const pending = h.event('add-device');
    h.get('device-name').focus(); h.get('device-name').value = 'Newer home draft'; h.get('device-select').focus();
    h.calls.addGate.resolve(); await pending;
    assert.equal(h.saved.deviceId, 'new'); assert.equal(h.get('device-name').value, 'Submitted new computer');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Newer home draft');
    assert.deepEqual(h.calls.additions, ['Submitted new computer']); assert.deepEqual(h.calls.renames, []);
});

test('a successful Add Computer submission is not later restored as an unsaved name for its previous profile', async () => {
    const h = await harness(); h.get('device-name').value = '  Submitted new computer  ';
    await h.event('add-device');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Saved home');
    h.get('device-select').value = 'new'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Submitted new computer');
});

for (const action of ['rename', 'add']) test(`failed explicit ${action} keeps the unsubmitted draft without changing its saved name`, async () => {
    const h = await harness(); h.get('device-name').value = 'Unsubmitted home draft';
    h.calls[action === 'rename' ? 'failRename' : 'failAdd'] = true;
    await h.event(action === 'rename' ? 'rename-device' : 'add-device');
    assert.equal(h.get('device-name').value, 'Unsubmitted home draft');
    assert.equal(h.saved.deviceName, 'Saved home'); assert.equal(h.saved.deviceId, 'home');
    assert.equal(h.calls.messages.at(-1).status, 'error');
});

test('a removed computer draft is never restored to a different ID with the same saved name', async () => {
    const h = await harness(); h.get('device-name').value = 'Only home draft';
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    h.saved.knownDevices = [{ id: 'work', name: 'Saved work' }, { id: 'replacement', name: 'Saved home' }];
    h.saved.deviceId = 'replacement'; h.saved.deviceName = 'Saved home';
    h.get('device-name').focus();
    await h.context.renderDriveBackupPanel();
    assert.equal(h.get('device-select').value, 'replacement'); assert.equal(h.get('device-name').value, 'Saved home');
    await h.context.renderDriveBackupPanel(); assert.equal(h.get('device-name').value, 'Saved home');
    assert.deepEqual(h.calls.renames, []); assert.deepEqual(h.calls.additions, []);
});

test('failed saved-profile reads never assign a generated fallback identity to a retained draft', async () => {
    const h = await harness(); h.get('device-name').value = 'Only home draft'; h.calls.failPanelRead = true;
    await h.download(); await h.context.renderDriveBackupPanel();
    assert.equal(h.calls.fallbacks, 2);
    assert.equal(h.get('device-select').value, 'home'); assert.equal(h.get('device-name').value, 'Only home draft');
    for (const id of ['rename-device', 'add-device', 'device-select']) assert.equal(h.get(id).disabled, true);
    h.calls.failPanelRead = false;
    h.saved.deviceId = 'work'; h.saved.deviceName = 'Saved work';
    await h.context.renderDriveBackupPanel();
    assert.equal(h.get('device-name').value, 'Saved work'); assert.equal(h.get('device-select').disabled, false);
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Only home draft');
    assert.deepEqual(h.calls.renames, []); assert.deepEqual(h.calls.additions, []);
});

for (const newerDraft of [false, true]) test(`a completed submission acknowledges only its own cached profile value (newer draft: ${newerDraft})`, async () => {
    const h = await harness(); h.get('device-name').value = 'Submitted home';
    if (newerDraft) h.get('device-name').value = 'Newer home draft';
    h.saved.deviceId = 'work'; h.saved.deviceName = 'Saved work';
    await h.context.renderDriveBackupPanel();
    h.get('device-name').value = 'Current work draft';
    h.context.acknowledgeDriveDeviceName(h.get('device-name'), 'home', 'Submitted home');
    assert.equal(h.get('device-name').value, 'Current work draft');
    h.saved.knownDevices[0].name = 'Submitted home';
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, newerDraft ? 'Newer home draft' : 'Submitted home');
    assert.deepEqual(h.calls.renames, []); assert.deepEqual(h.calls.additions, []);
});

for (const action of ['refresh-list', 'backup-now']) test(`${action} refreshes do not submit or discard the current name draft`, async () => {
    const h = await harness(); h.get('device-name').value = 'Unsubmitted home draft';
    await h.event(action);
    assert.equal(h.get('device-name').value, 'Unsubmitted home draft'); assert.equal(h.saved.deviceName, 'Saved home');
    assert.equal(h.calls.listings, 1); assert.equal(h.calls.uploads, action === 'backup-now' ? 1 : 0);
    h.noNameWrites();
});

test('a replacement input has no access to drafts belonging to the removed field', async () => {
    const h = await harness(); h.get('device-name').value = 'Old field draft';
    await h.download();
    h.get('device-name').remove();
    const replacement = h.document.createElement('input'); replacement.id = 'drive-device-name';
    h.document.body.append(replacement);
    await h.context.renderDriveBackupPanel();
    assert.equal(replacement.value, 'Saved home'); h.noNameWrites();
});

for (const value of ['', '   ']) test(`switching back restores an exact blank draft ${JSON.stringify(value)}`, async () => {
    const h = await harness(); h.get('device-name').value = value;
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Saved work');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, value);
    assert.deepEqual(h.calls.renames, []); assert.deepEqual(h.calls.additions, []);
});


for (const action of ['rename', 'add', 'select']) test(`${action} owns the displayed target until completion and rejects programmatic selection changes`, async () => {
    const h = await harness(), gate = deferred();
    h.calls[action + 'Gate'] = gate;
    h.get('device-name').value = 'Submitted name';
    if (action === 'select') h.get('device-select').value = 'work';
    const pending = h.event(action === 'select' ? 'device-select' : action + '-device', action === 'select' ? 'change' : 'click');
    for (const id of ['device-select', 'rename-device', 'add-device', 'refresh-list', 'backup-now']) {
        assert.equal(h.get(id).disabled, true, `${id} must be disabled while ${action} is pending`);
    }
    assert.notEqual(h.get('device-name').disabled, true, 'typing a later draft remains possible');
    assert.equal(h.get('device-select').value, 'home', 'a pending choice does not impersonate an acknowledged target');
    h.get('device-select').value = 'work';
    await h.event('device-select', 'change');
    assert.equal(h.get('device-select').value, 'home', 'rejected input restores the acknowledged target');
    assert.deepEqual(h.calls.selections, action === 'select' ? ['work'] : []);
    gate.resolve(); await pending;
    const expected = action === 'add' ? 'new' : action === 'select' ? 'work' : 'home';
    assert.equal(h.saved.deviceId, expected); assert.equal(h.get('device-select').value, expected);
    assert.equal(h.get('device-select').disabled, false); assert.equal(h.get('rename-device').disabled, false);
    h.get('device-name').value = 'Correct target'; await h.event('rename-device');
    assert.equal(h.saved.knownDevices.find(item => item.id === expected).name, 'Correct target');
    for (const item of h.saved.knownDevices.filter(item => item.id !== expected)) {
        assert.notEqual(item.name, 'Correct target');
    }
});

for (const fail of [false, true]) test(`completed rename restores its trigger focus after ${fail ? 'failure' : 'success'}`, async () => {
    const h = await harness(); h.get('device-name').value = 'Submitted'; h.calls.failRename = fail;
    const trigger = h.get('rename-device'); await h.event('rename-device');
    assert.equal(h.document.activeElement, trigger);
    assert.equal(trigger.disabled, false); assert.equal(h.get('device-select').value, h.saved.deviceId);
    assert.equal(h.get('device-name').value, fail ? 'Submitted' : h.saved.deviceName);
});

test('completion leaves focus and newer typing with the user', async () => {
    const h = await harness(); h.calls.renameGate = deferred(); h.get('device-name').value = 'Submitted';
    const pending = h.event('rename-device'); h.get('device-name').focus(); h.get('device-name').value = 'Later typing';
    h.calls.renameGate.resolve(); await pending;
    assert.equal(h.document.activeElement, h.get('device-name')); assert.equal(h.get('device-name').value, 'Later typing');
});

for (const fail of [false, true]) test(`an obsolete ${fail ? 'failed' : 'successful'} panel read cannot roll back a completed target selection`, async () => {
    const h = await harness(), gate = deferred(), manager = h.context.window.driveBackupManager;
    const original = manager.getState, captured = structuredClone(h.saved); let first = true;
    manager.getState = async () => {
        if (first) { first = false; await gate.promise; if (fail) throw new Error('Obsolete read'); return captured; }
        return original();
    };
    h.get('device-name').value = 'Preserved home draft';
    const stale = h.context.renderDriveBackupPanel([{id: 'obsolete-snapshot', deviceId: 'home'}]);
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    h.document.body.focus(); gate.resolve(); await stale;
    assert.equal(h.get('device-select').value, 'work'); assert.equal(h.get('device-select').disabled, false);
    assert.equal(h.get('device-name').value, 'Saved work');
    assert.equal(h.get('backup-history').querySelector('[data-file-id="obsolete-snapshot"]'), null);
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Preserved home draft');
});

test('panel refresh during an action never enables fresh snapshot buttons or the selector', async () => {
    const h = await harness(); h.calls.renameGate = deferred(); h.get('device-name').value = 'Submitted';
    const pending = h.event('rename-device'); await h.context.renderDriveBackupPanel();
    assert.equal(h.get('device-select').disabled, true);
    for (const button of h.get('backup-history').querySelectorAll('[data-drive-action]')) assert.equal(button.disabled, true);
    h.calls.renameGate.resolve(); await pending;
    for (const button of h.get('backup-history').querySelectorAll('[data-drive-action]')) assert.equal(button.disabled, false);
});

test('final panel read retains the action lock until its controls and target are ready', async () => {
    const h = await harness(), manager = h.context.window.driveBackupManager, gate = deferred();
    const original = manager.getState; let reads = 0;
    manager.getState = async () => { if (++reads === 2) await gate.promise; return original(); };
    h.get('device-name').value = 'Submitted'; const pending = h.event('rename-device');
    const deadline = Date.now() + 2000;
    while (reads < 2 && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 2, 'completion is waiting for its final panel read');
    assert.equal(h.get('device-select').disabled, true);
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    assert.equal(h.get('device-select').value, 'home'); assert.deepEqual(h.calls.selections, []);
    gate.resolve(); await pending;
    assert.equal(h.get('device-select').value, h.saved.deviceId); assert.equal(h.get('device-select').disabled, false);
});


test('a failed selection restores the actual target, its draft and selector focus', async () => {
    const h = await harness(); h.calls.failSelect = true; h.get('device-name').value = 'Home draft';
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    assert.equal(h.saved.deviceId, 'home'); assert.equal(h.get('device-select').value, 'home');
    assert.equal(h.get('device-name').value, 'Home draft'); assert.equal(h.document.activeElement, h.get('device-select'));
    assert.equal(h.calls.messages.at(-1).status, 'error');
});

test('workspace preflight is already locked and cannot retarget a pending selection', async () => {
    const h = await harness(), gate = deferred();
    h.context.storageManager.workspace = { id: 'default' };
    h.context.storageManager.isDefaultWorkspace = async () => gate.promise;
    h.get('device-select').value = 'work'; const pending = h.event('device-select', 'change');
    assert.equal(h.get('device-select').disabled, true); assert.equal(h.get('device-select').value, 'home');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.deepEqual(h.calls.selections, []);
    gate.resolve(true); await pending;
    assert.deepEqual(h.calls.selections, ['work']); assert.equal(h.get('device-select').value, 'work');
});

test('a declined workspace preflight restores its own controls without executing the action', async () => {
    const h = await harness(); h.context.storageManager.workspace = { id: 'other' };
    h.context.storageManager.isDefaultWorkspace = async () => false;
    h.get('device-name').value = 'Unsubmitted'; await h.event('rename-device');
    assert.deepEqual(h.calls.renames, []); assert.equal(h.get('device-name').value, 'Unsubmitted');
    assert.equal(h.get('device-select').disabled, true); assert.equal(h.get('rename-device').disabled, true);
    assert.equal(h.calls.messages.at(-1).status, 'info');
});

test('a failed final profile read remains unavailable after the busy lock is released', async () => {
    const h = await harness(); h.calls.failPanelRead = true; h.get('device-name').value = 'Submitted';
    await h.event('rename-device');
    for (const id of ['device-select', 'rename-device', 'add-device']) assert.equal(h.get(id).disabled, true);
    assert.equal(h.get('device-name').value, 'Submitted'); assert.equal(h.saved.deviceId, 'home');
    h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    assert.equal(h.get('device-select').value, 'home'); assert.deepEqual(h.calls.selections, []);
    h.calls.failPanelRead = false; await h.context.renderDriveBackupPanel();
    assert.equal(h.get('device-select').disabled, false);
});


for (const fail of [false, true]) test(`a superseded final read keeps target actions locked until the latest ${fail ? 'failed' : 'successful'} read settles`, async () => {
    const h = await harness(), manager = h.context.window.driveBackupManager;
    const original = manager.getState, first = deferred(), latest = deferred(); let reads = 0;
    h.calls.payloadGate = deferred(); h.get('device-name').value = 'Home-only draft';
    const downloading = h.download(); let finished = false; downloading.then(() => { finished = true; });
    manager.getState = async () => {
        const call = ++reads;
        if (call === 1) await first.promise;
        if (call === 2) { await latest.promise; if (fail) throw new Error('Latest read unavailable'); }
        return original();
    };
    h.saved.deviceId = 'work'; h.saved.deviceName = 'Saved work'; h.calls.payloadGate.resolve();
    const deadline = Date.now() + 2000;
    while (reads < 1 && Date.now() < deadline) await new Promise(resolve => setImmediate(resolve));
    assert.equal(reads, 1);
    const newer = h.context.renderDriveBackupPanel(); assert.equal(reads, 2);
    first.resolve(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(finished, false, 'the action waits for its replacement renderer');
    assert.equal(h.get('device-select').disabled, true); assert.equal(h.get('rename-device').disabled, true);
    await h.event('rename-device'); assert.deepEqual(h.calls.renames, [], 'programmatic Rename is still rejected');
    latest.resolve(); await Promise.all([newer, downloading]);
    assert.equal(h.get('device-select').disabled, fail); assert.equal(h.get('rename-device').disabled, fail);
    if (fail) await h.context.renderDriveBackupPanel();
    assert.equal(h.get('device-select').value, 'work'); assert.equal(h.get('device-name').value, 'Saved work');
    h.get('device-name').value = 'Explicit work rename'; await h.event('rename-device');
    assert.equal(h.saved.knownDevices.find(item => item.id === 'work').name, 'Explicit work rename');
    assert.equal(h.saved.knownDevices.find(item => item.id === 'home').name, 'Saved home');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Home-only draft');
});

// The actual Settings owner, ContentLifecycle and WorkspacesView share this
// page. Only provider/storage I/O and navigation are synthetic; no Drive handlers
// or draft decisions are replaced. Native warning UI remains browser-owned.
async function departureHarness() {
    const h = await harness(), {context, document} = h, window = context.window;
    const StorageManager = require('../storage.js');
    const storage = context.storageManager = new StorageManager();
    const config = storage.cloneDefaultConfig();
    config.categories = []; config.hot = { tab: 'baidu', baidu: [], weibo: [], zhihu: [] };
    config._settingsBaseline = storage.settingsSnapshot(config);
    config._clockBaseline = structuredClone(config.clock);
    const writes = [], events = {}, calls = [];
    storage.setAll = async (values, options) => { writes.push({values: structuredClone(values), options: structuredClone(options)}); return true; };
    context.displayStorageInfo = async () => {};
    context.clearTimeout = () => {};
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const create = document.createElement.bind(document);
    document.createElement = tag => { const element = create(tag); element.removeAttribute = name => { delete element.attributes[name]; }; return element; };
    for (const [id, tag] of Object.entries({'hour12-format': 'input', 'show-seconds': 'input', 'quote-text': 'input',
        'category-manage-list': 'div', 'add-category': 'button'})) {
        const element = document.createElement(tag); element.id = id; document.body.append(element);
    }
    await context.populateFormFields(config);
    context.setupCategoryManagement(config.categories);
    window.document = document;
    window.addEventListener = (type, fn) => { events[type] = fn; };
    window.location = {href: 'chrome-extension://synthetic/options.html?workspace=default', reload: () => calls.push(['reload'])};
    window.confirm = () => { calls.push(['confirm']); return false; };
    for (const file of ['shared/local-content-lifecycle.js', 'shared/dialog-focus.js', 'shared/workspaces-view.js']) {
        vm.runInNewContext(fs.readFileSync(file, 'utf8'), {window, document, setTimeout, URL, Blob});
    }
    const registry = {schemaVersion: 1, defaultId: 'default', lastUsedId: 'default', revision: 0, workspaces: [
        {id: 'default', name: 'Default', order: 0, generation: 'g0', deletedAt: null},
        {id: 'work', name: 'Work', order: 1, generation: 'g1', deletedAt: null}]};
    const session = {id: 'default', generation: 'g0', ready: async () => ({id: 'default', generation: 'g0'}),
        flush: async () => calls.push(['flush']), suspendWrites: () => calls.push(['suspend']), resumeWrites: () => calls.push(['resume'])};
    storage.workspace = session; storage.isDefaultWorkspace = async () => true;
    const manager = {list: async () => structuredClone(registry), subscribe: () => () => {},
        select: async id => { calls.push(['select', id]); registry.lastUsedId = id; }};
    const switcher = document.createElement('section'), managerHost = document.createElement('section');
    document.body.append(switcher, managerHost);
    const lifecycle = window.LocalItabContentLifecycle;
    window.workspacesView = window.LocalItabWorkspacesView.mount({switcher, managerHost, manager, session, lifecycle,
        navigate: id => calls.push(['navigate', id])});
    await window.workspacesView.ready;
    const dialog = () => document.querySelector('.spaces-dialog');
    const find = text => document.querySelectorAll('button').find(button => button.textContent === text);
    const open = () => managerHost.querySelector('[data-workspace-id="work"][data-workspace-action="open"]').dispatch('click');
    const warns = () => { let prevented = false; const event = {preventDefault() { prevented = true; }};
        events.beforeunload(event); return prevented && event.returnValue === ''; };
    const selected = () => calls.some(call => ['select', 'navigate'].includes(call[0]));
    assert.equal(window.settingsFormView.hasUncommittedWork(), false, 'ordinary Settings begins clean');
    assert.equal(lifecycle.hasUncommittedWork(), false, 'all content owners begin clean');
    return {...h, window, lifecycle, writes, departureCalls: calls, dialog, find, open, warns, selected};
}
async function until(check, message) {
    const deadline = Date.now() + 2000;
    while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert(check(), message);
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));

for (const failedLatestRead of [false, true]) test(`Drive departure waits through upload and the latest ${failedLatestRead ? 'failed' : 'successful'} final panel refresh`, async () => {
    const h = await departureHarness(), final = deferred(), latest = deferred();
    const manager = h.window.driveBackupManager, original = manager.getState; let reads = 0;
    manager.getState = async () => {
        const read = ++reads;
        if (read === 2) await final.promise;
        if (read === 3) { await latest.promise; if (failedLatestRead) throw new Error('Synthetic latest panel unavailable'); }
        return original();
    };
    h.calls.uploadGate = deferred();
    const action = h.event('backup-now');
    try {
        await until(() => h.calls.uploads === 1, 'upload entered');
        assert.equal(h.window.settingsFormView.pending, true);
        assert.equal(h.lifecycle.pending(), true);
        assert.equal(h.warns(), true, 'pending Drive alone participates in beforeunload');
        assert.equal(h.lifecycle.reload(), false);
        h.document.getElementById('local-content-reload-notice').querySelector('button').dispatch('click');
        assert.deepEqual(h.departureCalls, [], 'pending reload does not confirm or navigate');
        h.open(); await tick();
        assert.equal(h.selected(), false); assert.equal(h.dialog(), null);
        h.calls.uploadGate.resolve(); await until(() => reads === 2, 'final panel read entered');
        const newer = h.context.renderDriveBackupPanel();
        await until(() => reads === 3, 'newer panel read entered');
        final.resolve(); await tick();
        assert.equal(h.lifecycle.pending(), true); assert.equal(h.selected(), false);
        latest.resolve(); await Promise.all([action, newer]);
        await until(() => h.departureCalls.some(call => call[0] === 'navigate'), 'clean switch completes after settled latest refresh');
        assert.equal(h.lifecycle.pending(), false); assert.equal(h.window.settingsFormView.hasUncommittedWork(), false);
        assert.equal(h.lifecycle.departing, true); h.noNameWrites();
    } finally { h.calls.uploadGate.resolve(); final.resolve(); latest.resolve(); await action; }
});

for (const fail of [false, true]) test(`Drive departure retains the name and offers the original choices after ${fail ? 'failed' : 'successful'} backup settles`, async () => {
    const h = await departureHarness(); h.get('device-name').value = 'Unsubmitted synthetic home';
    h.calls.uploadGate = deferred(); h.calls.failUpload = fail;
    const action = h.event('backup-now');
    try {
        await until(() => h.calls.uploads === 1, 'upload entered');
        h.open(); await tick(); assert.equal(h.selected(), false); assert.equal(h.dialog(), null);
        h.calls.uploadGate.resolve(); await action;
        await until(() => h.dialog(), 'remaining name draft needs a choice');
        assert.equal(h.lifecycle.pending(), false); assert.equal(h.window.settingsFormView.pending, false);
        assert.equal(h.lifecycle.hasUncommittedWork(), true); assert.equal(h.lifecycle.departing, false);
        assert.equal(h.get('device-name').value, 'Unsubmitted synthetic home');
        for (const label of ['Stay here', 'Save and switch', 'Discard drafts and switch']) assert(h.find(label));
        h.find('Stay here').dispatch('click');
        assert.equal(h.dialog(), null); assert.equal(h.selected(), false); assert.equal(h.warns(), true);
        h.noNameWrites(); assert.equal(h.saved.deviceName, 'Saved home');
    } finally { h.calls.uploadGate.resolve(); await action; }
});

test('Drive departure reads exact name drafts, ignores obsolete current cache, and protects hidden same-name computers', async () => {
    const h = await departureHarness();
    for (const value of ['', '   ', ' Saved home ', 'Saved home']) {
        h.get('device-name').value = value;
        assert.equal(h.lifecycle.hasUncommittedWork(), value !== 'Saved home');
        assert.equal(h.warns(), value !== 'Saved home');
    }
    h.get('device-name').value = 'Home draft'; await h.context.renderDriveBackupPanel();
    h.get('device-name').value = 'Saved home';
    assert.equal(h.lifecycle.hasUncommittedWork(), false, 'current input supersedes its cached old draft');
    h.saved.knownDevices[1].name = 'Saved home';
    h.get('device-name').value = ''; h.get('device-select').value = 'work'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Saved home');
    assert.equal(h.lifecycle.hasUncommittedWork(), true, 'hidden blank home draft survives duplicate saved names');
    await h.event('rename-device');
    assert.equal(h.lifecycle.hasUncommittedWork(), true, 'saving work does not consume hidden home draft');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, '');
    h.get('device-name').value = 'Saved home'; assert.equal(h.lifecycle.hasUncommittedWork(), false);
});

test('Drive departure Save and switch saves ordinary edits without implicitly renaming or adding a computer', async () => {
    const h = await departureHarness(); h.get('device-name').value = 'Explicit action still needed';
    h.document.getElementById('quote-text').value = 'Synthetic ordinary Settings edit';
    h.open(); await until(() => h.dialog(), 'Drive draft decision opens');
    h.find('Save and switch').dispatch('click');
    await until(() => h.dialog()?.textContent.includes('Some edits need attention'), 'unsubmitted name refuses departure after ordinary Save');
    assert.equal(h.selected(), false); assert.equal(h.lifecycle.departing, false); h.noNameWrites();
    assert.equal(h.get('device-name').value, 'Explicit action still needed');
    assert.equal(h.writes.length, 1); assert.deepEqual(h.writes[0].values, {quote: 'Synthetic ordinary Settings edit'});
    h.find('Discard drafts and switch').dispatch('click');
    await until(() => h.departureCalls.some(call => call[0] === 'navigate'), 'explicit discard can depart');
    assert.equal(h.lifecycle.departing, true); assert.equal(h.writes.length, 1); h.noNameWrites();
});

for (const action of ['rename-device', 'add-device']) test(`Drive departure is clean after explicit ${action} acknowledges the exact submission`, async () => {
    const h = await departureHarness(); h.get('device-name').value = '  Explicit synthetic computer  ';
    assert.equal(h.lifecycle.hasUncommittedWork(), true);
    await h.event(action);
    assert.equal(h.get('device-name').value, 'Explicit synthetic computer');
    assert.equal(h.lifecycle.hasUncommittedWork(), false); assert.equal(h.warns(), false);
});

for (const focused of [false, true]) test(`Drive departure protects the old saved name retyped during Rename (focused: ${focused})`, async () => {
    const h = await departureHarness(); h.calls.renameGate = deferred(); h.get('device-name').value = 'Submitted synthetic name';
    const action = h.event('rename-device');
    h.get('device-name').focus(); h.get('device-name').value = 'Saved home';
    if (!focused) h.document.body.focus();
    h.calls.renameGate.resolve(); await action;
    assert.equal(h.saved.deviceName, 'Submitted synthetic name');
    assert.equal(h.get('device-name').value, 'Saved home', 'the later input is not the completed submission');
    assert.equal(h.lifecycle.hasUncommittedWork(), true); assert.equal(h.warns(), true);
    await h.context.renderDriveBackupPanel(); assert.equal(h.get('device-name').value, 'Saved home');
});

for (const newerValue of ['Saved home', 'Newer home name']) test(`Drive departure distinguishes original-profile input during Add: ${newerValue}`, async () => {
    const h = await departureHarness(); h.calls.addGate = deferred(); h.get('device-name').value = 'New computer';
    const action = h.event('add-device'); h.get('device-name').value = newerValue;
    h.calls.addGate.resolve(); await action;
    assert.equal(h.get('device-name').value, 'New computer');
    assert.equal(h.lifecycle.hasUncommittedWork(), newerValue !== 'Saved home');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, newerValue);
});

test('Drive departure protects names before Settings initialization and after replacement requests reload', async () => {
    const h = await departureHarness(); h.get('device-name').value = '';
    await h.context.replaceSettings(async () => true);
    assert.equal(h.window.settingsFormView.hasUncommittedWork(), true);
    assert.equal(h.lifecycle.reload(), false); assert.equal(h.warns(), true);
    assert.equal(h.departureCalls.some(call => call[0] === 'reload'), false);
    const uninitialized = await harness(); uninitialized.get('device-name').value = 'Draft before Settings baseline';
    assert.equal(uninitialized.context.settingsHasUncommittedWork(), true);
});


test('Rename submits the displayed profile ID even if another instance changed selection', async () => {
    const h = await harness(); h.get('device-name').value = 'Reviewed home name';
    h.saved.deviceId = 'work'; h.saved.deviceName = 'Saved work';
    await h.event('rename-device');
    assert.deepEqual(h.calls.renameIds, ['home']);
    assert.equal(h.saved.deviceId, 'work'); assert.equal(h.saved.deviceName, 'Saved work');
    assert.equal(h.saved.knownDevices.find(profile => profile.id === 'home').name, 'Reviewed home name');
    assert.equal(h.get('device-name').value, 'Saved work');
    h.get('device-select').value = 'home'; await h.event('device-select', 'change');
    assert.equal(h.get('device-name').value, 'Reviewed home name', 'acknowledgement belongs to renamed ID, not current selection');
});
