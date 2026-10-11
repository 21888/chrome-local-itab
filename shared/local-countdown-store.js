/* Device-local calendar countdown. No settings, cloud provider, or network access. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCountdown = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabCountdownV1', LOCK = 'local-itab-local-write';
    const LIMITS = Object.freeze({ title: 80, exportCharacters: 32000, exportBytes: 128 * 1024 });
    const STATE_KEYS = ['schemaVersion', 'revision', 'enabled', 'title', 'targetDate'];
    function fault(code) { const error = new Error(`Local countdown: ${code}`); error.code = code; return error; }
    function check(ok, code = 'INVALID') { if (!ok) throw fault(code); }
    function object(value, keys) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        check(Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
    }
    const isUnicode = value => typeof value === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
    function title(value) {
        check(isUnicode(value), 'TEXT');
        // Titles are a single line; reject controls before trimming, never silently remove them.
        check(!/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(value), 'TEXT');
        const clean = value.trim();
        check(clean.length > 0, 'TEXT');
        check(Array.from(clean).length <= LIMITS.title, 'TEXT_LIMIT');
        return clean;
    }
    function utcCalendarDate(year, month, day) {
        // Date.UTC and the multi-argument Date constructor reinterpret years 0–99 as 1900–1999.
        const date = new Date(0);
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCFullYear(year, month - 1, day);
        return date;
    }
    // Strict proleptic Gregorian ISO date. Returns numeric parts, never a parsed timestamp.
    function parseDate(value) {
        check(typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value), 'DATE');
        const [year, month, day] = value.split('-').map(Number);
        check(year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= 31, 'DATE');
        const date = utcCalendarDate(year, month, day);
        check(date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day, 'DATE');
        return { year, month, day };
    }
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, title: '', targetDate: '' }; }
    function fields(value) {
        object(value, ['enabled', 'title', 'targetDate']);
        check(typeof value.enabled === 'boolean');
        if (value.title === '' && value.targetDate === '') {
            check(!value.enabled, 'UNCONFIGURED');
            return { enabled: false, title: '', targetDate: '' };
        }
        const clean = title(value.title);
        parseDate(value.targetDate);
        return { enabled: value.enabled, title: clean, targetDate: value.targetDate };
    }
    function validate(value) {
        object(value, STATE_KEYS);
        check(value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0);
        const clean = fields({ enabled: value.enabled, title: value.title, targetDate: value.targetDate });
        // Saved data must already be canonical; loading never silently repairs a malformed record.
        check(clean.title === value.title, 'TEXT');
        return value;
    }
    const same = (a, b) => STATE_KEYS.every(key => a[key] === b[key]);
    // Signed count of local calendar days: future positive, today zero, past negative.
    // UTC ordinals avoid DST and fractional-offset errors without changing the device's date.
    function calendarDifference(targetDate, date = new Date()) {
        const { year, month, day } = parseDate(targetDate);
        let today;
        try {
            check(Number.isFinite(Date.prototype.getTime.call(date)), 'DATE');
            today = utcCalendarDate(Date.prototype.getFullYear.call(date), Date.prototype.getMonth.call(date) + 1, Date.prototype.getDate.call(date));
        } catch (_) { throw fault('DATE'); }
        const days = (utcCalendarDate(year, month, day).getTime() - today.getTime()) / 86400000;
        check(Number.isSafeInteger(days), 'DATE');
        return days;
    }
    // The view chooses translated labels; this pure helper never emits an English UI label.
    function display(targetDate, date = new Date()) {
        const days = calendarDifference(targetDate, date);
        return { days, count: Math.abs(days), kind: days > 0 ? 'future' : days < 0 ? 'past' : 'today' };
    }
    // Explicit recovery export preserves an unfinished draft, even when it cannot be saved.
    // Bound the output and reject unpaired surrogates so UTF-8 round-trips without losing text.
    // No timestamp, normalization, storage write, HTML interpretation, or network request.
    function exportText(value) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        check(isUnicode(value.title) && isUnicode(value.targetDate), 'TEXT');
        const text = `${value.title}\n${value.targetDate}\n`;
        check(Array.from(text).length <= LIMITS.exportCharacters, 'SIZE_LIMIT');
        check(new TextEncoder().encode(text).length <= LIMITS.exportBytes, 'SIZE_LIMIT');
        return text;
    }
    function createChromeBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks, workspace = globalThis.LocalItabWorkspaces?.session) {
        if (workspace) return workspace.createBackend(KEY);
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            lock: action => locks.request(LOCK, { mode: 'exclusive' }, action),
            read: async () => {
                const result = await chromeApi.storage.local.get([KEY]);
                check(result && typeof result === 'object' && !Array.isArray(result), 'READ');
                return result[KEY];
            },
            write: value => chromeApi.storage.local.set({ [KEY]: value }),
            subscribe(fn) {
                const listener = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, KEY)) fn(); };
                chromeApi.storage.onChanged.addListener(listener);
                return () => chromeApi.storage.onChanged.removeListener(listener);
            }
        };
    }
    class Store {
        constructor(backend = createChromeBackend()) { this.backend = backend; }
        async raw() {
            let value;
            try { value = await this.backend.read(); } catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('READ'); }
            if (value === undefined) return initial();
            try { return { ...validate(value) }; } catch (_) { throw fault('CORRUPT'); }
        }
        read() { return this.backend.lock(() => this.raw()); }
        subscribe(fn) { return this.backend.subscribe(fn); }
        async mutate(command) {
            // Snapshot the caller's primitive payload before the lock or any read can yield.
            // A pending input edit must not change the operation that was already submitted.
            object(command, ['kind', 'value', 'revision']);
            const { kind, revision, value } = command;
            check(kind === 'save' || kind === 'visibility');
            check(Number.isSafeInteger(revision) && revision >= 0);
            let submitted;
            if (kind === 'save') {
                object(value, ['enabled', 'title', 'targetDate']);
                submitted = { enabled: value.enabled, title: value.title, targetDate: value.targetDate };
                check(typeof submitted.enabled === 'boolean' && typeof submitted.title === 'string' && typeof submitted.targetDate === 'string');
            } else { check(typeof value === 'boolean'); submitted = value; }
            return this.backend.lock(async () => {
                const state = await this.raw();
                check(revision === state.revision, 'CONFLICT');
                if (kind === 'save') Object.assign(state, fields(submitted));
                else {
                    check(!submitted || (state.title !== '' && state.targetDate !== ''), 'UNCONFIGURED');
                    state.enabled = submitted;
                }
                state.revision++;
                validate(state);
                try { if (await this.backend.write(state) === false) throw fault('WRITE'); }
                catch (_) { throw fault('WRITE'); }
                // An acknowledged write is not Saved until an exact, validated readback succeeds.
                const saved = await this.raw();
                check(same(state, saved), 'VERIFY');
                return saved;
            });
        }
    }
    return { KEY, LOCK, LIMITS, Store, initial, validate, fields, title, isUnicode, parseDate, calendarDifference, display, exportText, fault, createChromeBackend };
});
