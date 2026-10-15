# Import operation boundaries when duplicating a workspace

A workspace with a pending, unsupported or malformed configuration-import receipt
cannot be duplicated. The check runs after acquiring the lifecycle lock and before
creating any new bundle or registry entry. It neither verifies nor clears the
source operation. The dialog keeps its name draft and offers read-only Recovery
in a separate tab for the exact source workspace.

A source with no receipt follows the existing duplicate behavior. A supported,
verified receipt is omitted from the new workspace only: operation identity must
not move to a different workspace. Saved configuration and complete retained
recovery objects (including prior ancestry) are copied unchanged. The existing
Focus reset on duplication is unchanged. The source receipt, settings, personal
modules and recovery objects stay untouched. The new workspace's first explicit
configuration import creates its own recovery copy and receipt.

Pending conflicts cannot be bypassed by making a copy. This does not add a
resolution protocol, restore historical data or establish that an uncertain write
never committed. A duplicate write/readback failure does not claim success and
never clears the source evidence. No permissions, storage keys, account access or
provider requests are added.

Synthetic tests exercise pending and changed-pending sources, malformed/future
receipts, verified/no-receipt sources, ancestry, a source change before lifecycle
lock admission, quota/readback failures, the actual production dialog/core path,
and Chinese/English errors with a scoped read-only link. Native browser and disk
persistence are separate acceptance gates.

## 中文

配置导入尚未核验，或操作记录无效/版本不支持时，不能复制该工作区。检查在锁内、
写入新副本之前执行，不会自动核验、清除或转移源操作。对已核验的源，只在新副本中
省略导入操作记录；保留当前配置及完整恢复副本，源内容完全不变。新工作区后续
明确导入时会生成自己的恢复副本和操作记录。对话框保留名称草稿，并提供源工作区
的只读恢复页入口；这不是解除已有导入冲突的功能。
