const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const CompleteBackup = require('../shared/complete-backup.js');
const StorageManager = require('../storage.js');
const source = fs.readFileSync(path.join(__dirname, 'fixtures/legacy-customization-complete.json'), 'utf8');
const checksum = value => createHash('sha256').update(value).digest('hex');
const IDS = ['local-tasks-card', 'local-focus-card', 'local-scratchpad-card', 'local-countdown-card', 'world-clocks-card', 'weather-container', 'hot-container', 'movie-container'];
const input = () => JSON.parse(source);

test('the exact pre-card-layout complete archive parses without mutation and retains its checksum', () => {
    const manager = new StorageManager(), before = checksum(source), expected = input();
    assert.equal(before, '3106a0f0a4711489c54477412eae5c803347c91ee7217794cf3b110e87ea970b');
    const parsed = CompleteBackup.parse(source, manager);
    assert.deepEqual(parsed, expected);
    assert.deepEqual(manager.validateCompleteBackupConfig(expected.modules.config), expected.modules.config);
    assert.deepEqual(manager.completeBackupConfigFromRaw(expected.modules.config.data), expected.modules.config);
    const written = manager.completeBackupConfigWrite(expected.modules.config, {});
    assert.deepEqual(written.appearance, expected.modules.config.data.appearance);
    assert.deepEqual(written.layout, expected.modules.config.data.layout);
    assert.equal(checksum(source), before);
    assert.equal(checksum(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-customization-complete.json'), 'utf8')), before);
    const imported = manager.validateImportPayload(expected.modules.config);
    assert.equal(imported.appearance.customization.cardOrder, null);
    assert.equal(imported.appearance.customization.cardSpans, null);
    assert.deepEqual(imported.layout, expected.modules.config.data.layout);
});

for (const fields of [{}, { cardOrder: [...IDS].reverse() }, { cardSpans: { 'local-tasks-card': 2 } }, { cardOrder: null, cardSpans: null }, { cardOrder: IDS, cardSpans: { 'movie-container': 4 } }]) {
    test(`legacy complete/settings compatibility with optional fields ${Object.keys(fields).join(',') || 'absent'}`, () => {
        const manager = new StorageManager(), file = input(); Object.assign(file.modules.config.data.appearance.customization, fields);
        const serialized = JSON.stringify(file), digest = checksum(serialized);
        assert.deepEqual(CompleteBackup.parse(serialized, manager), file);
        const imported = manager.validateImportPayload(file.modules.config);
        assert.deepEqual(imported.appearance.customization.cardOrder, fields.cardOrder ?? null);
        assert.deepEqual(imported.appearance.customization.cardSpans, fields.cardSpans ?? null);
        assert.equal(checksum(serialized), digest);
    });
}

test('workspace archives validate the same legacy projection without adding fields', () => {
    const manager = new StorageManager(), config = input().modules.config;
    delete config.data.privacy;
    const date = '2026-10-11T20:00:00.000Z';
    const file = { format: CompleteBackup.FORMAT, schemaVersion: 2, exportedAt: date, modules: ['config'],
        registry: { defaultId: 'default', lastUsedId: 'default', entries: [{ id: 'default', name: 'Synthetic workspace', createdAt: date, updatedAt: date }] },
        workspaces: [{ id: 'default', modules: { config } }], trash: [] };
    assert.deepEqual(CompleteBackup.parse(JSON.stringify(file), manager), file);
});

test('legacy compatibility never repairs supplied malformed or unknown card fields', () => {
    const manager = new StorageManager();
    for (const bad of [{ cardOrder: [] }, { cardOrder: IDS.slice(1) }, { cardOrder: [...IDS.slice(1), IDS[1]] }, { cardOrder: 'default' },
        { cardSpans: [] }, { cardSpans: { 'local-tasks-card': 5 } }, { cardSpans: { 'local-tasks-card': '2' } }, { cardSpans: { unknown: 1 } },
        { cardRows: 2 }, { cardColumns: 5 }]) {
        const file = input(); Object.assign(file.modules.config.data.appearance.customization, bad);
        assert.throws(() => CompleteBackup.parse(JSON.stringify(file), manager));
        assert.throws(() => manager.validateImportPayload(file.modules.config));
    }
    const missingOriginalField = input(); delete missingOriginalField.modules.config.data.appearance.customization.cardGap;
    assert.throws(() => CompleteBackup.parse(JSON.stringify(missingOriginalField), manager), /noncanonical/);
    const noncanonical = input(); noncanonical.modules.config.data.appearance.customization.backgroundStart = '#ABCDEF';
    assert.throws(() => CompleteBackup.parse(JSON.stringify(noncanonical), manager), /noncanonical/);
});
