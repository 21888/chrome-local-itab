# Unsent AI draft guard — 1.1.85

## Scope

The existing uncommitted-work predicate now includes a nonempty question,
selected sources, excerpts differing from their DOM-normalized initial text,
and a manually edited answer title differing from its initial value. Existing
busy/result/save/task guards remain. The same predicate drives Close/Escape
confirmation and beforeunload. Connection fields alone do not become draft
content. No draft persistence, permission or transport change is introduced.

## Automated evidence

The frozen five-file implementation passed all 2382 Node and 53 Python tests.
Synthetic tests exercise clean and restored baselines, selected and hidden
edited excerpts, manual title edits, clear/dispose, actual view-wrapper
Close/Escape retention and discard, and beforeunload registration. No real
provider was called. The release candidate adds only manifest 84→85 and
release/validation documentation to that tested implementation.

## Bounded native verification — 2026-10-12

The independent Chrome for Testing 155.0.8059.39 synthetic installation loaded
1.1.85 with the exact 112-file ZIP SHA-256
`b0768ce25186aa73044fe92567955d4fd3f0ef772367820e691717a987163cf7`.
Ordinary extension Reload showed version 1.1.85. This documentation-only update
preserves those runtime bytes.

Chinese Clarity light desktop (1188px) checks passed:

- Blank panel Escape closed without a prompt and returned visible entry focus.
- A question alone, with endpoint/model/credentials empty, triggered Escape
  confirmation. Cancel retained the exact question. Close prompted again;
  explicit discard followed by reopen showed an empty question.
- A manually entered title alone triggered Escape confirmation. Cancel retained
  the title. Explicit Cancel / clear emptied it; Escape then closed without a
  prompt and returned visible entry focus.
- Existing twelve saved links and current Work category remained unchanged.

There were no source rows in this synthetic panel. Source selection, edited
excerpts and reviewed-request state were not exercised natively. Browser
beforeunload, provider requests, Allow/Send, credentials, pending cancellation
races, response/save transactions, CJK input and responsive/theme matrices were
also not tested natively. Relevant guard branches retain synthetic evidence;
this limited pass is not full-browser or full-feature certification. No new
source content, permission or external call was introduced; screenshots remain
local. Browser-controlled beforeunload event coverage does not prove a warning
will appear in every navigation case.
