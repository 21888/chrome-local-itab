# Explicit selection capture (local 1.1.27 candidate)

Select text on an HTTP(S) page, right-click, and choose **Save selected text to AI collection…**. A fresh extension tab opens an **unsaved** draft. Review the text, enter a title and use the ordinary **Save locally** button. Closing or discarding the draft does not save it. Existing duplicate review and fenced collection writes still apply. This is a selection, not a conversation backup; Chrome determines the exact string delivered, which is preserved without trimming or truncation. Native Chrome acceptance observed original preformatted newlines becoming spaces in that delivered text. This is not original-page formatting fidelity; review multiline code carefully or use manual copy/paste. Code and markup remain literal text.

Editable fields and private/incognito windows are excluded. Empty, malformed and oversized selections are rejected entirely. The existing body limit is 32,000 Unicode code points. Rejected text is not retained. A fixed error page explains the failure without including any selected text or address in the page URL or errors.

## Source addresses

The draft starts with a blank source. An unchecked option can include the selected frame's validated HTTP(S) address with query and fragment removed. Unsafe frame addresses never fall back to the outer page. Credentials, unsupported schemes and unsafe URL characters are rejected as attribution. Paths may still contain private information: review the displayed address before opting in. Users can independently edit source details through the existing field. No URL is fetched or previewed.

## Temporary handoff and privacy

The only new permission is `contextMenus`; a Manifest V3 worker handles explicit menu clicks. No content script, page scanning, `tabs`, `activeTab`, `scripting`, clipboard or notification permission, extra host access, model calls or network request is added. The pre-existing optional network features are unchanged.

The exact selection and optional sanitized source candidate are temporarily held only in `chrome.storage.session`, never local/sync storage, Drive, logs or the URL. Session storage is feature-detected; unsupported browsers must use manual paste. An unpredictable opaque URL token binds the handoff to its exact extension review page and target tab. Claims can retry in that same tab; the payload is consumed only after successful draft hydration. Replayed or copied links cannot retrieve a consumed payload. A failed cleanup acknowledgment can be retried without replacing or duplicating the draft.

At most eight pending selections fit within a 512 KiB aggregate bound. They expire after ten minutes; expired entries are rejected immediately on access and physically cleaned on subsequent handoff activity. Browser restart or extension reload/update also clears session storage. Worker suspension alone does not lose a bound pending selection. A failed tab creation may leave bounded inaccessible data until cleanup/expiry; it is not automatically retried. A worker interrupted before tab binding fails closed. Small payload-free tombstones make acknowledgment retries idempotent. Session expiry does not erase a draft already hydrated in its page.

Late results cannot overwrite any draft, newer user interaction, pending save, dialog or revision review. A fixed message offers retry after the user finishes the current work. After successful cleanup the opaque token is removed from the page URL. Saved excerpts use the existing global collection and backup format; no schema changes. Only explicit Save makes captured text durable or eligible for existing collection exports/backups.

## Verification scope

Focused pure, worker, controller and model-DOM tests cover boundaries, permissions, lifecycle, replay and unchanged durable data before Save. The integrated candidate passed 1,524 Node and 52 Python tests. Bounded native acceptance passed the explicit menu → unsaved draft → Save flow and documented replay/editable guards. Forced worker termination and incognito were not exercised natively. See [native report and limits](selection-capture-native-validation.md). This document is not a release or installation claim.
