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

// Actual shipped ClockComponent + WorldClocks/Intl, with synthetic dates and a
// bounded DOM/clipboard model. No native keyboard, layout, AT or OS clipboard claim.
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
function step(h, direction = 1, fields) { return (direction < 0 ? h.view.previous24 : h.view.next24).dispatch('click', fields); }

test('24-hour controls continue from the captured instant without changing the 15-minute slider', () => inZone('UTC', () => {
    const h = mount(); const view = h.view;
    assert(view.previous24 && view.next24, 'comparison needs previous/next 24-hour controls');
    assert.equal(view.panel.hidden, true); step(h); assert.equal(h.clock.worldClockComparison, null);
    h.compare(75); const anchor = h.clock.worldClockComparison.anchor, reads = h.nowReads;
    h.at('2027-02-10T23:59:59Z'); view.next24.focus();
    step(h); step(h); step(h, -1);
    assert.equal(h.clock.worldClockComparison.anchor, anchor); assert.equal(h.nowReads, reads);
    assert.equal(h.clock.worldClockComparison.minutes, 75); assert.equal(view.range.value, '75');
    assert.equal(h.clock.worldClockComparison.shiftMinutes, 1440);
    assert.match(view.reference.textContent, /Jan 1, 2027, 11:45:15 UTC · \+1515 min from start/);
    assert.equal(view.range.min, '-1440'); assert.equal(view.range.max, '1440'); assert.equal(view.range.step, '15');
    assert.equal(h.document.activeElement, view.next24);
    assert.equal(view.range.getAttribute('aria-valuetext'), view.reference.textContent);
    assert.equal(h.clock.worldClockRows[0].day.textContent, 'Same day · 2027-01-01');
}));

test('repeated navigation crosses leap day, both DST changes and date lines using exactly 24 elapsed hours', () => {
    const cases = [
        ['UTC', '2024-02-28T18:00:05.123Z', 2, 'Asia/Kolkata', '2024-03-01', '23:45:05'],
        ['America/New_York', '2026-03-07T17:00:05.123Z', 1, 'America/New_York', '2026-03-08', '13:15:05'],
        ['America/New_York', '2026-10-31T16:00:05.123Z', 1, 'America/New_York', '2026-11-01', '11:15:05'],
        ['Pacific/Pago_Pago', '2026-12-31T10:15:05.123Z', 2, 'Pacific/Kiritimati', '2027-01-03', '00:30:05'],
        ['Pacific/Kiritimati', '2027-01-02T10:15:05.123Z', -2, 'Etc/GMT+12', '2026-12-30', '22:30:05']
    ];
    for (const [device, now, steps, zone, expectedDate, expectedTime] of cases) inZone(device, () => {
        const h = mount({ now, clocks: [{timeZone: zone}, {timeZone: 'Asia/Kathmandu'}, {timeZone: 'Australia/Lord_Howe'}] });
        h.compare(15);
        const instants = [], real = h.window.WorldClocks;
        h.window.WorldClocks = { ...real,
            format(entry, instant, ...args) { instants.push(instant.getTime()); return real.format(entry, instant, ...args); },
            calendarDate(entry, instant) { instants.push(instant.getTime()); return real.calendarDate(entry, instant); }
        };
        for (let i = 0; i < Math.abs(steps); i++) step(h, Math.sign(steps));
        const target = Date.parse(now) + (steps * 1440 + 15) * 60000;
        assert.equal(h.clock.worldClockRows[0].time.textContent, expectedTime);
        assert.match(h.clock.worldClockRows[0].day.textContent, new RegExp(`${expectedDate}$`));
        assert(instants.slice(-6).every(value => value === target));
        const localDate = new Date(target).toLocaleDateString('en', {year:'numeric',month:'short',day:'numeric'});
        assert(h.view.reference.textContent.includes(localDate));
        assert(h.view.reference.textContent.endsWith(`${steps * 1440 + 15 > 0 ? '+' : ''}${steps * 1440 + 15} min from start`));
        assert.equal(target % 1000, 123, 'subsecond anchor is preserved');
        assert.deepEqual(h.forbiddenCalls, []);
    });
});

