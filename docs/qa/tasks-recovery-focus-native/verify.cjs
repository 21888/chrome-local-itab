// Offline comparisons of synthetic native browser downloads. No browser access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name + '.json'), 'utf8'));
const sameData = (actual, expected) => {
  assert.deepEqual(actual.content, expected.content);
  assert.deepEqual(actual.recovery, expected.recovery);
};
const stripVersions = content => ({
  pinnedId: content.pinnedId,
  records: content.records.map(({ version, ...record }) => record)
});
const baseline = read('baseline');
const recovered = read('after-recovery');
const candidateBefore = read('candidate-before');
const candidateAfter = read('candidate-after-recovery');
sameData(read('after-cancel'), baseline);
sameData(read('after-refusal'), baseline);
assert.equal(baseline.content.records.length, 5);
assert.equal(baseline.content.records.at(-1).text, 'native destination sentinel');
assert.equal(baseline.recovery.length, 8);
assert.deepEqual(baseline.recovery, read('tasks-full-eight').recovery);
const targetB = baseline.recovery[0];
assert.deepEqual(stripVersions(recovered.content), stripVersions(targetB.content));
assert(recovered.content.records.every((record, i) => record.version !== targetB.content.records[i].version));
assert.deepEqual(recovered.recovery.slice(0, 7), baseline.recovery.slice(1));
assert.deepEqual(recovered.recovery[7].content, baseline.content);
assert.equal(recovered.recovery.length, 8);
sameData(candidateBefore, recovered);
sameData(read('candidate-after-refusal'), candidateBefore);
const targetA = candidateBefore.recovery[7];
assert.deepEqual(stripVersions(candidateAfter.content), stripVersions(targetA.content));
assert(candidateAfter.content.records.every((record, i) => record.version !== targetA.content.records[i].version));
assert.deepEqual(candidateAfter.recovery.slice(0, 7), candidateBefore.recovery.slice(0, 7));
assert.deepEqual(candidateAfter.recovery[7].content, candidateBefore.content);
assert.equal(candidateAfter.recovery.length, 8);
for (const item of read('source-hashes').files) {
  const bytes = fs.readFileSync(path.join(__dirname, item.file));
  assert.equal(bytes.length, item.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), item.sha256);
}
console.log('PASS: cancel/refusal unchanged; baseline and candidate recovery preserve seven other copies and exact prior destination; native evidence hashes match.');
