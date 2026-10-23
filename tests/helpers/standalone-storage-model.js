const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');

// Explicit CommonJS legacy-storage model for isolated Settings control tests.
// This does not simulate browser workspace startup; that boundary is exercised
// separately by workspace-bootstrap-storage.test.js with real script ordering.
module.exports = function loadStandaloneStorageModel(context) {
    const filename = path.resolve('storage.js');
    const load = vm.runInContext('(function(module, require) {\n' + fs.readFileSync(filename, 'utf8') +
        '\nwindow.StorageManager = StorageManager; window.storageManager = storageManager;\n})', context, {filename});
    load({exports: {}}, createRequire(filename));
};
