# Tasks quick-entry composition consistency

Validated 2026-10-11 in the cloud Node.js DOM/event model with the real Tasks View, Controller and Store. All fixture text is synthetic. This is robustness/consistency coverage, not a reproduced native Chrome IME defect.

## Scope

- Quick entry tracks composition lifecycle in addition to existing keyboard `isComposing` / keyCode 229 fallbacks. Unflagged Enter, Add, form submission and shared departure `saveDrafts()` cannot add an active composition.
- Empty active composition owns the departure/reload guard and keeps the Tasks card visible if another page disables it. A short ownership-only end settling interval keeps the field visible through final input; deliberate post-composition Add/Enter remains usable immediately.
- Deferred inactive-field cleanup handles blur cancellation without clearing the guard in the same event turn. Epoch ownership fences newer composition, late flagged input and destroyed views; refocus retains an active composition, and later blur can release it.
- A newly started composition advances draft ownership, so an older pending add cannot clear it even when the textarea still has the same text.
- No schema, storage, permissions, manifests, translations or unrelated features changed.

## Regression evidence

- Tasks and lifecycle suites: 212 passing tests, including all quick-entry routes, empty composition departure, final input around blur/end, omitted-end fallback after flagged input, refocus/re-entry, ordinary immediate post-end Add, Shift/repeat/keyCode fallbacks, remote hide and older pending save.
- Independent reviewer: six adversarial event-model probes passed after the blur fallback correction. These probes do not simulate a native IME engine.
- The first aggregate run was intentionally interrupted after identifying a further synthetic blur-cancellation case. It is not a passing gate. Final aggregate results are recorded below.

## Limits

No native browser/OS IME candidate selection, platform-specific composition event ordering, or browser departure prompt was exercised for this slice. The DOM model verifies state ownership and persistence consequences. Browser warning display remains controlled by Chrome. The cancellation fallback releases an inactive field after the current event turn if no compositionend arrives; later flagged composing input reasserts ownership. Model fixtures contain no personal data. Bounded native smoke evidence is recorded below.

## Final validation status

- `node --test tests/local-tasks-*.test.js tests/local-content-lifecycle.test.js`: **212/212 passed**.
- All repository JavaScript syntax checks, manifest/locale JSON parsing and `git diff --check`: **passed**.
- `timeout 240 node --test --test-concurrency=1 tests/*.test.js`: **timed out, exit 124** during shared cloud host contention. The interrupted run is not an aggregate pass; its shutdown reported cancelled test files. Full-suite completion remains a release gate for the parent workflow.
- Python packaging tests: **53/53 passed** after the contended aggregate stopped. Runtime ZIP built and byte-verified successfully (93 runtime files); no package was published. JavaScript/JSON checks also passed.
- Aggregate timeout reported 620 tests: 496 passed, 0 failed, 124 cancelled. Parent identified the 20,000-link dashboard-render-scale case as the timeout point; cancelled downstream files are not evidence of their individual failure. Mandatory full CI remains required before release.

## Integrated local remainder — version 1.1.46

After the host recovered, the 157 test files other than `dashboard-render-scale.test.js` ran serially with a 180-second bound: 1,831 tests passed, zero failures, cancellations or skips, in 86.98 seconds. The four cases in the omitted scale file were not run by that command; this is not a complete aggregate pass. All 53 Python checks and the 93-file runtime package verification passed. The unchanged complete GitHub CI suite, including the scale file, remains required before publication.

## Separate dashboard test-harness improvement

A separate test-infrastructure commit replaces intermediate-array selector traversal with an accumulator and first-match short-circuiting. Production runtime and every scale-test size/assertion remain unchanged. Four focused tests and 79 non-scale harness-consumer tests passed; independent old/new comparison matched 780 ordinary static-DOM selector cases. Side-effecting custom `matches` callbacks that mutate the tree are outside this simplified helper's compatibility boundary; current repository consumers only instrument visit counts.

The unchanged scale file then passed all four cases, including 20,000 saved links, in 17.01 seconds under a 1,536-MiB Node old-space bound and reduced process priority. This is model-test evidence, not browser rendering performance or proof of the earlier timeout's sole cause. The complete CI suite remains the final combined gate for the Tasks change and the separate harness commit.


## Final combined aggregate and bounded native smoke — 2026-10-11

After rebasing both separate commits onto the final 1.1.45 documentation, the complete combined suite ran once with `nice -n 10 timeout 240 node --max-old-space-size=1536 --test --test-concurrency=1 tests/*.test.js`: **1,839 passed**, zero failures, cancellations or skips, in **93.79 seconds**. No test files were excluded. All **53 Python checks passed**. Earlier interrupted and split runs above remain historical evidence rather than aggregate passes.

Ordinary native smoke used dot-cloud Chrome for Testing, English/light desktop and a fresh synthetic profile. Clicking Add saved one exact task and cleared the entry. Blurring a second draft preserved the text and correctly reported it unsaved. Refocusing, then Tab/Return on Add saved the second task once. Reloading retained both exact titles once each with an empty entry. Runtime files matched the tested candidate after documentation/history changes.

This smoke does not validate native IME composition or candidate selection. Assistive technology, overlapping asynchronous saves, departure during composition, dark/narrow and non-English presentation remain untested natively. No raw Tasks JSON export was collected; native evidence is a bounded visual check, not full export equivalence. Screenshots remain local and are not published with this release.
