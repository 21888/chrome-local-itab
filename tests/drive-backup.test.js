const assert = require('assert');

const StorageManager = require('../storage.js');
const DriveBackupManager = require('../drive-backup.js');

const storage = new StorageManager();
const drive = new DriveBackupManager(storage);

function sampleConfig() {
    const config = storage.cloneDefaultConfig();
    config.bg = { type: 'image', value: 'data:image/png;base64,QUJD' };
    config.movie = {
        title: 'Poster movie',
        note: 'Has a local poster',
        poster: 'data:image/jpeg;base64,QUJD'
    };
    config.links = [
        {
            title: 'Example',
            url: 'https://example.com/',
            icon: 'data:image/png;base64,QUJD',
            category: 'work'
        }
    ];
    config.sync = {
        enabled: true,
        lastSync: '2026-01-01T00:00:00.000Z',
        lastError: 'remote state',
        includeLargeAssets: true
    };
    return config;
}

const payload = storage.buildDriveBackupPayload(sampleConfig(), {
    createdAt: '2026-05-16T10:00:00.000Z',
    snapshotId: 'snapshot_test',
    deviceId: 'device_test',
    deviceName: 'Work Laptop'
});

assert.strictEqual(payload.data.bg.value, 'data:image/png;base64,QUJD');
assert.strictEqual(payload.data.movie.poster, 'data:image/jpeg;base64,QUJD');
assert.strictEqual(payload.data.links[0].icon, 'data:image/png;base64,QUJD');
assert.deepStrictEqual(payload.data.sync, storage.getDisabledSyncConfig());
assert.strictEqual(payload.itemCounts.shortcuts, 1);
assert.strictEqual(payload.itemCounts.dataUrlIcons, 1);
assert.strictEqual(payload.itemCounts.localImagesIncluded, true);
assert.strictEqual(payload.extensionVersion, '');

const driveValidated = storage.validateImportPayload(payload);
assert.strictEqual(driveValidated.links.length, 1);
assert.deepStrictEqual(driveValidated.sync, storage.getDisabledSyncConfig());

const legacyManualPayload = {
    version: '1.0',
    exportDate: '2026-05-16T10:00:00.000Z',
    data: sampleConfig()
};
const legacyValidated = storage.validateImportPayload(legacyManualPayload);
assert.strictEqual(legacyValidated.bg.type, 'image');
assert.strictEqual(legacyValidated.links.length, 1);
assert.deepStrictEqual(legacyValidated.sync, storage.getDisabledSyncConfig());

const restoredWithLocalProviderState = storage.prepareRestoredConfig(payload, {
    sync: {
        enabled: true,
        lastSync: 'local-sync-marker',
        lastError: '',
        includeLargeAssets: true
    }
});
assert.strictEqual(restoredWithLocalProviderState.sync.enabled, true);
assert.strictEqual(restoredWithLocalProviderState.sync.lastSync, 'local-sync-marker');
assert.strictEqual(restoredWithLocalProviderState.sync.includeLargeAssets, false);

async function assertSkipSyncSideEffects() {
    const oldChrome = global.chrome;
    let disableRemoteSyncCalled = false;
    let syncInitializationCalled = false;
    const applyManager = new StorageManager();
    applyManager.ensureSyncInitialized = async () => {
        syncInitializationCalled = true;
    };
    applyManager.isSyncEnabledLocally = async () => true;
    applyManager.disableRemoteSync = async () => {
        disableRemoteSyncCalled = true;
    };
    global.chrome = {
        storage: {
            local: {
                set: async () => {}
            }
        }
    };

    const restoredConfig = storage.cloneDefaultConfig();
    restoredConfig.sync = storage.getDisabledSyncConfig();
    try {
        await applyManager.setAll(restoredConfig, {
            skipSyncSideEffects: true,
            skipSyncInitialization: true
        });
        assert.strictEqual(syncInitializationCalled, false);
        assert.strictEqual(disableRemoteSyncCalled, false);
    } finally {
        global.chrome = oldChrome;
    }
}

async function assertProviderStateReadFailureStopsRestorePreparation() {
    const oldChrome = global.chrome;
    const manager = new StorageManager();
    global.chrome = {
        storage: {
            local: {
                get: async () => {
                    throw new Error('storage unavailable');
                }
            }
        }
    };

    try {
        await assert.rejects(
            () => manager.getLocalProviderState(),
            /storage unavailable/
        );
    } finally {
        global.chrome = oldChrome;
    }
}

async function assertPruneFailureDoesNotFailUpload() {
    const manager = new DriveBackupManager(storage);
    const savedStates = [];
    manager.assertAvailable = () => {};
    manager.uploadMultipart = async () => ({ id: 'uploaded_file' });
    manager.saveState = async partial => {
        savedStates.push(partial);
        return { deviceId: 'device_a', ...partial };
    };
    manager.pruneSnapshotsForDevice = async () => {
        throw new Error('delete denied');
    };

    const result = await manager.uploadSnapshotDraft({
        json: '{}',
        sizeBytes: 2,
        createdAt: '2026-05-16T10:00:00.000Z',
        metadata: {}
    });

    assert.strictEqual(result.id, 'uploaded_file');
    assert.match(result.pruneError.message, /delete denied/);
    assert.match(savedStates[savedStates.length - 1].lastError, /cleanup failed/);
}

