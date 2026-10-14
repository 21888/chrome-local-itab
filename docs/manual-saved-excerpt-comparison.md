# Manually compare saved excerpts

An unarchived AI collection item now offers **Compare any saved excerpts**. This includes saved context answers and pasted excerpts without a prompt-version link. Open it, then explicitly choose another current unarchived item from the global collection. The chooser is independent of sidebar search, tag, type and tool filters. Nothing is selected automatically.

The existing **Compare saved results** action remains separate and still limits its candidates to the same exact prompt ID and body-version ID. Manual comparison does not assume shared questions, input excerpts, prompts, models or provenance, even if the answer text happens to match.

## What is shown

- The two current saved bodies, as literal text, with their own title, tool label, record ID and body-version ID. Only the displayed copy normalizes CRLF and bare CR to LF so browsers show every line. Saved originals, exact-equality checks, copying and export keep their existing raw text. Spaces, tabs, Unicode and code-like text are not transformed. No HTML is executed. The dialog explicitly discloses normalization and warns that visually identical text can still differ in original line endings.
- Each item's user-provided source URL as text, explicitly unverified. Links are not fetched or made into new navigation controls.
- Each item's exact saved prompt/version link, or an explicit unlinked label. No prompt body is fetched or substituted.
- When an item has a context snapshot, a note identifies its first answer version and explains that its historical input may not describe the current revised excerpt. Snapshot text, notes, hidden input, old body versions and recovery records are not added to this comparison.
- An exact-equality message when the two saved body strings are identical. Different text is not a quality judgment.

Only the current saved body is compared, even when an unrelated unsaved draft exists for that item. Drafts are preserved. Wide layouts show two columns; narrow layouts stack the same sections. Long bodies remain scrollable and keyboard-focusable. The existing focus trap and IME-safe Escape handling are reused.

## Read-only lifecycle

Opening, choosing and closing make no network/model request, storage write, clipboard access, export or permission request. No dependency, manifest permission, storage key or backup field is added. Candidate count and text size remain bounded by the existing collection store (200 records, 32,000 Unicode code points per body).

A saved-data refresh clears the displayed comparison immediately, before the read resolves. Read failure, state change, archive, revision, metadata change, save/uncertain-operation state, editing the starting item and selecting a different starting item invalidate it. Late reads never revive old bodies. Closing, page departure and BFCache suspension clear the displayed bodies; an old chooser callback cannot alter a newly opened comparison. Reopen and explicitly choose again after refreshing if needed.

Comparison readiness now requires a separately verified current read/write generation. Clearing an ordinary error notice by selecting an item, creating/discarding a draft or editing cannot turn retained cache into verified current data. A lower-revision read is refused rather than marking the retained higher-revision cache fresh. If an ordinary notice was cleared, a local **Refresh saved data** control remains available beside the disabled comparison actions. A successful fresh read, or a successfully accepted verified store-write acknowledgement, restores readiness.

## Validation

Synthetic store/controller/DOM-model coverage is in `tests/manual-saved-excerpt-comparison.test.js`; the unchanged exact-link workflow is covered by `tests/saved-result-comparison.test.js`. Tests exercise unlinked context answers, arbitrary saved candidates, independently labeled provenance, normalized display line endings with raw equality/markup, first-version history, no automatic choice, empty candidates, filters and retained drafts, both sides of archival/metadata/body changes, failed and out-of-order reads, cache error-clearing regressions, lower revisions, pending/uncertain operations, close/reopen, IME Escape, pagehide/BFCache, disposal and Chinese labels. Counters assert that the comparison has no writes, network, grant or clipboard side effects.

Run:

    node --test --test-concurrency=1 tests/manual-saved-excerpt-comparison.test.js tests/saved-result-comparison.test.js
    node --test --test-concurrency=1 tests/*.test.js
    python3 -m unittest discover -s tests -p '*_test.py'

These are synthetic checks, not native layout or provider-account acceptance. No real provider, credentials, paid platform, user device or screenshot was used to implement or test this feature. Native browser QA is recorded separately.

## 中文

未归档收藏新增「手动对照任意收藏摘录」，可对照上下文问答保存的答案、手动摘录或关联不同提示词的结果。需明确选择另一条当前未归档收藏，不受侧栏筛选限制，也不假定输入、提示词、模型或来源相同。原「对比已保存结果」仍只接受同一精确提示词及版本的结果。

各自显示正文、标题、工具、条目和正文版本 ID、未经核验的来源网址以及各自提示词关联。有历史输入时，仅说明其关联首版回答，不把历史输入冒充当前修订正文的来源。显示副本将 CRLF/CR 统一为 LF，避免裸 CR 视觉连行；原文保存、复制、导出和精确相等判断不变，界面明确提示看似相同仍可能存在原始换行差异。对照只读，不联网、不写入、不复制、不导出、不请求权限。数据刷新、读取失败或变更会清空对照；切换条目清掉错误提示也不能重新使用未经核验的旧缓存。请成功刷新后重新打开并选择。

## Español

**Compare any saved excerpts** permite elegir manualmente otro extracto actual y no archivado, incluidas respuestas de contexto sin vínculo a un prompt. Los filtros de la barra lateral no limitan esta selección. Cada texto conserva sus propios identificadores, versión y origen declarado; no se presupone que compartan entrada, modelo o procedencia. La comparación anterior por prompt y versión exactos sigue siendo independiente.

Es una vista de solo lectura, sin llamadas a modelos, guardado, portapapeles ni exportación. Una lectura fallida o un cambio invalida los textos mostrados. Borrar un aviso al cambiar de elemento no convierte la caché antigua en datos actuales verificados. Actualiza los datos y vuelve a elegir explícitamente. La interfaz conserva la alternativa en inglés para español.
