// Offline verification of synthetic native downloads and unchanged evidence bytes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const bytes = name => fs.readFileSync(path.join(__dirname, name));
assert.deepEqual(bytes('newer-after-stale-preview.txt'), bytes('expected-newer.txt'));
assert.deepEqual(bytes('replacement-after-reload.txt'), bytes('replacement-fixture.txt'));
const metadata = JSON.parse(bytes('source-hashes.json'));
for (const file of metadata.files) {
  const content = bytes(file.file);
  assert.equal(content.length, file.bytes);
  assert.equal(crypto.createHash('sha256').update(content).digest('hex'), file.sha256);
}
console.log('PASS: both real TXT exports match expected bytes and all archived evidence hashes match.');
