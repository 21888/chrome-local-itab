const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/dashboard-harness');
const read = path => fs.readFileSync(path, 'utf8');

function harness(template = 'clarity') {
    const document = createDocument();
    document.documentElement.dataset.dashboardTemplate = template;
    const create = (tag, id, parent) => { const node = document.createElement(tag); node.id = id; parent.append(node); return node; };
    const tools = create('details', 'dashboard-tools-disclosure', document.body);
    const toolsSummary = create('summary', '', tools);
    const tool = create('button', 'ai-context-entry', tools);
    const appearance = create('details', 'dashboard-appearance-disclosure', document.body);
    const appearanceSummary = create('summary', '', appearance);
    const host = create('div', 'dashboard-appearance', appearance);
    const select = create('select', '', host);
    const gallery = create('button', '', host);
    tools.open = appearance.open = true;
    const observers = [];
    class Observer {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe(target, options) { this.target = target; this.options = options; }
        disconnect() { this.disconnected = true; }
    }
    const window = { document, MutationObserver: Observer };
    vm.runInNewContext(read('shared/clarity-dashboard.js'), { window });
    const notify = target => observers.filter(observer => observer.target === target).forEach(observer => observer.callback());
    const mode = value => { document.documentElement.dataset.dashboardTemplate = value; notify(document.documentElement); };
    const status = value => { host.dataset.saveState = value; notify(host); };
    return { window, document, tools, toolsSummary, tool, appearance, appearanceSummary, host, select, gallery, observers, mode, status };
}

test('Clarity starts compact while original controls, listeners and native semantics remain intact', () => {
    const h = harness();
    assert.equal(h.tools.open, false); assert.equal(h.appearance.open, false);
    assert.equal(h.tool.parentElement, h.tools); assert.equal(h.select.parentElement, h.host);
    assert.equal(h.document.activeElement, h.document.body);
    assert.deepEqual(h.observers.map(observer => Array.from(observer.options.attributeFilter)), [['data-dashboard-template'], ['data-save-state']]);
    let activated = 0; h.tool.addEventListener('click', () => activated++);
    h.tools.open = true; h.tool.dispatch('click');
    assert.equal(activated, 1);
});

test('all other templates retain expanded controls and returning to Clarity preserves owned focus', () => {
    const registry = require('../shared/dashboard-template-registry');
    for (const template of registry.ids.filter(id => id !== 'clarity')) {
        const h = harness(template);
        assert.equal(h.tools.open, true, template); assert.equal(h.appearance.open, true, template);
        h.select.focus(); h.mode('clarity');
        assert.equal(h.appearance.open, true); assert.equal(h.document.activeElement, h.select);
        assert.equal(h.tools.open, false);
        h.mode(template); assert.equal(h.tools.open, true);
    }
});

