# Departure warning during recommended-module Apply

The recommended-module view exposes a read-only applying flag for the existing pending Apply phase. The shared beforeunload handler uses that flag to request a browser departure warning while an explicit Apply is waiting for its workspace lock or storage result.

Preview reads, ready reviews and cancelled reviews do not gain a warning. Apply retains its existing non-cancellable behavior while pending; attempting Cancel does not release the departure guard. When the operation settles successfully or with an error, the flag clears. The existing error message still explains uncertain outcomes; no automatic retry, rollback or root-storage fallback is introduced.

Regression tests use the actual View, Store, captured Work Session and storage boundary. They cover lock waiting, a submitted write, success, rejection, lost acknowledgement and explicit departure permission/cancellation. Dispatching the warning event leaves raw storage and read/write/lock/provider/navigation counters unchanged. Before the two-line correction, four of five cases fail; the corrected five pass.

This requests a browser warning only. Native prompting for these pending operations has not been verified. The browser may suppress a warning, and an issued storage write cannot be assumed cancelled or undone. No historical upgrade-incident cause or user-data recovery is claimed.

## 中文

推荐模块仅在用户明确点击「应用推荐模块」后、等待锁或保存结果期间请求离页警告。预览读取、待审核和已取消的预览不新增提示。保存进行中原有不可取消规则保留；成功或失败结算后释放该标记，不自动重试或回滚。

合成真实视图、Store 与工作区会话验证了锁等待、实际写入、拒绝和确认丢失等边界，离页事件自身不做 I/O。浏览器是否实际显示提示仍未经本项原生验证，也不能据此保证停止离页或撤销已经提交的写入；这不是原升级事故的归因或用户数据恢复证明。
