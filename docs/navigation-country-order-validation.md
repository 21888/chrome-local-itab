# Operator-location filter ordering

Development on manifest1.1.109. The country dropdown is sorted by the same visible
localized labels used in the dropdown, active filter chips and details. Unknown
is last, equal localized sort results use ISO as a deterministic tie-breaker,
and failed/missing Intl.DisplayNames retains ISO labels. Labels are cached for
one panel session and refreshed on reopen. No catalog, filter matching, stored
value, other filter order, permissions or storage behavior changes.

The implementation passed2694/2694 strict Node tests and81/81 Python on its
classification-count baseline. Integration retaining the README count guard
passed2703/2703 strict serial Node tests with1 GiB heap and81/81 Python; no
failures, skips or cancellations. Independent131-test review and same-mount
en→zh→en reopen checks passed; other filter order and country value/label sets
were compared unchanged. Offline packaging verifies112 runtime files.
Limited Chinese/English desktop-light native checks passed for the actual full
current menus: Any first, Unknown last, localized ordering; English France before
Germany and United Kingdom before United States. Chinese BG dropdown/chip/details
labels matched and returned Inoreader; English France returned3, and removing
the chip restored141/127/14. No additions or external visits. Chinese baseline
restored. Japan was absent and not tested. Intl failures, locale races and ties
remain synthetic; other locales, dark/zoom, every filtering outcome and native
screen-reader behavior are not claimed.
