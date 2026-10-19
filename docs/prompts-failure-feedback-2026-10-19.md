# Preserve rejected Prompt actions during read failures

A Prompt library read failure still marks linked content unavailable. It no longer replaces feedback owned by a rejected user action with a generic read error. Consequently, a later background read can refresh confirmed content without silently dismissing that failed action.

## Reproduced path

A synthetic complete-backup restore stopped after its durable prepared marker. Clicking the real Favorite control was rejected with WORKSPACE_RESTORE_PENDING and performed no write. The automatic read then failed against the same fence. Previously that read changed the error's scope to read; the genuine reviewed recovery's marker notification triggered a successful read that cleared the error, although Favorite remained unchanged.

The fix preserves the original operation error. The storage fence, pending-command identity, uncertain-outcome inspection and recovery protocol are unchanged. Reading results again does not replay Favorite. The existing explicit selection or next operation retains its existing feedback-clearing behavior. This is feedback ownership, not automatic retry or a fix for the historical browser-store upgrade incident.

## Validation

Eleven targeted regressions cover the real restore/recovery notification chain, unchanged Prompt bytes and zero failed-action writes, confirmed-state refresh, the available read-only controls, explicit selection/next operation, ordinary read-error recovery, validation-owned draft errors, stale read generations and uncertain pending commands. The initial ten-test baseline retains six failures and four passes. All eleven final tests were also run against the unchanged e1e58a7 Controller loaded in memory: seven failures and four passes; the additional test checks the missing-record read entry point.

## 中文

提示词库读取失败仍将关联内容标为暂不可用，但不会再把被拒绝的用户操作错误覆盖成普通读取错误。后续后台读取可以更新已确认内容，同时保留原操作失败提示。

合成复现中，完整备份恢复停在已持久化的 prepared 标记后，真实「收藏」操作被保护规则拒绝，零写入。修前自动读取会改变错误归属，待真实恢复通知触发读取成功后，错误消失而收藏仍未保存。修后保留操作错误；重新读取只读最新内容，不自动重放收藏。明确选择另一条目或发起下一操作仍沿用既有反馈处理。

本项不改变存储保护、未确认命令、恢复协议或原始副本，也不证明原商店升级事故已经修复。
