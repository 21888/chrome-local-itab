(function (root) {
    'use strict';
    const copy = {
        Title: 'Workspaces', Current: 'Current workspace', Switch: 'Switch workspace', Manage: 'Manage workspaces',
        Help: 'Keep separate sites, layout, visual template, tasks, notes, countdown and Focus timer on this device.',
        Pinned: 'This tab stays in its workspace. New tabs open the last workspace you choose.',
        Shared: 'Language, privacy permissions and cloud accounts are shared. Chrome Sync and Drive apply to Default only. Complete backups include every workspace and Trash.',
        Create: 'New workspace', CreateTitle: 'Create a workspace', Name: 'Workspace name', NameHint: '1–80 characters. Names can repeat; each workspace has its own identity.',
        CreateHelp: 'Starts with default settings and empty personal modules. Your existing workspaces stay unchanged.',
        Rename: 'Rename', RenameTitle: 'Rename workspace', Duplicate: 'Duplicate', DuplicateTitle: 'Duplicate workspace',
        DuplicateHelp: 'Copies saved sites, layout, template and personal content. Unsaved drafts are not copied. A copied Focus timer starts ready, with no active session.',
        ClockChanged: 'The device clock moved backwards. This workspace was not moved to Trash. Review its Focus timer before trying again.',
        Delete: 'Move to Trash', DeleteTitle: 'Move workspace to Trash?', DeleteHelp: 'Saved content is kept in Trash until you restore it. Open tabs cannot save to a deleted workspace. Copy or export unsaved drafts before leaving those tabs. A running Focus timer is paused at deletion; restoring never starts it automatically.',
        Default: 'Default', DefaultHelp: 'Default keeps existing settings and cloud compatibility and cannot be deleted.',
        Active: 'Open in this tab', Loaded: 'This tab', LastUsed: 'New tabs', Trash: 'Trash', TrashHelp: 'Restore saved content here. Focus keeps its saved paused, ready, completed or interrupted state. Old open tabs stay unable to save after restoration; reopen the workspace to start a fresh session.',
        EmptyTrash: 'No workspaces in Trash.', Restore: 'Restore', Cancel: 'Cancel', Close: 'Close', Stay: 'Stay here',
        Saving: 'Saving…', Loading: 'Loading workspaces…', Waiting: 'Waiting for current actions to finish…', Switching: 'Opening workspace…',
        Created: 'Workspace created. Open it when you are ready.', Renamed: 'Workspace renamed.', Duplicated: 'Saved content duplicated. The copy is ready to open.',
        Deleted: 'Workspace moved to Trash. Saved content can be restored below.', Restored: 'Workspace restored. Open it to use a fresh session.',
        Error: 'Could not confirm the action. Check the current list before trying again. Your draft is still here.',
        LoadError: 'Could not load workspaces. Your current page is unchanged.', Retry: 'Refresh list', NameError: 'Enter a workspace name with 1–80 characters.',
        DraftTitle: 'Before changing workspaces', DraftHelp: 'This page has unsaved drafts or open reviews. Save supported edits, finish the open editor, or explicitly discard them. Nothing is saved during unload.',
        SaveSwitch: 'Save and switch', DiscardSwitch: 'Discard drafts and switch', SaveIncomplete: 'Some edits need attention in their original editor. Stay here to finish or export them, or choose Discard drafts and switch.',
        SaveFailed: 'Could not save every draft. This page and its drafts are still here. Stay here to review the error.',
        Invalid: 'This workspace was deleted or replaced elsewhere. This page can no longer save. Copy or export your drafts before reopening a workspace. Restoring a workspace does not reconnect this old tab.',
        ExportDrafts: 'Export page text', ExportHelp: 'Downloads editable text from this page, including unsaved form values. Keep this private; it is a text copy, not a restorable backup.',
        ExportRequested: 'Text download requested. Check your downloads before leaving this page.', ExportFailed: 'Could not export page text. Copy the fields you need before leaving.',
        WaitFailed: 'An action is still running. Stay here and try switching again when it finishes.',
        LegacyConflict: 'An older Local iTab tab wrote to the previous storage format. Close older tabs. Both saved copies are retained; saving is paused until this conflict is reviewed. Download both copies before choosing how to recover.',
        LegacyReview: 'Review recovery choice', LegacyReviewTitle: 'Review both saved copies', LegacyKeep: 'Keep current workspaces and retain older-tab copy', LegacyReviewHelp: 'Close every older Local iTab tab before continuing. This keeps the current workspaces active and preserves the older-tab copy separately. It does not merge or delete either copy.', LegacyCurrent: 'Current workspaces', LegacyOlder: 'Older-tab copy', LegacyDetected: 'Conflict detected', LegacySites: 'Sites', LegacyTasks: 'Tasks', LegacyNotes: 'Scratchpad characters', LegacySpaces: 'Workspaces', LegacyTrash: 'In Trash', LegacyChanged: 'Saved copies changed during review. Review again before choosing a recovery action.', LegacyReviewAgain: 'Review again', LegacyResolved: 'Current workspaces are kept and the older-tab copy is retained. This old page still cannot save. Copy or export its drafts, then explicitly reopen a workspace.',
        LegacyDownload: 'Download both saved copies', LegacyRequested: 'Recovery download requested. It contains both saved workspace copies, without account credentials or cloud-provider settings. Check your downloads before making recovery changes.', LegacyExportFailed: 'Could not export both saved copies. They remain on this device. Keep this page open and retry after closing older tabs.',
        ProviderScope: 'Chrome Sync and Google Drive manage Default only. Other workspaces are protected and use complete local backups.', OpenDefault: 'Open Default workspace',
        Open: 'Open', Available: 'Available workspaces', SavedOnly: 'Operations here use saved content. Open drafts stay in their original tabs.'
    };
    const t = key => { const value = root.i18n?.t('spaces' + key); return value && value !== 'spaces' + key ? value : copy[key] || key; };
    let dialogNumber = 0;
    function mount({ switcher, managerHost, manager = root.LocalItabWorkspaces?.manager, session = root.LocalItabWorkspaces?.session,
        lifecycle = root.LocalItabContentLifecycle, navigate = id => {
            const next = new URL(root.location.href); next.searchParams.set('workspace', id); root.location.assign(next.href);
        }, download = defaultDownload } = {}) {
        const doc = (switcher || managerHost).ownerDocument;
        let registry = null, busy = false, closed = false, modal = null, invalid = false, refreshRevision = 0, legacyConflict = false, recoveryPending = false, legacyReviewPending = false;
        const create = (tag, cls, value, parent) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (value !== undefined) el.textContent = value; parent?.append(el); return el; };
        const button = (key, action, parent, cls = '') => {
            const el = create('button', 'spaces-button ' + cls, t(key), parent); el.type = 'button';
            el.addEventListener('keydown', event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); });
            el.addEventListener('click', event => { if (!el.disabled && !closed) action(event); }); return el;
        };
        const bar = switcher || create('div', 'workspace-bar', undefined, managerHost);
        const switchButton = button('Loading', () => showPicker(), bar, 'spaces-switch'); switchButton.setAttribute('aria-haspopup', 'dialog');
        const pinned = create('span', 'spaces-pinned', t('Pinned'), bar);
        const status = create('p', 'spaces-status', '', managerHost || bar); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1;
        const invalidBanner = create('section', 'spaces-invalid', undefined, bar); invalidBanner.hidden = true;
        create('p', '', t('Invalid'), invalidBanner); create('p', 'spaces-help', t('ExportHelp'), invalidBanner);
        button('ExportDrafts', exportDrafts, invalidBanner);
        const legacyBanner = create('section', 'spaces-invalid spaces-legacy', undefined, bar); legacyBanner.hidden = true; legacyBanner.setAttribute('role','alert');
        create('p', '', t('LegacyConflict'), legacyBanner);
        const recoveryDownload = button('LegacyDownload', exportLegacyRecovery, legacyBanner);
        const recoveryReview = button('LegacyReview', reviewLegacyRecovery, legacyBanner);
        button('ExportDrafts', exportDrafts, legacyBanner);
        let list, trash, createButton, retry;
        if (managerHost) {
            create('h2', 'section-title', t('Title'), managerHost);
            create('p', 'section-description', t('Help'), managerHost);
            create('p', 'spaces-help', t('Shared'), managerHost);
            create('p', 'spaces-help', t('SavedOnly'), managerHost);
            const toolbar = create('div', 'spaces-actions', undefined, managerHost);
            createButton = button('Create', () => showName('create'), toolbar, 'spaces-primary');
            retry = button('Retry', () => refresh(), toolbar);
            list = create('ul', 'spaces-list', undefined, managerHost); list.setAttribute('aria-label', t('Available'));
            const details = create('details', 'spaces-trash', undefined, managerHost); create('summary', '', t('Trash'), details);
            create('p', 'spaces-help', t('TrashHelp'), details); trash = create('ul', 'spaces-list', undefined, details);
        } else {
            const manage = create('a', 'spaces-manage', t('Manage'), bar); manage.href = settingsUrl(session.id, 'workspace-settings');
            session.ready().then(() => { if (!closed) manage.href = settingsUrl(session.id, 'workspace-settings'); }).catch(() => {});
        }
        function current() { return registry?.workspaces.find(item => item.id === session.id); }
        function setStatus(key) { status.textContent = t(key); }
        function controls() {
            switchButton.disabled = busy || !registry || legacyConflict;
            if (createButton) createButton.disabled = busy || !registry || legacyConflict;
            if (retry) retry.disabled = busy;
            [list, trash].filter(Boolean).forEach(host => host.querySelectorAll('button').forEach(node => {
                node.disabled = busy || legacyConflict || node.dataset.fixedDisabled === 'true';
            }));
            (managerHost || bar).setAttribute('aria-busy', String(busy));
        }
        function render() {
            if (closed || !registry) return;
            const loaded = current();
            invalid = legacyConflict || session.invalidated === true || Boolean(loaded && (loaded.deletedAt || loaded.generation !== session.generation)) || !loaded;
            switchButton.textContent = `${t('Current')}: ${loaded?.name || t('Default')} ▾`;
            switchButton.setAttribute('aria-label', `${t('Switch')}: ${loaded?.name || t('Default')}`);
            invalidBanner.hidden = legacyConflict || !invalid;
            if (invalid) lifecycle?.pauseAutosave?.();
            pinned.textContent = t('Pinned');
            if (list) {
                const focused = doc.activeElement;
                const focusId = focused?.dataset?.workspaceId, focusAction = focused?.dataset?.workspaceAction;
                list.replaceChildren(); trash.replaceChildren();
                for (const item of [...registry.workspaces].sort((a,b) => a.order - b.order)) {
                    const row = create('li', 'spaces-row', undefined, item.deletedAt ? trash : list);
                    const title = create('div', 'spaces-row-title', undefined, row);
                    create('strong', 'spaces-name', item.name, title);
                    if (item.id === session.id) create('span', 'spaces-badge', t('Loaded'), title);
                    if (item.id === registry.lastUsedId && !item.deletedAt) create('span', 'spaces-badge', t('LastUsed'), title);
                    const actions = create('div', 'spaces-actions', undefined, row);
                    const add = (key, action, fn) => { const b = button(key, fn, actions); b.dataset.workspaceId = item.id; b.dataset.workspaceAction = action; return b; };
                    if (item.deletedAt) add('Restore', 'restore', () => runMutation(() => manager.restore(item.id), 'Restored'));
                    else {
                        const open = add('Active', 'open', () => requestSwitch(item.id));
                        if (item.id === session.id && !invalid) { open.dataset.fixedDisabled = 'true'; open.disabled = true; }
                        add('Rename', 'rename', () => showName('rename', item));
                        add('Duplicate', 'duplicate', () => showName('duplicate', item));
                        const remove = add('Delete', 'delete', () => showDelete(item)); remove.classList.add('spaces-danger');
                        if (item.id === registry.defaultId) { remove.dataset.fixedDisabled = 'true'; remove.disabled = true; remove.title = t('DefaultHelp'); create('small', 'spaces-help', t('DefaultHelp'), title); }
                    }
                }
                if (!trash.children.length) create('li', 'spaces-empty', t('EmptyTrash'), trash);
                // Restore a focused row control only if this render removed it.
                if (focusId && (doc.activeElement === doc.body || !focused.isConnected)) {
                    const replacement = [...list.querySelectorAll('button'), ...trash.querySelectorAll('button')].find(b => b.dataset.workspaceId === focusId && b.dataset.workspaceAction === focusAction);
                    if (replacement && !replacement.disabled) replacement.focus();
                }
            }
            controls();
        }
        async function refresh() {
            const request = ++refreshRevision;
            try { const next = await manager.list(); if (closed || request !== refreshRevision) return; registry = next; legacyConflict = false; legacyBanner.hidden = true; render(); }
            catch (error) { if (!closed && request === refreshRevision) { if (!reportLegacyConflict(error)) setStatus('LoadError'); controls(); } }
        }
        function reportLegacyConflict(error) {
            if (error?.code !== 'WORKSPACE_LEGACY_CONFLICT' || closed) return false;
            legacyConflict = invalid = true; legacyBanner.hidden = false; invalidBanner.hidden = true;
            lifecycle?.pauseAutosave?.(); controls(); return true;
        }
        async function exportLegacyRecovery() {
            if (closed || recoveryPending) return;
            recoveryPending = true; recoveryDownload.disabled = true;
            try {
                const recovery = await manager.exportLegacyConflictRecovery();
                await download(JSON.stringify(recovery, null, 2), 'local-itab-workspace-conflict-recovery.json', 'application/json');
                if (!closed) setStatus('LegacyRequested');
            } catch (_) { if (!closed) setStatus('LegacyExportFailed'); }
            finally { recoveryPending = false; recoveryDownload.disabled = false; }
        }
        function reviewLegacyRecovery() {
            if (closed || legacyReviewPending || busy) return;
            const d = makeDialog('LegacyReviewTitle'); if (!d) return;
            create('p', 'spaces-help', t('LegacyReviewHelp'), d.panel);
            const summary = create('div', 'spaces-recovery-summary', undefined, d.panel);
            const feedback = create('p', 'spaces-status', '', d.panel); feedback.setAttribute('role','status');
            const actions = create('div', 'spaces-actions', undefined, d.panel);
            const cancel = button('Cancel', () => d.close(), actions);
            const reread = button('LegacyReviewAgain', read, actions);
            const keep = button('LegacyKeep', resolve, actions, 'spaces-danger'); keep.disabled = true;
            let review = null;
            async function read() {
                if (!d.valid() || d.executing || legacyReviewPending) return;
                review = null; keep.disabled = reread.disabled = true; busy = legacyReviewPending = true; controls(); feedback.textContent = t('Loading'); summary.replaceChildren();
                try {
                    const result = await manager.reviewLegacyConflict(); if (!d.valid()) return;
                    review = result;
                    create('p', 'spaces-help', `${t('LegacyDetected')}: ${new Date(result.detectedAt).toLocaleString()}`, summary);
                    for (const [label, data] of [['LegacyCurrent', result.workspaces], ['LegacyOlder', result.legacy]]) {
                        create('h3', '', t(label), summary);
                        const counts = create('ul', '', undefined, summary);
                        for (const [key, textKey] of [['count','LegacySpaces'],['trash','LegacyTrash'],['sites','LegacySites'],['tasks','LegacyTasks'],['scratchpadCharacters','LegacyNotes']]) {
                            if (Number.isFinite(data?.[key])) create('li', '', `${t(textKey)}: ${data[key].toLocaleString()}`, counts);
                        }
                    }
                    feedback.textContent = ''; keep.disabled = false;
                } catch (_) { if (d.valid()) feedback.textContent = t('Error'); }
                finally { busy = legacyReviewPending = false; reread.disabled = false; controls(); }
            }
            async function resolve() {
                if (!d.valid() || !review || d.executing || busy) return;
                const chosen = review; d.executing = busy = true; keep.disabled = cancel.disabled = reread.disabled = true; controls(); feedback.textContent = t('Saving');
                try {
                    const result = await manager.resolveLegacyConflict(chosen, {confirmed:true});
                    if (result?.resolved !== true) throw new Error('Unconfirmed recovery');
                    if (!d.valid()) return;
                    d.executing = false; d.close(); legacyConflict = false; legacyBanner.hidden = true;
                    setStatus('LegacyResolved'); await refresh();
                } catch (error) {
                    review = null;
                    if (d.valid()) feedback.textContent = t(error?.code === 'WORKSPACE_CONFLICT' ? 'LegacyChanged' : 'Error');
                } finally { busy = false; d.executing = false; cancel.disabled = reread.disabled = false; keep.disabled = !review; controls(); restoreOperationFocus(d); }
            }
            d.open(cancel); read();
        }
        function makeDialog(key) {
            if (modal || closed || busy) return null;
            const overlay = create('div', 'spaces-overlay'); overlay.setAttribute('aria-hidden', 'true');
            const panel = create('section', 'spaces-dialog', undefined, overlay); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
            const title = create('h2', '', t(key), panel); title.id = `spaces-dialog-${++dialogNumber}`; panel.setAttribute('aria-labelledby', title.id);
            doc.body.append(overlay);
            let cleanup, executing = false, dismissed = false;
            const origin = doc.activeElement;
            const d = { panel, overlay, origin, get executing() { return executing; }, set executing(value) { executing = value; panel.setAttribute('aria-busy', String(value)); },
                close() { if (executing || dismissed) return; dismissed = true; cleanup?.(); overlay.remove(); if (modal === d) modal = null; d.onClose?.(); },
                open(focus) { cleanup = root.LocalItabDialog.open(overlay, focus, () => d.close()); },
                valid() { return !closed && !dismissed && modal === d; }
            };
            modal = d; return d;
        }
        function restoreOperationFocus(d) {
            if (closed || doc.hidden || doc.activeElement !== doc.body) return;
            if (d.valid()) { (d.panel.querySelector('input') || d.panel.querySelector('button'))?.focus(); return; }
            let target = d.origin;
            if (!target?.isConnected && target?.dataset?.workspaceId) {
                target = [...(managerHost?.querySelectorAll('button') || [])].find(node =>
                    node.dataset.workspaceId === d.origin.dataset.workspaceId && node.dataset.workspaceAction === d.origin.dataset.workspaceAction);
            }
            if (target?.isConnected && !target.disabled) target.focus();
            else if (createButton && !createButton.disabled) createButton.focus();
        }
        function showPicker() {
            const d = makeDialog('Switch'); if (!d) return;
            create('p', 'spaces-help', t('Pinned'), d.panel);
            const options = create('div', 'spaces-picker', undefined, d.panel);
            for (const item of registry.workspaces.filter(w => !w.deletedAt).sort((a,b) => a.order - b.order)) {
                const b = button('Open', () => { d.close(); requestSwitch(item.id); }, options);
                b.textContent = item.name + (item.id === session.id && !invalid ? ` · ${t('Loaded')}` : '');
                b.disabled = item.id === session.id && !invalid;
            }
            const close = button('Close', () => d.close(), d.panel);
            d.open([...options.children].find(b => !b.disabled) || close);
        }
        function showName(kind, item) {
            const title = {create:'CreateTitle',rename:'RenameTitle',duplicate:'DuplicateTitle'}[kind];
            const d = makeDialog(title); if (!d) return;
            if (kind !== 'rename') create('p', 'spaces-help', t(kind === 'create' ? 'CreateHelp' : 'DuplicateHelp'), d.panel);
            const label = create('label', 'spaces-field', t('Name'), d.panel);
            const input = create('input', 'spaces-name-input', undefined, label); input.type = 'text'; input.maxLength = 120; input.value = kind === 'rename' ? item.name : ''; input.autocomplete = 'off';
            const hint = create('p', 'spaces-help', t('NameHint'), d.panel); hint.id = `spaces-name-hint-${dialogNumber}`; input.setAttribute('aria-describedby', hint.id);
            const error = create('p', 'spaces-status', '', d.panel); error.setAttribute('role', 'status');
            const actions = create('div', 'spaces-actions', undefined, d.panel);
            const cancel = button('Cancel', () => d.close(), actions);
            const submit = button({create:'Create',rename:'Rename',duplicate:'Duplicate'}[kind], save, actions, 'spaces-primary');
            async function save() {
                if (!d.valid() || d.executing || busy) return;
                const name = input.value.trim();
                if (!name || [...name].length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) { error.textContent = t('NameError'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
                input.removeAttribute('aria-invalid'); d.executing = busy = true; controls(); input.disabled = submit.disabled = cancel.disabled = true; error.textContent = t('Saving');
                try {
                    await (kind === 'create' ? manager.create(name) : kind === 'rename' ? manager.rename(item.id,name) : manager.duplicate(item.id,name));
                    if (!d.valid()) return;
                    d.executing = false; d.close(); setStatus({create:'Created',rename:'Renamed',duplicate:'Duplicated'}[kind]); await refresh();
                } catch (_) { if (d.valid()) { error.textContent = t('Error'); await refresh(); } }
                finally { busy = false; d.executing = false; input.disabled = submit.disabled = cancel.disabled = false; controls(); restoreOperationFocus(d); }
            }
            input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.repeat && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); save(); } });
            d.open(input);
        }
        function showDelete(item) {
            const d = makeDialog('DeleteTitle'); if (!d) return;
            create('strong', 'spaces-name', item.name, d.panel); create('p', 'spaces-help', t('DeleteHelp'), d.panel);
            const error = create('p', 'spaces-status', '', d.panel); error.setAttribute('role','status');
            const actions = create('div', 'spaces-actions', undefined, d.panel);
            const cancel = button('Cancel', () => d.close(), actions);
            const confirm = button('Delete', async () => {
                if (!d.valid() || d.executing || busy) return;
                d.executing = busy = true; controls(); cancel.disabled = confirm.disabled = true; error.textContent = t('Saving');
                try { await manager.trash(item.id); if (d.valid()) { d.executing = false; d.close(); setStatus('Deleted'); await refresh(); } }
                catch (failure) { if (d.valid()) { error.textContent = t(failure?.code === 'WORKSPACE_CLOCK' ? 'ClockChanged' : 'Error'); await refresh(); } }
                finally { busy = false; d.executing = false; cancel.disabled = confirm.disabled = false; controls(); restoreOperationFocus(d); }
            }, actions, 'spaces-danger'); d.open(cancel);
        }
        async function runMutation(action, success) {
            if (busy || closed) return;
            busy = true; controls(); setStatus('Saving');
            try { await action(); if (!closed) { setStatus(success); await refresh(); } }
            catch (_) { if (!closed) { setStatus('Error'); await refresh(); } }
            finally { busy = false; controls(); }
        }
        async function commitSwitch(id, discard = false) {
            lifecycle?.pauseAutosave?.(); session.suspendWrites?.();
            try {
                await session.flush?.();
                await manager.select(id);
                if (!discard && lifecycle?.hasUncommittedWork?.()) { const error = new Error('A newer draft needs a choice'); error.code = 'WORKSPACE_DRAFT_CHANGED'; throw error; }
                // Only explicit choice owns departure. Selection may have raced deletion;
                // the new page will fail closed rather than silently load another space.
                lifecycle?.allowDeparture?.(discard);
                navigate(id);
            } catch (error) { session.resumeWrites?.(); lifecycle?.cancelDeparture?.(); lifecycle?.resumeAutosave?.(); throw error; }
        }
        async function requestSwitch(id) {
            if (busy || closed || legacyConflict || (id === session.id && !invalid)) return;
            busy = true; controls(); lifecycle?.pauseAutosave?.(); setStatus('Waiting');
            try {
                await lifecycle?.waitForPending?.(); await session.flush?.();
                if (closed) return;
                if (lifecycle?.hasUncommittedWork?.()) { busy = false; controls(); showDraftDecision(id); return; }
                setStatus('Switching'); await commitSwitch(id);
            } catch (error) {
                if (error?.code === 'WORKSPACE_DRAFT_CHANGED') { busy = false; controls(); lifecycle?.pauseAutosave?.(); showDraftDecision(id); }
                else { lifecycle?.resumeAutosave?.(); setStatus(error?.code === 'WORKSPACE_BUSY' ? 'WaitFailed' : 'Error'); }
            }
            finally { busy = false; controls(); }
        }
        function showDraftDecision(id) {
            const d = makeDialog('DraftTitle'); if (!d) { lifecycle?.resumeAutosave?.(); return; }
            d.onClose = () => { if (!lifecycle?.departing && !invalid) lifecycle?.resumeAutosave?.(); };
            create('p', 'spaces-help', t('DraftHelp'), d.panel);
            const feedback = create('p', 'spaces-status', '', d.panel); feedback.setAttribute('role', 'status');
            const actions = create('div', 'spaces-actions', undefined, d.panel);
            const stay = button('Stay', () => d.close(), actions);
            const save = button('SaveSwitch', () => choose(false), actions, 'spaces-primary'); save.disabled = invalid;
            const discard = button('DiscardSwitch', () => choose(true), actions, 'spaces-danger');
            button('ExportDrafts', exportDrafts, d.panel);
            async function choose(discardDrafts) {
                if (!d.valid() || d.executing || busy) return;
                d.executing = busy = true; controls(); stay.disabled = save.disabled = discard.disabled = true; feedback.textContent = t('Waiting');
                try {
                    await lifecycle?.waitForPending?.();
                    if (!discardDrafts) {
                        feedback.textContent = t('Saving');
                        const clean = await lifecycle?.saveDrafts?.();
                        if (!clean || lifecycle.hasUncommittedWork()) { feedback.textContent = t('SaveIncomplete'); return; }
                    }
                    feedback.textContent = t('Switching'); await commitSwitch(id, discardDrafts);
                } catch (_) { feedback.textContent = t('SaveFailed'); }
                finally { busy = false; d.executing = false; stay.disabled = discard.disabled = false; save.disabled = invalid; controls(); restoreOperationFocus(d); }
            }
            d.open(stay);
        }
        async function exportDrafts() {
            try {
                const lines = [current()?.name || t('Current'), t('ExportHelp'), ''];
                for (const field of doc.querySelectorAll('textarea, input')) {
                    if (field.closest('.spaces-overlay') || ['password','file','hidden','checkbox','radio','button','submit'].includes(field.type) || !field.value) continue;
                    lines.push(field.getAttribute('aria-label') || field.id || field.placeholder || field.tagName, field.value, '');
                }
                await download(lines.join('\n'), 'local-itab-workspace-page-text.txt', 'text/plain;charset=utf-8'); setStatus('ExportRequested');
            } catch (_) { setStatus('ExportFailed'); }
        }
        const unsubscribe = manager.subscribe(event => { reportLegacyConflict(event?.error); refresh(); });
        controls(); setStatus('Loading');
        const ready = session.ready().then(() => refresh()).then(() => { if (!closed && registry) status.textContent = ''; }).catch(error => { invalid = true; if (!reportLegacyConflict(error)) { invalidBanner.hidden = false; setStatus('LoadError'); } return refresh(); });
        return {ready, refresh, requestSwitch, get pending() { return busy; }, hasUncommittedWork: () => Boolean(modal || busy),
            destroy() { closed = true; refreshRevision++; unsubscribe?.(); if (modal) { modal.executing = false; modal.close(); } } };
    }
    function settingsUrl(id, hash = '') {
        const base = root.chrome?.runtime?.getURL?.('options.html') || 'options.html';
        return base + (id ? '?workspace=' + encodeURIComponent(id) : '') + (hash ? '#' + hash : '');
    }
    function defaultDownload(contents, name, type) {
        const url = URL.createObjectURL(new Blob([contents], {type})); const link = root.document.createElement('a');
        link.href = url; link.download = name; root.document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    async function mountPage() {
        if (root.workspacesView) return root.workspacesView.ready;
        const switcher = root.document.getElementById('workspace-switcher'); if (!switcher || !root.LocalItabWorkspaces) return;
        root.workspacesView = mount({switcher, managerHost:root.document.getElementById('workspace-manager')});
        await root.workspacesView.ready;
        const id = root.LocalItabWorkspaces.session.id;
        const openDefault = root.document.getElementById('workspace-open-default');
        if (openDefault) { openDefault.hidden = id === 'default'; openDefault.addEventListener('click', () => root.workspacesView.requestSwitch('default')); }
        if (id && root.history?.replaceState) { const url = new URL(root.location.href); url.searchParams.set('workspace',id); root.history.replaceState(null,'',url.href); }
    }
    function openSettings(hash = '') { root.open(settingsUrl(root.LocalItabWorkspaces?.session?.id, hash), '_blank', 'noopener'); }
    root.LocalItabWorkspacesView = {mount, mountPage, openSettings, settingsUrl, copy};
})(window);
