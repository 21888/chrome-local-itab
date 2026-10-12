# Settings danger-text contrast validation — 1.1.74

## Scope

The 1.1.73 native pass found that Clarity light topic Delete labels were extremely
faint. This patch replaces the final generic `.btn-danger` foreground with a
custom-property lookup. Explicit light mode and legacy ink-paper without a
color-mode attribute set `--danger-button-text: #87372b`; the fallback remains
`#ffd1c8`. Explicit dark ink-paper does not match the legacy light fallback.
Specialized complete-backup button foreground declarations remain untouched.
No event handler, confirmation, storage, background or permission changes.

## Static validation and assumptions

The new test reads the stylesheets linked by options.html and checks the generic
foreground, the light/legacy token selectors, the specialized complete-backup
foreground and the reviewed generic hover/focus declarations.

Contrast estimates start with the declared opaque `--template-surface` for
Clarity, Graphite and Folio in each mode. They alpha-compose the declared
`.topic-list`, `.topic-item` and `.btn-danger` backgrounds in order, then compute
sRGB relative luminance and text contrast. The model assumes these declared
surfaces/layers apply; it is not a browser computed-style or screenshot-pixel
measurement and does not model arbitrary overrides, other component nesting,
disabled controls, glyph antialiasing or all themes.

Calculated examples: Clarity light/dark 6.10/7.55:1, Graphite 5.91/7.29:1 and
Folio 5.81/7.22:1. Legacy ink-paper composes its translucent glass surface over
black and white backdrops, followed by the same topic/button layers; examples
are 4.79:1 and 6.00:1. Each tested example exceeds the 4.5:1 test threshold.
These bounded estimates are not a claim of application-wide accessibility
conformance or native acceptance.

Executed command: `node --test --test-concurrency=1 tests/settings-danger-contrast.test.js tests/content-topics-layout.test.js`.
Result: 12 passed, 0 failed. `git diff --check` also passed.

## Bounded native acceptance — 2026-10-12

The same independent Chrome for Testing 155.0.8059.39 loaded the canonical ZIP
with SHA-256 `9d2ae0631f93764a2bc0578a8735b317b393df467ea7926d114611e634fea5ce`.
All 108 runtime paths were checked before extraction over the fixed synthetic
runtime directory. Ordinary extension Reload showed 1.1.74 and a reload toast.
This documentation-only update preserves the tested runtime bytes.

Completed scope, English UI and synthetic topics only:

- Clarity light desktop and actual responsive 320px: Delete labels were visibly
  dark red on pale pink and readable; the existing topic/card layout remained
  intact. This was visual inspection, not a numeric pixel contrast measurement.
- At 320px, Edit opened the native title prompt. Escape canceled without changing
  the title; confirming an edited title and score produced Topic updated.
- Delete opened native confirmation. Escape retained the edited synthetic item;
  repeating Delete and confirming removed it with Topic deleted.
- After switching through Appearance, Clarity dark Baidu Delete labels remained
  visibly readable at desktop.
- The coordinating reviewer inspected the key light 320px native screenshot.
  Screenshots remain local and are not included in source or release assets.

Not covered: Graphite/Folio native appearance, a repeat at dark 320px, other
languages, all-theme/all-width combinations, specialized backup actions, a
separate full keyboard-focus/hover matrix or computed native contrast ratios.
No provider calls, permission changes, browser script or storage injection were
used. This clears the targeted readability/interaction regression scope only;
it is not full application or accessibility-conformance acceptance.
