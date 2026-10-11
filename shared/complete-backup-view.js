(function (root) {
    'use strict';
    const fallback = {
    "Title": "Complete local backup",
    "SyncSafety": "If Chrome Sync is enabled, restoring Default configuration pauses it until you review it separately. An interrupted attempt can leave Sync paused even when no workspace replacement finished.",
    "WorkspaceHelp": "Exports include every live workspace and recoverable workspace in Trash. Device privacy, provider settings, credentials and update preferences are excluded.",
    "Target": "Destination for this older single-workspace backup",
    "ChooseTarget": "Choose a destination workspace",
    "TargetRequired": "Choose the workspace to replace, then review again. Other workspaces will be preserved.",
    "SingleScope": "Only selected modules in this destination will be replaced:",
    "AllScope": "This replaces the live workspace list and Trash with the backup. Workspaces absent from the file will leave the current list. A complete recovery copy is saved first.",
    "MatchingScope": "Selected modules are replaced across every matching workspace, including Trash. Workspace names, order and live/Trash status stay unchanged.",
    "WorkspaceNames": "Incoming workspaces",
    "CurrentWorkspaces": "Currently saved workspaces",
    "TrashCount": "Recoverable workspaces in Trash",
    "Topology": "Workspace lists do not match. Export all modules for a full-workspace restore; this partial file cannot add, remove or recover workspaces.",

    "Help": "Choose saved modules to export or restore. Configuration includes sites, categories, layout and local images. Tasks includes saved history. Separate exports below remain available.",
    "SavedOnly": "Only saved data is included. Save drafts first. Unsaved edits, open reviews, calculator input and running or paused Focus sessions are not migrated.",
    "Privacy": "The JSON file can contain private notes, task history, URLs and images. Keep it private. This backup stays local; it does not add these modules to Chrome Sync or Google Drive.",
    "Modules": "Modules to include",
    "Config": "Configuration, sites and local images",
    "Tasks": "Tasks and saved history",
    "Scratchpad": "Scratchpad",
    "Countdown": "Countdown",
    "Focus": "Focus preferences",
    "Export": "Export selected modules",
    "Choose": "Choose local backup JSON",
    "Recovery": "Download pre-restore recovery copy",
    "RecoveryHelp": "A verified local recovery copy is saved before replacement. Download it, then choose that JSON file here to review and restore. Starting a later confirmed restore may replace this snapshot, even if the target replacement does not finish.",
    "Review": "Review local replacement",
    "Scope": "Only selected modules will be replaced, not merged. Unselected modules stay unchanged. Review the incoming and current counts below.",
    "FocusWarning": "Only saved Focus preferences migrate. Restoration is blocked while an affected workspace has a running, paused or interrupted Focus session. Deselect Focus, or stop/reset that timer and preview again.",
    "Incoming": "Incoming",
    "Current": "Currently saved",
    "Ready": "Review the selected modules, then explicitly confirm replacement.",
    "Apply": "Replace selected saved modules",
    "Cancel": "Cancel review",
    "Reading": "Reading and checking the local file…",
    "Applying": "Replacing selected saved modules… Wait for the result before closing this page.",
    "Cancelled": "Review cancelled. Saved data and drafts were not changed.",
    "Exporting": "Preparing saved data for download…",
    "Download": "Download requested. Check your browser’s downloads and keep the file safe; completion cannot be verified here.",
    "Success": "Selected saved modules were restored and verified. Reload to display the saved state. Any newly entered drafts remain on this page.",
    "Reload": "Reload saved state",
    "None": "Select at least one module.",
    "File": "Could not read the local file. Choose it again. Saved data and drafts were not changed.",
    "Invalid": "This is not a supported complete local backup. No replacement was made.",
    "Size": "The file exceeds the supported size limit. No replacement was made.",
    "Read": "Saved data could not be read safely. Check storage availability and try again.",
    "Conflict": "Saved data changed after preview. Choose the file again for a fresh review. This attempt made no replacement.",
    "Dirty": "Save or finish your current edits and pending actions before restoring. Your drafts remain here.",
    "RecoveryError": "The recovery copy could not be saved and verified. No replacement was made.",
    "Unconfirmed": "The replacement could not be verified. Some data may have changed. Do not retry automatically. Inspect saved data and download the pre-restore recovery copy if needed.",
    "NoRecovery": "No valid pre-restore recovery copy is available.",
    "Unknown": "The operation failed. Review saved data before retrying.",
    "Missing": "Not included in this file",
    "CountSites": "Sites",
    "CountCategories": "Categories",
    "CountImages": "Local images",
    "CountActive": "Active tasks",
    "CountDone": "Completed tasks",
    "CountRemoved": "Removed tasks",
    "CountRecovery": "Saved history copies",
    "CountCharacters": "Characters",
    "CountEnabled": "Enabled",
    "CountTitle": "Title characters",
    "CountTargetDate": "Target date",
    "CountFocus": "Focus minutes",
    "CountBreak": "Break minutes",
    "Yes": "Yes",
    "No": "No",
    "LargeFile": "JSON files up to 32 MiB are supported. Large image backups may briefly pause this page while they are checked.",
    "RecoveryScope": "One latest complete pre-restore snapshot is kept. Starting another confirmed restore may replace it. Download the existing recovery copy below before continuing if you need to keep it.",
    "LargeConfirm": "This file is larger than 10 MiB. Checking it may pause this page for a few seconds. Continue only after finishing time-sensitive work in this tab.",
    "Continue": "Continue checking large file"
};
    const MODULES = ['config', 'tasks', 'scratchpad', 'countdown', 'focus'];
    const titleKey = id => id[0].toUpperCase() + id.slice(1);
    function mount(host, {store, restore = (preview, isCurrent) => store.restore(preview, {confirmed: true, isCurrent}), reload = () => root.LocalItabContentLifecycle?.reload(), download = downloadFile} = {}) {
        if (!host?.ownerDocument || !store) throw new TypeError('Complete backup needs a host and store.');
        const doc = host.ownerDocument;
        const t = key => { const id = 'completeBackup' + key; const value = root.i18n?.t(id); return value && value !== id ? value : fallback[key]; };
        let generation = 0, source = null, preview = null, targetWorkspaceId, phase = '', destroyed = false, pendingLargeFile = null;
        const make = (tag, cls, text, parent) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; parent?.append(el); return el; };
        const shell = make('section', 'complete-backup', undefined, host);
        make('h3', 'section-title', t('Title'), shell);
        for (const key of ['Help', 'WorkspaceHelp', 'SyncSafety', 'SavedOnly', 'Privacy', 'LargeFile']) make('p', 'form-hint', t(key), shell);
        const choices = make('fieldset', 'complete-backup-modules', undefined, shell);
        make('legend', '', t('Modules'), choices);
        const inputs = {};
        for (const id of MODULES) {
            const label = make('label', 'complete-backup-module', undefined, choices);
            const input = make('input', '', undefined, label); input.type = 'checkbox'; input.checked = true; input.dataset.module = id; inputs[id] = input;
            make('span', '', t(titleKey(id)), label);
        }
        const actions = make('div', 'complete-backup-actions', undefined, shell);
        const button = (key, name, parent = actions, danger = false) => { const el = make('button', `btn ${danger ? 'btn-danger' : 'btn-secondary'} complete-backup-${name}`, t(key), parent); el.type = 'button'; return el; };
        const exportButton = button('Export', 'export'), choose = button('Choose', 'choose');
        const file = make('input', 'complete-backup-file', undefined, shell); file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true;
        const panel = make('section', 'complete-backup-preview', undefined, shell); panel.hidden = true;
        make('h4', '', t('Review'), panel);
        const summary = make('p', '', t('Scope'), panel); summary.tabIndex = -1;
        make('p', 'form-hint', t('RecoveryScope'), panel);
        const destination = make('label', 'form-group complete-backup-destination', undefined, panel); destination.hidden = true;
        make('span', 'form-label', t('Target'), destination);
        const target = make('select', 'form-select complete-backup-target', undefined, destination);
        const workspaceSummary = make('p', 'complete-backup-workspaces', '', panel); workspaceSummary.hidden = true;
        const counts = make('ul', 'complete-backup-counts', undefined, panel);
        const warning = make('p', 'complete-backup-warning', t('FocusWarning'), panel);
        const confirmActions = make('div', 'complete-backup-actions', undefined, panel);
        const largeButton = button('Continue', 'large', confirmActions); largeButton.hidden = true;
        const apply = button('Apply', 'apply', confirmActions, true), cancel = button('Cancel', 'cancel', confirmActions);
        const status = make('p', 'form-hint complete-backup-status', '', shell); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); status.tabIndex = -1;
        const reloadButton = button('Reload', 'reload', shell); reloadButton.hidden = true;
        const recovery = button('Recovery', 'recovery', shell); make('p', 'form-hint', t('RecoveryHelp'), shell);
        const current = token => !destroyed && host.isConnected && shell.isConnected && token === generation;
        const selected = () => MODULES.filter(id => inputs[id].checked && !inputs[id].disabled);
        function controls() {
            const busy = ['applying', 'exporting'].includes(phase);
            for (const id of MODULES) inputs[id].disabled = busy || Boolean(preview && !preview.modules.includes(id));
            exportButton.disabled = choose.disabled = file.disabled = recovery.disabled = busy;
            target.disabled = busy || phase === 'reading';
            apply.disabled = phase !== 'ready' || Boolean(preview?.requiresTarget) || !preview?.selected.length || Boolean(preview?.selected.includes('focus') && preview.current.focus?.activeSession);
            cancel.disabled = phase === 'applying';
            shell.setAttribute('aria-busy', String(['reading', 'applying', 'exporting'].includes(phase)));
        }
        // Only move focus if the initiating control still owns it after async work.
        function focusOwner(origin) {
            let valid = true;
            const invalidate = () => { valid = false; };
            const move = event => { if (![origin, file, doc.body].includes(event.target)) invalidate(); };
            doc.addEventListener('pointerdown', invalidate, true); doc.addEventListener('focusin', move, true); doc.addEventListener('visibilitychange', invalidate, true);
            return target => { doc.removeEventListener('pointerdown', invalidate, true); doc.removeEventListener('focusin', move, true); doc.removeEventListener('visibilitychange', invalidate, true);
                if (target && valid && !destroyed && !doc.hidden && shell.getClientRects().length && [origin, file, doc.body].includes(doc.activeElement)) target.focus(); };
        }
        const errorText = (error, applying = false) => {
            if (error?.mayHaveCommitted || error?.code === 'UNCONFIRMED') return t('Unconfirmed');
            return t(({INVALID:'Invalid',VERSION:'Invalid',SIZE_LIMIT:'Size',READ:'Read',CORRUPT:'Read',CONFLICT:'Conflict',DIRTY:'Dirty',RECOVERY:'RecoveryError',NO_RECOVERY:'NoRecovery',CANCELLED:'Cancelled',FILE:'File',FOCUS_ACTIVE:'FocusWarning',TARGET:'TargetRequired',TOPOLOGY:'Topology',WORKSPACE_CONFLICT:'Conflict',WORKSPACE_STALE:'Conflict',WORKSPACE_CANCELED:'Cancelled',WORKSPACE_CANCELLED:'Cancelled',WORKSPACE_RECOVERY:'RecoveryError'})[error?.code] || (applying ? 'Unconfirmed' : 'Unknown'));
        };
        function clear() { preview = null; panel.hidden = true; largeButton.hidden = true; counts.replaceChildren(); destination.hidden = workspaceSummary.hidden = true; summary.textContent = t('Scope'); for (const input of Object.values(inputs)) input.disabled = false; }
        function abandon() { if (phase === 'applying') return; ++generation; source = null; targetWorkspaceId = undefined; pendingLargeFile = null; phase = ''; clear(); controls(); status.textContent = t('Cancelled'); choose.focus(); }
        const countText = value => {
            if (!value || typeof value !== 'object') return '';
            const parts = [];
            const add = (key, n) => { if (Number.isSafeInteger(n) && n >= 0) parts.push(`${t(key)}: ${n}`); };
            add('CountSites', value.shortcuts); add('CountCategories', value.categories); if (Number.isSafeInteger(value.dataUrlIcons)) add('CountImages', value.dataUrlIcons + Number(value.hasBackgroundImage === true) + Number(value.hasMoviePoster === true));
            for (const key of ['active', 'done', 'removed', 'recovery', 'characters']) add('Count' + titleKey(key), value[key]);
            if (typeof value.enabled === 'boolean') parts.push(`${t('CountEnabled')}: ${t(value.enabled ? 'Yes' : 'No')}`);
            if (typeof value.title === 'string') add('CountTitle', Array.from(value.title).length);
            if (typeof value.targetDate === 'string' && /^\d{4}-\d\d-\d\d$/.test(value.targetDate)) parts.push(`${t('CountTargetDate')}: ${value.targetDate}`);
            if (value.durations) { add('CountFocus', value.durations.focus); add('CountBreak', value.durations.break); }
            return parts.join(' · ');
        };
        async function review(token, origin, initial = false) {
            const move = focusOwner(origin); phase = 'reading'; clear(); panel.hidden = false; warning.hidden = true; status.textContent = t('Reading'); controls();
            const selection = selected();
            if (!initial && !selection.length) { phase = ''; status.textContent = t('None'); controls(); move(status); return; }
            try {
                // Yield so reading feedback can paint before bounded core validation.
                await new Promise(resolve => setTimeout(resolve, 0));
                if (!current(token)) return;
                const result = await store.review(source, initial ? undefined : selection, targetWorkspaceId === undefined ? {} : {targetWorkspaceId});
                if (!current(token)) return;
                preview = result; phase = result.requiresTarget ? 'target' : 'ready';
                if (result.schemaVersion === 1 && Array.isArray(result.destinations)) {
                    destination.hidden = false; target.replaceChildren();
                    const placeholder = make('option', '', t('ChooseTarget'), target); placeholder.value = '';
                    for (const item of result.destinations) { const option = make('option', '', item.name, target); option.value = item.id; }
                    target.value = targetWorkspaceId || '';
                    summary.textContent = result.targetWorkspace ? `${t('SingleScope')} ${result.targetWorkspace.name}` : t('TargetRequired');
                } else if (result.workspaces) {
                    const spaces = result.workspaces; workspaceSummary.hidden = false;
                    summary.textContent = t(spaces.scope === 'all' ? 'AllScope' : 'MatchingScope');
                    workspaceSummary.textContent = `${t('WorkspaceNames')}: ${spaces.incoming.map(item => item.name).join(', ')}. ${t('TrashCount')}: ${spaces.incomingTrashCount}${spaces.incomingTrash?.length ? ` (${spaces.incomingTrash.map(item => item.name).join(', ')})` : ''}. ${t('CurrentWorkspaces')}: ${spaces.current.map(item => item.name).join(', ')}. ${t('TrashCount')}: ${spaces.currentTrashCount}${spaces.currentTrash?.length ? ` (${spaces.currentTrash.map(item => item.name).join(', ')})` : ''}.`;
                }
                for (const id of MODULES) {
                    inputs[id].checked = result.selected.includes(id);
                    if (!result.modules.includes(id)) continue;
                    const row = make('li', '', undefined, counts);
                    make('strong', '', t(titleKey(id)) + (result.selected.includes(id) ? '' : ` (${t('No')})`), row);
                    make('span', '', `${t('Incoming')}: ${countText(result.incoming[id])}`, row);
                    make('span', '', `${t('Current')}: ${countText(result.current[id])}`, row);
                }
                warning.hidden = !result.selected.includes('focus'); status.textContent = result.requiresTarget ? t('TargetRequired') : result.selected.includes('focus') && result.current.focus?.activeSession ? t('FocusWarning') : result.selected.length ? t('Ready') : t('None'); controls(); move(summary);
            } catch (error) { if (current(token)) { phase = ''; clear(); status.textContent = errorText(error); controls(); move(status); } }
            finally { move(current(token) ? status : null); }
        }
        choose.addEventListener('click', () => { if (!current(generation) || choose.disabled) return; file.value = ''; file.click(); });
        async function readFile(chosen, token) {
            const move = focusOwner(choose); pendingLargeFile = null; source = null; targetWorkspaceId = undefined; clear(); phase = 'reading'; panel.hidden = false; warning.hidden = true; status.textContent = t('Reading'); controls();
            try {
                let text;
                try { text = await chosen.text(); } catch (_) { throw {code:'FILE'}; }
                if (!current(token)) return;
                source = text;
                await review(token, choose, true);
            } catch (error) { if (current(token)) { phase = ''; clear(); controls(); status.textContent = errorText(error); move(status); } }
            finally { move(current(token) ? status : null); }
        }
        file.addEventListener('change', () => {
            if (!current(generation) || file.disabled) return;
            const chosen = file.files?.[0]; file.value = ''; if (!chosen) return;
            const token = ++generation; source = null; targetWorkspaceId = undefined; pendingLargeFile = null; clear();
            if (!Number.isSafeInteger(chosen.size) || chosen.size < 0 || chosen.size > (root.LocalItabCompleteBackup?.LIMITS.bytes || 32 * 1024 * 1024)) {
                phase = ''; controls(); status.textContent = t('Size'); status.focus(); return;
            }
            if (chosen.size > 10 * 1024 * 1024) {
                pendingLargeFile = chosen; phase = 'large'; panel.hidden = false; warning.hidden = true; largeButton.hidden = false;
                controls(); status.textContent = t('LargeConfirm'); status.focus(); return;
            }
            readFile(chosen, token);
        });
        largeButton.addEventListener('click', () => {
            if (!current(generation) || phase !== 'large' || !pendingLargeFile) return;
            const chosen = pendingLargeFile; readFile(chosen, ++generation);
        });
        for (const input of Object.values(inputs)) input.addEventListener('change', () => { if (!current(generation) || input.disabled || !source) return; review(++generation, input); });
        target.addEventListener('change', () => { if (!current(generation) || target.disabled || !source) return; targetWorkspaceId = target.value || undefined; review(++generation, target); });
        cancel.addEventListener('click', abandon);
        shell.addEventListener('keydown', event => {
            if (event.key === 'Escape' && phase !== 'applying' && (source !== null || ['reading', 'large'].includes(phase))) { event.preventDefault(); abandon(); }
            if (['Enter', ' ', 'Spacebar'].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
        });
        apply.addEventListener('click', async () => {
            if (!current(generation) || apply.disabled || phase !== 'ready') return;
            const ticket = preview, token = ++generation; phase = 'applying'; status.textContent = t('Applying'); status.focus(); controls();
            const move = focusOwner(status);
            try {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (!current(token)) return;
                await restore(ticket, () => current(token));
                if (!current(token)) return;
                source = null; targetWorkspaceId = undefined; phase = ''; clear(); controls(); status.textContent = t('Success'); reloadButton.hidden = false;
            } catch (error) { if (current(token)) { phase = ''; source = null; clear(); controls(); status.textContent = errorText(error, true); } }
            finally { move(current(token) ? status : null); }
        });
        async function exportFile(isRecovery) {
            if (!current(generation) || ['applying', 'exporting'].includes(phase)) return;
            const ids = selected(); if (!isRecovery && !ids.length) { status.textContent = t('None'); return; }
            const token = ++generation, origin = isRecovery ? recovery : exportButton, move = focusOwner(origin);
            const keepPreview = isRecovery && phase === 'ready';
            if (!keepPreview) { source = null; targetWorkspaceId = undefined; pendingLargeFile = null; clear(); }
            phase = 'exporting'; controls(); status.textContent = t('Exporting');
            try {
                await new Promise(resolve => setTimeout(resolve, 0));
                if (!current(token)) return;
                const text = await (isRecovery ? store.recovery() : store.export(ids));
                if (!current(token)) return;
                if (typeof text !== 'string') throw {code: 'NO_RECOVERY'};
                await download(text, isRecovery ? 'local-itab-pre-restore' : 'local-itab-complete', doc);
                if (current(token)) status.textContent = t('Download');
            } catch (error) { if (current(token)) status.textContent = isRecovery ? t('NoRecovery') : errorText(error); }
            finally { if (current(token)) { phase = keepPreview ? 'ready' : ''; controls(); } move(current(token) ? status : null); }
        }
        exportButton.addEventListener('click', () => exportFile(false)); recovery.addEventListener('click', () => exportFile(true));
        reloadButton.addEventListener('click', () => reload());
        controls();
        return { get pending() { return phase === 'applying' || phase === 'exporting'; }, hasUncommittedWork: () => Boolean(source || phase), cancel: abandon,
            destroy() { if (phase === 'applying') return false; destroyed = true; ++generation; source = null; shell.remove(); return true; } };
    }
    function downloadFile(text, name, doc) {
        const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
        const link = doc.createElement('a'); link.href = url; link.download = `${name}-${new Date().toISOString().slice(0,10)}.json`;
        try { doc.body.append(link); link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    }
    root.LocalItabCompleteBackupView = {mount};
})(typeof window === 'undefined' ? globalThis : window);
