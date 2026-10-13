/* Explicit two-target comparison. No credential persistence or automatic provider calls. */
(function (root) {
    'use strict';
    function open({ view, collectionStore, trial = null, presetStore = root.LocalItabAIModelPresets?.createStore({ chromeApi: root.chrome, locks: root.navigator?.locks }) }) {
        const c = view.controller, preview = c.preview(), record = c.record(), session = c.session();
        if (view.openDialog || (!trial && !preview?.complete) || !record || !session || c.disposed || c.busy || c.pendingCommand) return;
        if (trial) { try { root.LocalItabAIPromptRefinement.validateProposal(trial.source, trial.proposal); } catch (_) { return; } }
        const source = { promptId: record.id, bodyVersionId: session.versionId, title: record.title, version: record.version, epoch: c.excerptEpoch };
        const t = (key, fallback) => view.t(`Compare${key}`, fallback), el = (...args) => view.el(...args);
        const button = (key, fallback, action) => view.button(`Compare${key}`, fallback, action);
        const overlay = el('div', 'prompt-dialog-overlay'), box = el('section', 'prompt-dialog ai-model-dialog ai-compare-dialog');
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ai-compare-title');
        const title = el('h2', '', t('Title', 'Compare models')); title.id = 'ai-compare-title';
        if (trial) title.textContent = t('TrialTitle', 'Test original versus unsaved proposal');
        const help = el('p', 'prompt-help', t('Help', 'Select up to two saved connections. Review the same completed prompt for each target, then explicitly Send. This makes up to two provider requests; each provider may charge you. Keys are temporary and separate for each target. No automatic retries.'));
        if (trial) help.textContent = t('TrialHelp', 'Enter temporary test values once for both templates. Review both completed requests to the same model, then explicitly Send. Up to two additional provider requests may each cost money. Answers are temporary, unscored and never saved. Accepting the proposal is a separate action after closing this trial.');
        const prompt = el('textarea', 'prompt-readonly'); prompt.value = trial ? trial.source.body : preview.text; prompt.readOnly = true; prompt.rows = 6; prompt.setAttribute('aria-label', trial ? t('TrialTemplate', 'Original saved template before test values') : t('Prompt', 'Same completed prompt for all targets'));
        const status = el('p', 'prompt-help'); status.tabIndex = -1; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const grid = el('div', 'ai-compare-grid'), actions = el('div', 'prompt-actions');
        let closed = false, stale = false, loading = true, sending = false, batch = null, presets = [], generation = 0, cleanup, reviewedValues = null;
        const targets = [], variables = [];
        function refreshCopyState() { targets.forEach(target => target.answerReader?.refreshCopyState()); }
        const variableFields = el('div', 'ai-model-fields');
        if (trial) for (const name of root.LocalItabPrompts.previewTemplate(trial.source.body).variables) {
            const label = el('label', 'ai-model-field', `${t('TrialValue', 'Temporary test value')}: ${name}`), input = el('textarea');
            input.maxLength = root.LocalItabPrompts.LIMITS.value; input.autocomplete = 'off'; label.append(input); variableFields.append(label); variables.push({ name, input });
            input.addEventListener('input', () => { if (!input.disabled && checkSource()) invalidate(t('TrialChanged', 'Test values changed. Review both completed requests again.')); });
        }
        const sourceCurrent = () => trial ? Boolean(!c.disposed && !c.busy && !c.pendingCommand && trial.current()) : !c.disposed && !c.busy && !c.pendingCommand && c.excerptEpoch === source.epoch && c.record()?.id === source.promptId && c.record()?.version === source.version && !c.record()?.deletedAt && c.session() === session && session.versionId === source.bodyVersionId && c.preview()?.complete && c.preview().text === preview.text;
        const saving = () => targets.some(target => target.saving);
        function update(focused = view.doc.activeElement) {
            const locked = closed || stale || loading || sending || saving() || targets.some(target => target.permissionPending);
            variables.forEach(({ input }) => { input.disabled = locked; });
            review.disabled = locked || targets.some(target => target.attempted);
            send.disabled = locked || !batch || targets.some(target => target.attempted);
            close.disabled = saving();
            for (const target of targets) {
                target.select.disabled = Boolean(trial) || locked || targets.some(item => item.attempted);
                target.key.disabled = Boolean(trial && target !== targets[0]) || locked || !target.reviewed || (target.attempted && !target.retryReady);
                target.allow.disabled = Boolean(trial && target !== targets[0]) || locked || !target.reviewed || (target.attempted && !target.retryReady);
                target.retryReview.hidden = target.retrySend.hidden = Boolean(trial) || !target.attempted || Boolean(target.response);
                target.retryReview.disabled = Boolean(trial) || locked || !target.attempted || Boolean(target.response);
                target.retrySend.disabled = Boolean(trial) || locked || !target.retryReady || Boolean(target.response);
                target.stop.disabled = !target.running;
                target.save.disabled = Boolean(trial) || closed || stale || sending || saving() || !target.response || target.saved;
            }
            refreshCopyState();
            // Disabling or hiding the focused control blurs it to body in Chrome.
            // Keep this dialog's keyboard scope without stealing another live focus.
            if (!closed && !overlay.hidden && overlay.isConnected && overlay.contains(focused) &&
                (focused.disabled || focused.closest('[hidden], [inert]')) &&
                (view.doc.activeElement === focused || view.doc.activeElement === view.doc.body)) status.focus();
        }
        function releaseReader(target) {
            target.answerReader?.destroy(); target.answerReader = null; target.readerHost.hidden = true;
            target.output.hidden = !target.output.value;
        }
        function readResponse(target) {
            releaseReader(target);
            if (view.doc.hidden || !root.LocalItabSafeAnswerReader) return;
            const snapshot = target.response, token = generation;
            let reader;
            const current = () => !closed && !stale && !view.destroyed && !view.doc.hidden &&
                !overlay.hidden && overlay.isConnected && !overlay.closest('[hidden], [inert]') &&
                !target.readerHost.hidden && target.readerHost.isConnected && target.answerReader === reader &&
                target.response === snapshot && token === generation && sourceCurrent() &&
                (!trial || reviewedValues === JSON.stringify(variables.map(({ input }) => input.value)));
            reader = root.LocalItabSafeAnswerReader.create(view.doc, snapshot.text, (name, fallback) => {
                const key = `answerReader${name}`, value = root.i18n?.t(key);
                return value && value !== key ? value : fallback;
            }, {
                canCopy: () => !view.copying && current(),
                async copy(text, copyTarget) {
                    const valid = () => current() && copyTarget.current();
                    if (view.copying || !valid()) return false;
                    // Both columns and later dialogs share the view's real
                    // clipboard lifetime, including when this reader disappears.
                    view.copying = true; refreshCopyState(); view.updateCopyEligibility?.();
                    try {
                        const clipboard = view.clipboard ?? root.navigator?.clipboard;
                        if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
                        await clipboard.writeText(text);
                        if (!valid()) return false;
                        copyTarget.status.textContent = copyTarget.copied; return true;
                    } catch (_) {
                        if (valid()) copyTarget.status.textContent = copyTarget.blocked;
                        return false;
                    } finally {
                        view.copying = false; view.refreshModelCopy?.(); view.updateCopyEligibility?.();
                    }
                }
            });
            target.answerReader = reader;
            target.answerReader.node.setAttribute('aria-label', target.output.getAttribute('aria-label'));
            target.readerHost.append(target.answerReader.node); target.readerHost.hidden = false; target.output.hidden = true;
        }
        function visibilityChanged() { if (view.doc.hidden) targets.forEach(releaseReader); }
        function invalidate(message, permanent = false) {
            const focused = view.doc.activeElement;
            generation++; batch = null; reviewedValues = null; stale ||= permanent;
            for (const target of targets) { releaseReader(target); target.retryReady = false; if (!trial && !permanent) target.heading.textContent = `${t('Target', 'Target')} ${targets.indexOf(target) + 1}`; if (trial) { target.response = null; target.output.value = ''; target.output.hidden = true; target.attempted = false; target.message.textContent = ''; target.reviewText.textContent = ''; } target.aborter?.abort(); target.key.value = ''; target.reviewed = null; target.reviewText.hidden = true; }
            if (message) status.textContent = message;
            update(focused);
        }
        function checkSource() {
            if (closed) return false;
            if (trial && reviewedValues !== null && reviewedValues !== JSON.stringify(variables.map(({ input }) => input.value))) invalidate(t('TrialChanged', 'Test values changed. Review both completed requests again.'), sending);
            if (!closed && !stale && !sourceCurrent()) {
                trial?.onInterrupt?.();
                invalidate(t('SourceChanged', 'The prompt or source changed. Close and reopen comparison to review the current prompt. No more requests or saves can start here.'), true);
            }
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
            if (trial) heading.textContent = index === 0 ? t('TrialOriginal', 'Original saved template answer') : t('TrialProposal', 'Unsaved proposal answer');
            const selectLabel = el('label', 'ai-model-field', t('Connection', 'Saved connection')), select = el('select'); selectLabel.append(select);
            if (trial) selectLabel.hidden = true;
            const keyLabel = el('label', 'ai-model-field', trial ? t('TrialKey', 'API key for both trial requests (optional; never saved)') : t('Key', 'API key for this target only (optional; never saved)')), key = el('input'); key.type = 'password'; key.autocomplete = 'off'; key.maxLength = root.LocalItabAIModel.LIMITS.key; keyLabel.append(key);
            if (trial) keyLabel.hidden = index === 1;
            const reviewText = el('pre', 'ai-model-review'); reviewText.hidden = true;
            const output = el('textarea', 'prompt-readonly'); output.readOnly = true; output.rows = 10; output.hidden = true; output.setAttribute('aria-label', `${t('Response', 'Model response')} ${index + 1}`);
            const readerHost = el('div'); readerHost.hidden = true;
            const message = el('p', 'prompt-help'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
            const target = { readerHost, answerReader: null, select, key, reviewText, output, message, heading, reviewed: null, response: null, running: false, attempted: false, saving: false, saved: false, uncertain: false, permissionPending: false, command: null, retryReady: false, snapshot: null };
            target.allow = button('Allow', 'Allow this endpoint', async () => {
                if (!checkSource() || target.allow.disabled || !target.reviewed) return;
                const snapshot = target.reviewed, token = generation; target.permissionPending = true; update();
                try {
                    const granted = await root.chrome.permissions.request({ origins: [snapshot.permission] });
                    if (active(token) && target.reviewed === snapshot) message.textContent = granted ? t('Allowed', 'Access allowed. Only Send starts requests.') : failure('PERMISSION');
                } catch (_) { if (active(token)) message.textContent = failure('PERMISSION'); }
                finally { target.permissionPending = false; if (!closed) update(); }
            });
            target.retryReview = button('RetryReview', 'Review retry for this failed target', () => {
                if (trial || !checkSource() || target.retryReview.disabled || !target.snapshot) return;
                target.key.value = ''; target.retryReady = false;
                try {
                    const { preset } = target.snapshot;
                    const request = root.LocalItabAIModel.review({ url: preset.url, model: preset.model, prompt: preview.text });
                    target.snapshot = { target, preset, request }; target.reviewed = request;
                    target.reviewText.textContent = `${t('Endpoint', 'Full endpoint URL')}: ${request.url}\n${t('Model', 'Model ID')}: ${request.model}\n\n${request.prompt}`;
                    target.reviewText.hidden = false; target.retryReady = true;
                    target.message.textContent = t('RetryCost', 'Review this exact endpoint, model and prompt. Enter a fresh temporary key if needed. Send retry makes one additional request that may cost money, even if the earlier attempt was stopped. The other target is not sent again. Allowing access sends nothing.');
                } catch (_) { invalidate(t('ProfileChanged', 'A selected connection changed or was deleted. Close and reopen to load it, then review again.'), true); }
                update();
            });
            target.retrySend = button('RetrySend', 'Send reviewed retry (1 additional request)', () => {
                if (trial || !checkSource() || target.retrySend.disabled || !target.snapshot) return;
                execute([target.snapshot]);
            });
            target.retryReview.hidden = target.retrySend.hidden = Boolean(trial);
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
                    if (target.uncertain) {
                        const checked = await collectionStore.inspectOperation(target.command);
                        if (!checked.committed) throw new Error('UNCONFIRMED');
                    } else await collectionStore.mutate(target.command, (raw, reference) => {
                        if (!sourceCurrent() || stale || closed) return false;
                        try { return root.LocalItabPrompts.validate(raw).records.some(item => item.id === reference.promptId && !item.deletedAt && item.history.some(version => version.id === reference.bodyVersionId)); } catch (_) { return false; }
                    });
                    target.saved = true; message.textContent = t('Saved', 'Saved and linked to the original prompt version.');
                } catch (_) {
                    target.uncertain = true;
                    target.save.textContent = t('CheckSave', 'Check whether this result was saved');
                    message.textContent = t('SaveUnconfirmed', 'Save is unconfirmed. Check performs a read-only lookup of this exact operation; it never writes again. Missing, expired or restored-away evidence cannot confirm success. Keep this result until you have checked your collection.');
                }
                finally { target.saving = false; if (!closed) update(); }
            });
            if (trial) { target.save.hidden = true; target.allow.hidden = index === 1; output.setAttribute('aria-label', index === 0 ? t('TrialOriginal', 'Original saved template answer') : t('TrialProposal', 'Unsaved proposal answer')); }
            select.addEventListener('change', () => { if (!select.disabled && checkSource()) invalidate(t('ReviewAgain', 'Connections changed. Review both targets again before sending.')); });
            const buttons = el('div', 'prompt-actions'); buttons.append(target.allow, target.stop, target.save, target.retryReview, target.retrySend);
            panel.append(heading, selectLabel, keyLabel, reviewText, buttons, message, output, readerHost); grid.append(panel); targets.push(target);
        }
        const review = button('Review', 'Review comparison requests', () => {
            if (!checkSource() || review.disabled) return;
            invalidate();
            try {
                const selected = targets.filter(target => target.select.value !== '');
                if (!selected.length) { status.textContent = t('Select', 'Select one or two saved connections. Create connections with Run with your model first.'); return; }
                const seen = new Set();
                const values = Object.fromEntries(variables.filter(({ input }) => input.value !== '').map(({ name, input }) => [name, input.value]));
                if (trial) root.LocalItabAIPromptRefinement.validateProposal(trial.source, trial.proposal);
                const reviewed = selected.map(target => {
                    const preset = presets[Number(target.select.value)];
                    if (!preset) throw new Error('TARGET');
                    const request = root.LocalItabAIModel.review({ url: preset.url, model: preset.model, prompt: trial ? root.LocalItabPrompts.renderTemplate(targets.indexOf(target) === 0 ? trial.source.body : trial.proposal, values) : preview.text });
                    const identity = JSON.stringify([request.url, request.model]);
                    if (!trial && seen.has(identity)) throw new Error('DUPLICATE'); seen.add(identity);
                    return { target, request, preset };
                });
                if (trial && (reviewed.length !== 2 || reviewed[0].request.url !== reviewed[1].request.url || reviewed[0].request.model !== reviewed[1].request.model)) throw new Error('TRIAL_TARGET');
                batch = reviewed;
                if (trial) reviewedValues = JSON.stringify(variables.map(({ input }) => input.value));
                for (const { target, request, preset } of reviewed) {
                    target.reviewed = request; target.snapshot = { target, request, preset };
                    target.heading.textContent = trial ? (targets.indexOf(target) === 0 ? t('TrialOriginal', 'Original saved template answer') : t('TrialProposal', 'Unsaved proposal answer')) : `${t('Target', 'Target')} ${targets.indexOf(target) + 1}: ${preset.name}`;
                    target.reviewText.textContent = `${t('Endpoint', 'Full endpoint URL')}: ${request.url}\n${t('Model', 'Model ID')}: ${request.model}\n\n${request.prompt}`;
                    target.reviewText.hidden = false;
                }
                status.textContent = `${t('Count', 'Maximum provider requests')}: ${reviewed.length}. ${trial ? t('TrialCost', 'Both requests use the same model and test values. Each request may cost money. Review both exact completed prompts and their destination above. Nothing is accepted or saved.') : t('Cost', 'Each target may charge separately. Review every endpoint, model and identical prompt above. Allowing access sends nothing.')}`;
            } catch (_) { batch = null; targets.forEach(target => { target.reviewed = null; target.reviewText.hidden = true; }); status.textContent = trial ? t('TrialInvalid', 'Enter every test value and use a proposal with exactly matching placeholders. Both requests must fit the request limit.') : t('Duplicate', 'Choose valid, distinct endpoint and model combinations. Duplicate targets are not sent.'); }
            update();
        });
        const send = button('Send', 'Send reviewed comparison (up to 2 requests)', () => {
            if (!checkSource() || send.disabled || !batch) return;
            execute(batch.slice());
        });
        // Abort settles the UI even if a transport/permission callback never completes.
        // The losing promise remains observed and can never publish a late result.
        function cancellable(promise, signal) {
            return new Promise((resolve, reject) => {
                const cancel = () => { signal.removeEventListener('abort', cancel); reject({ code: 'CANCELLED' }); };
                signal.addEventListener('abort', cancel, { once: true });
                Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
                if (signal.aborted) cancel();
            });
        }
        async function execute(snapshots) {
            sending = true; const token = generation; update();
            // Re-read saved metadata immediately before sending. External edits require a new review.
            try {
                const current = await presetStore.read();
                if (!active(token)) return;
                if (snapshots.some(({ preset }) => !current.records.some(item => item.name === preset.name && item.url === preset.url && item.model === preset.model))) {
                    invalidate(t('ProfileChanged', 'A selected connection changed or was deleted. Close and reopen to load it, then review again.'), true); return;
                }
                const trialSecret = trial ? targets[0].key.value : '';
                if (trial) targets[0].key.value = '';
                await Promise.all(snapshots.map(async ({ target, request }) => {
                    if (!active(token)) return;
                    releaseReader(target); target.retryReady = false; target.attempted = true; target.running = true; target.aborter = new AbortController(); const signal = target.aborter.signal;
                    const secret = trial ? trialSecret : target.key.value; target.key.value = ''; update();
                    try {
                        const permitted = await cancellable(root.chrome.permissions.contains({ origins: [request.permission] }), signal);
                        if (!active(token) || signal.aborted) return;
                        if (!permitted) throw { code: 'PERMISSION' };
                        target.message.textContent = t('Running', 'Waiting for this model…');
                        const result = await cancellable(root.LocalItabAIModel.run(request, { key: secret, signal }), signal);
                        if (!active(token) || signal.aborted) return;
                        target.response = result; target.output.value = result.text; target.output.hidden = false; readResponse(target);
                        target.message.textContent = trial ? t('TrialReady', 'Temporary test answer. No score or automatic acceptance. Close the trial to decide whether to accept the proposal separately.') : t('Ready', 'Review this result. Save only if you want it in local collections and unencrypted backups.');
                    } catch (error) { if (active(token) && !signal.aborted) target.message.textContent = failure(error.code); }
                    finally { target.key.value = ''; target.running = false; if (!closed) update(); }
                }));
            } catch (_) { if (active(token)) invalidate(t('LoadError', 'Saved connections could not be verified. No requests were started. Close and reopen to try again.'), true); }
            finally { sending = false; targets.forEach(target => { target.key.value = ''; }); if (!closed) update(); }
        }
        function guard(event) { if (sending || saving() || targets.some(target => target.response && !target.saved)) { event.preventDefault(); event.returnValue = ''; } }
        function hide() { if (!closed) { trial?.onInterrupt?.(); invalidate(t('Interrupted', 'Comparison interrupted. Close and reopen before starting more work.'), true); } }
        function storageChanged(changes, area) {
            if (area !== 'local' || closed) return;
            if (Object.keys(changes).some(key => key.startsWith('__localItabWorkspace') || key === (root.LocalItabWorkspaces?.RESTORE_TRANSACTION_KEY || '__localItabCombinedRestoreV1'))) hide();
            else if (Object.hasOwn(changes, root.LocalItabAIModelPresets?.KEY || '__localItabAIModelPresetsV1')) invalidate(t('ProfileChanged', 'A selected connection changed or was deleted. Close and reopen to load it, then review again.'), true);
        }
        function finish() {
            if (closed || saving()) return;
            if ((sending || targets.some(target => target.response && !target.saved)) && !root.confirm(t('Discard', 'Stop pending requests and discard unsaved comparison results?'))) return;
            closed = true; generation++;
            targets.forEach(target => { releaseReader(target); target.aborter?.abort(); target.key.value = ''; target.response = target.reviewed = target.command = target.snapshot = null; target.output.value = ''; if (trial) target.reviewText.textContent = ''; });
            batch = null; reviewedValues = null;
            root.removeEventListener('beforeunload', guard); root.removeEventListener('pagehide', hide); view.doc.removeEventListener('visibilitychange', visibilityChanged); root.chrome?.storage?.onChanged?.removeListener(storageChanged);
            cleanup?.(); overlay.remove(); view.openDialog = false; view.checkModelComparison = null; view.cancelModelDialog = null;
            if (view.refreshModelCopy === refreshCopyState) view.refreshModelCopy = null;
            variables.forEach(({ input }) => { input.value = ''; });
            trial?.onClose();
        }
        const close = button('Close', 'Close', finish);
        actions.append(review, send, close); box.append(title, help, prompt, variableFields, grid, actions, status); overlay.append(box); view.doc.body.append(overlay);
        view.openDialog = true; view.checkModelComparison = checkSource; view.cancelModelDialog = hide;
        view.refreshModelCopy = refreshCopyState;
        root.addEventListener('beforeunload', guard); root.addEventListener('pagehide', hide); view.doc.addEventListener('visibilitychange', visibilityChanged); root.chrome?.storage?.onChanged?.addListener(storageChanged);
        cleanup = root.LocalItabDialog.open(overlay, trial ? close : targets[0].select, finish);
        function renderPresets() {
            targets.forEach(target => {
                const empty = el('option', '', t('None', 'Do not send to this target')); empty.value = ''; target.select.replaceChildren(empty);
                presets.forEach((preset, index) => { const option = el('option', '', `${preset.name} · ${preset.model}`); option.value = String(index); target.select.append(option); }); target.select.value = trial && presets.length ? '0' : '';
            });
        }
        renderPresets(); update();
        Promise.resolve().then(() => presetStore.read()).then(state => { if (!closed) { presets = state.records; renderPresets(); status.textContent = trial ? t('TrialStart', 'Fill temporary values and review both requests. No trial request has been sent.') : t('Select', 'Select one or two saved connections. Create connections with Run with your model first.'); } }).catch(() => { if (!closed) { stale = true; status.textContent = t('LoadError', 'Saved connections could not be verified. No requests were started. Close and reopen to try again.'); } }).finally(() => { loading = false; if (!closed) update(); });
        return { targets, review, send, close, prompt, status, overlay, checkSource, variables, hide };
    }
    root.LocalItabAIModelComparison = { open };
})(window);
