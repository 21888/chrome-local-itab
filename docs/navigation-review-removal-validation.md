# Navigation review: remove individual selections

## Change and safety boundary

Batch review now has a labeled removal button for each selected site, including selections hidden by the current search/filter. Each removal updates selection counts and cards and rebuilds a fresh immutable confirmation. Detached confirmation, cancel and removal controls cannot act on the replacement review. No storage protocol, permission, save semantics or single-site new-category confirmation change.

Search and advanced/saved/category filters, existing destination and the new-category name draft remain in place. Focus follows the next removal button, or the preceding one when removing the last row; removing the final selection exits review and focuses search. No write occurs until the fresh confirmation is activated. Pending writes disable removal. At the 20-item limit, removal frees one slot for further browsing and selection.

## Automated coverage

Seven new regressions cover hidden selections, preserved filters and targets, stale controls, fresh frozen requests, new-category normalization/drafts, final-item focus, capacity recovery, repeated and composing events, pending writes, Chinese labels, text-only rendering and the real view-to-storage save contract.

The synthetic DOM checks focus ownership and handlers; it does not prove native keyboard activation, pixel geometry or screen-reader output.

The frozen implementation passed all 2389 Node and 53 Python tests, plus JavaScript/JSON syntax and diff whitespace checks. The versioned release changes only manifest 85→86 and release/validation documentation. The bounded native checks below passed against the versioned ZIP.

## Bounded native verification — 2026-10-12

Independent Chrome for Testing 155.0.8059.39 loaded the exact 112-file 1.1.86
ZIP SHA-256 `9bae8ba3cbfe30d9c31ad69291f5597a1e236713a6863d0a26a2978ba6bfdd99`.
Ordinary Reload visibly showed 1.1.86. This documentation-only update preserves
those runtime bytes. Chinese Clarity desktop and actual 320px light/dark checks:

- Figma, Leonardo and Gemini selected across searches appeared together in
  review with full URLs, including hidden selections and existing Learning target.
- Enter removed the last row alone (3→2) and focused the preceding removal
  button. Space removed the first row alone (2→1) and focused the next button.
  Removing the final row returned search focus with query and Learning retained;
  selection became zero and review/clear controls were grey.
- A new-category draft `qa review` survived a two-to-one review removal and
  return to browsing. At 320px light, names, complete Gemini/Figma URLs and
  controls fit the panel. Escape saved nothing and created no category.
- At 320px dark, the standards platform's long Chinese name and complete
  `https://std.samr.gov.cn/` URL wrapped with a readable removal button and no
  horizontal overflow. Final removal returned search focus with query retained.
- Clarity light was restored. Twelve saved links, existing categories and
  current Work selection remained unchanged.

No final-save transaction after removal was exercised natively. Held-key repeats,
20-item capacity recovery, delayed/pending writes, stale detached controls,
atomicity/races, English locale, IME, screen-reader announcements and complete
filter/theme matrices remain outside this native scope. Single Enter/Space
activation is not held-key evidence; catalog strings are not arbitrary extreme
URL/name stress tests. Relevant synthetic regressions, including the actual
view-to-storage remaining-selection write contract, remain separate evidence.
No external links, permissions changes or provider calls; screenshots stay local.
