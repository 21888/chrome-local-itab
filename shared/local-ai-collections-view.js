/* Local, text-only excerpts. Source links are never fetched or previewed. */
(function (root) {
    'use strict';
    class View {
        constructor({ host, controller, translate, clipboard = root.navigator?.clipboard, confirm } = {}) {
            this.host = host; this.doc = host.ownerDocument; this.controller = controller;
            this.t = translate || ((key, fallback) => { const value = root.i18n?.t(`collections${key}`); return value && value !== `collections${key}` ? value : fallback; });
            this.clipboard = clipboard; this.confirm = confirm || (options => this.dialog(options));
            this.proposals = new Map(); this.revisionDraft = null; this.revisionContext = null; this.openDialog = false; this.detailGeneration = 0; this.copyGeneration = 0;
            controller.onChange = kind => { if (kind === 'dispose') { this.destroy(); return; } if (this.revisionContext && !this.revisionContext.current()) this.cancelRevision(); this.updateImportButton(); this.updateImport?.(); this.updateComparison?.(); this.updateHistoricalPrompt?.(); this.refreshCopyState(); if (kind === 'comparison') return; return kind === 'capture' ? this.renderCaptureStatus() : kind === 'prompts' ? this.updatePromptPanel() : kind === 'draft' ? this.updateEditor() : kind === 'list' ? this.renderList() : this.render(); };
            this.pageHide = event => {
                if (!event?.persisted) { this.destroy(); return; }
                this.cancelRevision();
                this.detailGeneration++;
                this.answerReader?.destroy(); this.answerReader = null;
                this.closeImport?.();
                this.closeHistoricalPrompt?.();
                this.markdownGeneration = (this.markdownGeneration || 0) + 1;
                this.cancelMarkdownDialog?.();
                this.closeComparison?.();
            };
            this.pageShow = event => { if (event?.persisted && !this.destroyed && !controller.disposed) this.render(); };
            this.visibilityChange = () => { if (this.doc.visibilityState === 'hidden') this.copyGeneration++; this.refreshCopyState(); };
            this.doc.addEventListener('visibilitychange', this.visibilityChange);
            root.addEventListener?.('pagehide', this.pageHide);
            root.addEventListener?.('pageshow', this.pageShow);
            this.build(); this.attachSearchShortcut();
        }
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.cancelRevision();
            this.answerReader?.destroy(); this.answerReader = null;
            this.closeImport?.();
            this.detailGeneration++;
            this.closeHistoricalPrompt?.();
            this.detachSearchShortcut?.();
            this.doc.removeEventListener('visibilitychange', this.visibilityChange);
            root.removeEventListener?.('pagehide', this.pageHide);
            root.removeEventListener?.('pageshow', this.pageShow);
            root.removeEventListener?.('beforeunload', this.beforeUnload);
            this.markdownGeneration = (this.markdownGeneration || 0) + 1;
            this.cancelMarkdownDialog?.();
            this.closeComparison?.();
        }
        attachSearchShortcut() {
            this.detachSearchShortcut?.();
            if (this.destroyed || this.controller.disposed) return;
            let composing = null;
            const start = event => { composing = event.target; };
            const end = event => { if (composing === event.target) composing = null; };
            const editable = element => {
                for (let node = element; node; node = node.parentElement) {
                    if (/^(INPUT|TEXTAREA|SELECT)$/i.test(node.tagName) || node.isContentEditable ||
                        (node.getAttribute?.('contenteditable') != null && node.getAttribute('contenteditable') !== 'false')) return true;
                }
                return false;
            };
            const keydown = event => {
                if (composing && (!composing.isConnected || !composing.contains(this.doc.activeElement))) composing = null;
                if (event.defaultPrevented || event.key !== '/' || event.isComposing || event.keyCode === 229 || composing ||
                    event.repeat || event.ctrlKey || event.metaKey || event.altKey || this.controller.disposed ||
                    this.openDialog || this.comparison || this.exportingMarkdown || !this.search.isConnected ||
                    this.search.disabled || this.host.inert || editable(event.target) || editable(this.doc.activeElement) ||
                    this.doc.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return;
                this.search.focus();
                if (this.doc.activeElement !== this.search) return;
                event.preventDefault();
                this.search.select();
            };
            const listeners = [['keydown', keydown], ['compositionstart', start], ['compositionend', end], ['focusout', end]];
            for (const [type, listener] of listeners) this.doc.addEventListener(type, listener);
            this.detachSearchShortcut = () => {
                for (const [type, listener] of listeners) this.doc.removeEventListener(type, listener);
                composing = null;
            };
        }
        el(tag, className = '', text) { const node = this.doc.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; }
        button(key, fallback, action, className = '') { const node = this.el('button', className, this.t(key, fallback)); node.type = 'button'; node.addEventListener('click', () => { if (!node.disabled) void action(); }); return node; }
        paragraph(key, fallback, className = 'prompt-help') { return this.el('p', className, this.t(key, fallback)); }
        field(parent, key, fallback, value, update, multiline = false) {
            const label = this.el('label', 'prompt-field'); const input = this.el(multiline ? 'textarea' : 'input'); input.value = value;
            input.setAttribute('data-collection-field', key); input.autocomplete = 'off'; input.spellcheck = false;
            if (multiline) input.rows = key === 'body' ? 10 : 4;
            input.addEventListener('input', () => update(input.value)); label.append(this.el('span', '', this.t(key, fallback)), input); parent.append(label); return input;
        }
        build() {
            const c = this.controller;
            this.shell = this.el('div', 'prompt-shell collection-shell');
            const brand = this.el('div', 'prompt-brand');
            const mark = this.el('img', 'prompt-brand-mark'); mark.src = 'assets/icon48.png'; mark.alt = ''; mark.width = 28; mark.height = 28; mark.setAttribute('aria-hidden', 'true');
            brand.append(mark, this.el('span', 'prompt-brand-name', 'LOCAL ITAB / AI WORKBENCH'));
            const header = this.el('header', 'prompt-header'), heading = this.el('div'); heading.append(this.paragraph('Eyebrow', 'YOUR LOCAL REFERENCE SHELF', 'prompt-eyebrow'), this.el('h1', '', this.t('Heading', 'AI result collection')), this.paragraph('Subtitle', 'Keep the answers worth returning to. Paste an exact excerpt, then add your own context.', 'prompt-subtitle'));
            const actions = this.el('div', 'prompt-header-actions');
            for (const [key, label, href] of [['Back', 'New tab', 'newtab.html'], ['Prompts', 'Prompt library', 'prompts.html']]) {
                const link = this.el('a', 'prompt-link', this.t(key, label)); link.href = href;
                link.addEventListener('click', event => { if (c.hasUncommittedWork() || this.revisionDraft !== null || this.proposals.size) { event.preventDefault(); void this.leave(href); } }); actions.append(link);
            }
            this.importButton = this.button('Import', 'Import / recover JSON', () => this.importFile());
            this.exportButton = this.button('Export', 'Export', () => this.exportFile());
            this.newButton = this.button('New', 'Save an excerpt', () => { c.create(); this.main.querySelector('input')?.focus(); }, 'prompt-primary'); actions.append(this.importButton, this.exportButton, this.newButton); header.append(heading, actions);
            this.captureStatus = this.el('div', 'prompt-status'); this.captureStatus.setAttribute('role', 'status'); this.captureStatus.setAttribute('aria-live', 'polite');
            this.status = this.el('div', 'prompt-status'); this.status.tabIndex = -1; this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            const layout = this.el('div', 'prompt-layout'), sidebar = this.el('aside', 'prompt-sidebar'); sidebar.setAttribute('aria-label', this.t('Browse', 'Browse saved excerpts'));
            this.search = this.field(sidebar, 'Search', 'Search title, excerpt, tags and annotations', '', query => c.filter({ query })); this.search.type = 'search'; this.search.maxLength = 500;
            this.search.setAttribute('aria-keyshortcuts', '/');
            const searchHint = this.paragraph('SearchShortcut', 'Press / to search'); searchHint.id = 'collection-search-shortcut';
            this.search.setAttribute('aria-describedby', searchHint.id); sidebar.append(searchHint);
            const nav = this.el('nav', 'prompt-nav'); this.nav = {};
            for (const [mode, key, label] of [['all', 'Active', 'Saved'], ['trash', 'Archived', 'Archived']]) { const button = this.button(key, label, () => c.filter({ mode })); this.nav[mode] = button; nav.append(button); } sidebar.append(nav);
            this.filters = {};
            for (const [name, label] of [['type', 'Type'], ['tool', 'Tool'], ['tag', 'Tag']]) {
                const wrap = this.el('label', 'prompt-field'); const select = this.el('select'); select.addEventListener('change', () => c.filter({ [name]: select.value })); wrap.append(this.el('span', '', this.t(name, label)), select); sidebar.append(wrap); this.filters[name] = select;
            }
            this.clearFilters = this.button('ClearFilters', 'Clear filters', () => c.clearFilters()); sidebar.append(this.clearFilters);
            this.draftList = this.el('div', 'prompt-draft-list'); this.listCount = this.el('p', 'prompt-list-heading'); this.list = this.el('div', 'prompt-list'); sidebar.append(this.draftList, this.listCount, this.list);
            this.main = this.el('main', 'prompt-main'); this.main.id = 'collection-main'; this.main.tabIndex = -1; layout.append(sidebar, this.main);
            const footer = this.el('footer', 'prompt-footer'); footer.append(this.paragraph('Scope', 'Saved on this device. Excerpts are manually supplied, not complete conversations. Nothing is scraped, executed or sent to a model.'), this.paragraph('Limits', 'Limits: 200 items including archived · 32,000 characters per excerpt · 20 body versions per item · 2 MiB total. Capacity errors keep your draft; no text or history is silently removed.'), this.paragraph('Privacy', 'Not an encrypted vault. Avoid secrets. Exports contain private text, annotations, history and conversation links; removing source URLs does not anonymize the text.'));
            this.shell.append(brand, header, this.captureStatus, this.status, layout, footer); this.host.append(this.shell);
            this.main.addEventListener('keydown', event => { if (!event.isComposing && event.keyCode !== 229 && !event.repeat && (event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 's' && c.draft()) { event.preventDefault(); void this.save(); } });
        }
        attachDepartureGuard() {
            root.removeEventListener?.('beforeunload', this.beforeUnload);
            if (this.destroyed || this.controller.disposed) return;
            this.beforeUnload = event => { if (this.controller.hasUncommittedWork() || this.revisionDraft !== null || this.proposals.size) { event.preventDefault(); event.returnValue = ''; } };
            root.addEventListener?.('beforeunload', this.beforeUnload);
        }
        async leave(href) { if (this.controller.busy || this.controller.pendingCommand) return; if (await this.confirm({ title: this.t('Leave', 'Leave this page?'), body: this.t('LeaveBody', 'Unsaved drafts live only in this tab and will be lost.'), accept: this.t('Leave', 'Leave this page?') })) root.location.assign(href); }
        renderList() {
            const c = this.controller; this.search.value = c.filters.query;
            for (const button of this.main.querySelectorAll('[data-collection-tag]')) button.setAttribute('aria-pressed', String(c.filters.tag === button.dataset.collectionTag));
            for (const [mode, node] of Object.entries(this.nav)) node.setAttribute('aria-pressed', String(c.filters.mode === mode));
            for (const [name, select] of Object.entries(this.filters)) {
                const values = name === 'type' ? ['answer', 'code', 'plan', 'other'] : [...new Set((c.state?.records || []).flatMap(record => name === 'tag' ? record.tags : [record.tool]).filter(Boolean))].sort();
                if (c.filters[name] && !values.includes(c.filters[name])) values.push(c.filters[name]);
                select.replaceChildren(); const all = this.el('option', '', this.t('All', 'All')); all.value = ''; select.append(all);
                for (const value of values) { const option = this.el('option', '', name === 'type' ? this.t(value, value) : value); option.value = value; select.append(option); } select.value = c.filters[name];
            }
            this.clearFilters.disabled = !['query', 'type', 'tool', 'tag'].some(key => Boolean(c.filters[key]));
            this.draftList.replaceChildren();
            for (const [id, draft] of c.drafts) { const button = this.button('Draft', 'Draft', () => c.select(id), 'prompt-draft-card'); button.textContent = `${this.t('Draft', 'Draft')} · ${draft.input.title || this.t('Untitled', 'Untitled')}`; button.disabled = c.busy; this.draftList.append(button); }
            this.list.replaceChildren(); let results = []; try { results = c.results(); } catch (_) { this.list.append(this.paragraph('QueryLong', 'Search is too long. Use up to 500 characters.')); }
            this.listCount.textContent = `${results.length} ${this.t('Items', 'items')}`;
            for (const { record, snippet, snippetField } of results) {
                const card = this.el('button', 'prompt-card'); card.type = 'button'; card.disabled = c.busy; card.setAttribute('aria-current', String(c.selected === record.id));
                card.append(this.el('span', 'prompt-card-title', record.title));
                if (snippetField === 'notes') card.append(this.el('span', 'prompt-card-meta', this.t('AnnotationMatch', 'Matched saved annotations')));
                card.append(this.el('span', 'prompt-card-snippet', snippet), this.el('span', 'prompt-card-meta', [this.t(record.type, record.type), record.tool, ...record.tags].filter(Boolean).join(' · '))); card.addEventListener('click', () => c.select(record.id)); this.list.append(card);
            }
            if (!results.length && c.state) this.list.append(this.paragraph('NoResults', 'No matching excerpts. Try another search or filter.', 'prompt-no-results'));
        }
        updateImportButton() {
            if (this.importButton) this.importButton.disabled = !this.controller.replacementReady() || this.revisionDraft !== null || this.proposals.size > 0;
        }
        render() {
            if (this.revisionContext && !this.revisionContext.submitted) this.cancelRevision();
            this.closeHistoricalPrompt?.();
            this.closeHistoricalPrompt = null;
            this.updateHistoricalPrompt = null;
            this.refreshHistoricalCopyState = null;
            this.detailGeneration++;
            this.markdownGeneration = (this.markdownGeneration || 0) + 1;
            this.renderCaptureStatus();
            const c = this.controller;
            this.updateImportButton();
            this.renderList(); this.newButton.disabled = !c.state || c.busy || Boolean(c.pendingCommand); this.exportButton.disabled = !c.state || c.busy;
            this.status.replaceChildren(); this.status.classList.toggle('error', Boolean(c.error));
            if (c.error) this.status.append(this.el('span', '', ['replace', 'recover'].includes(c.error.scope) ? (c.pendingCommand ? this.t('ImportUncertain', 'The replacement may already have completed. New changes are paused. Check the saved outcome read-only; keep this tab open if no matching receipt can be verified. Any retry uses the same operation.') : this.t('ImportApplyFailed', 'Replacement was refused. Refresh saved data, then reopen Import / recover JSON and review again. No automatic retry.')) : this.errorText(c.pendingCommand ? 'OUTCOME_UNCERTAIN' : c.error.code)), this.button('Refresh', 'Refresh saved data', () => c.refresh()));
            else if (['replace', 'recover'].includes(c.notice)) this.status.textContent = this.t('ImportSaved', 'Global collection replacement was verified. Use Import / recover JSON to review and restore a retained snapshot.');
            else if (c.busy) this.status.textContent = this.t('Saving', 'Saving locally…'); else if (c.notice) this.status.textContent = c.notice === 'reconciled' ? this.t('OutcomeVerified', 'The original save was committed. Showing the latest saved state, which may include later changes.') : this.t('Saved', 'Saved locally.');
            if (c.pendingCommand) {
                if (!c.pendingInspection) { const retry = this.button('Retry', 'Check / retry the same save', () => c.retry()); retry.disabled = c.busy; this.status.append(retry); }
                const verify = this.button('InspectSave', 'Check saved outcome (read-only)', () => c.verify()); verify.disabled = c.busy; this.status.append(verify);
            }
            const readerRecord = c.record();
            if (this.answerReader && (c.draft() || !readerRecord || readerRecord.id !== this.readerId || readerRecord.body !== this.readerBody)) {
                this.answerReader.destroy(); this.answerReader = null;
            }
            const focused = this.doc.activeElement?.getAttribute?.('data-collection-field');
            const restoreReaderFocus = this.answerReader?.captureNavigationFocus?.();
            const restoreReaderPosition = this.answerReader?.captureReadingPosition?.();
            this.main.replaceChildren(); this.editor = null; this.promptPanel = null;
            if (!c.state) { this.main.append(this.el('h2', '', this.t(c.error ? 'Unavailable' : 'Loading', c.error ? 'The library could not be read' : 'Loading your collection…'))); return; }
            const draft = c.draft(), record = c.record();
            if (draft) this.renderEditor(draft); else if (record) this.renderDetail(record); else if (!root.LocalItabAISearchView?.showTargetError(c, this)) {
                const empty = this.el('div', 'prompt-empty'); empty.append(this.el('div', 'prompt-empty-mark', '▤'), this.el('h2', '', this.t('Empty', 'Keep the useful part')), this.paragraph('EmptyBody', 'A clear explanation. A code snippet. A plan you want to revisit. Save the exact text and keep your annotations separate.'), this.button('New', 'Save an excerpt', () => c.create(), 'prompt-primary')); this.main.append(empty);
            }
            if (c.busy || c.pendingCommand) for (const control of this.main.querySelectorAll('button, input, textarea, select')) control.disabled = true;
            this.refreshCopyState();
            restoreReaderPosition?.();
            restoreReaderFocus?.();
            if (focused) this.main.querySelector(`[data-collection-field="${focused}"]`)?.focus();
        }
        renderCaptureStatus() {
            if (!this.captureStatus) return;
            this.captureStatus.replaceChildren(); const capture = this.controller.capture;
            if (this.controller.resultDraftStatus === 'loading') this.captureStatus.append(this.paragraph('PromptLoading', 'Reading local prompts…'));
            if (['invalid', 'unavailable'].includes(this.controller.resultDraftStatus)) {
                this.captureStatus.append(this.paragraph('ResultDraftUnavailable', 'The exact prompt version could not be opened safely. Nothing was saved. Return to the prompt, refresh its saved data and open a new result draft.'));
            }
            if (!capture || capture.state === 'done') return;
            const messages = {
                ready: ['CaptureLoading', 'Preparing the selected text for review…'], loading: ['CaptureLoading', 'Preparing the selected text for review…'],
                ack: ['CaptureAck', 'Your draft is ready. Temporary handoff cleanup could not be confirmed. Retry cleanup before reloading.'],
                editable: ['CaptureEditable', 'Selections from editable fields are excluded. Copy and paste the text manually if you want to keep it.'],
                incognito: ['CaptureIncognito', 'Private-window selections are excluded. No selected text was retained.'],
                invalid: ['CaptureInvalid', 'This selection cannot be captured. Select non-empty plain text on an HTTP(S) page and try again.'],
                oversize: ['CaptureOversize', 'This selection exceeds 32,000 characters. Nothing was captured. Select a shorter excerpt.'],
                unsupported: ['CaptureUnsupported', 'Temporary session storage is unavailable in this browser. Copy and paste your excerpt manually.'],
                unavailable: ['CaptureUnavailable', 'The temporary selection could not be read. Retry, or select the text again.'],
                full: ['CaptureFull', 'Too many selections are waiting for review. Finish those drafts or wait ten minutes, then select the text again.'],
                expired: ['CaptureExpired', 'This temporary selection expired or was already consumed. Select the text again.'],
                missing: ['CaptureExpired', 'This temporary selection expired or was already consumed. Select the text again.'],
                forbidden: ['CaptureExpired', 'This temporary selection expired or was already consumed. Select the text again.'],
                guarded: ['CaptureGuarded', 'Your current work was left untouched. Finish or discard all drafts and reviews, then retry the selected-text handoff.']
            };
            const [key, fallback] = messages[capture.state === 'error' ? capture.error : capture.state] || messages.unavailable;
            this.captureStatus.append(this.paragraph(key, fallback));
            if (capture.state === 'ack' || (capture.state === 'error' && ['guarded', 'unavailable'].includes(capture.error))) this.captureStatus.append(this.button('CaptureRetry', 'Retry handoff', capture.retry));
        }
        errorText(code) {
            if (code === 'OUTCOME_UNCERTAIN') return this.t('OutcomeUncertain', 'The earlier save may already have completed. Your draft is kept and new saves are paused. Check its saved receipt without writing; if no matching receipt remains, keep this tab open and inspect the library before taking further action.');
            if (code === 'PROMPT_UNAVAILABLE') return this.t('ResultDraftSaveUnavailable', 'The linked prompt or exact version is no longer active or available. Your draft is kept. Refresh local prompts, then review a new link or explicitly unlink before saving.');
            const errors = { CONFLICT: ['ConflictError', 'Saved data changed in another tab. Your draft is kept. Review the latest version or save your draft as a new item.'], HISTORY_LIMIT: ['HistoryLimit', 'This item already has 20 body versions. No history was removed. Keep the proposed text or save it as a new item.'], LIMIT: ['LimitError', 'A content or storage limit was reached. Your draft is kept. Shorten it or export your collection before making changes.'], WRITE: ['Uncertain', 'The save could not be confirmed. Your draft is kept. Check / retry the same save before starting another.'], VERIFY: ['Uncertain', 'The save could not be confirmed. Your draft is kept. Check / retry the same save before starting another.'], READ: ['ReadError', 'Saved data could not be read. Nothing has been replaced. Try refreshing.'], INVALID: ['Invalid', 'Check the fields: title and excerpt are required, source must be an HTTP(S) URL without credentials, and a prompt reference needs both exact IDs. Limits reject the whole save.'] };
            if (['CAPACITY', 'SIZE_LIMIT', 'TEXT_LIMIT', 'INPUT_LIMIT', 'RECOVERY_LIMIT'].includes(code)) code = 'LIMIT';
            if (['SOURCE_URL', 'TEXT', 'TAGS', 'TYPE', 'PROMPT_REFERENCE'].includes(code)) code = 'INVALID';
            const [key, text] = errors[code] || ['GenericError', 'This operation was refused. Your draft is kept. Check the fields and available capacity, then refresh saved data.']; return this.t(key, text);
        }
        renderEditor(draft) {
            const c = this.controller, form = this.el('form'); this.main.append(this.el('h2', '', this.t(draft.id ? 'Edit' : 'New', draft.id ? 'Edit details' : 'Save an excerpt')));
            this.main.append(this.paragraph('DraftScope', 'Drafts stay in this tab until you save. Switching items keeps them; closing this page does not.'));
            if (draft.conflict) { const box = this.el('div', 'prompt-conflict'); box.append(this.paragraph('ConflictError', 'Saved data changed in another tab. Your draft is kept. Review the latest version or save your draft as a new item.'), this.button('SaveCopy', 'Save draft as new item', () => this.save(true))); const latest = c.record(); if (latest) box.append(this.el('pre', 'prompt-readonly', `${latest.title}\n\n${latest.body}\n\n${latest.notes}`)); this.main.append(box); }
            this.editor = { fields: {} };
            if (draft.exactResult) form.append(this.paragraph('ResultDraftReview', 'Review the exact linked prompt version below, then add your title and result text. This new draft is unsaved; only Save locally keeps it.'));
            if (draft.captured) {
                form.append(this.paragraph('CaptureReview', 'Review this exact browser-provided selection, add a title, and choose Save locally to keep it. It has not been saved.'));
                if (draft.captureSource) {
                    const label = this.el('label', 'prompt-check'), check = this.el('input'); check.type = 'checkbox';
                    check.checked = draft.input.sourceUrl === draft.captureSource;
                    check.addEventListener('change', () => { c.update('sourceUrl', check.checked ? draft.captureSource : ''); this.editor.fields.sourceUrl.value = c.draft().input.sourceUrl; });
                    label.append(check, this.el('span', '', this.t('CaptureSource', 'Include source address (query and fragment removed)')));
                    form.append(label, this.el('p', 'prompt-help collection-url', draft.captureSource)); this.editor.captureCheck = check;
                }
            }
            for (const [name, label, multiline] of [['title', 'Title'], ['body', 'Exact excerpt', true], ['notes', 'Your annotations', true], ['tagsText', 'Tags (comma-separated)'], ['tool', 'Tool / model label'], ['sourceUrl', 'Source URL (optional)']]) {
                const input = this.field(form, name, label, draft.input[name], value => c.update(name, value), multiline); this.editor.fields[name] = input;
                if (name === 'body') { input.className = 'prompt-body-editor'; input.readOnly = Boolean(draft.id); if (draft.id) form.append(this.paragraph('BodySeparate', 'Saved excerpts are read-only here. Use “Revise excerpt” to review an explicit new body version.')); }
                if (name === 'sourceUrl') { input.type = 'url'; form.append(this.paragraph('SourceHelp', 'User-provided attribution only. This page never fetches the link; the original account or permission may be needed.')); }
            }
            const label = this.el('label', 'prompt-field'), type = this.el('select'); label.append(this.el('span', '', this.t('type', 'Type')), type);
            for (const name of ['answer', 'code', 'plan', 'other']) { const option = this.el('option', '', this.t(name, name)); option.value = name; type.append(option); } type.value = draft.input.type; type.addEventListener('change', () => c.update('type', type.value)); form.append(label); this.editor.fields.type = type;
            this.buildPromptPanel(form, true);
            const actions = this.el('div', 'prompt-actions prompt-form-actions'); this.editor.save = this.button('Save', 'Save locally', () => this.save(), 'prompt-primary'); actions.append(this.editor.save, this.button('Discard', 'Discard draft', () => this.discard())); form.append(actions); form.addEventListener('submit', event => { event.preventDefault(); void this.save(); }); this.main.append(form); this.updateEditor();
        }
        updateEditor() {
            const c = this.controller, draft = c.draft(); if (!this.editor || !draft) return;
            this.editor.save.disabled = c.busy || Boolean(c.pendingCommand) || draft.conflict || !draft.input.title.trim() || !draft.input.body.length;
            for (const input of Object.values(this.editor.fields)) input.disabled = c.busy || Boolean(c.pendingCommand);
            if (this.editor.captureCheck) { this.editor.captureCheck.disabled = c.busy || Boolean(c.pendingCommand); this.editor.captureCheck.checked = draft.input.sourceUrl === draft.captureSource; }
            this.updatePromptPanel();
        }
        buildPromptPanel(parent, editable) {
            const c = this.controller, box = this.el('section', 'prompt-section collection-prompt-link');
            box.append(this.el('h3', '', this.t('PromptLinkHeading', 'Exact prompt link')),
                this.paragraph('PromptLinkHelp', 'Choose a local prompt and an immutable body version. Apply changes only the draft; Save locally keeps the link. Links never follow the latest version.'));
            const linked = this.el('div'), sourceStatus = this.el('p', 'prompt-help'); sourceStatus.setAttribute('role', 'status'); box.append(sourceStatus, linked);
            this.promptPanel = { box, linked, sourceStatus, editable };
            if (editable) {
                for (const [name, key, fallback] of [['prompt', 'PromptPickerLabel', 'Local prompt'], ['version', 'PromptVersionLabel', 'Exact body version']]) {
                    const label = this.el('label', 'prompt-field'), select = this.el('select');
                    label.append(this.el('span', '', this.t(key, fallback)), select); box.append(label); this.promptPanel[name] = select;
                }
                const panel = this.promptPanel;
                panel.prompt.addEventListener('change', () => c.choosePrompt(panel.prompt.value));
                panel.version.addEventListener('change', () => c.choosePrompt(panel.prompt.value, panel.version.value));
                panel.preview = this.el('div'); box.append(panel.preview);
                panel.apply = this.button('PromptApplyLink', 'Apply link to draft', () => c.applyPrompt());
                panel.unlink = this.button('PromptUnlink', 'Unlink in draft', () => c.unlinkPrompt());
                box.append(panel.apply, panel.unlink);
            }
            box.append(this.button('PromptRefresh', 'Refresh local prompts', () => c.refreshPrompts()));
            parent.append(box); this.updatePromptPanel();
        }
        promptResult(target, reference, preview = false) {
            target.replaceChildren(); const result = this.controller.promptResolution(reference);
            const messages = {
                unlinked: ['PromptUnlinked', 'No prompt linked.'], loading: ['PromptLoading', 'Reading local prompts…'],
                unavailable: ['PromptReadError', 'Local prompts could not be read. Any existing exact link is kept. Refresh to retry.'],
                unresolved: ['PromptMissing', 'This exact prompt version is missing locally. Its IDs are kept; no substitute is used.'],
                resolved: ['PromptResolved', 'Exact linked prompt version']
            };
            const [key, fallback] = preview && result.status === 'resolved' ? ['PromptPreview', 'Selected prompt version preview'] : messages[result.status]; target.append(this.paragraph(key, fallback));
            if (reference) target.append(this.el('pre', 'prompt-help collection-url', `${reference.promptId}\n${reference.bodyVersionId}`));
            if (result.version) {
                const provenance = result.provenance;
                target.append(this.el('p', 'prompt-help', [provenance?.title, provenance?.archived ? this.t('Archived', 'Archived') : '', provenance?.recoveryId ? `${this.t('PromptRecovery', 'Recovery snapshot')} · ${provenance.recoveryId}` : ''].filter(Boolean).join(' · ')), this.el('pre', 'prompt-readonly', result.version.body));
            }
            return result;
        }
        updatePromptPanel() {
            const p = this.promptPanel, c = this.controller; if (!p) return;
            const input = c.draft()?.input, ref = input ? (input.promptId || input.bodyVersionId ? { promptId: input.promptId, bodyVersionId: input.bodyVersionId } : null) : c.record()?.promptRef;
            p.sourceStatus.textContent = c.promptLoading ? this.t('PromptLoading', 'Reading local prompts…') : c.promptError || !c.promptState ? this.t('PromptReadError', 'Local prompts could not be read. Any existing exact link is kept. Refresh to retry.') : !c.promptOptions().length ? this.t('PromptEmpty', 'No local prompt versions are available.') : '';
            this.promptResult(p.linked, ref);
            if (!p.editable || !c.draft()) return;
            const candidate = c.draft().promptCandidate || { promptId: '', bodyVersionId: '' }, options = c.promptOptions();
            const populate = (select, items, value, key, fallback) => {
                select.replaceChildren(); const empty = this.el('option', '', this.t(key, fallback)); empty.value = ''; select.append(empty);
                for (const item of items) { const option = this.el('option', '', item.label); option.value = item.value; select.append(option); }
                if (value && !items.some(item => item.value === value)) { const retained = this.el('option', '', value); retained.value = value; select.append(retained); }
                select.value = value;
            };
            const seen = new Set();
            populate(p.prompt, options.filter(item => { if (seen.has(item.promptId)) return false; seen.add(item.promptId); return true; }).map(item => ({ value: item.promptId, label: `${item.title} · ${item.promptId}${item.archived ? ` · ${this.t('Archived', 'Archived')}` : ''}${item.recoveryId ? ` · ${this.t('PromptRecovery', 'Recovery snapshot')}` : ''}` })), candidate.promptId, 'PromptChoose', 'Choose a prompt');
            populate(p.version, options.filter(item => item.promptId === candidate.promptId).slice().reverse().map(item => ({ value: item.bodyVersionId, label: `${new Date(item.createdAt).toLocaleString()} · ${item.bodyVersionId}${item.current ? ` · ${this.t('Current', 'Current')}` : ''}${item.recoveryId ? ` · ${this.t('PromptRecovery', 'Recovery snapshot')}` : ''}` })), candidate.bodyVersionId, 'PromptChooseVersion', 'Choose a version');
            const complete = candidate.promptId && candidate.bodyVersionId;
            p.preview.replaceChildren();
            const result = complete ? this.promptResult(p.preview, candidate, true) : null;
            const blocked = c.busy || Boolean(c.pendingCommand);
            p.prompt.disabled = blocked || c.promptLoading || Boolean(c.promptError) || !c.promptState;
            p.version.disabled = p.prompt.disabled || !candidate.promptId;
            p.apply.disabled = blocked || c.promptLoading || result?.status !== 'resolved';
            p.unlink.disabled = blocked || !ref;
        }
        async save(asCopy = false) {
            const c = this.controller; if (this.openDialog || c.busy || c.pendingCommand || !c.draft()) return;
            try {
                const duplicates = c.duplicates(); if ((!c.draft().id || asCopy) && duplicates.length && !(await this.confirm({ title: this.t('Duplicate', 'Similar excerpts already exist'), body: `${this.t('DuplicateBody', 'These exact-text matches are suggestions only. Nothing will be merged. Save a separate item?')}\n\n${duplicates.map(item => `${item.title}${item.deletedAt ? ` (${this.t('Archived', 'Archived')})` : ''}`).join('\n')}`, accept: this.t('SaveSeparate', 'Save separate item') }))) return;
                // Metadata controls are replaced and disabled during the save.
                // Keep their focus on stable feedback, without a late focus return.
                const focusStatus = c.draft()?.id && this.main.contains(this.doc.activeElement);
                const saving = c.save(asCopy);
                if (focusStatus) this.status.focus();
                await saving;
            } catch (error) { c.error = { code: error.code || 'INVALID' }; c.notify(); }
        }
        async discard() { const c = this.controller; if (c.busy || c.pendingCommand) return; if (!c.dirty() || await this.confirm({ title: this.t('Discard', 'Discard draft'), body: this.t('DiscardBody', 'Discard only this unsaved draft? Saved content is unchanged.'), accept: this.t('Discard', 'Discard draft') })) c.discard(); }
        canContinueContext(reference) {
            const c = this.controller, record = c.record();
            return Boolean(root.LocalItabAIContextEntry && !this.destroyed && !c.disposed && !this.openDialog &&
                !this.comparison && !this.exportingMarkdown && this.revisionDraft === null && !this.proposals.size &&
                this.host.isConnected && this.doc.visibilityState !== 'hidden' && c.comparisonReady() && !c.draft() &&
                record && !record.deletedAt && record.id === reference.id && record.version === reference.version && record.currentVersionId === reference.currentVersionId);
        }
        renderDetail(record) {
            if (this.proposals.has(record.id)) {
                const note = this.el('div', 'prompt-conflict'); note.append(this.paragraph('ProposalKept', 'A proposed excerpt is kept in this tab. Resume its review or discard it.'), this.button('ResumeRevision', 'Resume revision', () => this.revise(record)), this.button('ProposalAsNew', 'Use proposed text in a new draft', () => this.proposalAsNew(record)), this.button('DiscardProposal', 'Discard proposed text', async () => { if (await this.confirm({ title: this.t('DiscardProposal', 'Discard proposed text'), body: this.t('DiscardBody', 'Discard only this unsaved draft? Saved content is unchanged.'), accept: this.t('Discard', 'Discard draft') })) { this.proposals.delete(record.id); this.render(); } })); this.main.append(note);
            }
            const c = this.controller, top = this.el('div', 'prompt-detail-top'); top.append(this.el('h2', '', record.title));
            const meta = this.el('div', 'prompt-meta');
            for (const text of [this.t(record.type, record.type), record.tool].filter(Boolean)) meta.append(this.el('span', 'prompt-tag', text));
            const generation = this.detailGeneration;
            for (const tag of record.tags) {
                const button = this.el('button', 'prompt-tag prompt-tag-filter', tag); button.type = 'button';
                button.dataset.collectionTag = tag;
                button.setAttribute('aria-label', `${this.t('FilterByTag', 'Filter by tag')}: ${tag}`);
                button.setAttribute('aria-pressed', String(c.filters.tag === tag));
                button.addEventListener('click', () => {
                    if (button.disabled || !button.isConnected || this.destroyed || c.disposed || c.busy || c.pendingCommand ||
                        this.openDialog || this.detailGeneration !== generation || c.draft() || c.record() !== record) return;
                    c.filter({ tag });
                });
                meta.append(button);
            }
            top.append(meta);
            top.append(this.el('p', 'prompt-dates', `${this.t('Updated', 'Updated')} ${new Date(record.updatedAt).toLocaleString()} · ${record.history.length}/20 ${this.t('Versions', 'body versions')}`));
            const actions = this.el('div', 'prompt-actions');
            if (!record.deletedAt) actions.append(this.button('Edit', 'Edit details', () => { if (c.edit()) this.editor?.fields.title?.focus(); }), this.button('Revise', 'Revise excerpt', () => this.revise(record)), this.button('Archive', 'Archive', () => c.action('remove')));
            else actions.append(this.button('Restore', 'Restore from archive', () => c.action('restore')));
            if (!record.deletedAt && record.promptRef) {
                const compare = this.button('Compare', 'Compare saved results', () => this.compareSaved(record.id));
                compare.disabled = !c.comparisonReady(); actions.append(compare);
            }
            if (!record.deletedAt) {
                const reference = { id: record.id, version: record.version, currentVersionId: record.currentVersionId };
                const ask = this.button('ContinueContext', 'Continue asking with this excerpt', () => {
                    if (this.detailGeneration !== generation || !this.canContinueContext(reference)) return;
                    return root.LocalItabAIContextEntry.openCollection(reference);
                });
                ask.disabled = !this.canContinueContext(reference); actions.append(ask);
                this.continueContextButton = ask;
            }
            if (!record.deletedAt) {
                const compare = this.button('ManualCompare', 'Compare any saved excerpts', () => this.compareSaved(record.id, 'manual'));
                compare.disabled = !c.comparisonReady(); actions.append(compare);
            }
            const markdown = this.button('MarkdownExport', 'Export current saved item as Markdown', () => this.exportMarkdown());
            markdown.disabled = Boolean(c.error); actions.append(markdown);
            for (const button of actions.children) button.disabled = button.disabled || c.busy || Boolean(c.pendingCommand); top.append(actions); this.main.append(top);
            if (!record.deletedAt && c.comparisonReadGeneration !== c.readGeneration && !c.error && !c.busy && !c.pendingCommand && c.pendingReadGeneration !== c.readGeneration) {
                top.append(this.paragraph('CompareRefreshRequired', 'Refresh saved data successfully before comparing current excerpts.'),
                    this.button('Refresh', 'Refresh saved data', () => c.refresh()));
            }
            this.main.append(this.el('h3', '', this.t('body', 'Exact excerpt')));
            if (root.LocalItabSafeAnswerReader) {
                if (!this.answerReader) {
                    this.readerId = record.id; this.readerBody = record.body;
                    this.answerReader = root.LocalItabSafeAnswerReader.create(this.doc, record.body, (key, fallback) => {
                        const value = root.i18n?.t(`answerReader${key}`); return value && value !== `answerReader${key}` ? value : fallback;
                    }, { copy: (text, target) => this.copy(text, target), canCopy: () => this.canCopy(),
                        sections: true, canNavigate: () => this.canNavigateAnswer() });
                }
                // Recover navigation after a busy render without unlocking code-copy buttons.
                for (const button of this.answerReader.node.querySelectorAll('.answer-reader-controls button')) button.disabled = false;
                this.main.append(this.answerReader.node);
                this.answerReader.refreshCopyState?.();
            } else { const body = this.el('pre', 'prompt-readonly', record.body); body.tabIndex = 0; this.main.append(body); }
            this.copyExcerptButton = this.button('Copy', 'Copy excerpt', () => this.copy(record.body));
            this.main.append(this.copyExcerptButton, this.paragraph('PlainText', 'Saved code and markup are never executed.'));
            if (record.notes) { const section = this.el('section', 'prompt-section'); section.append(this.el('h3', '', this.t('notes', 'Your annotations')), this.el('pre', 'prompt-readonly', record.notes)); this.main.append(section); }
            const source = root.LocalItabAICollections.sourceMetadata(record.sourceUrl), section = this.el('section', 'prompt-section'); section.append(this.el('h3', '', this.t('Source', 'Source')));
            if (source.provided) { const link = this.el('a', 'collection-source', `${this.t('OpenSource', 'Open user-provided source')} · ${source.host}`); link.href = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; section.append(link, this.el('p', 'prompt-help collection-url', record.sourceUrl), this.paragraph('SourceHelp', 'User-provided attribution only. This page never fetches the link; the original account or permission may be needed.')); }
            else section.append(this.paragraph('NoSource', 'No source URL supplied.')); this.main.append(section);
            if (record.contextSnapshot) {
                const snapshotSection = this.el('section', 'prompt-section collection-context-snapshot');
                snapshotSection.append(this.el('h3', '', this.t('ContextSnapshotTitle', 'Saved question and reviewed sources')),
                    this.paragraph('ContextSnapshotHelp', 'Historical input for the first saved answer version below. Later answer edits may differ. This snapshot does not change when original sources change or are deleted. Source IDs and labels identify reviewed input; answer citations remain unverified model claims, not proof. Imported snapshots are user-provided metadata, not cryptographic proof of model output. It is included in unencrypted backups, even when source URLs are omitted.'),
                    this.el('p', 'prompt-help', record.history[0].id),
                    this.el('pre', 'prompt-readonly', JSON.stringify(record.contextSnapshot, null, 2)));
                this.renderHistoricalPrompt(snapshotSection, record);
                this.main.append(snapshotSection);
            }
            if (record.promptRef) this.buildPromptPanel(this.main, false);
            const history = this.el('details', 'prompt-history'); history.append(this.el('summary', '', this.t('History', 'Excerpt version history')));
            record.history.slice().reverse().forEach((version, index) => { const item = this.el('section', 'prompt-section'); item.append(this.el('h3', '', `${new Date(version.createdAt).toLocaleString()}${index === 0 ? ` · ${this.t('Current', 'Current')}` : ''}`), this.el('pre', 'prompt-readonly', version.body)); if (index !== 0 && !record.deletedAt) { const restore = this.button('ReviewRestore', 'Review restoring this text', () => this.revise(record, version)); restore.disabled = c.busy || Boolean(c.pendingCommand); item.append(restore); } history.append(item); }); this.main.append(history);
        }
        renderHistoricalPrompt(section, record) {
            const c = this.controller, generation = this.detailGeneration, state = c.state, readGeneration = c.readGeneration;
            const current = () => !this.destroyed && !c.disposed && !c.busy && !c.pendingCommand && !c.error && !c.draft() &&
                c.pendingReadGeneration !== c.readGeneration &&
                this.detailGeneration === generation && c.state === state && c.readGeneration === readGeneration &&
                c.record()?.id === record.id && c.record().version === record.version;
            const panel = this.el('section', 'collection-historical-prompt');
            panel.id = 'collection-historical-prompt'; panel.hidden = true;
            const prompt = this.el('pre', 'prompt-readonly', record.contextSnapshot.prompt); prompt.tabIndex = 0;
            prompt.setAttribute('aria-label', this.t('HistoricalPromptText', 'Exact historical prompt'));
            const status = this.el('p', 'prompt-help', ''); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            let review = 0;
            const close = () => { review++; panel.hidden = true; status.textContent = ''; open.setAttribute('aria-expanded', 'false'); this.refreshHistoricalCopyState?.(); };
            const open = this.button('HistoricalPromptReview', 'Review historical full prompt', () => {
                if (!current()) return;
                if (!panel.hidden) { close(); return; }
                review++; panel.hidden = false; open.setAttribute('aria-expanded', 'true'); this.refreshHistoricalCopyState?.(); prompt.focus();
            });
            open.setAttribute('aria-expanded', 'false'); open.setAttribute('aria-controls', panel.id);
            const copy = this.button('HistoricalPromptCopy', 'Copy historical prompt', () => {
                const token = review;
                return this.copy(record.contextSnapshot.prompt, {
                    current: () => current() && !panel.hidden && review === token && prompt.textContent === record.contextSnapshot.prompt,
                    status, copied: ['HistoricalPromptCopied', 'Historical prompt copied.'],
                    blocked: ['HistoricalPromptBlocked', 'Copy could not be confirmed. Select the historical prompt text to copy it manually. No automatic retry.']
                });
            });
            panel.append(this.paragraph('HistoricalPromptWarning', 'Historical input, possibly containing private information. Review before copying. Linked to the first answer version, not necessarily the current revised answer. Copying writes only the text shown below, without the outer endpoint/model metadata. Closing this review cannot undo a clipboard write already started.'),
                this.el('p', 'prompt-help collection-url', `${this.t('HistoricalPromptVersion', 'First answer version')} · ${record.history[0].id}`), prompt, copy, status,
                this.button('HistoricalPromptClose', 'Close prompt review', () => { close(); open.focus(); }));
            this.closeHistoricalPrompt = close;
            this.refreshHistoricalCopyState = () => {
                const focused = this.doc.activeElement === copy;
                copy.disabled = !this.canCopy() || !current() || panel.hidden;
                if (focused && copy.disabled && !this.destroyed && panel.isConnected && !panel.hidden) prompt.focus();
            };
            this.updateHistoricalPrompt = () => { if (!current()) close(); else this.refreshHistoricalCopyState(); };
            this.refreshHistoricalCopyState();
            section.append(open, panel);
        }
        compareSaved(sourceId, scope = 'prompt') {
            const c = this.controller, source = c.record(sourceId);
            if (!['prompt', 'manual'].includes(scope) || this.destroyed || !this.host.isConnected || this.doc.visibilityState === 'hidden' ||
                this.openDialog || !c.comparisonReady() || c.selected !== sourceId || c.draft() || !source || source.deletedAt ||
                (scope === 'prompt' && !source.promptRef)) return;
            const manual = scope === 'manual', state = c.state, generation = c.readGeneration, reference = source.promptRef && { ...source.promptRef };
            const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', 'prompt-dialog collection-comparison-dialog');
            overlay.setAttribute('aria-hidden', 'true'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'collection-comparison-title'); box.setAttribute('aria-describedby', 'collection-comparison-scope');
            const heading = this.el('h2', '', manual ? this.t('ManualCompare', 'Compare any saved excerpts') : this.t('Compare', 'Compare saved results')); heading.id = 'collection-comparison-title';
            const scopeHelp = manual ? this.paragraph('ManualCompareScope', 'Manually choose from all current unarchived saved excerpts, regardless of sidebar filters. Inputs and models may differ; no shared prompt or provenance is assumed. Drafts, historical bodies and recovery snapshots are excluded. No model calls or quality ranking.') :
                this.paragraph('CompareScope', 'Only current saved excerpts linked to the same exact prompt and version are compared. Drafts, archived items and recovery snapshots are excluded. No model calls or quality ranking.'); scopeHelp.id = 'collection-comparison-scope';
            const context = manual ? null : this.el('p', 'prompt-help collection-url', `${this.t('CompareReference', 'Exact linked prompt / version')} · ${reference.promptId} / ${reference.bodyVersionId}`);
            const referenceStatus = this.el('p', 'prompt-help');
            const label = this.el('label', 'prompt-field'), chooser = this.el('select');
            const chooseText = manual ? this.t('ManualCompareChoose', 'Choose another saved excerpt') : this.t('CompareChoose', 'Choose another saved result');
            label.append(this.el('span', '', chooseText), chooser);
            const placeholder = this.el('option', '', chooseText); placeholder.value = ''; chooser.append(placeholder); chooser.value = '';
            const candidates = c.comparisonCandidates(sourceId, scope);
            for (const item of candidates) { const option = this.el('option', '', `${item.title} · ${item.tool || this.t('CompareNoTool', 'No tool label')} · ${item.id}`); option.value = item.id; chooser.append(option); }
            const status = this.el('p', 'prompt-help'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const bodies = this.el('div', 'collection-comparison-grid');
            let stale = false, closed = false, selectedId = '', cleanup;
            const current = () => !closed && !this.destroyed && this.host.isConnected && overlay.isConnected &&
                c.comparisonReady() && c.state === state && c.readGeneration === generation && c.selected === sourceId && !c.draft();
            const finish = () => {
                if (this.closeComparison !== finish) return;
                closed = true; bodies.replaceChildren(); chooser.disabled = true;
                this.updateComparison = null; this.closeComparison = null; this.openDialog = false;
                cleanup?.(); overlay.remove();
                this.refreshCopyState();
                if (!this.doc.activeElement || this.doc.activeElement === this.doc.body) this.main.focus();
            };
            const close = this.button('CompareClose', 'Close comparison', finish);
            const renderBodies = () => {
                bodies.replaceChildren();
                const other = candidates.find(item => item.id === selectedId);
                for (const [key, fallback, item] of [['CompareFirst', 'Starting saved result', source], ['CompareSecond', 'Selected saved result', other]]) {
                    if (!item) continue;
                    const section = this.el('section'); section.append(this.el('h3', '', this.t(key, fallback)), this.el('p', 'collection-url', `${item.title} · ${item.tool || this.t('CompareNoTool', 'No tool label')}`), this.el('p', 'prompt-help collection-url', `${item.id} · ${this.t('MarkdownBodyVersion', 'Body version')} · ${item.currentVersionId}`));
                    if (manual) {
                        section.append(this.el('p', 'prompt-help collection-url', `${this.t('ManualCompareSource', 'User-provided source URL (not verified)')} · ${item.sourceUrl || this.t('NoSource', 'No source URL supplied.')}`));
                        section.append(this.el('p', 'prompt-help collection-url', item.promptRef ?
                            `${this.t('CompareReference', 'Exact linked prompt / version')} · ${item.promptRef.promptId} / ${item.promptRef.bodyVersionId}` :
                            this.t('ManualCompareUnlinked', 'No saved prompt-version link.')));
                        if (item.contextSnapshot) section.append(this.el('p', 'prompt-help collection-url',
                            `${this.t('ManualCompareHistorical', 'This item has historical input for its first answer version, which may differ from the current revised excerpt.')} · ${item.history[0].id}`));
                    }
                    // Browsers can visually discard a bare CR inside a pre.
                    // Normalize only this display copy; equality still uses raw bodies.
                    const body = this.el('pre', 'prompt-readonly', item.body.replace(/\r\n?/g, '\n')); body.tabIndex = 0; section.append(body); bodies.append(section);
                }
                status.textContent = !candidates.length ? (manual ? this.t('ManualCompareEmpty', 'No other current unarchived saved excerpt is available. Save another excerpt, then reopen this comparison.') : this.t('CompareEmpty', 'No other active saved result has this exact prompt and version link.')) : other && source.body === other.body ? this.t('CompareEqual', 'These saved bodies are exactly identical.') : this.t('CompareLiteral', 'Saved markup is shown as text. Different original text does not imply better quality.');
            };
            const updateReference = () => {
                if (manual) return;
                const resolution = c.promptResolution(reference);
                referenceStatus.textContent = resolution.status === 'resolved' ?
                    this.t('CompareLinkResolved', 'The exact linked prompt version is readable locally.') + (resolution.provenance?.archived ? ` ${this.t('Archived', 'Archived')}` : '') + (resolution.provenance?.recoveryId ? ` ${this.t('PromptRecovery', 'Recovery snapshot')}` : '') :
                    this.t('CompareLinkUnavailable', 'The exact linked prompt version is unavailable, missing or still loading. Matching uses saved link IDs only.');
            };
            this.updateComparison = () => {
                if (closed) return;
                updateReference();
                if (stale || current()) return;
                stale = true; bodies.replaceChildren(); chooser.disabled = true;
                status.textContent = this.t('CompareStale', 'Saved data changed or could not be verified. This comparison has been cleared. Close it, refresh saved data if needed, then reopen to choose again.');
                if (overlay.contains(this.doc.activeElement) || this.doc.activeElement === this.doc.body) close.focus();
            };
            chooser.addEventListener('change', () => { if (closed) return; this.updateComparison?.(); if (stale || !current()) return; selectedId = chooser.value; renderBodies(); });
            chooser.disabled = !candidates.length; renderBodies(); updateReference();
            box.append(heading, scopeHelp, this.paragraph('CompareLineBreaks', 'Displayed line breaks are normalized to LF so every line remains visible. Saved originals and exact-equality checks keep their original CRLF, CR or LF; visually identical text may still differ.'));
            if (!manual) box.append(context, referenceStatus);
            box.append(label, status, bodies, close); overlay.append(box); this.doc.body.append(overlay);
            this.openDialog = true; this.closeComparison = finish; cleanup = root.LocalItabDialog.open(overlay, chooser.disabled ? close : chooser, finish);
        }
        proposalAsNew(record) {
            const c = this.controller; if (c.busy || c.pendingCommand) return;
            if (c.drafts.has('new')) { c.select('new'); this.status.textContent = this.t('ExistingDraft', 'Finish or discard the existing new-item draft first. Your proposed excerpt is still kept.'); return; }
            const draft = c.makeDraft(record); delete draft.id; delete draft.version; draft.input.body = this.proposals.get(record.id); draft.baseline = {};
            c.drafts.set('new', draft); c.select('new');
        }
        canCopy() {
            const c = this.controller;
            return !this.copying && !this.destroyed && !c.disposed && !c.busy && !c.pendingCommand && !c.error &&
                c.pendingReadGeneration !== c.readGeneration && Boolean(c.record()) && !c.draft() && this.host.isConnected && this.doc.visibilityState !== 'hidden';
        }
        canNavigateAnswer() {
            const c = this.controller, record = c.record();
            return !this.destroyed && !c.disposed && !c.busy && !c.pendingCommand && !c.error &&
                c.pendingReadGeneration !== c.readGeneration && !c.draft() && Boolean(record) && record.id === this.readerId &&
                record.body === this.readerBody && this.host.isConnected && this.doc.visibilityState !== 'hidden';
        }
        refreshCopyState() {
            if (this.continueContextButton?.isConnected) this.continueContextButton.disabled = !this.canContinueContext(this.controller.record() || {});
            if (this.copyExcerptButton?.isConnected) {
                const focused = this.doc.activeElement === this.copyExcerptButton;
                this.copyExcerptButton.disabled = !this.canCopy();
                if (focused && this.copyExcerptButton.disabled && !this.destroyed) this.status.focus();
            }
            this.refreshHistoricalCopyState?.();
            this.answerReader?.refreshCopyState?.();
            this.answerReader?.refreshNavigationState?.();
        }
        async copy(body, target) {
            const c = this.controller, record = c.record();
            if (!this.canCopy() || (target ? !target.current() : record.body !== body)) return;
            const context = { generation: this.detailGeneration, copyGeneration: this.copyGeneration,
                state: c.state, readGeneration: c.readGeneration, id: record.id, version: record.version, body };
            const isCurrent = () => !this.destroyed && !c.disposed && !c.busy && !c.pendingCommand && !c.error && !c.draft() &&
                c.pendingReadGeneration !== c.readGeneration &&
                this.host.isConnected && this.doc.visibilityState !== 'hidden' && this.copyGeneration === context.copyGeneration &&
                this.detailGeneration === context.generation && c.state === context.state && c.readGeneration === context.readGeneration &&
                c.record()?.id === context.id && c.record().version === context.version &&
                (target ? target.current() : c.record().body === context.body);
            const status = target?.status || this.status;
            const feedback = value => Array.isArray(value) ? this.t(...value) : value;
            this.copying = true; status.textContent = ''; this.refreshCopyState();
            try {
                // Invoke during the click's activation; hold the shared lock until this exact write settles.
                if (!this.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await this.clipboard.writeText(body);
                if (isCurrent()) status.textContent = feedback(target?.copied || ['Copied', 'Excerpt copied.']);
            } catch (_) {
                if (isCurrent()) status.textContent = feedback(target?.blocked || ['CopyBlocked', 'Copy was blocked. Select the excerpt text to copy it manually.']);
            } finally { this.copying = false; if (!this.destroyed) this.refreshCopyState(); }
        }
        cancelRevision() {
            const context = this.revisionContext;
            this.revisionContext = null; this.revisionDraft = null;
            this.controller.invalidateBodyReview();
            context?.closeDialog?.();
        }
        async revise(record, historic) {
            const c = this.controller;
            if (this.destroyed || c.disposed || !this.host.isConnected || this.openDialog || c.busy || c.pendingCommand || c.draft() ||
                this.revisionDraft !== null || !record || c.record() !== record || record.deletedAt || c.pendingReadGeneration === c.readGeneration) return;
            const context = { state: c.state, readGeneration: c.readGeneration, interactionGeneration: c.interactionGeneration,
                detailGeneration: this.detailGeneration, submitted: false };
            context.current = () => this.revisionContext === context && !this.destroyed && !c.disposed && this.host.isConnected &&
                c.selected === record.id && (context.submitted || (!c.busy && !c.pendingCommand && !c.draft() &&
                c.record() === record && c.state === context.state && c.readGeneration === context.readGeneration &&
                c.pendingReadGeneration !== c.readGeneration && c.interactionGeneration === context.interactionGeneration && this.detailGeneration === context.detailGeneration));
            let body = historic?.body ?? this.proposals.get(record.id) ?? record.body;
            this.revisionContext = context;
            this.revisionDraft = body; this.proposals.set(record.id, body);
            try {
                if (!historic) {
                    const accepted = await this.dialog({ title: this.t('Revise', 'Revise excerpt'), body: this.t('RevisionHelp', 'Enter proposed text. The saved excerpt stays unchanged until you review and accept a new version.'), accept: this.t('Review', 'Review change'), editor: body, revisionContext: context, onInput: value => { if (!context.current()) return; body = value; this.revisionDraft = value; this.proposals.set(record.id, value); } });
                    if (!context.current() || !accepted) return;
                }
                if (body === record.body) { this.proposals.delete(record.id); this.status.textContent = this.t('Unchanged', 'The excerpt is unchanged.'); return; }
                const plan = await c.reviewBody(body, historic?.id); if (!context.current() || !plan) return;
                const accepted = await this.dialog({ title: this.t('ReviewRevision', 'Review excerpt revision'), body: this.t('RevisionConfirm', 'Accepting creates a new body version. All earlier versions remain. Annotations and source details are unchanged.'), accept: this.t('AcceptRevision', 'Accept new body version'), comparison: { before: record.body, after: plan.body }, revisionContext: context });
                if (!context.current() || !accepted) return;
                // The confirmed write keeps the existing receipt/retry lifecycle.
                // Its own notifications can replace the saved record; navigation
                // or page departure still releases this view's ownership.
                context.submitted = true;
                if (await c.acceptRevision(plan) && context.current() && this.proposals.get(record.id) === body) this.proposals.delete(record.id);
            } finally {
                if (this.revisionContext === context) { const current = context.current(); this.cancelRevision(); if (current) this.render(); }
            }
        }
        importFile() {
            const c = this.controller;
            if (this.openDialog || this.destroyed || !c.replacementReady() || this.revisionDraft !== null || this.proposals.size) return;
            const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', 'prompt-dialog collection-review-dialog');
            overlay.setAttribute('aria-hidden', 'true'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'collection-import-title'); box.setAttribute('aria-describedby', 'collection-import-scope');
            const heading = this.el('h2', '', this.t('Import', 'Import / recover JSON')); heading.id = 'collection-import-title';
            const scope = this.paragraph('ImportScope', 'Replace the global collection on this device, including archived items. This is not a merge and is not limited by the current search or workspace. Current saved items and body versions are retained in recovery; prompts and other libraries are unchanged. Only this product’s standalone collection JSON is accepted.'); scope.id = 'collection-import-scope';
            const label = this.el('label', 'prompt-field'), file = this.el('input'); file.type = 'file'; file.accept = '.json,application/json';
            label.append(this.el('span', '', this.t('ImportFile', 'Choose a local collection JSON file (up to 2 MiB)')), file);
            const recoveryLabel = this.el('label', 'prompt-field'), recovery = this.el('select');
            recoveryLabel.append(this.el('span', '', this.t('ImportRecovery', 'Or choose a saved recovery snapshot')), recovery);
            const placeholder = this.el('option', '', this.t('ImportChooseRecovery', 'Choose a snapshot')); placeholder.value = ''; recovery.append(placeholder);
            for (const snapshot of c.state.recovery) {
                const option = this.el('option', '', `${snapshot.createdAt} · ${snapshot.id} · ${snapshot.content.records.length} ${this.t('Items', 'items')}`); option.value = snapshot.id; recovery.append(option);
            }
            const summary = this.el('div'), status = this.el('p', 'prompt-help'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            let generation = 0, review = null, cleanup, closed = false, source = null, recoveryId = null;
            const current = () => !closed && !this.destroyed && !c.disposed;
            const clear = () => {
                const moveFocus = this.doc.activeElement === apply || summary.contains(this.doc.activeElement);
                generation++; review = null; summary.replaceChildren(); apply.disabled = true;
                if (moveFocus && current()) cancel.focus();
            };
            const finish = () => {
                if (closed) return;
                closed = true; generation++; this.updateImport = null; this.closeImport = null; this.openDialog = false;
                cleanup?.(); overlay.remove();
            };
            const cancel = this.button('Cancel', 'Cancel', finish);
            const apply = this.button('ImportApply', 'Replace global collection', async () => {
                if (!review || !current()) return;
                const selected = review;
                if (!c.replacementCurrent(selected)) { clear(); status.textContent = this.t('ImportStale', 'Saved collections or prompt links changed. Review again before replacing anything.'); return; }
                // Close the review before executing. Existing controller receipts own every
                // uncertain result; reopening must never create a replacement operation.
                finish(); await c.applyReplacement(selected);
            }, 'prompt-primary'); apply.disabled = true;
            const counts = value => `${this.t('Active', 'Saved')}: ${value.active} · ${this.t('Archived', 'Archived')}: ${value.removed} · ${this.t('ImportVersions', 'Body versions')}: ${value.versions} · ${this.t('PromptRecovery', 'Recovery snapshot')}: ${value.recovery}`;
            const show = value => {
                summary.replaceChildren();
                summary.append(this.el('h3', '', this.t('ImportCurrent', 'Current global collection')), this.el('p', '', counts(value.plan.current)), this.el('h3', '', this.t('ImportIncoming', 'Incoming saved items')), this.el('p', '', counts(value.plan.incoming)),
                    this.el('p', '', `${this.t('ImportConflicts', 'Matching record IDs / changed records')}: ${value.plan.conflicts.length} / ${value.plan.conflicts.filter(item => item.changed).length}`));
                if (value.kind === 'recover') summary.append(this.paragraph('ImportRecoveryScope', 'This restores the selected snapshot’s saved and archived items. The current collection becomes a recovery snapshot. Other retained snapshots remain.'));
                summary.append(this.paragraph('ImportReferences', 'Prompt references are exact IDs, not imported prompt text. Unavailable links are kept without guessing another version. Incoming references include retained snapshots.'));
                if (!value.references.length) summary.append(this.paragraph('ImportNoReferences', 'No incoming prompt references.'));
                for (const reference of value.references) summary.append(this.el('p', 'prompt-help collection-url', `${reference.location === 'recovery' ? this.t('PromptRecovery', 'Recovery snapshot') + ' · ' + reference.recoveryId + ' · ' : ''}${reference.recordId} · ${reference.promptId} / ${reference.bodyVersionId} · ${reference.status === 'resolved' ? this.t('ImportResolved', 'Available') : this.t('ImportUnresolved', 'Unavailable or still loading')}`));
            };
            const runReview = async () => {
                if (!current() || (source === null && recoveryId === null)) return;
                clear(); const ticket = generation;
                status.textContent = this.t('ImportReading', 'Reading and validating locally…');
                try {
                    const result = await c.reviewReplacement(source, recoveryId);
                    if (!current() || ticket !== generation) return;
                    if (!result) throw { code: 'CONFLICT' };
                    review = result; show(review); apply.disabled = false;
                    status.textContent = this.t('ImportReady', 'Review the scope and counts above. Nothing changes until you choose Replace global collection.');
                } catch (error) {
                    if (current() && ticket === generation) status.textContent = error.code === 'CONFLICT' ? this.t('ImportStale', 'Saved collections or prompt links changed. Review again before replacing anything.') : `${this.t('ImportFailed', 'This file or snapshot could not be reviewed. Nothing was replaced.')} ${this.errorText(error.code || 'INVALID')}`;
                }
            };
            const recheck = this.button('ImportReview', 'Review again', runReview);
            file.addEventListener('change', async () => {
                clear(); source = null; recoveryId = null; recovery.value = '';
                const selected = file.files?.[0], ticket = generation;
                if (!selected) { status.textContent = ''; return; }
                status.textContent = this.t('ImportReading', 'Reading and validating locally…');
                try {
                    if (!Number.isSafeInteger(selected.size) || selected.size > root.LocalItabAICollections.LIMITS.bytes) throw { code: 'SIZE_LIMIT' };
                    const text = await selected.text();
                    if (!current() || ticket !== generation) return;
                    root.LocalItabAICollections.parseBackup(text);
                    source = text; await runReview();
                } catch (error) {
                    if (current() && ticket === generation) status.textContent = `${this.t('ImportFailed', 'This file or snapshot could not be reviewed. Nothing was replaced.')} ${this.errorText(error.code || 'READ')}`;
                }
            });
            recovery.addEventListener('change', () => { clear(); source = null; file.value = ''; recoveryId = recovery.value || null; status.textContent = ''; void runReview(); });
            this.updateImport = () => {
                if (review && !c.replacementCurrent(review)) { clear(); status.textContent = this.t('ImportStale', 'Saved collections or prompt links changed. Review again before replacing anything.'); }
            };
            const actions = this.el('div', 'prompt-actions'); actions.append(cancel, recheck, apply);
            box.append(heading, scope, this.paragraph('ImportDrafts', 'Finish or discard all drafts and proposed revisions before importing. Files are read as text only, without following links or sending content anywhere.'), label, recoveryLabel, summary, status, actions);
            overlay.append(box); this.doc.body.append(overlay); this.openDialog = true; this.closeImport = finish;
            cleanup = root.LocalItabDialog.open(overlay, cancel, finish);
        }
        async exportFile() {
            if (this.openDialog || this.controller.busy) return;
            let omit = false;
            if (!(await this.dialog({ title: this.t('Export', 'Export'), body: this.t('ContextSnapshotExportWarning', 'Saved question/source snapshots, when present, are included in full and may contain private text and endpoint URLs even if attribution source URLs are omitted.') + '\n\n' + this.t('ExportWarning', 'Download an unencrypted JSON copy of all saved and archived items, body history, annotations, prompt references and recovery snapshots. Unsaved drafts are excluded. Keep it somewhere private.'), accept: this.t('Download', 'Download JSON'), checkbox: value => { omit = value; } }))) return;
            try {
                // Store.export() already serializes the backup; download those JSON bytes directly.
                const data = await this.controller.store.export({ omitSourceUrls: omit }); const blob = new root.Blob([data], { type: 'application/json' }); const url = root.URL.createObjectURL(blob); const a = this.el('a'); a.href = url; a.download = 'local-itab-ai-collection.json'; this.doc.body.append(a); a.click(); a.remove(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
            } catch (_) { this.status.textContent = this.t('ExportFailed', 'Export could not be created. Saved content is unchanged.'); }
        }
        async exportMarkdown() {
            const c = this.controller;
            const ready = () => !c.disposed && !c.busy && !c.pendingCommand && !c.error && c.pendingReadGeneration !== c.readGeneration && !c.draft() && Boolean(c.record());
            if (this.exportingMarkdown || this.openDialog || !ready()) return;
            const record = c.record(), generation = this.markdownGeneration, readGeneration = c.readGeneration, savedId = record.id, savedVersion = record.version;
            const current = () => ready() && this.markdownGeneration === generation && c.readGeneration === readGeneration && c.record()?.id === savedId && c.record()?.version === savedVersion;
            this.exportingMarkdown = true;
            let url, anchor, includeSourceUrl = false;
            try {
                // Only the saved record is serialized. No sessions, proposals, history or linked bodies.
                const snapshot = {};
                for (const key of ['id', 'version', 'currentVersionId', 'title', 'body', 'notes', 'type', 'tool', 'tags', 'category', 'promptRef', 'sourceUrl']) {
                    if (record[key] !== undefined) snapshot[key] = JSON.parse(JSON.stringify(record[key]));
                }
                const preview = root.LocalItabAIMarkdown.serialize('collection', snapshot);
                const accepted = await this.dialog({
                    title: this.t('MarkdownReview', 'Review saved-item Markdown export'),
                    body: `${this.t('MarkdownWarning', 'This is an unencrypted, readable copy of one current saved item, not a recovery backup. Unsaved work and history are excluded. Text and notes may still contain private information.')}\n\n${snapshot.title}\n${snapshot.id}\n${this.t('MarkdownVersion', 'Saved version')} · ${snapshot.version}\n${this.t('MarkdownBodyVersion', 'Body version')} · ${snapshot.currentVersionId}`,
                    accept: this.t('MarkdownDownload', 'Download Markdown'), markdownPreview: preview, markdownCurrent: current,
                    sourceValue: snapshot.sourceUrl,
                    sourceCheckbox: snapshot.sourceUrl ? value => { includeSourceUrl = value; } : undefined
                });
                if (!accepted || !current()) return;
                const data = root.LocalItabAIMarkdown.serialize('collection', snapshot, { includeSourceUrl });
                const blob = new root.Blob([data], { type: 'text/markdown;charset=utf-8' });
                url = root.URL.createObjectURL(blob); anchor = this.el('a');
                anchor.href = url; anchor.download = 'local-itab-collection.md'; this.doc.body.append(anchor);
                // No deferred download: acceptance must still refer to this saved selection/version.
                if (!current()) return;
                anchor.click();
                if (current()) this.status.textContent = this.t('MarkdownRequested', 'Download requested.');
            } catch (_) {
                if (current()) this.status.textContent = this.t('MarkdownFailed', 'Markdown export could not be requested. Saved content is unchanged.');
            } finally {
                try { anchor?.remove(); } catch (_) { /* Best-effort DOM cleanup. */ }
                try { if (url) root.URL.revokeObjectURL(url); } catch (_) { /* No delayed retry or download. */ }
                this.exportingMarkdown = false;
            }
        }
        dialog({ title, body, accept, editor, onInput, comparison, checkbox, markdownPreview, sourceCheckbox, sourceValue, markdownCurrent, revisionContext }) {
            if (this.openDialog) return Promise.resolve(false);
            return new Promise(resolve => {
                const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', `prompt-dialog${comparison || editor !== undefined ? ' collection-review-dialog' : ''}`); overlay.setAttribute('aria-hidden', 'true'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'collection-dialog-title'); box.setAttribute('aria-describedby', 'collection-dialog-body');
                const heading = this.el('h2', '', title); heading.id = 'collection-dialog-title'; const content = this.el('p', '', body); content.id = 'collection-dialog-body'; box.append(heading, content);
                if (editor !== undefined) this.field(box, 'Proposed', 'Proposed exact excerpt', editor, onInput, true);
                if (comparison) for (const [key, label, text] of [['Before', 'Current saved excerpt', comparison.before], ['After', 'Proposed excerpt', comparison.after]]) box.append(this.el('h3', '', this.t(key, label)), this.el('pre', 'prompt-readonly', text));
                if (checkbox) { const label = this.el('label', 'prompt-check'), input = this.el('input'); input.type = 'checkbox'; input.addEventListener('change', () => checkbox(input.checked)); label.append(input, this.el('span', '', this.t('OmitUrls', 'Remove source URLs from this copy only (text may still contain private information)'))); box.append(label); }
                if (markdownPreview !== undefined) { const preview = this.el('pre', 'prompt-readonly', markdownPreview); preview.setAttribute('tabindex', '0'); box.append(preview); }
                if (sourceCheckbox) {
                    const label = this.el('label', 'prompt-check'), input = this.el('input'); input.type = 'checkbox'; input.checked = false;
                    const source = this.el('pre', 'prompt-readonly', sourceValue || ''); source.hidden = true;
                    input.addEventListener('change', () => { sourceCheckbox(input.checked); source.hidden = !input.checked; });
                    label.append(input, this.el('span', '', this.t('MarkdownSource', 'Include the saved source URL (may reveal private conversation links). Text and notes may still contain private information.'))); box.append(label, source);
                }
                const actions = this.el('div', 'prompt-actions'); let close, closed = false;
                const finish = answer => { if (closed) return; closed = true; this.openDialog = false; if (markdownPreview !== undefined) this.cancelMarkdownDialog = null; if (revisionContext) revisionContext.closeDialog = null; const current = !revisionContext || revisionContext.current(); close?.(current && (markdownPreview === undefined || !markdownCurrent || markdownCurrent())); overlay.remove(); resolve(answer && current); };
                if (revisionContext) revisionContext.closeDialog = () => finish(false);
                if (markdownPreview !== undefined) this.cancelMarkdownDialog = () => finish(false);
                const cancel = this.button('Cancel', 'Cancel', () => finish(false)), proceed = this.el('button', 'prompt-primary', accept); proceed.type = 'button'; proceed.addEventListener('click', () => finish(true)); actions.append(cancel, proceed); box.append(actions); overlay.append(box); this.doc.body.append(overlay); this.openDialog = true; // A long export review must open at its scope/privacy introduction.
                // Keep the static heading out of the normal sequential Tab order.
                if (markdownPreview !== undefined) {
                    heading.setAttribute('tabindex', '-1');
                    heading.addEventListener('keydown', event => {
                        if (event.key === 'Tab' && event.shiftKey) { event.preventDefault(); proceed.focus(); }
                    });
                }
                close = root.LocalItabDialog.open(overlay, markdownPreview !== undefined ? heading : cancel, () => finish(false));
            });
        }
    }
    root.LocalItabCollectionsView = { View };
})(typeof window === 'undefined' ? globalThis : window);
