const assert = require('assert');

const StorageManager = require('../storage.js');

const manager = new StorageManager();

function legacyChunkItemBytes(value) {
    return manager.getSyncItemBytes(`${manager.syncChunkPrefix}0`, value.slice(0, 7600));
}

const escapedHeavyPayload = JSON.stringify({
    links: [
        {
            title: '"'.repeat(3000) + '汉'.repeat(1800) + '🙂'.repeat(200),
            url: `https://example.com/search?q=${'\\'.repeat(1200)}`,
            icon: '🌐',
            category: 'work'
        }
    ]
});

assert(
    legacyChunkItemBytes(escapedHeavyPayload) > manager.getSyncItemQuotaBytes(),
    'legacy 7600-character chunks can exceed Chrome Sync per-item quota'
);

const chunks = manager.createSyncChunks(escapedHeavyPayload);
assert(chunks.length > 1, 'escaped-heavy payload should be split into multiple chunks');
assert.strictEqual(chunks.join(''), escapedHeavyPayload);

chunks.forEach((chunk, index) => {
    const key = `${manager.syncChunkPrefix}${index}`;
    assert(
        manager.getSyncItemBytes(key, chunk) <= manager.getSyncItemQuotaBytes(),
        `chunk ${index} should fit Chrome Sync per-item quota`
    );
});

assert.throws(
    () => manager.createSyncChunks('"'.repeat(200000)),
    /too many chunks|too large/,
    'oversized sync payloads should fail before chrome.storage.sync.set'
);

console.log('storage sync quota tests ok');
