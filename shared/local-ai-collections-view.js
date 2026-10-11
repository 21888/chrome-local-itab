/* Local, text-only excerpts. Source links are never fetched or previewed. */
(function (root) {
    'use strict';
    class View {
        constructor({ host, controller, translate, clipboard = root.navigator?.clipboard, confirm } = {}) {
            this.host = host; this.doc = host.ownerDocument; this.controller = controller;
            this.t = translate || ((key, fallback) => { const value = root.i18n?.t(`collections${key}`); return value && value !== `collections${key}` ? value : fallback; });
            this.clipboard = clipboard; this.confirm = confirm || (options => this.dialog(options));
            this.proposals = new Map(); this.revisionDraft = null; this.openDialog = false;
            controller.onChange = kind => kind === 'prompts' ? this.updatePromptPanel() : kind === 'draft' ? this.updateEditor() : kind === 'list' ? this.renderList() : this.render();
            this.build();
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
            const brand = this.el('div', 'prompt-brand'); brand.append(this.el('span', 'prompt-brand-mark', '≡'), this.el('span', 'prompt-brand-name', 'LOCAL ITAB / AI WORKBENCH'));
            const header = this.el('header', 'prompt-header'), heading = this.el('div'); heading.append(this.paragraph('Eyebrow', 'YOUR LOCAL REFERENCE SHELF', 'prompt-eyebrow'), this.el('h1', '', this.t('Heading', 'AI result collection')), this.paragraph('Subtitle', 'Keep the answers worth returning to. Paste an exact excerpt, then add your own context.', 'prompt-subtitle'));
            const actions = this.el('div', 'prompt-header-actions');
            for (const [key, label, href] of [['Back', 'New tab', 'newtab.html'], ['Prompts', 'Prompt library', 'prompts.html']]) {
                const link = this.el('a', 'prompt-link', this.t(key, label)); link.href = href;
                link.addEventListener('click', event => { if (c.hasUncommittedWork() || this.revisionDraft !== null || this.proposals.size) { event.preventDefault(); void this.leave(href); } }); actions.append(link);
            }
            this.exportButton = this.button('Export', 'Export', () => this.exportFile());
            this.newButton = this.button('New', 'Save an excerpt', () => { c.create(); this.main.querySelector('input')?.focus(); }, 'prompt-primary'); actions.append(this.exportButton, this.newButton); header.append(heading, actions);
            this.status = this.el('div', 'prompt-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            const layout = this.el('div', 'prompt-layout'), sidebar = this.el('aside', 'prompt-sidebar'); sidebar.setAttribute('aria-label', this.t('Browse', 'Browse saved excerpts'));
            this.search = this.field(sidebar, 'Search', 'Search title, excerpt and tags', '', query => c.filter({ query })); this.search.type = 'search'; this.search.maxLength = 500;
            const nav = this.el('nav', 'prompt-nav'); this.nav = {};
            for (const [mode, key, label] of [['all', 'Active', 'Saved'], ['trash', 'Archived', 'Archived']]) { const button = this.button(key, label, () => c.filter({ mode })); this.nav[mode] = button; nav.append(button); } sidebar.append(nav);
            this.filters = {};
            for (const [name, label] of [['type', 'Type'], ['tool', 'Tool'], ['tag', 'Tag']]) {
                const wrap = this.el('label', 'prompt-field'); const select = this.el('select'); select.addEventListener('change', () => c.filter({ [name]: select.value })); wrap.append(this.el('span', '', this.t(name, label)), select); sidebar.append(wrap); this.filters[name] = select;
            }
            this.draftList = this.el('div', 'prompt-draft-list'); this.listCount = this.el('p', 'prompt-list-heading'); this.list = this.el('div', 'prompt-list'); sidebar.append(this.draftList, this.listCount, this.list);
            this.main = this.el('main', 'prompt-main'); this.main.id = 'collection-main'; this.main.tabIndex = -1; layout.append(sidebar, this.main);
            const footer = this.el('footer', 'prompt-footer'); footer.append(this.paragraph('Scope', 'Saved on this device. Excerpts are manually supplied, not complete conversations. Nothing is scraped, executed or sent to a model.'), this.paragraph('Limits', 'Limits: 200 items including archived · 32,000 characters per excerpt · 20 body versions per item · 2 MiB total. Capacity errors keep your draft; no text or history is silently removed.'), this.paragraph('Privacy', 'Not an encrypted vault. Avoid secrets. Exports contain private text, annotations, history and conversation links; removing source URLs does not anonymize the text.'));
            this.shell.append(brand, header, this.status, layout, footer); this.host.append(this.shell);
            this.main.addEventListener('keydown', event => { if (!event.isComposing && event.keyCode !== 229 && !event.repeat && (event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 's' && c.draft()) { event.preventDefault(); void this.save(); } });
        }
        attachDepartureGuard() { root.addEventListener?.('beforeunload', event => { if (this.controller.hasUncommittedWork() || this.revisionDraft !== null || this.proposals.size) { event.preventDefault(); event.returnValue = ''; } }); }
        async leave(href) { if (this.controller.busy || this.controller.pendingCommand) return; if (await this.confirm({ title: this.t('Leave', 'Leave this page?'), body: this.t('LeaveBody', 'Unsaved drafts live only in this tab and will be lost.'), accept: this.t('Leave', 'Leave this page?') })) root.location.assign(href); }
        renderList() {
            const c = this.controller; this.search.value = c.filters.query;
            for (const [mode, node] of Object.entries(this.nav)) node.setAttribute('aria-pressed', String(c.filters.mode === mode));
            for (const [name, select] of Object.entries(this.filters)) {
                const values = name === 'type' ? ['answer', 'code', 'plan', 'other'] : [...new Set((c.state?.records || []).flatMap(record => name === 'tag' ? record.tags : [record.tool]).filter(Boolean))].sort();
                if (c.filters[name] && !values.includes(c.filters[name])) values.push(c.filters[name]);
                select.replaceChildren(); const all = this.el('option', '', this.t('All', 'All')); all.value = ''; select.append(all);
                for (const value of values) { const option = this.el('option', '', name === 'type' ? this.t(value, value) : value); option.value = value; select.append(option); } select.value = c.filters[name];
            }
            this.draftList.replaceChildren();
            for (const [id, draft] of c.drafts) { const button = this.button('Draft', 'Draft', () => c.select(id), 'prompt-draft-card'); button.textContent = `${this.t('Draft', 'Draft')} · ${draft.input.title || this.t('Untitled', 'Untitled')}`; button.disabled = c.busy; this.draftList.append(button); }
            this.list.replaceChildren(); let results = []; try { results = c.results(); } catch (_) { this.list.append(this.paragraph('QueryLong', 'Search is too long. Use up to 500 characters.')); }
            this.listCount.textContent = `${results.length} ${this.t('Items', 'items')}`;
            for (const { record, snippet } of results) {
                const card = this.el('button', 'prompt-card'); card.type = 'button'; card.disabled = c.busy; card.setAttribute('aria-current', String(c.selected === record.id));
                card.append(this.el('span', 'prompt-card-title', record.title), this.el('span', 'prompt-card-snippet', snippet), this.el('span', 'prompt-card-meta', [this.t(record.type, record.type), record.tool, ...record.tags].filter(Boolean).join(' · '))); card.addEventListener('click', () => c.select(record.id)); this.list.append(card);
            }
            if (!results.length && c.state) this.list.append(this.paragraph('NoResults', 'No matching excerpts. Try another search or filter.', 'prompt-no-results'));
        }
        render() {
            const c = this.controller;
            this.renderList(); this.newButton.disabled = !c.state || c.busy || Boolean(c.pendingCommand); this.exportButton.disabled = !c.state || c.busy;
            this.status.replaceChildren(); this.status.classList.toggle('error', Boolean(c.error));
            if (c.error) { this.status.append(this.el('span', '', this.errorText(c.error.code)), this.button('Refresh', 'Refresh saved data', () => c.refresh())); if (c.pendingCommand) this.status.append(this.button('Retry', 'Check / retry the same save', () => c.retry())); }
            else if (c.busy) this.status.textContent = this.t('Saving', 'Saving locally…'); else if (c.notice) this.status.textContent = this.t('Saved', 'Saved locally.');
            const focused = this.doc.activeElement?.getAttribute?.('data-collection-field');
            this.main.replaceChildren(); this.editor = null; this.promptPanel = null;
            if (!c.state) { this.main.append(this.el('h2', '', this.t(c.error ? 'Unavailable' : 'Loading', c.error ? 'The library could not be read' : 'Loading your collection…'))); return; }
            const draft = c.draft(), record = c.record();
            if (draft) this.renderEditor(draft); else if (record) this.renderDetail(record); else {
                const empty = this.el('div', 'prompt-empty'); empty.append(this.el('div', 'prompt-empty-mark', '▤'), this.el('h2', '', this.t('Empty', 'Keep the useful part')), this.paragraph('EmptyBody', 'A clear explanation. A code snippet. A plan you want to revisit. Save the exact text and keep your annotations separate.'), this.button('New', 'Save an excerpt', () => c.create(), 'prompt-primary')); this.main.append(empty);
            }
            if (focused) this.main.querySelector(`[data-collection-field="${focused}"]`)?.focus();
        }
        errorText(code) {
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
                await c.save(asCopy);
            } catch (error) { c.error = { code: error.code || 'INVALID' }; c.notify(); }
        }
        async discard() { const c = this.controller; if (c.busy || c.pendingCommand) return; if (!c.dirty() || await this.confirm({ title: this.t('Discard', 'Discard draft'), body: this.t('DiscardBody', 'Discard only this unsaved draft? Saved content is unchanged.'), accept: this.t('Discard', 'Discard draft') })) c.discard(); }
        renderDetail(record) {
            if (this.proposals.has(record.id)) {
                const note = this.el('div', 'prompt-conflict'); note.append(this.paragraph('ProposalKept', 'A proposed excerpt is kept in this tab. Resume its review or discard it.'), this.button('ResumeRevision', 'Resume revision', () => this.revise(record)), this.button('ProposalAsNew', 'Use proposed text in a new draft', () => this.proposalAsNew(record)), this.button('DiscardProposal', 'Discard proposed text', async () => { if (await this.confirm({ title: this.t('DiscardProposal', 'Discard proposed text'), body: this.t('DiscardBody', 'Discard only this unsaved draft? Saved content is unchanged.'), accept: this.t('Discard', 'Discard draft') })) { this.proposals.delete(record.id); this.render(); } })); this.main.append(note);
            }
            const c = this.controller, top = this.el('div', 'prompt-detail-top'); top.append(this.el('h2', '', record.title));
            const meta = this.el('div', 'prompt-meta'); for (const text of [this.t(record.type, record.type), record.tool, ...record.tags].filter(Boolean)) meta.append(this.el('span', 'prompt-tag', text)); top.append(meta);
            top.append(this.el('p', 'prompt-dates', `${this.t('Updated', 'Updated')} ${new Date(record.updatedAt).toLocaleString()} · ${record.history.length}/20 ${this.t('Versions', 'body versions')}`));
            const actions = this.el('div', 'prompt-actions');
            if (!record.deletedAt) actions.append(this.button('Edit', 'Edit details', () => c.edit()), this.button('Revise', 'Revise excerpt', () => this.revise(record)), this.button('Archive', 'Archive', () => c.action('remove')));
            else actions.append(this.button('Restore', 'Restore from archive', () => c.action('restore')));
            for (const button of actions.children) button.disabled = c.busy || Boolean(c.pendingCommand); top.append(actions); this.main.append(top);
            this.main.append(this.el('h3', '', this.t('body', 'Exact excerpt'))); const body = this.el('pre', 'prompt-readonly', record.body); body.tabIndex = 0; this.main.append(body);
            this.main.append(this.button('Copy', 'Copy excerpt', () => this.copy(record.body)), this.paragraph('PlainText', 'Plain text only. Saved code and markup are never executed.'));
            if (record.notes) { const section = this.el('section', 'prompt-section'); section.append(this.el('h3', '', this.t('notes', 'Your annotations')), this.el('pre', 'prompt-readonly', record.notes)); this.main.append(section); }
            const source = root.LocalItabAICollections.sourceMetadata(record.sourceUrl), section = this.el('section', 'prompt-section'); section.append(this.el('h3', '', this.t('Source', 'Source')));
            if (source.provided) { const link = this.el('a', 'collection-source', `${this.t('OpenSource', 'Open user-provided source')} · ${source.host}`); link.href = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.referrerPolicy = 'no-referrer'; section.append(link, this.el('p', 'prompt-help collection-url', record.sourceUrl), this.paragraph('SourceHelp', 'User-provided attribution only. This page never fetches the link; the original account or permission may be needed.')); }
            else section.append(this.paragraph('NoSource', 'No source URL supplied.')); this.main.append(section);
            if (record.promptRef) this.buildPromptPanel(this.main, false);
            const history = this.el('details', 'prompt-history'); history.append(this.el('summary', '', this.t('History', 'Excerpt version history')));
            record.history.slice().reverse().forEach((version, index) => { const item = this.el('section', 'prompt-section'); item.append(this.el('h3', '', `${new Date(version.createdAt).toLocaleString()}${index === 0 ? ` · ${this.t('Current', 'Current')}` : ''}`), this.el('pre', 'prompt-readonly', version.body)); if (index !== 0 && !record.deletedAt) { const restore = this.button('ReviewRestore', 'Review restoring this text', () => this.revise(record, version)); restore.disabled = c.busy || Boolean(c.pendingCommand); item.append(restore); } history.append(item); }); this.main.append(history);
        }
        proposalAsNew(record) {
            const c = this.controller; if (c.busy || c.pendingCommand) return;
            if (c.drafts.has('new')) { c.select('new'); this.status.textContent = this.t('ExistingDraft', 'Finish or discard the existing new-item draft first. Your proposed excerpt is still kept.'); return; }
            const draft = c.makeDraft(record); delete draft.id; delete draft.version; draft.input.body = this.proposals.get(record.id); draft.baseline = {};
            c.drafts.set('new', draft); c.select('new');
        }
        async copy(body) { if (this.copying) return; this.copying = true; try { await this.clipboard.writeText(body); this.status.textContent = this.t('Copied', 'Excerpt copied.'); } catch (_) { this.status.textContent = this.t('CopyBlocked', 'Copy was blocked. Select the excerpt text to copy it manually.'); } finally { this.copying = false; } }
        async revise(record, historic) {
            if (this.openDialog || this.controller.busy || this.controller.pendingCommand || this.revisionDraft !== null) return;
            let body = historic?.body ?? this.proposals.get(record.id) ?? record.body;
            this.revisionDraft = body; this.proposals.set(record.id, body);
            try {
                if (!historic) {
                    const accepted = await this.dialog({ title: this.t('Revise', 'Revise excerpt'), body: this.t('RevisionHelp', 'Enter proposed text. The saved excerpt stays unchanged until you review and accept a new version.'), accept: this.t('Review', 'Review change'), editor: body, onInput: value => { body = value; this.revisionDraft = value; this.proposals.set(record.id, value); } });
                    if (!accepted) return;
                }
                if (body === record.body) { this.proposals.delete(record.id); this.status.textContent = this.t('Unchanged', 'The excerpt is unchanged.'); return; }
                if (this.controller.record()?.version !== record.version) { this.controller.error = { code: 'CONFLICT' }; this.controller.notify(); return; }
                const plan = await this.controller.reviewBody(body, historic?.id); if (!plan) return;
                if (await this.dialog({ title: this.t('ReviewRevision', 'Review excerpt revision'), body: this.t('RevisionConfirm', 'Accepting creates a new body version. All earlier versions remain. Annotations and source details are unchanged.'), accept: this.t('AcceptRevision', 'Accept new body version'), comparison: { before: record.body, after: plan.body } })) { if (await this.controller.acceptRevision(plan)) this.proposals.delete(record.id); }
            } finally { this.revisionDraft = null; this.render(); }
        }
        async exportFile() {
            if (this.openDialog || this.controller.busy) return;
            let omit = false;
            if (!(await this.dialog({ title: this.t('Export', 'Export'), body: this.t('ExportWarning', 'Download an unencrypted JSON copy of all saved and archived items, body history, annotations, prompt references and recovery snapshots. Unsaved drafts are excluded. Keep it somewhere private.'), accept: this.t('Download', 'Download JSON'), checkbox: value => { omit = value; } }))) return;
            try {
                // Store.export() already serializes the backup; download those JSON bytes directly.
                const data = await this.controller.store.export({ omitSourceUrls: omit }); const blob = new root.Blob([data], { type: 'application/json' }); const url = root.URL.createObjectURL(blob); const a = this.el('a'); a.href = url; a.download = 'local-itab-ai-collection.json'; this.doc.body.append(a); a.click(); a.remove(); root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
            } catch (_) { this.status.textContent = this.t('ExportFailed', 'Export could not be created. Saved content is unchanged.'); }
        }
        dialog({ title, body, accept, editor, onInput, comparison, checkbox }) {
            if (this.openDialog) return Promise.resolve(false);
            return new Promise(resolve => {
                const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', `prompt-dialog${comparison || editor !== undefined ? ' collection-review-dialog' : ''}`); overlay.setAttribute('aria-hidden', 'true'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'collection-dialog-title'); box.setAttribute('aria-describedby', 'collection-dialog-body');
                const heading = this.el('h2', '', title); heading.id = 'collection-dialog-title'; const content = this.el('p', '', body); content.id = 'collection-dialog-body'; box.append(heading, content);
                if (editor !== undefined) this.field(box, 'Proposed', 'Proposed exact excerpt', editor, onInput, true);
                if (comparison) for (const [key, label, text] of [['Before', 'Current saved excerpt', comparison.before], ['After', 'Proposed excerpt', comparison.after]]) box.append(this.el('h3', '', this.t(key, label)), this.el('pre', 'prompt-readonly', text));
                if (checkbox) { const label = this.el('label', 'prompt-check'), input = this.el('input'); input.type = 'checkbox'; input.addEventListener('change', () => checkbox(input.checked)); label.append(input, this.el('span', '', this.t('OmitUrls', 'Remove source URLs from this copy only (text may still contain private information)'))); box.append(label); }
                const actions = this.el('div', 'prompt-actions'); let close;
                const finish = answer => { if (!this.openDialog) return; this.openDialog = false; close?.(); overlay.remove(); resolve(answer); };
                const cancel = this.button('Cancel', 'Cancel', () => finish(false)), proceed = this.el('button', 'prompt-primary', accept); proceed.type = 'button'; proceed.addEventListener('click', () => finish(true)); actions.append(cancel, proceed); box.append(actions); overlay.append(box); this.doc.body.append(overlay); this.openDialog = true; close = root.LocalItabDialog.open(overlay, cancel, () => finish(false));
            });
        }
    }
    root.LocalItabCollectionsView = { View };
})(typeof window === 'undefined' ? globalThis : window);
