# Preserve hidden Scratchpad content during read failures

A focused local-content audit reproduced a Scratchpad regression: after a clean, loaded card was intentionally hidden, a background read failure made its saved text visible. A later changed hidden record could be treated as an invented local draft and create a false conflict with another visible saved preview. The issue concerned local display state, not a new network transmission.

The controller now distinguishes passive read failures from owned unfinished writes. That ownership governs reload protection, refresh retention and Retry; the view shows a loaded hidden card only for its enabled state or genuine unfinished local work. A failed initial read may still show a blank Retry state, without saved text. Real drafts, composition, pending/failed writes and Hide recovery, actual conflicts, read-only safeguards and explicit recovery remain supported. Correcting validation-rejected text back to the saved baseline clears its former write ownership.

The original source fails all three new hidden-read-failure/recovery regressions. The integrated suite passes 404 Node tests and 19 Python packaging tests. Nine independent probes cover hidden refresh/Retry, initial blank recovery, composition completion, real conflicts, pending Hide, failed/uncertain writes, unload protection and validation correction. Tasks and Focus did not show the equivalent loaded-state disclosure in the same focused audit.

This failure-path evidence uses sourced production controllers/views in isolated DOM/storage models with synthetic text. Native background-storage fault injection, actual IME and assistive-technology announcements were not verified by this patch. Ordinary native visibility/save behavior is recorded separately with package checks.

## Normal native visibility regression check

The final controller/view were exercised in official Chrome for Testing 155.0.8059.39 on cloud Linux with an owned synthetic profile. A 42-character two-line note reached Saved; hiding through Settings removed the card from the already-open homepage. Re-enabling restored the exact note, and reload retained it. The expanded Data warning displayed all four local modules and wrapped at 1188×848 wide and 510×848 narrow native windows. These are ordinary-path checks, not native injection of the passive-read failure. The owned browser was closed normally; original captures and all 56 runtime hashes were retained.
