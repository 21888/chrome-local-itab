# Official subscription usage viewing

Reviewed against public official documentation on 2026-10-15. Settings → Privacy provides explicit links to the Codex usage guide and Grok dashboard. On 2026-10-26, the same passive section was extended with a Claude official usage guide. Opening Settings, searching its labels or focusing a link does not query these providers. These are ordinary user-clicked HTTPS links, opened in a new tab with `noopener noreferrer`; they do not connect an account to Local iTab or import usage.

Local iTab does not currently collect Codex or Grok subscription usage. No placeholder percentage or balance is shown. API billing must not be presented as a consumer subscription allowance. The separate Claude experiment below the guide remains disabled by default and retains its own optional permission, tab and organization selection flow; see [its documented limits](claude-usage/EXPERIMENT.md).

## Fixed official references

- [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan) directs users to Settings or the usage dashboard, and to `/status` within an existing CLI session. The extension link opens that help page, not the Codex desktop app, a guessed account deep link or a new CLI session.
- [Grok subscription management](https://docs.x.ai/x-subscription/manage) links to [the official dashboard](https://grok.com/dashboard), where the user selects Usage. [Usage limits](https://docs.x.ai/x-subscription/usage-limits) describe current plan allowances. [Grok FAQ](https://docs.x.ai/grok/faq) describes Settings → Usage for the legacy experience. Sign-in, visible fields and reset times remain the official site's responsibility.

This feature introduces no permissions, account detection, session/cookie reads, automatic requests, background polling, storage fields or local native bridge. Opening external links is a user action and may lead to the provider's own sign-in flow. No real-account acceptance test is claimed.

The official [Codex App Server](https://developers.openai.com/codex/app-server/) documents an authenticated local `account/rateLimits/read` method. Its existence is not a claim that the current extension can call it anonymously or that API billing represents subscription usage. Automatic collection remains a separate unimplemented integration, not a capability supplied by these links.


## Claude guide addition — 2026-10-26

The public [Claude usage-limit guide](https://support.claude.com/en/articles/9797557-usage-limit-best-practices), reviewed on 2026-10-26, describes **Settings → Usage** and plan-dependent usage displays. The new link opens that guide, not a guessed account deep link. Sign-in, availability and displayed limits remain the provider's responsibility. There is no claim that every plan exposes identical fields.

The English/Chinese labels distinguish this ordinary help link from the separately opt-in snapshot experiment. Both labels are searchable in Settings. No experiment or permission flow, manifest, catalog, CSS, settings values or runtime request code changes. The original Codex/Grok links and their guidance are unchanged; their earlier reference review is not represented as a fresh metadata check.

The old source failed the expanded three-guide contract (2 anchors versus 3, with the Claude label absent). This is evidence of a missing passive entry, not a broken existing account integration. After the addition, the complete guide tests exercise real Settings startup, bilingual search and focus, and prove no JavaScript fetch/storage/permission/account access from this section. Mutation checks reject injected Claude guide requests or click handlers; native external navigation/sign-in is not modeled.

### Acceptance scope

- Related complete files (guide, Settings search and six Claude experiment modules): **154/154 passed**, exit 0. Existing manifest, permission helpers, experiment runtime/HTML, catalog and CSS preservation guards are unchanged.
- Native Chromium, isolated port 8792: the actual Settings page searched `Open Claude usage guide`, returned one Privacy-section result, focused its heading, then three ordinary Tab presses reached Codex, Grok and the new Claude anchor. DOM readback confirmed the exact official help URL, `_blank`, and `noopener noreferrer`; the visible explanation distinguished it from the optional experiment below.
- No external link, experiment, provider permission, import or update control was activated. Synthetic readback showed zero writes and exact personal/global/other-workspace data. This is local control/search/keyboard acceptance, **not** an external-site sign-in or account-usage test.
- The first fixture build contained a malformed synthetic locale script and showed untranslated keys. Only that fixture script was corrected and the owned page reloaded before the successful chain; no production fix or failed-account conclusion is inferred from it.
- The owned tab, dedicated port-8792 server and terminal tab were closed after stopped-marker/shell verification. Original browser tab remained untouched. Screenshots were inspected in-tool, not uploaded.
- Final fixed-source regression: all **439 Node test files, 17,245/17,245 tests passed**, exit 0; all **91 Python packaging/release/brand tests passed**, exit 0. The focused 154 are included in that aggregate, not additional distinct tests. Syntax and whitespace checks also passed. No production source changed after the native check or while the final suite ran.