async function assertConcurrentUploadRejected() {
    const manager = new DriveBackupManager(storage);
    let releaseUpload;
    manager.assertAvailable = () => {};
    manager.uploadMultipart = async () => new Promise(resolve => {
        releaseUpload = () => resolve({ id: 'first_upload' });
    });
    manager.saveState = async partial => ({ deviceId: 'device_a', ...partial });
    manager.pruneSnapshotsForDevice = async () => {};

    const draft = {
        json: '{}',
        sizeBytes: 2,
        createdAt: '2026-05-16T10:00:00.000Z',
        metadata: {}
    };
    const firstUpload = manager.uploadSnapshotDraft(draft);
    await assert.rejects(
        () => manager.uploadSnapshotDraft(draft),
        /already in progress/
    );
    releaseUpload();
    await firstUpload;
}

async function assertDeleteRefreshFailureDoesNotFailDelete() {
    const manager = new DriveBackupManager(storage);
    const savedErrors = [];
    let deletedId = '';
    manager.deleteSnapshot = async id => {
        deletedId = id;
        return true;
    };
    manager.listSnapshots = async () => {
        throw new Error('list unavailable');
    };
    manager.setLastError = async error => {
        savedErrors.push(error.message);
        return {};
    };

    const result = await manager.deleteSnapshotAndList('file_to_delete', {});
    assert.strictEqual(deletedId, 'file_to_delete');
    assert.strictEqual(result.deleted, true);
    assert.strictEqual(result.snapshots, null);
    assert.match(result.listError.message, /list unavailable/);
    assert.match(savedErrors[0], /Backup deleted, but list refresh failed/);
}

function assertAvailabilityStatusReasons() {
    const oldChrome = global.chrome;
    const oldFetch = global.fetch;
    const manager = new DriveBackupManager(storage);

    try {
        global.fetch = async () => ({ ok: true });
        global.chrome = {
            runtime: {
                getManifest: () => ({
                    oauth2: {
                        client_id: '000000000000-00000000000000000000000000000000.apps.googleusercontent.com'
                    }
                })
            },
            identity: {
                getAuthToken: async () => 'token'
            },
            storage: {
                local: {}
            }
        };
        let status = manager.getAvailabilityStatus();
        assert.strictEqual(status.apiAvailable, true);
        assert.strictEqual(status.oauthConfigured, false);
        assert.strictEqual(status.reason, 'oauthMissing');

        global.chrome = {
            runtime: {
                getManifest: () => ({
                    oauth2: {
                        client_id: '123456789012-realclient.apps.googleusercontent.com'
                    }
                })
            },
            storage: {
                local: {}
            }
        };
        status = manager.getAvailabilityStatus();
        assert.strictEqual(status.apiAvailable, false);
        assert.strictEqual(status.oauthConfigured, true);
        assert.strictEqual(status.reason, 'identityUnavailable');
    } finally {
        global.chrome = oldChrome;
        global.fetch = oldFetch;
    }
}

assert.strictEqual(DriveBackupManager.normalizeDeviceName('  Work   Laptop  '), 'Work Laptop');
assert.strictEqual(DriveBackupManager.normalizeDeviceName('\n\t', ''), 'This device');
assert.strictEqual(DriveBackupManager.normalizeDeviceName('x'.repeat(80)).length, 48);
assert.strictEqual(DriveBackupManager.slugifyDeviceName('Work Laptop / Home'), 'work-laptop-home');

const migratedState = drive.normalizeState({
    deviceId: 'device_home',
    deviceName: 'Home Computer'
});
assert.strictEqual(migratedState.deviceId, 'device_home');
assert.strictEqual(migratedState.activeDeviceId, 'device_home');
assert.strictEqual(migratedState.knownDevices.length, 1);
assert.strictEqual(migratedState.knownDevices[0].name, 'Home Computer');

const multiDeviceState = drive.normalizeState({
    deviceId: 'device_home',
    deviceName: 'Home Computer',
    activeDeviceId: 'device_office',
    knownDevices: [
        { id: 'device_home', name: 'Home Computer' },
        { id: 'device_office', name: 'Office Computer' }
    ]
});
assert.strictEqual(multiDeviceState.deviceId, 'device_office');
assert.strictEqual(multiDeviceState.deviceName, 'Office Computer');
assert.deepStrictEqual(
    multiDeviceState.knownDevices.map(profile => profile.name),
    ['Home Computer', 'Office Computer']
);

