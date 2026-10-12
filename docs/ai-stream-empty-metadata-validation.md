# Empty AI streaming metadata — 1.1.78 validation

The existing JSON `hasPayload` predicate is shared with the SSE parser. Optional
metadata with no payload (null, empty string, empty array/object) is accepted in
both paths; nonempty values, false and zero still fail INCOMPLETE. There is no
new provider request, credential handling, permission or automatic retry.

Synthetic regressions cover empty metadata on role/text events, output callbacks,
nonempty/malformed metadata rejected before text publication, and strict terminal
requirements. Missing/non-stop finish reasons or absent [DONE] remain incomplete;
accepting empty metadata does not certify a completed answer by itself.

The original two-file patch passed independent 2284 Node / 53 Python tests on
its earlier base. After integrating it on the local 1.1.77 navigation-saved-filter
candidate, the full serial Node suite passed 2296 tests with strict unhandled-
rejection mode and a 1 GiB heap; all 53 Python tests passed. The integrated run
finished before the version-only 77→78 manifest update and these documentation
additions. Implementation and test files were unchanged afterward.

No real API key, live provider, browser injection or native network request was
used. This evidence establishes deterministic local parser behavior only, not
provider feature support, billing cancellation or a full native UI matrix.
The change is independent of the previous navigation feature, with one separate
patch-version commit; publication must follow the approved serial master flow.
