/* Plain-text, opt-in context UI. No source is selected by default. */
(function (root) {
    'use strict';
    function mount(host, { controller, t = (_, fallback) => fallback, clipboard = root.navigator?.clipboard, presetStore = root.LocalItabAIModelPresets?.createStore({ chromeApi: root.chrome, locks: root.navigator?.locks }) } = {}) {
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
        const searchLabel = el('label', 'ai-context-field', label('SourceSearch', 'Search loaded source titles'));
        const sourceSearch = el('input', 'ai-context-source-search'); sourceSearch.type = 'search';
        sourceSearch.autocomplete = 'off'; sourceSearch.spellcheck = false; searchLabel.append(sourceSearch);
        const scopeLabel = el('label', 'ai-context-field', label('SourceScope', 'Filter loaded source scope'));
        const sourceScope = el('select', 'ai-context-source-scope');
        for (const [value, name, fallback] of [['all', 'SourceScopeAll', 'All sources'], ['workspace', 'SourceScopeWorkspace', 'Current workspace note'], ['library', 'SourceScopeLibrary', 'Global collection']]) {
            const option = el('option', '', label(name, fallback)); option.value = value; sourceScope.append(option);
        }
        sourceScope.value = 'all'; scopeLabel.append(sourceScope);
        const scopeHelp = el('p', 'ai-context-source-scope-help', label('SourceScopeHelp', 'Filters only sources already loaded in this panel, together with title search and selected-only view. This does not load other workspaces or change what is selected for sending.'));
        scopeHelp.id = 'ai-context-source-scope-help'; sourceScope.setAttribute('aria-describedby', scopeHelp.id);
        const searchActions = el('div', 'ai-context-actions');
        const clearSearch = button('SourceSearchClear', 'Clear title search', () => { sourceSearch.value = ''; sourceSearch.focus(); filterSources(); });
        let selectedOnly = false;
        const showSelected = button('SourceSelectedOnly', 'Show selected only', () => { selectedOnly = !selectedOnly; filterSources(); });
        showSelected.className = 'ai-context-selected-only'; showSelected.setAttribute('aria-pressed', 'false');
        searchActions.append(clearSearch, showSelected);
        const batchActions = el('div', 'ai-context-actions');
        const selectVisible = button('SourceSelectVisible', 'Select visible unselected sources', () => changeSelection(false));
        const clearSelection = button('SourceClearSelection', 'Clear all selections', () => changeSelection(true));
        batchActions.append(selectVisible, clearSelection);
        const batchHelp = el('p', 'ai-context-source-batch-help'); batchHelp.id = 'ai-context-source-batch-help';
        selectVisible.setAttribute('aria-describedby', batchHelp.id); clearSelection.setAttribute('aria-describedby', batchHelp.id);
        const searchCount = el('p', 'ai-context-source-count'); searchCount.setAttribute('role', 'status'); searchCount.setAttribute('aria-live', 'polite');
        const searchEmpty = el('p', 'ai-context-source-empty', label('SourceSearchEmpty', 'No loaded source titles match. Clear the search to show all loaded sources.'));
        searchEmpty.hidden = true;
        box.append(searchLabel, scopeLabel, scopeHelp, searchActions, searchCount, el('p', 'ai-context-source-search-help', label('SourceSearchHelp', 'Searches only loaded titles in this panel. Hidden selections stay selected and are still included in review and sending.')), searchEmpty, batchActions, batchHelp);
        const sourceList = el('div', 'ai-context-sources'); box.append(sourceList);
        const budget = el('p', 'ai-context-budget'); budget.setAttribute('role', 'status'); budget.setAttribute('aria-live', 'polite');
        box.append(budget, el('p', 'ai-context-budget-help', label('BudgetHelp', 'Local character limits use UTF-16; some emoji count as 2. These are not token, cost or provider quotas. The total includes instructions, labels and JSON escaping. No automatic shortening or deselection.')));
        const sourceRows = [], reviewText = el('pre', 'ai-context-review'); reviewText.hidden = true;
        const status = el('p', 'ai-context-status'); status.tabIndex = -1; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const outputLabel = el('label', 'ai-context-field', label('Response', 'Model response (unverified text; task JSON can be edited before review)'));
        const previousResult = el('p', 'ai-context-previous-result', label('PreviousResult', 'This response belongs to the previous reviewed request. Saving or adding tasks uses that response and its original request, not the edited draft.')); previousResult.hidden = true;
        const output = el('textarea'); output.rows = 8; output.maxLength = 32000; outputLabel.append(output); outputLabel.hidden = true;
        const answerTitle = field('SaveTitle', 'Title for saved answer', 'text'); answerTitle.maxLength = 200;
        const contextSave = el('section', 'ai-context-save-context'); contextSave.hidden = true;
        const contextLabel = el('label'), includeContext = el('input'); includeContext.type = 'checkbox'; includeContext.checked = false;
        contextLabel.append(includeContext, el('span', '', label('SaveContext', 'Also save this exact question and reviewed source excerpts')));
        const contextPreview = el('pre', 'ai-context-review'); contextPreview.hidden = true;
        contextSave.append(contextLabel, el('p', '', label('SaveContextPrivacy', 'Optional, off by default. The exact question, edited excerpts, source IDs and labels, full reviewed prompt, endpoint and model below will join the global AI collection and unencrypted backups. Check for private information or secrets in the text before saving. API-key fields and authentication headers are never included. Removing source URLs from a backup does not remove this snapshot.')), contextPreview);
        const taskList = el('ol', 'ai-context-tasks'); taskList.hidden = true;
        const initialAnswerTitle = answerTitle.value;
        let disposed = false, pending = false, titleEdited = false, copying = false, copyGeneration = 0;
        const copyStatus = el('p', 'ai-context-copy-status'); copyStatus.tabIndex = -1; copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
        const error = code => {
            if (controller.saveCommand && controller.saveUncertain) {
                status.textContent = label('UncertainAnswer', 'The earlier answer save may already be in the global collection. Check it before starting another save. This panel keeps the original operation and snapshot choice for retry; it will not add a duplicate.'); return;
            }
            const errors = { CANCELLED: ['Stopped', 'Stopped. The provider may still charge for work already started.'], CONTEXT_LIMIT: ['SnapshotLimit', 'The reviewed snapshot exceeds its size limit. Nothing was written. You can uncheck the snapshot option and explicitly save only the answer.'], SIZE_LIMIT: ['SnapshotCapacity', 'The collection has insufficient space. Nothing was written. Free space or uncheck the snapshot option and explicitly save only the answer.'], TASK_UNCERTAIN: ['UncertainTasks', 'The earlier task add may already be saved. Check Tasks before adding anything else. This panel keeps the original operation and will not create a new batch.'], TASK_FORMAT: ['TaskFormat', 'Use exactly {"tasks":["one task","another task"]}, with 1–50 single-line tasks and no extra fields.'], LIMIT: ['Limit', 'The input is empty, invalid, or too long. Use at most 12 excerpts, 16,000 characters per excerpt and 32,000 characters in the complete request.'], CONFLICT: ['Changed', 'The task list changed. Review the extracted tasks again before adding them.'], PERMISSION: ['Permission', 'Allow the reviewed endpoint before sending.'] };
            if (errors[code]) { status.textContent = label(...errors[code]); return; }
            status.textContent = label('Error', 'Could not complete this step. Check the input, endpoint access and current workspace. Nothing is saved without confirmation; an uncertain save can be retried with the same operation.'); };
        const selectedSources = () => sourceRows.filter(row => row.check.checked).map(row => ({ ...row.source, text: row.input.value }));
        // Session-only visibility: never rebuild rows or change the outgoing selection.
        function matchesSourceView(row) {
            return row.searchTitle.includes(sourceSearch.value.trim().toLowerCase()) &&
                (sourceScope.value === 'all' || row.source.scope === sourceScope.value) &&
                (!selectedOnly || row.check.checked);
        }
        function filterSources() {
            const query = sourceSearch.value.trim().toLowerCase();
            // Capture focus before hiding a row: browsers may move it to body immediately.
            const batchFocused = doc.activeElement;
            const focusedIndex = sourceRows.findIndex(row => row.node.contains(doc.activeElement));
            let visible = 0, selected = 0, hiddenSelected = 0;
            for (const row of sourceRows) {
                row.node.hidden = !matchesSourceView(row);
                row.restore.hidden = !row.check.checked;
                row.restore.disabled = selectionBlocked() || !row.check.checked || row.input.value === row.initialText;
                if (!row.node.hidden) visible++;
                if (row.check.checked) { selected++; if (row.node.hidden) hiddenSelected++; }
            }
            searchCount.textContent = `${label('SourceSearchShowing', 'Showing')}: ${visible} / ${sourceRows.length} · ${label('SourceSearchSelected', 'Selected')}: ${selected} · ${label('SourceSearchHidden', 'Selected but hidden')}: ${hiddenSelected}`;
            showSelected.setAttribute('aria-pressed', String(selectedOnly));
            searchEmpty.textContent = sourceScope.value !== 'all'
                ? label('SourceScopeEmpty', 'No loaded sources match these filters. Change the scope, title search or selected-only view. Hidden selections remain included in review and sending.')
                : selectedOnly
                ? label('SourceSelectedEmpty', 'No selected sources match this view. Clear the title search or turn off Show selected only to see more loaded sources.')
                : label('SourceSearchEmpty', 'No loaded source titles match. Clear the search to show all loaded sources.');
            searchEmpty.hidden = (!query && !selectedOnly && sourceScope.value === 'all') || visible > 0;
            if (focusedIndex >= 0 && sourceRows[focusedIndex].node.hidden) {
                const available = row => !row.node.hidden && !row.check.disabled;
                const next = sourceRows.slice(focusedIndex + 1).find(available) || sourceRows.slice(0, focusedIndex).reverse().find(available);
                (next?.check || showSelected).focus();
            }
            clearSearch.disabled = !sourceSearch.value;
            const count = sourceRows.filter(row => !row.node.hidden && !row.check.checked).length;
            const blocked = selectionBlocked();
            selectVisible.textContent = `${label('SourceSelectVisible', 'Select visible unselected sources')} (${count})`;
            clearSelection.textContent = `${label('SourceClearSelection', 'Clear all selections')} (${selected}; ${label('SourceIncludingHidden', 'including hidden')}: ${hiddenSelected})`;
            selectVisible.disabled = blocked || !count || selected + count > 12;
            clearSelection.disabled = blocked || !selected;
            batchHelp.textContent = `${label('SourceBatchTotal', 'Selection after adding visible sources')}: ${selected + count} / 12. ${selected + count > 12 ? label('SourceBatchOver', 'Too many sources: narrow the title search or deselect sources first. Nothing will be partially selected.') + ' ' : ''}${label('SourceBatchHelp', 'Changing selections requires a new review. Clear all includes hidden selections and keeps your question, filters and edited excerpts. Character limits still apply; nothing is sent or saved.')}`;
            // Capture the button before disabling it: native browsers may blur immediately.
            if ((batchFocused === selectVisible || batchFocused === clearSelection) && batchFocused.disabled) showSelected.focus();
        }
        sourceSearch.addEventListener('input', filterSources);
        sourceScope.addEventListener('change', filterSources);
        function updateBudget() {
            const info = controller.inspectInput(question.value, selectedSources(), mode.value);
            const over = label('BudgetOver', 'Over limit');
            const unknown = label('BudgetUnknown', 'Not calculated: invalid or unusually large input');
            budget.textContent = `${label('BudgetSelected', 'Selected excerpts')}: ${info.count} / 12${info.count > 12 ? ` (${over})` : ''} · ${label('BudgetQuestion', 'Question')}: ${info.questionLength} / 4000 · ${label('BudgetPrompt', 'Complete prompt')}: ${info.promptLength === null ? unknown : `${info.promptLength} / 32000${info.promptLength > 32000 ? ` (${over})` : ''}`}${info.valid ? '' : ` · ${label('BudgetInvalid', 'Correct empty, invalid or over-limit input before review.')}`}`;
            for (const row of sourceRows) {
                row.budget.hidden = !row.check.checked;
                row.budget.textContent = row.check.checked ? `${label('Excerpt', 'Outgoing excerpt')}: ${row.input.value.length} / 16000${row.input.value.length > 16000 ? ` (${over})` : ''}` : '';
            }
        }
        function update() {
            copyGeneration++; copyStatus.textContent = '';
            filterSources();
            updateBudget();
            const focused = doc.activeElement, busy = pending || controller.busy || presetPending, retry = Boolean(controller.taskCommand || controller.saveCommand);
            for (const input of controls) input.disabled = busy || retry;
            // The title is local save metadata, not part of the reviewed request.
            // Allow edits during transport, but freeze it for persistence/retry.
            answerTitle.disabled = retry || controller.saved || (busy && !controller.aborter);
            for (const row of sourceRows) { row.check.disabled = row.input.disabled = busy || retry; }
            review.disabled = busy || retry; allow.disabled = send.disabled = busy || retry || !controller.reviewed || Boolean(controller.result && controller.resultReview === controller.reviewed);
            stop.disabled = !controller.busy; save.disabled = busy || !controller.result || controller.saved || controller.result.mode !== 'answer';
            reviewTasks.disabled = busy || !controller.result || controller.result.mode !== 'tasks' || Boolean(controller.taskCommand);
            confirm.disabled = busy || !controller.taskReview; output.disabled = busy || retry; output.readOnly = controller.result?.mode !== 'tasks';
            reset.disabled = busy || retry;
            outputLabel.hidden = !controller.result;
            updateCopy();
            previousResult.hidden = !controller.result || controller.resultReview === controller.reviewed;
            contextSave.hidden = !controller.result || controller.result.mode !== 'answer';
            includeContext.disabled = busy || retry || controller.saved;
            contextPreview.hidden = !includeContext.checked || contextSave.hidden;
            contextPreview.textContent = !contextPreview.hidden ? JSON.stringify(controller.answerSnapshot(), null, 2) : '';
            presetName.disabled = presetSelect.disabled = presetSave.disabled = !presetAvailable || busy || retry;
            presetDelete.disabled = presetSelect.disabled || !selectedPreset;
            if (focused?.disabled && box.contains(focused)) status.focus();
        }
        function invalidate(discard = false) {
            try { if (discard === true) controller.clear(); else controller.edit(); if (!controller.result) { if (!titleEdited) answerTitle.value = ''; includeContext.checked = false; } reviewText.hidden = taskList.hidden = true; status.textContent = ''; } catch (_) { error(); }
            update();
        }
        function selectionBlocked() {
            return disposed || pending || controller.busy || presetPending || Boolean(controller.taskCommand || controller.saveCommand);
        }
        function changeSelection(clear) {
            if (selectionBlocked()) return;
            // Compute the entire intended set from the current view, never truncate it.
            const selected = sourceRows.filter(row => row.check.checked);
            const changed = clear ? selected : sourceRows.filter(row => !row.check.checked && matchesSourceView(row));
            if (!changed.length || (!clear && selected.length + changed.length > 12)) return;
            // Authorize the edit before touching any checkbox or its editor.
            try { controller.edit(); } catch (_) { error(); update(); return; }
            for (const row of changed) { row.check.checked = !clear; row.input.hidden = clear; }
            if (!controller.result) includeContext.checked = false; reviewText.hidden = taskList.hidden = true;
            status.textContent = label('SourceBatchChanged', 'Selection changed. Review the exact request again before sending.');
            update();
        }
        function restoreExcerpt(row) {
            if (selectionBlocked() || row.node.hidden || !row.check.checked || row.input.value === row.initialText) return;
            // Only the already-loaded, DOM-normalized baseline is used; never reread storage.
            try { controller.edit(); } catch (_) { error(); update(); return; }
            row.input.value = row.initialText;
            if (!controller.result) includeContext.checked = false; reviewText.hidden = taskList.hidden = true;
            status.textContent = label('SourceRestored', 'Original excerpt restored. Review the exact request again before sending.');
            // Move focus before disabling the now-clean restore button (native browsers may blur it).
            row.input.focus();
            update();
        }
        function renderPresets() {
            presetSelect.replaceChildren();
            const manual = el('option', '', presetText('PresetManual', 'New / unsaved connection')); manual.value = ''; presetSelect.append(manual);
            presets.forEach((item, index) => { const option = el('option', '', item.name); option.value = String(index); presetSelect.append(option); });
            presetSelect.value = selectedPreset ? String(presets.findIndex(item => item.name === selectedPreset.name)) : '';
        }
        async function changePreset(removing) {
            if (disposed || !presetAvailable || presetPending || pending || controller.busy || controller.taskCommand || controller.saveCommand || (removing && !selectedPreset)) return;
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
            const selected = selectedSources();
            const result = await controller.review({ url: url.value, model: model.value, question: question.value, selected, mode: mode.value });
            reviewText.textContent = `${result.request.url}\n${result.request.model}\n\n${result.request.prompt}`; reviewText.hidden = false; taskList.hidden = true;
        }, ['Reviewed', 'Review the full destination, model and exact outgoing text. Source text is reference material, not trusted instructions.']));
        const allow = button('Allow', 'Allow this endpoint', () => {
            if (pending || disposed || !controller.reviewed) return;
            // Start permission request directly in user activation, before async UI work.
            let permission; try { permission = controller.allow(); } catch (_) { error(); return; }
            void action(async () => { if (!await permission) throw Error('Permission denied'); }, ['Allowed', 'Endpoint access allowed. This has not sent a request.']);
        });
        const confirmDiscard = key => !controller.result || controller.saved || Boolean(root.confirm?.(key === 'ReplaceResult' ? label('ReplaceResult', 'Send a new request? A successful response will replace this unsaved response. Cancel to keep it and save or add its tasks first.') : label('DiscardResult', 'Clear this draft and discard its unsaved response?')));
        const send = button('Send', 'Send reviewed request', () => {
            if (pending || disposed || controller.busy || !confirmDiscard('ReplaceResult')) return;
            return action(async () => {
            const reviewed = controller.reviewed;
            try {
                const result = await controller.send(key.value, { replaceUnsaved: true });
                if (!disposed && !controller.closed && controller.reviewed === reviewed &&
                    controller.generation === reviewed.generation && controller.result === result) {
                    output.value = result.text; outputLabel.hidden = false; includeContext.checked = false; taskList.hidden = true;
                    if (!titleEdited) answerTitle.value = reviewed.packed.question.slice(0, 200).replace(/[\uD800-\uDBFF]$/u, '');
                }
            }
            finally { key.value = ''; }
        }, ['Received', 'Response received, not saved. Model claims and source citations have not been verified.']); });
        const stop = button('Stop', 'Stop request', () => { controller.stop(); key.value = ''; status.textContent = label('Stopped', 'Stopped. The provider may still charge for work already started.'); });
        function updateCopy() {
            copy.disabled = disposed || controller.closed || copying || !controller.result || outputLabel.hidden || !output.value.trim();
            copy.textContent = controller.result?.mode === 'tasks' ? label('CopyTasks', 'Copy task JSON') : label('CopyAnswer', 'Copy answer');
        }
        const copy = button('CopyAnswer', 'Copy answer', async () => {
            if (disposed || controller.closed || copying || !controller.result || outputLabel.hidden || !output.value.trim()) return;
            // Snapshot only the displayed response. No request or connection metadata is copied.
            const text = output.value, result = controller.result, reviewed = controller.resultReview, generation = copyGeneration;
            const current = () => !disposed && !controller.closed && generation === copyGeneration &&
                controller.result === result && controller.resultReview === reviewed && !outputLabel.hidden && output.value === text;
            copying = true; copyStatus.textContent = ''; updateCopy();
            if (doc.activeElement === copy || doc.activeElement === doc.body) copyStatus.focus();
            try {
                if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
                await clipboard.writeText(text);
                if (current()) copyStatus.textContent = label('Copied', 'Response copied.');
            } catch (_) {
                if (current()) copyStatus.textContent = label('CopyBlocked', 'Copy was blocked. Select the response text to copy it manually.');
            } finally { copying = false; if (!disposed) updateCopy(); }
        });
        const save = button('Save', 'Save answer to AI collection', () => action(() => controller.saveAnswer(answerTitle.value, { includeContext: includeContext.checked }), ['Saved', 'Saved to the existing global AI collection. Saved answers join unencrypted local backups.']));
        const reviewTasks = button('ReviewTasks', 'Review extracted tasks', () => action(async () => {
            const result = await controller.reviewTasks(); taskList.replaceChildren(...result.texts.map(value => el('li', '', value))); taskList.hidden = false;
            confirm.textContent = `${label('Confirm', 'Add these tasks')} (${result.count})`;
        }, ['TasksReviewed', 'Check every task above. Confirmation adds exactly this list to the current workspace. No task is executed.']));
        const confirm = button('Confirm', 'Add these tasks', () => action(async () => {
            await controller.confirmTasks(); taskList.hidden = true; outputLabel.hidden = true;
        }, ['TasksSaved', 'Reviewed tasks added to this workspace.']));
        const reset = button('Cancel', 'Cancel / clear draft', () => { if (pending || controller.busy || controller.taskCommand || controller.saveCommand || !confirmDiscard('DiscardResult')) return; invalidate(true); key.value = ''; output.value = ''; question.value = ''; answerTitle.value = ''; titleEdited = false;
            for (const row of sourceRows) { row.check.checked = false; row.input.hidden = true; row.input.value = row.source.text; } sourceSearch.value = ''; sourceScope.value = 'all'; selectedOnly = false; update(); });
        const actions = el('div', 'ai-context-actions'); actions.append(review, allow, send, stop, reset);
        const results = el('div', 'ai-context-actions'); results.append(copy, save, reviewTasks, confirm);
        answerTitle.addEventListener('input', () => { titleEdited = true; });
        includeContext.addEventListener('change', update);
        box.append(actions, reviewText, status, previousResult, outputLabel, contextSave, taskList, results, copyStatus); host.append(box);
        for (const input of [url, model, question, mode]) input.addEventListener(input === mode ? 'change' : 'input', () => { if (input === url || input === model) key.value = ''; invalidate(); });
        output.addEventListener('input', () => { try { controller.editResult(output.value); taskList.hidden = true; } catch (_) { error(); } update(); });
        const ready = action(async () => {
            const values = await controller.loadSources(); if (disposed) return;
            for (const source of values) {
                const row = el('div', 'ai-context-source'), sourceLabel = el('label'), check = el('input'); check.type = 'checkbox'; check.checked = false;
                const input = el('textarea'); input.value = source.text; input.maxLength = 16000; input.rows = 3; input.hidden = true;
                input.setAttribute('aria-label', `${label('Excerpt', 'Outgoing excerpt')}: ${source.label}`);
                const sourceBudget = el('span', 'ai-context-source-budget'); sourceBudget.hidden = true;
                const state = { source, node: row, searchTitle: source.label.toLowerCase(), check, input, budget: sourceBudget, initialText: input.value };
                const restore = button('SourceRestore', 'Restore original excerpt', () => restoreExcerpt(state));
                restore.className = 'ai-context-source-restore';
                restore.title = label('SourceRestoreHelp', 'Restore this excerpt to the text loaded when this panel opened. The saved source is unchanged.');
                restore.setAttribute('aria-label', `${label('SourceRestore', 'Restore original excerpt')}: ${source.label}`);
                state.restore = restore;
                sourceLabel.append(check, el('span', '', `${source.scope === 'workspace' ? label('Workspace', 'Workspace note') : label('Global', 'Global collection')}: ${source.label}`));
                row.append(sourceLabel, input, sourceBudget, restore);
                sourceRows.push(state); sourceList.append(row);
                check.addEventListener('change', () => { input.hidden = !check.checked; invalidate(); }); input.addEventListener('input', invalidate);
            }
        }, ['Choose', 'Select only the sources you want to send. You can edit or remove each selected excerpt.']);
        // Compare live, session-only draft values with the blank/unselected state.
        // Keep the DOM-normalized source baseline so untouched CRLF excerpts are clean.
        function hasUncommittedWork() {
            return !disposed && Boolean(controller.busy || controller.result || controller.taskCommand || controller.saveCommand ||
                question.value || (titleEdited && answerTitle.value !== initialAnswerTitle) || sourceRows.some(row => row.check.checked || row.input.value !== row.initialText));
        }
        function guard(event) { if (hasUncommittedWork()) { event.preventDefault(); event.returnValue = ''; } }
        function destroy() { if (disposed) return; disposed = true; copy.disabled = true; selectVisible.disabled = clearSelection.disabled = true; for (const row of sourceRows) row.restore.disabled = true; key.value = ''; controller.close(); root.removeEventListener('pagehide', destroy); root.removeEventListener('beforeunload', guard); box.remove(); }
        root.addEventListener('pagehide', destroy); root.addEventListener('beforeunload', guard);
        const presetsReady = presetStore ? Promise.resolve().then(() => presetStore.read()).then(state => {
            if (disposed) return; presets = state.records; presetAvailable = true; renderPresets();
        }).catch(() => { if (!disposed) status.textContent = presetText('PresetUnavailable', 'Saved connections are unavailable. You can still enter a connection manually.'); }).finally(() => { presetPending = false; if (!disposed) update(); }) : Promise.resolve();
        presetPending = Boolean(presetStore);
        update(); return { controller, ready: Promise.all([ready, presetsReady]), destroy, presetSelect, presetName, presetSave, presetDelete, hasUncommittedWork };
    }
    root.LocalItabAIContextView = { mount };
})(typeof window === 'undefined' ? globalThis : window);
