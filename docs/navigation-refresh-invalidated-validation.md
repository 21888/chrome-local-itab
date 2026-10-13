# Read-only navigation refresh after an external page change

## Confirmed problem

In 1.1.115, renaming a synthetic personal category on another page invalidated the first page's layout controller. Its still-open navigation library silently rejected Refresh saved state and retained the old category name. The underlying page correctly required a reload for layout writes, but that warning was obscured by the library dialog.

A regression uses the actual layout Controller with the navigation view: advancing the external generation sets `invalidated` and `modePending`; the old code performs no new snapshot read and leaves its status empty.

## Scope and safety

An explicit refresh may read a fresh navigation snapshot when the known layout Controller is invalidated and otherwise idle. It does not clear or adopt the layout write fence. The dialog explains that its saved state is refreshed for viewing and the whole page must be reloaded before adding sites or adjusting layout. Add and review controls and callbacks remain blocked. Closing and reopening the library alone is not a replacement for reloading the page.

Pending writes, unknown save outcomes, failed layout changes, timers, external holds, identity work, patches, positions, and unrecognized controller states remain blocked. Read completion checks workspace/lifecycle identity, controller identity/version/generation, and a new private in-memory mutation epoch. Every shortcut hold advances that BigInt epoch, including nested or subsequently failed holds; it has no numeric wraparound and is never stored or included in snapshots. A read that overlaps a completed mutation is rejected even after pending flags return to idle.

No permissions, provider calls, storage schema, automatic writes, or layout lock semantics are changed.

## Verification

- Actual-Controller regressions cover bilingual external rename refresh, preserved invalidation, disabled Add/review and direct callback guards, each pending-state rejection, unknown save lock, resolve/reject fencing, controller replacement, completed and failed transient holds, and epoch nesting/large values.
- Frozen-source strict Node regression: 2,820/2,820 passed with a 1 GiB heap and serial test execution; Python: 81/81. The six new regression groups passed. Independent review passed 156 view/layout tests and 22 additional actual-Controller cases.
- The development package contains exactly 113 allowlisted runtime files and passed independent package verification. JavaScript syntax, locale JSON and diff checks passed.
- Native verification of this fix is pending. The original cross-page problem was observed in the browser; automated success is not a claim that the repaired browser flow has passed.
