# Layout regrouping: keyboard focus

Validated on 2026-10-09 for the 1.1.7 development source.

## Defect and repair

Graphite, Folio, Console, Library, Ledger, Terrace and Column group shortcuts in Grid mode. A placement change received from another Settings window rebuilds those groups when entering or leaving Free/manual-snap mode. Previously the rebuild removed the focused shortcut control, leaving keyboard focus on the document body.

The repair captures the existing logical shortcut focus before replacing children and restores the corresponding visible control after applying the layout. It reuses the existing primary-control/Add fallback if a shortcut disappears. It also covers the identity-recovery early return. Focus outside the shortcut grid is not moved; no saved position, generation, storage or layout semantics change.

## Automated validation

- `node --test tests/*.test.js`: 616 tests passed.
- `python -m unittest discover -s tests -p '*_test.py'`: 19 tests passed.
- The new `tests/layout-regroup-focus.test.js` fails on the prior runtime and passes with the repair.
- It covers all 15 templates, modeled canvas widths of 240/640/1200 pixels, Grid/Free/manual-snap transitions, launch/More/Add controls, removed-target fallback, outside-grid focus, template switching and exact fractional coordinate preservation.
- Modeled canvas widths do not establish actual CSS viewport rendering.

## Bounded native validation

An isolated official Chrome for Testing profile on cloud Linux reproduced the prior Graphite defect through a separate Settings window. After Grid → Free, Space no longer opened the previously focused More menu. That initial baseline run also used the general Save Settings action, so it is not an identical-flow native A/B comparison; the automated regression independently isolates the regrouping defect.

With the repair, both Grid → Free and Free → Grid retained the logical More button. After changing Placement in the separate Settings window and returning with native window switching, Space opened the same shortcut's menu. Placement saves immediately; the final comparisons did not rely on the separate general Save Settings action.

These are bounded Graphite UI observations, not native testing of every template, browser, operating system or possible asynchronous interleaving. The native candidate's application JavaScript matched the repair; the production manifest version was advanced separately to 1.1.7.

## Release separation

This change belongs to the next development version. It does not modify or replace the frozen 1.1.6 package whose SHA-256 is `2256b00e487ccaf9ee692e69bd32e559d3f9b1ed1202236b6761554f99c06379`. The 1.1.6 store-image replacement and resubmission workflow remains separate. No store publication is implied by this source commit.
