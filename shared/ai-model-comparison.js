/* Explicit two-target comparison. No credential persistence or automatic provider calls. */
(function (root) {
    'use strict';
    function open({ view, collectionStore, presetStore = root.LocalItabAIModelPresets?.createStore({ chromeApi: root.chrome, locks: root.navigator?.locks }) }) {
        const c = view.controller, preview = c.preview(), record = c.record(), session = c.session();
        if (view.openDialog || !preview?.complete || !record || !session || c.disposed || c.busy || c.pendingCommand) return;
        const source = { promptId: record.id, bodyVersionId: session.versionId, title: record.title, version: record.version, epoch: c.excerptEpoch };
        const t = (key, fallback) => view.t(`Compare${key}`, fallback), el = (...args) => view.el(...args);
        const button = (key, fallback, action) => view.button(`Compare${key}`, fallback, action);
        const overlay = el('div', 'prompt-dialog-overlay'), box = el('section', 'prompt-dialog ai-model-dialog ai-compare-dialog');
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ai-compare-title');
        const title = el('h2', '', t('Title', 'Compare models')); title.id = 'ai-compare-title';
        const help = el('p', 'prompt-help', t('Help', 'Select up to two saved connections. Review the same completed prompt for each target, then explicitly Send. This makes up to two provider requests; each provider may charge you. Keys are temporary and separate for each target. No automatic retries.'));
        const prompt = el('textarea', 'prompt-readonly'); prompt.value = preview.text; prompt.readOnly = true; prompt.rows = 6; prompt.setAttribute('aria-label', t('Prompt', 'Same completed prompt for all targets'));
        const status = el('p', 'prompt-help'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const grid = el('div', 'ai-compare-grid'), actions = el('div', 'prompt-actions');
        let closed = false, stale = false, loading = true, sending = false, batch = null, presets = [], generation = 0, cleanup;
        const targets = [];
        const sourceCurrent = () => !c.disposed && !c.busy && !c.pendingCommand && c.excerptEpoch === source.epoch && c.record()?.id === source.promptId && c.record()?.version === source.version && !c.record()?.deletedAt && c.session() === session && session.versionId === source.bodyVersionId && c.preview()?.complete && c.preview().text === preview.text;
        const saving = () => targets.some(target => target.saving);
        function update() {
            const locked = closed || stale || loading || sending || saving() || targets.some(target => target.permissionPending);
            review.disabled = locked || targets.some(target => target.attempted);
            send.disabled = locked || !batch || targets.some(target => target.attempted);
            close.disabled = saving();
            for (const target of targets) {
                target.select.disabled = locked || targets.some(item => item.attempted);
                target.key.disabled = locked || !target.reviewed || target.attempted;
                target.allow.disabled = locked || !target.reviewed || target.attempted;
                target.stop.disabled = !target.running;
                target.save.disabled = closed || stale || sending || saving() || !target.response || target.saved;
            }
        }
        function invalidate(message, permanent = false) {
            generation++; batch = null; stale ||= permanent;
            for (const target of targets) { target.aborter?.abort(); target.key.value = ''; target.reviewed = null; target.reviewText.hidden = true; }
            if (message) status.textContent = message;
            update();
        }
        function checkSource() {
            if (!closed && !stale && !sourceCurrent()) invalidate(t('SourceChanged', 'The prompt or source changed. Close and reopen comparison to review the current prompt. No more requests or saves can start here.'), true);
            return !closed && !stale;
        }
        function active(token) { return checkSource() && token === generation; }
        function failure(code) {
            if (code === 'PERMISSION') return t('PermissionError', 'Endpoint access is not granted. No request was sent to this target.');
            if (code === 'CANCELLED') return t('Cancelled', 'Stopped. Work already started may still be billed.');
            return t('RequestError', 'This target failed. Check its endpoint, model, key or provider status. Nothing retries automatically; the other result is kept.');
        }
        for (let index = 0; index < 2; index++) {
            const panel = el('section', 'ai-compare-target'), heading = el('h3', '', `${t('Target', 'Target')} ${index + 1}`);
            const selectLabel = el('label', 'ai-model-field', t('Connection', 'Saved connection')), select = el('select'); selectLabel.append(select);
            const keyLabel = el('label', 'ai-model-field', t('Key', 'API key for this target only (optional; never saved)')), key = el('input'); key.type = 'password'; key.autocomplete = 'off'; key.maxLength = root.LocalItabAIModel.LIMITS.key; keyLabel.append(key);
            const reviewText = el('pre', 'ai-model-review'); reviewText.hidden = true;
            const output = el('textarea', 'prompt-readonly'); output.readOnly = true; output.rows = 10; output.hidden = true; output.setAttribute('aria-label', `${t('Response', 'Model response')} ${index + 1}`);
            const message = el('p', 'prompt-help'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
            const target = { select, key, reviewText, output, message, heading, reviewed: null, response: null, running: false, attempted: false, saving: false, saved: false, permissionPending: false, command: null };
            target.allow = button('Allow', 'Allow this endpoint', async () => {
                if (!checkSource() || target.allow.disabled || !target.reviewed) return;
                const snapshot = target.reviewed, token = generation; target.permissionPending = true; update();
                try {
                    const granted = await root.chrome.permissions.request({ origins: [snapshot.permission] });
                    if (active(token) && target.reviewed === snapshot) message.textContent = granted ? t('Allowed', 'Access allowed. Only Send starts requests.') : failure('PERMISSION');
                } catch (_) { if (active(token)) message.textContent = failure('PERMISSION'); }
                finally { target.permissionPending = false; if (!closed) update(); }
            });
            target.stop = button('Stop', 'Stop this target', () => {
                if (!target.running) return; target.aborter?.abort(); key.value = ''; message.textContent = failure('CANCELLED'); update();
            });
            target.save = button('Save', 'Save this result to AI collection', async () => {
                if (!checkSource() || target.save.disabled || !target.response) return;
                target.saving = true; update();
                try {
                    if (!collectionStore) throw new Error('SAVE');
                    target.command ||= collectionStore.request('add', {
                        title: source.title, body: target.response.text, tool: target.reviewed.model, sourceUrl: target.reviewed.origin,
                        notes: t('SavedNote', 'Comparison result from the same explicitly reviewed completed prompt. The link identifies its saved template version. Filled values are not stored separately but may appear in this response. No API key is saved.'),
                        promptRef: { promptId: source.promptId, bodyVersionId: source.bodyVersionId }
                    });
                    await collectionStore.mutate(target.command, (raw, reference) => {
                        if (!sourceCurrent() || stale || closed) return false;
                        try { return root.LocalItabPrompts.validate(raw).records.some(item => item.id === reference.promptId && !item.deletedAt && item.history.some(version => version.id === reference.bodyVersionId)); } catch (_) { return false; }
                    });
                    target.saved = true; message.textContent = t('Saved', 'Saved and linked to the original prompt version.');
                } catch (_) { message.textContent = t('SaveError', 'Could not confirm the save. This result remains here; retry uses the same save operation.'); }
                finally { target.saving = false; if (!closed) update(); }
            });
            select.addEventListener('change', () => { if (!select.disabled && checkSource()) invalidate(t('ReviewAgain', 'Connections changed. Review both targets again before sending.')); });
            const buttons = el('div', 'prompt-actions'); buttons.append(target.allow, target.stop, target.save);
            panel.append(heading, selectLabel, keyLabel, reviewText, buttons, message, output); grid.append(panel); targets.push(target);
        }
        const review = button('Review', 'Review comparison requests', () => {
            if (!checkSource() || review.disabled) return;
            invalidate();
            try {
                const selected = targets.filter(target => target.select.value !== '');
                if (!selected.length) { status.textContent = t('Select', 'Select one or two saved connections. Create connections with Run with your model first.'); return; }
                const seen = new Set();
                const reviewed = selected.map(target => {
                    const preset = presets[Number(target.select.value)];
                    if (!preset) throw new Error('TARGET');
                    const request = root.LocalItabAIModel.review({ url: preset.url, model: preset.model, prompt: preview.text });
                    const identity = JSON.stringify([request.url, request.model]);
                    if (seen.has(identity)) throw new Error('DUPLICATE'); seen.add(identity);
                    return { target, request, preset };
                });
                batch = reviewed;
                for (const { target, request, preset } of reviewed) {
                    target.reviewed = request;
                    target.heading.textContent = `${t('Target', 'Target')} ${targets.indexOf(target) + 1}: ${preset.name}`;
                    target.reviewText.textContent = `${t('Endpoint', 'Full endpoint URL')}: ${request.url}\n${t('Model', 'Model ID')}: ${request.model}\n\n${request.prompt}`;
                    target.reviewText.hidden = false;
                }
                status.textContent = `${t('Count', 'Maximum provider requests')}: ${reviewed.length}. ${t('Cost', 'Each target may charge separately. Review every endpoint, model and identical prompt above. Allowing access sends nothing.')}`;
            } catch (_) { batch = null; targets.forEach(target => { target.reviewed = null; target.reviewText.hidden = true; }); status.textContent = t('Duplicate', 'Choose valid, distinct endpoint and model combinations. Duplicate targets are not sent.'); }
            update();
        });
        const send = button('Send', 'Send reviewed comparison (up to 2 requests)', async () => {
            if (!checkSource() || send.disabled || !batch) return;
            sending = true; const token = generation, snapshots = batch.slice(); update();
            // Re-read saved metadata immediately before sending. External edits require a new review.
            try {
                const current = await presetStore.read();
                if (!active(token)) return;
                if (snapshots.some(({ preset }) => !current.records.some(item => item.name === preset.name && item.url === preset.url && item.model === preset.model))) {
                    invalidate(t('ProfileChanged', 'A selected connection changed or was deleted. Close and reopen to load it, then review again.'), true); return;
                }
                await Promise.all(snapshots.map(async ({ target, request }) => {
                    if (!active(token)) return;
                    target.attempted = true; target.running = true; target.aborter = new AbortController(); const signal = target.aborter.signal;
                    const secret = target.key.value; target.key.value = ''; update();
                    try {
                        const permitted = await root.chrome.permissions.contains({ origins: [request.permission] });
                        if (!active(token) || signal.aborted) return;
                        if (!permitted) throw { code: 'PERMISSION' };
                        target.message.textContent = t('Running', 'Waiting for this model…');
                        const result = await root.LocalItabAIModel.run(request, { key: secret, signal });
                        if (!active(token) || signal.aborted) return;
                        target.response = result; target.output.value = result.text; target.output.hidden = false;
                        target.message.textContent = t('Ready', 'Review this result. Save only if you want it in local collections and unencrypted backups.');
                    } catch (error) { if (active(token) && !signal.aborted) target.message.textContent = failure(error.code); }
                    finally { target.key.value = ''; target.running = false; if (!closed) update(); }
                }));
            } catch (_) { if (active(token)) invalidate(t('LoadError', 'Saved connections could not be verified. No requests were started. Close and reopen to try again.'), true); }
            finally { sending = false; targets.forEach(target => { target.key.value = ''; }); if (!closed) update(); }
        });
        function guard(event) { if (sending || saving() || targets.some(target => target.response && !target.saved)) { event.preventDefault(); event.returnValue = ''; } }
        function hide() { if (!closed) invalidate(t('Interrupted', 'Comparison interrupted. Close and reopen before starting more work.'), true); }
        function storageChanged(changes, area) {
            if (area !== 'local' || closed) return;
            if (Object.keys(changes).some(key => key.startsWith('__localItabWorkspace') || key === (root.LocalItabWorkspaces?.RESTORE_TRANSACTION_KEY || '__localItabCombinedRestoreV1'))) hide();
            else if (Object.hasOwn(changes, root.LocalItabAIModelPresets?.KEY || '__localItabAIModelPresetsV1')) invalidate(t('ProfileChanged', 'A selected connection changed or was deleted. Close and reopen to load it, then review again.'), true);
        }
        function finish() {
            if (closed || saving()) return;
            if ((sending || targets.some(target => target.response && !target.saved)) && !root.confirm(t('Discard', 'Stop pending requests and discard unsaved comparison results?'))) return;
            closed = true; generation++;
            targets.forEach(target => { target.aborter?.abort(); target.key.value = ''; target.response = target.reviewed = target.command = null; target.output.value = ''; });
            root.removeEventListener('beforeunload', guard); root.removeEventListener('pagehide', hide); root.chrome?.storage?.onChanged?.removeListener(storageChanged);
            cleanup?.(); overlay.remove(); view.openDialog = false; view.checkModelComparison = null; view.cancelModelDialog = null;
        }
        const close = button('Close', 'Close', finish);
        actions.append(review, send, close); box.append(title, help, prompt, grid, actions, status); overlay.append(box); view.doc.body.append(overlay);
        view.openDialog = true; view.checkModelComparison = checkSource; view.cancelModelDialog = hide;
        root.addEventListener('beforeunload', guard); root.addEventListener('pagehide', hide); root.chrome?.storage?.onChanged?.addListener(storageChanged);
        cleanup = root.LocalItabDialog.open(overlay, targets[0].select, finish);
        function renderPresets() {
            targets.forEach(target => {
                const empty = el('option', '', t('None', 'Do not send to this target')); empty.value = ''; target.select.replaceChildren(empty);
                presets.forEach((preset, index) => { const option = el('option', '', `${preset.name} · ${preset.model}`); option.value = String(index); target.select.append(option); }); target.select.value = '';
            });
        }
        renderPresets(); update();
        Promise.resolve().then(() => presetStore.read()).then(state => { if (!closed) { presets = state.records; renderPresets(); status.textContent = t('Select', 'Select one or two saved connections. Create connections with Run with your model first.'); } }).catch(() => { if (!closed) { stale = true; status.textContent = t('LoadError', 'Saved connections could not be verified. No requests were started. Close and reopen to try again.'); } }).finally(() => { loading = false; if (!closed) update(); });
        return { targets, review, send, close, prompt, status, overlay, checkSource };
    }
    root.LocalItabAIModelComparison = { open };
})(window);
