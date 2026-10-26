# Remember the selected site category per workspace

## User-visible issue and scope

The saved-site navigation previously used one origin-wide `localStorage.currentCategory` for every workspace. With the same Work/Reading category IDs in two spaces, selecting Reading in B and returning to A replaced A's prior Work context. A newly opened non-default space could also start filtered by another space's preference. This did not change saved sites, but could hide the cards a user expected to return to.

Three actual `CategoryNavigation` constructor/read/render/selection regressions failed before the change: A → B → A, non-default inheritance of the legacy preference, and recreated workspace identity. The original negative log remains local evidence, not an uploaded artifact.

The preference now uses a versioned key containing the resolved workspace ID and generation. Resolution happens after the original workspace-backed category read, not from an unresolved bootstrap session. A captured store/session and resolved identity reject retired initialization/selection callbacks. Ordinary category filtering, keyboard navigation, and layout reflow remain unchanged.

## Compatibility and lifecycle

- Default can read the old `currentCategory` when its scoped key has no value. Reading does not migrate, delete or rewrite the old key. An explicit selection saves only the scoped key. This legacy fallback is intentionally Default-only, including a Default generation that has no scoped preference yet. The old shared value cannot reconstruct historical per-workspace choices that were never stored; independent choices are retained from this change onward.
- Other workspaces start at All until they have their own preference. Identical category IDs do not share selection.
- Ordinary workspace selection, rename, content edits and fresh page capture retain the generation; the selected category survives them. Workspace restoration/replacement can change generation, retiring the previous scoped preference. No cleanup removes older preference keys.
- If the remembered category is no longer listed, the page falls back to All without rewriting site/category data or the remembered key.
- These preferences are browser-local presentation state, not newly added configuration/backup data. No schema, permission, migration, release version, import or recovery protocol changed.

## Verification

- New complete/context regressions: **14/14 passed**. They include real Workspace Manager/Session plus StorageManager through ordinary edit, rename, switching, reload-like fresh capture, Trash/restore generation change, and unchanged raw storage during a category-only selection. Additional implementation-review negatives proved that a pre-initialization selection must not persist a null key and a ready identity changed while loading must not adopt the old read; both now pass.
- Combined category/navigation/Organizer/dashboard/workspace-bootstrap files: **590/590 passed**, exit 0. This overlaps the new tests and is not a full-suite count.
- First aggregate run ended successfully (**17,235/17,235 Node**, **91/91 Python**, exit 0), but it overlapped the last two initialization-guard changes. It is retained as intermediate evidence, not final consistent-source acceptance. The final fixed-source run subsequently passed **17,237/17,237 Node tests across 436 files** and **91/91 Python tests**, both exit 0. Production and regression-file Git blobs matched before and after that run.
- Final-source native full-page acceptance passed on isolated loopback port 8784: Default Work → second workspace initially All → second Reading → Default Work → reload keeps Work → second keeps Reading → Default keeps Work. Matching category IDs displayed only each workspace’s corresponding card after initialization settled.
- The native fixture contained the final patched `newtab.js` plus 137 unchanged runtime files and two legitimate synthetic workspace bundles. Four ordinary workspace-picker selections wrote registry metadata. Category selection itself did not write the synthetic Chrome-storage backend; both saved-site arrays remained exact, as did Tasks, Scratchpad, Focus, Countdown, global data and the second workspace bundle. No site opened.
- Immediate navigation snapshots can precede the existing delayed category initialization. Settled UI/readback—not that transient All state—was used for assertions, and the return route was repeated without reloading to verify it separately.
- Owned tab 25 and the dedicated server/terminal tab were closed after the stopped marker and shell prompt were verified. Only the original untouched tab remained. Screenshots were inspected in-tool, not uploaded. Synthetic native acceptance is not installed-extension upgrade/import or assistive-technology validation.
