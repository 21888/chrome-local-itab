/* Standalone read-only inspection UI. Never boots a storage writer or provider. */
(function (root) {
    'use strict';
    const copy = {
        Results: 'Saved local copies', Refresh: 'Refresh inspection', Loading: 'Reading supported local records…',
        Ready: 'Inspection finished. Select a copy to preview its site records or download investigation JSON.',
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
    const sources = Object.freeze({ preMigration: 'SourcePreMigration', legacy: 'SourceLegacy', workspace: 'SourceWorkspace',
        beforeCloudReplacement: 'SourceBeforeCloudReplacement', beforeCloudClear: 'SourceBeforeCloudClear',
        identityRecovery: 'SourceIdentityRecovery', recovery: 'SourceRecovery' });
    const warnings = Object.freeze({ INVALID_SOURCE: 'WarningInvalid', UNKNOWN_FIELDS_OMITTED: 'WarningUnknown',
        INVALID_FIELDS_OMITTED: 'WarningInvalidFields', PRIVATE_FIELDS_OMITTED: 'WarningPrivate', SIZE_LIMIT: 'WarningSize',
        CHAIN_LIMIT: 'WarningChain', REGISTRY_INVALID: 'WarningRegistry', BUNDLE_MISSING: 'WarningBundle',
        UNVERIFIED_SOURCE: 'WarningUnverified', CHECKSUM_MISSING: 'WarningChecksumMissing', CHECKSUM_FAILED: 'WarningChecksumFailed',
        RECORD_TIME_UNKNOWN: 'WarningTime', CONTENT_DIFFERS: 'WarningContentDiffers', CREDENTIAL_URL_OMITTED: 'WarningCredentialUrl', UNKNOWN_VERSION: 'WarningVersion', UNKNOWN_FORMAT: 'WarningFormat' });
    const errors = Object.freeze({ READ_FAILED: 'ErrorRead', CHANGED: 'ErrorChanged', SIZE_LIMIT: 'ErrorSize', INVALID: 'ErrorInvalid' });
    const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
    const t = (key, values = []) => {
        const value = root.i18n?.t('recovery' + key, values);
        return value && value !== 'recovery' + key ? value : (copy[key] || key).replace(/\$(\d+)/g, (_, n) => values[Number(n) - 1] ?? '');
    };
    const filename = 'local-itab-readonly-investigation.json';
    const pageSize = 100;
    const previewTextLimit = 4000;
    function defaultDownload(json) {
        let url, link;
        try {
            const blob = new root.Blob([json], { type: 'application/json;charset=utf-8' });
            url = root.URL.createObjectURL(blob);
            link = root.document.createElement('a');
            link.href = url; link.download = filename; link.hidden = true;
            root.document.body.append(link); link.click();
        } finally {
            link?.remove();
            if (url) root.URL.revokeObjectURL(url);
        }
    }
    function mount({ host, inspector, download = defaultDownload } = {}) {
        const doc = host.ownerDocument;
        let revision = 0, report = null, closed = false, suspended = false, cooldown = false, timer = null;
        const create = (tag, className, text, parent) => {
            const element = doc.createElement(tag);
            if (className) element.className = className;
            if (text !== undefined) element.textContent = text;
            parent?.append(element); return element;
        };
        const button = (key, action, parent, className = '') => {
            const element = create('button', 'recovery-button ' + className, t(key), parent); element.type = 'button';
            element.addEventListener('keydown', event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); });
            element.addEventListener('click', () => { if (!element.disabled && !closed && !suspended) action(); });
            return element;
        };
        host.replaceChildren();
        const toolbar = create('div', 'recovery-toolbar', undefined, host);
        create('h2', '', t('Results'), toolbar);
        const refreshButton = button('Refresh', () => { void refresh(); }, toolbar, 'recovery-primary');
        const status = create('p', 'recovery-status', '', host); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); status.tabIndex = -1;
        const inspectedAt = create('p', 'recovery-inspected-at', '', host);
        const globalWarnings = create('div', '', undefined, host);
        const entries = create('ol', 'recovery-entries', undefined, host);
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
        function valid(snapshot, generation) { return !closed && !suspended && report === snapshot && revision === generation; }
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
            fact(entry.timeKind === 'migration' ? 'MigrationTime' : entry.timeKind === 'backup' ? 'BackupTime' : 'RecordedAt', time(entry.recordedAt));
            fact('SiteCount', Number.isSafeInteger(entry.siteCount) && entry.siteCount >= 0 ? String(entry.siteCount) : t('UnknownCount'));
            if (typeof source.workspaceName === 'string') fact('Workspace', source.workspaceName);
            if (typeof source.workspaceId === 'string') {
                fact('WorkspaceId', source.workspaceId);
                fact('Attribution', t(source.identityStatus === 'verified' ? 'AttributionVerified' : 'AttributionUnverified'));
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
            const previewHost = create('section', 'recovery-preview', undefined, row); previewHost.hidden = true; previewHost.id = 'recovery-preview-' + generation + '-' + index;
            previewButton.setAttribute('aria-expanded', 'false'); previewButton.setAttribute('aria-controls', previewHost.id);
            function togglePreview() {
                if (!valid(snapshot, generation)) return;
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
            function renderSites(links) {
                let offset = 0;
                const list = create('ol', 'recovery-site-list', undefined, previewHost);
                let previous, next, range;
                if (links.length > pageSize) {
                    const pagination = create('div', 'recovery-pagination', undefined, previewHost);
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
                        if (truncated) create('p', 'recovery-help', t('PreviewTruncated'), item);
                    }
                    if (range) {
                        range.textContent = t('Range', [String(offset + 1), String(Math.min(offset + pageSize, links.length)), String(links.length)]);
                        previous.disabled = offset === 0; next.disabled = offset + pageSize >= links.length;
                    }
                }
                function changePage(delta, trigger) {
                    if (!valid(snapshot, generation) || previewHost.hidden) return;
                    offset = Math.max(0, Math.min(Math.floor((links.length - 1) / pageSize) * pageSize, offset + delta));
                    const focused = doc.activeElement === trigger;
                    paint();
                    if (focused && trigger.disabled) (trigger === next ? previous : next).focus();
                }
                paint();
            }
            function exportEntry() {
                if (!valid(snapshot, generation) || cooldown || entry.exportable !== true) return;
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
            const generation = ++revision;
            const returnFocus = doc.activeElement === refreshButton || doc.activeElement === status;
            report = null; entries.replaceChildren(); globalWarnings.replaceChildren(); inspectedAt.textContent = '';
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
                if (!next.entries.length) create('li', 'recovery-empty', t('Empty'), entries);
                else next.entries.forEach((entry, index) => renderEntry(entry, next, generation, index));
                announce(next.entries.length ? 'Ready' : 'Empty');
            } catch (error) {
                if (closed || suspended || generation !== revision) return;
                report = null; entries.replaceChildren(); globalWarnings.replaceChildren(); inspectedAt.textContent = '';
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
            suspended = true; revision++; report = null; entries.replaceChildren(); globalWarnings.replaceChildren(); inspectedAt.textContent = '';
            if (timer !== null) root.clearTimeout(timer); timer = null; cooldown = false;
        }
        function resume() { if (closed) return; suspended = false; return refresh(); }
        function destroy() { closed = true; suspend(); refreshButton.disabled = true; }
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
