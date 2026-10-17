const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const source = fs.readFileSync('newtab.js', 'utf8');
const tokyo = { timeZone: 'Asia/Tokyo', label: 'Tokyo' };
const newYork = { timeZone: 'America/New_York', label: 'New York' };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

// Actual shipped component, real Date/Intl under controlled process TZ and a
// bounded DOM/clipboard model. No native Chrome, layout, keyboard or IME claim.
function mount({ now = '2026-12-31T10:30:15.123Z', locale = 'en', clocks = [tokyo, newYork], clipboard } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.hidden = false;
    const header = document.createElement('header'); header.className = 'dashboard-header';
    const clockHost = document.createElement('section'); clockHost.id = 'clock-container';
    for (const id of ['time-display', 'date-display']) { const node = document.createElement('div'); node.id = id; clockHost.append(node); }
    header.append(clockHost);
    const main = document.createElement('main'); main.className = 'dashboard-main';
    const cards = document.createElement('section'); cards.id = 'info-cards-container';
    const host = document.createElement('article'); host.id = 'world-clocks-card'; host.className = 'info-card world-clocks-card';
    cards.append(host); main.append(cards); document.body.append(header, main);
    let stamp = Date.parse(now), nowReads = 0, timerCount = 0;
    const events = new Map(), timers = new Map(), calls = [], forbiddenCalls = [];
    let messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const forbidden = () => { forbiddenCalls.push('I/O'); throw Error('Unexpected I/O'); };
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [stamp])); }
        static now() { nowReads++; return stamp; }
    }
    const window = {
        i18n: { t(key, args = []) { return (messages[key]?.message || key).replace(/\$([1-9])/g, (_, n) => args[Number(n) - 1] ?? ''); } },
        navigator: { language: 'en-US', clipboard: clipboard || { writeText(text) { calls.push(text); return Promise.resolve(); }, readText: forbidden }, permissions: { query: forbidden } },
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }),
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); }
    };
    const context = vm.createContext({ document, window, navigator: window.navigator, Date: TestDate, Intl, console, i18n: window.i18n,
        chrome: { storage: new Proxy({}, { get: forbidden }), i18n: { getMessage: key => messages[key]?.message || '' } },
        fetch: forbidden, XMLHttpRequest: forbidden, localStorage: new Proxy({}, { get: forbidden }),
        setInterval(fn, delay) { assert.equal(delay, 1000); timers.set(++timerCount, fn); return timerCount; }, clearInterval(id) { timers.delete(id); }
    });
    for (const file of ['shared/world-clocks.js', 'shared/local-content-lifecycle.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    vm.runInContext(source + '\nthis.ClockComponent = ClockComponent;', context);
    context.applyModuleVisibility({ clock: true, search: false, shortcuts: false, weather: false, hot: false, movie: false });
    let clock = new context.ClockComponent({ hour12: false, showSeconds: true, worldClocks: clocks });
    return { document, window, context, host, cards, calls, events, timers, forbiddenCalls,
        get clock() { return clock; }, get view() { return clock.worldClockComparisonView; }, get nowReads() { return nowReads; }, get timerCount() { return timerCount; },
        at(iso) { stamp = Date.parse(iso); }, tick() { for (const fn of [...timers.values()]) fn(); },
        compare(minutes = 0) { if (!clock.worldClockComparison) this.view.toggle.dispatch('click'); this.view.range.value = String(minutes); this.view.range.dispatch('input'); return this.view; },
        remount() { clock.stop(); clock = new context.ClockComponent(clock.config); },
        locale(next) { messages = next ? JSON.parse(fs.readFileSync(`_locales/${next}/messages.json`, 'utf8')) : {}; },
        summary() { return clock.worldClockComparisonSummary(this.view); }
    };
}
function inZone(zone, fn) {
    const before = process.env.TZ; process.env.TZ = zone;
    try { return fn(); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
}
async function inZoneAsync(zone, fn) {
    const before=process.env.TZ; process.env.TZ=zone;
    try { return await fn(); } finally { if(before===undefined) delete process.env.TZ; else process.env.TZ=before; }
}
function step(h, direction = 1, fields) { return (direction < 0 ? h.view.previous24 : h.view.next24).dispatch('click', fields); }

test('explicit device-local time entry previews one new anchor only on activation', () => inZone('UTC', () => {
    const h = mount(); h.compare(75); step(h);
    assert(h.view.localInput && h.view.preview, 'comparison needs a device-local datetime input and Preview button');
    assert.equal(h.view.localInput.type, 'datetime-local'); assert.equal(h.view.localInput.step, '1');
    const state = {...h.clock.worldClockComparison};
    h.view.localInput.value = '2032-02-29T17:25:41'; h.view.localInput.dispatch('input');
    assert.deepEqual({...h.clock.worldClockComparison}, state);
    h.view.preview.dispatch('click');
    assert.equal(h.clock.worldClockComparison.anchor, Date.parse('2032-02-29T17:25:41Z'));
    assert.equal(h.clock.worldClockComparison.minutes, 0); assert.equal(h.clock.worldClockComparison.shiftMinutes, 0);
    assert.equal(h.clock.worldClockComparison.localEntry, true);
    assert.match(h.view.reference.textContent, /UTC.*GMT\+00:00/);
    assert.match(h.view.reference.textContent, /\+0 min from current comparison base/);
}));

const WorldClocks = require('../shared/world-clocks');
function edit(h, value) { h.view.localInput.value = value; h.view.localInput.dispatch('input'); }
function apply(h, value) { edit(h, value); h.view.preview.dispatch('click'); }

test('strict local parser accepts optional seconds, zeroes milliseconds and preserves years 0001–0099', () => inZone('UTC', () => {
    for (const [value, iso] of [
        ['2024-02-29T12:34', '2024-02-29T12:34:00.000Z'],
        ['2000-02-29T23:59:59', '2000-02-29T23:59:59.000Z'],
        ['0001-01-03T00:00', '0001-01-03T00:00:00.000Z'],
        ['0099-12-20T01:02:03', '0099-12-20T01:02:03.000Z'],
        ['9999-12-29T23:59:59', '9999-12-29T23:59:59.000Z']
    ]) {
        const date = WorldClocks.parseLocalDateTime(value); assert(date, value); assert.equal(date.toISOString(), iso);
        assert.equal(WorldClocks.localDateTimeValue(date), iso.slice(0, 19));
    }
    for (const value of ['', ' ', null, 2026, {}, '2026-01-01', '2026-01-01 01:02', '2026-01-01T01:02Z',
        '2026-01-01T01:02+01:00', '2026-01-01T01:02:03.001', '2026-01-01T24:00', '2026-01-01T23:59:60',
        '2026-01-01T1:02', '2026-00-01T01:02', '2026-13-01T01:02', '2026-01-00T01:02', '2026-01-32T01:02',
        '2026-02-29T01:02', '1900-02-29T01:02', '2026-04-31T01:02', '0000-01-01T00:00',
        '+010000-01-01T00:00', '10000-01-01T00:00', '00001-01-01T00:00', '2026-01-01T01:02\n']) {
        assert.equal(WorldClocks.parseLocalDateTime(value), null, String(value));
    }
}));

test('native Date with controlled TZ rejects DST gaps and skipped dates and chooses earlier folds', () => {
    const cases = [
        ['America/New_York', '2026-03-08T02:30', null],
        ['America/New_York', '2026-11-01T01:30:45', '2026-11-01T05:30:45.000Z', 'GMT-04:00'],
        ['Australia/Lord_Howe', '2026-10-04T02:15', null],
        ['Australia/Lord_Howe', '2026-04-05T01:45', '2026-04-04T14:45:00.000Z', 'GMT+11:00'],
        ['Asia/Kathmandu', '2026-10-17T10:30:22', '2026-10-17T04:45:22.000Z', 'GMT+05:45'],
        ['Pacific/Apia', '2011-12-30T12:00', null],
        ['Pacific/Apia', '2011-12-31T12:00', '2011-12-30T22:00:00.000Z', 'GMT+14:00'],
        ['Europe/Paris', '0099-06-15T12:34:56', '0099-06-15T12:25:35.000Z', 'GMT+00:09:21']
    ];
    for (const [zone, value, iso, offset] of cases) inZone(zone, () => {
        const date = WorldClocks.parseLocalDateTime(value);
        if (iso === null) { assert.equal(date, null, `${zone} ${value}`); return; }
        assert.equal(date.toISOString(), iso); assert.equal(WorldClocks.localZoneDescription(date).offset, offset);
        assert.equal(WorldClocks.localZoneDescription(date).timeZone, new Intl.DateTimeFormat().resolvedOptions().timeZone);
    });
});

test('numeric offset fallback preserves historical seconds rather than getTimezoneOffset rounding', () => inZone('Europe/Paris', () => {
    function DateTimeFormat(locale, options) {
        if (options?.timeZoneName === 'longOffset') throw new RangeError('modeled older Intl');
        return new Intl.DateTimeFormat(locale, options);
    }
    const context = vm.createContext({ module: {exports:{}}, Date, Intl: {DateTimeFormat} });
    vm.runInContext(fs.readFileSync('shared/world-clocks.js','utf8'), context);
    const api=context.module.exports, date=api.parseLocalDateTime('0099-06-15T12:34:56');
    assert.equal(api.localZoneDescription(date).offset, 'GMT+00:09:21');
}));

test('invalid or out-of-range drafts preserve the old preview and draft with a quiet associated error', () => inZone('UTC', () => {
    const h=mount(); h.clock.start(); h.compare(75); step(h); const state={...h.clock.worldClockComparison}, summary=h.summary();
    assert.equal(h.view.localLabel.htmlFor,h.view.localInput.id);
    assert.equal(h.view.localInput.getAttribute('aria-describedby'),`${h.view.localHelp.id} ${h.view.localError.id}`);
    for (const value of ['', '2026-02-30T12:00', '0001-01-02T23:59:59', '9999-12-30T00:00', '0001-01-01T00:00']) {
        apply(h,value); assert.deepEqual({...h.clock.worldClockComparison},state); assert.equal(h.summary(),summary);
        assert.equal(h.view.localInput.value,value); assert.equal(h.view.localError.hidden,false);
        assert.equal(h.view.localInput.getAttribute('aria-invalid'),'true'); h.tick(); assert.equal(h.view.localInput.value,value);
    }
    assert.deepEqual(h.host.querySelectorAll('[aria-live], [role="status"]'),[h.view.copyStatus]);
    apply(h,'2032-02-29T12:34'); assert.equal(h.view.localError.hidden,true);
    assert.equal(h.clock.worldClockComparison.anchor,Date.parse('2032-02-29T12:34:00Z'));
}));

test('entered preview, slider, elapsed-day steps and all rows share one instant and captured now keeps milliseconds', () => {
    for(const zone of ['UTC','America/New_York','Australia/Lord_Howe','Asia/Kathmandu']) inZone(zone,()=>{
        const h=mount(); h.compare(30); assert.equal(h.clock.worldClockComparison.anchor%1000,123);
        const value=zone==='America/New_York'?'2026-11-01T01:30:45':'2026-04-04T12:00:37';
        apply(h,value); const anchor=WorldClocks.parseLocalDateTime(value).getTime();
        assert.equal(h.clock.worldClockComparison.anchor,anchor); assert.equal(anchor%1000,0);
        const instants=[], real=h.window.WorldClocks;
        h.window.WorldClocks={...real,
            format(entry,date,...args){instants.push(date.getTime());return real.format(entry,date,...args);},
            calendarDate(entry,date){instants.push(date.getTime());return real.calendarDate(entry,date);},
            localZoneDescription(date){instants.push(date.getTime());return real.localZoneDescription(date);}
        };
        h.compare(75); step(h); step(h); step(h,-1);
        const target=anchor+1515*60000; assert(instants.slice(-5).every(value=>value===target));
        assert.equal(h.clock.worldClockComparison.anchor,anchor); assert.equal(h.clock.worldClockComparison.minutes,75);
        assert.equal(h.clock.worldClockComparison.shiftMinutes,1440); assert.match(h.view.reference.textContent,/\+1515 min from current comparison base$/);
        assert.equal(h.view.range.getAttribute('aria-valuetext'),h.view.reference.textContent);
        const description=real.localZoneDescription(new Date(target)); assert(h.view.reference.textContent.includes(description.offset));
        h.at('2030-01-01T00:00:00Z');h.tick();assert.equal(h.clock.worldClockComparison.anchor,anchor);
        assert.deepEqual(h.forbiddenCalls,[]);
    });
});

test('new anchors preserve the full original slider and UTC edge reservations in changed device zones', () => {
    for(const [value,direction] of [['0001-01-03T00:00',-1],['9999-12-29T23:59:59',1]]) inZone('UTC',()=>{
        const h=mount({clocks:[{timeZone:'Pacific/Kiritimati'},{timeZone:'Etc/GMT+12'}]});h.compare();apply(h,value);
        assert.equal(h.clock.worldClockComparison.localEntry,true);
        const state={...h.clock.worldClockComparison};step(h,direction);assert.deepEqual({...h.clock.worldClockComparison},state);
        assert.equal(h.view.range.min,'-1440');assert.equal(h.view.range.max,'1440');assert.equal(h.view.range.step,'15');
        for(const minutes of [-1440,1440]) for(const zone of ['Pacific/Kiritimati','Etc/GMT+12']) inZone(zone,()=>{
            h.compare(minutes);for(const row of h.clock.worldClockRows) assert.match(row.day.textContent,/ · \d{4}-\d{2}-\d{2}$/);
            assert.equal(h.clock.worldClockComparison.anchor,state.anchor);
        });
    });
});

test('draft, error and focused input survive ticks, formatting, ordering, language and host rerenders',()=>inZone('UTC',()=>{
    const h=mount();h.clock.start();h.compare();apply(h,'2026-02-30T01:02');h.view.localInput.focus();
    const state={...h.clock.worldClockComparison},view=h.view;h.at('2030-01-01T00:00:00Z');h.tick();
    h.clock.updateConfig({hour12:true,showSeconds:false,worldClocks:[newYork,tokyo]});
    assert.equal(h.view,view);assert.equal(h.document.activeElement,view.localInput);assert.equal(view.localInput.value,'2026-02-30T01:02');
    assert.equal(view.localError.hidden,false);assert.deepEqual({...h.clock.worldClockComparison},state);
    h.locale('zh_CN');h.tick();assert.equal(view.localInput.value,'2026-02-30T01:02');assert.equal(view.localError.hidden,false);
    h.clock.setEnabled(false);h.clock.setEnabled(true);h.clock.renderWorldClocks();
    assert.equal(h.document.activeElement,view.localInput);assert.equal(view.localInput.value,'2026-02-30T01:02');
    const outside=h.document.createElement('input');h.document.body.append(outside);outside.focus();h.clock.renderWorldClocks();
    assert.equal(h.document.activeElement,outside);apply(h,'2032-02-29T12:30');assert.equal(h.document.activeElement,outside);
    assert.equal(h.timerCount,2,'hide/show restarts the existing timer');assert.equal(h.timers.size,1);
}));

test('device-zone changes preserve the instant and refresh only clean unfocused input',()=>inZone('UTC',()=>{
    const h=mount();h.compare();apply(h,'2032-02-29T12:30:25');const anchor=h.clock.worldClockComparison.anchor;
    inZone('Asia/Kathmandu',()=>{
        h.clock.updateDisplay();assert.equal(h.clock.worldClockComparison.anchor,anchor);
        assert.equal(h.view.localInput.value,'2032-02-29T18:15:25');assert.match(h.view.reference.textContent,/GMT\+05:45/);
        assert.equal(h.view.localError.hidden,true);
    });
}));

test('dirty draft survives device-zone ABA and cannot be silently reinterpreted without another edit',()=>inZone('UTC',()=>{
    const h=mount();h.compare();edit(h,'2032-02-29T12:30:25');const anchor=h.clock.worldClockComparison.anchor;
    inZone('America/New_York',()=>{
        h.clock.updateDisplay();assert.equal(h.view.localInput.value,'2032-02-29T12:30:25');assert.equal(h.view.localError.hidden,false);
        h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,anchor);
    });
    h.clock.updateDisplay();h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,anchor);
    edit(h,'2032-02-29T12:30:25');h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,anchor,'same-value event is not a new edit');
    edit(h,'2032-02-29T12:30:26');h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,Date.parse('2032-02-29T12:30:26Z'));
}));

