# Bounded backup-guidance native acceptance — 2026-10-12

## Runtime identity

Chrome for Testing actually loaded the 1.1.72 extension from the fixed synthetic
runtime directory `itab-synthetic-runtime`. Both the extension card and Settings
reported 1.1.72. The tested canonical runtime ZIP SHA-256 was
`9d333093031c690c7e6e3648c89ace0e1b208f54c7b6b9267d41988b70b4d20b`.
The release-sequence reconstruction and this documentation-only update preserve
those exact runtime bytes. Tests and CI configuration are unchanged.

## Completed scope

- English, light appearance; actual 320 CSS-pixel responsive viewport set through
  DevTools, rather than a resized screenshot.
- Privacy: the Version/update panel and the network/favicon settings card were
  checked. Their wording and buttons remained vertically reachable, and the
  visible favicon URL wrapped in full without related clipping.
- Data: relevant backup wording was checked at 320px and at the 1188px desktop
  viewport.
- The visible UI included all three changed localized messages:
  `updateBackupScope`, `updateUnpackedBackup`, and `tasksSettingsBoundary`.
- The coordinating reviewer directly inspected the three key native screenshots
  showing Privacy backup guidance, Privacy unpacked-upgrade guidance, and the
  Data backup boundary. Screenshots remain local and are not attached or uploaded.

This clears the bounded 1.1.72 backup-guidance/Privacy native gate only. It is not
an all-feature, all-language, all-theme, live-provider or complete backup/restore
acceptance matrix. Other languages and appearances were not tested in this pass.
The separate 1.1.73 Content-layout native acceptance remains outstanding.
