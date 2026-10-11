/* Optional model workbench. All fields live only in this dialog until explicit save. */
(function (root) {
    'use strict';
    function open({ view, collectionStore }) {
        const c = view.controller, preview = c.preview(), record = c.record(), session = c.session();
        if (view.openDialog || !preview?.complete || c.busy || c.pendingCommand || c.disposed) return;
        const t = (key, fallback) => view.t(`Model${key}`, fallback), el = (...args) => view.el(...args);
        const source = { title: record.title, promptId: record.id, bodyVersionId: session.versionId };
        const overlay = el('div', 'prompt-dialog-overlay'), box = el('section', 'prompt-dialog ai-model-dialog');
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'ai-model-title');
        const title = el('h2', '', t('Title', 'Run with your model')); title.id = 'ai-model-title';
        const help = el('p', 'prompt-help', t('Help', 'Choose an OpenAI-compatible HTTPS endpoint. Only the reviewed prompt is sent, after you press Send. The provider may charge you. Your API key stays in this dialog only and is cleared after each request. Responses may repeat private input. Saving adds the response to local collections and unencrypted backups.'));
        const fields = el('div', 'ai-model-fields');
        function field(name, fallback, type, value = '') {
            const label = el('label', 'ai-model-field', t(name, fallback)), input = el(type === 'textarea' ? 'textarea' : 'input');
            if (type !== 'textarea') input.type = type;
            input.value = value; input.autocomplete = 'off'; input.spellcheck = false; label.append(input); fields.append(label); return input;
        }
        const url = field('Endpoint', 'Full endpoint URL', 'url'); url.placeholder = 'https://api.example.com/v1/chat/completions'; url.maxLength = 2048;
        const model = field('Name', 'Model ID', 'text'); model.maxLength = root.LocalItabAIModel.LIMITS.model;
        const key = field('Key', 'API key (optional; never saved)', 'password'); key.maxLength = root.LocalItabAIModel.LIMITS.key;
        const prompt = field('Prompt', 'Exact prompt to send', 'textarea', preview.text); prompt.readOnly = true; prompt.rows = 6;
        const status = el('p', 'prompt-help'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const reviewText = el('pre', 'ai-model-review'); reviewText.hidden = true;
        const output = el('textarea', 'prompt-readonly'); output.readOnly = true; output.rows = 9; output.hidden = true; output.setAttribute('aria-label', t('Response', 'Model response'));
        const actions = el('div', 'prompt-actions'), resultActions = el('div', 'prompt-actions');
        let reviewed = null, response = null, aborter = null, busy = false, closed = false, saving = false, saved = false, permissionPending = false, suspended = false, command = null, cleanup;
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
                SAVE: ['SaveError', 'Could not confirm the save. Your response remains here. Retry uses the same save operation.']
            }; const message = messages[code] || messages.SAVE; return t(...message);
        };
        function update() {
            review.disabled = busy || saving || permissionPending; allow.disabled = busy || saving || permissionPending || !reviewed; send.disabled = busy || saving || permissionPending || !reviewed || Boolean(response);
            cancel.disabled = !busy; save.disabled = busy || saving || !response || saved; close.disabled = saving;
            url.disabled = model.disabled = key.disabled = busy || saving || Boolean(response);
        }
        function finish() {
            if (saving || closed) return;
            if ((busy || (response && !saved)) && !root.confirm(t('Discard', 'Stop this request and discard any unsaved response?'))) return;
            closed = true; aborter?.abort(); key.value = ''; response = reviewed = command = null;
            root.removeEventListener('beforeunload', guard); root.removeEventListener('pagehide', hide);
            cleanup?.(); overlay.remove(); view.openDialog = false; view.cancelModelDialog = null;
        }
        function guard(event) { if (busy || saving || (response && !saved)) { event.preventDefault(); event.returnValue = ''; } }
        function hide() { suspended = true; aborter?.abort(); key.value = ''; reviewed = null; reviewText.hidden = true; update(); }
        const review = button('Review', 'Review request', () => {
            if (c.disposed || busy || saving || permissionPending) return;
            suspended = false;
            try { reviewed = root.LocalItabAIModel.review({ url: url.value, model: model.value, prompt: prompt.value });
                reviewText.textContent = `${t('Destination', 'Destination')}: ${reviewed.url}\n${t('Name', 'Model ID')}: ${reviewed.model}\n\n${reviewed.prompt}`;
                reviewText.hidden = false; status.textContent = t('Reviewed', 'Review the full destination and content above. Allowing access alone does not send anything.');
            } catch (error) { reviewed = null; status.textContent = failure(error.code); } update();
        });
        const allow = button('Allow', 'Allow this endpoint', async () => {
            if (c.disposed || !reviewed || busy || saving || permissionPending || suspended) return; const snapshot = reviewed;
            permissionPending = true; update();
            try {
                const granted = await root.chrome.permissions.request({ origins: [snapshot.permission] });
                if (!closed && !suspended && reviewed === snapshot) status.textContent = granted ? t('Allowed', 'Endpoint access allowed. Press Send only after reviewing the request. You can remove site access in Chrome’s extension settings.') : failure('PERMISSION');
            } catch (_) { if (!closed && !suspended && reviewed === snapshot) status.textContent = failure('PERMISSION'); }
            finally { permissionPending = false; if (!closed) update(); }
        });
        const send = button('Send', 'Send reviewed prompt', async () => {
            if (c.disposed || !reviewed || busy || saving || permissionPending || response || suspended) return;
            busy = true; aborter = new AbortController(); const snapshot = reviewed, signal = aborter.signal; update(); cancel.focus();
            try {
                const permitted = await root.chrome.permissions.contains({ origins: [snapshot.permission] });
                if (c.disposed || closed || suspended || signal.aborted) return;
                if (!permitted) throw { code: 'PERMISSION' };
                status.textContent = t('Running', 'Waiting for model response…');
                const result = await root.LocalItabAIModel.run(snapshot, { key: key.value, signal });
                if (c.disposed || closed || suspended || signal.aborted) return;
                response = result; output.value = result.text; output.hidden = false;
                status.textContent = t('Ready', 'Response received. Review it, then explicitly save it to your AI collection.');
            } catch (error) { if (!closed && !suspended) status.textContent = failure(error.code || 'NETWORK'); }
            finally { key.value = ''; busy = false; if (!closed) update(); }
        });
        const cancel = button('Stop', 'Stop request', () => { aborter?.abort(); status.textContent = failure('CANCELLED'); });
        const save = button('Save', 'Save response to AI collection', async () => {
            if (c.disposed || !response || saving || saved || closed) return; saving = true; update();
            try {
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
            } catch (_) { status.textContent = failure('SAVE'); }
            finally { saving = false; update(); }
        });
        const close = button('Close', 'Close', finish), collections = el('a', 'prompt-link', t('OpenCollection', 'Open AI collection')); collections.href = 'collections.html';
        collections.addEventListener('click', event => { if (busy || saving || (response && !saved)) { event.preventDefault(); status.textContent = t('SaveFirst', 'Save or close this response before leaving.'); } });
        for (const input of [url, model]) input.addEventListener('input', () => { if (input === url) key.value = ''; reviewed = null; reviewText.hidden = true; status.textContent = ''; update(); });
        actions.append(review, allow, send, cancel); resultActions.append(save, collections, close);
        box.append(title, help, fields, reviewText, actions, status, output, resultActions); overlay.append(box); view.doc.body.append(overlay);
        view.openDialog = true; view.cancelModelDialog = hide; root.addEventListener('beforeunload', guard); root.addEventListener('pagehide', hide);
        cleanup = root.LocalItabDialog.open(overlay, url, finish); update();
        return { url, model, key, prompt, review, allow, send, cancel, save, close, output, status, overlay };
    }
    root.LocalItabAIModelView = { open };
})(window);
