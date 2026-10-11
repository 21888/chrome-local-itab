/* Plain-text library UI. No template HTML, remote assets or provider calls. */
(function (root) {
    'use strict';
    const key = name => `prompts${name}`;
    class View {
        constructor({ host, controller, translate = (name, fallback) => root.i18n?.t(key(name)) || fallback, clipboard = root.navigator?.clipboard, confirm } = {}) {
            this.host = host; this.doc = host.ownerDocument; this.controller = controller; this.clipboard = clipboard;
            this.t = (name, fallback) => { const value = translate(name, fallback); return value && value !== key(name) ? value : fallback; };
            this.confirm = confirm || (options => this.dialog(options)); this.historyId = null; this.copyGeneration = 0; this.copying = false; this.pendingFocus = null;
            this.build(); controller.onChange = kind => this.render(kind);
        }
        el(tag, className, text) { const element = this.doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
        button(name, fallback, action, className = '') {
            const button = this.el('button', className, this.t(name, fallback)); button.type = 'button';
            if (action) button.addEventListener('click', action); return button;
        }
        heading(text) { const h = this.el('h2', 'prompt-detail-heading', text); h.tabIndex = -1; return h; }
        focusKey(element, value) { element.dataset.promptFocus = value; return element; }
        build() {
            const c = this.controller;
            this.shell = this.el('div', 'prompt-shell');
            const brand = this.el('div', 'prompt-brand');
            const mark = this.el('span', 'prompt-brand-mark', '▦'); mark.setAttribute('aria-hidden', 'true');
            brand.append(mark, this.el('span', 'prompt-brand-name', 'LOCAL iTAB'));
            const header = this.el('header', 'prompt-header'), title = this.el('div');
            title.append(this.el('p', 'prompt-eyebrow', this.t('Eyebrow', 'Your reusable instructions')), this.el('h1', '', this.t('Title', 'Prompt library')),
                this.el('p', 'prompt-subtitle', this.t('Subtitle', 'Save a good prompt once. Find it, fill in the details, and use it again.')));
            const actions = this.el('div', 'prompt-header-actions');
            const home = this.el('a', 'prompt-link', this.t('Back', 'Back to new tab')); home.href = 'newtab.html';
            home.addEventListener('click', event => { if (c.busy || c.hasUncommittedWork()) { event.preventDefault(); void this.leave(home.href); } });
            this.newButton = this.button('New', 'New prompt', () => { if (c.create()) this.focusDetail('title'); }, 'prompt-primary');
            this.focusKey(this.newButton, 'new'); actions.append(home, this.newButton); header.append(title, actions);
            this.status = this.el('div', 'prompt-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            const layout = this.el('div', 'prompt-layout'), sidebar = this.el('aside', 'prompt-sidebar'); sidebar.setAttribute('aria-label', this.t('Browse', 'Browse prompts'));
            const search = this.el('div', 'prompt-search'), label = this.el('label', '', this.t('SearchLabel', 'Search your library')); label.htmlFor = 'prompt-search';
            this.search = this.el('input'); this.search.type = 'search'; this.search.id = 'prompt-search'; this.search.maxLength = root.LocalItabPrompts.LIMITS.query;
            this.search.placeholder = this.t('SearchPlaceholder', 'Title, body, tags…'); this.search.autocomplete = 'off'; this.search.spellcheck = false;
            this.search.addEventListener('input', () => c.filter({ query: this.search.value })); search.append(label, this.search);
            const nav = this.el('nav', 'prompt-nav'); nav.setAttribute('aria-label', this.t('Views', 'Library views')); this.nav = {};
            for (const [mode, name, fallback] of [['all', 'All', 'All'], ['favorites', 'Favorites', 'Favorites'], ['trash', 'Trash', 'Trash']]) {
                const button = this.button(name, fallback, () => c.filter({ mode })); this.nav[mode] = button; nav.append(button);
            }
            const filter = this.el('div', 'prompt-filter'), categoryLabel = this.el('label', '', this.t('Category', 'Category')); categoryLabel.htmlFor = 'prompt-category-filter';
            this.category = this.el('select'); this.category.id = 'prompt-category-filter'; this.category.addEventListener('change', () => c.filter({ category: this.category.value })); filter.append(categoryLabel, this.category);
            this.draftList = this.el('div', 'prompt-draft-list');
            const listHeading = this.el('div', 'prompt-list-heading'); this.count = this.el('span');
            this.clearButton = this.button('ClearFilters', 'Clear filters', () => c.filter({ query: '', mode: 'all', category: '' }), 'prompt-clear'); listHeading.append(this.count, this.clearButton);
            this.list = this.el('div', 'prompt-list'); this.list.setAttribute('aria-label', this.t('Results', 'Saved prompts'));
            sidebar.append(search, nav, filter, this.draftList, listHeading, this.list);
            this.main = this.el('main', 'prompt-main'); this.main.id = 'prompt-main'; this.main.tabIndex = -1; layout.append(sidebar, this.main);
            const footer = this.el('footer', 'prompt-footer'); footer.append(this.el('p', '', this.t('Scope', 'One library across all workspaces. Saved on this device; copying is always your choice.')),
                this.el('p', '', this.t('Privacy', 'This is not an encrypted vault. Device access and unencrypted backups can expose saved text. Do not store passwords or API keys.')));
            this.shell.append(brand, header, this.status, layout, footer); this.host.append(this.shell);
            this.main.addEventListener('keydown', event => {
                if (event.isComposing || event.keyCode === 229 || event.repeat) return;
                if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && c.draft()) { event.preventDefault(); event.stopPropagation(); void c.save(); }
            });
        }
        async leave(url) {
            if (this.controller.busy) { this.announce(this.t('BusyLeave', 'A save is still running. Wait for it to finish before leaving.')); return; }
            if (await this.confirm({ title: this.t('LeaveTitle', 'Leave this library?'), body: this.t('LeaveBody', 'Unsaved drafts and variable values exist only in this tab. Leaving will discard them. Saved prompts will stay on this device.'), accept: this.t('Leave', 'Leave page') })) {
                root.removeEventListener?.('beforeunload', this.beforeUnload); root.location.assign(url);
            }
        }
        attachDepartureGuard() {
            this.beforeUnload = event => { if (this.controller.hasUncommittedWork()) { event.preventDefault(); event.returnValue = ''; } };
            root.addEventListener?.('beforeunload', this.beforeUnload);
        }
        focusDetail(name) { const target = name ? this.main.querySelector(`[data-prompt-focus="${name}"]`) : this.main.querySelector('.prompt-detail-heading'); target?.focus(); }
        announce(message, error = false) { this.status.classList.toggle('error', error); this.status.replaceChildren(this.el('span', '', message)); }
        render(kind = 'render') {
            const c = this.controller;
            if (kind === 'preview') { this.updatePreview(); return; }
            if (kind === 'draft') { this.renderStatus(); this.renderDrafts(); this.updateDraftState(); return; }
            this.renderStatus(); this.renderList();
            if (kind === 'list') return;
            const active = this.doc.activeElement, restore = this.main.contains(active) ? active?.dataset.promptFocus : null;
            if (restore && c.busy) this.pendingFocus = restore;
            const desiredFocus = restore || (!c.busy ? this.pendingFocus : null);
            const range = restore && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
            this.main.replaceChildren(); this.main.setAttribute('aria-busy', String(c.busy)); this.previewElements = null; this.editorElements = null;
            if (!c.state) this.renderUnavailable();
            else if (c.draft()) this.renderEditor();
            else if (c.record()) this.renderRecord(c.record());
            else this.renderEmpty();
            if (c.busy || c.pendingCommand) for (const control of this.main.querySelectorAll('button, input, textarea, select')) control.disabled = true;
            if (desiredFocus) {
                const target = Array.from(this.main.querySelectorAll('[data-prompt-focus]')).find(node => node.dataset.promptFocus === desiredFocus);
                if (target && !target.disabled) { target.focus(); if (range) target.setSelectionRange?.(...range); }
                else if (!c.busy && !c.draft()) this.focusDetail();
                if (!c.busy) this.pendingFocus = null;
            }
            this.newButton.disabled = !c.state || c.busy || Boolean(c.pendingCommand);
        }
        renderStatus() {
            const c = this.controller; this.status.classList.toggle('error', Boolean(c.error));
            let message = c.error ? this.errorText(c.error.code) : c.busy ? this.t('Saving', 'Saving… Keep this tab open.') : '';
            if (!message && c.notice) message = ({ saved: this.t('Saved', 'Saved on this device.'), remove: this.t('Removed', 'Moved to Trash. You can restore it at any time.'), restore: this.t('Restored', 'Restored to your library.'), restoreVersion: this.t('VersionRestored', 'Restored as a new body version. Later history is still here.'), favorite: this.t('FavoriteSaved', 'Favorite updated.') })[c.notice] || '';
            if (!message && c.draftCount()) message = this.t('DraftNotice', 'Unsaved drafts stay in this tab while you browse. Save them before leaving.');
            this.status.replaceChildren(this.el('span', '', message));
            if (c.pendingCommand) { const retry = this.button('RetrySave', 'Retry same save', () => void c.retry()); retry.disabled = c.busy; this.status.append(retry); }
            else if (c.error?.scope === 'read') this.status.append(this.button('RetryRead', 'Read again', () => void c.refresh()));
            if (c.error?.code?.includes('RESTORE_PENDING')) this.status.append(this.backupLink());
        }
        backupLink() {
            const link = this.el('a', 'prompt-link', this.t('BackupSettings', 'Open backup settings')); link.href = 'options.html#data-settings'; link.target = '_blank'; link.rel = 'noopener'; return link;
        }
        renderDrafts() {
            const c = this.controller; this.draftList.replaceChildren();
            for (const [id, draft] of c.drafts) {
                if (!c.dirty(id) && id !== 'new') continue;
                const button = this.button('Draft', 'Draft', () => { if (c.select(id)) this.focusDetail('title'); }, 'prompt-draft-card');
                button.textContent = `${this.t('Draft', 'Draft')} · ${draft.input.title || this.t('Untitled', 'Untitled')}`; button.disabled = c.busy;
                if (id === c.selected) button.setAttribute('aria-current', 'true'); this.draftList.append(button);
            }
        }
        renderList() {
            const c = this.controller; this.search.value = c.filters.query;
            for (const [mode, button] of Object.entries(this.nav)) button.setAttribute('aria-pressed', String(c.filters.mode === mode));
            const categories = [...new Set((c.state?.records || []).filter(record => (record.deletedAt !== null) === (c.filters.mode === 'trash')).map(record => record.category).filter(Boolean))].sort();
            if (c.filters.category && !categories.includes(c.filters.category)) categories.push(c.filters.category);
            this.category.replaceChildren(); const all = this.el('option', '', this.t('AllCategories', 'All categories')); all.value = ''; this.category.append(all);
            for (const category of categories) { const option = this.el('option', '', category); option.value = category; this.category.append(option); }
            this.category.value = c.filters.category;
            this.renderDrafts(); this.list.replaceChildren();
            const results = c.results(); this.count.textContent = `${results.length} ${this.t('PromptCount', 'prompts')}`;
            this.clearButton.hidden = !c.filters.query && c.filters.mode === 'all' && !c.filters.category;
            for (const { record, snippet } of results) {
                const button = this.el('button', 'prompt-card'); button.type = 'button'; button.disabled = c.busy;
                button.setAttribute('aria-current', String(record.id === c.selected));
                const title = this.el('span', 'prompt-card-title', `${record.favorite ? '★ ' : ''}${record.title}`);
                button.append(title, this.el('span', 'prompt-card-snippet', snippet), this.el('span', 'prompt-card-meta', [record.category, ...record.tags.slice(0, 2)].filter(Boolean).join(' · ') || this.date(record.updatedAt)));
                button.addEventListener('click', () => { this.historyId = null; if (c.select(record.id)) this.focusDetail(); }); this.list.append(button);
            }
            if (!results.length) this.list.append(this.el('p', 'prompt-no-results', c.filters.mode === 'trash' ? this.t('TrashEmpty', 'Trash is empty. Deleted prompts remain recoverable here.') : this.t('NoResults', 'No matching prompts. Clear filters or create a new one.')));
        }
        renderUnavailable() {
            const section = this.el('section', 'prompt-empty'); section.append(this.heading(this.t('Loading', 'Opening your library…')));
            if (this.controller.error) { section.replaceChildren(this.heading(this.t('Unavailable', 'Your library could not be read safely')), this.el('p', '', this.t('UnavailableBody', 'Saved data has not been replaced. Try reading it again.'))); }
            this.main.append(section);
        }
        renderEmpty() {
            const section = this.el('section', 'prompt-empty'), mark = this.el('div', 'prompt-empty-mark', '{ }'); mark.setAttribute('aria-hidden', 'true');
            section.append(mark, this.heading(this.t('EmptyTitle', 'Keep the prompts worth reusing')), this.el('p', '', this.t('EmptyBody', 'Start with a prompt you already use. Add {{topic}} or {{audience}} where the details change, then fill them in each time.')),
                this.button('CreateFirst', 'Create a prompt', () => { if (this.controller.create()) this.focusDetail('title'); }, 'prompt-primary'));
            this.main.append(section);
        }
        field(label, name, value, { multiline = false, help = '', className = '', change } = {}) {
            const wrap = this.el('label', 'prompt-field'), text = this.el('span', '', label), input = this.el(multiline ? 'textarea' : 'input', className);
            input.value = value; if (!multiline) input.type = 'text'; input.autocomplete = 'off'; this.focusKey(input, name);
            if (change) input.addEventListener('input', () => change(input.value)); wrap.append(text, input);
            if (help) { const hint = this.el('small', 'prompt-help', help); wrap.append(hint); }
            return { wrap, input };
        }
        renderEditor() {
            const c = this.controller, draft = c.draft(), form = this.el('form'); form.noValidate = true;
            form.addEventListener('submit', event => { event.preventDefault(); void c.save(); });
            form.append(this.heading(draft.id ? this.t('EditTitle', 'Edit prompt') : this.t('NewTitle', 'New prompt')),
                this.el('p', 'prompt-help', this.t('EditorHelp', 'Title and body are required. Only explicit body saves create a version.')));
            if (draft.conflict) {
                const conflict = this.el('div', 'prompt-conflict'); conflict.append(this.el('p', '', this.t('Conflict', 'This prompt changed in another tab or was restored from backup. Your draft is intact. Review the saved prompt before choosing what to keep.')));
                const actions = this.el('div', 'prompt-actions');
                actions.append(this.button('SaveCopy', 'Save draft as new prompt', () => void c.save(true), 'prompt-primary'), this.button('UseSaved', 'Discard draft and use saved', () => void this.discardDraft())); conflict.append(actions);
                const latest = c.record();
                if (latest) { const details = this.el('details', 'prompt-latest'); details.append(this.el('summary', '', this.t('ReviewSaved', 'Review current saved prompt')), this.el('h3', '', latest.title), this.el('pre', 'prompt-readonly', latest.body)); conflict.append(details); }
                else conflict.append(this.el('p', 'prompt-help', this.t('MissingSaved', 'This item is no longer in the saved library. Your draft can still be saved as a new prompt.')));
                form.append(conflict);
            }
            if (c.error?.code === 'HISTORY_LIMIT' || (c.record()?.history.length >= root.LocalItabPrompts.LIMITS.versions && draft.input.body !== c.record()?.body)) {
                const limit = this.el('div', 'prompt-conflict'); limit.append(this.el('p', '', this.t('HistoryLimit', 'This prompt has reached 20 body versions. Save this draft as a new prompt to continue. The old prompt and all its history will stay unchanged.')), this.button('SaveCopy', 'Save draft as new prompt', () => void c.save(true), 'prompt-primary')); form.append(limit);
            }
            if (['CAPACITY', 'SIZE_LIMIT', 'RECOVERY_LIMIT', 'HISTORY_LIMIT'].includes(c.error?.code)) {
                const help = this.el('p', 'prompt-help'); help.append(this.backupLink()); form.append(help);
            }
            const controls = [];
            for (const [name, label, multiline, help] of [
                ['title', this.t('TitleField', 'Title'), false, ''],
                ['body', this.t('BodyField', 'Prompt body'), true, this.t('VariableHelp', 'Use {{name}} for a variable. Use \\{{name}} for literal braces. Expressions and code are never run.')]
            ]) {
                const field = this.field(label, name, draft.input[name], { multiline, help, className: multiline ? 'prompt-body-editor' : '', change: value => c.update(name, value) });
                field.input.required = true; controls.push(field.input); form.append(field.wrap);
            }
            const grid = this.el('div', 'prompt-form-grid');
            for (const [name, label, help] of [ ['category', this.t('CategoryOptional', 'Category (optional)'), ''], ['tagsText', this.t('Tags', 'Tags (optional)'), this.t('TagsHelp', 'Separate tags with commas.')], ['tool', this.t('Tool', 'Tool or usage note (optional)'), this.t('ToolHelp', 'A label for your reference. This does not connect to a provider.')] ]) {
                const field = this.field(label, name, draft.input[name], { help, change: value => c.update(name, value) }); controls.push(field.input); grid.append(field.wrap);
            }
            form.append(grid);
            const favorite = this.el('label', 'prompt-check'), checkbox = this.el('input'); checkbox.type = 'checkbox'; checkbox.checked = draft.input.favorite; this.focusKey(checkbox, 'favorite');
            checkbox.addEventListener('change', () => c.update('favorite', checkbox.checked)); controls.push(checkbox); favorite.append(checkbox, this.el('span', '', this.t('Favorite', 'Favorite'))); form.append(favorite);
            const footer = this.el('div', 'prompt-form-actions prompt-actions');
            const save = this.button('Save', 'Save prompt', null, 'prompt-primary'); save.type = 'submit'; this.focusKey(save, 'save');
            const cancel = this.button('CancelEdit', 'Close editor', () => void this.discardDraft()); this.focusKey(cancel, 'cancel');
            const state = this.el('span', 'prompt-help'); footer.append(save, cancel, state); form.append(footer); this.main.append(form);
            this.editorElements = { controls, save, cancel, state }; this.updateDraftState();
        }
        updateDraftState() {
            const c = this.controller, draft = c.draft(), ui = this.editorElements; if (!draft || !ui) return;
            const blocked = c.busy || Boolean(c.pendingCommand); for (const control of ui.controls) control.disabled = blocked;
            ui.save.disabled = blocked || draft.conflict || !draft.input.title.trim() || !draft.input.body.trim(); ui.cancel.disabled = blocked;
            ui.state.textContent = c.dirty() ? this.t('Unsaved', 'Unsaved changes · Ctrl/⌘ + S') : this.t('NoChanges', 'No unsaved changes');
        }
        async discardDraft() {
            const c = this.controller; if (c.busy || c.pendingCommand) return;
            if (c.dirty() && !await this.confirm({ title: this.t('DiscardTitle', 'Discard this draft?'), body: this.t('DiscardBody', 'Only unsaved edits will be discarded. The saved prompt and its versions will stay in the library.'), accept: this.t('Discard', 'Discard draft') })) return;
            c.discard(); this.focusDetail();
        }
        renderRecord(record) {
            const c = this.controller, top = this.el('section', 'prompt-detail-top');
            top.append(this.el('p', 'prompt-eyebrow', record.deletedAt ? this.t('InTrash', 'In Trash') : this.t('SavedPrompt', 'Saved prompt')), this.heading(record.title));
            const meta = this.el('div', 'prompt-meta'); for (const value of [record.category, ...record.tags, record.tool].filter(Boolean)) meta.append(this.el('span', 'prompt-tag', value)); top.append(meta);
            top.append(this.el('p', 'prompt-dates', `${this.t('Created', 'Created')} ${this.date(record.createdAt)} · ${this.t('Updated', 'Updated')} ${this.date(record.updatedAt)}`));
            const actions = this.el('div', 'prompt-actions');
            if (record.deletedAt) {
                actions.append(this.button('Restore', 'Restore prompt', () => void c.action('restore'), 'prompt-primary'));
                top.append(this.el('p', 'prompt-help', this.t('TrashHelp', 'The body and all versions are kept. Restore to edit or reuse this prompt.')));
            } else {
                actions.append(this.focusKey(this.button('Edit', 'Edit prompt', () => { if (c.edit()) this.focusDetail('title'); }), 'edit'),
                    this.focusKey(this.button(record.favorite ? 'Unfavorite' : 'Favorite', record.favorite ? 'Remove favorite' : 'Favorite', () => void c.action('favorite')), 'favorite-action'),
                    this.button('MoveTrash', 'Move to Trash', () => void this.remove(record), 'prompt-danger'));
            }
            for (const button of actions.children) button.disabled = c.busy || Boolean(c.pendingCommand); top.append(actions); this.main.append(top);
            if (record.deletedAt) this.main.append(this.el('pre', 'prompt-readonly', record.body)); else this.renderUse(record);
            this.renderHistory(record);
        }
        async remove(record) {
            if (await this.confirm({ title: this.t('TrashTitle', 'Move this prompt to Trash?'), body: `${record.title}\n\n${this.t('TrashBody', 'It will leave normal search results. Its body and versions are kept, and you can restore it from Trash.')}`, accept: this.t('MoveTrash', 'Move to Trash') })) {
                if (this.controller.selected !== record.id) return;
                await this.controller.action('remove', undefined, record.version); this.focusDetail();
            }
        }
        renderUse(record) {
            const c = this.controller, section = this.el('section'); section.append(this.el('h3', '', this.t('Use', 'Prepare to use')),
                this.el('p', 'prompt-help', this.t('UseHelp', 'Variable values stay only in this tab. Preview the completed text, then copy it to the tool you choose.')));
            if (c.session(record).versionId !== record.currentVersionId) {
                const retained = this.el('div', 'prompt-conflict'); retained.append(this.el('p', '', this.t('RetainedVariables', 'The saved body changed. This form keeps your previous body and variable values. Clear values when you are ready to use the latest body.'))); section.append(retained);
            }
            const literalWrap = this.el('label', 'prompt-check'), literal = this.el('input'); literal.type = 'checkbox'; literal.checked = c.session(record).literal;
            literal.addEventListener('change', () => c.setLiteral(literal.checked)); literalWrap.append(literal, this.el('span', '', this.t('Literal', 'Use the template literally (do not replace variables)'))); section.append(literalWrap);
            const variables = this.el('div', 'prompt-variables');
            for (const name of c.variables(record)) {
                const entry = this.el('div', 'prompt-variable'), field = this.field(name, `variable-${name}`, c.session(record).values[name] || '', { multiline: true, change: value => c.setVariable(name, value) });
                const empty = this.button('EmptyValue', 'Use empty value', () => { field.input.value = ''; c.setVariable(name, ''); }, 'prompt-empty-value'); empty.setAttribute('aria-label', `${this.t('EmptyValue', 'Use empty value')}: ${name}`); entry.append(field.wrap, empty); variables.append(entry);
            }
            section.append(variables);
            const previewSection = this.el('div', 'prompt-section'), heading = this.el('div', 'prompt-section-heading');
            heading.append(this.el('h3', '', this.t('Preview', 'Completed preview')));
            const clear = this.button('ClearValues', 'Clear values', () => { c.clearVariables(); this.focusDetail(); }, 'prompt-clear'); clear.hidden = !c.variables(record).length; heading.append(clear);
            const preview = this.el('textarea', 'prompt-readonly prompt-preview'); preview.readOnly = true; preview.setAttribute('aria-label', this.t('Preview', 'Completed preview')); this.focusKey(preview, 'preview'); preview.rows = 9;
            const status = this.el('p', 'prompt-preview-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const actions = this.el('div', 'prompt-actions prompt-section');
            const copy = this.button('CopyCompleted', 'Copy completed prompt', () => void this.copy(), 'prompt-primary'); this.focusKey(copy, 'copy');
            const select = this.button('SelectPreview', 'Select text', () => { preview.focus(); preview.select?.(); }); actions.append(copy, select);
            previewSection.append(heading, preview, status, actions); section.append(previewSection); this.main.append(section);
            this.previewElements = { literal, variables, preview, status, copy }; this.updatePreview();
        }
        updatePreview() {
            const c = this.controller, ui = this.previewElements; if (!ui) return;
            const result = c.preview(); if (!result) return;
            ui.literal.checked = c.session().literal; ui.variables.hidden = ui.literal.checked;
            ui.preview.value = result.text; ui.copy.disabled = !result.complete || c.busy || Boolean(c.pendingCommand) || this.copying;
            ui.status.textContent = result.error ? this.errorText(result.error) : result.missing.length ? `${this.t('MissingValues', 'Fill these variables before copying:')} ${result.missing.join(', ')}` : this.t('PreviewReady', 'Ready to copy. Your saved template will not change.');
        }
        async copy() {
            const c = this.controller, result = c.preview();
            if (!result?.complete || c.busy || c.pendingCommand || this.copying) return;
            this.copying = true;
            const generation = ++this.copyGeneration, ui = this.previewElements; ui.copy.disabled = true;
            try {
                if (!this.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await this.clipboard.writeText(result.text);
                if (generation !== this.copyGeneration || this.previewElements !== ui) return;
                ui.status.textContent = this.t('Copied', 'Copied. Paste it into the tool you choose.');
            } catch (_) {
                if (generation !== this.copyGeneration || this.previewElements !== ui) return;
                ui.status.textContent = this.t('CopyFailed', 'Copy was blocked. Your preview is still here. Select the text and use your browser’s Copy command.');
                ui.preview.focus(); ui.preview.select?.();
            } finally { this.copying = false; if (generation === this.copyGeneration && this.previewElements === ui) ui.copy.disabled = !c.preview()?.complete; }
        }
        renderHistory(record) {
            const c = this.controller, details = this.el('details', 'prompt-history');
            details.append(this.el('summary', '', `${this.t('History', 'Body version history')} (${record.history.length})`),
                this.el('p', 'prompt-help', this.t('HistoryHelp', 'Only saved body changes create versions. Restoring keeps later history and creates a new version.')));
            const list = this.el('div', 'prompt-history-list'), body = this.el('pre', 'prompt-readonly'); body.tabIndex = 0;
            const caption = this.el('p', 'prompt-help'), restore = this.button('RestoreVersion', 'Restore as new version', async () => {
                const versionId = this.historyId;
                if (!await this.confirm({ title: this.t('RestoreVersionTitle', 'Restore this body version?'), body: this.t('RestoreVersionBody', 'The selected body will become a new version. Title, tags and category stay unchanged. All later versions remain available.'), accept: this.t('RestoreVersion', 'Restore as new version') })) return;
                if (c.selected !== record.id) return; await c.action('restoreVersion', versionId, record.version); this.focusDetail();
            });
            const paint = version => { this.historyId = version.id; body.textContent = version.body; caption.textContent = `${this.t('VersionSaved', 'Body saved')} ${this.date(version.createdAt)}`; restore.disabled = c.busy || Boolean(c.pendingCommand) || Boolean(record.deletedAt) || version.id === record.currentVersionId;
                for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.versionId === version.id)); };
            for (const [index, version] of [...record.history].entries()) {
                const button = this.el('button', '', `v${index + 1}${version.id === record.currentVersionId ? ` · ${this.t('Current', 'current')}` : ''}`); button.type = 'button'; button.dataset.versionId = version.id; button.addEventListener('click', () => paint(version)); list.append(button);
            }
            details.append(list, caption, body, this.el('div', 'prompt-section')); details.lastElementChild?.append(restore);
            // append directly when running the small synthetic DOM model as well.
            if (!restore.parentElement) details.append(restore);
            paint(record.history.find(version => version.id === this.historyId) || record.history[record.history.length - 1]); this.main.append(details);
        }
        date(value) {
            try { return new Intl.DateTimeFormat(this.doc.documentElement.lang || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch (_) { return value; }
        }
        errorText(code) {
            if (code === 'CONFLICT') return this.t('Conflict', 'This prompt changed in another tab or was restored from backup. Your draft is intact. Review the saved prompt before choosing what to keep.');
            if (['WRITE', 'VERIFY'].includes(code)) return this.t('WriteUncertain', 'The save could not be verified. Your draft is kept. Retry the same save before editing further; do not assume it was saved.');
            if (code === 'READ') return this.t('ReadFailed', 'Saved data could not be read safely. Your current draft is kept. Try again.');
            if (code === 'HISTORY_LIMIT') return this.t('HistoryLimit', 'This prompt has reached 20 body versions. Save this draft as a new prompt to continue. The old prompt and all its history will stay unchanged.');
            if (code === 'CAPACITY') return this.t('Capacity', 'The library limit is 200 prompts, including Trash. Your draft is kept. Export a full backup; moving items to Trash does not free capacity.');
            if (code === 'RECOVERY_LIMIT') return this.t('RecoveryLimit', 'All 8 recovery slots are occupied. Your draft is kept. Export a full backup before managing stored recovery data. Nothing was removed automatically.');
            if (code === 'SIZE_LIMIT') return this.t('SizeLimit', 'The 2 MiB library limit has been reached. Your draft is kept. Export a full backup. No body or history was truncated.');
            if (['TEXT_LIMIT', 'TEXT', 'TAGS'].includes(code)) return this.t('Validation', 'Check the required title and body, field lengths, and unique tags. Limits: title 200, body 32,000, category 100, tool note 200 characters; up to 20 tags of 64 characters.');
            if (['PREVIEW_LIMIT', 'VARIABLE_LIMIT'].includes(code)) return this.t('PreviewLimit', 'This preview is too large or has too many variables. Reduce variable values or use the literal template. Nothing was copied.');
            if (['RESTORE_PENDING', 'UNAVAILABLE', 'WORKSPACE_BUSY', 'WORKSPACE_RECOVERY_REQUIRED', 'WORKSPACE_CORRUPT'].includes(code) || code?.startsWith('WORKSPACE_')) return this.t('StorageBlocked', 'Safe storage is temporarily unavailable or needs recovery. Your draft is kept. Finish any backup restore and try again.');
            return this.t('Invalid', 'This content could not be saved safely. Your draft is kept. Review the fields and try again.');
        }
        dialog({ title, body, accept }) {
            if (this.openDialog) return Promise.resolve(false);
            return new Promise(resolve => {
                const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', 'prompt-dialog'); overlay.setAttribute('aria-hidden', 'true');
                box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'prompt-dialog-title'); box.setAttribute('aria-describedby', 'prompt-dialog-body');
                const heading = this.el('h2', '', title); heading.id = 'prompt-dialog-title'; const content = this.el('p', '', body); content.id = 'prompt-dialog-body';
                const actions = this.el('div', 'prompt-actions'); let close;
                const finish = answer => { if (!this.openDialog) return; this.openDialog = false; close?.(); overlay.remove(); resolve(answer); };
                const cancel = this.button('Cancel', 'Cancel', () => finish(false)), proceed = this.el('button', 'prompt-primary', accept); proceed.type = 'button'; proceed.addEventListener('click', () => finish(true));
                actions.append(cancel, proceed); box.append(heading, content, actions); overlay.append(box); this.doc.body.append(overlay); this.openDialog = true;
                close = root.LocalItabDialog.open(overlay, cancel, () => finish(false));
            });
        }
    }
    root.LocalItabPromptsView = { View };
})(typeof window === 'undefined' ? globalThis : window);
