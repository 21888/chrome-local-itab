# Claude one-time organization usage snapshot candidate

Status: experimental, off by default. The independent implementation was based on production1.1.118 and integrated after the README maintenance commit04c47b0a7fd66007aed135a57d6f67bb7ab88147. A clearly marked Settings → Privacy entry opens a local experiment page; opening it does not enable access or query a provider. Four exact runtime paths are added to the packager allowlist. No Codex prototype files are included. Independent safety review and limited account-free native UI checks passed; real-account authorization and usage results remain unverified. The version is unchanged for this ordinary implementation commit.

## Candidate files and bounded workflow

The standalone `claude-usage-experiment.html` is reachable from Settings → Privacy
in the candidate runtime ZIP. It starts disabled and does nothing until the user clicks enable.
Chrome then handles the optional permission request itself: `scripting` plus
exactly `https://claude.ai/*`. This candidate adds only optional scripting to the
manifest. The production manifest already has broad optional HTTPS host eligibility
for other existing features; this feature neither adds nor requests that wildcard.
Required permissions are unchanged. No cookies, tabs, alarms or nativeMessaging
permission is added. Granted permission is not automatically revoked on close;
users can remove it in Chrome extension details. Feature enable state is not saved.

1. Show existing exact-origin Claude tabs as numeric browser tab IDs, without
   exposing potentially personal page titles/URLs. User must select one.
2. MAIN-world top-frame fixed GET `/api/organizations`; sanitized UUID/name list
   only, bounded to 100 entries and 120 code units per name. Invalid/duplicate
   UUID lists fail closed. UUIDs must be canonical hexadecimal 8-4-4-4-12, without
   assuming v4. No `orgs[0]`, no default even for a single organization.
3. Every use requires explicit selection from that returned list. Names are text
   only, with UUID fragments to distinguish duplicates. No manual path/ID input.
4. Re-read organizations in the same documentId and compare the complete sanitized
   id/name set. If changed, require restarting the selection. Only then issue fixed
   `/api/organizations/{selected UUID}/usage` in that documentId. Cancellation
   between calls prevents subsequent calls. All injections require frameId 0.
5. Show only five-hour / seven-day used percent, optional reset, timestamp and
   selected organization display. Missing/null reset means unknown; invalid reset
   fails. Null windows mean not provided, never synthetic zero. Two null windows
   are distinct from malformed/missing schema.
6. Close, a new selection flow, target navigation/removal or permission removal
   clears state. Late responses are discarded; no fallback org or old snapshot.
   Each already-issued request is bounded to 10 seconds under normal browser fetch
   behavior. Closing does not revoke an already-issued network request in MAIN;
   no further stage starts after cancellation. No automatic refresh or polling.

Requests use GET, same-origin mode/credentials, redirect error, no-store cache,
Accept JSON, 10s abort deadline, max 65536 streamed bytes, JSON content-type and
schema checks. No Cookie/token reads, Authorization header, raw response logging,
account data, storage or backend. Errors distinguish login 401, denied 403,
challenge, rate-limited 429, server 5xx, invalid schema, HTML, oversized response,
timeout and network/redirect failure. Secrets from thrown errors are not shown.

## Security and interpretation boundaries

- MAIN shares site JavaScript. The page can change fetch or other built-ins; the
  result is display information, not trusted billing evidence. Schema filtering
  does not authenticate information provided by a hostile page.
- Same-documentId and equal org lists verify request targeting, not account
  continuity. Accounts A and B may belong to the same org. Account switches or
  membership changes between requests cannot be proven absent. There is no
  account binding, identity claim, persistent card or long-term refresh promise.
- UI says “本次页面会话下所选组织的用量快照” and asks users to close/reselect after
  account switches. Exact same-org/different-session state is intentionally not
  represented as verified account identity.
- These internal endpoints have no verified official stable API contract.
- Mock tests do not constitute Chrome-native permission dialog, live-account,
  authenticated session or production rollout validation. This task intentionally
  performs none of those actions.

## Fixed public references (no copied transport implementation)

