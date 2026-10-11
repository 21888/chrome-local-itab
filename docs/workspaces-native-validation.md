# Workspace native validation

Bounded cloud-desktop check on 2026-10-10 using official Chrome for Testing 155.0.8059.39 and a disposable synthetic profile. Runtime: manifest 1.1.21 plus the unpublished true-workspace candidate, 69 frozen assets. This is candidate evidence, not screenshots from a released 1.1.22.

## Verified before archive replacement

- Real published 1.1.21 state was created using normal UI, then upgraded in the same extension directory while Chrome was closed. Native pre/post exports match all five portable modules exactly after removing only schema 1 device-global privacy. Saved sites, both free positions, local image, task IDs/states/pin/two history copies, Unicode note, Countdown and Focus preferences survived. The paused 16:53 Focus session also survived visually.
- Created an empty workspace; added a distinct site, task and note; saved a Countdown date/title. Same-name duplication and targeted rename worked. Existing tabs stayed pinned after another tab chose a workspace and after reload; a new tab opened the last choice.
- Countdown Stay retained its draft; Save and switch persisted a valid draft. Invalid 2031-02-30 refused Save and switch without navigation; explicit Discard then navigated. The next actual archive retained the saved 2031-02-03 value.
- Duplicating a visibly running 23-minute Focus workspace kept the original running; the copy was ready at 23:00. Synthetic sessions were reset before archive replacement.
- Moving Lab to Trash from another tab retained its unsaved task draft and refused Add. Its actual page-text export contains the exact draft. Restore made Lab available in a fresh tab; the old tab stayed invalid and could not save. Lab was moved back to Trash for archive coverage.
- Native archive S contains 3 live workspaces and 1 in Trash, all five modules, 5 sites, one local image, 5 active/1 completed/1 removed task and 2 task-history copies. Archive T differs only in one deliberately changed Scratchpad string (apart from exportedAt).

## Archive and visual gate: passed

The native review accurately showed all live names, Lab in Trash and incoming/current counts. After explicit replacement, the UI reported restored and verified. An explicit Reload was followed by a new native export U. Its configuration, sites, local image, notes, Countdown, Focus preferences, Task IDs/content/order/states/pin/history and workspace names/order/live-versus-Trash state match S exactly. Seven live task record version tokens were regenerated (including the current records in Trash), and workspace `updatedAt` timestamps advanced. No other payload difference was allowed. The downloaded pre-restore recovery R matches T exactly except the envelope `exportedAt`.

Light Clarity and Folio entry points were inspected. Dark Clarity's workspace bar and picker fit a 510 × 846 native window. Tab showed a clear focus ring; Escape closed the picker and returned focus to its opener. The native Chrome minimum width in this check was 510 pixels; this is not 390-CSS-pixel coverage. All owned browser and file-manager windows were closed after preserving the evidence.

No reproducible product defect was found in this bounded run. Native file-chooser Return attempts did not select the typed path; explicit Open succeeded, so that input issue is not classified as an extension defect.

## Reproduce the evidence comparisons

Run `python3 docs/qa/workspaces-native/verify.py`. The verifier reads only the preserved original synthetic exports, never a browser profile. [Machine-readable results](qa/workspaces-native/comparison.json), [source/browser/export hashes](qa/workspaces-native/comparison-source-hashes.json), [capture metadata](qa/workspaces-native/captures.json), and [public upgrade-source provenance](qa/workspaces-native/public-1.1.21-provenance.json) are included.

Key originals: [Folio workspace bar](qa/workspaces-native/screenshots/05-folio-workspace-bar.jpg), [manager](qa/workspaces-native/screenshots/15-workspace-manager-light.jpg), [dark dashboard](qa/workspaces-native/screenshots/16-workspace-dashboard-dark.jpg), [narrow keyboard picker](qa/workspaces-native/screenshots/18-workspace-picker-dark-narrow.jpg), [failed invalid draft](qa/workspaces-native/screenshots/12-invalid-draft-switch-refused.jpg), [Trash write refusal](qa/workspaces-native/screenshots/10-trash-draft-write-refused.jpg), and [verified restore](qa/workspaces-native/screenshots/14-workspaces-restored.jpg).

## Scope limits

No accounts or providers were used. No browser storage was seeded, no injected JavaScript, headless browser, debug socket, direct database access or fault injection was used. Native actions were ordinary controls and OS file dialogs; downloaded synthetic files were compared offline. This bounded run does not claim the entire native checklist: legacy conflict/downgrade, schema 1 destination selection on the workspace candidate, partial-module restore, preview cancellation, current-workspace deletion, provider/Sync behavior, IME and asynchronous races, exhaustive draft types, all gallery templates, quote-only mode, Chinese, 390 CSS-pixel width and 200% zoom remain untested here. The earlier complete-backup report covers prior single-workspace module selection; it is not substituted for workspace-specific native coverage.
