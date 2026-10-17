# Added-sites bookmark import review validation

## Feature boundary

The existing local bookmark-import preview now offers a default-collapsed **Sites to be added (N)** disclosure. Opening it renders only the current page of at most 50 additions. Each row displays the actual prepared title, complete canonical URL and category name resolved from `plan.additions.categories`, in `plan.additions.links` order. The range identifies the current items and total. Closing it removes rows and resets the page. Zero additions leave the disclosure and Apply disabled.

The disclosure is a native button with `aria-expanded`, `aria-controls` and a warning that URLs may contain private parameters. Its region is labelled by that button. The list is keyboard-scrollable. Only the bounded page-range text is live; titles, URLs, category names and the list are not live regions. Reaching a page boundary transfers owned focus from a newly disabled paging button to the still-available paging button, without taking focus from another input.

No imported row or full URL is created while collapsed. Imported strings use `textContent`; there are no anchors, image/icon requests, frames, clipboard writes, filters, selections, exclusions or editing. Skipped-item examples are never displayed. Paging leaves the prepared object's identity and contents, summary counts, privacy snapshot and Apply argument unchanged. This is an inspection feature, not a change to parsing or saving.

The view checks addition counts and category references before presenting a review. It retains the existing prepare/apply and generation protections. Cancel, Escape, replacement files, failures and destruction remove the rendered rows and release the review's link/category references. Detached controls from a discarded generation cannot revive them. While a save is running, review controls cannot start another operation. Destruction does not cancel an already-started write. Uncertain writes are not automatically retried.

The parser, storage helper, StorageManager, options save protocol, manifest and version are unchanged.

## Focused automated evidence

The new entry-point regression first failed on the base view because `.bookmark-import-sites-toggle` was absent. The original red test and source hashes were retained with the local test evidence before implementation. The existing actual-parser test that asserts no `Secret title` appears by default is unchanged.

Run only this bounded window for the feature:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 \
  tests/bookmark-import-site-preview.test.js \
  tests/bookmark-import-view.test.js \
  tests/bookmark-import-options.test.js
```

The implementation run passed **39 tests**: 20 dedicated review tests, 18 existing view tests and the existing options integration suite. Coverage includes:

- Actual planner outputs for 0, 1, 50, 51 and 2,000 additions; default-empty DOM, every page's order/range, last-page return, collapse/reopen reset and at most 50 rows at any time.
- Existing and repeated URLs, invalid schemes, hostile title markup, long complete URLs, significant queries/fragments, Unicode and category-name suffixes; skipped examples remain undisclosed.
- Frozen prepared objects; exact title/URL/category comparisons, object identity and deep equality through one explicit Apply.
- Cancellation, Escape, replacement files, late reads/preparations/errors, save conflicts and uncertain outcomes, detached controls, destruction and in-progress saves.
- Boundary-button focus using the model's native-style disabled-focus loss mode, newer-input focus preservation, labels, composition/repeated-key guards, English/Chinese catalogs and fallback strings.
- Network and clipboard traps plus absence of active URL/HTML elements.

The 2,000-item case uses a small synthetic HTML string and the actual planner; only a page of 50 rows is mounted. It does not invoke the older large-scale suites. The whole repository suite and browser tests were not run as part of this focused feature window.

## Native checks still required

The DOM model is not proof of browser rendering or assistive-technology behavior. Before release, check the final unpacked extension in Chrome with synthetic bookmarks only:

1. Import 51 and 2,000 synthetic sites. Verify the initial collapsed view contains no site rows, then expand, page to the end, return and collapse/reopen. Check long URL wrapping and list scrolling on narrow/wide layouts and both themes.
2. Use Tab, Enter and Space on the disclosure and paging buttons. Confirm boundary focus remains visible and useful; use the keyboard to scroll the list. Escape cancels a review, but cannot cancel an active save. IME composition and held keys must not accidentally change pages or apply.
3. With a screen reader, verify disclosure state/label, exact row text and bounded range announcements. Ensure full URLs are not automatically announced as a live-region update.
4. Test English and Simplified Chinese. Verify contrast, focus outlines, readable ranges, long category wrapping and controls without clipping.
5. Observe network activity: opening and paging this list must not request bookmark destinations or icon services. Existing Sync/dashboard-icon privacy behavior after a successful save is unchanged.
6. Re-select or cancel a file while reading; check no stale row returns. In a delayed/failing save, confirm disabled controls, one write attempt, cleared review and the existing uncertainty warning without automatic retry.

No native Chrome, screenshot, visual or assistive-technology result is claimed by the automated run above.
