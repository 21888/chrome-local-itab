(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MonthCalendar = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';

    function assertMonth(year, monthIndex) {
        if (!Number.isInteger(year) || year < 1 || year > 9999 ||
            !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
            throw new RangeError('Calendar month must have a year from 1 to 9999 and a month from 0 to 11');
        }
    }

    function utcDate(year, monthIndex, day = 1) {
        // Date.UTC/new Date(year, ...) reinterpret years 0–99 as 1900–1999.
        // UTC calendar arithmetic also avoids 23/25-hour local days at DST.
        const date = new Date(0);
        date.setUTCFullYear(year, monthIndex, day);
        return date;
    }

    function localTuple(date) {
        if (!Number.isFinite(Date.prototype.getTime.call(date))) {
            throw new RangeError('Calendar date must be valid');
        }
        return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
    }

    function shift(year, monthIndex, delta) {
        assertMonth(year, monthIndex);
        if (!Number.isSafeInteger(delta)) throw new RangeError('Calendar month shift must be a safe integer');
        const index = Math.max(0, Math.min(9999 * 12 - 1, (year - 1) * 12 + monthIndex + delta));
        return { year: Math.floor(index / 12) + 1, month: index % 12 };
    }

    function firstDayOfWeek(locale) {
        try {
            const resolved = new Intl.Locale(locale);
            // Engines ship either the current method or the earlier accessor.
            const readers = [
                () => typeof resolved.getWeekInfo === 'function' ? resolved.getWeekInfo() : null,
                () => resolved.weekInfo
            ];
            for (const read of readers) {
                try {
                    const info = read();
                    if (info && Number.isInteger(info.firstDay) && info.firstDay >= 1 && info.firstDay <= 7) {
                        return info.firstDay % 7;
                    }
                } catch (_) { /* Try the other API before using the fallback. */ }
            }
        } catch (_) { /* Older engines may lack Intl.Locale or week data. */ }
        // Deterministic fallback for engines without usable week info:
        // English starts Sunday; zh-CN and all other/unknown locales Monday.
        return typeof locale === 'string' && /^en(?:-|$)/i.test(locale) ? 0 : 1;
    }

    function month(year, monthIndex, locale, todayLocalTuple) {
        assertMonth(year, monthIndex);
        const first = utcDate(year, monthIndex);
        const dayCount = utcDate(year, monthIndex + 1, 0).getUTCDate();
        const weekStart = firstDayOfWeek(locale);
        const offset = (first.getUTCDay() - weekStart + 7) % 7;
        const options = { calendar: 'gregory', timeZone: 'UTC' };
        const shortFormatter = new Intl.DateTimeFormat(locale, { ...options, weekday: 'short' });
        const longFormatter = new Intl.DateTimeFormat(locale, { ...options, weekday: 'long' });
        const weekdays = Array.from({ length: 7 }, (_, index) => {
            // January 1, 2023 was Sunday. Labels share the same UTC convention
            // as the cells, regardless of the device time zone or calendar.
            const date = utcDate(2023, 0, 1 + (weekStart + index) % 7);
            return { short: shortFormatter.format(date), long: longFormatter.format(date) };
        });
        const weeks = Array.from({ length: Math.ceil((offset + dayCount) / 7) }, (_, week) =>
            Array.from({ length: 7 }, (_, weekday) => {
                const day = week * 7 + weekday - offset + 1;
                return day >= 1 && day <= dayCount ? day : null;
            }));
        const todayDay = todayLocalTuple && todayLocalTuple.year === year && todayLocalTuple.month === monthIndex &&
            Number.isInteger(todayLocalTuple.day) && todayLocalTuple.day >= 1 && todayLocalTuple.day <= dayCount
            ? todayLocalTuple.day : null;
        return {
            caption: new Intl.DateTimeFormat(locale, { ...options, month: 'long', year: 'numeric' }).format(first),
            weekdays,
            weeks,
            todayDay,
            previousDisabled: year === 1 && monthIndex === 0,
            nextDisabled: year === 9999 && monthIndex === 11
        };
    }

    return Object.freeze({ utcDate, localTuple, shift, firstDayOfWeek, month });
});
