# Standalone collection JSON import and recovery

## English

In **AI result collection → Import / recover JSON**, choose a local JSON file made by this product’s collection **Export**. Finish or discard all drafts and proposed revisions first. The file limit is 2 MiB; invalid schemas, unsupported versions, duplicate JSON keys, duplicate identities and capacity violations reject the entire review. Complete backups, settings files, Markdown and third-party conversations are not accepted here.

Review the current and incoming saved/archived item counts, body-version and snapshot counts, matching IDs and changed records, and exact prompt-version references. The target is the **global collection on this device**, including archived records, regardless of current filters or workspace. **Replace global collection** is explicit confirmation to replace, not merge. Prompt bodies and other libraries are not imported. Unavailable prompt references remain exact IDs; the app does not guess or fetch another version. File text and links are not executed or followed, and no network request is added.

Cancel, closing the dialog, and selecting a file do not write saved data. If collections or prompt availability change, review again. Current saved records and their body history are retained in recovery; existing and incoming snapshots are retained subject to capacity and identity validation. No history is silently evicted to make space. Empty imports also require confirmation. After verified replacement, open the same dialog and choose a retained snapshot to review and explicitly restore its saved/archived records. Recovery is also replacement: the current collection becomes a snapshot and other retained snapshots remain. Snapshot IDs and creation times identify the choices.

A lost write acknowledgement may mean replacement already happened. The normal saved-operation controls retain the exact operation and pause new writes. Prefer **Check saved outcome (read-only)**. If a same-operation retry is rejected after an uncertain result, only read-only verification remains; no new replacement is automatically created. Missing receipts or read failures do not prove that nothing changed. Keep the tab open and inspect the library. A definite conflict requires fresh review. Closing this page during an unresolved write can lose the in-tab operation context; no crash-atomic or automatic rollback guarantee is made.

Exports and local data are unencrypted and may include private text, annotations, source URLs, historical question/source snapshots and recovery history. Removing attribution URLs does not anonymize text. Export the current library before a major migration and verify the downloaded file. For combined collection/prompt/workspace migration, use [complete local backup](complete-backup.en.md); its format and recovery flow are separate.

## 中文

在「AI 收藏 → 导入 / 恢复 JSON」选择本产品收藏页「导出」生成的本地 JSON。先完成或丢弃所有草稿及待定修订。文件上限 2 MiB；无效结构、不支持的版本、重复 JSON 键、重复身份及容量超限会拒绝整次审阅。这里不接受完整备份、设置文件、Markdown 或第三方会话文件。

审阅当前及传入的已保存 / 已归档条数、正文版本及快照数、相同 ID 与不同内容的记录数，以及精确提示词版本关联。目标固定为「本机全局收藏库」，包括归档，不受筛选或工作区限制。明确选择「替换全局收藏库」才会替换，不会合并。不导入提示词正文及其他资料库；不可用的关联保留精确 ID，不猜测或获取其他版本。文件与链接仅作为文本处理，不执行、不访问，也不新增网络请求。

取消、关闭弹窗及选择文件均不写入保存数据。收藏或提示词可用性变化后需重新审阅。当前已保存记录及正文历史进入恢复快照，已有和传入快照在容量及身份验证允许时保留；不会静默删除历史腾出空间。空库导入也须确认。替换核验完成后，再打开同一弹窗，选择已有快照，审阅并明确恢复其已保存及已归档记录。恢复也是替换：当前收藏成为快照，其他已有快照保留。通过快照 ID 和创建时间区分选项。

写入回执丢失时可能已完成替换。现有保存结果控件保留原操作并暂停新写入，建议先「核验保存结果（只读）」。若同操作重试在不确定结果后被拒绝，仅保留只读核验，不会自动创建新替换。没有回执或读取失败不代表数据没变化；请保持页面打开并检查资料库。确定的冲突需要重新审阅。未决写入时关闭页面可能丢失该页操作上下文，不保证崩溃原子性或自动回滚。

本地及导出数据均未加密，可能含私人正文、注释、来源网址、历史问题 / 来源快照和恢复历史。移除归属网址不等于匿名化。大规模迁移前建议导出现有库并核验下载文件。需要同时迁移收藏、提示词或工作区时使用[完整本地备份](complete-backup.zh-CN.md)，两种格式与恢复流程不同。

## Español

En **Colección de resultados de IA → Import / recover JSON**, selecciona un JSON local creado por **Export** en la colección de este producto. Termina o descarta todos los borradores y revisiones pendientes. El límite es 2 MiB; se rechazan esquemas o versiones no admitidos, claves JSON e identidades duplicadas y límites de capacidad. No se aceptan aquí copias completas, ajustes, Markdown ni conversaciones de terceros. La interfaz admite inglés y chino.

Revisa los recuentos actuales y entrantes de elementos guardados/archivados, versiones y instantáneas, IDs coincidentes y registros distintos, además de referencias a versiones exactas de prompts. El destino es la **colección global de este dispositivo**, incluidos los archivados, sin depender del filtro o espacio de trabajo. **Replace global collection** confirma una sustitución, no una combinación. No importa el texto de los prompts ni otras bibliotecas. Las referencias no disponibles conservan sus IDs; no se busca otra versión. Los archivos y enlaces se tratan como texto, sin ejecución ni nuevas solicitudes de red.

Cancelar, cerrar el diálogo o elegir un archivo no escribe datos guardados. Si cambia la colección o la disponibilidad de prompts, revisa de nuevo. Los registros actuales y su historial quedan en recuperación; las instantáneas actuales y entrantes se conservan dentro de los límites de capacidad e identidad. No se borra historial silenciosamente. Incluso un archivo vacío requiere confirmación. Tras una sustitución verificada, vuelve al diálogo, elige una instantánea y confirma la restauración de sus registros guardados y archivados. También es una sustitución: la colección actual pasa a ser una instantánea y se mantienen las otras. Se muestran la fecha y el ID de cada instantánea.

Si se pierde la confirmación de escritura, la sustitución puede haberse realizado. Se conserva la operación original y se pausan las nuevas escrituras. Usa primero **Check saved outcome (read-only)**. Un reintento rechazado tras un resultado incierto deja solo la comprobación de lectura; no crea otra sustitución. La ausencia de recibos o un fallo de lectura no demuestra que nada cambió. Mantén la pestaña abierta y comprueba la biblioteca. Un conflicto definitivo exige otra revisión. Cerrar la página puede perder el contexto de una operación incierta; no se promete recuperación automática ni atomicidad ante cierres inesperados.

Los datos y exportaciones no están cifrados y pueden contener texto privado, notas, enlaces, preguntas históricas e instantáneas. Omitir URLs no anonimiza el texto. Antes de una migración importante, exporta y comprueba la copia actual. Para migrar conjuntamente colección, prompts y espacios, usa la [copia local completa](complete-backup.es-ES.md), con su formato y flujo separados.

## Verification scope

The regression tests model file-read ordering, explicit confirmation/cancellation, strict validation, stale reviews, controller receipts and recovery failures. They do not establish native-browser file-picker behavior or service-provider compatibility. No provider call, account or paid service is needed for this feature.
