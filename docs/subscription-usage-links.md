# Official subscription usage viewing

Reviewed against public official documentation on 2026-10-15. Settings → Privacy provides explicit links to the Codex usage guide and Grok dashboard. Opening Settings, searching its labels or focusing a link does not query either provider. These are ordinary user-clicked HTTPS links, opened in a new tab with `noopener noreferrer`; they do not connect an account to Local iTab or import usage.

Local iTab does not currently collect Codex or Grok subscription usage. No placeholder percentage or balance is shown. API billing must not be presented as a consumer subscription allowance. The separate Claude experiment below the guide remains disabled by default and retains its own optional permission, tab and organization selection flow; see [its documented limits](claude-usage/EXPERIMENT.md).

## Fixed official references

- [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan) directs users to Settings or the usage dashboard, and to `/status` within an existing CLI session. The extension link opens that help page, not the Codex desktop app, a guessed account deep link or a new CLI session.
- [Grok subscription management](https://docs.x.ai/x-subscription/manage) links to [the official dashboard](https://grok.com/dashboard), where the user selects Usage. [Usage limits](https://docs.x.ai/x-subscription/usage-limits) describe current plan allowances. [Grok FAQ](https://docs.x.ai/grok/faq) describes Settings → Usage for the legacy experience. Sign-in, visible fields and reset times remain the official site's responsibility.

This feature introduces no permissions, account detection, session/cookie reads, automatic requests, background polling, storage fields or local native bridge. Opening external links is a user action and may lead to the provider's own sign-in flow. No real-account acceptance test is claimed.

The official [Codex App Server](https://developers.openai.com/codex/app-server/) documents an authenticated local `account/rateLimits/read` method. Its existence is not a claim that the current extension can call it anonymously or that API billing represents subscription usage. Automatic collection remains a separate unimplemented integration, not a capability supplied by these links.
