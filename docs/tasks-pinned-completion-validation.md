# Complete the pinned task — validation

Date: 2026-10-09. Baseline: `818234f`. Manifest remains `1.1.7`.

## Behavior and scope

The Tasks card shows a localized **Complete** button beside **Next up** whenever an active task is pinned. It also works for a pinned task outside the collapsed four-row list or current filter. The text remains noninteractive. The native button supports Enter and Space; held-key and duplicate/pending activation are guarded.

The dedicated `completePinned` command checks the expected pin, task ID, task version and active state under the existing storage lock. Pin changes do not alter task versions, so a version check alone would be insufficient. Ordinary row completion retains its existing behavior. Successful completion clears the pin without selecting a replacement.

A confirmed result returns focus to quick entry only if the initiating Complete or Retry control still owns focus. Newer focus, pointer/keyboard intent, page hiding, disposal and observed or intervening remote changes relinquish that ownership. Storage notifications and failed/uncertain writes never independently trigger return focus. Exact-command retry retains existing receipt-based idempotency.

Filter text, collapsed/expanded state, task order, add/edit drafts, section-open state and recovery content are preserved. No schema, manifest, permission, network or provider behavior changed. English and Simplified Chinese reuse the existing Complete translation.

## Automated checks

- Full Node suite: **643 passed, 0 failed, 0 skipped**.
- New focused suite: **27 passed**. Coverage includes pinned Task 5, duplicate task text, English/Chinese control names, noninteractive text, atomic lock-wait conflicts, remote repin/unpin/edit/remove/complete, delayed notifications, detached controls, repeated activations, write/READ/VERIFY failures, exact retry and focus ownership.
- Existing real-adapter privacy tests now include `completePinned` with Sync enabled and disabled; writes remain limited to the existing device-local Tasks key and do not invoke providers.
- Python packaging tests: **19 passed**.
- JavaScript syntax and manifest/locale JSON checks passed.
- Independent read-only review found no remaining concrete issues after the explicit-body-focus regression was fixed.

The DOM tests model activation and explicitly dispatch document-level ownership events. They do not prove native Enter/Space behavior, focus painting, layout or assistive-technology announcements.

## Bounded native checks

Official Chrome for Testing 155 on cloud Linux verified the pinned fifth task outside the collapsed four-row preview. Enter and Space completed only that task, cleared its pin without a replacement, preserved a quick-entry draft and returned focus to that draft. The Space run retained a filter that excluded the pinned task. Clicking/double-clicking the pinned text selected text without completing anything. Light and dark wide-layout screenshots were reviewed. A native responsive toolbar at 400 × 618 showed the card and single-line pinned text/button fitting. A separate transient darkened frame was excluded from visual evidence. Long multiline narrow content and exhaustive mobile layouts were not tested.

These observations use synthetic local data in one isolated browser profile. A Chinese browser locale also rendered the 完成 action; native Enter/Space completion was exercised in English. Remote-race and assistive-technology claims remain limited to the coverage above.

## Further native coverage

Load this source as an unpacked extension in an isolated test profile. With synthetic tasks:

1. Pin Task 5 with the list collapsed; complete it by Enter, then separately Space. Confirm exactly that ID completes, the pin clears, and no task is automatically pinned.
2. Check long multiline text and the visible button in light/dark and narrow layouts, in English and Chinese. Confirm the text itself does nothing on click/double-click.
3. Re-pin, unpin, edit, remove and complete from a second page before activating the original page's action. Confirm the newer state wins.
4. Check repeated keys/clicks, filtered and expanded lists, retained drafts, and focus after success versus a newer focus choice.

No exhaustive browser, assistive-technology or live-provider pass is claimed. The bounded native observations above do not cover every item in this further checklist.
