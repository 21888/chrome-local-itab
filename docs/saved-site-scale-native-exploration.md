# Saved-site scale: bounded native exploration

Measured on cloud Linux Chrome, 2026-10-27 00:09–00:21 UTC. This is an
exploratory usability/performance record, **not a controlled benchmark, a new
capacity guarantee, or an optimization claim**. Production runtime was unchanged
from `fa1a2421b4131f67aad847f79e59d57827c6bffd`.

## Scope and method

Existing Finder scale tests exercise 20,000 records and 2,000 categories with
operation-count assertions, not native layout/paint. The older native Finder
acceptance used 55 records and explicitly excluded large-list performance.
This study used two smaller, realistic synthetic loads:

| Condition | Saved sites | Categories | Configuration UTF-8 bytes |
| --- | ---: | ---: | ---: |
| Small control | 2 | 2 | 2,289 |
| Larger load | 1,000 | 10 | 211,213 |

Both configurations passed the actual production `bookmarkImportSnapshot`
validator, used stable shortcut identities, local letter icons, current Clarity,
and the same one-task/Scratchpad/ready-Focus seed. They were not imported through
a file chooser. A synthetic local storage bridge supplied valid migrated
workspace bundles; no user data or external destinations were used.

Instrumentation lived only in the disposable fixture. A small visible metrics
panel recorded:

- **Ready marker:** all expected saved-site DOM nodes, Tasks draft, Scratchpad
  editor and Focus Interval control existed, followed by two animation frames.
  This is not browser TTI, LCP or proof that every resource finished loading.
- **Interaction interval:** trusted event capture to the second
  `requestAnimationFrame`, with actual result status/row count at that point.
  Tool/connector round-trip latency was not used as UI timing.
- Long-task entries, DOM element counts and optional non-standard
  `performance.memory` values. No forced GC, throttling or security flags.

The old fixture's per-input full-history serialization was disabled to avoid
that obvious measurement cost. Initial seed parsing, synthetic storage cloning,
QA readback DOM and the metrics' own small selectors/serialization still existed.
Assets were cacheable, the small final condition was a reload, GC was uncontrolled,
and another authorized single-concurrency test workload ran on the shared cloud
machine. Consequently these samples cannot establish causal slowdown ratios,
hardware-independent budgets, or installed-extension performance guarantees.

## Executed workflows and samples

Each condition exercised three Finder queries, category filtering, homepage
category changes, a real shortcut Edit → Cancel, and five bounded Finder
open/close cycles. Only the larger condition could exercise a second results
page. All interactions completed without forced input.

| Observation, milliseconds | Small control | Larger load |
| --- | ---: | ---: |
| Ready marker from navigation | 174.6 | 750.8 |
| Three query intervals | 15.0 / 23.9 / 26.7 | 72.8 / 71.9 / 57.7 |
| Next results page | Not applicable | 19.4 |
| Finder category change | 6.9 | 96.3 |
| Homepage category → All | 28.2 | 193.9 |
| Open shortcut editor | 30.3 | 185.0 |
| Cancel editor | 26.7 | 174.9 |
| Five warm Finder open/close intervals, range | 22.2–29.7 | 143.1–243.9 |

The category action emitted both input and change; the table reports change,
not two independent samples. The large first-ready marker included three
observed long tasks of 61, 150 and 233 ms.

Finder displayed 50 of 1,000 matches, then 51–100 on Next. Searching `0999`
returned exactly the last site's record; an absent token returned none. Category
0 had 100 total sites with 50 displayed, and its homepage heading showed 100.
The exact first site's editor opened with the correct title/URL/category and was
cancelled without saving. No site was opened and the bridge recorded zero writes.
All personal modules, global libraries/privacy/sync, and the other workspace
remained equal to their initial snapshots.

## Retention and the bounded follow-up

After warm-up, all five close cycles returned to the same DOM count: 881 for
the small condition and 6,909 for the larger one. Open counts were 913 and 6,949.
These counts include fixture elements and an inactive editor; an inactive
`role=dialog` node does not mean a visible dialog remained open. Initial-ready
counts were lower because menus/editor content had not yet been constructed.

Reported used heap fluctuated rather than rising monotonically: roughly
7.7–10.3 MB in the control and 12.7–23.4 MB in the larger run, ending around
19.1 MB. These are non-standard browser readings, not RSS or retained-heap
analysis. Five cycles establish only that this run did not accumulate obvious
DOM nodes; they do not prove absence or presence of a memory leak.

The repeated larger-load modal delays justified one narrow follow-up, not an
unbounded matrix. An actual-source model counted five dialog open/close cycles
under 2 versus 1,000 descendants: both performed zero `querySelectorAll` calls
and ten top-level inert assignments, while initial/return focus remained correct.
Thus the suggested accidental JavaScript whole-card scan was not supported.

On port 8805, a fixture-only wrapper timed the unchanged actual dialog helper,
preserving arguments, receiver, return value and cleanup calls. Three larger-load
cycles produced:

| Cycle | Open helper synchronous | Close helper synchronous | Open event→frames | Close event→frames |
| --- | ---: | ---: | ---: | ---: |
| 1 | 94.8 | 96.7 | 176.0 | 149.3 |
| 2 | 122.2 | 68.0 | 178.1 | 98.4 |
| 3 | 71.3 | 72.5 | 133.0 | 108.8 |

A substantial part of the observed interval was inside the helper that changes
native inert state and focus. This does **not** separate browser style/layout,
inert processing, focus processing, GC or shared-machine scheduling costs. Closed
DOM counts again stabilized, and final used heap was below that run's initial
value. There is no demonstrated leak or sufficiently isolated safe optimization.
No inert protection, focus contract, storage guard or production code was changed.

## Invalid setup observations and cleanup

The first fixture incorrectly changed legacy root data as well as the migrated
bundle. The real older-format conflict guard refused startup. No recovery or
download control was clicked. The fixture was corrected to change only the
current bundle, leaving the legacy root and historical baseline intact, with a
fresh independent key. This was not treated as a product fault.

The first ready counter included the Add Shortcut tile, leaving its marker null.
It was corrected to count only saved-site nodes before both final conditions;
that invalid marker is not included in the table. These corrections were only
test infrastructure, not performance fixes.

Port 8804/tab 63 and port 8805/tab 64 were stopped/closed normally; dedicated
Terminal tabs were closed. The final 00:21:18 UTC inventory retained only the
already-present blank tab 62, which was not read. No screenshots were uploaded,
no external request or file import occurred, and no upgrade/recovery incident
gate was changed. This finite exploration is complete; any future optimization
needs more specific attribution and a preservation-safe counterexample first.