test('slider extremes remain relative to the stepped base and live ticks do not drift or announce again', () => inZone('UTC', () => {
    const h = mount(); h.clock.start(); h.compare(-1440); step(h, -1); step(h, -1);
    assert.match(h.view.reference.textContent, /-4320 min from start$/);
    const reference = h.view.reference.textContent;
    assert.deepEqual(h.host.querySelectorAll('[aria-live], [role="status"]'), [h.view.copyStatus]);
    h.at('2027-12-20T01:02:03Z'); h.tick();
    assert.equal(h.view.reference.textContent, reference);
    h.compare(1440); assert.match(h.view.reference.textContent, /-1440 min from start$/);
    assert.equal(h.timerCount, 1); assert.equal(h.timers.size, 1); assert.deepEqual(h.forbiddenCalls, []);
}));

test('settings, order, language, visibility and host rerenders preserve navigation and control focus', () => inZone('UTC', () => {
    const h = mount(); h.clock.start(); h.compare(30); step(h); step(h);
    const state = h.clock.worldClockComparison; h.view.previous24.focus();
    h.clock.updateConfig({hour12:true,showSeconds:false,worldClocks:[newYork,tokyo]});
    assert.equal(h.clock.worldClockComparison, state); assert.equal(h.document.activeElement, h.view.previous24);
    assert.equal(h.view.range.value,'30'); assert.equal(state.shiftMinutes,2880);
    assert.equal(h.clock.worldClockRows[0].entry.timeZone, 'America/New_York');
    h.locale('zh_CN'); h.tick(); assert.equal(h.view.previous24.textContent,'前移 24 小时'); assert.equal(h.view.next24.textContent,'后移 24 小时');
    assert.match(h.view.reference.textContent,/\+2910/); assert.match(h.view.stepHelp.textContent,/0001–9999/);
    h.locale(null); h.tick(); assert.equal(h.view.previous24.textContent,'Back 24 hours'); assert.match(h.view.stepHelp.textContent,/24 elapsed hours/);
    h.clock.setEnabled(false); h.clock.setEnabled(true); assert.equal(h.clock.worldClockComparison,state);
    h.document.hidden = true; h.document.listeners.get('visibilitychange')(); h.at('2028-01-01T10:00:00Z');
    h.document.hidden = false; h.document.listeners.get('visibilitychange')(); assert.equal(h.clock.worldClockComparison,state);
    const outside = h.document.createElement('input'); h.document.body.append(outside); outside.focus();
    h.clock.renderWorldClocks(); assert.equal(h.document.activeElement,outside);
    step(h); assert.equal(h.document.activeElement,outside,'programmatic click cannot steal unrelated focus');
}));

test('return to now, all-clock removal and page recreation reset the step state and retire old controls', () => {
    const h = mount(); h.compare(45); step(h); const old = h.view;
    old.toggle.dispatch('click'); assert.equal(h.clock.worldClockComparison,null); assert.equal(old.panel.hidden,true);
    assert.equal(old.next24.getAttribute('aria-disabled'),'true'); step(h); assert.equal(h.clock.worldClockComparison,null);
    h.at('2027-03-01T12:00:00Z'); h.compare(); assert.equal(h.clock.worldClockComparison.shiftMinutes,0);
    assert.equal(h.clock.worldClockComparison.anchor,Date.parse('2027-03-01T12:00:00Z'));
    step(h); h.clock.updateConfig({worldClocks:[]}); assert.equal(h.clock.worldClockComparison,null);
    h.clock.updateConfig({worldClocks:[tokyo]}); h.compare(60); const state = {...h.clock.worldClockComparison};
    old.next24.dispatch('click'); old.previous24.dispatch('click'); assert.deepEqual({...h.clock.worldClockComparison},state);
    step(h); h.remount(); assert.equal(h.clock.worldClockComparison,null); assert.equal(h.view.panel.hidden,true);
});

