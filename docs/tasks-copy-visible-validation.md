# 复制当前显示的待办：验证范围

2026-10-17 的本地合成验证。本项在既有待办卡片内新增一次复制眼前未完成清单的入口，不代表原生浏览器或系统剪贴板已经验收。

## 实现及已验证范围

- 实现前只运行新增文件的第一个实际挂载入口用例。基线因缺少 `.tasks-copy-visible` 按钮而失败；未把后续用例宣称为已在基线得到的红例。
- `tests/local-tasks-copy-visible.test.js` 的 104 个用例使用实际 View、Controller、Store、独立合成后端以及既有小型 DOM 模型。未修改共享测试辅助文件。新旧复制及相邻待办、生命周期、存储边界和语言测试共 17 个文件、542/542 通过；Node 堆上限 512 MiB、单并发。
- 按钮贴近未完成列表，显示准确数量。收起四条、展开全部、筛选全部匹配、清除筛选恢复先前展开状态均与渲染顺序一致。重复正文不会合并；下一件事不重复；已完成/已移除即使展开也不包含。零匹配、空列表和只有归档记录时禁用。
- 输出只新增 `1. ` 形式的编号前缀及项间一个换行。保存的空格、CRLF、多行、中文、emoji、HTML 字面量和 1,000 个 Unicode 字符的正文保持原样。草稿、ID、时间、receipt 和历史副本不加入输出。
- 点击处理器在任何 await 之前同步调用 `clipboard.writeText`。对复制前后的后端读写计数和完整存储集合进行比较，确认复制不产生待办存储 I/O，不改变顺序、置顶、版本、receipt 或历史副本。
- 单条与批量复制复用同一个异步执行器、观察器清理和 `copyAttempt` 锁。双向互斥、重复点击、重复激活、重绘后继续阻止第二个请求；UI 失效不会提前释放已经发出的系统写入，只有 promise 完成或失败才解锁。
- 当前保存版本、行身份、文字、状态、列表顺序与实际可见性会在入口及反馈前核验。无 state、pending、closed、loading/saving/error、READ/WRITE/VERIFY、隐藏/inert/断开/不可见上下文、工作空间失效/暂停和离页均不发出新请求；编辑、用原文新建、批量编辑和导入读取/确认窗口也会阻止复制。
- 对晚到成功和失败分别覆盖筛选、展开、重绘、编辑、移除、隐藏后返回、整卡/列表移除后重挂、行短暂隐藏、文字改变后恢复、窗口失焦、页面隐藏/离开、工作空间替换/失效/暂停及销毁。显式 MutationObserver 记录同时覆盖已经投递与尚未投递的变动；仍只是合成事件模型。
- 复制反馈使用独立 polite status，不覆盖保存错误、Retry、Undo 或草稿，不抢焦点。没有 API、同步异常和异步拒绝仅显示安全的手动复制提示，不泄漏异常内容或自动重试。已经显示的成功提示是过去一次结果，可保留到之后的筛选或其他复制，不能理解为实时剪贴板状态。
- 实际 Store 路径模拟 READ、WRITE、VERIFY、写后丢失确认及在途保存。失败期间复制不会消耗原 Retry；同一命令重试后只有一条目标任务和一个对应 receipt，保留更新草稿与原 Undo。用原文新建、移首、置顶完成及既有单条复制的回归测试通过。
- 中英文及无语言服务时的英文回退覆盖数量、正在复制、成功和失败提示。入口是原生 `button`、`type=button`；零条使用 native disabled，其余忙碌状态沿用 `aria-disabled` 和点击检查以保留焦点。语言 JSON 解析及 `git diff --check` 通过。

聚焦运行命令：

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-reporter=tap \
  tests/local-tasks-copy-visible.test.js tests/local-tasks-copy-text.test.js \
  tests/local-tasks-view.test.js tests/local-tasks-reuse-draft.test.js \
  tests/local-tasks-move-first-view.test.js tests/local-tasks-move-first-store.test.js \
  tests/local-tasks-completion-undo.test.js tests/local-tasks-pinned-completion.test.js \
  tests/local-tasks-visibility.test.js tests/local-tasks-edit-return-focus.test.js \
  tests/local-tasks-dialog-composition.test.js tests/local-tasks-departure.test.js \
  tests/local-tasks-batch-view.test.js tests/local-tasks-store.test.js \
  tests/local-tasks-batch-store.test.js tests/local-tasks-boundary.test.js \
  tests/locale-defaults.test.js
```

## 验证边界

没有运行仓库全量测试或额外规模测试；没有原生 Chrome、真实系统剪贴板、真实 Enter/空格激活、屏幕阅读器、权限提示、剪贴板跨设备同步或截图验收。合成点击、可见性、观察器与焦点模型不能替代这些验证。测试没有个人资料或凭据，也没有截图上传、外部 provider 或收费平台。

复制只使用此页面当前渲染的保存版本，不查询另一页面尚未通知到此处的更新。已发出的系统剪贴板请求无法撤回，离页后仍可能完成；实现只丢弃失效 UI 的晚到反馈。代码不主动联网，但不能控制操作系统或其他软件对剪贴板的同步。

改动限于 View、最小样式、双语文案、指南和新增测试。未改 Store、Controller、schema、备份/迁移协议、权限、manifest 或发布配置；此文档不宣称候选已推送、发布或通过远端完整 CI。
