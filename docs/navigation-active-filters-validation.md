# Active navigation filters — development validation

This ordinary feature commit retains manifest 1.1.87 and is not a new release.
Advanced country/company/pricing/language/signup filters remain visible as
removable chips while their controls are collapsed. Removing one preserves
other filters, selected sites and the target draft; review is invalidated as
appropriate. The tested implementation passed 2398 Node and 64 Python tests.

## Bounded native checks — 2026-10-12

Independent Chrome for Testing 155.0.8059.39, Chinese synthetic profile,
matched all 112 runtime files to development ZIP SHA-256
`a6e5b3f178cb349d8be56e330d0f432d9cc346fdde736679352fc4266ef2a941`.
Version remains 1.1.87; this hash distinguishes it from the published release.
This documentation-only update preserves that runtime.

- Shopping + US + OpenAI produced zero results with collapsed controls and both
  chips visible. Removing OpenAI retained US/Shopping and restored one result.
- Keyboard Enter on the final US chip returned visible focus to More filters.
  Removing the first chip of US + OpenAI moved visible focus to OpenAI.
- Other filters/Added state, one selection and a synthetic new-category draft
  survived the respective chip removals.
- The longest built-in company label, Ilya Kantor / JavaScript.info contributors,
  wrapped fully with its remove control at 320×900 in Clarity light and dark.
  This was one representative label, not every width/filter combination.
- Canceling saved nothing. Default, Clarity light, Grid and fourteen saved sites
  with existing category counts were restored. Existing synthetic AI record and
  workspace note were read and remained unchanged.

No persistence-write, full UI matrix, screen-reader semantics, numeric
contrast/overflow or external-service test is claimed. Native screenshots were
viewed during checks but were not published or included as release assets.
No new permissions, external links or provider calls were used.
