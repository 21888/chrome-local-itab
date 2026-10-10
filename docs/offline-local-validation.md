# Bounded native offline validation

2026-10-10, official Chrome for Testing 155.0.8059.39 on cloud Linux; English/light Clarity, Grid, synthetic local records. Frozen runtime `85f91436900fa0deb2c6ad753d1cb5b71efb1de9` remained byte-identical across all 60 files to source `a22858e` and subsequent docs-only `68a4cf1`.

## Method

A new signed-out profile loaded the extension normally before the observation boundary. Visible DevTools Network controls then selected Offline, Keep log and Disable cache. The log was cleared once before the first tested reload and preserved thereafter. Settings navigated the same target; Offline remained visible and was explicitly reselected before its tested reload. No global networking/security settings changed. This is per-target offline emulation, not offline first installation or a disconnected operating system.

Online favicons and Chrome Sync were unchecked, Drive was not connected and no online card was enabled. Only synthetic records and a reserved `.invalid` URL were used. No provider search or saved URL was activated.

## Passed observed workflows

- Default dashboard reloaded offline with clock, search and empty shortcuts.
- Settings enabled Tasks/Focus and disabled Show Seconds; save and offline reload retained the settings.
- A task was added, pinned, completed through Next up, restored with Undo, edited to `OFFLINE-QA-BETA` and reloaded. Exactly one active edited task remained; Undo did not restore its former pin.
- Focus duration saved as one minute without auto-start. Running was paused at 0:53; offline reload retained the paused remainder. Resume reached interval complete at 0:00, which survived another reload without restarting.
- A saved `Offline Guide` shortcut with local text icon `OG` remained searchable in Finder after reload. Enter in the query did not activate the destination; Escape and reopening worked. A web-search sentinel was typed and cleared without submitting.

## Network and diagnostic limits

The preserved page panel contained 375 requests: native filters matched all with `scheme:chrome-extension`, and zero with HTTPS, HTTP or negated extension scheme. This records only the observed page target and interactions, not all browser/background traffic. Console snapshots at documented dashboard/Settings checkpoints displayed normal initialization without warnings/errors; they are not an exhaustive preserved console history.

Native HAR export returned only an empty 155-byte envelope despite the visible request rows. It is unusable as a request trace. Network observations above rely on original panel screenshots, not that HAR.

Chrome's Issues panel listed 12 controls missing id/name as optional browser-autofill metadata advice. The native sampled Tasks Add textarea had `aria-label="Add a task"` and worked. A read-only source audit located 12 non-file dashboard controls, including hidden/readonly fields, all with `aria-label` or wrapping labels. This is not a screen-reader certification, and the advisory alone is not an accessibility or offline failure. No metadata change was made merely to silence it.

## Evidence and remaining coverage

81 unmodified 1364×1024 native desktop JPEGs, screenshot hashes and frozen-runtime integrity records document the run. Full report SHA256: `a1656932a637d2e3aeaeca609f84447ef2bea538a9aaf533c6cc22b5a1479783`. An initial Resume click missed a transitioning control; it is explicitly recorded as test input, followed by re-observation and a successful Resume. Setup/transitional captures are distinguished from stable outcomes. Owned test windows were closed, preserving existing desktop windows.

Not covered: OS-level disconnection, first-ever offline install, browser restart, every template/locale, live Sync/Drive/providers, cross-tab timing, long-duration timer accuracy, screen readers or all recovery/race cases. A separate code audit found startup waits for Sync metadata even with Sync disabled; a rejected synthetic read recovered local configuration, while an artificially unresolved read delayed initialization. That is a resilience coupling, not evidence of an ordinary native offline hang, and this run's offline reloads succeeded.
