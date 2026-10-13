# Unsaved prompt preview / 未保存草稿预览

## English

Create a new prompt or load a built-in starter, then choose **Preview unsaved draft**. A title is not required for preview; a nonempty body is required. Fill the detected variables, or choose **Use empty value** to explicitly supply an empty string. Missing and empty values are different. Review the read-only plain-text result, then choose **Copy unsaved preview**. Copy never runs a model.

**Use the template literally (do not replace variables)** copies the original body exactly, including `{{braces}}`, escape backslashes, whitespace and line endings. Variable fields and excerpt choices are hidden and disabled while enabled. Turn it off to restore previous temporary values and any validation errors. Switching modes invalidates pending copy feedback and excerpt reviews, even if switched back. Literal mode skips variable parsing (including the 100-variable count limit), but keeps body/output and shared-memory limits. It still requires an explicit Copy. The choice is temporary and cleared with the preview.

This preview is temporary, local to the tab, and separate from saved prompt previews. It creates no saved prompt, body version, collection, result link or provider request. Editing any draft field, switching prompts (even back again), closing the editor, starting a save or leaving the page clears temporary preview values. A canceled discard keeps the current draft. Variable inputs do not edit the template or its unsaved status. An already submitted clipboard write cannot be revoked; late completion never changes a newer preview or steals focus.

Save remains explicit and requires title and body. It saves the original template with placeholders, not filled values, as one prompt with one initial body version. An uncertain save retains the original retry/receipt flow; preview does not bypass it. Editing existing saved prompts still uses the existing save-first workflow. Saved prompt previews retain history selection and model tools; these are not available in an unsaved draft preview. Unsaved variables can use separately reviewed saved excerpts while literal mode is off.

The existing template rules apply: repeated variables share a value; inserted braces are not interpreted again; escaped braces and non-variable expressions remain literal. Limits: 32,000 Unicode characters per body/value, 100 variables, 256,000 output characters and 1 MiB output; all preview sessions share the existing conservative 2 MiB value budget. Invalid or over-limit input disables copying until corrected or previewed again. Temporary drafts/values are not backed up.

## 中文

新建提示词或载入内置模板后，选择“预览未保存草稿”。预览无需标题，但正文不能为空。填写识别出的变量，或选择“使用空值”明确提供空字符串；未填写和空值不同。核对只读纯文本后，主动点击“复制未保存预览”，不会运行模型。

勾选“按原文使用”可精确复制正文，保留 `{{花括号}}`、转义反斜杠、空白和换行。开启时变量与摘录入口隐藏并禁用；关闭后恢复此前临时值及校验错误。切换会使进行中的复制反馈与摘录审阅失效，即使随后切回也不会恢复旧票据。原文模式跳过变量解析（包括100个变量限制），但仍执行正文、输出及共享内存限额，仍需主动点击复制。此选择随预览清除，不会保存。

预览只暂存于当前标签页，与已保存提示词预览独立。不会创建已保存提示词、正文版本、收藏、结果关联或模型请求。修改任意草稿字段、切换提示词（包括切回）、关闭编辑器、开始保存或离开页面，都会清除临时预览值。取消放弃草稿会保留当前内容；填写变量不会更改模板或草稿脏状态。已经提交给浏览器的剪贴板写入无法撤回，但迟到结果不会更改新预览或抢焦点。

保存仍需明确操作，且标题、正文必填；仅保存带占位符的原模板，形成一条提示词和一个初始正文版本。不确定保存继续使用原重试/核验机制，预览不能绕过。编辑已有提示词仍采用原有先保存流程。历史版本和模型工具仅属于已保存提示词；新草稿关闭原文模式时，可逐项审阅并填入已收藏摘录。

原有变量语法及限额保持不变：重复变量共用值，填入文本不会二次解析。正文和单值上限各为32,000个Unicode字符，100个变量，预览上限256,000字符及1 MiB，所有预览值共用既有保守2 MiB预算。非法或超限输入会禁止复制，直到修正或重新预览。临时草稿与变量不会进入备份。

## Development verification

Frozen implementation:2741/2741 Node tests passed with strict unhandled rejections
and a1 GiB heap;81/81 Python tests and113-file runtime packaging passed. The25
new draft-preview tests and independent36-case audit plus274 related tests cover
real Store persistence boundaries, shared clipboard exclusion, focus ownership
and stale/directly replaced drafts. Limited Chinese native validation passed Summary loading, keyboard focus in the
first variable, actual OS clipboard copy/paste into the unsaved editor, title/body
edits invalidating old values/output, discard cancellation preserving the draft
and confirmed leave restoring an empty library. Light/dark100% and dark200%
ordinary browser zoom representatives passed; baseline restored. No native save,
provider, transaction fault, limit, concurrent copy, clipboard failure, ARIA or
true320/375 viewport validation is claimed. Manifest remains1.1.110 with no release.

## Literal-mode regression verification

Controller and model-DOM checks cover English/Chinese checkbox state, exact CRLF/Unicode/escaped braces, restoring values and errors, parsing-count bypass with unchanged body and memory limits, edit/save/discard/dispose cleanup, late clipboard success/failure, and late excerpt Apply after both a toggle and a round trip. No new native-browser validation is claimed.

The frozen literal-mode implementation passed2796/2796 strict serial Node tests
with1 GiB heap,81/81 Python tests and66/66 focused draft tests. Runtime packaging
verified113 explicit files. Manifest remains1.1.113 for this ordinary feature;
literal-mode native acceptance is pending, separate from historical preview QA.
