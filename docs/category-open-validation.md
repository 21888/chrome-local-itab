# Category Open all: one batch per page

The category context menu keeps its existing confirmation and HTTP(S) URL
normalization. A page now owns at most one opening batch, beginning before the
confirmation dialog. A repeated request for the same or another category while
that batch is pending is ignored. Cancel, missing/empty data, invalid URLs,
completion and exceptions release ownership so a later deliberate batch works.

The existing five-slot, 120 ms timer queue and `window.open` mechanism are
unchanged. If scheduling throws, pending callbacks are immediately invalidated
and their timers are cleared; an old callback cannot open a URL or interfere
with a later batch. This is page-local coordination, not a cross-tab lock or a
change to the confirmed URL snapshot.

## Automated verification

`node --test tests/category-open-operation.test.js` executes the actual page
script and URL normalizer with deterministic timers. Five tests cover:

- Same-category, different-category and All overlap; twelve links; at most five
  pending callbacks; a deliberate later batch.
- Reentrant accepted/cancelled confirmations, with ownership acquired first.
- Missing component, empty/filtered lists, rejected URL schemes and retry.
- Thrown confirmation/data/opening operations and subsequent recovery.
- Initial and refill scheduling failures, stale callbacks before cleanup and
  during a later operation, and successful retries.

An independent actual-function probe additionally injected scheduler failures
at scheduling calls 1, 3, 6 and 9. The new overlap regression fails against the
old implementation (four confirmations instead of one). Integrated checks on
2026-10-09 passed 438 Node tests and 19 Python packaging tests.

These model checks establish opening attempts and operation ownership. They do
not establish that Chromium permits every popup or that destination content
loads. A blocked/null `window.open` remains governed by the browser's existing
behavior; this change adds no permission, network service or success claim.

## Native Linux smoke, 2026-10-09

An isolated, normal-sandbox Chrome for Testing 155.0.8059.39 profile loaded a
frozen 58-file runtime snapshot. A synthetic category contained six distinct
`http://127.0.0.1:65530/check-N` addresses; no external saved sites were opened.
Cancel left the three baseline tabs unchanged. Confirm opened six new tabs,
and a later deliberate request showed confirmation again and added six more
(15 total). Individual loopback addresses were inspected. No popup blocking
was observed in this profile. The connection-refused pages are expected:
this verifies tab creation, not successful destination content loading.

All 58 runtime hashes matched the integrated source. Rapid overlap and injected
scheduling failures remain model-tested, not native race-tested. Browser
permission/settings differences, other browsers and operating systems remain
outside this smoke test.
