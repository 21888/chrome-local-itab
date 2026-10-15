/* Standalone read-only inspection UI. Never boots a storage writer or provider. */
(function (root) {
    'use strict';
    const copy = {
        ImportTitle: "Current workspace import status",
        ImportIntro: "A point-in-time, read-only comparison of recorded import fingerprints. Refresh inspection to recheck. Historical copies below are never treated as current imports.",
        ImportFilter: "The workspace filter also applies to current import status. Show all saved copies includes import status from all validated current workspaces.",
        ImportEmpty: "No current workspace import record could be inspected in this context. Historical copies do not establish a current operation. This does not prove deletion.",
        ImportWorkspace: "Current-registry workspace",
        ImportMembership: "Current registry membership",
        ImportLive: "Listed as a live workspace",
        ImportTrash: "Listed in Trash in the current registry",
        ImportStatus: "Recorded import receipt status",
        ImportVersion: "Supported receipt version",
        ImportPending: "Recorded as pending",
        ImportVerified: "Recorded as verified",
        ImportMissing: "No import receipt is present in this current bundle",
        ImportInvalid: "Invalid receipt; no fingerprint comparison is available",
        ImportUnsupported: "Unsupported receipt version; no fingerprint comparison is available",
        ImportUnavailable: "The current source could not be inspected reliably",
        ImportTarget: "Current saved state versus recorded target",
        ImportRecovery: "Retained recovery object versus recorded recovery",
        ImportMatch: "Match",
        ImportMismatch: "Mismatch",
        ImportAbsent: "Missing",
        ImportUnknown: "Unavailable",
        ImportMatchedHelp: "These saved fingerprints currently match. This read-only check does not complete the earlier import, verify the original file or establish recoverability. Use the original file in Settings for the normal verification flow.",
        ImportMismatchHelp: "The current saved state differs from the recorded target and/or retained copy. Nothing was changed or unlocked. Inspect saved copies below; this does not establish that any earlier data can be restored.",
        ImportIncompleteHelp: "At least one complete source is missing or unavailable. No successful comparison can be inferred for it. Nothing was changed or unlocked.",
        ImportFileUnchecked: "Original import file not supplied; file identity has not been checked.",
        ImportRecordedHelp: "The status above is only what the saved receipt records. This page does not settle, retry or unlock an import. Receipt matches never authorize a configuration download.",
        ImportDigests: "Show recorded and computed fingerprints",
        ImportRequestDigest: "Recorded request fingerprint · original file unchecked",
        ImportExpectedTarget: "Recorded target fingerprint",
        ImportCurrentTarget: "Computed current-state fingerprint",
        ImportExpectedRecovery: "Recorded recovery fingerprint",
        ImportCurrentRecovery: "Computed complete recovery fingerprint",

        ContextHistoricalMatched: "Requested workspace ID: $1. Showing $2 current-registry copies and $3 historical-registry copies. $4 other or unattributed copies are hidden. Historical matches do not mean this workspace is currently present.",
        ContextHistoricalMatchedAll: "Requested workspace ID: $1. This snapshot contains $2 current-registry copies and $3 historical-registry copies for that ID. Historical matches do not mean this workspace is currently present.",
        SourceHistoricalWorkspace: "Workspace copy retained before replacement",
        HistoricalOrigin: "Retained historical workspace snapshot",
        HistoricalHelp: "This copy comes from a retained earlier registry, not a selection of the current workspace state. Its recorded generation and Trash status belong to that historical snapshot. No data is restored or selected automatically.",
        AttributionHistorical: "Matched to the retained historical registry; not proof of current membership or content integrity",
        WorkspaceGeneration: "Recorded workspace generation",
        SnapshotTime: "Snapshot time (this device’s time)",
        CurrentRelation: "Comparison with current registry",
        RelationSame: "Same ID and generation are currently listed",
        RelationDifferent: "Current registry lists this ID with a different generation",
        RelationAbsent: "This ID is not listed in the current registry; this does not prove deletion",
        RelationUnknown: "Current registry could not be verified",
        WarningHistorical: "The retained pre-replacement workspace snapshot could not be validated. Its records are not attributed or shown; other sources remain available.",
        ContextAll: "Showing saved copies from all workspaces, including unattributed records. No copy is selected automatically.",
        ContextMatchedAll: "Requested workspace ID: $1. This snapshot contains $2 copies with verified attribution to this workspace.",
        ContextMatched: "Requested workspace ID: $1. Showing $2 copies with verified workspace attribution. $3 other or unattributed copies are hidden.",
        ContextMissing: "Requested workspace ID: $1. No copies with verified attribution to this workspace were found in this snapshot. This does not prove deletion. This snapshot contains $2 other or unattributed copies.",
        ContextInvalid: "The workspace link is invalid or ambiguous. No workspace has been selected. Use Show all saved copies to inspect the global inventory.",
        ContextExpanded: "All $1 saved copies are shown below. Check each copy’s workspace attribution before reviewing or downloading it.",
        ContextNoRows: "No copies are shown for this workspace context. You can explicitly view all saved copies.",
        ContextShowAll: "Show all saved copies",
        ContextShowRequested: "Show requested workspace only",
        ContextHideAll: "Return to workspace warning",

        ReviewCopy: 'Review configuration file', ReviewingCopy: 'Checking this exact saved copy…',
        ReviewTitle: 'Configuration file review', CloseReview: 'Close file review', DownloadRecovery: 'Download reviewed configuration',
        ReviewUnavailable: 'An importable file needs an independently checksummed, complete supported copy. This record remains available for investigation.',
        ReviewFailed: 'This exact copy did not pass the recovery-file checks. You can still inspect its allowed text. No saved data was changed.',
        ReviewIntegrity: 'This representation has no matching recorded checksum. A new checksum cannot establish what was originally saved.',
        ReviewFields: 'This copy has missing, unknown or unsupported fields, or would need changes to import. It remains investigation-only.',
        ReviewCredentials: 'Recognized credentials were found in this copy. No importable file will be made from it.',
        ReviewSize: 'This copy exceeds the recovery-file safety limit. No file was prepared.',
        ReviewReady: 'The selected copy passed the file checks. Read its source, scope and site text, then choose Download reviewed configuration.',
        ReviewScope: 'Configuration only: shortcuts, categories, layout, appearance, saved text and supported settings. This is not a Complete backup.',
        ReviewExclusions: 'Sync and provider preferences, runtime generation markers, personal modules, prompts, collections, other workspaces and older copies are not included. Downloading does not change current settings.',
        ReviewLatest: 'This surviving copy may not contain your most recent edits. A matching checksum does not prove authenticity, completeness of all your data or that this is the latest copy.',
        ReviewPrivacy: 'The file can contain private saved text and full URLs. Keep it private and review it before sharing. Importing it later is a separate, explicit replacement step in Settings.',
        ReviewSource: 'Selected source', ReviewSourceTime: 'Time inside the checked representation', ReviewRawTime: 'Unknown · raw checksum does not cover adjacent backup times',
        ReviewGeneratedAt: 'New file generated at', CategoryCount: 'Categories', DuplicateCount: 'Repeated exact URLs', PositionCount: 'Saved coordinate records',
        RecoveryDownloadRequested: 'Reviewed configuration download requested. Check your downloads. Nothing has been imported or overwritten.',
        RecoveryDownloadFailed: 'The reviewed file could not be downloaded. No saved data was changed. Review this copy again before trying.',
        ReviewTruncated: 'Long title or URL text is shortened to 4,000 characters in this review. The configuration file preserves the checked value in full.',
        Results: 'Saved local copies', Refresh: 'Refresh inspection', Loading: 'Reading supported local records…',
        Ready: 'Inspection finished. Choose a copy for text investigation, or review an eligible copy before downloading a configuration file.',
        Empty: 'No supported saved copies were found in this inspection. This does not prove that your content was deleted.',
        InspectedAt: 'Inspected at (this device’s time)', Unknown: 'Unknown', RecordedAt: 'Recorded time (this device’s time)',
        MigrationTime: 'Migration time (this device’s time)', BackupTime: 'Backup time (this device’s time)',
        SiteCount: 'Site records', UnknownCount: 'Unknown · missing or unreadable',
        Checked: 'Checks passed', Unverified: 'Not verified', Failed: 'Checks failed',
        ValidationHelp: 'Checks describe this saved record only. They do not confirm that it can be restored.',
        Workspace: 'Workspace label', WorkspaceId: 'Workspace ID', Attribution: 'Workspace attribution',
        AttributionVerified: 'Verified against the inspected registry', AttributionUnverified: 'Unverified',
        Trash: 'Listed in Trash in this saved record', Representation: 'Record format',
        Configuration: 'Configuration copy', Raw: 'Retained raw copy', Portable: 'Portable copy', Depth: 'Nested copy depth',
        SourcePreMigration: 'Before workspace migration', SourceLegacy: 'Previous local storage format', SourceWorkspace: 'Workspace copy',
        SourceBeforeCloudReplacement: 'Before cloud replacement', SourceBeforeCloudClear: 'Cloud copy retained before clearing',
        SourceIdentityRecovery: 'Layout identity recovery copy', SourceRecovery: 'Retained recovery copy', SourceUnknown: 'Other retained local copy',
        Preview: 'Preview site text', HidePreview: 'Hide site text', PreviewTitle: 'Site records · text only',
        PreviewHelp: 'Original order and duplicate records are retained. Missing fields are labelled; icons and site links are never loaded.',
        PreviewTruncated: 'Long title or URL text is shortened to the first 4,000 characters here. Investigation JSON keeps allowed field values in full.',
        PreviewUnavailable: 'Site records could not be read from this copy. That is not a count of zero.',
        NoSites: 'This copy contains an empty site-record array.', MissingTitle: '[Title field missing]', MissingUrl: '[URL field missing]',
        Previous: 'Previous sites', Next: 'Next sites', Range: 'Site records $1–$2 of $3',
        Download: 'Download investigation JSON', ExportUnavailable: 'Investigation export is unavailable for this record.',
        DownloadRequested: 'Private investigation JSON download requested. Check your downloads. This file cannot be imported directly as a recovery backup.',
        DownloadFailed: 'Could not prepare the investigation download. No saved data was changed. Refresh the inspection before trying again.',
        PreviewFailed: 'Could not preview this inspected record. Refresh the inspection before trying again.',
        ErrorRead: 'Local records could not be read. Keep the original page open and try Refresh inspection. This does not prove that data was deleted.',
        ErrorChanged: 'Local records changed during inspection. No result from that read is shown. Refresh to inspect a new snapshot.',
        ErrorSize: 'The inspection safety limit was reached. No result from that read is shown. Keep your original page open; no saved data was changed.',
        ErrorInvalid: 'The inspection could not validate the local records. Keep your original page open; no saved data was changed.',
        ErrorUnavailable: 'Read-only inspection is unavailable. Keep your original page open; no saved data was changed.',
        DiagnosticCode: 'Inspection code',
        WarningInvalid: 'Some source data could not be validated.',
        WarningUnknown: 'Unrecognized fields are omitted from the investigation view and file.',
        WarningInvalidFields: 'Invalid fields are omitted. Some site records may be incomplete.',
        WarningPrivate: 'Private or unsupported fields are omitted. This is not a complete backup.',
        WarningSize: 'A safety limit prevents inspection or export of some data.',
        WarningChain: 'Deeper nested recovery copies are outside this inspection’s safety limit.',
        WarningRegistry: 'The workspace registry could not be validated. Workspace attribution may be uncertain.',
        WarningBundle: 'An expected workspace bundle was not found in this read. This does not prove deletion.',
        WarningUnverified: 'The source has not been verified. Recovery is not guaranteed.',
        WarningChecksumMissing: 'No usable checksum was available for verification.',
        WarningChecksumFailed: 'The recorded checksum did not match. The copy has not passed integrity checks.',
        WarningTime: 'No trustworthy record time is available.',
        WarningContentDiffers: 'Retained representations contain different content. Inspect each separately.',
        WarningCredentialUrl: 'URLs containing recognized credentials are omitted from the investigation view and file.',
        WarningVersion: 'The stored configuration version is not recognized. Recovery compatibility is unknown.',
        WarningFormat: 'The stored record format is not recognized. Only allowed fields are shown for investigation.',
        WarningGeneric: 'Some data could not be fully inspected or was omitted. This is not a complete recovery backup.'
    };
    const sources = Object.freeze({ preMigration: 'SourcePreMigration', legacy: 'SourceLegacy', workspace: 'SourceWorkspace', historicalWorkspace: 'SourceHistoricalWorkspace',
        beforeCloudReplacement: 'SourceBeforeCloudReplacement', beforeCloudClear: 'SourceBeforeCloudClear',
        identityRecovery: 'SourceIdentityRecovery', recovery: 'SourceRecovery' });
    const warnings = Object.freeze({ INVALID_SOURCE: 'WarningInvalid', UNKNOWN_FIELDS_OMITTED: 'WarningUnknown',
        INVALID_FIELDS_OMITTED: 'WarningInvalidFields', PRIVATE_FIELDS_OMITTED: 'WarningPrivate', SIZE_LIMIT: 'WarningSize',
        CHAIN_LIMIT: 'WarningChain', REGISTRY_INVALID: 'WarningRegistry', HISTORICAL_INVALID: 'WarningHistorical', BUNDLE_MISSING: 'WarningBundle',
        UNVERIFIED_SOURCE: 'WarningUnverified', CHECKSUM_MISSING: 'WarningChecksumMissing', CHECKSUM_FAILED: 'WarningChecksumFailed',
        RECORD_TIME_UNKNOWN: 'WarningTime', CONTENT_DIFFERS: 'WarningContentDiffers', CREDENTIAL_URL_OMITTED: 'WarningCredentialUrl', UNKNOWN_VERSION: 'WarningVersion', UNKNOWN_FORMAT: 'WarningFormat' });
    const errors = Object.freeze({ READ_FAILED: 'ErrorRead', CHANGED: 'ErrorChanged', SIZE_LIMIT: 'ErrorSize', INVALID: 'ErrorInvalid' });
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const t = (key, values = []) => {
        const value = root.i18n?.t('recovery' + key, values);
        return value && value !== 'recovery' + key ? value : (copy[key] || key).replace(/\$(\d+)/g, (_, n) => values[Number(n) - 1] ?? '');
    };
    const filename = 'local-itab-readonly-investigation.json';
    const recoveryFilename = 'local-itab-reviewed-configuration.json';
    const pageSize = 100;
    const previewTextLimit = 4000;
    function defaultDownload(json, targetFilename = filename) {
        let url, link;
        try {
            const blob = new root.Blob([json], { type: 'application/json;charset=utf-8' });
            url = root.URL.createObjectURL(blob);
            link = root.document.createElement('a');
            link.href = url; link.download = targetFilename; link.hidden = true;
            root.document.body.append(link); link.click();
        } finally {
            link?.remove();
            if (url) root.URL.revokeObjectURL(url);
        }
    }
    // This is a view context only, never an authorization or a restore target.
    // Reject duplicate parameters even when their values agree.
    function workspaceContext(search) {
        if (typeof search !== 'string' || !search) return { kind: 'all' };
        if (search.length > 8192) return { kind: 'invalid' };
        const values = [];
        try {
            for (const part of search.replace(/^\?/, '').split('&')) {
                const separator = part.indexOf('=');
                const key = separator < 0 ? part : part.slice(0, separator);
                const value = separator < 0 ? '' : part.slice(separator + 1);
                const decode = text => decodeURIComponent(text.replace(/\+/g, ' '));
                if (decode(key) === 'workspace') values.push(decode(value));
            }
        } catch (_) { return { kind: 'invalid' }; }
        if (!values.length) return { kind: 'all' };
        if (values.length !== 1 || !/^[a-zA-Z0-9_-]{1,100}$/.test(values[0])) return { kind: 'invalid' };
        return { kind: 'workspace', id: values[0] };
    }
    function mount({ host, inspector, download = defaultDownload } = {}) {
        const doc = host.ownerDocument;
        const context = workspaceContext(root.location?.search);
        let showAll = context.kind === 'all';
        let revision = 0, report = null, closed = false, suspended = false, cooldown = false, timer = null;
        let reviewSerial = 0, activeReview = null;
        const create = (tag, className, text, parent) => {
            const element = doc.createElement(tag);
            if (className) element.className = className;
            if (text !== undefined) element.textContent = text;
            parent?.append(element); return element;
        };
        const button = (key, action, parent, className = '') => {
            const element = create('button', 'recovery-button ' + className, t(key), parent); element.type = 'button';
            element.addEventListener('keydown', event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); });
            element.addEventListener('click', () => { if (!element.disabled && !closed && !suspended && doc.visibilityState !== 'hidden') action(); });
            return element;
        };
        host.replaceChildren();
        const toolbar = create('div', 'recovery-toolbar', undefined, host);
        create('h2', '', t('Results'), toolbar);
        const refreshButton = button('Refresh', () => { void refresh(); }, toolbar, 'recovery-primary');
        const status = create('p', 'recovery-status', '', host); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); status.tabIndex = -1;
        const inspectedAt = create('p', 'recovery-inspected-at', '', host);
        const globalWarnings = create('div', '', undefined, host);
        const contextPanel = create('section', 'recovery-context recovery-notice', undefined, host);
        const contextText = create('p', 'recovery-help', '', contextPanel);
        contextText.setAttribute('role', 'status'); contextText.setAttribute('aria-live', 'polite');
        const expandedText = create('p', 'recovery-help', '', contextPanel);
        const contextToggle = button('ContextShowAll', () => {
            if (!report) return;
            retireReview(); showAll = !showAll; revision++;
            renderContext(report, revision); announce('Ready');
        }, contextPanel);
        contextToggle.hidden = context.kind === 'all'; contextToggle.disabled = true;
        const importSection = create('section', 'recovery-imports', undefined, host);
        const entries = create('ol', 'recovery-entries', undefined, host);
        function renderContext(snapshot, generation) {
            const matching = context.kind === 'workspace' ? snapshot.entries.filter(entry =>
                entry.source?.workspaceId === context.id && ['verified', 'historical'].includes(entry.source?.identityStatus)) : [];
            const hasMatch = matching.length > 0;
            const historicalCount = matching.filter(entry => entry.source.identityStatus === 'historical').length;
            contextText.textContent = context.kind === 'all' ? t('ContextAll') : context.kind === 'invalid' ? t('ContextInvalid') :
                historicalCount ? t(showAll ? 'ContextHistoricalMatchedAll' : 'ContextHistoricalMatched', [context.id, String(matching.length - historicalCount), String(historicalCount), String(snapshot.entries.length - matching.length)]) :
                hasMatch ? t(showAll ? 'ContextMatchedAll' : 'ContextMatched', [context.id, String(matching.length), String(snapshot.entries.length - matching.length)]) :
                    t('ContextMissing', [context.id, String(snapshot.entries.length)]);
            // Keep the request warning visible even after opting into the global inventory.
            expandedText.textContent = showAll && context.kind !== 'all' ? t('ContextExpanded', [String(snapshot.entries.length)]) : '';
            contextToggle.textContent = t(context.kind === 'all' ? 'ContextShowAll' : showAll ? (hasMatch ? 'ContextShowRequested' : 'ContextHideAll') : 'ContextShowAll');
            contextToggle.disabled = false;
            renderImports(snapshot);
            entries.replaceChildren();
            const visible = showAll ? snapshot.entries : matching;
            if (!visible.length) create('li', 'recovery-empty', t(showAll ? 'Empty' : 'ContextNoRows'), entries);
            else visible.forEach(entry => renderEntry(entry, snapshot, generation, snapshot.entries.indexOf(entry)));
        }
        function renderImports(snapshot) {
            importSection.replaceChildren();
            const heading = create('h2', '', t('ImportTitle'), importSection); heading.id = 'recovery-import-title';
            importSection.setAttribute('aria-labelledby', heading.id);
            create('p', 'recovery-help', t('ImportIntro'), importSection);
            create('p', 'recovery-help', t('ImportFilter'), importSection);
            const summaries = Array.isArray(snapshot.imports) ? snapshot.imports : [];
            const visible = summaries.filter(row => row?.source?.kind === 'workspace' && !row.source.historical &&
                (showAll || (context.kind === 'workspace' && row.source.identityStatus === 'verified' && row.source.workspaceId === context.id)));
            if (!visible.length) { create('p', 'recovery-empty', t('ImportEmpty'), importSection); return; }
            const list = create('ol', 'recovery-entries', undefined, importSection);
            const statuses = { pending: 'ImportPending', verified: 'ImportVerified', missing: 'ImportMissing', invalid: 'ImportInvalid', unsupported: 'ImportUnsupported', unavailable: 'ImportUnavailable' };
            const comparisons = { match: 'ImportMatch', mismatch: 'ImportMismatch', missing: 'ImportAbsent', unavailable: 'ImportUnknown' };
            const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
            for (const summary of visible) {
                const source = summary.source, row = create('li', 'recovery-import-entry', undefined, list);
                create('h3', 'recovery-entry-title', t('ImportWorkspace'), row);
                const facts = create('dl', 'recovery-facts', undefined, row);
                const fact = (parent, key, value) => { const pair = create('div', '', undefined, parent); create('dt', '', t(key), pair); create('dd', '', value, pair); };
                for (const [label, key, max] of [['Workspace', 'workspaceName', 160], ['WorkspaceId', 'workspaceId', 100], ['WorkspaceGeneration', 'workspaceGeneration', 100]]) {
                    if (typeof source[key] === 'string' && source[key].length <= max) fact(facts, label, source[key]);
                }
                fact(facts, 'Attribution', t(source.identityStatus === 'verified' ? 'AttributionVerified' : 'AttributionUnverified'));
                fact(facts, 'ImportMembership', t(source.deleted ? 'ImportTrash' : 'ImportLive'));
                const statusKey = typeof summary.status === 'string' && own(statuses, summary.status) ? statuses[summary.status] : 'ImportUnavailable';
                fact(facts, 'ImportStatus', t(statusKey));
                create('p', 'recovery-help', t('ImportRecordedHelp'), row);
                if (!['pending', 'verified'].includes(summary.status) || summary.version !== 1 || !digest(summary.request) ||
                    !digest(summary.target?.expected) || !digest(summary.recovery?.expected)) continue;
                fact(facts, 'ImportVersion', '1');
                const states = ['target', 'recovery'].map(key => {
                    const value = summary[key];
                    const state = typeof value.comparison === 'string' && own(comparisons, value.comparison) &&
                        (!['match', 'mismatch'].includes(value.comparison) || (digest(value.current) &&
                            (value.comparison === 'match') === (value.current === value.expected))) ? value.comparison : 'unavailable';
                    fact(facts, key === 'target' ? 'ImportTarget' : 'ImportRecovery', t(comparisons[state]));
                    return state;
                });
                create('p', 'recovery-help', t(states.includes('mismatch') ? 'ImportMismatchHelp' : states.every(state => state === 'match') ? 'ImportMatchedHelp' : 'ImportIncompleteHelp'), row);
                create('p', 'recovery-help', t('ImportFileUnchecked'), row);
                const disclosure = create('details', 'recovery-import-digests', undefined, row);
                create('summary', '', t('ImportDigests'), disclosure);
                const hashes = create('dl', 'recovery-facts', undefined, disclosure);
                fact(hashes, 'ImportRequestDigest', summary.request);
                for (const [label, value] of [['ImportExpectedTarget', summary.target.expected], ['ImportCurrentTarget', summary.target.current],
                    ['ImportExpectedRecovery', summary.recovery.expected], ['ImportCurrentRecovery', summary.recovery.current]]) fact(hashes, label, digest(value) ? value : t('ImportUnknown'));
            }
        }
        function announce(key, failed = false) { status.textContent = t(key); status.dataset.tone = failed ? 'error' : 'normal'; }
        function time(value) {
            if (typeof value !== 'string' || !value || value.length > 80) return t('Unknown');
            const date = new Date(value);
            if (!Number.isFinite(date.getTime())) return t('Unknown');
            return date.toLocaleString(doc.documentElement?.lang === 'zh-CN' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'medium' });
        }
        function renderWarnings(codes, parent) {
            if (!Array.isArray(codes) || !codes.length) return;
            const list = create('ul', 'recovery-warnings', undefined, parent), shown = new Set();
            for (const code of codes) {
                const key = typeof code === 'string' && own(warnings, code) ? warnings[code] : 'WarningGeneric';
                if (!shown.has(key)) { shown.add(key); create('li', '', t(key), list); }
            }
        }
        function valid(snapshot, generation) { return !closed && !suspended && doc.visibilityState !== 'hidden' && report === snapshot && revision === generation; }
        function retireReview(repairFocus = true) {
            reviewSerial++;
            const previous = activeReview; activeReview = null;
            try { inspector?.retireRecovery?.(); } catch (_) { /* Retire locally even if the provider is unavailable. */ }
            if (!previous) return;
            const containedFocus = previous.panel.contains(doc.activeElement);
            if (previous.download) { previous.download.dataset.exportable = 'false'; previous.download.disabled = true; }
            previous.panel.hidden = true; previous.panel.replaceChildren();
            previous.trigger.disabled = false; previous.trigger.textContent = t('ReviewCopy'); previous.trigger.setAttribute('aria-expanded', 'false');
            if (repairFocus && containedFocus && doc.activeElement === doc.body) status.focus();
        }
        function updateDownloads() {
            entries.querySelectorAll('[data-recovery-download]').forEach(element => {
                element.disabled = cooldown || !report || element.dataset.exportable !== 'true';
            });
        }
        function startCooldown(trigger) {
            const focused = doc.activeElement === trigger;
            cooldown = true; updateDownloads();
            if (focused) status.focus();
            timer = root.setTimeout(() => {
                timer = null; cooldown = false;
                if (!closed && !suspended) {
                    updateDownloads();
                    if (focused && doc.activeElement === status && trigger.isConnected && !trigger.disabled) trigger.focus();
                }
            }, 1200);
        }
        function checkedPreview(snapshot, id) {
            const preview = inspector.preview(snapshot, id);
            if (!preview || (preview.links !== null && !Array.isArray(preview.links))) throw { code: 'INVALID' };
            return preview;
        }
        function renderEntry(entry, snapshot, generation, index) {
            const source = entry.source || {};
            const row = create('li', 'recovery-entry', undefined, entries);
            const titleKey = typeof source.kind === 'string' && own(sources, source.kind) ? sources[source.kind] : 'SourceUnknown';
            create('h3', 'recovery-entry-title', t(titleKey), row);
            const integrity = ['verified', 'unverified', 'failed'].includes(entry.integrity) ? entry.integrity : 'unverified';
            const badge = create('span', 'recovery-badge', t({ verified: 'Checked', unverified: 'Unverified', failed: 'Failed' }[integrity]), row);
            badge.dataset.integrity = integrity;
            const facts = create('dl', 'recovery-facts', undefined, row);
            const fact = (key, value) => { const pair = create('div', '', undefined, facts); create('dt', '', t(key), pair); create('dd', '', value, pair); };
            fact(entry.timeKind === 'migration' ? 'MigrationTime' : entry.timeKind === 'backup' ? 'BackupTime' : entry.timeKind === 'snapshot' ? 'SnapshotTime' : 'RecordedAt', time(entry.recordedAt));
            fact('SiteCount', Number.isSafeInteger(entry.siteCount) && entry.siteCount >= 0 ? String(entry.siteCount) : t('UnknownCount'));
            if (typeof source.workspaceName === 'string') fact('Workspace', source.workspaceName);
            if (typeof source.workspaceId === 'string') {
                fact('WorkspaceId', source.workspaceId);
                fact('Attribution', t(source.identityStatus === 'historical' ? 'AttributionHistorical' : source.identityStatus === 'verified' ? 'AttributionVerified' : 'AttributionUnverified'));
            }
            if (source.historical === true) {
                create('p', 'recovery-help', t('HistoricalOrigin') + '. ' + t('HistoricalHelp'), row);
                fact('WorkspaceGeneration', source.workspaceGeneration);
                if (entry.timeKind !== 'snapshot') fact('SnapshotTime', time(source.snapshotAt));
                fact('CurrentRelation', t({ sameGeneration: 'RelationSame', differentGeneration: 'RelationDifferent', absent: 'RelationAbsent' }[source.currentRelation] || 'RelationUnknown'));
            }
            if (source.deleted === true) create('p', 'recovery-help', t('Trash'), row);
            const representation = { configuration: 'Configuration', raw: 'Raw', portable: 'Portable' };
            if (own(representation, source.representation)) fact('Representation', t(representation[source.representation]));
            if (Number.isSafeInteger(source.depth) && source.depth > 0) fact('Depth', String(source.depth));
            create('p', 'recovery-help', t('ValidationHelp'), row);
            renderWarnings(entry.warnings, row);
            const actions = create('div', 'recovery-actions', undefined, row);
            const previewButton = button('Preview', togglePreview, actions);
            const downloadButton = button('Download', exportEntry, actions);
            downloadButton.dataset.recoveryDownload = 'true'; downloadButton.dataset.exportable = String(entry.exportable === true);
            downloadButton.setAttribute('aria-describedby', 'recovery-download-help');
            downloadButton.disabled = entry.exportable !== true || cooldown;
            if (entry.exportable !== true) create('p', 'recovery-help', t('ExportUnavailable'), row);
            const reviewButton = button('ReviewCopy', () => { void reviewCopy(); }, actions);
            const canReview = entry.integrity === 'verified' && ['raw', 'portable'].includes(source.representation) &&
                typeof inspector?.reviewRecovery === 'function' && typeof inspector?.exportRecovery === 'function';
            reviewButton.disabled = !canReview;
            const reviewHost = create('section', 'recovery-preview recovery-file-review', undefined, row);
            reviewHost.hidden = true; reviewHost.id = 'recovery-file-review-' + generation + '-' + index;
            reviewButton.setAttribute('aria-expanded', 'false'); reviewButton.setAttribute('aria-controls', reviewHost.id);
            if (!canReview) create('p', 'recovery-help', t('ReviewUnavailable'), row);
            async function reviewCopy() {
                if (!valid(snapshot, generation) || !canReview || cooldown) return;
                retireReview();
                const request = reviewSerial, wasFocused = doc.activeElement === reviewButton;
                const state = { panel: reviewHost, trigger: reviewButton, review: null, rendered: false, download: null };
                activeReview = state; reviewButton.disabled = true; reviewButton.textContent = t('ReviewingCopy'); announce('ReviewingCopy');
                if (wasFocused && doc.activeElement === doc.body) status.focus();
                const current = () => valid(snapshot, generation) && activeReview === state && request === reviewSerial;
                try {
                    const review = await inspector.reviewRecovery(snapshot, entry.id);
                    if (!current()) { try { inspector.retireRecovery?.(review); } catch (_) {} return; }
                    if (!review || review.scope !== 'configuration-only' || !Array.isArray(review.links) ||
                        !['siteCount', 'categoryCount', 'duplicateCount', 'positionCount'].every(key => Number.isSafeInteger(review[key]) && review[key] >= 0) ||
                        review.siteCount !== review.links.length || review.links.some(link => !link || typeof link.title !== 'string' || typeof link.url !== 'string')) throw { code: 'INVALID' };
                    state.review = review;
                    reviewHost.replaceChildren();
                    const heading = create('h3', '', t('ReviewTitle'), reviewHost); heading.tabIndex = -1;
                    const details = create('dl', 'recovery-facts', undefined, reviewHost);
                    const detail = (key, value) => { const pair = create('div', '', undefined, details); create('dt', '', t(key), pair); create('dd', '', value, pair); };
                    detail('ReviewSource', t(titleKey));
                    if (typeof source.workspaceName === 'string') detail('Workspace', source.workspaceName);
                    if (typeof source.workspaceId === 'string') detail('WorkspaceId', source.workspaceId);
                    detail('Attribution', t(source.identityStatus === 'historical' ? 'AttributionHistorical' : source.identityStatus === 'verified' ? 'AttributionVerified' : 'AttributionUnverified'));
                    detail('Representation', t(source.representation === 'raw' ? 'Raw' : 'Portable'));
                    detail('Depth', String(Number.isSafeInteger(source.depth) && source.depth >= 0 ? source.depth : 0));
                    if (source.historical === true) {
                        detail('HistoricalOrigin', t('HistoricalHelp'));
                        detail('WorkspaceGeneration', source.workspaceGeneration);
                        detail('SnapshotTime', time(source.snapshotAt));
                    }
                    detail('ReviewSourceTime', review.timeVerified === true ? time(review.recordedAt) : t('ReviewRawTime'));
                    detail('ReviewGeneratedAt', time(review.generatedAt));
                    for (const [label, key] of [['SiteCount', 'siteCount'], ['CategoryCount', 'categoryCount'], ['DuplicateCount', 'duplicateCount'], ['PositionCount', 'positionCount']]) detail(label, String(review[key]));
                    for (const key of ['ReviewScope', 'ReviewExclusions', 'ReviewLatest', 'ReviewPrivacy']) create('p', 'recovery-help', t(key), reviewHost);
                    if (!review.links.length) create('p', 'recovery-help', t('NoSites'), reviewHost);
                    else renderSites(review.links, reviewHost, 'ReviewTruncated');
                    const reviewActions = create('div', 'recovery-actions', undefined, reviewHost);
                    const fileButton = button('DownloadRecovery', () => exportRecovery(state), reviewActions, 'recovery-primary');
                    fileButton.disabled = true; fileButton.dataset.recoveryDownload = 'true'; fileButton.dataset.exportable = 'false';
                    state.download = fileButton;
                    button('CloseReview', () => { if (!current() || !state.rendered || reviewHost.hidden) return; const focused = reviewHost.contains(doc.activeElement); retireReview(); if (focused && doc.activeElement === status) reviewButton.focus(); announce('Ready'); }, reviewActions);
                    if (!current()) return;
                    reviewHost.hidden = false; state.rendered = true;
                    reviewButton.textContent = t('ReviewCopy'); reviewButton.disabled = false; reviewButton.setAttribute('aria-expanded', 'true');
                    fileButton.dataset.exportable = 'true'; updateDownloads(); announce('ReviewReady');
                    if (wasFocused && doc.activeElement === status) heading.focus({ preventScroll: true });
                } catch (error) {
                    if (!current()) return;
                    retireReview();
                    const reason = { RECOVERY_INTEGRITY: 'ReviewIntegrity', RECOVERY_UNVERIFIED: 'ReviewIntegrity', RECOVERY_FIELDS: 'ReviewFields', RECOVERY_FORMAT: 'ReviewFields', RECOVERY_REWRITE: 'ReviewFields', RECOVERY_CREDENTIAL: 'ReviewCredentials', SIZE_LIMIT: 'ReviewSize' };
                    announce(typeof error?.code === 'string' && own(reason, error.code) ? reason[error.code] : 'ReviewFailed', true);
                    if (wasFocused && doc.activeElement === status) reviewButton.focus();
                }
            }
            function exportRecovery(state) {
                if (!valid(snapshot, generation) || cooldown || activeReview !== state || !state.rendered || reviewHost.hidden || !state.review) return;
                startCooldown(state.download);
                try {
                    const json = inspector.exportRecovery(snapshot, entry.id, state.review);
                    if (!valid(snapshot, generation) || activeReview !== state || !state.rendered || reviewHost.hidden) return;
                    if (typeof json !== 'string' || !json.length) throw { code: 'INVALID' };
                    download(json, recoveryFilename);
                    if (valid(snapshot, generation)) announce('RecoveryDownloadRequested');
                } catch (_) {
                    if (valid(snapshot, generation)) { retireReview(); announce('RecoveryDownloadFailed', true); }
                }
            }
            const previewHost = create('section', 'recovery-preview', undefined, row); previewHost.hidden = true; previewHost.id = 'recovery-preview-' + generation + '-' + index;
            previewButton.setAttribute('aria-expanded', 'false'); previewButton.setAttribute('aria-controls', previewHost.id);
            function togglePreview() {
                if (!valid(snapshot, generation)) return;
                retireReview();
                if (!previewHost.hidden) {
                    previewHost.hidden = true; previewHost.replaceChildren(); previewButton.textContent = t('Preview'); previewButton.setAttribute('aria-expanded', 'false'); return;
                }
                try {
                    const preview = checkedPreview(snapshot, entry.id);
                    if (!valid(snapshot, generation)) return;
                    previewHost.replaceChildren();
                    create('h3', '', t('PreviewTitle'), previewHost);
                    create('p', 'recovery-help', t('PreviewHelp'), previewHost);
                    renderWarnings(preview.omissions, previewHost);
                    if (preview.links === null) create('p', 'recovery-help', t('PreviewUnavailable'), previewHost);
                    else if (!preview.links.length) create('p', 'recovery-help', t('NoSites'), previewHost);
                    else renderSites(preview.links);
                    previewHost.hidden = false; previewButton.textContent = t('HidePreview'); previewButton.setAttribute('aria-expanded', 'true');
                } catch (_) { announce('PreviewFailed', true); }
            }
            function renderSites(links, target = previewHost, truncatedKey = 'PreviewTruncated') {
                let offset = 0;
                const list = create('ol', 'recovery-site-list', undefined, target);
                let previous, next, range;
                if (links.length > pageSize) {
                    const pagination = create('div', 'recovery-pagination', undefined, target);
                    previous = button('Previous', () => changePage(-pageSize, previous), pagination);
                    range = create('p', '', '', pagination); range.setAttribute('aria-live', 'polite'); range.setAttribute('aria-atomic', 'true');
                    next = button('Next', () => changePage(pageSize, next), pagination);
                }
                function paint() {
                    list.replaceChildren(); list.setAttribute('start', String(offset + 1));
                    for (const link of links.slice(offset, offset + pageSize)) {
                        const item = create('li', '', undefined, list);
                        let truncated = false;
                        function field(value, missing, className) {
                            let visible = typeof value === 'string' ? value : t(missing);
                            if (visible.length > previewTextLimit) {
                                visible = visible.slice(0, previewTextLimit);
                                // Do not cut a surrogate pair at the display boundary.
                                if (/[\uD800-\uDBFF]$/.test(visible)) visible = visible.slice(0, -1);
                                truncated = true;
                            }
                            create('span', className, visible, item);
                        }
                        field(link?.title, 'MissingTitle', 'recovery-site-title');
                        field(link?.url, 'MissingUrl', 'recovery-site-url');
                        if (truncated) create('p', 'recovery-help', t(truncatedKey), item);
                    }
                    if (range) {
                        range.textContent = t('Range', [String(offset + 1), String(Math.min(offset + pageSize, links.length)), String(links.length)]);
                        previous.disabled = offset === 0; next.disabled = offset + pageSize >= links.length;
                    }
                }
                function changePage(delta, trigger) {
                    if (!valid(snapshot, generation) || target.hidden) return;
                    offset = Math.max(0, Math.min(Math.floor((links.length - 1) / pageSize) * pageSize, offset + delta));
                    const focused = doc.activeElement === trigger;
                    paint();
                    if (focused && trigger.disabled) (trigger === next ? previous : next).focus();
                }
                paint();
            }
            function exportEntry() {
                if (!valid(snapshot, generation) || cooldown || entry.exportable !== true) return;
                retireReview();
                startCooldown(downloadButton);
                try {
                    // Always preview the exact inspected snapshot before export;
                    // no reread, writer bootstrap, URL visit or content normalization.
                    checkedPreview(snapshot, entry.id);
                    if (!valid(snapshot, generation)) return;
                    const json = inspector.exportEntry(snapshot, entry.id);
                    if (typeof json !== 'string' || !json.length) throw { code: 'INVALID' };
                    download(json);
                    if (valid(snapshot, generation)) announce('DownloadRequested');
                } catch (_) { if (valid(snapshot, generation)) announce('DownloadFailed', true); }
            }
        }
        async function refresh() {
            if (closed || suspended) return;
            retireReview();
            const generation = ++revision;
            const returnFocus = doc.activeElement === refreshButton || doc.activeElement === status;
            report = null; importSection.replaceChildren(); entries.replaceChildren(); globalWarnings.replaceChildren(); inspectedAt.textContent = '';
            contextToggle.disabled = true; contextText.textContent = ''; expandedText.textContent = '';
            refreshButton.disabled = true; host.setAttribute('aria-busy', 'true'); announce('Loading');
            if (returnFocus) status.focus();
            try {
                if (!inspector || typeof inspector.inspect !== 'function') throw { code: 'UNAVAILABLE' };
                const next = await inspector.inspect();
                if (closed || suspended || generation !== revision) return;
                if (!next || !Array.isArray(next.entries)) throw { code: 'INVALID' };
                report = next;
                inspectedAt.textContent = `${t('InspectedAt')}: ${time(next.inspectedAt)}`;
                renderWarnings(next.warnings, globalWarnings);
                renderContext(next, generation);
                announce(next.entries.length || next.imports?.length ? 'Ready' : 'Empty');
            } catch (error) {
                if (closed || suspended || generation !== revision) return;
                report = null; importSection.replaceChildren(); entries.replaceChildren(); globalWarnings.replaceChildren(); inspectedAt.textContent = '';
                contextToggle.disabled = true; contextText.textContent = ''; expandedText.textContent = '';
                const code = typeof error?.code === 'string' && own(errors, error.code) ? error.code : null;
                announce(code ? errors[code] : 'ErrorUnavailable', true);
                if (code) create('p', 'recovery-help', `${t('DiagnosticCode')}: ${code}`, globalWarnings);
            } finally {
                if (!closed && !suspended && generation === revision) {
                    refreshButton.disabled = false; host.setAttribute('aria-busy', 'false');
                    if (returnFocus && doc.activeElement === status) refreshButton.focus();
                }
            }
        }
        function suspend() {
            retireReview(false);
            suspended = true; revision++; report = null; importSection.replaceChildren(); entries.replaceChildren(); globalWarnings.replaceChildren(); inspectedAt.textContent = '';
            contextToggle.disabled = true; contextText.textContent = ''; expandedText.textContent = '';
            if (timer !== null) root.clearTimeout(timer); timer = null; cooldown = false;
        }
        function resume() { if (closed) return; suspended = false; return refresh(); }
        function destroy() { closed = true; suspend(); refreshButton.disabled = true; doc.removeEventListener?.('visibilitychange', visibilityChanged); }
        function visibilityChanged() { if (closed) return; if (doc.visibilityState === 'hidden') suspend(); else if (suspended) void resume(); }
        doc.addEventListener?.('visibilitychange', visibilityChanged);
        return { ready: refresh(), refresh, suspend, resume, destroy };
    }
    root.LocalItabRecoveryView = Object.freeze({ mount });
    const host = root.document?.getElementById('recovery-inspection');
    if (host) {
        root.i18n?.localizeDocument(root.document);
        let inspector;
        try { inspector = root.LocalItabRecovery.createInspector({ local: root.chrome?.storage?.local, crypto: root.crypto }); } catch (_) { /* A fixed unavailable state is shown; never expose the thrown message. */ }
        const view = mount({ host, inspector });
        root.addEventListener('pagehide', event => { if (event.persisted) view.suspend(); else view.destroy(); });
        root.addEventListener('pageshow', event => { if (event.persisted) void view.resume(); });
    }
})(window);
