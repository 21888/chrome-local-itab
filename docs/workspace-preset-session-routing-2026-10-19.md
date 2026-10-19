# Recommended modules use the captured workspace

## Corrected behavior

Settings → Template & appearance → Preview recommended workspace now reads Tasks and Focus from the page's captured workspace session. Apply uses that same session and its existing writer lock, rechecks the preview against current module values, and submits both visibility changes through the existing workspace bundle writer. It does not fall back to legacy top-level storage if the session rejects an operation.

The compatibility backend remains available only when no workspace session is supplied. Module contents, recovery protocols and the workspace migration snapshot are unchanged. A failed or unconfirmed write is not reported as successful or automatically retried.

## Reproduced defect

Before this change, the preset backend read and wrote legacy top-level Tasks/Focus keys even after workspace migration. Synthetic production Settings tests reproduced this for both Default and Work:

- If legacy visibility already matched the recommendation, the UI could report success without changing the selected workspace.
- Otherwise, Apply wrote legacy keys and the real storage-change listener detected a legacy-source conflict, protecting the workspace from further use. The selected and other workspace bundles, Trash and migration snapshot remained unchanged.

These observations establish a preset routing defect. They do not identify the cause of the historical store-upgrade incident or establish recovery of any user's data. Browser-store publication and Release remain frozen.

## 中文说明

“推荐工作区”的预览与应用现在都使用当前页面已捕获的工作区会话。预览读取与保存来自同一空间；保存沿用原有锁、版本检查及工作区副本写入机制。会话失败时不会退回旧格式根键。仅未提供会话的旧兼容调用保留原路径。

修前的合成真实设置页验证发现：旧根值已匹配推荐时可能零写却提示成功；需要修改时则写入旧根键并触发旧格式冲突保护。Default、Work、Trash 的原工作区副本及迁移快照均保留。此修复不代表原商店升级事故已经归因或用户数据已经恢复。

## Validation boundary

The production Options mount was exercised with synthetic local Chrome storage and storage-change events for Default and Work, each with both legacy visibility states. Before and after raw copies and conflict-recovery exports are retained locally. The old four-case evidence was reproduced against the pinned pre-fix preset module after an audit rerun overwrote its initial stdout; the ten retained raw/recovery files matched byte for byte. The fixed four-case run uses the production default Store construction, rather than manually supplying a session argument.

These are executable local integration checks, not native-browser prompt tests, real-user recovery or crash-atomicity certification.
