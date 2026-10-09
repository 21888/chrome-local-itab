# Local calendar day calculation — 2026-10-09

The previous day-of-year calculation divided elapsed time since a local midnight by 86,400,000 milliseconds. Local days around daylight-saving transitions are not all 24 hours. A July 1, 2026 midnight in America/New_York therefore displayed Day 181 rather than 182; the southern-hemisphere transition could also shift a late-night result.

The clock now extracts the local year, month and day, then performs calendar arithmetic in UTC. It still displays the device-local date, not the UTC date. Existing locale, 12/24-hour, seconds and ISO-week behavior are unchanged. No settings or persistence changed.

Sourced-code regression tests run in four fresh Node processes with UTC, America/Phoenix, America/New_York and Australia/Sydney timezone environments. Fourteen independently specified dates at midnight, noon and 23:59 give 168 cases. They cover DST boundaries, leap day, leap/non-leap year end, exact ordinal/week expectations, repeated formatted output and unchanged input dates. The original implementation fails the New York and Sydney regressions; the fix passes.

The integrated repository passes 262 Node tests and 19 Python packaging tests. These timezone cases execute the real clock class in a Node VM, not a native browser with its operating-system clock changed. No native DST, different browser timezone-database version or assistive-technology verification is claimed.
