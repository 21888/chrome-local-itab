// Each fault and restart runs in a separate 512 MiB process, serially.
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
for (const workspace of [false, true]) for (const mode of ['drop', 'corrupt', 'schema', 'generation', 'layout', 'recovery', 'readfail', 'reject', 'after', 'success', 'reorder']) {
    test(`${workspace ? 'workspace' : 'compatibility'} layout verifies ${mode} and preserves raw state`, () => {
        const checkpoint = run({ workspace, mode, phase: 'fault' });
        // Altered recovery is intentionally untrustworthy; no repair is attempted.
        if (!['recovery', 'generation', 'layout', 'schema'].includes(mode)) run(checkpoint);
    });
}
