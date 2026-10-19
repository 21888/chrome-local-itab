# Keyboard Skip for dashboard startup failures

On a failed dashboard startup, the existing Skip link now targets the visible load-status explanation. Both ordinary failures and interrupted-restore notices get an explicit tabindex of -1. The link uses an accurate English/Chinese loading-status label, including its data-i18n key, so later localization does not replace it with the normal shortcuts label. This wiring never calls focus; focus moves only after the user activates the link.

Normal dashboard markup, destination and label are unchanged. The change is DOM presentation only and adds no storage, navigation handler, timer, retry or recovery action.

## Verification

- Native RED on the prior source: on a Chinese corrupt-Work startup, Tab reached Skip to shortcuts, Return changed the hash to an empty shortcuts container and left focus on WebArea; the next Tab returned to the same Skip link.
- Production-path automated RED: original 20 cases and the new normal-page control passed, seven failure-Skip cases failed. Final 28/28 passes cover English/Chinese corrupt Work, real Chrome read failure and prepared-restore paths, repeated reporting, no focus stealing, no extra I/O, a missing optional Skip link and real i18n.js re-localization.
- Dot cloud Chromium synthetic preview, frozen port 8790: on both ordinary corrupt-Work and pending-restore Chinese pages, Tab selected the accurate status link and Return actually focused the corresponding notice. On the pending page the next Tab reached its existing Open Settings link. No download, save or recovery was performed.
- The preview uses synthetic page-memory data and the exact frozen production runtime. It does not establish screen-reader announcements, installed-extension upgrade behavior or the cause/repair of the reported 1.1.71 incident. Release and store publication remain frozen.
