const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
const api = require('../shared/update-checker');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = fs.readFileSync('shared/update-view.js', 'utf8');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness(locale = 'en') {
    const document = createDocument(); document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
    const host = document.createElement('section'); host.id = 'version-update-settings'; document.body.append(host);
    const fields = {};
    for (const [id, tag] of Object.entries({'update-current-version':'dd','update-automatic':'input','update-check':'button','update-status':'p',
        'update-latest-version':'dd','update-last-checked':'dd','update-release-link':'a','update-ignore':'button'})) {
        fields[id] = document.createElement(tag); fields[id].id = id; host.append(fields[id]);
    }
    for (const kind of ['unpacked', 'store', 'managed', 'unknown']) { const node = document.createElement('p'); node.dataset.updateInstall = kind; host.append(node); }
    const draft = document.createElement('input'); draft.value = 'UNSAVED_WORLD_CLOCK'; document.body.append(draft);
    const privateController = {draft: 'PRIVATE_DRAFT'};
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const window = {document, LocalItabUpdates: {...api, installation: async () => 'unpacked'}, privateController,
        i18n: {t(key, values = []) { assert(catalog[key], `missing ${locale} ${key}`); return catalog[key].message.replace('$version$', values[0] || ''); }}};
    vm.runInNewContext(source, {window, Intl});
    let state = api.initial(), manualChecks = 0, noticeClaims = 0, busy = null;
    const listeners = new Set(); const emit = () => { for (const listener of listeners) listener(); };
    const checker = {currentVersion:'1.1.10', read:async () => ({...state}), subscribe(fn) {listeners.add(fn);return()=>listeners.delete(fn);},
        async check({automatic = false} = {}) { if (automatic) return {status:'skipped'}; manualChecks++; if (busy) await busy.promise;
            state.latest = {tag:'v1.1.11',version:'1.1.11'}; state.lastSuccess=1720000000000; emit(); return {status:'available'}; },
        async setAutomatic(enabled) {state.automatic=enabled;emit();}, async ignore(version) {state.ignoredVersion=version;emit();},
        async claimNotice() {if (!state.automatic || state.ignoredVersion || noticeClaims) return null; noticeClaims++; return state.latest;}};
    return {document, window, host, fields, draft, privateController, checker, api:window.LocalItabUpdateViews, state,
        setBusy(value) {busy=value;}, get checks(){return manualChecks;}, get claims(){return noticeClaims;}};
}
test('successful manual UI, fixed release link and ignore work in both languages without touching unrelated drafts', async () => {
    for (const locale of ['en','zh_CN']) {
        const h = harness(locale), view = h.api.mountSettings(h.host,h.checker); await view.ready;
        assert.equal(h.api.mountSettings(h.host,h.checker),view); assert.equal(h.fields['update-current-version'].textContent,'1.1.10');
        assert.equal(h.fields['update-automatic'].checked,false);
        const gate=deferred();h.setBusy(gate);h.fields['update-check'].dispatch('click');h.fields['update-check'].dispatch('click');
        assert.equal(h.checks,1);gate.resolve();await flush();
        assert.equal(h.fields['update-latest-version'].textContent,'1.1.11');
        assert.equal(h.fields['update-release-link'].href,`${api.REPOSITORY}/releases/tag/v1.1.11`);
        assert.equal(h.fields['update-release-link'].hidden,false); assert.equal(h.fields['update-ignore'].hidden,false);
        h.fields['update-ignore'].dispatch('click');await flush();assert.equal(h.state.ignoredVersion,'1.1.11');assert.equal(h.fields['update-ignore'].disabled,true);
        h.fields['update-automatic'].checked=true;h.fields['update-automatic'].dispatch('change');await flush();assert.equal(h.state.automatic,true);
        assert.equal(h.draft.value,'UNSAVED_WORLD_CLOCK'); assert.equal(h.window.privateController,h.privateController);
        assert(h.host.querySelector('[data-update-install="store"]').hidden);assert(!h.host.querySelector('[data-update-install="unpacked"]').hidden);
        assert(h.fields['update-check'].dispatch('keydown',{key:'Enter',repeat:true}).prevented);
        view.destroy();
    }
});
test('notice stays hidden by default, displays only a claimed release, ignores it and leaves other page content alone', async () => {
    const h=harness(), notice=()=>{const host=h.document.createElement('aside');host.hidden=true;
        const link=h.document.createElement('a');link.href='options.html#version-update-settings';link.target='_blank';host.append(link,h.document.createElement('button'));h.document.body.append(host);return host;};
    const first=notice();await h.api.mountNotice(first,h.checker).ready;assert(first.hidden);assert.equal(h.claims,0);
    h.state.automatic=true;h.state.latest={tag:'v1.1.11',version:'1.1.11'};
    const second=notice();await h.api.mountNotice(second,h.checker).ready;assert(!second.hidden);assert.match(second.querySelector('a').textContent,/1\.1\.11/);
    const third=notice();await h.api.mountNotice(third,h.checker).ready;assert(third.hidden);assert.equal(h.claims,1);
    second.querySelector('button').dispatch('click');await flush();assert(second.hidden);assert.equal(h.state.ignoredVersion,'1.1.11');
    assert.equal(h.draft.value,'UNSAVED_WORLD_CLOCK');
});
test('failed manual check keeps cached version/timestamp and shows a local error without rendering remote markup', async () => {
    const h=harness();h.state.latest={tag:'v1.1.11',version:'1.1.11'};h.state.lastSuccess=1720000000000;
    h.checker.check=async()=>({status:'timeout'});
    const view=h.api.mountSettings(h.host,h.checker);await view.ready;const before=h.fields['update-last-checked'].textContent;
    h.fields['update-check'].dispatch('click');await flush();
    assert.match(h.fields['update-status'].textContent,/did not respond/);assert.equal(h.fields['update-latest-version'].textContent,'1.1.11');
    assert.equal(h.fields['update-last-checked'].textContent,before);assert.equal(h.fields['update-check'].disabled,false);
    assert(!source.includes('innerHTML')); assert.equal(h.draft.value,'UNSAVED_WORLD_CLOCK');
});
