# Saved-context workbench: design and validation

## Interaction reference and independent implementation

Reference checked 2026-10-13: Page Assist, commit `70215d882fc670a85ac28c30661c16472172d06c` (v1.5.87).

- [Official README](https://github.com/n4ze3m/page-assist/blob/70215d882fc670a85ac28c30661c16472172d06c/README.md): sidebar interaction alongside source content and asking questions about webpage content.
- [License at that revision](https://github.com/n4ze3m/page-assist/blob/70215d882fc670a85ac28c30661c16472172d06c/LICENCE): MIT, copyright 2023 Muhammed Nazeem. Its notice must accompany copies or substantial portions of that software.

Only the content-beside-question interaction pattern informed this layout. No Page Assist source, templates, styles, images, dependencies or notices were copied into the runtime. The implementation independently rearranges Local iTab's existing vanilla DOM controls. No AGPL Prompt Optimizer source or templates were used. No React, backend, model provider, permissions, controller/store/transport changes, storage schema changes or key-lifecycle changes were introduced.

## Layout

The wide dialog has two labeled regions: saved sources on the left, and question/review/response on the right. Each region scrolls independently so a long source list does not push the question away. Existing title search, scope, selected-only view, selected/hidden counts and batch selection remain together. Extended source explanations and the explicit reload action are grouped in a disclosure below the list.

The question, output mode, budget and local-review action precede the optional connection disclosure. Its summary says “Optional: call a model in this extension.” It starts closed and contains connection/preset controls and the separate exact-review, permission and send actions. Opening or closing it does not rebuild controls, invalidate tickets, change keys, send, save or reset values. The response and its copy/save/task actions remain outside this disclosure, close to each other. Result controls are shown after a response exists.

At 900 CSS pixels or below the same DOM becomes a single column, with normal dialog scrolling and a bounded source list. There are no duplicate narrow-screen controls or mirrored state. All fields retain their labels; disclosures use native summary keyboard semantics. Both summaries explicitly carry tabindex=0 so the existing shared dialog focus trap includes them, while excluding descendants of closed disclosures. A wrapper-level regression covers forward Tab after reset, wrap from the closed connection summary to Close, reverse wrap from Close to that summary, expanded-connection boundaries and Escape restoration.

## Automated validation

Commands: `node --test tests/*.test.js`; `python3 -m unittest discover -s tests -p '*_test.py'`; package and verify with `tools/package_extension.py`.

The DOM-model suite uses stable question/mode class selectors rather than assuming the first textarea or select is the intended field. New assertions cover labeled regions, exactly one question/endpoint, initial disclosure visibility, retained field/source/ticket/result identity across disclosure changes, and a complete select/edit/local-review/copy flow with **zero transport calls, zero permission calls and zero persistent writes**. Editing after local review invalidates it. Existing tests continue to cover busy and uncertain-write locks, late callbacks after edits, pagehide/close/dispose, response ownership, key clearing, exact request review, source restoration/reload, tasks and saves.

DOM-model visibility and CSS-contract tests are not native layout measurements. Native screenshot and keyboard/scroll acceptance must be recorded separately by the browser QA run. No 320-pixel real viewport, native clipboard, real model call or generated-answer screenshot is claimed here. A 200% browser zoom check, if performed, must be labeled as zoom rather than a verified 320-pixel viewport. All test data are synthetic; no user records or real keys are included.

The final integrated development snapshot on version1.1.117 retains the two toolbar repairs and passed2833/2833 strict serial Node tests with a1GiB heap and81/81 Python tests. Independent review passed103 view/dialog/disclosure cases plus three deferred/offline checks after the explicit summary focus fix. The113-file package passed build/source verification. Native acceptance remains pending; these results do not claim rendered layout or real provider behavior.