test('explicit Clarity disclosure choices survive a template round trip without saved preferences', () => {
    const h = harness(); h.tools.open = true; h.tools.dispatch('toggle');
    h.mode('graphite'); h.mode('clarity'); assert.equal(h.tools.open, true);
    h.tools.open = false; h.tools.dispatch('toggle'); h.mode('folio'); h.mode('clarity');
    assert.equal(h.tools.open, false);
    assert.doesNotMatch(read('shared/clarity-dashboard.js'), /(?:storageManager|chrome\.storage|localStorage|\.append(?:Child)?\(|\.replaceChildren\()/);
});

test('save, failure and live-preview feedback opens its original host without stealing focus', () => {
    for (const state of ['saving', 'saved', 'error', 'preview', 'preview-loading', 'preview-saving', 'preview-restoring', 'preview-blocked', 'preview-saved']) {
        const h = harness(); h.tool.focus(); h.status(state);
        assert.equal(h.appearance.open, true, state); assert.equal(h.document.activeElement, h.tool, state);
        if (['saving', 'error', 'preview', 'preview-loading', 'preview-saving', 'preview-restoring', 'preview-blocked'].includes(state)) {
            h.appearance.open = false; h.appearance.dispatch('toggle');
            assert.equal(h.appearance.open, true, 'unresolved status stays visible: ' + state);
        }
    }
});

test('Escape restores summary focus but does not consume native input, IME, nested gallery or preview Escape', () => {
    const h = harness(); h.tools.open = true; h.tool.focus();
    const escape = h.tool.dispatch('keydown', { key: 'Escape' });
    assert.equal(escape.prevented, true); assert.equal(h.tools.open, false); assert.equal(h.document.activeElement, h.toolsSummary);
    h.appearance.open = true; h.select.focus();
    assert.equal(h.select.dispatch('keydown', { key: 'Escape' }).prevented, false);
    assert.equal(h.appearance.open, true); assert.equal(h.document.activeElement, h.select);
    assert.equal(h.gallery.dispatch('keydown', { key: 'Escape', defaultPrevented: true }).prevented, false);
    assert.equal(h.gallery.dispatch('keydown', { key: 'Escape', isComposing: true }).prevented, false);
    h.status('preview'); assert.equal(h.gallery.dispatch('keydown', { key: 'Escape' }).prevented, false);
    assert.equal(h.appearance.open, true);
});

test('markup keeps stable entry IDs, original recovery link and explicit runtime dependency order', () => {
    const html = read('newtab.html');
    for (const id of ['dashboard-appearance', 'workspace-switcher', 'open-options', 'ai-context-entry', 'category-list', 'search-container', 'shortcuts-container']) {
        assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
    }
    assert.match(html, /<details id="dashboard-appearance-disclosure"[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?id="dashboard-appearance"[\s\S]*?<\/details>/);
    assert.match(html, /href="recovery.html"[^>]*>Inspect saved copies \(read-only\)<\/a>/);
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
    assert(links.indexOf('dashboard-template-gallery.css') < links.indexOf('vendor/bulma/clarity-components.css'));
    assert(links.indexOf('vendor/bulma/clarity-components.css') < links.indexOf('clarity-dashboard.css'));
    assert(links.indexOf('clarity-dashboard.css') < links.indexOf('dashboard-customization.css'));
    const packager = read('tools/package_extension.py');
    for (const file of ['vendor/bulma/clarity-components.css', 'vendor/bulma/LICENSE', 'vendor/bulma/PROVENANCE.json', 'clarity-dashboard.css', 'shared/clarity-dashboard.js']) assert(packager.includes('"' + file + '"'));
});

test('bridge scopes geometry to Clarity, preserves variable columns/free-layout and leaves customization last', () => {
    const css = read('clarity-dashboard.css');
    assert.match(css, /--template-nav-width: 208px;/);
    assert.match(css, /--template-column-gap: 32px;/);
    assert.match(css, /grid-template-columns: repeat\(var\(--shortcuts-columns, 6\), minmax\(0, 1fr\)\);/);
    assert.doesNotMatch(css, /#shortcuts-grid\.free-layout|--dashboard-padding-(?:top|right|bottom|left)\s*:|!important|@import|https?:\/\//);
    assert.match(css, /#shortcuts-grid:not\(\.free-layout\):not\(\.columns-fixed\)/);
    assert.match(css, /body:not\(\.dashboard-hidden\) #dashboard \.dashboard-header/);
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)) {
        const selector = match[1].trim();
        if (!selector.startsWith('@')) assert(selector.includes('[data-dashboard-template="clarity"]'), selector);
    }
});


test('mount is idempotent and destroy removes listeners and observers before a fresh mount', () => {
    const h = harness();
    const first = h.window.LocalItabClarityDashboard.mount(h.document);
    const second = h.window.LocalItabClarityDashboard.mount(h.document);
    assert.equal(first, second); assert.equal(h.observers.length, 2);
    assert.equal(h.tools.listeners.get('toggle').length, 1);
    first.destroy();
    assert(h.observers.every(observer => observer.disconnected));
    assert.equal(h.tools.listeners.get('toggle').length, 0);
    assert.equal(h.appearance.listeners.get('keydown').length, 0);
    h.tools.open = true; h.mode('graphite'); h.mode('clarity');
    assert.equal(h.tools.open, true, 'retired callbacks do nothing');
    const fresh = h.window.LocalItabClarityDashboard.mount(h.document);
    assert.notEqual(fresh, first); assert.equal(h.tools.listeners.get('toggle').length, 1);
    first.destroy(); assert.equal(h.window.LocalItabClarityDashboard.mount(h.document), fresh, 'retired destroy cannot evict a fresh mount');
});

test('narrow search explicitly overrides the legacy full-row submit without disturbing custom fields', () => {
    const css = read('clarity-dashboard.css');
    const narrow = css.slice(css.indexOf('@media (max-width: 620px)'));
    assert.match(read('dashboard-templates.css'), /\.search-submit\s*\{\s*grid-column: 1 \/ -1;/);
    assert.match(narrow, /\.search-engine-select\s*\{[^}]*grid-column: 1 \/ -1;/);
    assert.match(narrow, /\.search-input\s*\{\s*grid-column: 1;/);
    assert.match(narrow, /\.search-submit\s*\{[^}]*grid-column: 2;/);
    assert.match(css, /#shortcuts-grid:not\(\.free-layout\) > \.shortcut-item/);
});

test('custom wallpaper readable surfaces survive the flattened header without changing preferences', () => {
    const css = read('clarity-dashboard.css');
    const safe = css.match(/:root\[data-dashboard-template="clarity"\]\[data-custom-background="true"\] #dashboard :is\(\.template-intro, #clock-container, #workspace-switcher\)\s*\{([^}]+)\}/);
    assert(safe);
    for (const declaration of ['--text-primary: var(--template-text)', '--text-secondary: var(--template-muted)', 'background: var(--template-surface)', 'box-shadow: 0 0 0 8px var(--template-surface)']) assert(safe[1].includes(declaration));
    assert.doesNotMatch(safe[1], /padding:|margin:|position:|opacity:|--custom-background:/);
});

test('Bulma output is pinned official source, scoped modules, locally linked, and hash-verifiable', () => {
    const crypto = require('node:crypto');
    const sha = path => crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
    const provenance = JSON.parse(read('vendor/bulma/PROVENANCE.json'));
    assert.equal(provenance.version, '1.0.4'); assert.equal(provenance.compiler.version, '1.86.3');
    assert.equal(provenance.license, 'MIT'); assert.match(read('vendor/bulma/LICENSE'), /Permission is hereby granted/);
    assert.equal(sha('vendor/bulma/LICENSE'), provenance.license_sha256);
    assert.equal(sha(provenance.entrypoint), provenance.entrypoint_sha256);
    assert.equal(sha(provenance.output), provenance.output_sha256);
    assert.equal(Object.keys(provenance.upstream_sources).length, 16);
    for (const [path, hash] of Object.entries(provenance.upstream_sources)) assert.equal(sha(path), hash, path);
    const css = read(provenance.output);
    for (const component of ['button', 'input', 'box', 'title', 'menu-list']) assert(css.includes('.itab-b-' + component));
    assert.doesNotMatch(css, /data-theme|prefers-color-scheme|@import|@font-face|url\(|https?:\/\/|\.modal/);
    for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
        const rule = selector.trim();
        if (!rule.startsWith('@media')) assert(rule.startsWith(':where(:root[data-dashboard-template=clarity]'), rule);
    }
    const entry = read(provenance.entrypoint);
    for (const module of provenance.modules) assert(entry.includes('meta.load-css("' + module + '"'));
    assert.match(entry, /light\.light-theme/); assert.match(entry, /dark\.dark-theme/); assert.match(entry, /setup\.setup-theme/);
});


test('both disclosure opening orders keep both panels in normal flow even after outside focus', () => {
    for (const first of ['tools', 'appearance']) {
        const h = harness(); const second = first === 'tools' ? 'appearance' : 'tools';
        h[first].open = true; h[first].dispatch('toggle');
        h[second].open = true; h[second].dispatch('toggle');
        h.document.body.focus();
        assert.equal(h.tools.open, true); assert.equal(h.appearance.open, true);
        h.status('error');
        assert.equal(h.tools.open, true); assert.equal(h.appearance.open, true);
    }
    const css = read('clarity-dashboard.css');
    const panel = css.match(/#dashboard \.clarity-disclosure-panel\s*\{([^}]+)\}/)[1];
    assert.match(panel, /position: static;/); assert.doesNotMatch(panel, /inset|z-index/);
    assert.match(css, /\.clarity-disclosure\[open\]\s*\{\s*flex: 1 1 280px;/);
    assert.match(css, /#dashboard:has\(\.clarity-disclosure\[open\]\) \.settings-nav\s*\{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 2;/);
});

test('Clarity natural row sizing cancels the legacy tall-screen fractional search row', () => {
    assert.match(read('newtab.css'), /grid-template-rows: auto auto minmax\(0, 1fr\) auto;/);
    const rule = read('clarity-dashboard.css').match(/body:not\(\.dashboard-hidden\) #dashboard > \.main-content-wrapper\s*\{([^}]+)\}/)[1];
    assert.match(rule, /grid-template-rows: none;/); assert.match(rule, /grid-auto-rows: auto;/); assert.match(rule, /align-content: start;/);
});

test('390 and 600px month-calendar open/closed retain distinct configuration, heading, clock and search rows', () => {
    const css = read('clarity-dashboard.css');
    const calendar = css.slice(css.indexOf('@media (max-width: 600px)'));
    const old = read('local-month-calendar.css');
    assert.match(old, /\.dashboard-header:has\(\.month-calendar\[open\]\) \.template-intro \{[^}]*grid-row: 2;/);
    // The added body:not(.dashboard-hidden) increases specificity over the later
    // legacy rule; this source contract is not browser geometry validation.
    for (const width of [390, 600]) {
        assert(width <= 600);
        assert.match(calendar, /body:not\(\.dashboard-hidden\) #dashboard \.dashboard-header:has\(\.month-calendar\[open\]\) \.template-intro \{[^}]*grid-row: 3;/);
        assert.match(calendar, /body:not\(\.dashboard-hidden\) #dashboard \.dashboard-header:has\(\.month-calendar\[open\]\) #clock-container \{[^}]*grid-row: 4;/);
        const narrow = css.slice(css.indexOf('@media (max-width: 620px)'), css.indexOf('@media (max-width: 420px)'));
        assert.match(narrow, /#clock-container \{[^}]*grid-row: 4;/);
        assert.match(narrow, /#search-container \{[^}]*grid-row: 5;/);
        assert.match(narrow, /\.dashboard-main \{[^}]*grid-row: 6;/);
    }
});


test('legacy saved image/color wallpapers retain safe workspace, intro and clock surfaces too', () => {
    const css = read('clarity-dashboard.css');
    assert.match(css, /body:is\(\.bg-color, \.bg-image\) #dashboard :is\(\.template-intro, #clock-container, #workspace-switcher\)\s*\{[^}]*background: var\(--template-surface\);/);
});
test('narrow Clarity clock uses its full grid row without changing desktop or other templates', () => {
    const css = read('clarity-dashboard.css');
    const narrow = css.slice(css.indexOf('@media (max-width: 620px)'), css.indexOf('@media (max-width: 420px)'));
    const selector = ':root[data-dashboard-template="clarity"] #dashboard #clock-container';
    const rule = narrow.slice(narrow.indexOf(selector)).match(/^[^{]+\{([^}]+)\}/)[1];
    const accepts = body => /(?:^|;)\s*width: 100%;/.test(body);
    assert(accepts(rule), 'the clock must fill its existing full-width row');
    assert.equal(accepts(rule.replace('width: 100%;', '')), false, 'removing only the width must fail');
    for (const declaration of ['grid-column: 1 / -1;', 'grid-row: 4;', 'justify-self: start;', 'text-align: start;']) assert(rule.includes(declaration));
    const desktop = css.slice(0, css.indexOf('@media')).match(/#clock-container \{([^}]+)\}/)[1];
    assert.match(desktop, /grid-column: 2;/); assert.doesNotMatch(desktop, /width:/);
});

test('narrow Clarity date overrides the 135px legacy cap and keeps normal wrapping', () => {
    const css = read('clarity-dashboard.css');
    const narrow = css.slice(css.indexOf('@media (max-width: 620px)'), css.indexOf('@media (max-width: 420px)'));
    assert.match(read('dashboard-templates.css'), /\.date-display \{[^}]*max-width: 135px;/);
    const rule = narrow.match(/:root\[data-dashboard-template="clarity"\] #dashboard \.date-display \{([^}]+)\}/);
    assert(rule, 'Clarity must override the legacy narrow date cap locally');
    const accepts = body => /(?:^|;)\s*max-width: 100%;/.test(body);
    assert(accepts(rule[1]));
    assert.equal(accepts(rule[1].replace('max-width: 100%;', '')), false, 'removing only the cap override must fail');
    assert.doesNotMatch(rule[1], /white-space:|overflow:|text-overflow:|font-size:|display:|height:/);
});


test('Clarity quote-only mode hides only the search row while keeping the workspace recovery bar reachable', () => {
    const css = read('clarity-dashboard.css');
    const selector = ':root[data-dashboard-template="clarity"] body.dashboard-hidden #dashboard #search-container';
    const block = css.slice(css.indexOf(selector)).match(/^[^{]+\{([^}]+)\}/);
    assert(css.includes(selector) && block, 'the independent search row must obey Clarity quote-only mode');
    assert.match(block[1], /display: none;/);
    assert.equal(block[1].replace('display: none;', '').trim(), '', 'visibility-only rule does not restyle or reposition content');
    assert.match(read('workspaces.css'), /body\.dashboard-hidden #workspace-switcher \{[^}]*position: fixed;[^}]*inset-block-start: 16px;/);
    assert.doesNotMatch(css, /body\.dashboard-hidden[^{}]*(?:workspace-switcher|workspace-bar)[^{}]*\{[^}]*display: none/);
});

test('quote-only exit is a real localized button shown only in Clarity hidden mode', () => {
    const html = read('newtab.html'), css = read('clarity-dashboard.css');
    assert.match(html, /<button[^>]*id="show-dashboard"[^>]*type="button"[^>]*data-i18n="showDashboard"[^>]*>Show dashboard<\/button>/);
    assert.match(read('newtab.css'), /#show-dashboard\s*\{\s*display: none;\s*\}/);
    assert.match(css, /:root\[data-dashboard-template="clarity"\] body\.dashboard-hidden #dashboard #show-dashboard\s*\{\s*display: inline-flex;\s*\}/);
    assert.equal(JSON.parse(read('_locales/en/messages.json')).showDashboard.message, 'Show dashboard');
    assert.equal(JSON.parse(read('_locales/zh_CN/messages.json')).showDashboard.message, '显示主界面');
});
