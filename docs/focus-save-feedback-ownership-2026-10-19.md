# Keep Focus save failures visible across background reads

Focus storage notifications still update the confirmed state, but no longer dismiss or replace the error belonging to a failed user operation. A feedback generation separates background reads, explicit reads and mutation outcomes. An older read cannot clear a newer mutation's error. Choosing **Read latest state** can clear the feedback after a successful explicit read; it does not replay the rejected operation. A subsequent explicit operation owns its own outcome.

## Reproduced behavior

Two real captured Work sessions and the actual Focus views ran over synthetic Chrome storage. One page saved the duration from 25 to 30 minutes while the settings page tried to hide Focus with its existing checkbox. The duration write committed; the older visibility command was correctly rejected with CONFLICT. Previously, a subscribed read then erased the error and hid Read latest state, although the checkbox remained enabled and the hide intent was not saved.

The corrected flow keeps the failure message and read-latest action visible while accepting the committed 30-minute state. Explicitly reading latest clears the message without changing visibility or adding a write. Original Default, Trash, legacy root and migration copies remain unchanged. The independent corrected run has byte-identical before/after raw data to its retained pre-fix run; only feedback differs.

## Validation boundary

Nine regressions cover the real two-session conflict; late successful and failed reads; background state delivery; explicit Retry; a read begun during a pending action; initial read failure/recovery; and destroyed views. Pending-action refresh coverage invokes the public API directly: the native Retry button is disabled while a mutation runs. It does not claim that a user can activate that disabled button.

Storage commands, revision checking, captured workspace routing, clock calculations and timer transitions are unchanged. No failed action is automatically retried or rolled back. These checks do not identify or repair the historical browser-store upgrade incident.

## 中文

后台通知仍更新专注计时器已确认的状态，但不会清掉或替换当前保存失败的提示。旧读取也不能覆盖较新操作的错误。用户明确选择「读取最新状态」成功后可清除提示；它只读最新值，不会自动重放此前被拒绝的隐藏操作。

已用同一个 Work 的两个真实会话复现：另一页保存 25→30 分钟，本页尝试关闭显示因旧版本冲突被拒。修前后台读取会令错误及读取按钮消失；修后持续显示失败，同时正确呈现已保存的 30 分钟。原始存储副本与修前结果一致，其他空间和迁移副本不变。本项未修改写入或计时协议，也不构成原升级事故的归因或恢复证明。
