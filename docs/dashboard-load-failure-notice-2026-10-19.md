# Persistent dashboard startup failure explanation

A normal dashboard startup failure now retains a short English/Chinese alert in the workspace bar after the existing five-second toast disappears. It explains that loading is incomplete and does not establish deletion of saved content, and points to the existing reload, Settings and read-only saved-copy inspection choices. It does not create additional links, navigate, focus, retry, write, or repair anything.

An interrupted restore continues to use its existing, separate instructions. The generic helper refuses that exact pending code. Raw exception details are not rendered. Repeated reporting creates no duplicate notice or listener.

## Evidence

- Real production startup with a valid registry and Work bundle containing an invalid numeric quote throws WORKSPACE_CORRUPT. Before this change, the real five-second toast cleanup left no visible error/status explanation. The existing Settings/category and read-only recovery exits remained reachable; this was not a navigation failure.
- The reproduction performs 20 local reads, zero writes/removes/provider operations, leaves the raw storage hash unchanged and performs no automatic navigation.
- Five new cases failed against the original code, while all existing 15 passed. Final focused coverage is 20/20. Cases use real StorageManager/getAll and workspace paths for corrupt settings and Chrome read failure, then exercise toast cleanup, repeated initialization/reporting, original navigation, focus preservation and exact pending exclusion. Existing assertions were retained.
- Native dot cloud Chromium on frozen port 8789: English and Chinese corrupt-Work startup each showed the new alert after the existing transient errors disappeared. Text wrapped visibly in the workspace bar. Clicking Settings produced a visible synthetic bridge request for options.html?workspace=work; the bridge deliberately did not open that tab. The existing read-only anchor actually opened recovery.html in another cloud-browser tab. No download, save, restore or repair was performed. The fixture uses page-memory synthetic data and a visible first-read pause; this is not an installed-extension upgrade test.
- The startup catch is the boundary. This does not change storage error classification or the separate getAll runtime-default fallback branch.

This is error presentation only. It does not diagnose or resolve the reported 1.1.71 upgrade data-loss incident. Version, store publication and GitHub Release gates remain unchanged.
