# Settings-only search validation

## Scope and design

Base: `5739cf747fcb41ceb4851c9f1e9b280aa212d427`.

An ordinary labeled input, Clear button, polite result count and list of buttons
search 17 destinations across the six existing Settings tabs. The destinations
are 14 sections plus the Tasks, Focus and Scratchpad settings groups. The index
is an explicit registry of packaged translation keys with English fallbacks.
It never derives labels from page text, field values, dynamic accessibility
labels, saved previews, device lists, categories or private module content.

Current-language translated text uses NFKC normalization, case-insensitive
matching and whitespace-separated terms. Chinese substring matching does not
require word segmentation. Tab/section/field labels contribute to matches;
results are grouped by destination rather than repeated for each field.

Selecting a result reuses the existing validated tab activation function, then
focuses an H2/H3 section heading or named static wrapper. Hidden conditional
hosts fall back to their enclosing visible section. No control is focused or
clicked, no form is remounted and no module is enabled. Scrolling is instant,
including with reduced motion. Repeated mount is idempotent. Query text is not
persisted, logged, placed in a URL or sent over the network.

The input has no Enter activation or global shortcut. Native button activation
is retained; composing, repeat and modified activation are rejected. Normal
field blur/change autosave semantics are intentionally unchanged.

## Automated checks

Run from the repository root:

- `node --test tests/*.test.js`
- `python3 -m unittest discover -s tests -p '*_test.py'`
- `find . -name '*.js' -not -path './.git/*' -print0 | xargs -0 -n1 node --check`

The implementation-stage run passed 407 Node tests and 19 Python packaging
checks. JavaScript syntax checks passed. The package inventory now includes the
new runtime file and asserts 57 packaged entries.

`tests/settings-search.test.js` executes production search and tab setup code
in the repository DOM/event model. It covers all 17 destinations and six tabs
in English and Simplified Chinese, both tab orientations, translated fields,
whitespace/casing/full-width normalization, empty/no-result queries, static
private sentinels (including URLs/credentials), toxic container-text getters,
literal HTML-like queries, ordinary-key passthrough, IME/repeat/modifier guards,
Clear behavior, repeat mount, stale/detached/reparented/conditional destinations,
static focus, ARIA selection/tabindex, startup hash, retained field values and
pending controller identities. Modeled navigation has zero saves or remounts.
Existing keyboard and local-module regressions also pass in the full suite.

## Initial native layout finding

The first native English light capture at 1188 × 848 exposed an existing flex-row
parent that placed the new search beside both the sidebar and content. The search
now stacks above that pair: `.options-main` uses column direction and its
`.options-layout` child retains full width. Two source regression assertions cover
that constraint; the revised runtime requires a fresh native visual check.

## Native coverage checklist

The isolated implementation review checked theme tokens, narrow CSS, focus CSS
and package inclusion in source. The checks below distinguish desirable native
coverage from automated evidence; completed native checks are recorded separately.

1. English and Chinese; light and dark; desktop and narrow widths. Search, count,
   result wrapping and focus rings must remain readable without horizontal overflow.
2. Tab/Shift+Tab, native Enter/Space, held Enter, modified activation and Chinese
   IME composition. Pressing Enter in the input must not open a result.
3. A result in every tab, especially module wrappers and a conditional background
   setting. Confirm search never toggles or applies settings.
4. Edited category fields, unsaved world clocks, Countdown draft and pending
   module save: navigate away/back, preserving their nodes and values. Existing
   field autosave may still run; do not describe that as indefinitely unsaved.
5. Result heading/group receives visible focus; reduced-motion mode still uses
   instant scrolling; Clear returns focus without switching tabs.
6. Screen-reader labels/count announcements and native focus/scroll positioning.

Live Sync/Drive accounts, actual network observation, browser Find behavior,
macOS/Windows and real assistive technologies were not tested here. Search
itself contains no storage/network API; existing Settings initialization and
normal autosave remain separate behavior.

## Final native acceptance (2026-10-09)

Passed a bounded recheck of the revised 57-file runtime in official Chrome for
Testing 155.0.8059.39 on Linux, normal sandbox, disposable synthetic profile,
English Clarity, 100% zoom. Final options.css SHA256:
`f7b0ded1aafe51e1d075ee5b3c26ba64ddbc9aa10186e333529415cb9c0f85af`.

- Search now occupies the full row above sidebar/content; the initial layout
  failure is not counted as successful acceptance.
- Enter in the search input kept the current tab. Tab to a result and Enter
  opened the previously hidden Countdown section with visible heading focus.
- A Scratchpad result focused the static module group; neither that module nor
  Countdown was enabled by navigation.
- An unsaved synthetic Countdown title and date survived search away/back.
  Searching its unique private title returned no matches. Clear returned focus
  to the search field while retaining the selected tab and unsaved draft.
- The two-result `clock` query remained readable in light and dark mode at
  510 × 848 outer-window size, with stacked controls and wrapping helper text.
  Wide captures used 1188 × 848 light and 1260 × 848 dark outer windows.
- All 57 final runtime hashes matched the tested snapshot; the complete Node
  suite still passed 407 tests and Python packaging passed 19 tests.

These are outer-window measurements, not CSS viewport dimensions. Chinese
static search, actual IME, held-key repeat, assistive technologies, all entries,
all templates and live providers were not exercised in this bounded native pass.
The model tests above are separate evidence. The disposable browser was closed
normally after discarding only its synthetic unsaved draft.

[Actual panel captures](settings-search.md#actual-screenshots--实际截图) and
[capture metadata](screenshots/settings-search/capture-metadata.json) preserve
exact crop bounds, original image hashes and runtime evidence.
