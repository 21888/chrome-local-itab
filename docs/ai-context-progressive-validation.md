# Progressive context Answer validation

## Scope / 范围

Answer-only, session-local progressive display, off by default. Local/request reviews name the output and streaming mode; Tasks remain non-streaming. Existing explicit review, endpoint allow and Send remain required. No new permission, dependency, persistent key or backup schema.

仅回答模式的会话内渐进显示，默认关闭。本地与接口审阅展示输出及渐进模式，任务 JSON 不流式发送；保留原有审阅、接口授权与明确发送步骤。未增加权限、依赖、持久化字段或备份格式。

## Automated checks

- Context controller/UI and direct-client focused tests: 170 passed.
- Full Node suite: 2,950 passed.
- Python suite: 84 passed.
- Runtime ZIP built and verified: 118 runtime files. Packaging verification is static, not browser acceptance.
- Independent lifecycle audit separately ran 191 focused checks plus six extra probes; reported no blocking findings. Extra probes included bytewise UTF-8/CRLF, empty stop/DONE, missing DONE, error events, stopping during permission wait before any fetch, and stopping synchronously in final onText before DONE.

Checked with synthetic data and mocks: explicit/default-off mode selection; review invalidation; Tasks stream=false; literal markup in partial display; no partial result/save/copy; validated stop + DONE promotion; malformed/truncated/refusal/tool/error endings; stop/retry/late chunk isolation; previous answer provenance after failed replacement; page-hidden cancellation and key clearing; close/pagehide discard.

## Acceptance boundary / 验收边界

No real model account, API endpoint or paid service was used. Real-provider streaming compatibility is **not verified**. Native browser acceptance is tracked separately by the release coordinator and is not claimed by these automated results. Partial text is volatile and explicitly incomplete; hiding the page stops the request. Streaming does not mean persistent background execution. Providers may still charge for work already started.

没有使用真实模型账号、API 或收费服务，**真实提供方流式兼容性尚未验收**。原生浏览器验收由发布协调单独记录，自动化结果不代表其已通过。渐进文本仅保存在内存中且明确标为未完成；隐藏页面会停止请求，不会在后台持久运行。提供方仍可能对已开始的工作收费。