test('native buttons reject repeated/composing/prevented activations without custom keyboard synthesis', () => {
    const h = mount(); h.compare();
    for (const button of [h.view.previous24,h.view.next24]) {
        assert.equal(button.tagName,'BUTTON'); assert.equal(button.type,'button'); assert.equal(button.tabIndex,0);
        assert.equal(button.getAttribute('aria-describedby'),`${h.view.stepHelp.id} ${h.view.reference.id}`);
        for (const key of ['Enter',' ']) {
            for (const flags of [{repeat:true},{isComposing:true},{keyCode:229}]) {
                assert(button.dispatch('keydown',{key,...flags}).prevented);
                button.dispatch('click',flags); assert.equal(h.clock.worldClockComparison.shiftMinutes,0);
            }
            const event=button.dispatch('keydown',{key}); assert.equal(event.prevented,false);
            assert.equal(h.clock.worldClockComparison.shiftMinutes,0,'keydown leaves activation to the browser');
        }
        for (const fields of [{detail:2},{defaultPrevented:true}]) button.dispatch('click',fields);
        button.dispatch('compositionstart'); button.dispatch('click'); assert.equal(h.clock.worldClockComparison.shiftMinutes,0);
        button.dispatch('compositionend');
        button.dispatch('compositionstart'); button.dispatch('blur');
        button.dispatch('click'); assert.notEqual(h.clock.worldClockComparison.shiftMinutes,0);
        step(h,button===h.view.next24 ? -1 : 1); assert.equal(h.clock.worldClockComparison.shiftMinutes,0);
    }
});

test('hidden, inert, stale, departing and unavailable control hosts cannot navigate', () => {
    const h = mount(); h.compare();
    const probes = [
        [() => h.document.hidden=true, () => h.document.hidden=false],
        [() => h.document.visibilityState='hidden', () => h.document.visibilityState='visible'],
        [() => h.clock.setEnabled(false), () => h.clock.setEnabled(true)],
        [() => h.window.LocalItabContentLifecycle.allowDeparture(), () => h.window.LocalItabContentLifecycle.cancelDeparture()],
        [() => h.document.body.classList.add('dashboard-hidden'), () => h.document.body.classList.remove('dashboard-hidden')],
        [() => h.host.hidden=true, () => h.host.hidden=false],
        [() => h.cards.inert=true, () => h.cards.inert=false],
        [() => h.host.setAttribute('aria-hidden','true'), () => h.host.removeAttribute('aria-hidden')],
        [() => h.cards.style.visibility='hidden', () => h.cards.style.visibility='visible'],
        [() => h.cards.style.display='none', () => h.cards.style.display='block'],
        [() => h.view.panel.hidden=true, () => h.view.panel.hidden=false],
        [() => h.view.next24.disabled=true, () => h.view.next24.disabled=false],
        [() => h.view.controls.remove(), () => h.host.append(h.view.controls)]
    ];
    for (const [hide,show] of probes) {
        hide(); step(h); h.view.next24.dispatch('compositionstart'); show();
        assert.equal(h.clock.worldClockComparison.shiftMinutes,0); assert.equal(h.view.stepComposing,false);
    }
    const details=h.document.createElement('details'); h.cards.append(details); h.host.remove(); details.append(h.host);
    step(h); assert.equal(h.clock.worldClockComparison.shiftMinutes,0); details.open=true; step(h); assert.equal(h.clock.worldClockComparison.shiftMinutes,1440);
    const staleClock=h.clock, staleView=h.view; h.remount(); h.compare();
    staleView.next24.dispatch('click'); assert.equal(h.clock.worldClockComparison.shiftMinutes,0);
    assert.equal(staleClock.worldClockComparison.shiftMinutes,1440);
});

test('conservative navigation edges preserve focus, the entire slider and positive years after zone changes', () => {
    for (const [now,direction] of [['0001-01-04T00:00:15.123Z',-1],['9999-12-28T23:59:15.123Z',1]]) inZone('UTC', () => {
        const h=mount({now,clocks:[{timeZone:'Etc/GMT+12'},{timeZone:'Pacific/Kiritimati'}]}); h.compare();
        const button=direction<0?h.view.previous24:h.view.next24; button.focus(); step(h,direction);
        assert.equal(button.getAttribute('aria-disabled'),'true'); assert.notEqual(button.disabled,true);
        assert.equal(h.document.activeElement,button); const state={...h.clock.worldClockComparison}; step(h,direction);
        assert.deepEqual({...h.clock.worldClockComparison},state);
        for (const minutes of [-1440,1440]) {
            h.compare(minutes);
            for (const device of ['Etc/GMT+12','Pacific/Kiritimati']) inZone(device, () => {
                h.clock.updateConfig({worldClocks:[{timeZone:'Pacific/Kiritimati'},{timeZone:'Etc/GMT+12'},{timeZone:'Asia/Kolkata'}]});
                const instant=new Date(state.anchor+(state.shiftMinutes+minutes)*60000);
                assert(instant.getFullYear()>=1&&instant.getFullYear()<=9999);
                for (const row of h.clock.worldClockRows) {
                    const date=row.day.textContent.split(' · ').at(-1); assert.match(date,/^\d{4}-\d{2}-\d{2}$/);
                    assert(Number(date.slice(0,4))>=1&&Number(date.slice(0,4))<=9999);
                }
            });
        }
        step(h,-direction); assert.equal(button.getAttribute('aria-disabled'),'false');
        assert.equal(h.clock.worldClockComparison.shiftMinutes,0);
    });
});

