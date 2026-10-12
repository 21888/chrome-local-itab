# AI input budget — development validation

This ordinary feature commit retains manifest 1.1.87; it is not a release.
Local feedback counts selected sources, UTF-16 question/excerpt lengths and
serialized full prompt length. These are not token, price or provider quotas.
The same serializer serves measurement and strict packing; existing limits,
permission/review and explicit-send requirements remain. Input is not silently
truncated or deselected. Defensive inspection catches hostile accessors and
bounds diagnostic serialization without relaxing strict pack validation.

The actual combined filter-chips + hardened AI tree passed 2404 Node tests
(strict unhandled rejections) and 64 Python tests. Locale additions were merged
by their seven distinct AI keys, preserving the first feature's keys. Synthetic
regressions cover exact limits, serializer agreement and defensive inputs.

## Bounded native verification — 2026-10-12

Independent Chrome for Testing 155.0.8059.39 loaded the exact 112-file development
ZIP SHA-256 `48afc29ca2eb35491e42545d2bfb3360baa12ecb11da023760d3dfb9397862ce`.
Manifest remains 1.1.87; this hash distinguishes the unpublished snapshot.
This documentation-only update preserves its runtime bytes.

Chinese Clarity native checks passed:

- Blank answer mode showed selected0/12, question0/4000, prompt279/32000.
  Blank local preview reported invalid input without creating a preview.
- One existing synthetic source showed excerpt49 and total420. Temporarily
  editing its send excerpt to alpha showed excerpt5 and total376. Deselecting
  excluded it, returning total279; the original collection was unchanged.
- Question alpha showed question5 and total284. Reselecting the source retained
  the temporary edit and showed total381. Switching to task-draft output gave
  total413 with unchanged selected/question/excerpt counts.
- Escape confirmation Cancel preserved draft/counts. Cancel/Clear emptied
  question/selection and retained task mode (total311); reopening reset answer
  mode with empty total279.
- At 320×900 light/dark, counts, UTF-16 explanation and general validation
  feedback wrapped readably without observed horizontal clipping.
- Draft was cleared; Clarity light and fourteen saved sites were restored.
  The existing synthetic AI collection record remained unchanged.

Endpoint/model were intentionally empty, so a real local preview was not
produced and preview-payload/count equality was not tested natively. No native
4001-question, 16001-excerpt or 32001-prompt boundary input was attempted;
those boundaries are synthetic evidence only. No Allow/Send, credentials,
provider/network, saved connections, collection/task writes, full mode/theme
matrix or numerical contrast/overflow audit. Evidence frames remained in the
native tool transcript; no screenshot attachment or publication was created.
