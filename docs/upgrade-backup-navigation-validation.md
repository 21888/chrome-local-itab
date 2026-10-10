# Upgrade backup navigation validation

## Scope

Two same-page shortcuts in **Settings → Privacy → Version & updates**:

- **Go to settings export** selects Data and focuses its heading. The existing Export Settings action remains separate.
- **Go to Countdown export** selects Search & cards and focuses the Countdown heading, above the existing editor and Export text action.

Tasks and Scratchpad have no export controls in their Settings sections. Their precise new-tab export paths are described as text. No new export implementation, backup format, migration, module enabling, permission, network request, import/restore or deletion behavior is introduced.

## Automated checks

Final integration on the 1.1.14 candidate passed 923 Node tests and 49 Python
tests. Native checks below used the feature snapshot before its manifest-only
version bump from 1.1.13.

- 51 focused Node tests pass across upgrade navigation, update views, Settings keyboard/search/import navigation and Countdown views/integration.
- 49 Python packaging/release tests pass.
- Changed JavaScript passes `node --check`; both message catalogs and the unchanged manifest parse as JSON; `git diff --check` passes.
- The new navigation tests use actual HTML button metadata, both catalogs, the real tab routing function and the real setting-name search. They assert section/heading focus, selection, zero export/save/remount side effects, ordinary keyboard activation, held/composing/modifier guards, draft and controller identity, search query/result preservation, source/target validity, and invalidation of delayed initial deep-link focus.
- A negative control preserves the new markup and tests but restores the original navigation and update-view implementation. Relevant navigation/keyboard and checker-failure assertions fail, confirming the tests detect the missing behavior.

These are logic/DOM-model checks. They do not by themselves verify native keyboard synthesis, focus painting or layout.

## Small native checklist

Use an isolated profile and synthetic drafts; keep ordinary browser windows unchanged.

1. In English light and Chinese dark Settings, locate the backup block. Read the Tasks/Scratchpad paths and Focus exclusions. Check narrow-width wrapping and visible keyboard focus.
2. Enter an unsaved ordinary Settings value and an unsaved Countdown title/date. Type a setting-name search, use the results to reach Version & updates, and keep the query visible.
3. Activate each backup shortcut using Enter, Space and a click. Confirm the correct tab is selected and the section heading receives focus and is visible. Holding Enter/Space must not export anything or toggle a module.
4. Return to the edited sections. Confirm drafts, cursor/selection where applicable and search results remain. Confirm the Settings URL has not changed and no page was reloaded or additional tab opened.
5. Only if testing export itself, explicitly activate the existing destination export button and inspect that separate output. Do not interpret navigation as a completed or comprehensive backup.

Native results must be recorded separately; do not describe the checklist as passed without observed results.

## Native result · 2026-10-10

Passed a bounded English/light check in Google Chrome for Testing 155.0.8059.39,
using a fresh isolated profile and the candidate source with the unchanged 1.1.13
manifest. Native keyboard input was used throughout; no headless browser,
injected JavaScript, DevTools protocol or debug socket was used.

- Enter activated the settings shortcut: Data was selected and the visible Data Management heading held focus above Export Settings.
- Space activated the Countdown shortcut: Search & cards was selected and the visible Countdown heading held focus above the existing Export text action.
- The synthetic unsaved Countdown title `draftkeep` remained unchanged across both navigations. Its unsaved status remained visible.
- The existing `countdown` setting-name query and its result remained intact; the Settings URL did not change.
- The isolated profile's Download history was empty after both activations. No export button was activated.
- The QA window was closed via native UI, discarding only the synthetic draft. The ordinary Chromium and file-manager windows remained open.

The ordinary Quote Text field uses an existing change/blur autosave; a synthetic
edit there was not counted as an unsaved-draft preservation test. Generic field,
selection and controller identity preservation are covered by the model tests.
Chinese/dark/narrow layout, sustained key-repeat synthesis, explicit export file
contents and screen-reader announcements were not re-tested natively in this pass.