test('unsafe arithmetic, invalid dates, fractional offsets and BCE/extended navigation are refused before rendering', () => {
    const h=mount(); h.compare(); const original={...h.clock.worldClockComparison}, summary=h.summary();
    const invalid = [
        {anchor:NaN},{anchor:Infinity},{anchor:8640000000000000},{anchor:-8640000000000000},
        {anchor:Number.MAX_SAFE_INTEGER},{anchor:1.5},{anchor:Date.parse('0000-01-01T00:00:00Z')},
        {anchor:Date.parse('+010000-01-01T00:00:00Z')},{minutes:1},{minutes:Infinity},{minutes:1455},
        {shiftMinutes:Number.MAX_SAFE_INTEGER},{shiftMinutes:Infinity},{shiftMinutes:0.5},{shiftMinutes:'1440'},
        {shiftMinutes:150119987520}, {shiftMinutes:-150119987520}
    ];
    for (const patch of invalid) {
        Object.assign(h.clock.worldClockComparison,original,patch); const before={...h.clock.worldClockComparison};
        for (const direction of [-1,1]) { assert.equal(h.clock.worldClockStepCandidate(direction),null); step(h,direction); }
        assert.deepEqual({...h.clock.worldClockComparison},before); assert.equal(h.summary(),summary);
    }
    Object.assign(h.clock.worldClockComparison,original); step(h); assert.equal(h.clock.worldClockComparison.shiftMinutes,1440);
});

test('step ABA retires copy feedback but keeps a pending system write locked until settlement', async () => {
    for (const rejected of [false,true]) {
        const wait=deferred(), calls=[]; const h=mount({clipboard:{writeText(text){calls.push(text); return wait.promise;}}});
        h.compare(15); const summary=h.summary(); h.view.copy.dispatch('click'); assert.equal(calls.length,1);
        h.view.next24.focus(); step(h); step(h,-1); assert.equal(h.summary(),summary);
        assert.equal(h.view.copyStatus.hidden,true); assert.equal(h.view.copyStatus.textContent,'');
        assert.equal(h.view.copy.getAttribute('aria-disabled'),'true'); h.view.copy.dispatch('click'); assert.equal(calls.length,1);
        const outside=h.document.createElement('input'); h.document.body.append(outside); outside.focus();
        if(rejected) wait.reject(Error('late denial')); else wait.resolve();
        await settle(); assert.equal(h.view.copyStatus.hidden,true); assert.equal(h.document.activeElement,outside);
        assert.equal(h.view.copy.getAttribute('aria-disabled'),'false');
        h.window.navigator.clipboard.writeText=text=>{calls.push(text); return Promise.resolve();};
        h.view.copy.dispatch('click'); await settle(); assert.equal(calls.length,2); assert.equal(calls[1],summary);
        assert.equal(h.view.copyStatus.textContent,'Comparison copied.');
    }
});


test('a replacement owner cannot bypass the old pending write after a step', async () => {
    const wait=deferred(), calls=[];
    const h=mount({clipboard:{writeText(text){calls.push(text); return wait.promise;}}}); h.compare(); h.view.copy.dispatch('click');
    step(h); h.remount(); h.compare(30); step(h); h.view.copy.dispatch('click'); assert.equal(calls.length,1);
    assert.equal(h.view.copy.getAttribute('aria-disabled'),'true'); wait.resolve(); await settle();
    assert.equal(h.view.copyStatus.hidden,true); assert.equal(h.view.copy.getAttribute('aria-disabled'),'false');
    h.window.navigator.clipboard.writeText=text=>{calls.push(text); return Promise.resolve();};
    h.view.copy.dispatch('click'); await settle(); assert.equal(calls.length,2); assert.equal(calls[1],h.summary());
});
