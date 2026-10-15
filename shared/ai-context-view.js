/* Plain-text, opt-in context UI. No source is selected by default. */
(function (root) {
    'use strict';
    function mount(host, { controller, t = (_, fallback) => fallback, clipboard = root.navigator?.clipboard, presetStore = root.LocalItabAIModelPresets?.createStore({ chromeApi: root.chrome, locks: root.navigator?.locks }), promptStore, collectionRequest, collectionCurrent } = {}) {
        const doc = host.ownerDocument || root.document;
        const el = (tag, cls = '', value = '') => { const node = doc.createElement(tag); node.className = cls; node.textContent = value; return node; };
        const label = (key, fallback) => t(`aiContext${key}`, fallback);
        const button = (key, fallback, action) => { const node = el('button', '', label(key, fallback)); node.type = 'button'; node.addEventListener('click', action); return node; };
        const box = el('section', 'ai-context'), heading = el('h2', '', label('Title', 'Ask your saved context'));
        box.append(heading, el('p', '', label('Help', 'Choose saved excerpts and review a complete prompt locally, without a connection. Optionally open model settings to review, allow and send a request. Nothing is selected or sent automatically. Providers may charge; keys are cleared after a request or departure.')));
        const workbench = el('div', 'ai-context-workbench');
        const sourcesPane = el('section', 'ai-context-sources-pane');
        sourcesPane.setAttribute('aria-label', label('SourcesHeading', 'Saved sources'));
        sourcesPane.append(el('h3', '', label('SourcesHeading', 'Saved sources')));
        const collectionPanel = el('section', 'ai-context-collection-review'); collectionPanel.hidden = !collectionRequest;
        const collectionInfo = el('pre', 'ai-context-collection-info');
        const collectionText = el('pre', 'ai-context-collection-text'); collectionText.tabIndex = 0;
        const collectionStatus = el('p', 'ai-context-collection-status'); collectionStatus.tabIndex = -1; collectionStatus.setAttribute('role', 'status');
        const collectionApply = button('CollectionApply', 'Use this excerpt for this question', () => void applyCollection());
        collectionPanel.append(el('h3', '', label('CollectionReview', 'Review the selected saved excerpt')),
            el('p', '', label('CollectionHelp', 'Check this exact saved body, source attribution and version before selecting it. Only this excerpt is included, never its historical question/source snapshot or annotations. Nothing is sent, copied or saved. Displayed line breaks are normalized; the original CRLF/CR text is retained until you edit it.')),
            collectionInfo, collectionText, collectionApply, collectionStatus);
        sourcesPane.append(collectionPanel);
        let collectionTicket = null, collectionUsed = false, collectionEpoch = 0, collectionInvalidated = false, collectionSubscription = null, sourcesLoaded = false;

        const questionPane = el('section', 'ai-context-question-pane');
        questionPane.setAttribute('aria-label', label('QuestionHeading', 'Question and review'));
        questionPane.append(el('h3', '', label('QuestionHeading', 'Question and review')));
        // The shared dialog trap discovers explicit tabindex controls. Preserve
        // native disclosure keyboard access without expanding that shared policy.
        const summary = (key, fallback) => { const node = el('summary', '', label(key, fallback)); node.setAttribute('tabindex', '0'); return node; };
        const connection = el('details', 'ai-context-connection');
        connection.append(summary('ConnectionHeading', 'Optional: call a model in this extension'));
        const resultPane = el('section', 'ai-context-result-pane');
        resultPane.append(el('h3', '', label('ResultHeading', 'Response and next steps')));
        const controls = [];
        function field(key, fallback, type = 'textarea', parent = connection) {
            const wrapper = el('label', 'ai-context-field', label(key, fallback)), input = el(type === 'textarea' ? 'textarea' : 'input');
            if (type !== 'textarea') input.type = type;
            input.className = `ai-context-${key.toLowerCase()}`; input.autocomplete = 'off'; input.spellcheck = false; wrapper.append(input); parent.append(wrapper); controls.push(input); return input;
        }
        const url = field('Endpoint', 'Full HTTPS endpoint URL', 'url'); url.maxLength = 2048;
        const model = field('Model', 'Model ID', 'text'); model.maxLength = 120;
        const presetName = field('PresetName', 'Connection preset name', 'text'); presetName.maxLength = 80;
        const key = field('Key', 'API key (optional; never saved)', 'password'); key.maxLength = 4096;
        const question = field('Question', 'Question or task extraction instruction', 'textarea', questionPane); question.maxLength = 4000; question.rows = 3;
        // Preserve an applied template's exact line endings until a real question
        // edit. A textarea only exposes LF-normalized display values.
        let appliedPromptQuestion = null;
        const questionText = () => appliedPromptQuestion && question.value === appliedPromptQuestion.display ? appliedPromptQuestion.raw : question.value;
        const promptAPI = root.LocalItabPrompts;
        const promptPicker = el('section', 'ai-context-prompt-picker'); promptPicker.hidden = true; promptPicker.id = 'ai-context-prompt-picker';
        const reusePrompt = button('PromptReuse', 'Use a saved prompt', () => {
            if (promptBlocked()) return;
            promptPicker.hidden = false; reusePrompt.setAttribute('aria-expanded', 'true'); promptStatus.focus(); void loadPrompts();
        });
        reusePrompt.className = 'ai-context-prompt-reuse'; reusePrompt.setAttribute('aria-controls', promptPicker.id); reusePrompt.setAttribute('aria-expanded', 'false');
        const promptHelp = el('p', '', label('PromptHelp', 'Choose a current, unarchived template from the global prompt library, fill its variables and preview the replacement question. Only an explicit Replace changes this session. Sources, excerpts, output mode, connection and previous response stay unchanged. Nothing is sent, copied or saved; no prompt-version link is attached.'));
        promptHelp.id = 'ai-context-prompt-help'; promptPicker.setAttribute('aria-describedby', promptHelp.id); promptPicker.setAttribute('aria-label', label('PromptReuse', 'Use a saved prompt'));
        const promptSearchLabel = el('label', 'ai-context-field', label('PromptSearch', 'Search template titles'));
        const promptSearch = el('input', 'ai-context-prompt-search'); promptSearch.type = 'text'; promptSearch.autocomplete = 'off'; promptSearch.spellcheck = false;
        promptSearchLabel.append(promptSearch);
        const promptSearchHelp = el('p', '', label('PromptSearchHelp', 'Search titles locally. Changing or clearing the search clears the template selection, variables and preview; your question stays unchanged.'));
        promptSearchHelp.id = 'ai-context-prompt-search-help'; promptSearch.setAttribute('aria-describedby', promptSearchHelp.id);
        const promptSearchReset = button('PromptSearchReset', 'Clear template search', () => {
            if (promptBlocked() || promptOperation || promptPicker.hidden || !promptAvailable) return;
            promptSearch.value = ''; filterPrompts(); promptSearch.focus();
        });
        const promptSearchControls = el('div', 'ai-context-prompt-search-controls'); promptSearchControls.append(promptSearchLabel, promptSearchReset);
        const promptMatches = el('p', 'ai-context-prompt-matches'); promptMatches.hidden = true;
        promptMatches.setAttribute('role', 'status'); promptMatches.setAttribute('aria-live', 'polite');
        const promptLabel = el('label', 'ai-context-field', label('PromptSelect', 'Saved prompt template'));
        const promptSelect = el('select', 'ai-context-prompt-select'); promptLabel.append(promptSelect);
        const promptVariables = el('div', 'ai-context-prompt-variables');
        const promptPreview = el('pre', 'ai-context-prompt-preview'); promptPreview.hidden = true; promptPreview.setAttribute('tabindex', '0');
        promptPreview.setAttribute('aria-label', label('PromptPreviewText', 'Replacement question preview'));
        const promptCount = el('p', 'ai-context-prompt-count'); promptCount.hidden = true;
        const promptStatus = el('p', 'ai-context-prompt-status'); promptStatus.tabIndex = -1;
        promptStatus.setAttribute('role', 'status'); promptStatus.setAttribute('aria-live', 'polite');
        const promptPreviewButton = button('PromptPreview', 'Preview replacement question', previewPrompt);
        const promptApply = button('PromptApply', 'Replace this question', applyPrompt);
        const promptReload = button('PromptReload', 'Reload saved prompts', () => { if (!promptBlocked()) void loadPrompts(); });
        const promptClose = button('PromptClose', 'Close prompt picker', () => closePrompts(true));
        const promptActions = el('div', 'ai-context-actions'); promptActions.append(promptPreviewButton, promptApply, promptReload, promptClose);
        promptPicker.append(promptHelp, promptSearchControls, promptSearchHelp, promptMatches, promptLabel, promptVariables, promptPreview, promptCount, promptActions, promptStatus);
        questionPane.append(reusePrompt, promptPicker);
        let promptRecords = [], promptRecord = null, promptRows = [], promptValues = Object.create(null), promptTicket = null, promptOperation = null, promptEpoch = 0, promptSubscription = null, promptAvailable = false, promptComposing = false;
        const modeLabel = el('label', 'ai-context-field', label('Mode', 'Output'));
        const mode = el('select', 'ai-context-mode');
        for (const [value, name, fallback] of [['answer', 'Answer', 'Answer'], ['tasks', 'Tasks', 'Draft tasks for review']]) { const option = el('option', '', label(name, fallback)); option.value = value; mode.append(option); }
        mode.value = 'answer'; modeLabel.append(mode); questionPane.append(modeLabel); controls.push(mode);
        const streamLabel = el('label', 'ai-context-stream-option'), stream = el('input', 'ai-context-stream');
        stream.type = 'checkbox'; stream.checked = false;
        streamLabel.append(stream, el('span', '', label('Stream', 'Show answer progressively (optional)')));
        const streamHelp = el('p', 'ai-context-stream-help', label('StreamHelp', 'Off by default; Answer only. Incomplete text cannot be saved or copied as an answer. Switching away from this page stops the request. This is not a background task. Provider streaming compatibility has not been verified with real accounts.'));
        questionPane.append(streamLabel, streamHelp); controls.push(stream);

        const presetText = (name, fallback) => t(`promptsModel${name}`, fallback);
        const presetLabel = el('label', 'ai-context-field', presetText('PresetLabel', 'Saved connections (this device only)'));
        const presetSelect = el('select'); presetLabel.append(presetSelect); connection.append(presetLabel);
        connection.append(el('p', '', presetText('PresetHelp', 'Save only the name, endpoint and model ID. Never enter credentials in these fields. Presets stay on this device and are excluded from backups. Selecting one does not grant access or send anything.')));
        const presetActions = el('div', 'ai-context-actions'); connection.append(presetActions);
        let presets = [], selectedPreset = null, presetPending = false, presetAvailable = false, presetReloadEpoch = 0;
        const scopeNote = el('p', 'ai-context-scope', label('Scope', 'AI collections are global saved excerpts. The saved note belongs to this workspace. Unsaved notes, browser history and other workspaces are never included.'));
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
        const selectVisible = button('SourceSelectVisible', 'Select visible unselected sources', () => changeSelection('add'));
        const deselectVisible = button('SourceDeselectVisible', 'Deselect visible selected sources', () => changeSelection('visible'));
        const clearSelection = button('SourceClearSelection', 'Clear all selections', () => changeSelection('all'));
        batchActions.append(selectVisible, deselectVisible, clearSelection);
        const batchHelp = el('p', 'ai-context-source-batch-help'); batchHelp.id = 'ai-context-source-batch-help';
        selectVisible.setAttribute('aria-describedby', batchHelp.id); deselectVisible.setAttribute('aria-describedby', batchHelp.id); clearSelection.setAttribute('aria-describedby', batchHelp.id);
        const searchCount = el('p', 'ai-context-source-count'); searchCount.setAttribute('role', 'status'); searchCount.setAttribute('aria-live', 'polite');
        const searchEmpty = el('p', 'ai-context-source-empty', label('SourceSearchEmpty', 'No loaded source titles match. Clear the search to show all loaded sources.'));
        searchEmpty.hidden = true;
        const searchHelp = el('p', 'ai-context-source-search-help', label('SourceSearchHelp', 'Searches only loaded titles in this panel. Hidden selections stay selected and are still included in review and sending.'));
        const reloadActions = el('div', 'ai-context-actions');
        const reloadSources = button('SourceReload', 'Reload saved sources', () => loadSourceRows(true));
        reloadSources.className = 'ai-context-source-reload';
        const reloadHelp = el('p', 'ai-context-source-reload-help', label('SourceReloadHelp', 'Read the latest saved sources for this workspace and the global collection. A successful reload clears all source selections and excerpt edits, including hidden ones. Your question, connection, filters and previous response stay unchanged. Nothing is sent or saved.'));
        reloadHelp.id = 'ai-context-source-reload-help'; reloadSources.setAttribute('aria-describedby', reloadHelp.id);
        reloadActions.append(reloadSources);
        const sourceList = el('div', 'ai-context-sources');
        const sourceHelp = el('details', 'ai-context-source-help');
        sourceHelp.append(summary('SourceHelpHeading', 'Source scope, limits and reload'), scopeNote, scopeHelp, searchHelp, batchHelp, reloadActions, reloadHelp);
        sourcesPane.append(searchLabel, scopeLabel, searchActions, searchCount, batchActions, searchEmpty, sourceList, sourceHelp);
        const budget = el('p', 'ai-context-budget'); budget.setAttribute('role', 'status'); budget.setAttribute('aria-live', 'polite');
        questionPane.append(budget, el('p', 'ai-context-budget-help', label('BudgetHelp', 'Local character limits use UTF-16; some emoji count as 2. These are not token, cost or provider quotas. The total includes instructions, labels and JSON escaping. No automatic shortening or deselection.')));
        let sourceRows = [];
        const reviewText = el('pre', 'ai-context-review'); reviewText.hidden = true;
        const localPanel = el('section', 'ai-context-local-review'); localPanel.hidden = true;
        const localMode = el('p', 'ai-context-local-mode');
        localPanel.append(localMode);
        const localText = el('textarea', 'ai-context-local-prompt'); localText.readOnly = true; localText.rows = 10;
        localText.setAttribute('aria-label', label('LocalPrompt', 'Complete local prompt'));
        localPanel.append(el('p', '', label('LocalPrivacy', 'This complete prompt includes your selected excerpts, source IDs and labels, including hidden selections. Check for private information and secrets before pasting it into an external service. Connection settings are not included. Reviewing and copying do not send, grant access or save anything.')), localText);
        const localStatus = el('p', 'ai-context-local-status'); localStatus.tabIndex = -1;
        localStatus.setAttribute('role', 'status'); localStatus.setAttribute('aria-live', 'polite');
        let localCopy = null;
        const status = el('p', 'ai-context-status'); status.tabIndex = -1; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const outputLabel = el('label', 'ai-context-field'), outputHeading = el('span'); outputLabel.append(outputHeading);
        const previousResult = el('p', 'ai-context-previous-result', label('PreviousResult', 'This response belongs to the previous reviewed request. Saving or adding tasks uses that response and its original request, not the edited draft.')); previousResult.hidden = true;
        // Preserve the complete editable draft; controller validation rejects oversized
        // text whole, rather than letting native maxlength truncate it into different JSON.
        const output = el('textarea'); output.rows = 8; outputLabel.append(output); outputLabel.hidden = true;
        const taskEditStatus = el('p', 'ai-context-task-edit-status', label('TaskEditInvalid', 'This edited task JSON exceeds 32,000 UTF-16 units or contains invalid Unicode. The full draft is kept here, and the previous task review is canceled. Fix the text, then review it again before adding tasks.'));
        taskEditStatus.hidden = true; taskEditStatus.setAttribute('role', 'status'); taskEditStatus.setAttribute('aria-live', 'polite');
        resultPane.append(previousResult, outputLabel, taskEditStatus);
        const externalPanel = el('details', 'ai-context-external-tasks'); externalPanel.hidden = true;
        externalPanel.append(summary('ExternalTasks', 'Review external task JSON'),
            el('p', '', label('ExternalTasksHelp', 'Paste plain JSON from your chosen AI service: {"tasks":["one task","another task"]}. Use exactly one tasks field, 1–50 nonempty single-line strings, at most 1,000 UTF-16 units per task and 32,000 in the JSON. Code fences and extra fields are not accepted. Loading only prepares a local review; it does not read the clipboard, send, save or execute anything.')));
        const externalLabel = el('label', 'ai-context-field', label('ExternalTasksInput', 'External task JSON to load'));
        // Do not set maxlength: native paste truncation could turn an oversized
        // response into different valid JSON. The explicit parser rejects it whole.
        const externalInput = el('textarea', 'ai-context-external-input'); externalInput.rows = 6; externalInput.spellcheck = false; externalInput.autocomplete = 'off';
        externalInput.placeholder = '{"tasks":["one task","another task"]}'; externalLabel.append(externalInput); externalPanel.append(externalLabel);
        let externalEpoch = 0;
        let answerReader = null, readerResult = null;
        const readerHost = el('div'); resultPane.append(readerHost);
        function updateAnswerReader() {
            const result = controller.result;
            if (readerResult !== result) {
                answerReader?.destroy(); answerReader = null; readerResult = result;
                if (result?.mode === 'answer' && root.LocalItabSafeAnswerReader) {
                    answerReader = root.LocalItabSafeAnswerReader.create(doc, result.text, (key, fallback) => t(`answerReader${key}`, fallback), {
                        copy: (text, target) => copyResponse(text, target), canCopy: canCopyResponse
                    });
                    readerHost.append(answerReader.node);
                }
            }
            output.hidden = Boolean(answerReader);
            readerHost.hidden = !answerReader || Boolean(controller.partial);
        }
        const partialPanel = el('section', 'ai-context-partial'); partialPanel.hidden = true;
        const partialStatus = el('p', 'ai-context-partial-status'); partialStatus.setAttribute('role', 'status');
        const partialText = el('pre', 'ai-context-partial-text');
        partialPanel.append(partialStatus, partialText);

        const answerTitle = field('SaveTitle', 'Title for saved answer', 'text', resultPane); answerTitle.maxLength = 200;
        const contextSave = el('section', 'ai-context-save-context'); contextSave.hidden = true;
        const contextLabel = el('label'), includeContext = el('input'); includeContext.type = 'checkbox'; includeContext.checked = false;
        contextLabel.append(includeContext, el('span', '', label('SaveContext', 'Also save this exact question and reviewed source excerpts')));
        const contextPreview = el('pre', 'ai-context-review'); contextPreview.hidden = true;
        contextSave.append(contextLabel, el('p', '', label('SaveContextPrivacy', 'Optional, off by default. The exact question, edited excerpts, source IDs and labels, full reviewed prompt, endpoint and model below will join the global AI collection and unencrypted backups. Check for private information or secrets in the text before saving. API-key fields and authentication headers are never included. Removing source URLs from a backup does not remove this snapshot.')), contextPreview);
        const taskList = el('ol', 'ai-context-tasks'); taskList.hidden = true;
        const taskSelection = el('section', 'ai-context-task-selection'); taskSelection.hidden = true;
        const taskSelectionHelp = el('p', 'ai-context-task-selection-help');
        const taskChoices = el('div', 'ai-context-task-choices');
        taskSelection.append(el('h3', '', label('TaskSelectionTitle', 'Choose tasks to add')), taskSelectionHelp, taskChoices);
        let taskChoiceResult = null, taskChoiceRows = [];
        function renderTaskSelection(blocked) {
            let selection;
            try { if (controller.result?.mode === 'tasks' && !controller.partial) selection = controller.taskCandidates(); } catch (_) {}
            taskSelection.hidden = !selection;
            if (!selection) { taskChoiceResult = null; taskChoiceRows = []; taskChoices.replaceChildren(); return null; }
            if (taskChoiceResult !== selection.result) {
                taskChoiceResult = selection.result; taskChoices.replaceChildren(); taskChoiceRows = [];
                selection.texts.forEach((text, index) => {
                    const row = el('label', 'ai-context-task-choice'), check = el('input'); check.type = 'checkbox';
                    const value = el('span', '', `${index + 1}. ${text}`); row.append(check, value);
                    const entry = { check, result: selection.result }; taskChoiceRows.push(entry); taskChoices.append(row);
                    check.addEventListener('change', () => {
                        if (disposed || !taskChoiceRows.includes(entry)) return;
                        if (pending || controller.busy || presetPending || controller.taskCommand || controller.saveCommand || doc.visibilityState === 'hidden') { renderTaskSelection(true); return; }
                        try {
                            controller.selectTask(index, check.checked, entry.result); taskList.hidden = true;
                            status.textContent = label('TaskSelectionChanged', 'Task selection changed. Review the selected tasks again before adding them. The original JSON is unchanged.');
                        } catch (_) { error(); }
                        update();
                    });
                });
            }
            taskChoiceRows.forEach(({ check }, index) => { check.checked = selection.selected[index]; check.disabled = blocked; });
            const count = selection.selected.filter(Boolean).length;
            taskSelectionHelp.textContent = `${label('TaskSelectionCount', 'Selected tasks')}: ${count} / ${selection.texts.length}. ${label('TaskSelectionHelp', 'Only checked tasks will be reviewed and added, in their original order. Editing the JSON resets selection to all tasks. Nothing is executed or sent.')}`;
            return count;
        }

        const initialAnswerTitle = answerTitle.value;
        let disposed = false, pending = false, titleEdited = false, copying = false, copyGeneration = 0;
        const copyStatus = el('p', 'ai-context-copy-status'); copyStatus.tabIndex = -1; copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
        const error = code => {
            if (code === 'EXTERNAL_TASK_FORMAT') {
                status.textContent = label('ExternalTasksInvalid', 'The pasted JSON was not loaded. Use only {"tasks":["one task"]}, with 1–50 nonempty single-line strings, at most 1,000 UTF-16 units each and 32,000 total. Remove code fences and extra fields. Your pasted text and previous response are kept.'); return;
            }
            if (controller.saveCommand && controller.saveUncertain) {
                status.textContent = label('UncertainAnswer', 'The earlier answer save is unconfirmed. Use “Check earlier save” to check its receipt without writing or contacting the provider. Missing or unreadable evidence keeps this draft locked; the original operation, title and snapshot choice stay unchanged.'); return;
            }
            if (controller.taskCommand && controller.taskUncertain) {
                status.textContent = label('UncertainTasks', 'The earlier task add is unconfirmed. Use “Check existing task batch” to check that the complete original batch is still present and unchanged. Missing receipts, changed tasks or unreadable data keep this draft locked. Nothing is written or sent.'); return;
            }
            const errors = { CANCELLED: ['Stopped', 'Stopped. The provider may still charge for work already started.'], CONTEXT_LIMIT: ['SnapshotLimit', 'The reviewed snapshot exceeds its size limit. Nothing was written. You can uncheck the snapshot option and explicitly save only the answer.'], SIZE_LIMIT: ['SnapshotCapacity', 'The collection has insufficient space. Nothing was written. Free space or uncheck the snapshot option and explicitly save only the answer.'], TASK_UNCERTAIN: ['UncertainTasks', 'The earlier task add may already be saved. Check Tasks before adding anything else. This panel keeps the original operation and will not create a new batch.'], TASK_SELECTION: ['TaskSelectionEmpty', 'Select at least one task before reviewing.'], TASK_FORMAT: ['TaskFormat', 'Use exactly {"tasks":["one task","another task"]}, with 1–50 single-line tasks and no extra fields.'], LIMIT: ['Limit', 'The input is empty, invalid, or too long. Use at most 12 excerpts, 16,000 characters per excerpt and 32,000 characters in the complete request.'], CONFLICT: ['Changed', 'The task list changed. Review the extracted tasks again before adding them.'], PERMISSION: ['Permission', 'Allow the reviewed endpoint before sending.'] };
            if (errors[code]) { status.textContent = label(...errors[code]); return; }
            status.textContent = label('Error', 'Could not complete this step. Check the input, endpoint access and current workspace. Nothing is saved without confirmation; an uncertain save can be retried with the same operation.'); };
        const sourceText = row => row.rawText !== null && row.input.value === row.initialText ? row.rawText : row.input.value;
        const selectedSources = () => sourceRows.filter(row => row.check.checked).map(row => ({ ...row.source, text: sourceText(row) }));
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
                row.restore.disabled = selectionBlocked() || !row.check.checked || sourceText(row) === row.source.text;
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
            deselectVisible.textContent = `${label('SourceDeselectVisible', 'Deselect visible selected sources')} (${selected - hiddenSelected})`;
            clearSelection.textContent = `${label('SourceClearSelection', 'Clear all selections')} (${selected}; ${label('SourceIncludingHidden', 'including hidden')}: ${hiddenSelected})`;
            selectVisible.disabled = blocked || !count || selected + count > 12;
            deselectVisible.disabled = blocked || selected === hiddenSelected;
            clearSelection.disabled = blocked || !selected;
            batchHelp.textContent = `${label('SourceBatchTotal', 'Selection after adding visible sources')}: ${selected + count} / 12. ${selected + count > 12 ? label('SourceBatchOver', 'Too many sources: narrow the title search or deselect sources first. Nothing will be partially selected.') + ' ' : ''}${label('SourceBatchHelp', 'Changing selections requires a new review. Deselect visible keeps hidden selections. Clear all includes hidden selections and keeps your question, filters and edited excerpts. Character limits still apply; nothing is sent or saved.')}`;
            // Capture the button before disabling it: native browsers may blur immediately.
            if ((batchFocused === selectVisible || batchFocused === deselectVisible || batchFocused === clearSelection) && batchFocused.disabled) showSelected.focus();
        }
        sourceSearch.addEventListener('input', filterSources);
        sourceScope.addEventListener('change', filterSources);
        function updateBudget() {
            const info = controller.inspectInput(questionText(), selectedSources(), mode.value);
            const over = label('BudgetOver', 'Over limit');
            const unknown = label('BudgetUnknown', 'Not calculated: invalid or unusually large input');
            budget.textContent = `${label('BudgetSelected', 'Selected excerpts')}: ${info.count} / 12${info.count > 12 ? ` (${over})` : ''} · ${label('BudgetQuestion', 'Question')}: ${info.questionLength} / 4000 · ${label('BudgetPrompt', 'Complete prompt')}: ${info.promptLength === null ? unknown : `${info.promptLength} / 32000${info.promptLength > 32000 ? ` (${over})` : ''}`}${info.valid ? '' : ` · ${label('BudgetInvalid', 'Correct empty, invalid or over-limit input before review.')}`}`;
            for (const row of sourceRows) {
                row.budget.hidden = !row.check.checked;
                row.budget.textContent = row.check.checked ? `${label('Excerpt', 'Outgoing excerpt')}: ${sourceText(row).length} / 16000${sourceText(row).length > 16000 ? ` (${over})` : ''}` : '';
            }
        }
        // Only the latest partial text needs painting. Keep source budgets and
        // live-region announcements out of the per-chunk path.
        let partialFrame = null, partialTicket = 0;
        function cancelPartialFrame() {
            partialTicket++;
            if (partialFrame !== null) root.cancelAnimationFrame?.(partialFrame);
            partialFrame = null;
        }
        function renderPartial() {
            partialPanel.hidden = !controller.partial;
            const text = controller.partial?.text || '';
            if (partialText.textContent !== text) partialText.textContent = text;
            const statusText = !controller.partial ? '' : controller.partial.state === 'receiving'
                ? label('StreamReceiving', 'Receiving an incomplete answer. Save and copy remain unavailable until the complete response is validated.')
                : label('StreamIncomplete', 'Incomplete answer: stopped or failed. This text is not a completed response and cannot be saved or copied as an answer. Review or explicitly send again to retry, or clear the draft. Any previous response is kept separately and becomes visible after a new review or edit.');
            if (partialStatus.textContent !== statusText) partialStatus.textContent = statusText;
        }
        function queuePartial() {
            if (disposed || controller.closed || doc.visibilityState === 'hidden') return;
            if (partialFrame !== null) return;
            if (typeof root.requestAnimationFrame !== 'function') { renderPartial(); return; }
            const ticket = ++partialTicket, review = controller.partial?.review;
            partialFrame = root.requestAnimationFrame(() => {
                // A cancelled callback may already have been dispatched. Never
                // let it clear a newer frame or paint a later request's draft.
                if (ticket !== partialTicket) return;
                partialFrame = null;
                if (disposed || controller.closed || doc.visibilityState === 'hidden' ||
                    controller.partial?.review !== review) return;
                renderPartial();
            });
        }
        function update() {
            cancelPartialFrame();
            copyGeneration++; copyStatus.textContent = '';
            filterSources();
            updateBudget();
            updateLocalReview();
            updatePromptPicker();
            updateCollectionSelection();
            const focused = doc.activeElement, busy = pending || controller.busy || presetPending, retry = Boolean(controller.taskCommand || controller.saveCommand);
            externalPanel.hidden = mode.value !== 'tasks';
            externalInput.disabled = busy || retry;
            loadExternal.disabled = busy || retry || externalPanel.hidden || !externalInput.value.trim() || doc.visibilityState === 'hidden';
            for (const input of controls) input.disabled = busy || retry;
            stream.disabled = busy || retry || mode.value !== 'answer';
            streamLabel.hidden = streamHelp.hidden = mode.value !== 'answer';
            renderPartial();
            // The title is local save metadata, not part of the reviewed request.
            // Allow edits during transport, but freeze it for persistence/retry.
            answerTitle.disabled = retry || controller.saved || (busy && !controller.aborter);
            for (const row of sourceRows) { row.check.disabled = row.input.disabled = busy || retry; }
            review.disabled = busy || retry; allow.disabled = send.disabled = busy || retry || !controller.reviewed || Boolean(controller.result && controller.resultReview === controller.reviewed);
            stop.disabled = !controller.busy; save.disabled = busy || Boolean(controller.partial) || !controller.result || controller.saved || controller.result.mode !== 'answer';
            verifySave.hidden = !controller.saveCommand || !controller.saveUncertain;
            verifySave.disabled = busy || verifySave.hidden;
            verifyTasks.hidden = !controller.taskCommand || !controller.taskUncertain;
            verifyTasks.disabled = busy || verifyTasks.hidden;
            const invalidTaskEdit = Boolean(controller.result && controller.invalidTaskEdit === controller.result);
            taskEditStatus.hidden = !invalidTaskEdit; output.setAttribute('aria-invalid', String(invalidTaskEdit));
            const selectedTaskCount = renderTaskSelection(busy || retry || doc.visibilityState === 'hidden');
            reviewTasks.disabled = invalidTaskEdit || selectedTaskCount === 0 || busy || !controller.result || controller.result.mode !== 'tasks' || Boolean(controller.taskCommand);
            confirm.textContent = `${label('Confirm', 'Add these tasks')}${controller.taskReview ? ` (${controller.taskReview.count})` : ''}`;
            confirm.disabled = busy || !controller.taskReview; output.disabled = busy || retry; output.readOnly = controller.result?.mode !== 'tasks';
            reset.disabled = busy || retry; reloadSources.disabled = selectionBlocked();
            outputLabel.hidden = !controller.result || Boolean(controller.partial);
            resultPane.hidden = !controller.result || Boolean(controller.partial);
            updateAnswerReader();
            updateCopy();
            const external = controller.result?.provenance === 'external';
            outputHeading.textContent = external ? label('ExternalTasksResponse', 'External task JSON (manually pasted, unverified; editable before review)') : label('Response', 'Model response (unverified text; task JSON can be edited before review)');
            previousResult.hidden = !controller.result || (!external && controller.resultReview === controller.reviewed);
            previousResult.textContent = external
                ? label('ExternalTasksProvenance', 'Manually pasted external tasks. The extension did not send a request or verify their origin. These tasks are not linked to the question, selected excerpts or connection shown above. Only the selected task text is added after review and confirmation.')
                : label('PreviousResult', 'This response belongs to the previous reviewed request. Saving or adding tasks uses that response and its original request, not the edited draft.');
            save.hidden = answerTitle.parentElement.hidden = external;
            contextSave.hidden = !controller.result || controller.result.mode !== 'answer';
            includeContext.disabled = busy || retry || controller.saved;
            contextPreview.hidden = !includeContext.checked || contextSave.hidden;
            contextPreview.textContent = !contextPreview.hidden ? JSON.stringify(controller.answerSnapshot(), null, 2) : '';
            presetReload.disabled = !presetStore || presetPending || disposed || controller.closed || pending || controller.busy || controller.taskCommand || controller.saveCommand || doc.visibilityState === 'hidden';
            presetName.disabled = presetSelect.disabled = presetSave.disabled = !presetAvailable || busy || retry;
            presetDelete.disabled = presetSelect.disabled || !selectedPreset;
            if (focused?.disabled && box.contains(focused)) status.focus();
        }
        function invalidate(discard = false) {
            try { if (discard === true) controller.clear(); else controller.edit(); if (!controller.result) { if (!titleEdited) answerTitle.value = ''; includeContext.checked = false; } reviewText.hidden = taskList.hidden = true; status.textContent = ''; } catch (_) { error(); }
            update();
        }
        function selectionBlocked() {
            return disposed || controller.closed || pending || controller.busy || presetPending || Boolean(controller.taskCommand || controller.saveCommand);
        }
        function changeSelection(mode) {
            if (selectionBlocked()) return;
            // Compute the entire intended set from the current view, never truncate it.
            const selected = sourceRows.filter(row => row.check.checked);
            const clear = mode !== 'add';
            const changed = mode === 'all' ? selected : sourceRows.filter(row => row.check.checked === clear && matchesSourceView(row));
            if (!changed.length || (!clear && selected.length + changed.length > 12)) return;
            // Authorize the edit before touching any checkbox or its editor.
            try { controller.edit(); } catch (_) { error(); update(); return; }
            for (const row of changed) { row.check.checked = !clear; row.input.hidden = clear; }
            if (!controller.result) includeContext.checked = false; reviewText.hidden = taskList.hidden = true;
            status.textContent = label('SourceBatchChanged', 'Selection changed. Review the exact request again before sending.');
            update();
        }
        function restoreExcerpt(row) {
            if (selectionBlocked() || !sourceRows.includes(row) || row.node.hidden || !row.check.checked || sourceText(row) === row.source.text) return;
            // Only the already-loaded, DOM-normalized baseline is used; never reread storage.
            try { controller.edit(); } catch (_) { error(); update(); return; }
            row.input.value = row.initialText; row.rawText = row.source.text;
            if (!controller.result) includeContext.checked = false; reviewText.hidden = taskList.hidden = true;
            status.textContent = label('SourceRestored', 'Original excerpt restored. Review the exact request again before sending.');
            // Move focus before disabling the now-clean restore button (native browsers may blur it).
            row.input.focus();
            update();
        }
        function promptBlocked() {
            return !promptAPI || selectionBlocked() || !box.isConnected || doc.visibilityState === 'hidden';
        }
        function clearPromptPreview() {
            const focused = promptPreview.contains(doc.activeElement) || doc.activeElement === promptApply;
            promptTicket = null; promptPreview.textContent = ''; promptPreview.hidden = true; promptCount.textContent = ''; promptCount.hidden = true;
            if (focused && !promptPicker.hidden) promptStatus.focus();
        }
        function cancelPromptOperation() { promptEpoch++; promptOperation = null; }
        function closePrompts(restoreFocus = false) {
            const subscription = promptSubscription; promptSubscription = null;
            try { subscription?.unsubscribe?.(); } catch (_) { /* Closed identities still reject queued notifications. */ }
            cancelPromptOperation(); clearPromptPreview(); promptRecords = []; promptRecord = null; promptRows = []; promptValues = Object.create(null);
            promptAvailable = false; promptSearch.value = ''; promptComposing = false; promptMatches.hidden = true; promptMatches.textContent = '';
            promptSelect.replaceChildren(); promptVariables.replaceChildren(); promptStatus.textContent = ''; promptPicker.hidden = true;
            reusePrompt.setAttribute('aria-expanded', 'false'); reusePrompt.hidden = false;
            if (restoreFocus) { if (!reusePrompt.disabled) reusePrompt.focus(); else status.focus(); }
        }
        function promptDraftCurrent(ticket) {
            return ticket && !promptBlocked() && !promptPicker.hidden && ticket.epoch === promptEpoch &&
                ticket.generation === controller.generation && ticket.question === questionText() && ticket.search === promptSearch.value;
        }
        function updatePromptPicker() {
            const blocked = promptBlocked();
            reusePrompt.disabled = blocked; reusePrompt.hidden = !promptPicker.hidden;
            if ((promptTicket && !promptDraftCurrent(promptTicket)) || (promptOperation && !promptDraftCurrent(promptOperation))) {
                cancelPromptOperation(); clearPromptPreview();
                promptStatus.textContent = label('PromptStale', 'The draft or workspace changed, or another operation started. Preview again before replacing the question.');
            }
            promptSelect.disabled = promptReload.disabled = blocked || Boolean(promptOperation);
            const searchDisabled = blocked || Boolean(promptOperation) || !promptAvailable, resetDisabled = searchDisabled || !promptSearch.value;
            // Move focus before disabling: native controls may blur to body first.
            if (!promptPicker.hidden && ((doc.activeElement === promptSearch && searchDisabled) || (doc.activeElement === promptSearchReset && resetDisabled))) promptStatus.focus();
            promptSearch.disabled = searchDisabled; promptSearchReset.disabled = resetDisabled;
            promptPreviewButton.disabled = blocked || Boolean(promptOperation) || !promptRecord;
            promptApply.disabled = blocked || Boolean(promptOperation) || !promptTicket;
            for (const row of promptRows) row.input.disabled = row.empty.disabled = blocked || Boolean(promptOperation);
        }
        function promptSnapshot() { return { epoch: promptEpoch, generation: controller.generation, question: questionText(), search: promptSearch.value }; }
        function subscribePrompts() {
            if (promptSubscription) return;
            const subscription = promptSubscription = {};
            try {
                subscription.unsubscribe = promptStore.subscribe(() => {
                    if (promptSubscription !== subscription || disposed || promptPicker.hidden) return;
                    const restoreFocus = promptPicker.contains(doc.activeElement);
                    cancelPromptOperation(); clearPromptPreview(); promptRecords = []; promptRecord = null; promptRows = []; promptValues = Object.create(null);
                    promptAvailable = false; promptMatches.hidden = true; promptMatches.textContent = '';
                    promptSelect.replaceChildren(); promptVariables.replaceChildren();
                    promptStatus.textContent = label('PromptChanged', 'The saved prompt library changed. Reload saved prompts and preview again. Your question is unchanged.');
                    updatePromptPicker(); if (restoreFocus) promptStatus.focus();
                });
            } catch (error) { promptSubscription = null; throw error; }
        }
        async function readPromptState(operation) {
            const current = () => { if (promptOperation !== operation || !promptDraftCurrent(operation)) throw Error('Stale prompt operation'); };
            current(); await controller.ensureActive(); current();
            if (!promptStore) promptStore = new promptAPI.Store(root.LocalItabWorkspaces.manager.createPromptBackend(promptAPI));
            subscribePrompts(); current();
            const state = await promptStore.read(); current();
            await controller.ensureActive(); current();
            return state;
        }
        async function loadPrompts() {
            if (promptBlocked() || promptPicker.hidden || promptOperation) return;
            cancelPromptOperation(); clearPromptPreview(); promptRecord = null; promptRecords = []; promptRows = []; promptValues = Object.create(null);
            promptAvailable = false; promptMatches.hidden = true; promptMatches.textContent = '';
            promptSelect.replaceChildren(); promptVariables.replaceChildren();
            const operation = promptOperation = promptSnapshot();
            promptStatus.textContent = label('PromptLoading', 'Reading saved prompts…'); promptStatus.focus(); updatePromptPicker();
            try {
                const state = await readPromptState(operation);
                promptRecords = promptAPI.search(state).map(item => item.record);
                promptAvailable = true; renderPromptChoices();
            } catch (_) {
                if (promptOperation === operation && promptDraftCurrent(operation)) promptStatus.textContent = label('PromptReadError', 'Could not verify the saved prompts or current workspace. Your question is unchanged. Reload saved prompts to try again.');
            } finally {
                if (promptOperation === operation) {
                    promptOperation = null; if (!disposed) { updatePromptPicker(); if (!promptSearch.disabled && doc.activeElement === promptStatus) promptSearch.focus(); }
                }
            }
        }
        // Match only the loaded titles; no store read, regex or template rendering.
        const foldPromptTitle = value => value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
        function promptCandidates() {
            const query = foldPromptTitle(promptSearch.value);
            return promptRecords.filter(record => foldPromptTitle(record.title).includes(query));
        }
        function renderPromptChoices() {
            const matches = promptCandidates();
            const placeholder = el('option', '', label('PromptChoose', 'Choose a template')); placeholder.value = '';
            promptSelect.replaceChildren(placeholder);
            for (const record of matches) { const option = el('option', '', record.title); option.value = record.id; promptSelect.append(option); }
            promptSelect.value = '';
            promptMatches.textContent = `${label('PromptMatches', 'Matching titles')}: ${matches.length} / ${promptRecords.length}`; promptMatches.hidden = false;
            promptStatus.textContent = !promptRecords.length ? label('PromptEmpty', 'No unarchived saved prompts are available. Save a template in the prompt library first, then reload here.') :
                !matches.length ? label('PromptNoMatches', 'No template titles match. Change or clear the search. Your question is unchanged.') : label('PromptLoaded', 'Choose a template. Your question has not changed.');
        }
        function filterPrompts() {
            if (promptBlocked() || promptOperation || promptPicker.hidden || !promptAvailable) return;
            cancelPromptOperation(); clearPromptPreview(); promptRecord = null; promptRows = []; promptValues = Object.create(null); promptVariables.replaceChildren();
            renderPromptChoices(); updatePromptPicker();
        }
        promptSearch.addEventListener('input', filterPrompts);
        promptSearch.addEventListener('compositionstart', () => { promptComposing = true; });
        promptSearch.addEventListener('compositionend', () => { promptComposing = false; });
        promptSearch.addEventListener('focusout', () => { promptComposing = false; });
        promptSearch.addEventListener('keydown', event => {
            // Let the IME handle its own Escape, without closing the outer dialog.
            if (event.key === 'Escape' && (promptComposing || event.isComposing || event.keyCode === 229)) event.stopPropagation();
        });
        promptSelect.addEventListener('change', () => {
            if (promptBlocked() || promptOperation || promptPicker.hidden) return;
            cancelPromptOperation(); clearPromptPreview(); promptVariables.replaceChildren(); promptRows = []; promptValues = Object.create(null);
            promptRecord = promptCandidates().find(record => record.id === promptSelect.value) || null; promptStatus.textContent = '';
            try {
                if (promptRecord) for (const name of promptAPI.previewTemplate(promptRecord.body).variables) {
                    const wrapper = el('label', 'ai-context-field', `${label('PromptVariable', 'Variable')}: ${name}`);
                    const input = el('textarea'); input.rows = 2; input.maxLength = 4000; input.autocomplete = 'off'; input.spellcheck = false;
                    wrapper.append(input);
                    const setValue = value => {
                        if (promptBlocked() || promptOperation || promptPicker.hidden || !promptRows.includes(row)) return;
                        cancelPromptOperation(); clearPromptPreview(); promptValues[name] = value; promptStatus.textContent = ''; updatePromptPicker();
                    };
                    const empty = button('PromptEmptyValue', 'Use an empty value', () => { if (promptBlocked() || promptOperation || !promptRows.includes(row)) return; input.value = ''; setValue(''); });
                    empty.setAttribute('aria-label', `${label('PromptEmptyValue', 'Use an empty value')}: ${name}`);
                    const row = { input, empty, name }; promptRows.push(row); input.addEventListener('input', () => setValue(input.value));
                    promptVariables.append(wrapper, empty);
                }
            } catch (_) {
                promptRecord = null;
                promptStatus.textContent = label('PromptInvalid', 'This template cannot be used as a question. Check its variables and text in the prompt library. Nothing was replaced.');
            }
            updatePromptPicker();
        });
        function promptQuestion() {
            // Reuse the library parser, including escaped and non-recursive variables.
            return promptAPI.renderTemplate(promptRecord.body, promptValues);
        }
        function previewPrompt() {
            if (promptBlocked() || promptOperation || promptPicker.hidden || !promptRecord) return;
            cancelPromptOperation(); clearPromptPreview();
            try {
                const preview = promptAPI.previewTemplate(promptRecord.body, promptValues);
                if (!preview.complete) { promptStatus.textContent = `${label('PromptMissing', 'Fill every variable or explicitly use an empty value')}: ${preview.missing.join(', ')}`; updatePromptPicker(); return; }
                const text = promptQuestion();
                // PRE retains CR in textContent but may not paint a lone CR as a
                // line break. Normalize only its display copy, never the raw ticket.
                const display = text.replace(/\r\n?/g, '\n');
                promptPreview.textContent = display; promptPreview.hidden = false; promptCount.hidden = false;
                promptCount.textContent = `${label('BudgetQuestion', 'Question')}: ${text.length} / 4000 · ${label('PromptLineEndings', 'The preview displays line breaks as LF. Original line endings and whitespace are retained until you edit the question. Counts use the exact text, including CRLF and emoji.')}`;
                if (!text.trim() || text.length > 4000) {
                    promptStatus.textContent = label('PromptLimit', 'The replacement must contain text and fit within 4,000 UTF-16 units. Nothing is shortened or replaced.');
                } else {
                    promptTicket = { ...promptSnapshot(), record: promptRecord, text, display, values: JSON.stringify(promptValues) };
                    promptStatus.textContent = label('PromptReady', 'This preview will replace the entire question only when you choose Replace this question. Review the complete request again afterward.');
                }
            } catch (_) { promptStatus.textContent = label('PromptInvalid', 'This template cannot be used as a question. Check its variables and text in the prompt library. Nothing was replaced.'); }
            updatePromptPicker();
        }
        async function applyPrompt() {
            if (!promptDraftCurrent(promptTicket) || promptOperation) return;
            const ticket = promptTicket, record = ticket.record;
            const current = () => promptTicket === ticket && promptDraftCurrent(ticket) && promptRecord === record &&
                promptSelect.value === record.id && promptPreview.textContent === ticket.display && !promptPreview.hidden &&
                JSON.stringify(promptValues) === ticket.values && promptQuestion() === ticket.text &&
                promptRows.every(row => Object.hasOwn(promptValues, row.name) && row.input.value === promptValues[row.name]);
            if (!current()) { cancelPromptOperation(); clearPromptPreview(); updatePromptPicker(); return; }
            const operation = promptOperation = { ...promptSnapshot() };
            promptStatus.textContent = label('PromptChecking', 'Verifying this saved template and workspace…');
            if (doc.activeElement === promptApply || doc.activeElement === doc.body) promptStatus.focus();
            updatePromptPicker();
            try {
                const state = await readPromptState(operation), latest = state.records.find(item => item.id === record.id);
                if (!current() || !latest || latest.deletedAt !== null || latest.version !== record.version ||
                    latest.currentVersionId !== record.currentVersionId || latest.body !== record.body) throw Error('Changed prompt');
                // No await between final ownership checks, controller edit and assignment.
                const restoreFocus = promptPicker.contains(doc.activeElement) || doc.activeElement === doc.body;
                controller.edit(); question.value = ticket.text; appliedPromptQuestion = { raw: ticket.text, display: question.value };
                reviewText.hidden = taskList.hidden = true;
                closePrompts(); if (restoreFocus) question.focus();
                status.textContent = label('PromptApplied', 'Question replaced for this session. Review the complete request again before copying or sending. The previous response still belongs to its original request.');
                update();
            } catch (_) {
                if (promptOperation === operation && promptDraftCurrent(operation)) {
                    clearPromptPreview();
                    promptStatus.textContent = label('PromptApplyError', 'The saved template or workspace could not be verified unchanged. Nothing was replaced. Reload saved prompts and preview again.');
                    if (doc.activeElement === promptApply || doc.activeElement === doc.body) promptStatus.focus();
                }
            } finally { if (promptOperation === operation) { promptOperation = null; if (!disposed) updatePromptPicker(); } }
        }
        function renderPresets() {
            presetSelect.replaceChildren();
            const manual = el('option', '', presetText('PresetManual', 'New / unsaved connection')); manual.value = ''; presetSelect.append(manual);
            presets.forEach((item, index) => { const option = el('option', '', item.name); option.value = String(index); presetSelect.append(option); });
            presetSelect.value = selectedPreset ? String(presets.findIndex(item => item.name === selectedPreset.name)) : '';
        }
        // Reload metadata only. Never apply a connection, clear a draft or write storage.
        async function reloadPresets() {
            if (!presetStore || presetPending || disposed || controller.closed || pending || controller.busy || controller.taskCommand || controller.saveCommand || doc.visibilityState === 'hidden') return;
            const epoch = ++presetReloadEpoch, identity = controller.generation, previous = selectedPreset;
            const signature = () => JSON.stringify([presetName.value, url.value, model.value, key.value]);
            const before = signature();
            const current = () => !disposed && !controller.closed && box.isConnected && epoch === presetReloadEpoch &&
                doc.visibilityState !== 'hidden' && controller.generation === identity && selectedPreset === previous && signature() === before;
            presetPending = true; update();
            try {
                const state = await presetStore.read();
                if (!current()) return;
                // Construct every option before replacing the current list. A failed read/build is atomic.
                const manual = el('option', '', presetText('PresetManual', 'New / unsaved connection')); manual.value = '';
                const options = state.records.map((item, index) => { const option = el('option', '', item.name); option.value = String(index); return option; });
                const retained = previous && state.records.find(item => item.name === previous.name && item.url === previous.url && item.model === previous.model);
                presetSelect.replaceChildren(manual, ...options);
                presets = state.records; selectedPreset = retained || null; presetAvailable = true;
                presetSelect.value = retained ? String(presets.indexOf(retained)) : '';
                status.textContent = presetText('PresetReloaded', 'Saved connections reloaded. Your current fields and response are unchanged. Choose a connection explicitly to apply it; changed or deleted connections are now detached from this draft.');
            } catch (_) {
                if (current()) status.textContent = presetText('PresetReloadFailed', 'Could not reload saved connections. The current list and draft are unchanged. Try again.');
            } finally { presetPending = false; if (!disposed) update(); }
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
            } catch (reason) { if (!disposed) status.textContent = presetText(reason?.code === 'CONFLICT' ? 'PresetConflict' : 'PresetError', reason?.code === 'CONFLICT' ? 'This preset changed in another tab. Reload saved connections, then explicitly choose the current connection before editing it.' : 'Could not save or load presets. Use a unique name, valid endpoint and model ID. No credentials are saved.'); }
            finally { presetPending = false; if (!disposed) update(); }
        }
        const presetSave = button('PresetSave', 'Save connection preset', () => changePreset(false));
        const presetDelete = button('PresetDelete', 'Delete connection preset', () => changePreset(true));
        const presetReload = button('PresetReload', 'Reload saved connections', () => void reloadPresets());
        presetReload.textContent = presetText('PresetReload', 'Reload saved connections');
        presetActions.append(presetSave, presetDelete, presetReload); renderPresets();
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
        function updateLocalReview() {
            const ticket = controller.localReview;
            const valid = ticket && !disposed && !controller.closed && ticket.generation === controller.generation;
            if (!valid) { localPanel.hidden = true; localText.value = ''; }
            if (!valid || (localCopy && localCopy.ticket !== ticket)) localCopy = null;
            localStatus.textContent = '';
            reviewLocal.disabled = selectionBlocked();
            updateLocalCopyState();
        }
        function updateLocalCopyState() {
            const ticket = controller.localReview;
            const valid = ticket && !disposed && !controller.closed && ticket.generation === controller.generation;
            copyLocal.disabled = selectionBlocked() || copying || !valid || localPanel.hidden || Boolean(localCopy) ||
                !box.isConnected || doc.visibilityState === 'hidden';
        }
        function requestMode(packed) {
            return `${label('Mode', 'Output')}: ${packed.mode === 'tasks' ? label('Tasks', 'Draft tasks for review') : label('Answer', 'Answer')} · ${packed.stream ? label('StreamOn', 'Progressive answer: on') : label('StreamOff', 'Progressive answer: off')}`;
        }
        const reviewLocal = button('ReviewLocal', 'Review prompt locally', () => {
            if (selectionBlocked()) return;
            return action(async () => {
                const ticket = await controller.reviewLocal({ question: questionText(), selected: selectedSources(), mode: mode.value, stream: mode.value === 'answer' && stream.checked });
                if (disposed || controller.closed || controller.localReview !== ticket) return;
                localMode.textContent = requestMode(ticket.packed); localText.value = ticket.packed.prompt; localPanel.hidden = false; reviewText.hidden = taskList.hidden = true;
            }, ['LocalReviewed', 'Local prompt ready to inspect. No endpoint or model is needed. Copying is a separate action; nothing has been sent or saved.']);
        });
        const copyLocal = button('CopyLocal', 'Copy reviewed prompt', async () => {
            if (selectionBlocked() || copying || localCopy || localPanel.hidden || !controller.localReview ||
                !box.isConnected || doc.visibilityState === 'hidden') return;
            const ticket = controller.localReview, operation = { ticket }, generation = copyGeneration;
            const current = () => localCopy === operation && !selectionBlocked() && controller.localReview === ticket &&
                generation === copyGeneration && box.isConnected && doc.visibilityState !== 'hidden' &&
                controller.generation === ticket.generation && !localPanel.hidden && localText.value === ticket.packed.prompt;
            if (localText.value !== ticket.packed.prompt) return;
            localCopy = operation; copying = true; localStatus.textContent = ''; updateCopy();
            if (doc.activeElement === copyLocal || doc.activeElement === doc.body) localStatus.focus();
            try {
                await controller.copyLocalPrompt(ticket, text => {
                    if (!current()) throw new Error('Stale local review');
                    if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
                    return clipboard.writeText(text);
                });
                if (current()) localStatus.textContent = label('LocalCopied', 'Reviewed prompt copied. Check for private information before pasting into an external service. Nothing was saved.');
            } catch (_) {
                if (current()) localStatus.textContent = label('LocalCopyBlocked', 'Copy could not be confirmed. Select the complete prompt above to copy it manually. Check the current workspace before continuing.');
            } finally {
                if (!disposed && localCopy === operation && controller.localReview !== ticket) {
                    // Only this unchanged review losing its ticket needs workspace feedback.
                    // Edits, newer reviews and closed controllers own their own status/focus.
                    const invalidated = !controller.closed && box.isConnected && doc.visibilityState !== 'hidden' &&
                        generation === copyGeneration && controller.generation === ticket.generation && controller.localReview === null;
                    const hiddenFocus = invalidated && localPanel.contains(doc.activeElement);
                    updateLocalReview();
                    if (invalidated) {
                        status.textContent = label('LocalCopyWorkspaceInvalid', 'The current workspace could not be verified, so this local review was cleared. The copy result cannot be confirmed; the clipboard may already contain this prompt. Close this panel, reopen an available workspace, and review again.');
                        if (hiddenFocus) status.focus();
                    }
                }
                if (localCopy === operation) localCopy = null;
                copying = false; if (!disposed) updateCopy();
            }
        });
        localPanel.append(copyLocal, localStatus);
        const review = button('Review', 'Review exact request', () => action(async () => {
            const selected = selectedSources();
            const result = await controller.review({ url: url.value, model: model.value, question: questionText(), selected, mode: mode.value, stream: mode.value === 'answer' && stream.checked });
            reviewText.textContent = `${requestMode(result.packed)}\n${result.request.url}\n${result.request.model}\n\n${result.request.prompt}`; reviewText.hidden = false; taskList.hidden = true;
        }, ['Reviewed', 'Review the full destination, model and exact outgoing text. Source text is reference material, not trusted instructions.']));
        const allow = button('Allow', 'Allow this endpoint', () => {
            if (pending || presetPending || disposed || !controller.reviewed) return;
            // Start permission request directly in user activation, before async UI work.
            let permission; try { permission = controller.allow(); } catch (_) { error(); return; }
            void action(async () => { if (!await permission) throw Error('Permission denied'); }, ['Allowed', 'Endpoint access allowed. This has not sent a request.']);
        });
        const confirmDiscard = key => !controller.result || controller.saved || Boolean(root.confirm?.(key === 'ReplaceResult' ? label('ReplaceResult', 'Send a new request? A successful response will replace this unsaved response. Cancel to keep it and save or add its tasks first.') : label('DiscardResult', 'Clear this draft and discard its unsaved response?')));
        const loadExternal = button('ExternalTasksLoad', 'Load task JSON for review', () => {
            if (selectionBlocked() || externalPanel.hidden || doc.visibilityState === 'hidden' || !box.isConnected) return;
            const value = externalInput.value, epoch = externalEpoch, draftCurrent = captureDraft();
            const current = () => !disposed && !controller.closed && box.isConnected && doc.visibilityState !== 'hidden' &&
                mode.value === 'tasks' && epoch === externalEpoch && externalInput.value === value && draftCurrent();
            if (((controller.result && !controller.saved) || controller.partial) &&
                !root.confirm?.(label('ExternalTasksReplace', 'Load this external JSON and replace the current unsaved response or incomplete draft? Cancel keeps both the current response and pasted JSON. Your question and excerpts stay unchanged.'))) return;
            // Confirmation is not consent to discard edits made while it was open.
            if (!current() || selectionBlocked()) return;
            return action(async () => {
                let result;
                try { result = await controller.loadExternalTasks(value, { mode: mode.value, replaceUnsaved: true, isCurrent: current }); }
                catch (reason) {
                    if (['LIMIT', 'TASK_FORMAT'].includes(reason.code)) throw Object.assign(new Error('Invalid external task JSON'), { code: 'EXTERNAL_TASK_FORMAT' });
                    throw reason;
                }
                if (disposed || controller.closed || controller.result !== result) return;
                output.value = result.text; externalInput.value = ''; externalEpoch++;
                includeContext.checked = false; reviewText.hidden = taskList.hidden = true;
            }, ['ExternalTasksLoaded', 'External task JSON loaded locally. Choose tasks, review the selected list, then confirm to add it. No request was sent and nothing has been saved.']);
        });
        externalPanel.append(loadExternal);
        externalInput.addEventListener('input', () => { externalEpoch++; update(); });
        const send = button('Send', 'Send reviewed request', () => {
            if (pending || presetPending || disposed || controller.busy || !confirmDiscard('ReplaceResult')) return;
            return action(async () => {
            const reviewed = controller.reviewed;
            try {
                const result = await controller.send(key.value, { replaceUnsaved: true, onProgress: queuePartial });
                if (!disposed && !controller.closed && controller.reviewed === reviewed &&
                    controller.generation === reviewed.generation && controller.result === result) {
                    output.value = result.text; outputLabel.hidden = false; includeContext.checked = false; taskList.hidden = true;
                    if (!titleEdited) answerTitle.value = reviewed.packed.question.slice(0, 200).replace(/[\uD800-\uDBFF]$/u, '');
                }
            }
            finally { key.value = ''; }
        }, ['Received', 'Response received, not saved. Model claims and source citations have not been verified.']); });
        const stop = button('Stop', 'Stop request', () => { controller.stop(); key.value = ''; status.textContent = label('Stopped', 'Stopped. The provider may still charge for work already started.'); update(); });
        function canCopyResponse() {
            return !disposed && !controller.closed && !copying && !controller.partial && Boolean(controller.result) &&
                box.isConnected && doc.visibilityState !== 'hidden' && !outputLabel.hidden && Boolean(output.value.trim());
        }
        function updateCopy() {
            copy.disabled = !canCopyResponse();
            copy.textContent = controller.result?.mode === 'tasks' ? label('CopyTasks', 'Copy task JSON') : label('CopyAnswer', 'Copy answer');
            answerReader?.refreshCopyState?.();
            updateLocalCopyState();
        }
        async function copyResponse(text, target) {
            if (!canCopyResponse() || (target ? !target.current() : output.value !== text)) return;
            // Own the displayed response and its original review, even when copying one rendered block.
            const displayed = output.value, result = controller.result, reviewed = controller.resultReview, generation = copyGeneration;
            const current = () => !disposed && !controller.closed && generation === copyGeneration &&
                box.isConnected && doc.visibilityState !== 'hidden' && !controller.partial &&
                controller.result === result && controller.resultReview === reviewed && !outputLabel.hidden &&
                output.value === displayed && (!target || target.current());
            const feedback = target?.status || copyStatus;
            copying = true; feedback.textContent = ''; updateCopy();
            if (!target && (doc.activeElement === copy || doc.activeElement === doc.body)) copyStatus.focus();
            try {
                // No asynchronous preflight: preserve user activation and serialize every response copy.
                if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
                await clipboard.writeText(text);
                if (current()) feedback.textContent = target?.copied || label('Copied', 'Response copied.');
            } catch (_) {
                if (current()) feedback.textContent = target?.blocked || label('CopyBlocked', 'Copy was blocked. Select the response text to copy it manually.');
            } finally { copying = false; if (!disposed) updateCopy(); }
        }
        const copy = button('CopyAnswer', 'Copy answer', () => copyResponse(output.value));
        const save = button('Save', 'Save answer to AI collection', () => action(() => controller.saveAnswer(answerTitle.value, { includeContext: includeContext.checked }), ['Saved', 'Saved to the existing global AI collection. Saved answers join unencrypted local backups.']));
        const verifySave = button('VerifySave', 'Check earlier save', () => action(() => controller.verifyAnswerSave(), ['SaveVerified', 'The original save was confirmed from its receipt. This does not guarantee the answer is still present: it may have been changed or deleted later. No content was written or sent. You can now clear this draft or start a new request.']));
        const reviewTasks = button('ReviewTasks', 'Review extracted tasks', () => action(async () => {
            const result = await controller.reviewTasks(); taskList.replaceChildren(...result.texts.map(value => el('li', '', value))); taskList.hidden = false;
        }, ['TasksReviewed', 'Check every task above. Confirmation adds exactly this list to the current workspace. No task is executed.']));
        const confirm = button('Confirm', 'Add these tasks', () => action(async () => {
            await controller.confirmTasks(); taskList.hidden = true; outputLabel.hidden = true;
        }, ['TasksSaved', 'Reviewed tasks added to this workspace.']));
        const verifyTasks = button('VerifyTasks', 'Check existing task batch', () => action(async () => {
            await controller.verifyTaskBatch(); taskList.hidden = true; outputLabel.hidden = true;
        }, ['TasksVerified', 'The complete original task batch is currently present and unchanged. Nothing was written or sent. You can now clear this draft or start a new request.']));
        const reset = button('Cancel', 'Cancel / clear draft', () => { if (pending || controller.busy || controller.taskCommand || controller.saveCommand) return;
            const current = captureDraft();
            const allowed = externalInput.value
                ? root.confirm?.(label('ExternalTasksDiscard', 'Clear this draft, including the pasted external task JSON and current response?'))
                : confirmDiscard('DiscardResult');
            if (!allowed || !current() || selectionBlocked()) return;
            closePrompts(); invalidate(true); key.value = ''; output.value = ''; externalInput.value = ''; externalEpoch++; question.value = ''; appliedPromptQuestion = null; answerTitle.value = ''; titleEdited = false;
            for (const row of sourceRows) { row.check.checked = false; row.input.hidden = true; row.input.value = row.source.text; row.rawText = row.source.text; } collectionTicket = null; collectionUsed = false; collectionPanel.hidden = true; sourceSearch.value = ''; sourceScope.value = 'all'; selectedOnly = false; update(); });
        const actions = el('div', 'ai-context-actions'); actions.append(review, allow, send, stop);
        const results = el('div', 'ai-context-actions'); results.append(copy, save, verifySave, reviewTasks, confirm, verifyTasks);
        answerTitle.addEventListener('input', () => { titleEdited = true; });
        includeContext.addEventListener('change', update);
        const localActions = el('div', 'ai-context-actions ai-context-local-actions'); localActions.append(reviewLocal, reset);
        connection.append(actions, reviewText);
        // Keep each control in one DOM location. Disclosure changes presentation only,
        // never the draft, authorization ticket, key lifetime or response ownership.
        resultPane.append(contextSave, taskSelection, taskList, results, copyStatus);
        questionPane.append(localActions, localPanel, externalPanel, connection, status, partialPanel, resultPane);
        workbench.append(sourcesPane, questionPane); box.append(workbench); host.append(box);
        for (const input of [url, model, question, mode, stream]) input.addEventListener(input === mode || input === stream ? 'change' : 'input', () => { if (input === question) appliedPromptQuestion = null; if (input === url || input === model || input === mode || input === stream) key.value = ''; if (input === mode) stream.checked = false; invalidate(); });
        output.addEventListener('input', () => {
            try {
                controller.editResult(output.value); taskList.hidden = true;
                status.textContent = label('TaskEditChanged', 'Task JSON changed. Review the edited tasks again before adding them.');
            } catch (reason) {
                if (controller.result && controller.invalidTaskEdit === controller.result) {
                    taskList.hidden = true; status.textContent = '';
                } else error(reason.code);
            }
            update();
        });
        function buildSourceRows(values) {
            return values.map(source => {
                const row = el('div', 'ai-context-source'), sourceLabel = el('label'), check = el('input'); check.type = 'checkbox'; check.checked = false;
                const input = el('textarea'); input.value = source.text; input.maxLength = 16000; input.rows = 3; input.hidden = true;
                input.setAttribute('aria-label', `${label('Excerpt', 'Outgoing excerpt')}: ${source.label}`);
                const sourceBudget = el('span', 'ai-context-source-budget'); sourceBudget.hidden = true;
                const state = { source, node: row, searchTitle: source.label.toLowerCase(), check, input, budget: sourceBudget, initialText: input.value, rawText: source.text };
                const restore = button('SourceRestore', 'Restore original excerpt', () => restoreExcerpt(state));
                restore.className = 'ai-context-source-restore';
                restore.title = label('SourceRestoreHelp', 'Restore this excerpt to its most recently loaded text. The saved source is unchanged.');
                restore.setAttribute('aria-label', `${label('SourceRestore', 'Restore original excerpt')}: ${source.label}`);
                state.restore = restore;
                sourceLabel.append(check, el('span', '', `${source.scope === 'workspace' ? label('Workspace', 'Workspace note') : label('Global', 'Global collection')}: ${source.label}`));
                row.append(sourceLabel, input, sourceBudget, restore);
                check.addEventListener('change', () => { if (selectionBlocked() || !sourceRows.includes(state)) return; input.hidden = !check.checked; invalidate(); });
                input.addEventListener('input', () => { if (!selectionBlocked() && sourceRows.includes(state)) { state.rawText = null; invalidate(); } });
                return state;
            });
        }
        async function loadSourceRows(reload) {
            if (selectionBlocked()) return;
            // Include unselected and filtered-out edits. Cancellation must not read or invalidate anything.
            if (reload && sourceRows.some(row => row.check.checked || sourceText(row) !== row.source.text) &&
                !root.confirm?.(label('SourceReloadConfirm', 'Reload saved sources? On success, all source selections and excerpt edits will be cleared, including hidden and unselected excerpts. Your question, connection, filters, answer title and previous response with its original snapshot will be kept.'))) return;
            if (selectionBlocked()) return;
            const generation = controller.generation;
            pending = true; update();
            try {
                const values = await controller.loadSources();
                if (disposed || controller.closed) return;
                controller.current(generation);
                // Build every row off-screen before invalidating the review or replacing any visible state.
                const nextRows = buildSourceRows(values);
                controller.current(generation);
                if (reload) controller.edit();
                sourceList.replaceChildren(...nextRows.map(row => row.node)); sourceRows = nextRows; sourcesLoaded = true;
                if (reload) {
                    reviewText.hidden = taskList.hidden = true;
                    status.textContent = label('SourceReloaded', 'Saved sources reloaded. Nothing is selected. Review the exact request again before sending; the previous response still belongs to its original request.');
                } else status.textContent = label('Choose', 'Select only the sources you want to send. You can edit or remove each selected excerpt.');
            } catch (_) {
                if (!disposed && !controller.closed) status.textContent = label('SourceReloadError', 'Could not load saved sources. The current sources, excerpt edits and reviews are unchanged. Try Reload saved sources again after checking this workspace.');
            } finally { pending = false; if (!disposed) update(); }
        }
        function collectionSelection() {
            const source = collectionTicket?.source;
            const row = source && sourceRows.find(row => row.source.id === source.id && row.check.checked);
            const exact = Boolean(row && sourceText(row) === source.text &&
                ['id', 'label', 'text', 'revision', 'bodyVersionId', 'sourceUrl'].every(key => row.source[key] === source[key]));
            return { row, exact };
        }
        function updateCollectionSelection() {
            // A native browser may blur this button as soon as it is disabled.
            // Only that button's current focus belongs to this status update.
            const ownedFocus = doc.activeElement === collectionApply;
            const { row, exact } = collectionSelection();
            collectionApply.textContent = collectionUsed
                ? label('CollectionApplyAgain', 'Use this excerpt again')
                : label('CollectionApply', 'Use this excerpt for this question');
            collectionApply.disabled = selectionBlocked() || !collectionTicket || collectionInvalidated || exact;
            if (collectionPanel.hidden) return;
            const unavailable = label('CollectionUnavailable', 'This exact saved version is unavailable or could not be verified. Close this panel, refresh the collection and start again from its current saved detail.');
            if (!collectionTicket) { if (collectionInvalidated) collectionStatus.textContent = unavailable; }
            else {
                const current = exact
                    ? label('CollectionApplied', 'This exact reviewed excerpt is selected for this question. The body and attribution above remain the reviewed snapshot. Review the complete question before copying or sending.')
                    : row
                    ? label('CollectionSelectedDifferent', 'This source is selected, but its outgoing text or saved version differs from the reviewed body above. Review the current outgoing excerpt below; the body above stays unchanged.')
                    : !collectionUsed && !collectionInvalidated
                    ? label('CollectionReady', 'The exact current saved version was verified. Review it above, then choose Use this excerpt. It is not selected yet.')
                    : label('CollectionNotSelected', 'This reviewed excerpt is not selected for this question. The body and attribution above remain the reviewed snapshot.');
                collectionStatus.textContent = current + (collectionInvalidated ? ` ${unavailable}` : !exact && collectionUsed
                    ? ` ${label('CollectionReuseReady', 'Choose Use this excerpt again to recheck and select the same saved version.')}` : '');
            }
            if (ownedFocus && collectionApply.disabled && collectionPanel.isConnected && doc.visibilityState !== 'hidden') collectionStatus.focus();
        }
        function collectionUnavailable() {
            // Keep the reviewed snapshot and current outgoing draft distinct.
            // Invalidation never selects, clears or substitutes a source row.
            collectionInvalidated = true;
            updateCollectionSelection();
        }
        async function reviewCollection() {
            if (!collectionRequest || selectionBlocked()) return;
            if (collectionInvalidated) { collectionUnavailable(); update(); return; }
            const epoch = ++collectionEpoch;
            pending = true; collectionStatus.textContent = label('CollectionLoading', 'Verifying this exact saved excerpt locally…'); update();
            try {
                if (!sourcesLoaded || !collectionCurrent?.()) throw Error('Sources unavailable');
                const subscription = collectionSubscription = {};
                subscription.unsubscribe = controller.collectionStore.subscribe(() => {
                    if (disposed || collectionSubscription !== subscription || collectionPanel.hidden) return;
                    collectionInvalidated = true; collectionEpoch++; collectionUnavailable(); update();
                });
                const source = await controller.loadCollection(collectionRequest);
                if (disposed || controller.closed || epoch !== collectionEpoch || doc.visibilityState === 'hidden') return;
                if (!collectionCurrent()) throw Error('Source view changed');
                const info = `${source.label}\n${source.id}\n${label('CollectionVersion', 'Saved record version')}: ${source.revision}\n${label('CollectionBodyVersion', 'Body version')}: ${source.bodyVersionId}\n${label('CollectionSource', 'User-provided source URL (not fetched)')}: ${source.sourceUrl || label('CollectionNoSource', 'Not supplied')}`;
                const display = source.text.replace(/\r\n?/g, '\n');
                collectionInfo.textContent = info; collectionText.textContent = display;
                collectionTicket = { source, info, display, epoch };
                collectionStatus.textContent = label('CollectionReady', 'The exact current saved version was verified. Review it above, then choose Use this excerpt. It is not selected yet.');
            } catch (_) { if (!disposed && epoch === collectionEpoch) collectionUnavailable(); }
            finally { pending = false; if (!disposed) update(); }
        }
        async function applyCollection() {
            const ticket = collectionTicket;
            if (selectionBlocked() || !ticket || collectionInvalidated || collectionSelection().exact || !collectionPanel.isConnected || doc.visibilityState === 'hidden') return;
            const existing = sourceRows.find(row => row.source.id === ticket.source.id);
            if (existing && sourceText(existing) !== existing.source.text && !root.confirm?.(label('CollectionReplaceExcerpt', 'Replace this source’s edited outgoing excerpt with the exact saved body reviewed above? Cancel keeps your draft unchanged.'))) return;
            if (selectionBlocked() || collectionInvalidated || ticket !== collectionTicket) return;
            const selected = sourceRows.filter(row => row.check.checked).length;
            if (!existing?.check.checked && selected >= 12) { collectionStatus.textContent = label('CollectionSelectionLimit', 'Deselect another source before adding this excerpt. Nothing was changed.'); return; }
            const generation = controller.generation;
            const current = () => !disposed && !controller.closed && !collectionInvalidated && ticket === collectionTicket && ticket.epoch === collectionEpoch &&
                generation === controller.generation && !controller.busy && !controller.taskCommand && !controller.saveCommand &&
                collectionCurrent?.() && collectionPanel.isConnected && doc.visibilityState !== 'hidden' && collectionInfo.textContent === ticket.info && collectionText.textContent === ticket.display;
            const previousStatus = status.textContent;
            let applied = false;
            pending = true; update();
            try {
                if (!current()) throw Error('Stale review');
                const source = await controller.loadCollection(collectionRequest);
                if (!current() || ['id', 'label', 'text', 'revision', 'bodyVersionId', 'sourceUrl'].some(key => source[key] !== ticket.source[key])) throw Error('Stale source');
                const next = buildSourceRows([source])[0];
                controller.edit(); // The controller's uncertain-write lock still owns this edit.
                next.check.checked = true; next.input.hidden = false;
                if (existing) sourceRows = sourceRows.map(row => row === existing ? next : row); else sourceRows = [next, ...sourceRows];
                sourceList.replaceChildren(...sourceRows.map(row => row.node));
                collectionUsed = applied = true; reviewText.hidden = taskList.hidden = true;
                // This successful selection invalidates old reload/review feedback,
                // but a newer message arriving during the read keeps its ownership.
                if (status.textContent === previousStatus) status.textContent = label('SourceBatchChanged', 'Selection changed. Review the exact request again before sending.');
                // Reveal the explicit selection, rather than leaving it hidden by an older filter.
                sourceSearch.value = ''; sourceScope.value = 'all'; selectedOnly = false;
            } catch (_) { if (!disposed) collectionUnavailable(); }
            finally { pending = false; if (!disposed) { update(); if (applied) question.focus(); } }
        }
        const ready = loadSourceRows(false);
        // Compare live, session-only draft values with the blank/unselected state.
        // Keep the DOM-normalized source baseline so untouched CRLF excerpts are clean.
        function hasUncommittedWork() {
            return !disposed && Boolean(controller.busy || controller.partial || controller.result || controller.taskCommand || controller.saveCommand ||
                question.value || externalInput.value || collectionTicket || !promptPicker.hidden || (titleEdited && answerTitle.value !== initialAnswerTitle) || sourceRows.some(row => row.check.checked || sourceText(row) !== row.source.text));
        }
        function captureDraft() {
            // A confirmation cannot authorize discarding edits made while the host awaits readiness.
            const signature = () => JSON.stringify([controls.map(input => [input.value, input.checked]), mode.value, stream.checked,
                sourceRows.map(row => [row.source.id, row.input.value, row.rawText, row.check.checked]), sourceSearch.value, sourceScope.value, selectedOnly,
                answerTitle.value, output.value, externalInput.value, externalEpoch, includeContext.checked, promptPicker.hidden, promptSelect.value, promptSearch.value,
                promptRows.map(row => [row.name, row.input.value]), promptPreview.textContent, promptEpoch, collectionEpoch]);
            const before = signature(), generation = controller.generation, result = controller.result, reviewed = controller.reviewed, localReview = controller.localReview;
            const taskSelection = controller.taskSelection, taskReview = controller.taskReview;
            return () => !disposed && generation === controller.generation && result === controller.result && reviewed === controller.reviewed &&
                localReview === controller.localReview && taskSelection === controller.taskSelection && taskReview === controller.taskReview && before === signature();
        }
        function guard(event) { if (hasUncommittedWork()) { event.preventDefault(); event.returnValue = ''; } }
        function destroy() { if (disposed) return; collectionEpoch++; const subscription = collectionSubscription; collectionSubscription = null; try { subscription?.unsubscribe?.(); } catch (_) {} collectionTicket = null; closePrompts(); appliedPromptQuestion = null; disposed = true; answerReader?.destroy(); answerReader = null; readerResult = null; cancelPartialFrame(); localCopy = null; localText.value = ''; output.value = ''; externalInput.value = ''; externalEpoch++; loadExternal.disabled = true; copyLocal.disabled = reviewLocal.disabled = true; copy.disabled = true; selectVisible.disabled = deselectVisible.disabled = clearSelection.disabled = reloadSources.disabled = true; for (const row of sourceRows) row.restore.disabled = true; key.value = ''; controller.close(); root.removeEventListener('pagehide', destroy); root.removeEventListener('beforeunload', guard); doc.removeEventListener('visibilitychange', onVisibility); box.remove(); }
        function onVisibility() {
            if (doc.visibilityState !== 'hidden') { if (!disposed) { renderTaskSelection(pending || controller.busy || presetPending || Boolean(controller.taskCommand || controller.saveCommand)); update(); } return; }
            if (collectionRequest && !collectionPanel.hidden) { collectionInvalidated = true; collectionEpoch++; collectionUnavailable(); }
            externalEpoch++; presetReloadEpoch++; closePrompts(); key.value = ''; controller.stop(); if (!disposed) update();
        }
        doc.addEventListener('visibilitychange', onVisibility);
        root.addEventListener('pagehide', destroy); root.addEventListener('beforeunload', guard);
        const presetsReady = presetStore ? Promise.resolve().then(() => presetStore.read()).then(state => {
            if (disposed) return; presets = state.records; presetAvailable = true; renderPresets();
        }).catch(() => { if (!disposed) status.textContent = presetText('PresetUnavailable', 'Saved connections are unavailable. You can still enter a connection manually.'); }).finally(() => { presetPending = false; if (!disposed) update(); }) : Promise.resolve();
        presetPending = Boolean(presetStore);
        update(); return { controller, ready: Promise.all([ready, presetsReady]).then(() => reviewCollection()), get pending() { return selectionBlocked() || Boolean(promptOperation); }, destroy, presetSelect, presetName, presetSave, presetDelete, presetReload, hasUncommittedWork, captureDraft };
    }
    root.LocalItabAIContextView = { mount };
})(typeof window === 'undefined' ? globalThis : window);
