# Canonically equivalent text in current saved AI-library search

The global local AI-library search now matches canonically equivalent Unicode
spellings in current Prompt/Collection bodies, titles and tags, plus current
Collection notes. For example `Café` matches saved `Cafe\u0301` in either direction.
This is NFC comparison, not accent removal or compatibility folding: `Cafe` does
not match `Café`, and full-width letters do not silently become ASCII.

Saved record fields, titles, IDs, result links and copied/opened editor text stay
unchanged. Normalized text is transient matching data. Snippet offsets map the
normalized prefix's decomposition length back to original code points, retaining
literal text despite composed accents or case expansion before the match. The
existing 180-code-point snippet window, current-only scope, archive/history/draft
exclusions, type filters, stable raw-title ordering and stale-result generation
checks remain in place. This is not fuzzy search or transliteration.

The old source's actual Store/Controller flow saved one decomposed Prompt and one
Collection; same-byte query found both, but composed query returned no results.
Expanded pre-fix regression had 9 failures and one passing negative-scope test.
The initial implementation experiment with decomposed substring matching was
rejected because it let unaccented `Cafe` match `Café`; the final path compares NFC.

Final focused coverage includes both normalization directions across all supported
fields, real Save → Search → exact record-target resolution without additional
writes, long accented/decomposed/case-expanded/emoji prefixes, Hangul composition,
canonical combining-mark reordering, CJK/emoji, whitespace, no accent stripping or
NFKC, exact raw titles, existing stable order and archived/history exclusions.

The actual global Search View also runs over the real saved stores in the model:
its canonical query produces two literal snippets, ArrowDown focuses a result,
ordinary anchor activation remains allowed, and each exact href boots the target
Prompt/Collection controller through `prepareTarget`. Both selected records retain
their original Unicode bytes, with no additional writes; Escape restores the
opener. The DOM model explicitly focuses the opener before dispatching its click,
since a synthetic click alone does not reproduce the browser's focus behavior.
Before the target-read correction below, the four complete AI-search files passed **40/40**, including 13 new tests.
This is model coverage, not an OS input-method claim.

## Exact target read contract discovered by the complete native chain

The first full native route (port 8793) saved both libraries, searched correctly
and opened the exact Prompt. The Collection target displayed its correct record
but incorrectly showed a saved-read failure and disabled Copy and other actions.
This was a real existing integration defect, not a storage loss or fixture error:
`prepareTarget` wrapped `accept` without returning its value, while the Collection
controller's read path requires the original acceptance boolean. The same actual
Controller model reproduced `{code: 'READ', scope: 'read'}` after a successful
one-write save/read. No Refresh, recovery action or guard bypass was used to mask it.

The wrapper now returns the original value on every normal path. Explicit `false`
retains rejected-read behavior and does not resolve against rejected state;
Prompt's original `undefined` return still permits its normal target resolution.
The Collection READ guard is unchanged. Real-controller regressions cover valid,
missing and invalid targets, rejection of an older revision, true read failure,
and delayed accepted reads after a newer user draft. The complete View flow now
asserts both navigation status **and actual controller read-error status**.
The final four AI-search files pass **46/46**, including **19 new tests**.

A pre-target-fix full run passed 17,258 tests but lacked the read-status assertions;
it is retained as historical evidence, **not** final acceptance of this fix.

## Final native Save → Search → exact record journey

A new isolated port-8794 session used the final frozen runtime and an explicitly
synthetic origin-local backend shared between owned tabs. Shipped Stores,
Controllers, Views and real browser Web Locks ran unchanged apart from this fix.

- Ordinary Prompt and Collection editors each saved one new decomposed title/body
  containing `Cafe\u0301`, Japanese and an emoji ZWJ sequence: two writes total.
- Homepage global search for composed `Café` returned exactly both new records and
  literal original snippets; unaccented `Cafe` returned zero. Type filters selected
  the correct library without saving.
- ArrowDown and Enter opened the exact Collection ID in a new page. Its first read
  was healthy: no saved-read failure, normal Copy/New-draft actions enabled, exact
  original text retained. No automatic or explicit Refresh was needed.
- Opening the Prompt result selected its exact ID; DOM-backed readback retained
  the decomposed title code points (including U+0065 followed by U+0301), original
  preview and two-write total. Escape in search restored its opener focus.
- Tasks, Scratchpad, Countdown, Focus, privacy/sync and the other workspace's
  registry/content stayed exact. Only the two explicit library additions changed
  their respective global stores; this is not a claim that those stores were
  unchanged. No external site, provider, import, export or clipboard was activated.

Both the failing and final native sessions were fully cleaned: their owned tabs,
servers and terminal tabs closed after stopped-marker/shell verification. Only
original tab 9 remained untouched. Screenshots were inspected in-tool, not
uploaded. Native text was supplied through ordinary editable controls; no actual
OS IME, installed-extension upgrade or real-account behavior is claimed.

Final fixed-source acceptance: **440 complete Node files, 17,264/17,264 tests
passed**, exit 0, including the 19 added tests and original read-return guards;
**91/91 Python tests passed**, exit 0. The focused 46 are included, not added to
that aggregate. Final native runtime bytes match this same production source;
syntax/whitespace checks passed. No version, permission, Release or CWS changes.
