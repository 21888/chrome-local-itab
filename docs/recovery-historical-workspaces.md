# Historical workspace copies in read-only Recovery

Recovery also inspects the single known `__localItabWorkspaceRecoveryV1` snapshot
retained before workspace topology replacement. This can expose a workspace that
is absent from the current registry. It does not enumerate storage, scan arbitrary
orphan keys, follow journal references, initialize workspaces or write anything.

The historical envelope, registry and embedded bundles must have supported exact
structures and one-to-one workspace ID/generation associations. Invalid,
ambiguous, polluted or oversized metadata does not receive historical attribution.
The existing byte, node, depth, chain and entry budgets are unchanged. Current
sources are read first, and the historical source participates in the same two-pass
consistency check. Missing history is not proof of deletion or guaranteed recovery.

Historical rows show their recorded workspace ID, label, generation, snapshot time
and historical Trash state. Current-registry comparison distinguishes the same
generation, a different generation, an absent ID and an unverifiable current
registry. Historical attribution is not current membership or content integrity.
A workspace query may show separately counted current and historical matches;
invalid queries still require an explicit global view. No source is selected,
reviewed, downloaded or restored automatically.

The outer prior snapshot has no stored historical checksum. Its bare configuration
is available only for the existing projected investigation export, which can omit
unsupported/private fields and is not an importable backup. Independently
checksummed nested restore/identity copies may qualify for a separate reviewed
configuration file under the unchanged strict format, credential and lossless-value
gates. A new inspection hash never supplies missing historical integrity evidence.
Normal refresh, visibility changes and context toggles retire stale review/download
controls. Personal modules, credentials and provider metadata are not added to the
investigation export.

Synthetic coverage includes a real workspace replacement that removes a named
workspace, valid/invalid historical associations, generation comparison, historical
query counts, both languages, budget refusal, changed snapshots, secret-field
omission, strict nested recovery admission and stale controls. Tests do not prove
actual user-data recovery, installed-extension behavior or disk durability.

Run:

    node --test --test-concurrency=1 tests/recovery-inspector.test.js tests/recovery-view.test.js tests/recovery-file-view.test.js tests/recovery-file.test.js tests/legacy-url-restore.test.js

## 中文

只读恢复页新增读取一份已知的「工作区替换前快照」，可展示当前登记中已不再列出
的历史工作区。不会扫描任意存储键、读取恢复事务引用、写入、切换或自动恢复。
历史记录明确显示其代际、快照时间和当时的回收站状态；历史归属不代表当前仍存在
或内容已核验。工作区链接分别统计当前与历史匹配，仍可明确选择查看全部。

外层历史快照没有持久化的历史校验值，所以其配置只能导出经过筛选的调查文件，
不能直接作为恢复包导入。内嵌副本只有保留自身有效校验、通过原有严格完整性与
无损检查时，才可另行审核配置文件。大小或结构错误不触发修复、删除或补默认值。
这不会保证找回过去丢失的内容，也不扫描未被这份快照引用的孤立记录。