const modernSnapshot = drive.parseSnapshotFile({
    id: 'file_1',
    name: 'local-itab-backup.work.20260516-100000.snapshot_test.json',
    size: '12345',
    createdTime: '2026-05-16T10:00:00.000Z',
    appProperties: {
        app: 'local-itab',
        type: 'backupSnapshot',
        schemaVersion: '1',
        deviceId: 'device_test',
        deviceName: 'Work Laptop',
        snapshotId: 'snapshot_test',
        shortcutCount: '12',
        localImagesIncluded: 'true',
        dataUrlIcons: '3'
    }
});
assert.strictEqual(modernSnapshot.id, 'file_1');
assert.strictEqual(modernSnapshot.deviceId, 'device_test');
assert.strictEqual(modernSnapshot.shortcutCount, 12);
assert.strictEqual(modernSnapshot.localImagesIncluded, true);
assert.strictEqual(modernSnapshot.isMalformed, false);

const oldSnapshot = drive.parseSnapshotFile({
    id: 'file_old',
    name: 'local-itab-backup.old-device.20250102-030405.snapshot_old.json',
    size: '42'
});
assert.strictEqual(oldSnapshot.id, 'file_old');
assert.strictEqual(oldSnapshot.deviceId, 'unknown');
assert.strictEqual(oldSnapshot.snapshotId, 'snapshot_old');
assert.match(oldSnapshot.createdTime, /^2025-/);
assert.strictEqual(oldSnapshot.isMalformed, true);

const malformedSnapshot = drive.parseSnapshotFile({ id: 'bad', appProperties: { app: 'other' } });
assert.strictEqual(malformedSnapshot.id, 'bad');
assert.strictEqual(malformedSnapshot.isMalformed, true);

const snapshots = [
    { id: 'a-new', deviceId: 'device_a', createdTime: '2026-05-16T10:00:00.000Z' },
    { id: 'a-mid', deviceId: 'device_a', createdTime: '2026-05-15T10:00:00.000Z' },
    { id: 'a-old', deviceId: 'device_a', createdTime: '2026-05-14T10:00:00.000Z' },
    { id: 'b-old', deviceId: 'device_b', createdTime: '2026-05-13T10:00:00.000Z' }
];
assert.deepStrictEqual(
    drive.selectPrunableSnapshots(snapshots, 'device_a', 2).map(snapshot => snapshot.id),
    ['a-old']
);

const groupedSnapshots = drive.groupSnapshotsByDevice([
    { id: 'home-new', deviceId: 'device_home', deviceName: 'Old Home Name', createdTime: '2026-05-16T10:00:00.000Z' },
    { id: 'office-new', deviceId: 'device_office', deviceName: 'Office Computer', createdTime: '2026-05-15T10:00:00.000Z' }
], [
    { id: 'device_home', name: 'Home Computer' },
    { id: 'device_office', name: 'Office Computer' },
    { id: 'device_travel', name: 'Travel Computer' }
]);
assert.deepStrictEqual(groupedSnapshots.map(group => group.deviceId), ['device_home', 'device_office', 'device_travel']);
assert.strictEqual(groupedSnapshots[0].deviceName, 'Home Computer');
assert.strictEqual(groupedSnapshots[0].snapshots[0].id, 'home-new');
assert.strictEqual(groupedSnapshots[2].snapshots.length, 0);

async function assertDeviceProfilesCanBeAddedSelectedAndRenamed() {
    const manager = new DriveBackupManager(storage);
    let raw = {
        deviceId: 'device_home',
        deviceName: 'Home Computer',
        knownDevices: [
            { id: 'device_home', name: 'Home Computer' }
        ]
    };
    manager.getRawState = async () => raw;
    manager.saveState = async partial => {
        raw = manager.normalizeState({ ...raw, ...partial });
        return raw;
    };

    let state = await manager.addDevice('Office Computer');
    assert.strictEqual(state.deviceName, 'Office Computer');
    assert.strictEqual(state.knownDevices.length, 2);
    assert.strictEqual(state.deviceCreated, true);

    const officeId = state.deviceId;
    state = await manager.addDevice('Office Computer');
    assert.strictEqual(state.deviceId, officeId);
    assert.strictEqual(state.deviceCreated, false);

    state = await manager.renameDevice('Office Laptop');
    assert.strictEqual(state.deviceId, officeId);
    assert.strictEqual(state.deviceName, 'Office Laptop');
    assert.strictEqual(state.knownDevices.find(profile => profile.id === officeId).name, 'Office Laptop');

    state = await manager.selectDevice('device_home');
    assert.strictEqual(state.deviceId, 'device_home');
    assert.strictEqual(state.deviceName, 'Home Computer');

    await assert.rejects(
        () => manager.selectDevice('missing_device'),
        /not found/
    );
}

(async () => {
    await assertSkipSyncSideEffects();
    await assertProviderStateReadFailureStopsRestorePreparation();
    await assertPruneFailureDoesNotFailUpload();
    await assertConcurrentUploadRejected();
    await assertDeleteRefreshFailureDoesNotFailDelete();
    await assertDeviceProfilesCanBeAddedSelectedAndRenamed();
    assertAvailabilityStatusReasons();

    const deleted = [];
    drive.listSnapshots = async () => snapshots;
    drive.deleteSnapshot = async id => {
        deleted.push(id);
        return true;
    };
    await drive.pruneSnapshotsForDevice('device_a', 2, {});
    assert.deepStrictEqual(deleted, ['a-old']);
    console.log('drive backup tests ok');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
