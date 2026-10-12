# Select current filtered sites — 1.1.83 candidate

The five-file patch SHA-256 is
`437fe98eeadff653ac07fd51833bd8db4663783eaa4b33f512168dfbc649727b`.
It adds an explicit selection action to the existing navigation batch controls.
Current search/category/advanced/saved-state filters determine visible eligible
results; already-saved and already-selected IDs are excluded from additions.
The union includes hidden selections. A union larger than 20 is disabled with
an explanatory hint; there is no silent truncation or storage write.

Existing full-name/destination review and explicit confirm remain mandatory.
The selection action is disabled during review/save or blocked state, and its
handler independently checks those conditions. On selection completion, focus
moves to review or clear within the batch bar. The storage layer is unchanged.

## Verification status

The implementation's initial focused tests passed 46/46, Python passed 53/53,
and the 112-file runtime package verified. The full Node run then passed all
2341 tests with zero failures/skips/cancellations. The versioned candidate applies the patch unchanged
and adds manifest 82→83 plus release/validation documents.

## Bounded native selection checks — 2026-10-12

The existing synthetic Chrome for Testing 155.0.8059.39 installation loaded ZIP
SHA-256 `c899dd52ac98dfd346fb7a696bcb964bd9b9410bda8b2fb9d2dd63e3587908ed`.
All 112 paths and manifest were verified; ordinary Reload visibly showed 1.1.83.
The final documentation update preserves those exact runtime bytes.

Chinese Clarity light desktop and actual 320px representative results:

- Default 108 / unadded100 / added8: current-results(100) was disabled-looking,
  clicking had no effect, and the over-20 hint requested narrower filters.
- canva search found Leonardo.Ai and Canva. Selecting Leonardo changed total
  selection to one and action count from two to one; clicking selected only the
  remaining Canva, total two and action count zero.
- notion search hid those two selections; choosing Learning then keyboard Tab /
  Return on current-results(1) selected Notion, total three, and visibly moved
  focus to Review selected.
- figma search hid all three. Review still named Leonardo.Ai, Canva and Notion
  plus Learning. During review the new action was disabled-looking; clicking
  did not add Figma or change the reviewed three-name list.
- Zero-result zzzz and Added-only chatgpt showed disabled-looking count zero
  while retaining the three hidden selections. These two states were observed,
  not individually click-tested.
- At 320px the action row and wrapping review control stayed within the modal;
  the full three-name review/target/buttons were readable without horizontal
  overflow. Returning, clearing and Escape restored zero selection/search focus
  and then entry focus. Saved shortcuts remained eight; no save was confirmed.

No actual storage save, pending race, 20-item write, all-theme/locale/filter matrix
or native cap boundary rerun occurred. The earlier 1.1.82 manual 20-cap check is
separate historical evidence, not proof of every 1.1.83 action boundary. Likewise,
the prior batch/complete-backup regression review is not an 83-source native or
full-suite result. No CJK/full-width native input was attempted. Screenshots
remain local, with no external link, browser injection or permission change.
No new permission, catalog data, dependency or runtime file is introduced.
