/* Optional model workbench. Credentials remain dialog-only; presets save metadata explicitly. */
(function (root) {
    'use strict';
    function open({ view, collectionStore, mode = 'run', presetStore = root.LocalItabAIModelPresets?.createStore({ chromeApi: root.chrome, locks: root.navigator?.locks }) }) {
        const refining = mode === 'refine', refinement = root.LocalItabAIPromptRefinement;
        const c = view.controller, preview = c.preview(), record = c.record(), session = c.session();
        if (view.openDialog || (refining ? !c.sessionReady() : !preview?.complete) || c.busy || c.pendingCommand || c.disposed) return;
        const t = (key, fallback) => view.t(`Model${key}`, fallback), el = (...args) => view.el(...args);
        const template = refining ? refinement.capture(c) : null;
        const source = { title: record.title, promptId: record.id, bodyVersionId: session.versionId };
        const overlay = el('div', 'prompt-dialog-overlay'), box = el('section', 'prompt-dialog ai-model-dialog');
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ai-model-title');
        const title = el('h2', '', refining ? t('RefineTitle', 'Refine saved prompt') : t('Title', 'Run with your model')); title.id = 'ai-model-title';
        const help = el('p', 'prompt-help', t('Help', 'Choose an OpenAI-compatible HTTPS endpoint. Only the reviewed prompt is sent, after you press Send. The provider may charge you. Your API key stays in this dialog only and is cleared after each request. Responses may repeat private input. Saving adds the response to local collections and unencrypted backups.'));
        if (refining) help.textContent = t('RefineHelp', 'Refine the current saved template, not the completed preview or a historical preview. Filled variable values are never included. Review the destination, instruction and exact outgoing text before sending. The provider may charge you. Credentials stay temporary. Nothing is saved until you accept the proposal as a new version.');
        const fields = el('div', 'ai-model-fields');
        function field(name, fallback, type, value = '') {
            const label = el('label', 'ai-model-field', t(name, fallback)), input = el(type === 'textarea' ? 'textarea' : 'input');
            if (type !== 'textarea') input.type = type;
            input.value = value; input.autocomplete = 'off'; input.spellcheck = false; label.append(input); fields.append(label); return input;
        }
        const url = field('Endpoint', 'Full endpoint URL', 'url'); url.placeholder = 'https://api.example.com/v1/chat/completions'; url.maxLength = 2048;
        const model = field('Name', 'Model ID', 'text'); model.maxLength = root.LocalItabAIModel.LIMITS.model;
        const presetName = field('PresetName', 'Connection preset name', 'text'); presetName.maxLength = 80;
        const key = field('Key', 'API key (optional; never saved)', 'password'); key.maxLength = root.LocalItabAIModel.LIMITS.key;
        const streaming = refining ? null : field('Stream', 'Show response as it arrives (optional)', 'checkbox');
        if (streaming) { streaming.checked = false; streaming.className = 'ai-model-stream-toggle'; }
        const instruction = refining ? field('RefineInstruction', 'Refinement instruction', 'textarea') : null;
        if (instruction) { instruction.maxLength = 4000; instruction.rows = 3; }
        const before = refining ? field('RefineBefore', 'Before: current saved template (no filled values)', 'textarea', template.body) : null;
        if (before) { before.readOnly = true; before.rows = 6; }
        const prompt = field('Prompt', 'Exact prompt to send', 'textarea', refining ? '' : preview.text); prompt.readOnly = true; prompt.rows = 6;
        const status = el('p', 'prompt-help'); status.tabIndex = -1; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const reviewText = el('pre', 'ai-model-review'); reviewText.hidden = true;
        const output = el('textarea', 'prompt-readonly'); output.readOnly = true; output.rows = 9; output.hidden = true; output.setAttribute('aria-label', refining ? t('RefineAfter', 'Proposed template draft (editable; not saved)') : t('Response', 'Model response'));
        const partialLabel = el('p', 'prompt-help', t('StreamPartial', 'Partial response only. It cannot be saved unless this request completes successfully.')); partialLabel.hidden = true;
        const proposalLabel = refining ? el('h3', '', t('RefineAfter', 'Proposed template draft (editable; not saved)')) : null;
        if (proposalLabel) proposalLabel.hidden = true;
        const originalDetails = refining ? el('details') : null;
        const originalOutput = refining ? el('textarea', 'prompt-readonly') : null;
        if (originalDetails) {
            originalDetails.hidden = true;
            const label = t('RefineModelOriginal', 'Original model response (read-only)');
            originalOutput.readOnly = true; originalOutput.rows = 6; originalOutput.setAttribute('aria-label', label);
            originalDetails.append(el('summary', '', label), originalOutput);
        }
        const presetLabel = el('label', 'ai-model-field', t('PresetLabel', 'Saved connections (this device only)'));
        const presetSelect = el('select'); presetLabel.append(presetSelect);
        const presetHelp = el('p', 'prompt-help', t('PresetHelp', 'Save only the name, endpoint and model ID. Never enter credentials in these fields. Presets stay on this device and are excluded from backups. Selecting one does not grant access or send anything.'));
        const presetActions = el('div', 'prompt-actions');
        let presets = [], selectedPreset = null, presetPending = Boolean(presetStore), presetAvailable = false;
        const actions = el('div', 'prompt-actions'), resultActions = el('div', 'prompt-actions');
        let reviewedStream = false, partialText = '', paintTimer = null, paintActive = null;
        let reviewed = null, response = null, aborter = null, busy = false, closed = false, saving = false, saved = false, permissionPending = false, suspended = false, command = null, cleanup, trialUI = null;
        const button = (name, fallback, action) => view.button(`Model${name}`, fallback, action);
        const failure = code => {
            const messages = {
                ENDPOINT: ['EndpointError', 'Use a full HTTPS /chat/completions URL without credentials, query or fragment.'],
                MODEL: ['NameError', 'Enter a model ID.'], PROMPT: ['PromptError', 'This prompt is empty or exceeds the model request limit.'], KEY: ['KeyError', 'The key contains unsupported characters or is too long.'],
                AUTH: ['AuthError', 'Authentication failed. Check the provider and key.'], RATE_LIMIT: ['RateError', 'The provider rate-limited this request. Nothing will retry automatically.'],
                PROVIDER: ['ProviderError', 'The provider rejected the request. Check its model support and service status.'],
                FORMAT: ['FormatError', 'The provider returned an unsupported response. Use a Chat Completions-compatible endpoint.'],
                LIMIT: ['LimitError', 'The response exceeded the safety limit and was discarded. Try a shorter request.'],
                EMPTY: ['EmptyError', 'The provider returned no text.'], INCOMPLETE: ['IncompleteError', 'The response was incomplete or filtered. Nothing was saved.'],
                TIMEOUT: ['TimeoutError', 'The request timed out after 60 seconds. The provider may still bill work already started.'],
                CANCELLED: ['Cancelled', 'Request stopped. The provider may still bill work already started.'],
                NETWORK: ['NetworkError', 'Could not reach this endpoint. Check the address, provider availability and browser access.'],
                PERMISSION: ['PermissionError', 'Endpoint access is not granted. Allow only this origin before sending.'],
                INSTRUCTION: ['RefineInstructionError', 'Enter a refinement instruction (up to 4,000 characters).'],
                PLACEHOLDERS: ['RefinePlaceholderError', 'The proposal changed variable placeholders or their counts. Edit the draft to restore the exact placeholders before testing or accepting.'],
                PROPOSAL: ['RefineProposalError', 'The proposal is empty or exceeds the saved prompt limit.'],
                UNCHANGED: ['RefineUnchanged', 'The proposal matches the saved template. No new version is needed.'],
                STALE: ['RefineStale', 'The saved source or workspace changed. Close and reopen refinement from the current saved prompt.'],
                HISTORY_LIMIT: ['RefineHistoryLimit', 'This prompt has reached its history limit. Nothing was changed. Copy the proposal manually if you want to keep it separately.'],
                CONFLICT: ['RefineStale', 'The saved source or workspace changed. Close and reopen refinement from the current saved prompt.'],
                SAVE: ['SaveError', 'Could not confirm the save. Your response remains here. Retry uses the same save operation.']
            }; const message = messages[code] || messages.SAVE; return t(...message);
        };
        function update(focused = view.doc.activeElement) {
            let valid = !refining;
            if (refining) {
                try { valid = Boolean(response && refinement.current(c, template) && refinement.validateProposal(template, response.text)); } catch (_) {}
                output.readOnly = !response || busy || saving || saved || suspended || Boolean(command) || Boolean(trialUI);
                // Labels follow confirmed acceptance, never merely a submitted write.
                const label = saved ? t('RefineAfterSaved', 'Accepted template (read-only; saved as a new version)')
                    : saving ? t('RefineAfterSaving', 'Submitted template (read-only; acceptance pending)')
                    : command ? t('RefineAfterUncertain', 'Submitted template (read-only; acceptance unconfirmed)')
                    : output.readOnly ? t('RefineAfterReadonly', 'Proposed template draft (read-only; not saved)')
                    : t('RefineAfter', 'Proposed template draft (editable; not saved)');
                proposalLabel.textContent = label; output.setAttribute('aria-label', label);
            }
            if (streaming) streaming.disabled = busy || saving || permissionPending || Boolean(response);
            if (trialButton) trialButton.disabled = busy || saving || saved || suspended || Boolean(command) || !valid;
            review.disabled = busy || saving || permissionPending || presetPending; allow.disabled = busy || saving || permissionPending || !reviewed; send.disabled = busy || saving || permissionPending || !reviewed || Boolean(response);
            if (instruction) instruction.disabled = busy || saving || Boolean(response);
            cancel.disabled = !busy; save.disabled = busy || saving || !response || saved || (refining && (suspended || (!valid && !command))); close.disabled = saving;
            url.disabled = model.disabled = key.disabled = busy || saving || presetPending || Boolean(response);
            presetSelect.disabled = presetName.disabled = presetSave.disabled = !presetAvailable || busy || saving || permissionPending || presetPending || Boolean(response);
            presetDelete.disabled = presetSelect.disabled || !selectedPreset;
            // Disabling or hiding the focused control blurs it to body in Chrome.
            // Keep this dialog's keyboard scope without stealing another live focus.
            if (!closed && !trialUI && !overlay.hidden && overlay.isConnected && overlay.contains(focused) &&
                (focused.disabled || focused.closest('[hidden], [inert]')) &&
                (view.doc.activeElement === focused || view.doc.activeElement === view.doc.body)) status.focus();
        }
        function sourceCurrent() {
            return c.sessionReady() && c.record()?.id === source.promptId && c.session() === session &&
                c.sessionSourceCurrent() && c.preview()?.text === preview.text;
        }
        function clearPaint() { if (paintTimer !== null) clearTimeout(paintTimer); paintTimer = null; }
        function paintPartial() {
            clearPaint();
            if (!paintActive?.()) return;
            if (!sourceCurrent()) { suspend(); return; }
            output.value = partialText; output.hidden = !partialText; partialLabel.hidden = !partialText;
        }
        function checkSource() { if (reviewedStream && !closed && !suspended && !sourceCurrent()) suspend(); }
        function invalidateConnection() { key.value = ''; reviewed = null; reviewText.hidden = true; status.textContent = ''; update(); }
        function renderPresets() {
            presetSelect.replaceChildren();
            const manual = el('option', '', t('PresetManual', 'New / unsaved connection')); manual.value = ''; presetSelect.append(manual);
            presets.forEach((item, index) => { const option = el('option', '', item.name); option.value = String(index); presetSelect.append(option); });
            presetSelect.value = selectedPreset ? String(presets.findIndex(item => item.name === selectedPreset.name)) : '';
        }
        const presetFailure = error => t(error?.code === 'CONFLICT' ? 'PresetConflict' : 'PresetError', error?.code === 'CONFLICT' ? 'This preset changed in another tab. Close and reopen this dialog before editing it.' : 'Could not save or load presets. Use a unique name, valid endpoint and model ID. No credentials are saved.');
        async function changePreset(removing) {
            if (closed || c.disposed || !presetAvailable || presetPending || busy || saving || permissionPending || response || (removing && !selectedPreset)) return;
            presetPending = true; invalidateConnection();
            try {
                const value = { name: presetName.value, url: url.value, model: model.value };
                const result = removing ? await presetStore.remove(selectedPreset) : await presetStore.save(value, selectedPreset);
                if (closed || c.disposed) return;
                presets = result.records; selectedPreset = removing ? null : presets.find(item => item.name === value.name.trim());
                if (removing) { presetName.value = ''; url.value = ''; model.value = ''; }
                else { presetName.value = selectedPreset.name; url.value = selectedPreset.url; model.value = selectedPreset.model; }
                renderPresets(); status.textContent = t(removing ? 'PresetDeleted' : 'PresetSaved', removing ? 'Connection preset deleted.' : 'Connection preset saved on this device. Review again before sending.');
            } catch (error) { if (!closed) status.textContent = presetFailure(error); }
            finally { presetPending = false; if (!closed) update(); }
        }
        const presetSave = button('PresetSave', 'Save connection preset', () => changePreset(false));
        const presetDelete = button('PresetDelete', 'Delete connection preset', () => changePreset(true));
        presetSelect.addEventListener('change', () => {
            if (presetSelect.disabled || closed || c.disposed) return;
            selectedPreset = presetSelect.value === '' ? null : presets[Number(presetSelect.value)];
            presetName.value = selectedPreset?.name || ''; url.value = selectedPreset?.url || ''; model.value = selectedPreset?.model || '';
            invalidateConnection();
        });
        renderPresets(); presetActions.append(presetSave, presetDelete);
        function cancellable(promise, signal) {
            return new Promise((resolve, reject) => {
                const cancel = () => { signal.removeEventListener('abort', cancel); reject({ code: 'CANCELLED' }); };
                signal.addEventListener('abort', cancel, { once: true });
                Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
                if (signal.aborted) cancel();
            });
        }
        function releaseRequest(request) {
            // Only the owning request can clear credentials or unlock the dialog.
            if (!request || aborter !== request) return;
            clearPaint(); paintActive = null; aborter = null; key.value = ''; busy = false;
            if (!closed) update();
        }
        function stopRequest() {
            const request = aborter;
            if (reviewedStream && request && !suspended && !closed) paintPartial();
            request?.abort(); releaseRequest(request);
        }
        function finish() {
            if (saving || closed || trialUI) return;
            if ((busy || (response && !saved)) && !root.confirm(t('Discard', 'Stop this request and discard any unsaved response?'))) return;
            closed = true; stopRequest(); key.value = ''; response = reviewed = command = null;
            root.removeEventListener('beforeunload', guard); root.removeEventListener('pagehide', hide);
            cleanup?.(); overlay.remove(); view.openDialog = false; view.cancelModelDialog = null; view.checkModelRun = null;
        }
        function guard(event) { if (busy || saving || (response && !saved)) { event.preventDefault(); event.returnValue = ''; } }
        function hide() { trialUI?.hide(); suspend(); }
        function suspend() {
            const focused = view.doc.activeElement;
            suspended = true; stopRequest(); key.value = ''; reviewed = null; reviewText.hidden = true;
            if (reviewedStream) { response = null; partialText = ''; output.value = ''; output.hidden = true; partialLabel.hidden = true; status.textContent = t('StreamStale', 'The prompt source changed or this dialog was interrupted. Review again before sending.'); }
            if (refining) { response = null; output.value = ''; output.hidden = true; proposalLabel.hidden = true; originalDetails.hidden = true; originalOutput.value = ''; }
            update(focused);
        }
        const review = button('Review', 'Review request', () => {
            if (c.disposed || busy || saving || permissionPending || presetPending) return;
            suspended = false;
            try {
                if (refining) { if (!refinement.current(c, template)) throw { code: 'STALE' }; prompt.value = refinement.request(template, instruction.value); }
                if (streaming?.checked && !sourceCurrent()) throw { code: 'STALE' };
                reviewedStream = Boolean(streaming?.checked);
                reviewed = root.LocalItabAIModel.review({ url: url.value, model: model.value, prompt: prompt.value });
                const modeLine = streaming ? `\n${reviewedStream ? t('StreamOn', 'Response mode: streaming') : t('StreamOff', 'Response mode: complete response')}` : '';
                reviewText.textContent = `${t('Destination', 'Destination')}: ${reviewed.url}\n${t('Name', 'Model ID')}: ${reviewed.model}${modeLine}\n\n${reviewed.prompt}`;
                reviewText.hidden = false; status.textContent = t('Reviewed', 'Review the full destination and content above. Allowing access alone does not send anything.');
            } catch (error) { reviewed = null; status.textContent = failure(error.code); } update();
        });
        const allow = button('Allow', 'Allow this endpoint', async () => {
            if (c.disposed || !reviewed || busy || saving || permissionPending || suspended) return;
            if (refining && !refinement.current(c, template)) { status.textContent = failure('STALE'); return; } const snapshot = reviewed;
            permissionPending = true; update();
            try {
                const granted = await root.chrome.permissions.request({ origins: [snapshot.permission] });
                if (!closed && !suspended && reviewed === snapshot) status.textContent = granted ? t('Allowed', 'Endpoint access allowed. Press Send only after reviewing the request. You can remove site access in Chrome’s extension settings.') : failure('PERMISSION');
            } catch (_) { if (!closed && !suspended && reviewed === snapshot) status.textContent = failure('PERMISSION'); }
            finally { permissionPending = false; if (!closed) update(); }
        });
        const send = button('Send', 'Send reviewed prompt', async () => {
            if (c.disposed || !reviewed || busy || saving || permissionPending || response || suspended) return;
            if (refining && !refinement.current(c, template)) { status.textContent = failure('STALE'); return; }
            if (reviewedStream && !sourceCurrent()) { suspend(); return; }
            if (reviewedStream) { saved = false; command = null; }
            partialText = ''; partialLabel.hidden = true; if (!refining) { output.value = ''; output.hidden = true; }
            busy = true; aborter = new AbortController(); const request = aborter, snapshot = reviewed, signal = request.signal, useStream = reviewedStream;
            const active = () => aborter === request && !c.disposed && !closed && !suspended && !signal.aborted; update(); cancel.focus();
            try {
                const permitted = await cancellable(root.chrome.permissions.contains({ origins: [snapshot.permission] }), signal);
                if (!active()) return;
                if (refining && !refinement.current(c, template)) throw { code: 'STALE' };
                if (useStream && !sourceCurrent()) { suspend(); return; }
                if (!permitted) throw { code: 'PERMISSION' };
                status.textContent = t('Running', 'Waiting for model response…');
                paintActive = active;
                const options = { key: key.value, signal };
                if (useStream) {
                    options.stream = true;
                    options.onText = text => {
                        if (!active()) return;
                        // Source validity is checked by the view hook and each coalesced paint.
                        partialText = text;
                        // Only this textarea is painted, at most ten times per second.
                        if (paintTimer === null) paintTimer = setTimeout(paintPartial, 100);
                    };
                }
                const result = await cancellable(root.LocalItabAIModel.run(snapshot, options), signal);
                if (!active()) return;
                if (useStream && !sourceCurrent()) { suspend(); return; }
                clearPaint(); partialLabel.hidden = true; partialText = '';
                response = result; output.value = result.text; output.hidden = false; if (proposalLabel) proposalLabel.hidden = false;
                if (refining) {
                    originalOutput.value = result.text; originalDetails.hidden = false;
                    refinement.validateProposal(template, result.text);
                    status.textContent = t('RefineReady', 'Edit this draft locally, then test or accept the exact edited text. Editing sends and saves nothing. Accept explicitly to create a new version; the saved original remains in history.');
                } else status.textContent = t('Ready', 'Response received. Review it, then explicitly save it to your AI collection.');
            } catch (error) {
                if (active()) {
                    if (useStream) paintPartial();
                    if (active()) status.textContent = useStream && error.code === 'LIMIT'
                        ? t('StreamLimit', 'The stream exceeded a safety limit. Any partial response is incomplete and cannot be saved.')
                        : failure(error.code || 'NETWORK');
                }
            }
            finally { releaseRequest(request); }
        });
        const cancel = button('Stop', 'Stop request', () => {
            if (closed || !busy) return;
            stopRequest(); status.textContent = failure('CANCELLED');
        });
        const save = button(refining ? 'RefineAccept' : 'Save', refining ? 'Accept as new prompt version' : 'Save response to AI collection', async () => {
            if (c.disposed || trialUI || busy || !response || saving || saved || closed || (refining && suspended)) return;
            if (reviewedStream && !sourceCurrent()) { suspend(); return; }
            saving = true; update();
            try {
                if (refining) {
                    refinement.validateProposal(template, response.text);
                    if (!command) command = refinement.operation(c, template, response.text);
                    else if (c.pendingCommand !== command && !refinement.current(c, template)) throw { code: 'STALE' };
                    if (!(await (c.pendingCommand === command ? c.retry() : c.execute(command)))) throw { code: c.error?.code || 'SAVE' };
                    saved = true; status.textContent = t('RefineSaved', 'Accepted as a new prompt version. The original template remains in history.');
                    return;
                }
                if (!collectionStore) throw { code: 'SAVE' };
                command ||= collectionStore.request('add', {
                    title: source.title, body: response.text, tool: response.model, sourceUrl: response.origin,
                    notes: t('SavedNote', 'Generated from a reviewed prompt. The link identifies the saved template version; filled variable values are not stored separately, but may appear in the response. The API key is not saved.'),
                    promptRef: { promptId: source.promptId, bodyVersionId: source.bodyVersionId }
                });
                await collectionStore.mutate(command, (raw, reference) => {
                    try { return root.LocalItabPrompts.validate(raw).records.some(item => item.id === reference.promptId && !item.deletedAt && item.history.some(version => version.id === reference.bodyVersionId)); } catch (_) { return false; }
                });
                saved = true; status.textContent = t('Saved', 'Saved to your AI collection, linked to this prompt version.');
            } catch (error) {
                if (refining && command && c.pendingCommand !== command) command = null;
                status.textContent = refining && command
                    ? t('RefineSaveUncertain', 'Could not confirm acceptance. The submitted draft is locked; retry accepts the exact same text using the same operation. Inspect history before leaving.')
                    : failure(refining ? (error.code || 'SAVE') : 'SAVE');
            }
            finally { saving = false; update(); }
        });
        const trialButton = refining && root.LocalItabAIModelComparison ? button('RefineTrial', 'Test original versus proposal', () => {
            if (trialButton.disabled || trialUI || closed || !response) return;
            const proposal = response.text, connection = { name: presetName.value || model.value, url: url.value, model: model.value }, chosenPreset = selectedPreset;
            const current = () => !closed && !suspended && !saved && response?.text === proposal && output.value === proposal && refinement.current(c, template) && url.value === connection.url && model.value === connection.model;
            if (!current()) return;
            // Suspend the parent focus scope, retaining the unsaved proposal for explicit acceptance only.
            cleanup?.(false); overlay.hidden = true; view.openDialog = false;
            const restore = () => {
                trialUI = null; if (closed) return;
                overlay.hidden = false; view.openDialog = true; view.cancelModelDialog = hide;
                cleanup = root.LocalItabDialog.open(overlay, trialButton, finish); update();
            };
            trialUI = root.LocalItabAIModelComparison.open({ view, trial: { source: template, proposal, current, onClose: restore, onInterrupt: suspend }, presetStore: { async read() {
                if (chosenPreset && presetStore) {
                    const latest = await presetStore.read();
                    if (!latest.records.some(item => item.name === chosenPreset.name && item.url === connection.url && item.model === connection.model)) return { records: [] };
                }
                return { records: [connection] };
            } } });
            if (!trialUI) restore(); else update();
        }) : null;
        const close = button('Close', 'Close', finish), collections = el('a', 'prompt-link', t('OpenCollection', 'Open AI collection')); collections.href = 'collections.html';
        collections.addEventListener('click', event => { if (busy || saving || (response && !saved)) { event.preventDefault(); status.textContent = t('SaveFirst', 'Save or close this response before leaving.'); } });
        if (refining) output.addEventListener('input', () => {
            if (closed || c.disposed || !response || busy || saving || saved || suspended || command || trialUI) {
                output.value = response?.text || ''; return;
            }
            response = { ...response, text: output.value };
            try {
                if (!refinement.current(c, template)) throw { code: 'STALE' };
                refinement.validateProposal(template, response.text);
                status.textContent = t('RefineEdited', 'Draft edited locally. Previous trial answers were discarded when the trial closed. Test again to compare this draft, or explicitly accept it. Nothing has been sent or saved.');
            } catch (error) { status.textContent = failure(error.code); }
            update();
        });
        if (streaming) streaming.addEventListener('change', () => { if (!streaming.disabled) invalidateConnection(); });
        if (instruction) instruction.addEventListener('input', () => { prompt.value = ''; invalidateConnection(); });
        for (const input of [url, model]) input.addEventListener('input', invalidateConnection);
        actions.append(review, allow, send, cancel); resultActions.append(save); if (trialButton) resultActions.append(trialButton); if (!refining) resultActions.append(collections); resultActions.append(close);
        box.append(title, help, presetLabel, presetHelp, fields, presetActions, reviewText, actions, status); if (proposalLabel) box.append(proposalLabel); box.append(partialLabel, output); if (originalDetails) box.append(originalDetails); box.append(resultActions); overlay.append(box); view.doc.body.append(overlay);
        view.openDialog = true; view.cancelModelDialog = hide; view.checkModelRun = checkSource; root.addEventListener('beforeunload', guard); root.addEventListener('pagehide', hide);
        cleanup = root.LocalItabDialog.open(overlay, url, finish); update();
        if (presetStore) Promise.resolve().then(() => presetStore.read()).then(state => {
            if (closed || c.disposed) return; presets = state.records; presetAvailable = true; renderPresets();
        }).catch(() => { if (!closed) status.textContent = t('PresetUnavailable', 'Saved connections are unavailable. You can still enter a connection manually.'); }).finally(() => { presetPending = false; if (!closed) update(); });
        return { streaming, partialLabel, originalOutput, trialButton, get trial() { return trialUI; }, instruction, before, reviewText, presetSelect, presetName, presetSave, presetDelete, url, model, key, prompt, review, allow, send, cancel, save, close, output, status, overlay };
    }
    root.LocalItabAIModelView = { open };
})(window);
