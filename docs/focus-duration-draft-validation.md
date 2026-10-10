# Focus duration draft protection

Candidate based on `818234f34baa1bdf65a4b82916423f5f26a0c64a` (2026-10-09).

## Behavior

- Typing minutes, including clearing the field, now owns a page-local draft. Refreshes and visibility renders retain it; returning to the saved value releases it without a write.
- The existing native `change` behavior is retained: valid whole minutes commit, invalid committed input restores saved minutes and shows the existing validation message. Draft tracking does not start a timer.
- Failed saves retain editable minutes. **Read latest state** still reads only; it does not replay an uncertain write. Use **Save minutes** or edit the field again to submit a new duration change. A value confirmed present in saved state is clean.
- **Save minutes** appears beside a ready interval’s unsaved draft. Start stays disabled until that draft is committed or restored to the saved value, so a visible `30` cannot silently start a saved 25-minute interval. Saving never starts the timer; confirmed `030` normalizes to `30`. Invalid Save restores the saved value with the existing validation message.
- Drafts belong to their Focus/Break phase. If another page changes phase or starts an interval, the visible timer remains authoritative and a short English/Chinese notice explains that the draft is retained. Returning to that phase in Ready restores it. Stale input-change events cannot apply a previous phase's draft or restart/alter a running interval.
- Configuration reloads defer while a draft or write remains. Explicit reload can discard a draft only after confirmation, and cannot bypass a pending write. Browser departure warnings are best effort; a clean saved running timer does not block departure. No unload-time save is attempted.
- Explicit keyboard Save restores focus to Start only after confirmed success while its action still owns focus. Newer focus/input, hidden/detached/destroyed views, errors or later remote revisions prevent restoration. Ordinary blur autosave never claims Start focus.
- Destroying the view releases its drafts/listeners/tick; an already pending controller write stays guarded until settlement.

No timer core, controller, storage key/schema, permission, manifest version, Tasks code, provider, or network changes.

## Automated evidence

Baseline: 616 Node tests and 19 Python packaging tests passed. Three new tests failed against the unchanged baseline: typed `30` was falsely clean, an unfocused refresh replaced it with saved `25`, and automatic reload proceeded.

Candidate: 638 Node tests (including 22 new duration-draft tests) and 19 Python packaging tests passed, with no failures or skips. The new tests execute the real view, controller, store and lifecycle; they cover typing/clearing/invalid values, input/change ownership, explicit Save/held-key/pending guards, restored/failed drafts blocking Start, numeric normalization (including uncertain saved writes), conservative explicit-Save-to-Start focus ownership, pending reload cancellation, success, read/write failure, uncertain saved writes, conflict/retry, external phase/duration/start/pause/reset, hide/show, clean-running departure, settings-only pending writes, destroy, and actual immediate/delayed configuration reload listeners.

After integration with the pinned-task completion change, the production-source suite passed 665 Node tests and 19 Python packaging tests.

Independent read-only re-review passed all 47 Focus/lifecycle tests and found no remaining concrete regression. It identified the noncanonical uncertain-save edge before the final fix and test were added.

Commands:

- `node --test tests/*.test.js`
- `python3 -m unittest discover -s tests -p '*_test.py'`
- `node --check` for every JavaScript file
- Parse manifest and all locale JSON, patch whitespace validation, and runtime ZIP creation/verification

These automated checks are deterministic DOM/event models, not native browser or assistive-technology evidence.

## Bounded native observations

Official Chrome for Testing 155 on cloud Linux, using an isolated synthetic-data profile, verified that typing `30` reveals Save minutes and disables Start while the committed timer remains `25:00`. Native Tab blur saves `30:00` in Ready state without starting a timer. Both states were visually reviewed, alongside the new pinned-task control. Normal tab switching commits valid minutes on blur in this browser; that route does not establish native retained-draft race coverage. Remote interleavings, failure/retry and explicit restored-draft Save focus remain model-tested unless separately recorded. No assistive-technology or exhaustive cross-browser pass is claimed.

Further native acceptance: type `30` without blur, change settings in another tab and return, cancel intentional reload, commit on blur and verify Ready `30:00`, try `030` and invalid minutes with Save/blur, and use two tabs to start/change phase while one retains a draft. Verify the retained-draft notice, current timer ownership, and explicit Save recovery when the original phase becomes Ready; Start must remain disabled until the displayed draft is committed. Use Enter/Space and hold each activation key on Save, verify focus returns to Start after an explicit successful save, then deliberately start the saved timer. Separately check native input-blur/click ordering when clicking Save while editing and native hide/blur ordering when settings hides Focus. Also verify native departure cancellation after a user gesture.
