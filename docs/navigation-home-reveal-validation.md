# Navigation library: explicit home reveal after adding

## User contract

Adding a discovered site still preserves the currently displayed dashboard category. After a verified addition, **View on home** (or **View first on home** for a batch) offers an explicit way to switch to the destination and focus the precise newly added card. It does not open the website. Changing the destination selector later does not retarget the saved result. Duplicate-only results have no new-card action.

The explicit click uses the existing category-navigation behavior: its current-category preference and any normal free-layout missing-position save remain possible. The reveal operation does not rewrite shortcut contents. This is a new optional completion step, not a change to the established add-without-switching contract.

## Identity and interrupted operations

A private receipt belongs to the actual verified add result. It requires an unchanged verified prefix, exact added range, actual adopted object/index and unchanged identifying fields; it never selects by URL alone. Workspace/session generation, storage and layout-controller owner, category navigation, grid and actual rendered target must remain current. Deletion, replacement, hidden/retired sources or unrelated pending operations fail closed.

Click-time checks run before and after dismissal, category switching, focus and scrolling. Exceptions and synchronous source changes produce an unavailable message, not a success claim. A category switch already explicitly requested is not rolled back on a later focus failure.

Free-layout rendering retains its original callback. Its current controller can request a coalesced next-turn availability refresh for the current opening/result only, after the layout promise has settled. This only unhides an eligible action; it does not rerender cards, write data, move focus or poll. Close/destroy cancel the timer, and a retired controller or opening cannot affect a newer panel.

## Evidence and scope

`tests/navigation-library-reveal-flow.test.js` runs the actual StorageManager, navigation library view, ShortcutsComponent and CategoryNavigation together. Free-layout cases additionally use the actual LayoutController and storage change bridge. Synthetic sites and workspaces contain no user data.

- Original missing-entry counterexample: adding ChatGPT into Reading succeeded, preserved Work, and rendered the new card hidden by the current category, but had no explicit completion action. These original successful-add/category assertions remain positive controls.
- Controlled timing counterexample: deliver the same verified add result one event-loop turn later while its real free-layout missing-position save is pending. The new button stayed hidden after layout settlement even though the receipt became eligible. The final one-shot refresh closes this sequence.
- Final complete flow file: **37/37 passed**. Coverage includes new-category batch confirmation, exact first-card selection, duplicates, changed destination, unproven add results, stale sources, throwing/reentrant navigation/focus/scroll, grid and free layout, close/reopen, coalescing without focus or writes, destroy cleanup and retired-controller callbacks.
- Earlier related navigation run: **235/235 passed**, before the final layout-refresh cases. Final aggregate validation is recorded below.

Early fixture failures (unsupported `:not` selector, an absent storage-change bridge and fault injection at the wrong validation boundary) were corrected in the model, not treated as production failures. Their logs and the actual negative cases remain local evidence, excluded from the commit.

### Final aggregate and browser validation

- `node --test tests/*.test.js`: **17,146/17,146 passed**, exit 0 (431 test files).
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91 passed**, exit 0.
- Actual cloud Chromium, full synthetic new-tab page: grid ChatGPT added to Reading while heading remained Work · 1; explicit reveal changed it to Reading · 1 and focused the visible ChatGPT launch button.
- Free placement: Figma added/revealed in Reading, then Claude added to Work while Reading · 2 remained displayed. Explicit reveal changed to Work · 2 and focused the visible Claude launch button. Normal layout save reached Saved with no pending synthetic write.
- DOM-backed fixture readback compared shortcut JSON immediately before/after the latter reveal: unchanged. External-open attempts were empty; global privacy/sync/prompts/collections, other workspace registry/bundle and current workspace tasks/focus/scratchpad/countdown all retained exact synthetic baseline values. Closing/reopening discovery did not retain the old reveal action; already-added Claude stayed disabled.

The controlled one-turn delivery race is covered by the model tests, not claimed as a forced native-browser timing experiment. The first browser attempt hit connection refused before the server was started in the browser's namespace; this was environment setup, not a product failure. The HTTP page then loaded normally in a fresh independent tab. The completed acceptance tab was closed.

The browser fixture uses the full new-tab runtime with synthetic session-backed Chrome APIs and blocked external opening/fetching. Browser acceptance must not be represented as native extension storage, upgrade, real user data or operating-system input-method coverage. No Options import, file picker, screenshot upload, Release or store submission is part of this feature.
