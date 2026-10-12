# Prompt exact-tag filtering validation

Development feature on 1.1.97; no version bump or standalone release.

- Adds an exact tag dropdown and explicit detail-tag filter buttons. The selected tag intersects the existing text, category, favorites, and trash filters. Comma-containing tag values remain whole values.
- Filtering changes only in-memory list state; it does not write storage or rebuild the detail editor. Clearing filters resets the tag as well. Existing draft/session state is retained.
- Implementation validation: strict full Node suite 2522/2522, Python 81/81, and the 112-file offline runtime package passed. Five new deterministic regressions cover exact matching, filter intersections, tag inventory/empty states, and draft/session preservation with no filter writes.
- Native browser validation is pending. Synthetic tests do not establish browser layout, keyboard, or assistive-technology coverage.
- Permissions, network behavior, data schema, and the guarded release workflow are unchanged.
