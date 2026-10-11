# Native acceptance summary — 2026-10-10

The bounded native gate passed against the frozen 76-file prompt-library candidate (manifest 1.1.21). Release-source 1.1.23 has identical non-manifest runtime bytes; the version field alone changes. This does not mean the entire checklist below was exercised.

[Actual flows, evidence and limitations](qa/prompts-native/acceptance-notes.md) · [Original download comparisons](qa/prompts-native/comparison.json). Reproduce from the repository root with `cd docs/qa/prompts-native && node verify.cjs`.

Aggregate candidate validation: 1351 Node tests and 52 Python tests passed. Native checks cover create/reload, literal plaintext, tag search, variable completion and copy/paste, retained body versions, Trash restore, stale-tab drafts, explicit complete-backup replacement and exact prior-state recovery. Desktop light and a 553-pixel outer-window dark layout were sampled. Unicode/IME, broad visual matrix, quota/write faults and interrupted-restore recovery were not verified natively.

## Original comprehensive checklist (not all executed)

# Prompt library native acceptance

Status: implementation candidate; browser checks below are not yet run. The
focused Node suites model controller, DOM ownership, event routing and storage
faults. They do not prove native Chrome layout, clipboard, IME or disk durability.

## Scope and entry

Open `prompts.html` using the visible **Prompt library / 提示词库** link in new-tab
navigation. The link opens a separate extension tab, preserving work in newtab.
This is one global library across workspaces. This slice intentionally does not
show workspace membership filters or editing controls. It has no model execution,
provider connection, API credential field, auto-upload or new permission.

The page follows the last-used workspace's appearance via read-only raw bundle
access. It does not initialize or mutate workspace settings. Prompt writes use
`LocalItabWorkspaces.manager.createPromptBackend(LocalItabPrompts)`; bootstrap
fails closed when that coordinated backend is missing. Full backup integration
must be present in the candidate before release. The backup link opens
`options.html#data-settings` in another tab, keeping prompt drafts alive.

## Focused tests

```
node --test tests/local-prompts-controller.test.js tests/local-prompts-view.test.js tests/local-prompts-integration.test.js
node --check shared/local-prompts-controller.js
node --check shared/local-prompts-view.js
node --check prompts.js
```

Use synthetic content only. Never capture personal prompts, credentials or
variable values in public screenshots or test logs.

## Native checklist

1. New-tab entry and themes
   - English and Chinese Chrome profiles; light and dark last-used workspace.
   - Widths 1280, 760, 560 and 360 CSS pixels, plus 200% zoom.
   - Entry is visible and fits beside existing appearance/settings controls.
   - Sidebar switches to stacked layout at 560 px; list scroll and document
     scroll remain usable; no clipped focus rings or horizontal overflow.
   - Load directly without any pre-existing workspace migration. Prompt page
     must not initialize workspace bundles merely for a theme read.

2. Create and retain
   - Blank/whitespace title/body: disabled save; no new record.
   - Save title/body, Chinese category, multiple tags, favorite and tool note.
   - Reload and restart browser; body, metadata and stable ID persist offline.
   - Body contains multiline indentation, emoji and `<img src=...>`/`<script>`:
     exact text displays; no HTML, script or network request occurs.

3. Search and browsing
   - Search Chinese body terms and mixed-case English tags/title.
   - Change category/favorite/trash filters; clear filters and verify results.
   - Edit body from old keyword to new; old term disappears and new term matches.
   - Type an unsaved edit, open another prompt/filter and return through draft
     shelf. Original draft and cursor remain; no auto-save occurs.
   - New empty state and no-results state offer working creation/clear controls.

4. Versions and limits
   - Change only title/category/favorite: body version count does not change.
   - Explicit body save increments history; repeated unchanged save does not.
   - Select old version, preview exact text, restore. Later versions remain.
   - Reach 20 versions, edit again: draft stays, Save as new yields a new ID and
     fresh history while old record/history remain. A history restore at the
     cap creates a retained editable draft of the requested old body.
   - 200-record / 2 MiB / 8-recovery errors do not evict, truncate or clear data.
     Export link opens backup settings separately; Trash does not free capacity.

5. Variables and clipboard
   - `Explain {{topic}} to {{reader}}. Again {{topic}}.` shows two fields.
   - Missing values disable completed-copy. Explicit Use empty value satisfies
     one field. Repeated values replace consistently, without template mutation.
   - `\\{{name}}` literal escape, whole-template literal mode, nested/expression
     input, code, Unicode and multiline values all remain plain text.
   - Copy only on click; deny/block clipboard and verify preview stays available
     and Select text works. Repeated clicks while a write is pending copy once.
   - Switch prompts with filled variables; return with all values preserved.
   - Externally change body while values exist: form retains original body plus
     values with notice; Clear values explicitly switches to latest body.
   - Refresh/close/back/new-tab navigation warns for unsaved drafts/values. A
     copied value is still ephemeral and never appears in history/backup.

6. Cross-tab conflicts and uncertain writes
   - Two tabs edit same record. Save B then A: A keeps draft, shows saved review,
     blocks stale save and offers Save as new or confirmed discard.
   - Metadata-only external change while editor is untouched refreshes safely.
   - Open delete/restore-version confirmation, update record in other tab, then
     accept: original reviewed fence rejects action; new content is preserved.
   - Simulate write failure before and after a committed write. Save outcome is
     explicitly unverified; editor is retained and temporarily protected.
     Retry same save uses exactly the frozen command and does not duplicate.
   - While saving, duplicate submit/Ctrl+S cannot write a second operation.
   - Read/quota/validation faults retain drafts and expose actionable status.

7. Trash and recovery
   - Move to Trash confirmation names the item and explains recoverability.
   - Normal results omit it; Trash keeps body/history and Restore preserves ID.
   - Reload in Trash; restore and search restored content.
   - No permanent-delete or silent purge control exists in this slice.
   - During interrupted coordinated backup, prompts fail closed and display the
     recovery link. Open it; inspect/download/restore through backup recovery.
     Prompt tab stays open. Then retry read/save and verify no stale overwrite.

8. Keyboard and focus
   - Tab through header, search, filters, list and form in logical order.
   - List selection focuses the detail heading; New/Edit focuses title.
   - Ctrl/⌘+S saves only from inside editor. IME composition and held repeat
     keys do not submit; Escape while composing does not dismiss confirmation.
   - Modal traps Tab/Shift+Tab, uses labeled dialog semantics, begins on Cancel
     and restores opener focus; backdrop is not an accidental dismissal action.
   - Save disables only safe controls and restores detail/editor focus after
     success/failure; typing variables never replaces the focused textarea.

## Release gate

Run the repository aggregate tests, package reference validation, full prompt
backup roundtrip/restore-fence tests and the native checklist against the exact
combined tree. Do not infer browser acceptance or release readiness from these
focused test counts or the presence of UI files.
