# Focus draft phase ownership during workspace switching — 2026-10-28

## Reproduced failure

Baseline: `e0bcf86d05843a68dbb6e47aa89cc28bebbade4a` (tree `c28d0b2696f85dba96014d6a540a96ef7c6f7ac3`).

The new regression uses the real Workspace Manager/Session, Focus Store/Controller/View, shared content lifecycle and workspace picker. Its only storage, lock and DOM transport is synthetic.

1. Keep an unsaved `30`-minute Focus draft.
2. A second captured session changes the saved phase to Break. The view correctly retains the Focus draft and displays the current saved Break duration, `5`.
3. Choose **Save and switch** in the actual workspace picker.

Before the fix, the lifecycle mistook “one retained duration draft” for “a draft belonging to the current phase.” It wrote the unchanged Break duration, adding an unintended revision, while retaining the Focus draft and refusing departure. The baseline test failed because backing writes increased from 8 to 9. **This proves a wrong-phase write/revision, not lost draft data.**

## Minimal correction

The existing ordinary-save path now also requires the single retained draft to belong to the controller's current phase. Existing ready-state, valid-minute, pending-operation and Store revision checks remain in place. Other-phase drafts are neither moved nor cleared. Multiple drafts, invalid values, running intervals and conflicts do not authorize an implicit save, phase change or departure.

The existing English/Chinese retained-draft message now tells the user to wait until the timer is ready, use **Interval** to return to the original interval, and choose **Save minutes**. This is guidance, not an automatic action. Returning to the correct ready phase still permits either an explicit ordinary save or **Save and switch**.

No Store, Controller, workspace schema, recovery-copy format, timer calculation, provider, permission, manifest version or network behavior changed.

## Modeled complete-flow evidence

`tests/focus-workspace-draft-flow.test.js` adds 17 tests:

- Focus draft while Break is current, and the reciprocal Break/Focus case: exact raw state and write count remain unchanged; the draft and Stay action remain available.
- Current-phase valid drafts in both intervals: one exact revision, no timer start, original legacy/recovery copies retained, other workspace unchanged, actual switch away and back with newly mounted views displaying saved minutes.
- Stay, deliberately return to the original phase, then successfully Save and switch; raw `030` normalizes only after successful save.
- Two phase-bound drafts require deliberate saving in their original editors; no automatic two-phase save.
- Empty, zero, fractional and out-of-range input remains raw and guarded.
- Actual backing write rejection retains the draft and workspace; a later explicit Save and switch succeeds.
- Actual stale-revision conflict exposes the newer phase without submitting the old draft to that phase. Another Save and switch makes no wrong-phase write.
- After returning to the original phase, another real session changes phase again before the save decision. The newer phase/revision remains exact; deliberate return and save later succeeds.
- English/Chinese retained-draft guidance names the visible Interval and Save minutes controls; following that path succeeds without an automatic write.
- A clean running timer permits departure without pausing, restarting or changing its deadline. A retained draft while another session starts the timer blocks Save and switch without rewriting the running timer.

The original red test/log and an intermediate cross-realm test-assertion failure are retained outside the repository. The latter was corrected by creating host-realm arrays for comparison, not by changing production behavior.

Final aggregate results:

- New complete-flow tests plus existing duration-draft tests: **39/39** (17 new cases and 22 existing).
- Related Focus/lifecycle/workspace run: **255/255**.
- Complete `node --test --test-concurrency=1 tests/*.test.js`: terminal summary **17,564/17,564** across **449 test files**, zero failure/cancellation/skip/TODO; duration 432,375.709084 ms.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91**, `OK`.
- Syntax checks for **556 JavaScript files**, parsing of the manifest and both locale JSON files, and `git diff --check` passed. The six changed production/test file SHA256 values matched before and after the full run.

The full Node result is taken from its retained terminal test-runner summary; the original shell exit value was not retained. Static checks and the terminal-summary verifier exited 0. No partial running log is counted as a completed pass.

## Acceptance boundary

These checks use deterministic synthetic storage/Web Locks/DOM transport and stable model clocks. They do not establish native input-blur/click ordering, real browser navigation or visibility behavior, actual extension upgrade/persistence, real-user recovery, or the cause/resolution of the historical version-71 incident.

When the existing native exact-package gate becomes available through authorized access, the remaining acceptance is: retain minutes in one page, change the phase in another page, open the workspace switch decision, confirm no wrong-phase save, choose Stay, return to the original ready interval and save, then switch away/back and verify both interval durations and other workspace contents. Also check native blur/change ordering around that decision and retain the running timer deadline. The existing `chrome://extensions` denial is not retried or bypassed for this work.

No GUI, screenshot, CI, release, store submission, external account or user-device action was performed for this feature. Version remains `1.1.160`; a source commit or development ZIP is not a release or store acceptance.