test('submit detects a device-zone change even before the next tick, while focused clean input is protected',()=>inZone('UTC',()=>{
    for(const dirty of [false,true]) {
        const h=mount();h.compare();if(dirty)edit(h,'2032-02-29T12:30:25');h.view.localInput.focus();
        const value=h.view.localInput.value,anchor=h.clock.worldClockComparison.anchor;
        inZone('Australia/Lord_Howe',()=>{
            h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,anchor);
            assert.equal(h.view.localInput.value,value);assert.equal(h.view.localError.hidden,false);
            edit(h,'2032-02-29T12:30:26');h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,WorldClocks.parseLocalDateTime('2032-02-29T12:30:26').getTime());
        });
    }
}));

test('entry follows host Enter, IME, repeat and prevented conventions without stealing focus',()=>{
    const h=mount();h.compare();edit(h,'2032-02-29T12:30');const input=h.view.localInput,button=h.view.preview,anchor=h.clock.worldClockComparison.anchor;
    input.focus();input.dispatch('compositionstart');input.dispatch('keydown',{key:'Enter',isComposing:true});
    input.dispatch('compositionend');input.dispatch('keydown',{key:'Enter'});button.dispatch('click');
    assert.equal(h.clock.worldClockComparison.anchor,anchor);input.dispatch('keyup',{key:'Enter'});
    for(const fields of [{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{repeat:true},{defaultPrevented:true},{isComposing:true},{keyCode:229}]) input.dispatch('keydown',{key:'Enter',...fields});
    assert.equal(h.clock.worldClockComparison.anchor,anchor);input.dispatch('keyup',{key:'Enter'});
    assert.equal(input.dispatch('keydown',{key:'Enter'}).prevented,true);assert.notEqual(h.clock.worldClockComparison.anchor,anchor);
    assert.equal(h.document.activeElement,input);
    for(const fields of [{detail:2},{defaultPrevented:true},{repeat:true},{isComposing:true},{keyCode:229}]) {
        const before=h.clock.worldClockComparison.anchor;edit(h,'2033-02-28T12:30');button.dispatch('click',fields);assert.equal(h.clock.worldClockComparison.anchor,before);
    }
    for(const key of ['Enter',' ']) for(const fields of [{repeat:true},{isComposing:true},{keyCode:229}]) assert(button.dispatch('keydown',{key,...fields}).prevented);
    input.dispatch('compositionstart');button.dispatch('click');const before=h.clock.worldClockComparison.anchor;
    input.dispatch('blur');button.dispatch('click');assert.notEqual(h.clock.worldClockComparison.anchor,before);
});

test('hidden, inert, disabled, detached, departing and retired inputs cannot edit applied state',()=>{
    const h=mount();h.compare();edit(h,'2032-02-29T12:30');const original=h.clock.worldClockComparison.anchor;
    const probes=[
        [()=>h.document.hidden=true,()=>h.document.hidden=false],
        [()=>h.document.visibilityState='hidden',()=>h.document.visibilityState='visible'],
        [()=>h.clock.setEnabled(false),()=>h.clock.setEnabled(true)],
        [()=>h.window.LocalItabContentLifecycle.allowDeparture(),()=>h.window.LocalItabContentLifecycle.cancelDeparture()],
        [()=>h.document.body.classList.add('dashboard-hidden'),()=>h.document.body.classList.remove('dashboard-hidden')],
        [()=>h.host.hidden=true,()=>h.host.hidden=false],[()=>h.cards.inert=true,()=>h.cards.inert=false],
        [()=>h.host.setAttribute('aria-hidden','true'),()=>h.host.removeAttribute('aria-hidden')],
        [()=>h.cards.style.visibility='hidden',()=>h.cards.style.visibility='visible'],
        [()=>h.cards.style.display='none',()=>h.cards.style.display='block'],
        [()=>h.view.localInput.disabled=true,()=>h.view.localInput.disabled=false],
        [()=>h.view.preview.disabled=true,()=>h.view.preview.disabled=false],
        [()=>h.view.controls.remove(),()=>h.host.append(h.view.controls)]
    ];
    for(const [hide,show] of probes){hide();h.view.preview.dispatch('click');h.view.localInput.dispatch('keydown',{key:'Enter'});show();assert.equal(h.clock.worldClockComparison.anchor,original);}
    const stale=h.view;h.remount();h.compare();stale.preview.dispatch('click');stale.localInput.dispatch('keydown',{key:'Enter'});
    assert.equal(h.clock.worldClockComparison.localEntry,undefined);
});

test('back to now and removing all clocks clear drafts, errors and the explicit-input marker',()=>{
    const h=mount();h.compare();apply(h,'2032-02-29T12:30');edit(h,'bad');h.view.preview.dispatch('click');const old=h.view;
    h.view.toggle.dispatch('click');assert.equal(h.clock.worldClockComparison,null);assert.equal(old.localInput.value,'');assert.equal(old.localError.hidden,true);
    h.compare();assert.equal(h.clock.worldClockComparison.localEntry,undefined);assert.equal(h.view.localError.hidden,true);
    edit(h,'2033-01-01T01:01');h.clock.updateConfig({worldClocks:[]});assert.equal(h.clock.worldClockComparison,null);
    assert.equal(old.localInput.value,'');assert.equal(old.localDraft,null);
    h.clock.updateConfig({worldClocks:[tokyo]});h.compare();assert.equal(h.clock.worldClockComparison.localEntry,undefined);
});

test('draft edits and submissions retire copy receipts without releasing a pending system write',async()=>{
    for(const rejected of [false,true]) {
        const wait=deferred(),calls=[];const h=mount({clipboard:{writeText(text){calls.push(text);return wait.promise;}}});
        h.compare();apply(h,'2032-02-29T12:30:25');const summary=h.summary();h.view.copy.dispatch('click');assert.deepEqual(calls,[summary]);
        edit(h,'2099-12-20T01:02:03');assert.equal(h.summary(),summary);assert.equal(h.view.copyStatus.hidden,true);
        h.view.copy.dispatch('click');assert.equal(calls.length,1);h.view.preview.dispatch('click');assert.equal(h.view.copy.getAttribute('aria-disabled'),'true');
        h.view.copy.dispatch('click');assert.equal(calls.length,1);
        if(rejected)wait.reject(Error('denied'));else wait.resolve();await settle();assert.equal(h.view.copyStatus.hidden,true);
        assert.equal(h.view.copy.getAttribute('aria-disabled'),'false');assert(!calls[0].includes('2099'));
    }
});

test('copy exports applied local identity and exact visible rows, excluding draft/help/error',async()=>inZoneAsync('UTC',async()=>{
    const h=mount();h.compare();apply(h,'2032-02-29T12:30:25');const text=h.summary();
    edit(h,'2099-12-20T01:02:03');h.view.copy.dispatch('click');await settle();
    assert.deepEqual(h.calls,[text]);assert.match(text,/UTC · GMT\+00:00/);assert(!text.includes('2099'));
    assert(!text.includes(h.view.localHelp.textContent));assert(!text.includes('Device-local date'));
}));


test('button composition lifecycle also blocks synthetic activation until release',()=>{
    const h=mount();h.compare();edit(h,'2032-02-29T12:30');const anchor=h.clock.worldClockComparison.anchor;
    h.view.preview.dispatch('compositionstart');h.view.preview.dispatch('click');
    h.view.localInput.dispatch('keydown',{key:'Enter'});assert.equal(h.clock.worldClockComparison.anchor,anchor);
    assert(h.view.preview.dispatch('keydown',{key:'Enter'}).prevented);
    h.view.preview.dispatch('compositionend');h.view.preview.dispatch('click');assert.notEqual(h.clock.worldClockComparison.anchor,anchor);
});

test('English and Chinese entry help disclose folds and current zone, while fallback remains English',()=>inZone('America/New_York',()=>{
    for(const locale of ['en','zh_CN']){
        const h=mount({locale});h.compare();assert(h.view.localHelp.textContent.includes('America/New_York'));
        assert.match(h.view.localHelp.textContent,locale==='en'?/earlier occurrence/:/较早的一次/);
        apply(h,'2026-11-01T01:30');assert.match(h.view.reference.textContent,/America\/New_York · GMT-04:00/);
        assert.match(h.view.reference.textContent,locale==='en'?/current comparison base/:/相对当前比较基准/);
        apply(h,'2026-03-08T02:30');assert.equal(h.view.localError.hidden,false);
        assert.match(h.view.localError.textContent,locale==='en'?/Skipped times/:/跳过的时间/);
        h.locale(null);h.clock.updateDisplay();assert.equal(h.view.preview.textContent,'Preview');assert.match(h.view.localHelp.textContent,/earlier occurrence/);
    }
}));

test('entry style reuses wrapping controls with bounded width and existing focus/error hooks',()=>{
    const css=fs.readFileSync('newtab.css','utf8');
    assert.match(css,/\.world-clock-comparison input\[type="datetime-local"\]\s*\{[^}]*box-sizing: border-box[^}]*min-width: 0[^}]*max-width: 100%/);
    const h=mount();h.compare();assert.equal(h.view.localInput.parentElement.className,'world-clock-comparison-navigation');
    assert.equal(h.view.localError.className,'world-clock-comparison-copy-status is-error');
});

test('unfocused clean Preview detects a zone change before tick instead of interpreting stale wall time',()=>inZone('UTC',()=>{
    const h=mount();h.compare();apply(h,'2032-02-29T12:30:25');const anchor=h.clock.worldClockComparison.anchor,value=h.view.localInput.value;
    assert.notEqual(h.document.activeElement,h.view.localInput);
    inZone('America/New_York',()=>{
        h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,anchor);
        assert.equal(h.view.localInput.value,value);assert.equal(h.view.localError.hidden,false);
        h.clock.updateDisplay();assert.equal(h.view.localInput.value,value);h.view.preview.dispatch('click');assert.equal(h.clock.worldClockComparison.anchor,anchor);
        edit(h,'2032-02-29T12:30:26');h.view.preview.dispatch('click');
        assert.equal(h.clock.worldClockComparison.anchor,WorldClocks.parseLocalDateTime('2032-02-29T12:30:26').getTime());
    });
}));
