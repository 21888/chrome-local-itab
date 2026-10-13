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
- Limited Chinese-light native verification used a reversible category-name round trip on a second page. Two explicit refreshes updated saved locations and destination names while preserving query and category draft; reload-required write guards stayed active. This exposed the checkbox issue addressed below.

## Follow-up: checkbox consistency

The repaired read-only refresh was tested with a reversible cross-page synthetic category rename. Its two refreshes updated saved locations and destination names while preserving the browsing draft and keeping Add/review locked. This exposed a separate visual inconsistency: a result checkbox could appear checked even though its guarded change callback rejected the selection and the count remained zero.

Result checkbox availability now follows the same selection guard. A live checkbox change rejected after an intervening state change restores its actual selection value; stale controls cannot affect the current opening. Focused actual-Controller regressions cover selected and unselected rows in read-only mode, invalidation before refresh, and ordinary selection/deselection. The follow-up native retest verified ordinary PhET selection 0→1→0, then cross-page rename and refresh disabled the checkbox without phantom checking or selected fill. The count remained zero and Add/review stayed disabled. Restoring the original name and refreshing again restored the target name; an ordinary page reload recovered the baseline.

The frozen follow-up passed 2,822/2,822 strict serial Node tests, 81/81 Python tests and 113-file package verification. Independent review passed 157 view tests and six additional actual-Controller cases. The native retest covered the zero-selected read-only state; previously selected rows, faults and concurrency remain automated-only. Exactly two category-name UI edits and two refresh activations completed the reversible round trip; these are not internal write-transaction counts. No shortcuts were added, moved or deleted.