- [ghosthamster/claude-usage-tracker background.js](https://github.com/ghosthamster/claude-usage-tracker/blob/dcba9d3c6b1c1e27f3c7c8c419618c2d2b59a0b3/background.js):
  MAIN same-origin precedent. MIT, Copyright 2026 mpopovych. No background fallback,
  persistent raw data or automatic polling copied.
- [methol-dev/usage-bar extension](https://github.com/methol-dev/usage-bar/blob/f11d0cfadd298aac1772db6160deab22a942821f/extension/background.js):
  endpoint chain. Its first-org choice is explicitly not copied. Public 4/29 fixture
  and full BSD-2-Clause attribution are in THIRD_PARTY_NOTICES.md.
- [CodexBar explicit organization selection](https://github.com/steipete/CodexBar/blob/5fdb2c79f7b8a4d09a9d190802a1711fdfbdb947/Sources/CodexBarCore/Providers/Claude/ClaudeWeb/ClaudeWebAPIFetcher.swift#L814-L841)
  and [null-window tests](https://github.com/steipete/CodexBar/blob/5fdb2c79f7b8a4d09a9d190802a1711fdfbdb947/Tests/CodexBarTests/ClaudeWebEnterpriseUsageTests.swift):
  schema/selection references only. MIT, Copyright 2026 Peter Steinberger. No
  Cookie-reading desktop transport or synthetic 0% null semantics copied.
- [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)
  and [content-script worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

## Local verification

Run `node --test tests/claude-usage-snapshot.test.js` for the isolated mock contract.
Run `node --test tests/*.test.js` and
`python3 -m unittest discover -s tests -p '*_test.py'` for baseline regressions.
The only external-response fixture has public attribution above; all organization
UUIDs/names and controller response data are synthetic. No production usage claim
should be based on these tests. Local native evidence exists for the account-free UI and repaired settings-entry focus only; it is not evidence of real usage retrieval.

## Integrated verification and native limits

The frozen standalone implementation passed2884 Node/84 Python and51 focused checks. Independent safety review covered organization selection, bounded responses, same-document guards, stale completions and zero persistent usage storage. Integration retains the latest README screenshots and existing production features.

Limited Chinese-light native checks on the final118-file development package (SHA2567aae4434de8092e014efc73a315cd6392ba402487d6749c1ca40bf53f7aa5da7) passed Settings search/entry, complete entry focus rings at100%/200%, readable disclosure, default-closed empty state, safe Close/Clear, Return and reopening. Enable was never activated. No permission was granted, no Claude account/site was accessed, and no organization/usage request was made. Permission prompts, real usage parsing, network cancellation, races and nonempty cleanup therefore remain untested natively. This is a one-time session-organization snapshot experiment, not stable subscription balance, billing evidence or account binding.

Final integrated regression on the current master parent passed2884/2884 strict serial Node tests (1GiB heap),84/84 Python tests and52 focused snapshot/entry/settings-search tests. The118-file runtime matched the final native-tested development package byte-for-byte; JavaScript syntax, diff and manifest-boundary checks passed. The manifest adds only optional scripting eligibility; version, required permissions and host declarations remain unchanged. This source declaration is not an actual browser grant.

## Local snapshot timestamps

The snapshot page formats valid collected/reset instants in its current interface
language and the device's time zone, including the applicable GMT offset. The
full date and seconds remain visible across midnight and daylight-saving changes.
This is a display-only conversion of already-collected data: it adds no countdown,
refresh, storage, permissions, account lookup or provider request. A collapsed
**Original timestamps** disclosure retains the exact source values as plain text.
Unknown reset times and unprovided windows remain distinct. Invalid timestamps
still fail the existing transport validation; the renderer also defensively marks
invalid/missing times unknown. If local formatting is unavailable, a labeled
original timestamp with its source offset is shown instead.

`node --test tests/claude-usage-*.test.js` covers the actual page scripts with
synthetic data, including both interface languages, UTC/positive/negative offsets,
cross-date conversion, spring/fall DST, equivalent instant encodings, formatter
failure and clearing on close/reselection. These are DOM-model checks, not new
native-browser or real-account verification.

## Return to the Claude settings section

The existing **Back to settings and clear this snapshot** link goes to the fixed
local destination `options.html#claude-usage-settings`. The existing Settings tab
router activates Privacy and positions the Claude experiment section. This link
does not restore the previous page's search, scroll position, or browser-history
context. Opening Settings or the experiment still does not enable a read.

The link's existing click cleanup remains synchronous: active controller state
and rendered results are cleared before normal link navigation. Close, pagehide,
and unload retain their existing cleanup; late permission/organization/usage
responses cannot repopulate results or start a subsequent read stage. An already
issued read is not aborted by returning; its existing completion/timeout bounds
still apply, as described above.

`node --test tests/claude-usage-return.test.js` checks the actual Settings router,
newer tab/hash/target cancellation of delayed positioning, and the actual
experiment renderer/controller with synthetic pending completions. These are
DOM-model regressions, not native-browser navigation or live-account evidence.
