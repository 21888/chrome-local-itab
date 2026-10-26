# Library and shortcut complete journeys (2026-10-26)

## Prompt -> exact-version Collection

Actual final runtime: 136 unchanged files plus two production HTML pages with
synthetic bridge injections only. Chromium loopback 8786, owned tabs 27 and 28.
Shared origin-local synthetic storage adapts native storage events to the real
controllers; actual Web Locks are used. This is not installed-extension storage
or upgrade validation. External fetch and window.open are denied; no model run,
permission request, file input, download, or original Options interaction.

Passed the complete ordinary flow with no production defect:
1. Create a synthetic prompt with `Original {{topic}}\n原文 🧪`; explicit Save.
2. Edit body to `Current {{topic}} version two`; explicit Save. Two writes total.
3. Open history: v1 shown, preview remains current v2. Use this version explicitly
   selects v1. Fill topic `Synthetic example`: preview is exact v1 substitution.
4. Actual Save a result for this version link opens tab 28. New Collection title
   and body empty; exact original v1 template shown. Still only two writes.
5. Enter synthetic title/body and explicitly Save locally. Third write adds one
   result whose promptRef equals the original prompt ID + v1 ID, not current v2.
6. Original tab automatically shows the saved result under v1. Preview variable
   stays filled. Return to current v2 shows no linked result; return to v1 keeps
   filled preview and exact saved result link.
7. Both workspace personal modules, second workspace, privacy and sync equal
   seed. Changes confined to explicit Prompt and Collection records (3 writes).

Closing the Prompt tab correctly displayed the browser beforeunload warning for
temporary preview values. The initial close was not completion: native screenshot
confirmed the owned 8786 URL and the Leave choice; explicitly choosing Leave then
closed it. No stored prompt/result was discarded. Final inventory contains only
original tab 9. Both owned browser tabs closed; server Ctrl-C ended with visible marker
PROMPT_RESULT_8786_STOPPED; dedicated Terminal tab closed. Original tab 9 remains.
Model counterpart tests/prompt-result-complete-journey.test.js passed 1/1. This is a
combined batch QA result, not a new product feature.

## Single-shortcut edit, category return, delete and Undo

A separate complete-page fixture on port 8787 used three synthetic identified
shortcuts: two with the same title and URL but different icons and immutable
layout IDs, plus an unrelated Reading card. The actual production shortcut
editor, category controls, deletion review, storage transaction and Undo ran.

1. Select Work and use the second twin's More actions -> Edit. Its icon is B.
2. Change its title and category to Reading, then Save: one write. Work remains
   selected and shows only the untouched first twin (A). The edited card is not
   silently mistaken for that same-URL twin or opened.
3. Select Reading and open Delete on the edited card. The review names the
   edited title and exact URL. Confirming removes only this card: second write.
4. Undo delete restores its edited fields, immutable layout ID and original
   overall array position: third write. Reading remains selected and shows both
   its restored card and the unrelated Reading card.
5. The first twin, unrelated card, all four personal modules, global privacy,
   sync, Prompts, Collections and second workspace remain unchanged. No website
   opens. Category selection still uses the normal local preference API; the
   three-write count refers to synthetic Chrome-storage transactions, not all
   browser localStorage preferences.

The model uses actual StorageManager persistence with the existing dashboard
DOM harness. Geometry and HTML editor construction remain modeled; the native
run above covers the actual complete page. The first model seed was legacy
unidentified data: its first valid edit normally added layout IDs, so an exact
whole-object preservation expectation was incorrect. This was not a product
failure. The final seed uses valid schema 2 IDs and a position map for every
card; a preliminary incomplete map was correctly rejected by production
validation. Neither observation changed production code.

Owned tab 29, server 8787 and dedicated Terminal tab were closed, with visible
SHORTCUT_8787_STOPPED and final inventory containing only the original tab.
No original Options interaction, real user content, screenshot upload, model
request, provider permission, extension upgrade or release was involved.

## Final model regression scope

The two complete-journey files plus the existing exact-result handoff, shortcut
preview, Undo storage and Undo UI files passed **24/24 Node tests across six
files**, exit 0, after adopting the Layout reload fix. The previous Layout final
suite (**17,243 Node + 91 Python**) predates these two new tests and is not
claimed to include them. This commit changes tests and this combined validation
document only; it is not two new product features and fixes no demonstrated
production defect.
