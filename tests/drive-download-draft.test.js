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
    const calls = { downloads: 0, clicks: 0, errors: [], renames: [], additions: [], selections: [], reads: 0,
        payloadGate: null, panelGate: null, renameGate: null, addGate: null, failRead: false,
        failClick: false, failRename: false, failAdd: false, failPanelRead: false, fallbacks: 0,
        listings: 0, uploads: 0, messages: [], timers: [] };
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
        async renameDevice(name) { calls.renames.push(name); if (calls.renameGate) await calls.renameGate.promise;
            if (calls.failRename) throw new Error('Synthetic rename failed'); saved.deviceName = name.trim();
            saved.knownDevices.find(item => item.id === saved.deviceId).name = saved.deviceName; return structuredClone(saved); },
        async addDevice(name) { calls.additions.push(name); if (calls.addGate) await calls.addGate.promise;
            if (calls.failAdd) throw new Error('Synthetic add failed'); saved.deviceId = 'new'; saved.deviceName = name.trim();
            saved.knownDevices.push({ id: 'new', name: saved.deviceName }); return { deviceCreated: true }; },
        async selectDevice(id) { calls.selections.push(id); saved.deviceId = id;
            saved.deviceName = saved.knownDevices.find(item => item.id === id).name; },
        async listSnapshots() { calls.listings++; return [structuredClone(snapshot)]; },
        async createSnapshotDraft() { return { sizeBytes: 24 }; },
        async uploadSnapshotDraft() { calls.uploads++; return {}; },
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
