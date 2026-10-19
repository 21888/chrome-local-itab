# Departure warning while appearance saves are pending

The existing beforeunload handler now requests the browser's native departure warning while an explicit appearance save is queued or pending. The handler does no storage I/O and does not save, retry, cancel or roll back a write.

The check uses only Appearance Controller pending state. An idle page, a completed save, a failed selection whose patch has been cleared and controls restored, or an unapplied temporary template preview does not acquire a new warning. Existing explicit departure permission and its cancellation keep their behavior.

Executable tests use the real Appearance controller, Work session, StorageManager, lifecycle and a synthetic Chrome storage boundary. The pre-fix regression has two failures and two passing negative controls; the corrected regression passes all four. A separate production Settings startup exercise covers queued and already-submitted writes, success and failure. Its retained raw storage outputs are byte-identical before and after this change; only departure-warning flags change. Event dispatch itself leaves storage and provider counters unchanged.

Browsers decide whether to show a native warning. Native browser prompting has not been verified for these pending-write scenarios. Requesting a warning cannot guarantee that departure is stopped or that an already submitted write is cancelled. This does not establish the cause or repair of the historical extension-upgrade incident.

## 中文

外观保存处于排队或进行中时，现有离页处理会请求浏览器显示离页警告。处理本身不读写存储，也不自动保存、重试或撤销写入。

只检查外观控制器的 pending：保存成功、失败后草稿已清空且控件回到确认值、普通空闲页及未应用的临时模板预览不新增警告。合成真实控制器与设置启动测试验证了这些边界，修前后原始存储结果一致。

是否显示原生提示仍由浏览器决定，本项没有实际浏览器 pending 写入提示验收；不能保证阻止离页或取消已经提交的写入，也不证明原升级事故已经修复。
