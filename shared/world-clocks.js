(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WorldClocks = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';

    const MAX_CLOCKS = 4;
    const MAX_LABEL_LENGTH = 40;
    const CACHE_LIMIT = 64;
    const DAY_MS = 86400000;
    const zoneCache = new Map();
    const formatterCache = new Map();
    const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

    function remember(cache, key, create) {
        if (cache.has(key)) return cache.get(key);
        const value = create();
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(key, value);
        return value;
    }

    function canonicalZone(value) {
        // Intl also accepts numeric offsets in newer engines. Stored clocks must
        // use named zones, including named IANA links such as US/Eastern.
        if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9._+-]*(?:\/[A-Za-z0-9._+-]+)*$/.test(value)) {
            throw new TypeError('World clock timeZone must be a named IANA time zone');
        }
        return remember(zoneCache, value, () => new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone);
    }

    function normalizeEntry(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.prototype.toString.call(value) !== '[object Object]' || !owns(value, 'timeZone') ||
            Reflect.ownKeys(value).some(key => key !== 'timeZone' && key !== 'label')) {
            throw new TypeError('World clock must contain only timeZone and an optional label');
        }
        const timeZone = canonicalZone(value.timeZone);
        const rawLabel = owns(value, 'label') ? value.label : '';
        if (typeof rawLabel !== 'string' || /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/.test(rawLabel)) {
            throw new TypeError('World clock label must be text without control characters');
        }
        const label = rawLabel.trim();
        if (Array.from(label).length > MAX_LABEL_LENGTH) {
            throw new RangeError(`World clock label must be at most ${MAX_LABEL_LENGTH} characters`);
        }
        return { timeZone, label };
    }

    function normalize(value) {
        if (value === undefined) return [];
        if (!Array.isArray(value)) throw new TypeError('World clocks must be an array');
        if (value.length > MAX_CLOCKS) throw new RangeError(`At most ${MAX_CLOCKS} world clocks are allowed`);
        const seen = new Set();
        const result = [];
        // A for-of loop also rejects holes, unlike Array#map.
        for (const entry of value) {
            const normalized = normalizeEntry(entry);
            if (seen.has(normalized.timeZone)) throw new RangeError('World clock time zones must be unique');
            seen.add(normalized.timeZone);
            result.push(normalized);
        }
        return result;
    }

    function safe(value) {
        try { return normalize(value); }
        catch (_) { return []; }
    }

    function calendarOrdinal(date, timeZone) {
        const formatter = remember(formatterCache, `date:${timeZone}`, () => new Intl.DateTimeFormat('en-US', {
            timeZone, calendar: 'gregory', numberingSystem: 'latn',
            era: 'short', year: 'numeric', month: '2-digit', day: '2-digit'
        }));
        const parts = {};
        for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
        const year = parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year);
        // Construct calendar midnights in UTC, not local time. Local days can be
        // 23 or 25 hours across DST; Date.UTC also special-cases years 0 to 99.
        const midnight = new Date(0);
        midnight.setUTCFullYear(year, Number(parts.month) - 1, Number(parts.day));
        return midnight.getTime() / DAY_MS;
    }

    function calendarDate(entry, date) {
        const normalized = normalizeEntry(entry);
        if (!Number.isFinite(Date.prototype.getTime.call(date))) throw new RangeError('World clock date must be valid');
        // Encode the target zone's Gregorian calendar day, not the instant's UTC date.
        // Splitting at T preserves ISO extended years, including BCE and years above 9999.
        return new Date(calendarOrdinal(date, normalized.timeZone) * DAY_MS).toISOString().split('T')[0];
    }

    function format(entry, date, preferences = {}, locale, deviceTimeZone) {
        const normalized = normalizeEntry(entry);
        if (!Number.isFinite(Date.prototype.getTime.call(date))) throw new RangeError('World clock date must be valid');
        const locales = Intl.getCanonicalLocales(locale);
        const hour12 = typeof preferences.hour12 === 'boolean' ? preferences.hour12 : undefined;
        const showSeconds = preferences.showSeconds === true;
        const key = JSON.stringify(['time', normalized.timeZone, locales, hour12, showSeconds]);
        const formatter = remember(formatterCache, key, () => {
            const options = { timeZone: normalized.timeZone, hour: '2-digit', minute: '2-digit' };
            if (hour12 !== undefined) options.hour12 = hour12;
            if (showSeconds) options.second = '2-digit';
            return new Intl.DateTimeFormat(locales, options);
        });
        const deviceZone = deviceTimeZone === undefined ? new Intl.DateTimeFormat().resolvedOptions().timeZone : canonicalZone(deviceTimeZone);
        return {
            label: normalized.label || normalized.timeZone.split('/').pop().replace(/_/g, ' '),
            time: formatter.format(date),
            dayDifference: calendarOrdinal(date, normalized.timeZone) - calendarOrdinal(date, deviceZone)
        };
    }

    // datetime-local has no offset. Parse only the supported Gregorian shape,
    // then verify every local field: native Date otherwise normalizes invalid
    // dates and DST gaps. Its specified disambiguation selects the earlier fold.
    function parseLocalDateTime(value) {
        if (typeof value !== 'string') return null;
        const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
        if (!match || match[0] !== value) return null;
        const [year, month, day, hour, minute, second] = match.slice(1).map(part => Number(part || 0));
        if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 ||
            hour > 23 || minute > 59 || second > 59) return null;
        // The ISO local string avoids the numeric constructor's 1900 offset for
        // years 00–99, and never treats valueAsNumber as a UTC instant.
        const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] || '00'}`);
        return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day &&
            date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second &&
            date.getMilliseconds() === 0 ? date : null;
    }

    function localDateTimeValue(date) {
        const year = date.getFullYear();
        if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) return '';
        const pad = value => String(value).padStart(2, '0');
        return `${String(year).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
            `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function deviceTimeZone() {
        // Resolve anew so a device-zone change is observed on the existing tick.
        return new Intl.DateTimeFormat().resolvedOptions().timeZone;
    }

    function localZoneDescription(date) {
        const timeZone = deviceTimeZone();
        let offset;
        try {
            const formatter = remember(formatterCache, `offset:${timeZone}`, () => new Intl.DateTimeFormat('en', {
                timeZone, timeZoneName: 'longOffset'
            }));
            offset = formatter.formatToParts(date).find(part => part.type === 'timeZoneName')?.value;
        } catch (_) { /* Older Intl implementations may not support longOffset. */ }
        if (offset === 'GMT') offset = 'GMT+00:00';
        if (!/^GMT[+-]\d{2}:\d{2}(?::\d{2})?$/.test(offset || '')) {
            // Compute from the actual local fields, including historical seconds.
            // getTimezoneOffset() would lose sub-minute offsets in those zones.
            const localAsUTC = new Date(0);
            localAsUTC.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            localAsUTC.setUTCHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
            const seconds = (localAsUTC.getTime() - date.getTime()) / 1000;
            const absolute = Math.abs(seconds), pad = value => String(value).padStart(2, '0');
            offset = `GMT${seconds < 0 ? '-' : '+'}${pad(Math.floor(absolute / 3600))}:${pad(Math.floor(absolute % 3600 / 60))}` +
                (absolute % 60 ? `:${pad(absolute % 60)}` : '');
        }
        return { timeZone, offset };
    }

    return Object.freeze({ MAX_CLOCKS, MAX_LABEL_LENGTH, normalize, safe, format, calendarDate,
        parseLocalDateTime, localDateTimeValue, deviceTimeZone, localZoneDescription });
});
