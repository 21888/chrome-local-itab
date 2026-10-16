# Complete-backup image count validation

## Scope

The complete local backup review now sums image references across every live
workspace and recoverable workspace in Trash. Previously, shortcut image counts
were summed but background/poster presence flags were ORed, so multiple
backgrounds or posters appeared as only one of each in the preview.

This corrects the read-only summary. The diagnostic baseline already retained
all images in the export and after an explicitly confirmed restore: the example
below showed 8 incoming / 1 current in the preview despite retaining 12 / 3
references. No image-data loss was observed in that flow.

The count uses the existing configuration semantics: each data-URL shortcut
icon, populated image background and populated movie poster contributes one.
Repeated values count separately, including references in Trash. This is not a
unique-image count or an image-decoding check. Existing `dataUrlIcons` and boolean
presence fields keep their meanings. Schema 1 and selected single-workspace
destination summaries retain their previous fallback calculation. The new
`localImages` total exists only in the in-memory review, not in exported JSON.

## Verification (2026-10-16, version 1.1.155)

- Six focused regression tests fail on baseline `53c4447` and pass with the fix.
- Real Store → localized View → Cancel / deselect configuration → explicit
  Apply → newly constructed Store, using synthetic in-memory storage: two live
  workspaces plus one in Trash, each with one background, one poster and two
  identical inline icons. Both English and Chinese previews report 12 incoming
  references and 3 current background references.
- Review, deselection and Cancel perform zero storage writes. Confirmed Apply
  preserves all 12 references and exact exported configuration data after
  reopening; the recovery copy retains the exact previous configurations.
- Zero images, one workspace without Trash, schema 1 target selection, explicit
  zero-total preference and strict-boolean fallback are covered.
- The four explicitly listed test files below pass 172/172, serially with a
  512 MiB Node heap. JavaScript syntax and `git diff --check` also pass.

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/complete-backup.test.js \
  tests/complete-backup-workspaces.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-image-counts.test.js
```

These are Node/RAM and DOM-model checks, not native browser or disk-persistence
acceptance. No browser, user device, provider service, upload, remote write or
release was used. Archive schemas, module selection, restoration, receipts,
concurrency safeguards, permissions and manifest are unchanged. Full-suite and
native-browser verification remain separate from this focused check.

## 中文摘要

完整备份预览会汇总所有正常工作空间及回收站中的图片引用，重复图片仍按每个
引用计数。原先背景和电影海报的布尔值合并导致预览少计；本次只修正数量展示。
既有复现中导出和确认恢复后都保留了全部 12 个图片引用，没有观察到图片数据丢失。
中英文预览、取消零写入、取消选择配置、明确应用后重建 Store、零图片和旧格式回退
均通过合成内存与 DOM 模型测试；这不代表真实浏览器、磁盘持久化或完整套件验收。
