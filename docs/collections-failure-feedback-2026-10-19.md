# Preserve rejected collection actions without weakening read protection

AI collection reads no longer replace feedback owned by a rejected operation with a generic read error. Confirmed data can refresh after storage recovery while the Archive or Restore failure remains visible. No action is automatically replayed.

## Separate feedback from read eligibility

Import / recover JSON now additionally requires the controller's existing current successful-read proof: comparisonReadGeneration must equal readGeneration. All previous readiness conditions remain. This prevents retained operation feedback, or an explicit selection that dismisses an error, from reopening replacement review after a failed read. A successful current read or accepted successful mutation updates that proof; stale reads cannot do so.

The initial controller has no state and no successful-read proof. Read-only Refresh saved data remains available when an error is shown. Reading cannot itself replay Archive or Restore. The existing explicit selection and next-operation feedback behavior is retained.

## Reproduced path

The actual global Manager collection backend, Store, Controller and View were exercised over synthetic Chrome storage. A real complete-backup restore stopped after its prepared marker. Archive and Restore were each refused without any write; the automatic read then failed against the same fence. Previously, that read changed the error scope to read. A genuine reviewed recovery emitted its recovered-marker notification, successful reading cleared the error, and the original user intent remained unsaved.

With the fix, recovery updates confirmed state but retains the rejected operation's error. Original collection bytes and other original authorities remain unchanged. The failed action performs zero writes; recovery itself performs two RAM sets, including an identical original-authority rewrite and the recovered marker. Only the marker changes and emits the corresponding notification in this fixture.

Regression coverage includes current read proof, failed-read selection, stale reads, explicit retry and read-only verification of uncertain commands, dirty metadata drafts and already-satisfied intent controls. Storage commands, operation receipts and recovery protocols are unchanged. These synthetic checks do not diagnose or repair the historical browser-store upgrade incident.

## 中文

AI 收藏库后台读取失败不再覆盖被拒操作的错误。恢复后可刷新已确认内容，同时保留「归档／恢复」失败提示；不会自动重放操作。

「导入／恢复 JSON」入口额外要求当前成功读取凭证，并保留所有原有条件。读取失败后，即使明确选择条目清除提示，也不能借此开放替换审核；须等当前读取真正成功。初始未读状态没有凭证，迟到读取不能刷新凭证。错误状态下仍可明确选择只读「刷新已保存数据」。

已用真实全局 Manager、Store、Controller、View 及完整备份中断／恢复链路验证。被拒归档／恢复零写；恢复流程本身有两次 RAM 写入，不能称为零写恢复。原始收藏字节与其他原始副本不变。未修改写入、操作凭据或恢复协议，也不构成原升级事故已经修复的证明。
