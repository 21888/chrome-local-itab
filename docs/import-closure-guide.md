# Keep saved settings and end an unverified import

When an earlier Settings or Drive import is still recorded as pending and its saved-state fingerprint no longer matches, Settings can review one explicit decision: **keep the currently saved settings and end that unverified import**.

1. Leave any open drafts in their existing tabs. This action uses saved settings and does not save, discard or include those drafts.
2. In Settings → Data, choose **Review keep-current decision**. Review is read-only. The complete original recovery must still match the original pending receipt. Missing or mismatched original recovery, invalid source records and an occupied archive slot remain blocked.
3. Read the workspace and capacity notice. Choose **Keep saved settings and end this unverified import** only if that is the intended outcome. Cancel, leave the section or hide the page to discard the review.
4. If recording cannot be confirmed, choose **Recheck recorded decision (read-only)**. The page never automatically retries a write. If no record is established, a new review and confirmation are required.

The old receipt remains **pending**. Ending it is an explicit decision, not verification of the original file, proof that the import succeeded, or proof that data can be recovered. No new import starts automatically and Sync does not resume as part of this decision.

## The single local archive

All workspaces in this installation share **one** immutable slot. It retains the original pending receipt, the configuration saved at the decision time, and the complete original recovery. A later different conflict cannot use another slot. Reset retains this archive and does not free capacity. There is no delete, retire or overwrite action in this version.

This is local historical evidence, not an encrypted vault or a portable backup. Provider bookkeeping already present in the original recovery stays local. The summary does not display that bookkeeping or raw configuration content. Normal Settings, Drive, Sync and Complete exports do not include the archive.

The independent read-only Recovery page can still discover the archive when its workspace no longer appears in the current registry. It labels the saved-at-decision configuration and original recovery separately from today's saved state. The original receipt may still be pending while its exact keep-current decision is recorded. A different current receipt does not inherit that decision.

The saved-at-decision configuration remains investigation-only. The original recovery must independently pass the existing strict configuration-file checks before a separate reviewed download is offered. An archive checksum does not override credential checks, missing fields or unsupported content. Downloading does not restore anything and does not free the slot.

## A later import is a separate decision

Selecting a file after an exact keep-current decision still requires a new, explicit confirmation for that selected file. Both Manual and Drive imports use the same confirmation path. It captures the latest saved state as the new recovery copy and leaves the historical archive unchanged. An automated retry or generic retry flag cannot provide that new consent.

Uninstalling the extension, clearing extension data, deleting the browser profile, arbitrary storage edits and incompatible older versions are outside the preservation guarantee. Downgrades are not guaranteed to preserve this evidence.

## Verification scope

Automated tests use synthetic storage and DOM models. They exercise review ownership, stale and hidden controls, read-only recheck, private new-import confirmation and the actual Recovery script chain. These tests do not establish native browser painting, extension permissions, browser storage crash durability or real-account provider behavior.
