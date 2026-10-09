# Settings keyboard navigation validation

Settings tabs now support Up/Down at desktop widths and Left/Right at widths
at or below 960 px, matching the responsive layout. Navigation wraps; Home/End
select the first/last tab. Selection, roving tabindex and keyboard focus move
together. The tablist's aria-orientation follows the viewport breakpoint.

Native Tab, Enter and Space behavior remains unchanged. Orthogonal arrows,
modified keys, composition and events originating in descendant inputs are left
alone. Switching tabs preserves the existing panel nodes and values.

## Automated regression

Run `node --test tests/settings-keyboard.test.js` from the repository root.
The test reads the six actual tabs from options.html and runs the production
setupSettingsTabs function in the DOM/event model. It fails the preceding
implementation and passes this change. Coverage includes responsive orientation
changes, directional movement/wrapping, Home/End, focus, modifiers, composition,
descendant input events, native-key passthrough, click and deep-link startup,
panel identity, edited text/checked state and pending local-save identity.
The modeled navigation performs no storage writes.

## Native evidence and limits

Before integration, an isolated copy of base
`5814d3745d809c5b946341cf6b8ef6551d930408` with this identical options.js was
verified in Chrome for Testing 155.0.8059.39 on the dot cloud Linux desktop.
The tested options.js SHA256 is
`f87bf758eb79e60d8b09de26f22f2467cfa878bff32e312d3f0d8aaa90d95c06`.

At 1188 x 848 and 688 x 848 browser-window sizes, all six panels were reachable
with the corresponding arrow keys and visible focus followed selection. Home,
End, wrapping, ordinary Tab/Shift+Tab, desktop Shift+Up and orthogonal Right
were checked. A quote input retained synthetic edited text across navigation;
Home/End/Up within that input did not switch panels.

The existing settings auto-save ran during native testing, so retained text is
not evidence of indefinitely unsaved state. Pending-save identity is model-tested,
not artificially delayed in the browser. Screen-reader announcements, IME,
every modifier/input type, and the exact 960 px boundary were not tested natively.
Opening the Sync settings panel did not connect or test a live Sync account.

## Integration checks

Both fixes together pass all 94 regression tests, JavaScript syntax checks,
manifest/locale JSON parsing and git diff whitespace validation. These automated
checks do not replace the explicitly untested native scenarios above.
