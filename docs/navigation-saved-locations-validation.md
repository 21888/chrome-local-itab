# Saved navigation locations

Added catalog cards now show the personal categories containing matching saved
URLs in the current workspace snapshot. This is distinct from built-in discovery
categories. Matching reuses canonical URL identity, deduplicates by category ID,
and retains multiple different IDs even when names match. Repeated names and
unknown category names include the ID; legacy missing category follows existing
work-category semantics. All names render as literal text with wrapping.

The index uses the already-read snapshot and updates from normal add responses
or reopening. It does not move links, switch dashboard category, open sites or
perform extra storage reads/writes. Existing Added/saved filters stay equivalent.

Frozen strict Node2806/2806, Python81/81 and focused156/156 passed. Independent
review passed240 tests including7 additional boundary cases, with no blocker.
Packaging verifies113 explicit runtime files; manifest remains1.1.114 for this
ordinary feature. Native display validation is pending. No full visual, narrow
layout or assistive-technology coverage is claimed from synthetic tests.
