/* Plain-text, opt-in context UI. No source is selected by default. */
(function (root) {
    'use strict';
    function mount(host, { controller, t = (_, fallback) => fallback, presetStore = root.LocalItabAIModelPresets?.createStore({ chromeApi: root.chrome, locks: root.navigator?.locks }) } = {}) {
        const doc = host.ownerDocument || root.document;
        const el = (tag, cls = '', value = '') => { const node = doc.createElement(tag); node.className = cls; node.textContent = value; return node; };
        const label = (key, fallback) => t(`aiContext${key}`, fallback);
        const button = (key, fallback, action) => { const node = el('button', '', label(key, fallback)); node.type = 'button'; node.addEventListener('click', action); return node; };
        const box = el('section', 'ai-context'), heading = el('h2', '', label('Title', 'Ask your saved context'));
        box.append(heading, el('p', '', label('Help', 'Choose saved excerpts, inspect the exact request, then send to your chosen model. Nothing is selected or sent automatically. Providers may charge. Keys stay in this panel and are cleared after a request or departure.')));
        const controls = [];
        function field(key, fallback, type = 'textarea') {
            const wrapper = el('label', 'ai-context-field', label(key, fallback)), input = el(type === 'textarea' ? 'textarea' : 'input');
            if (type !== 'textarea') input.type = type;
            input.autocomplete = 'off'; input.spellcheck = false; wrapper.append(input); box.append(wrapper); controls.push(input); return input;
        }
        const url = field('Endpoint', 'Full HTTPS endpoint URL', 'url'); url.maxLength = 2048;
        const model = field('Model', 'Model ID', 'text'); model.maxLength = 120;
        const presetName = field('PresetName', 'Connection preset name', 'text'); presetName.maxLength = 80;
        const key = field('Key', 'API key (optional; never saved)', 'password'); key.maxLength = 4096;
        const question = field('Question', 'Question or task extraction instruction'); question.maxLength = 4000; question.rows = 3;
        const modeLabel = el('label', 'ai-context-field', label('Mode', 'Output'));
        const mode = el('select');
        for (const [value, name, fallback] of [['answer', 'Answer', 'Answer'], ['tasks', 'Tasks', 'Draft tasks for review']]) { const option = el('option', '', label(name, fallback)); option.value = value; mode.append(option); }
        mode.value = 'answer'; modeLabel.append(mode); box.append(modeLabel); controls.push(mode);
        const presetText = (name, fallback) => t(`promptsModel${name}`, fallback);
        const presetLabel = el('label', 'ai-context-field', presetText('PresetLabel', 'Saved connections (this device only)'));
        const presetSelect = el('select'); presetLabel.append(presetSelect); box.append(presetLabel);
        box.append(el('p', '', presetText('PresetHelp', 'Save only the name, endpoint and model ID. Never enter credentials in these fields. Presets stay on this device and are excluded from backups. Selecting one does not grant access or send anything.')));
        const presetActions = el('div', 'ai-context-actions'); box.append(presetActions);
        let presets = [], selectedPreset = null, presetPending = false, presetAvailable = false;
        box.append(el('p', '', label('Scope', 'AI collections are global saved excerpts. The saved note belongs to this workspace. Unsaved notes, browser history and other workspaces are never included.')));
        const sourceList = el('div', 'ai-context-sources'); box.append(sourceList);
        const sourceRows = [], reviewText = el('pre', 'ai-context-review'); reviewText.hidden = true;
        const status = el('p', 'ai-context-status'); status.tabIndex = -1; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const outputLabel = el('label', 'ai-context-field', label('Response', 'Model response (unverified text; task JSON can be edited before review)'));
        const output = el('textarea'); output.rows = 8; output.maxLength = 32000; outputLabel.append(output); outputLabel.hidden = true;
        const answerTitle = field('SaveTitle', 'Title for saved answer', 'text'); answerTitle.maxLength = 200;
        const taskList = el('ol', 'ai-context-tasks'); taskList.hidden = true;
        let disposed = false, pending = false;
        const error = code => {
            const errors = { TASK_UNCERTAIN: ['UncertainTasks', 'The earlier task add may already be saved. Check Tasks before adding anything else. This panel keeps the original operation and will not create a new batch.'], TASK_FORMAT: ['TaskFormat', 'Use exactly {"tasks":["one task","another task"]}, with 1–50 single-line tasks and no extra fields.'], LIMIT: ['Limit', 'The input is empty, invalid, or too long. Use at most 12 excerpts, 16,000 characters per excerpt and 32,000 characters in the complete request.'], CONFLICT: ['Changed', 'The task list changed. Review the extracted tasks again before adding them.'], PERMISSION: ['Permission', 'Allow the reviewed endpoint before sending.'] };
            if (errors[code]) { status.textContent = label(...errors[code]); return; }
            status.textContent = label('Error', 'Could not complete this step. Check the input, endpoint access and current workspace. Nothing is saved without confirmation; an uncertain save can be retried with the same operation.'); };
        function update() {
            const focused = doc.activeElement, busy = pending || controller.busy || presetPending, retry = Boolean(controller.taskCommand || controller.saveCommand);
            for (const input of controls) input.disabled = busy || retry;
            for (const row of sourceRows) { row.check.disabled = row.input.disabled = busy || retry; }
            review.disabled = busy || retry; allow.disabled = send.disabled = busy || !controller.reviewed || Boolean(controller.result);
            stop.disabled = !controller.busy; save.disabled = busy || !controller.result || controller.saved || controller.result.mode !== 'answer';
            reviewTasks.disabled = busy || !controller.result || controller.result.mode !== 'tasks' || Boolean(controller.taskCommand);
            confirm.disabled = busy || !controller.taskReview; output.disabled = busy || retry; output.readOnly = controller.result?.mode !== 'tasks';
            reset.disabled = busy || retry;
            presetName.disabled = presetSelect.disabled = presetSave.disabled = !presetAvailable || busy || retry || Boolean(controller.result);
            presetDelete.disabled = presetSelect.disabled || !selectedPreset;
            if (focused?.disabled && box.contains(focused)) status.focus();
        }
        function invalidate() {
            try { controller.edit(); reviewText.hidden = outputLabel.hidden = taskList.hidden = true; status.textContent = ''; } catch (_) { error(); }
            update();
        }
        function renderPresets() {
            presetSelect.replaceChildren();
            const manual = el('option', '', presetText('PresetManual', 'New / unsaved connection')); manual.value = ''; presetSelect.append(manual);
            presets.forEach((item, index) => { const option = el('option', '', item.name); option.value = String(index); presetSelect.append(option); });
            presetSelect.value = selectedPreset ? String(presets.findIndex(item => item.name === selectedPreset.name)) : '';
        }
        async function changePreset(removing) {
            if (disposed || !presetAvailable || presetPending || pending || controller.busy || controller.result || controller.taskCommand || controller.saveCommand || (removing && !selectedPreset)) return;
            presetPending = true; key.value = ''; invalidate();
            try {
                const value = { name: presetName.value, url: url.value, model: model.value };
                const result = removing ? await presetStore.remove(selectedPreset) : await presetStore.save(value, selectedPreset);
                if (disposed) return;
                presets = result.records; selectedPreset = removing ? null : presets.find(item => item.name === value.name.trim());
                presetName.value = selectedPreset?.name || ''; url.value = selectedPreset?.url || ''; model.value = selectedPreset?.model || '';
                renderPresets(); status.textContent = presetText(removing ? 'PresetDeleted' : 'PresetSaved', removing ? 'Connection preset deleted.' : 'Connection preset saved on this device. Review again before sending.');
            } catch (reason) { if (!disposed) status.textContent = presetText(reason?.code === 'CONFLICT' ? 'PresetConflict' : 'PresetError', reason?.code === 'CONFLICT' ? 'This preset changed in another tab. Close and reopen this dialog before editing it.' : 'Could not save or load presets. Use a unique name, valid endpoint and model ID. No credentials are saved.'); }
            finally { presetPending = false; if (!disposed) update(); }
        }
        const presetSave = button('PresetSave', 'Save connection preset', () => changePreset(false));
        const presetDelete = button('PresetDelete', 'Delete connection preset', () => changePreset(true));
        presetActions.append(presetSave, presetDelete); renderPresets();
        presetSelect.addEventListener('change', () => {
            if (presetSelect.disabled || disposed) return;
            selectedPreset = presetSelect.value === '' ? null : presets[Number(presetSelect.value)];
            presetName.value = selectedPreset?.name || ''; url.value = selectedPreset?.url || ''; model.value = selectedPreset?.model || '';
            key.value = ''; invalidate();
        });
        async function action(fn, message) {
            if (disposed || pending || presetPending) return; pending = true; update();
            try { const operation = fn(); update(); await operation; if (!disposed) status.textContent = label(...message); }
            catch (reason) { if (!disposed) error(reason.code); }
            finally { pending = false; if (!disposed) update(); }
        }
        const review = button('Review', 'Review exact request', () => action(async () => {
            const selected = sourceRows.filter(row => row.check.checked).map(row => ({ ...row.source, text: row.input.value }));
            const result = await controller.review({ url: url.value, model: model.value, question: question.value, selected, mode: mode.value });
            reviewText.textContent = `${result.request.url}\n${result.request.model}\n\n${result.request.prompt}`; reviewText.hidden = false; outputLabel.hidden = taskList.hidden = true;
        }, ['Reviewed', 'Review the full destination, model and exact outgoing text. Source text is reference material, not trusted instructions.']));
        const allow = button('Allow', 'Allow this endpoint', () => {
            if (pending || disposed || !controller.reviewed) return;
            // Start permission request directly in user activation, before async UI work.
            let permission; try { permission = controller.allow(); } catch (_) { error(); return; }
            void action(async () => { if (!await permission) throw Error('Permission denied'); }, ['Allowed', 'Endpoint access allowed. This has not sent a request.']);
        });
        const send = button('Send', 'Send reviewed request', () => action(async () => {
            try { const result = await controller.send(key.value); if (!disposed) { output.value = result.text; outputLabel.hidden = false; answerTitle.value = question.value.slice(0, 200).replace(/[\uD800-\uDBFF]$/u, ''); } }
            finally { key.value = ''; }
        }, ['Received', 'Response received, not saved. Model claims and source citations have not been verified.']));
        const stop = button('Stop', 'Stop request', () => { controller.stop(); key.value = ''; status.textContent = label('Stopped', 'Stopped. The provider may still charge for work already started.'); });
        const save = button('Save', 'Save answer to AI collection', () => action(() => controller.saveAnswer(answerTitle.value), ['Saved', 'Saved to the existing global AI collection. Saved answers join unencrypted local backups.']));
        const reviewTasks = button('ReviewTasks', 'Review extracted tasks', () => action(async () => {
            const result = await controller.reviewTasks(); taskList.replaceChildren(...result.texts.map(value => el('li', '', value))); taskList.hidden = false;
            confirm.textContent = `${label('Confirm', 'Add these tasks')} (${result.count})`;
        }, ['TasksReviewed', 'Check every task above. Confirmation adds exactly this list to the current workspace. No task is executed.']));
        const confirm = button('Confirm', 'Add these tasks', () => action(async () => {
            await controller.confirmTasks(); taskList.hidden = true; outputLabel.hidden = true;
        }, ['TasksSaved', 'Reviewed tasks added to this workspace.']));
        const reset = button('Cancel', 'Cancel / clear draft', () => { if (pending || controller.busy) return; invalidate(); key.value = ''; output.value = ''; question.value = ''; answerTitle.value = '';
            for (const row of sourceRows) { row.check.checked = false; row.input.hidden = true; row.input.value = row.source.text; } });
        const actions = el('div', 'ai-context-actions'); actions.append(review, allow, send, stop, reset);
        const results = el('div', 'ai-context-actions'); results.append(save, reviewTasks, confirm);
        box.append(actions, reviewText, status, outputLabel, taskList, results); host.append(box);
        for (const input of [url, model, question, mode]) input.addEventListener(input === mode ? 'change' : 'input', () => { if (input === url || input === model) key.value = ''; invalidate(); });
        output.addEventListener('input', () => { try { controller.editResult(output.value); taskList.hidden = true; } catch (_) { error(); } update(); });
        const ready = action(async () => {
            const values = await controller.loadSources(); if (disposed) return;
            for (const source of values) {
                const row = el('label', 'ai-context-source'), check = el('input'); check.type = 'checkbox'; check.checked = false;
                const input = el('textarea'); input.value = source.text; input.maxLength = 16000; input.rows = 3; input.hidden = true;
                input.setAttribute('aria-label', `${label('Excerpt', 'Outgoing excerpt')}: ${source.label}`);
                row.append(check, el('span', '', `${source.scope === 'workspace' ? label('Workspace', 'Workspace note') : label('Global', 'Global collection')}: ${source.label}`), input);
                sourceRows.push({ source, check, input }); sourceList.append(row);
                check.addEventListener('change', () => { input.hidden = !check.checked; invalidate(); }); input.addEventListener('input', invalidate);
            }
        }, ['Choose', 'Select only the sources you want to send. You can edit or remove each selected excerpt.']);
        function guard(event) { if (controller.busy || controller.result || controller.taskCommand || controller.saveCommand) { event.preventDefault(); event.returnValue = ''; } }
        function destroy() { if (disposed) return; disposed = true; key.value = ''; controller.close(); root.removeEventListener('pagehide', destroy); root.removeEventListener('beforeunload', guard); box.remove(); }
        root.addEventListener('pagehide', destroy); root.addEventListener('beforeunload', guard);
        const presetsReady = presetStore ? Promise.resolve().then(() => presetStore.read()).then(state => {
            if (disposed) return; presets = state.records; presetAvailable = true; renderPresets();
        }).catch(() => { if (!disposed) status.textContent = presetText('PresetUnavailable', 'Saved connections are unavailable. You can still enter a connection manually.'); }).finally(() => { presetPending = false; if (!disposed) update(); }) : Promise.resolve();
        presetPending = Boolean(presetStore);
        update(); return { controller, ready: Promise.all([ready, presetsReady]), destroy, presetSelect, presetName, presetSave, presetDelete, hasUncommittedWork: () => Boolean(controller.busy || controller.result || controller.taskCommand || controller.saveCommand) };
    }
    root.LocalItabAIContextView = { mount };
})(typeof window === 'undefined' ? globalThis : window);
