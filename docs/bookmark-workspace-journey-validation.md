# Bookmark import in an already-open workspace

## Representative integration evidence (2026-10-24)

`node --test tests/bookmark-import-workspace-journey.test.js` exercises one
synthetic complete journey, not another parser or failure matrix:

- The production Workspace manager creates a named workspace. Separate pinned
  Sessions back Settings and an already-open Finder. A nonempty Tasks record and
  a local quote are seeded through the real scoped storage path.
- A Node `File` enters the production bookmark View, Options preparation and
  explicit Apply. Review writes nothing. Apply uses the real planner and
  `StorageManager.appendBookmarkImport`, producing one workspace-bundle write.
- The actual Session storage-change propagation updates the existing Finder
  without a manual refresh or snapshot injection. The imported title, full URL
  and newly created `Research (2)` category are displayed. Existing same-name
  categories are not merged; this is not selective import from the review filter.
- Existing links/categories keep their prefix and identity. Every other scoped
  field, including the nonempty task, stays equal; the other workspace's entire
  values remain equal. No provider call occurs.
- Finder intentionally retains the open shortcut component's original links
  reference and content. It does not adopt imported records into existing tiles,
  so this check does not require or claim an automatic dashboard tile redraw.

The journey passed without a production change. Fixture preparation initially
hit the real non-default-workspace provider boundary when it included `sync`;
setup was corrected to submit scoped keys only, not to bypass that boundary.
A second fixture correction reads descendant text explicitly because the small
DOM model does not synthesize browser `textContent` for container nodes.

This uses synthetic RAM, modeled DOM, actual Node file bytes and production
subscription code. It does not prove native file-picker or keyboard behavior,
real browser cross-tab delivery, disk persistence, layout geometry, installed
extension upgrades, or recovery of the historical data-loss incident. No site
navigation, clipboard operation, provider request or permission change is made.
