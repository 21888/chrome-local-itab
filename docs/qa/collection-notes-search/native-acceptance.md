# Native collection-notes search acceptance — 2026-10-11

Runtime ZIP SHA-256: a5fa158c33adaaee497e13d36be61d024a0633b199a3ad39af54664ab28e9547.

Actual unpacked extension 1.1.34 on cloud Chrome for Testing, English desktop, synthetic data only. No user data or credentials.

Passed:
- Saved collection qa has body tea and notes nebula. Searching nebula returns exactly that collection, labeled AI excerpt / Notes with the notes snippet.
- Result opens its exact collection record in a new tab.
- Closing the record preserves the search query/result; Escape closes search and returns launcher focus.
- Reopening search preserves the query; dark theme and native Tab/Enter navigation pass.

No product defect observed. Full locale/device matrix and native error injection were not covered; automated stale-read/failure guards remain separate. Screenshot is the original JPEG capture with corrected suffix.
