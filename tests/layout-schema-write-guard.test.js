// Unknown schemas may be inspected elsewhere, but must never become write baselines.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const child = path.join(__dirname, 'helpers/layout-readback-child.cjs');
function run(input) {
    const result = spawnSync(process.execPath, ['--max-old-space-size=512', child], {
        input: JSON.stringify(input), encoding: 'utf8', timeout: 20000
    });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return JSON.parse(result.stdout);
}
for (const schema of [99, 1, '2', null]) {
    test(`compatibility restart refuses mismatched identity schema ${JSON.stringify(schema)} without writes`, () => {
        const checkpoint = run({ workspace: false, mode: 'success', phase: 'fault' });
        checkpoint.raw.schemaVersion = schema;
        checkpoint.mode = 'schema';
        run(checkpoint);
    });
}
