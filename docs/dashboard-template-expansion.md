# Six additional dashboard compositions

The catalog now has 21 templates. The six additions change structure, density and navigation rather than only colors:

- **Dispatch / 速览**: a compact top navigation and three-column directory; two columns on medium screens, one on small screens.
- **Today / 今日**: a broad shortcut area beside a separate utility-card column on wide screens. With no enabled cards, shortcuts retain the full width.
- **Bookmark / 书签**: right-hand category navigation with full-width collection sections and paired reading-list rows.
- **Dock / 停靠**: a compact launcher with its category dock below the content, in normal document flow. It is never fixed over content.
- **Mosaic / 拼贴**: an asymmetric two-column board; links are arranged as a small tile grid inside each real category.
- **Paper / 便笺**: a narrow one-column index; category labels sit beside their list on larger screens and stack above it on small screens.

Open **Browse 21 layouts / 浏览 21 种布局** beside the appearance controls on the dashboard or Settings. The small diagrams are layout schematics, not screenshots or sample user content. Browsing and collapsing the gallery do not save anything. On the new-tab dashboard, choosing a template previews current content until Apply; Cancel, Close or Escape discards the preview. The compact template select and the Settings gallery retain immediate-save behavior. See [real-content preview](template-live-preview.md). Escape closes the gallery and returns focus to its summary. The existing select remains available for a compact keyboard workflow.

Every addition supports light and dark appearance. Palettes reuse established tested roles so text, muted text, active categories and accent controls retain AA contrast. The changes do not add permissions, network calls, sample content or stored site data.

Selecting a template changes only the saved appearance preference. It does not apply the separate workspace recommendations, enable or disable cards, reorder sites, change categories, clear tasks or overwrite free-layout coordinates. Grouped appearances use existing real categories in Grid mode; Free mode retains the existing placement behavior. Existing manual layout/style settings and optional later-layer card/background overrides remain independent.

## Verification

Focused checks cover the 21-entry immutable catalog, 42 light/dark storage/import combinations, all template transitions without site/task/coordinate writes, and grouped reuse through editor drafts, menu sessions, filtering and drag operations. CSS rules for the new compositions are scoped to template IDs; tile geometry is restricted to non-free grids. These are logic/source checks, not native browser painting or full release acceptance.
