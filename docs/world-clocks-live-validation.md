# Clock preference live refresh

An already-open homepage now applies saved clock preferences directly. The main clock and world clocks retain one component and one active timer. Clock visibility can be enabled from an initially hidden state, disabled without restarting on focus, and resumed after document visibility changes. No whole-page reload is needed, and unrelated editor drafts and widget state are retained.

Local storage events replace the clock preferences with normalized values. Missing/legacy/corrupt values follow ordinary clock defaults; invalid world-clock lists render empty without breaking the main clock. Only Show clock is applied from the show configuration; unrelated providers are not initialized or exposed by this listener.

One listener subscribes before a narrow initial read of clock/show, closing the dashboard initialization gap. Focus performs the same narrow read. Per-key event revisions prevent an older read from overwriting a newer event for that key, and monotonically numbered reads prevent older read completions from superseding newer ones. Failed reads leave the displayed configuration intact. There are no storage writes, provider initialization, new permissions or network calls in this refresh path.

Six focused sourced-code DOM/event tests cover live main/card updates, retained draft focus, initially hidden → enabled → hidden transitions, one owned instance/timer, hidden-page updates, deleted/legacy/corrupt values, singleton registration, unrelated/sync events, initial-read races, overlapping reads, per-key event ownership and failed reads. Browser behavior still requires the native cross-tab check below.

Native check: keep a homepage open with typed search or another unfinished draft, change world clocks and format preferences in Settings, save, and return. Verify immediate clock/card changes without navigation or lost draft. Toggle Show clock off/on, including a page originally opened with it off. Hide and revisit the page; verify no duplicated updates and unchanged unrelated cards. Reset clock configuration and verify default display/empty card.

The final runtime was exercised in the native cloud browser: removing Tokyo and adding London through Settings immediately changed an already-open homepage while retaining its unfinished Add-task input, without reload. Additional automated lifecycle/race probes remain model evidence, not native fault injection or accessibility verification.
