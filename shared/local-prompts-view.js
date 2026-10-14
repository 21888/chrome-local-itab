/* Plain-text library UI. No template HTML, remote assets or provider calls. */
(function (root) {
    'use strict';
    const key = name => `prompts${name}`;
    // Retain line terminators: CRLF, a final newline and Unicode remain literal.
    // LCS is capped before allocation; large edits use exact common edges instead.
    function compareBodies(before, after) {
        const lines = text => text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) || [];
        const a = lines(before), b = lines(after), groups = [];
        const append = (kind, text) => {
            if (!text) return;
            const last = groups[groups.length - 1];
            if (last?.kind === kind) last.parts.push(text); else groups.push({ kind, parts: [text] });
        };
        let start = 0, endA = a.length, endB = b.length;
        while (start < endA && start < endB && a[start] === b[start]) append('unchanged', a[start++]);
        while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
        const n = endA - start, m = endB - start, fallback = (n + 1) * (m + 1) > 250000;
        if (fallback) {
            append('removed', a.slice(start, endA).join(''));
            append('added', b.slice(start, endB).join(''));
        } else {
            const width = m + 1, table = new Uint32Array((n + 1) * width);
            for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
                table[i * width + j] = a[start + i] === b[start + j] ? 1 + table[(i + 1) * width + j + 1] : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
            }
            let i = 0, j = 0;
            while (i < n || j < m) {
                if (i < n && j < m && a[start + i] === b[start + j]) { append('unchanged', a[start + i++]); j++; }
                else if (i < n && (j === m || table[(i + 1) * width + j] >= table[i * width + j + 1])) append('removed', a[start + i++]);
                else append('added', b[start + j++]);
            }
        }
        append('unchanged', a.slice(endA).join(''));
        const endings = tokens => {
            const counts = { crlf: 0, lf: 0, cr: 0, final: false };
            for (const token of tokens) {
                if (token.endsWith('\r\n')) counts.crlf++;
                else if (token.endsWith('\n')) counts.lf++;
                else if (token.endsWith('\r')) counts.cr++;
            }
            counts.final = /[\r\n]$/.test(tokens[tokens.length - 1] || '');
            return counts;
        };
        return { equal: before === after, fallback, beforeEndings: endings(a), afterEndings: endings(b), groups: groups.map(group => ({ kind: group.kind, text: group.parts.join('') })) };
    }
    class View {
        constructor({ host, controller, translate = (name, fallback) => root.i18n?.t(key(name)) || fallback, clipboard = root.navigator?.clipboard, confirm } = {}) {
            this.host = host; this.doc = host.ownerDocument; this.controller = controller; this.clipboard = clipboard;
            this.t = (name, fallback) => { const value = translate(name, fallback); return value && value !== key(name) ? value : fallback; };
            this.confirm = confirm || (options => this.dialog(options)); this.historyId = null; this.copyGeneration = 0; this.copying = false; this.pendingFocus = null;
            this.pageHide = event => {
                if (!event?.persisted) { this.destroy(); return; }
                this.controller.invalidateDraftPreview(); this.updateDraftPreview();
                this.markdownGeneration = (this.markdownGeneration || 0) + 1;
                this.cancelMarkdownDialog?.(); this.cancelExcerptDialog?.();
            };
            root.addEventListener?.('pagehide', this.pageHide);
            this.build(); this.attachSearchShortcut(); controller.onChange = kind => kind === 'dispose' ? this.destroy() : this.render(kind);
        }
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true; this.controller.invalidateDraftPreview();
            this.detachSearchShortcut?.();
            root.removeEventListener?.('pagehide', this.pageHide);
            root.removeEventListener?.('beforeunload', this.beforeUnload);
            this.markdownGeneration = (this.markdownGeneration || 0) + 1;
            this.cancelMarkdownDialog?.();
            this.cancelExcerptDialog?.();
            this.cancelModelDialog?.();
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
        el(tag, className, text) { const element = this.doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
        button(name, fallback, action, className = '') {
            const button = this.el('button', className, this.t(name, fallback)); button.type = 'button';
            if (action) button.addEventListener('click', action); return button;
        }
        heading(text) { const h = this.el('h2', 'prompt-detail-heading', text); h.tabIndex = -1; return this.focusKey(h, 'detail-heading'); }
        focusKey(element, value) { element.dataset.promptFocus = value; return element; }
        build() {
            const c = this.controller;
            this.shell = this.el('div', 'prompt-shell');
            const brand = this.el('div', 'prompt-brand');
            const mark = this.el('img', 'prompt-brand-mark'); mark.src = 'assets/icon48.png'; mark.alt = ''; mark.width = 28; mark.height = 28; mark.setAttribute('aria-hidden', 'true');
            brand.append(mark, this.el('span', 'prompt-brand-name', 'LOCAL iTAB'));
            const header = this.el('header', 'prompt-header'), title = this.el('div');
            title.append(this.el('p', 'prompt-eyebrow', this.t('Eyebrow', 'Your reusable instructions')), this.el('h1', '', this.t('Title', 'Prompt library')),
                this.el('p', 'prompt-subtitle', this.t('Subtitle', 'Save a good prompt once. Find it, fill in the details, and use it again.')));
            const actions = this.el('div', 'prompt-header-actions');
            const home = this.el('a', 'prompt-link', this.t('Back', 'Back to new tab')); home.href = 'newtab.html';
            home.addEventListener('click', event => { if (c.busy || c.hasUncommittedWork()) { event.preventDefault(); void this.leave(home.href); } });
            const collections = this.el('a', 'prompt-link', root.i18n?.t('collectionsEntry') || 'AI collection'); collections.href = 'collections.html';
            collections.addEventListener('click', event => { if (c.busy || c.hasUncommittedWork()) { event.preventDefault(); void this.leave(collections.href); } }); actions.append(collections);
            this.newButton = this.button('New', 'New prompt', () => { if (c.create()) this.focusDetail('title'); }, 'prompt-primary');
            this.focusKey(this.newButton, 'new'); actions.append(home, this.newButton); header.append(title, actions);
            this.status = this.el('div', 'prompt-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            const layout = this.el('div', 'prompt-layout'), sidebar = this.el('aside', 'prompt-sidebar'); sidebar.setAttribute('aria-label', this.t('Browse', 'Browse prompts'));
            const search = this.el('div', 'prompt-search'), label = this.el('label', '', this.t('SearchLabel', 'Search your library')); label.htmlFor = 'prompt-search';
            this.search = this.el('input'); this.search.type = 'search'; this.search.id = 'prompt-search'; this.search.maxLength = root.LocalItabPrompts.LIMITS.query;
            this.search.placeholder = this.t('SearchPlaceholder', 'Title, body, tags…'); this.search.autocomplete = 'off'; this.search.spellcheck = false;
            this.search.addEventListener('input', () => c.filter({ query: this.search.value })); search.append(label, this.search);
            this.search.setAttribute('aria-keyshortcuts', '/');
            const searchHint = this.el('p', 'prompt-help', this.t('SearchShortcut', 'Press / to search')); searchHint.id = 'prompt-search-shortcut';
            this.search.setAttribute('aria-describedby', searchHint.id); search.append(searchHint);
            const nav = this.el('nav', 'prompt-nav'); nav.setAttribute('aria-label', this.t('Views', 'Library views')); this.nav = {};
            for (const [mode, name, fallback] of [['all', 'All', 'All'], ['favorites', 'Favorites', 'Favorites'], ['trash', 'Trash', 'Trash']]) {
                const button = this.button(name, fallback, () => c.filter({ mode })); this.nav[mode] = button; nav.append(button);
            }
            const filter = this.el('div', 'prompt-filter'), categoryLabel = this.el('label', '', this.t('Category', 'Category')); categoryLabel.htmlFor = 'prompt-category-filter';
            this.category = this.el('select'); this.category.id = 'prompt-category-filter'; this.category.addEventListener('change', () => c.filter({ category: this.category.value })); filter.append(categoryLabel, this.category);
            const tagFilter = this.el('div', 'prompt-filter'), tagLabel = this.el('label', '', this.t('TagFilter', 'Tag')); tagLabel.htmlFor = 'prompt-tag-filter';
            this.tag = this.el('select'); this.tag.id = 'prompt-tag-filter'; this.tag.addEventListener('change', () => c.filter({ tag: this.tag.value })); tagFilter.append(tagLabel, this.tag);
            this.draftList = this.el('div', 'prompt-draft-list');
            const listHeading = this.el('div', 'prompt-list-heading'); this.count = this.el('span');
            this.clearButton = this.button('ClearFilters', 'Clear filters', () => {
                if (this.destroyed || c.disposed || this.clearButton.disabled || !this.clearButton.isConnected ||
                    this.clearButton.closest('[hidden], [inert]')) return;
                // Transfer only this action's focus before render hides its button.
                // Other controls and any newer render focus keep ownership.
                if (this.doc.activeElement === this.clearButton) this.search.focus();
                c.filter({ query: '', mode: 'all', category: '', tag: '' });
            }, 'prompt-clear'); listHeading.append(this.count, this.clearButton);
            this.list = this.el('div', 'prompt-list'); this.list.setAttribute('aria-label', this.t('Results', 'Saved prompts'));
            sidebar.append(search, nav, filter, tagFilter, this.draftList, listHeading, this.list);
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
            root.removeEventListener?.('beforeunload', this.beforeUnload);
            if (this.destroyed || this.controller.disposed) return;
            this.beforeUnload = event => { if (this.controller.hasUncommittedWork()) { event.preventDefault(); event.returnValue = ''; } };
            root.addEventListener?.('beforeunload', this.beforeUnload);
        }
        focusDetail(name) { const target = name ? this.main.querySelector(`[data-prompt-focus="${name}"]`) : this.main.querySelector('.prompt-detail-heading'); target?.focus(); }
        announce(message, error = false) { this.status.classList.toggle('error', error); this.status.replaceChildren(this.el('span', '', message)); }
        render(kind = 'render') {
            const c = this.controller;
            const dialogFocus = this.dialogFocus;
            if (dialogFocus && (c.selected !== dialogFocus.selected || c.draft() !== dialogFocus.draft)) dialogFocus.stale = true;
            this.checkModelComparison?.();
            this.checkModelRun?.();
            this.checkExcerptDialog?.();
            this.checkStarterDialog?.();
            if (this.comparison && (c.selected !== this.comparison.recordId || c.draft() || c.error?.scope === 'read' || !c.record()?.history.some(v => v.id === this.comparison.from) || !c.record()?.history.some(v => v.id === this.comparison.to))) this.comparison = null;
            if (kind === 'draftPreview') { this.renderDraftPreview(); return; }
            if (kind === 'draftPreviewValues') { this.updateDraftPreview(); return; }
            if (kind === 'linkedResults') { this.updateLinkedResults(); this.updatePreview(); return; }
            if (kind === 'preview') {
                // Even an edit back to the original text supersedes pending feedback.
                this.copyGeneration++; this.updatePreview(); return;
            }
            if (kind === 'draft') { this.renderStatus(); this.renderDrafts(); this.updateDraftState(); this.renderDraftPreview(); return; }
            this.renderStatus(); this.renderList();
            if (kind === 'list') return;
            this.markdownGeneration = (this.markdownGeneration || 0) + 1;
            const active = this.doc.activeElement, restore = this.main.contains(active) ? active?.dataset.promptFocus : null;
            if (restore && c.busy) this.pendingFocus = restore;
            const desiredFocus = restore || (!c.busy ? this.pendingFocus : null);
            const range = restore && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
            this.linkedSections = []; this.main.replaceChildren(); this.main.setAttribute('aria-busy', String(c.busy)); this.previewElements = null; this.editorElements = null; this.draftPreviewElements = null; this.draftPreviewHost = null;
            if (!c.state) this.renderUnavailable();
            else if (c.draft()) this.renderEditor();
            else if (c.record()) this.renderRecord(c.record());
            else if (c.activeSessions.has(c.selected)) {
                this.main.append(this.el('p', 'prompt-conflict', this.t('PreviewMissingRecord', 'This prompt is no longer available. Your preview values are retained in this tab. Read again or choose another saved prompt.')),
                    this.button('ReadAgain', 'Read again', () => void c.refresh()));
            } else if (!root.LocalItabAISearchView?.showTargetError(c, this)) this.renderEmpty();
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
            if (!message && c.notice) message = ({ reconciled: this.t('OutcomeVerified', 'The original save was committed. Showing the latest saved state, which may include later changes.'), saved: this.t('Saved', 'Saved on this device.'), remove: this.t('Removed', 'Moved to Trash. You can restore it at any time.'), restore: this.t('Restored', 'Restored to your library.'), restoreVersion: this.t('VersionRestored', 'Restored as a new body version. Later history is still here.'), favorite: this.t('FavoriteSaved', 'Favorite updated.') })[c.notice] || '';
            if (!message && c.draftCount()) message = this.t('DraftNotice', 'Unsaved drafts stay in this tab while you browse. Save them before leaving.');
            this.status.replaceChildren(this.el('span', '', message));
            if (c.pendingCommand) { const retry = this.button(c.pendingInspection ? 'InspectSave' : 'RetrySave', c.pendingInspection ? 'Check saved outcome' : 'Retry same save', () => void c.retry()); retry.disabled = c.busy; this.status.append(retry); }
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
            // Populate from the current view, independently of search/category, so
            // empty intersections remain reversible without discarding the tag.
            const tags = [...new Set((c.state?.records || []).filter(record =>
                (record.deletedAt !== null) === (c.filters.mode === 'trash') &&
                (c.filters.mode !== 'favorites' || record.favorite)).flatMap(record => record.tags))].sort();
            if (c.filters.tag && !tags.includes(c.filters.tag)) tags.push(c.filters.tag);
            this.tag.replaceChildren(); const allTags = this.el('option', '', this.t('AllTags', 'All tags')); allTags.value = ''; this.tag.append(allTags);
            for (const tag of tags) { const option = this.el('option', '', tag); option.value = tag; this.tag.append(option); }
            this.tag.value = c.filters.tag;
            for (const button of this.main.querySelectorAll('[data-prompt-tag]')) button.setAttribute('aria-pressed', String(button.dataset.promptTag === c.filters.tag));
            this.renderDrafts(); this.list.replaceChildren();
            const results = c.results(); this.count.textContent = `${results.length} ${this.t('PromptCount', 'prompts')}`;
            this.clearButton.hidden = !c.filters.query && c.filters.mode === 'all' && !c.filters.category && !c.filters.tag;
            for (const { record, snippet } of results) {
                const button = this.el('button', 'prompt-card'); button.type = 'button'; button.disabled = c.busy;
                button.setAttribute('aria-current', String(record.id === c.selected));
                const title = this.el('span', 'prompt-card-title', `${record.favorite ? '★ ' : ''}${record.title}`);
                button.append(title, this.el('span', 'prompt-card-snippet', snippet), this.el('span', 'prompt-card-meta', [record.category, ...record.tags.slice(0, 2)].filter(Boolean).join(' · ') || this.date(record.updatedAt)));
                button.addEventListener('click', () => { this.historyId = null; if (c.select(record.id)) this.focusDetail(); }); this.list.append(button);
            }
            if (!results.length) this.list.append(this.el('p', 'prompt-no-results', c.filters.mode === 'trash' && !c.filters.query && !c.filters.category && !c.filters.tag ? this.t('TrashEmpty', 'Trash is empty. Deleted prompts remain recoverable here.') : this.t('NoResults', 'No matching prompts. Clear filters or create a new one.')));
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
            if (!(this.controller.state?.records || []).some(record => !record.deletedAt)) section.append(this.starterGallery());
            this.main.append(section);
        }
        starterGallery() {
            const c = this.controller, section = this.el('section', 'prompt-starters');
            const selected = c.selected, draft = c.draft(), epoch = c.excerptEpoch;
            const current = () => !this.destroyed && section.isConnected && this.main.contains(section) &&
                c.selected === selected && c.draft() === draft && c.excerptEpoch === epoch && c.starterReady();
            section.append(this.el('h3', '', this.t('StartersTitle', 'Built-in starter templates')),
                this.el('p', 'prompt-help', this.t('StartersHelp', 'Review the full text, then load an unsaved draft. Preview and fill variables in the unsaved draft, then explicitly copy. Saving is optional. No model is run.')));
            if (c.dirty('new')) {
                section.append(this.el('p', 'prompt-help', this.t('StarterExisting', 'Your existing new draft is kept. Continue it or explicitly discard it before loading another template.')),
                    this.button('StarterContinue', 'Continue unsaved draft', () => { if (current() && c.create()) this.focusDetail('title'); }));
            }
            const cards = this.el('div', 'prompt-starter-grid');
            for (const starter of root.LocalItabPromptStarters?.list(this.doc.documentElement.lang) || []) {
                const card = this.el('button', 'prompt-starter-card'); card.type = 'button'; card.disabled = !c.starterReady();
                this.focusKey(card, `starter-${starter.id}`);
                card.append(this.el('strong', '', starter.title), this.el('span', '', starter.description));
                card.addEventListener('click', () => { if (current() && card.isConnected && section.contains(card)) void this.previewStarter(starter.id); }); cards.append(card);
            }
            section.append(cards); return section;
        }
        async previewStarter(id) {
            const c = this.controller, language = this.doc.documentElement.lang;
            const starter = root.LocalItabPromptStarters?.get(id, language);
            if (!starter || !c.starterReady() || this.destroyed || this.openDialog) return false;
            const selected = c.selected, draft = c.draft(), epoch = c.excerptEpoch;
            const current = () => !this.destroyed && c.starterReady() && c.selected === selected && c.draft() === draft && c.excerptEpoch === epoch;
            const check = () => { if (!current()) this.cancelMarkdownDialog?.(); };
            this.checkStarterDialog = check;
            const existing = c.dirty('new');
            const help = this.t('StartersHelp', 'Review the full text, then load an unsaved draft. Preview and fill variables in the unsaved draft, then explicitly copy. Saving is optional. No model is run.');
            const accepted = await this.dialog({ title: starter.title,
                body: existing ? `${this.t('StarterExisting', 'Your existing new draft is kept. Continue it or explicitly discard it before loading another template.')} ${help}` : help,
                markdownPreview: starter.body, markdownCurrent: current,
                accept: existing ? this.t('StarterContinue', 'Continue unsaved draft') : this.t('StarterLoad', 'Load unsaved draft') });
            if (this.checkStarterDialog === check) this.checkStarterDialog = null;
            if (!accepted || !current()) return false;
            const loaded = existing ? c.create() : c.createFromStarter(id, language);
            if (loaded) this.focusDetail('title');
            return loaded;
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
            if (!draft.id) {
                const starters = this.el('details', 'prompt-starter-disclosure');
                starters.append(this.el('summary', '', this.t('StartersTitle', 'Built-in starter templates')), this.starterGallery());
                form.append(starters);
            }
            if (draft.conflict) {
                const conflict = this.el('div', 'prompt-conflict'); conflict.append(this.el('p', '', this.t('Conflict', 'This prompt changed in another tab or was restored from backup. Your draft is intact. Review the saved prompt before choosing what to keep.')));
                const actions = this.el('div', 'prompt-actions');
                actions.append(this.button('UseSaved', 'Discard draft and use saved', () => void this.discardDraft())); conflict.append(actions);
                const latest = c.record();
                if (latest) { const details = this.el('details', 'prompt-latest'); details.append(this.el('summary', '', this.t('ReviewSaved', 'Review current saved prompt')), this.el('h3', '', latest.title), this.el('pre', 'prompt-readonly', latest.body)); conflict.append(details); }
                else conflict.append(this.el('p', 'prompt-help', this.t('MissingSaved', 'This item is no longer in the saved library. Your draft can still be saved as a new prompt.')));
                form.append(conflict);
            }
            if (c.error?.code === 'HISTORY_LIMIT' || (c.record()?.history.length >= root.LocalItabPrompts.LIMITS.versions && draft.input.body !== c.record()?.body)) {
                const limit = this.el('div', 'prompt-conflict'); limit.append(this.el('p', '', this.t('HistoryLimit', 'This prompt has reached 20 body versions. Save this draft as a new prompt to continue. The old prompt and all its history will stay unchanged.'))); form.append(limit);
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
            const saveCopy = draft.id ? this.focusKey(this.button('SaveCopy', 'Save draft as new prompt', () => void c.save(true)), 'save-copy') : null;
            footer.append(save); if (saveCopy) footer.append(saveCopy);
            const state = this.el('span', 'prompt-help'); footer.append(cancel, state); form.append(footer);
            if (saveCopy) {
                const help = this.el('p', 'prompt-help', this.t('SaveCopyHelp', 'Save these editor fields as a separate prompt with one body version. The original and its history stay unchanged; temporary preview values are not copied.'));
                help.id = 'prompt-save-copy-help'; saveCopy.setAttribute('aria-describedby', help.id); form.append(help);
            }
            this.main.append(form);
            if (c.selected === 'new' && !draft.id) { this.draftPreviewHost = this.el('section', 'prompt-draft-preview'); this.main.append(this.draftPreviewHost); this.renderDraftPreview(); }
            this.editorElements = { controls, save, saveCopy, cancel, state }; this.updateDraftState();
        }
        renderDraftPreview() {
            const c = this.controller, host = this.draftPreviewHost;
            if (!host) return;
            host.replaceChildren(); this.draftPreviewElements = null;
            host.append(this.el('h3', '', this.t('DraftPreviewTitle', 'Try this unsaved draft')),
                this.el('p', 'prompt-help', this.t('DraftPreviewHelp', 'Preview and copy without saving or running a model. Temporary values are cleared when you edit any draft field, switch prompts, close the editor, or start saving. Saving keeps the original template and its placeholders.')));
            const start = this.button('DraftPreviewStart', 'Preview unsaved draft', () => {
                if (!this.destroyed && host === this.draftPreviewHost && host.isConnected && c.newDraftReady()) {
                    c.startDraftPreview();
                    const ui = this.draftPreviewElements;
                    (ui?.variables.querySelector('textarea') || ui?.preview)?.focus();
                }
            });
            start.disabled = !c.newDraftReady(); this.focusKey(start, 'draft-preview-start'); host.append(start);
            const session = c.draftPreview;
            if (!c.draftPreviewCurrent(session)) return;
            const literalWrap = this.el('label', 'prompt-check'), literal = this.el('input'); literal.type = 'checkbox';
            this.focusKey(literal, 'draft-preview-literal');
            literal.addEventListener('change', () => {
                if (!this.destroyed && literal.isConnected && this.draftPreviewElements?.literal === literal && host === this.draftPreviewHost && host.isConnected && c.draftPreviewCurrent(session)) c.setDraftLiteral(literal.checked);
                literal.checked = session.literal;
            });
            literalWrap.append(literal, this.el('span', '', this.t('Literal', 'Use the template literally (do not replace variables)')));
            host.append(literalWrap, this.el('p', 'prompt-help', this.t('DraftLiteralHelp', 'Literal mode keeps every character, including backslashes and {{braces}}. Turn it off to restore your temporary variable values. This choice is not saved.')));
            const variables = this.el('div', 'prompt-variables');
            for (const name of session.result?.variables || []) {
                const field = this.field(name, `draft-variable-${name}`, session.values[name] || '', { multiline: true,
                    help: this.t('DraftVariableHelp', 'Not filled yet? Type a value, or choose Use empty value.'),
                    change: value => {
                        if (!this.destroyed && field.input.isConnected && host === this.draftPreviewHost && host.isConnected && !session.literal && c.draftPreviewCurrent(session)) c.setDraftVariable(name, value);
                        else field.input.value = session.values[name] || '';
                    } });
                const empty = this.button('DraftVariableEmpty', 'Use empty value', () => {
                    if (!this.destroyed && field.input.isConnected && host === this.draftPreviewHost && host.isConnected && !session.literal && c.draftPreviewCurrent(session) && c.setDraftVariable(name, '')) field.input.value = '';
                });
                const choose = this.button('ExcerptChoose', 'Choose saved excerpt', () => {
                    if (!this.destroyed && field.input.isConnected && host === this.draftPreviewHost && host.isConnected && !session.literal && c.draftPreviewCurrent(session)) void this.chooseExcerpt(name, field.input, true);
                }, 'prompt-empty-value');
                choose.setAttribute('aria-label', `${this.t('ExcerptChoose', 'Choose saved excerpt')}: ${name}`); this.focusKey(choose, `draft-excerpt-${name}`);
                field.wrap.append(empty, choose); variables.append(field.wrap);
            }
            const preview = this.el('textarea', 'prompt-preview'); preview.readOnly = true;
            preview.setAttribute('aria-label', this.t('DraftPreviewText', 'Unsaved draft preview')); this.focusKey(preview, 'draft-preview-text');
            const status = this.el('p', 'prompt-help'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const copy = this.button('DraftPreviewCopy', 'Copy unsaved preview', () => void this.copyDraftPreview()); this.focusKey(copy, 'draft-preview-copy');
            host.append(variables, preview, status, copy);
            this.draftPreviewElements = { host, session, literal, variables, preview, status, copy }; this.updateDraftPreview();
        }
        updateDraftPreview() {
            const c = this.controller, ui = this.draftPreviewElements;
            if (!ui) return;
            const result = c.draftPreviewResult();
            ui.preview.value = result?.text || '';
            ui.copy.disabled = !result?.complete || Boolean(this.copying) || Boolean(this.destroyed);
            ui.literal.checked = ui.session.literal; ui.literal.disabled = !c.draftPreviewCurrent(ui.session);
            ui.variables.hidden = ui.session.literal;
            for (const control of ui.variables.querySelectorAll('textarea, button')) control.disabled = ui.session.literal || !c.draftPreviewCurrent(ui.session);
            ui.status.textContent = result?.error ? this.errorText(result.error) : !result ? this.t('DraftPreviewExpired', 'Temporary preview cleared. Preview the draft again.') : result.missing.length ? `${this.t('MissingValues', 'Fill these variables before copying:')} ${result.missing.join(', ')}` : this.t('DraftPreviewReady', 'Ready to copy. Nothing has been saved or sent.');
        }
        async copyDraftPreview() {
            const c = this.controller, ui = this.draftPreviewElements, ticket = c.draftCopyTicket();
            const current = () => !this.destroyed && ui && ui === this.draftPreviewElements && ui.host.isConnected && c.draftCopyCurrent(ticket);
            if (this.copying || !current()) return false;
            this.copying = true; ui.copy.disabled = true;
            try {
                if (!this.clipboard?.writeText || !current()) throw new Error('Clipboard unavailable');
                await this.clipboard.writeText(ticket.text);
                if (!current()) return false;
                ui.status.textContent = this.t('Copied', 'Copied. Paste it into the tool you choose.'); return true;
            } catch (_) {
                if (!current()) return false;
                ui.status.textContent = this.t('CopyFailed', 'Copy was blocked. Your preview is still here. Select the text and use your browser’s Copy command.');
                ui.preview.focus(); ui.preview.select?.(); return false;
            } finally {
                this.copying = false;
                this.refreshModelCopy?.();
                const active = this.draftPreviewElements;
                if (!this.destroyed && active) active.copy.disabled = !c.draftPreviewResult()?.complete;
                if (!this.destroyed) this.updateCopyEligibility();
            }
        }
        updateDraftState() {
            const c = this.controller, draft = c.draft(), ui = this.editorElements; if (!draft || !ui) return;
            const blocked = c.busy || Boolean(c.pendingCommand); for (const control of ui.controls) control.disabled = blocked;
            const requiredMissing = !draft.input.title.trim() || !draft.input.body.trim();
            ui.save.disabled = blocked || draft.conflict || requiredMissing;
            if (ui.saveCopy) ui.saveCopy.disabled = blocked || requiredMissing;
            ui.cancel.disabled = blocked;
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
            const meta = this.el('div', 'prompt-meta');
            if (record.category) meta.append(this.el('span', 'prompt-tag', record.category));
            for (const tag of record.tags) {
                const button = this.el('button', 'prompt-tag prompt-tag-filter', tag); button.type = 'button'; button.dataset.promptTag = tag;
                button.setAttribute('aria-label', `${this.t('FilterByTag', 'Filter by tag')}: ${tag}`);
                button.setAttribute('aria-pressed', String(c.filters.tag === tag));
                button.addEventListener('click', () => c.filter({ tag }));
                meta.append(button);
            }
            if (record.tool) meta.append(this.el('span', 'prompt-tag', record.tool));
            top.append(meta);
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
            const markdown = this.button('MarkdownExport', 'Export current saved item as Markdown', () => this.exportMarkdown());
            markdown.disabled = Boolean(c.error); actions.append(markdown);
            for (const button of actions.children) button.disabled = button.disabled || c.busy || Boolean(c.pendingCommand); top.append(actions); this.main.append(top);
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
            const session = c.session(record), index = record.history.findIndex(version => version.id === session.versionId && version.body === session.body);
            section.append(this.el('p', 'prompt-help', `${this.t('ActivePreviewVersion', 'Preview body version:')} ${index < 0 ? this.t('UnavailableVersion', 'unavailable') : `v${index + 1}`}${session.versionId === record.currentVersionId && session.body === record.body ? ` · ${this.t('Current', 'current')}` : ''}`));
            if (!c.sessionSourceCurrent(record, session) || session.versionId !== record.currentVersionId) {
                const retained = this.el('div', 'prompt-conflict');
                retained.append(this.el('p', '', this.t('RetainedPreview', 'This preview keeps its exact body and values. Switching versions preserves each version’s values in this tab.')),
                    this.button('ReturnCurrentVersion', 'Return to current version', () => { if (c.returnToCurrent()) this.focusDetail('preview'); })); section.append(retained);
            }
            if (session.capacity || c.error?.code === 'SESSION_LIMIT') {
                section.append(this.el('p', 'prompt-help', this.errorText('SESSION_LIMIT')),
                    this.button('ClearTabPreviews', 'Clear all preview values in this tab', async () => {
                        if (await this.confirm({ title: this.t('ClearTabPreviews', 'Clear all preview values in this tab'), body: this.t('ClearTabPreviewsHelp', 'Discard all temporary variable values and literal choices in this tab? Saved prompts, history and editor drafts stay unchanged.'), accept: this.t('ClearTabPreviews', 'Clear all preview values in this tab') })) c.clearPreviewSessions();
                    }));
            }
            const literalWrap = this.el('label', 'prompt-check'), literal = this.el('input'); literal.type = 'checkbox'; literal.checked = c.session(record).literal;
            literal.addEventListener('change', () => { c.setLiteral(literal.checked); literal.checked = c.session(record).literal; }); literalWrap.append(literal, this.el('span', '', this.t('Literal', 'Use the template literally (do not replace variables)'))); section.append(literalWrap);
            const variables = this.el('div', 'prompt-variables');
            for (const name of c.variables(record)) {
                const entry = this.el('div', 'prompt-variable'), field = this.field(name, `variable-${name}`, c.session(record).values[name] || '', { multiline: true, change: value => { if (!c.setVariable(name, value)) field.input.value = c.session(record).values[name] || ''; } });
                const empty = this.button('EmptyValue', 'Use empty value', () => { c.setVariable(name, ''); field.input.value = c.session(record).values[name] || ''; }, 'prompt-empty-value'); empty.setAttribute('aria-label', `${this.t('EmptyValue', 'Use empty value')}: ${name}`); const choose = this.button('ExcerptChoose', 'Choose saved excerpt', () => void this.chooseExcerpt(name, field.input), 'prompt-empty-value');
                choose.setAttribute('aria-label', `${this.t('ExcerptChoose', 'Choose saved excerpt')}: ${name}`); this.focusKey(choose, `excerpt-${name}`);
                entry.append(field.wrap, empty, choose); variables.append(entry);
            }
            section.append(variables);
            const previewSection = this.el('div', 'prompt-section'), heading = this.el('div', 'prompt-section-heading');
            heading.append(this.el('h3', '', this.t('Preview', 'Completed preview')));
            const clear = this.button('ClearValues', 'Clear values', () => { c.clearVariables(); this.focusDetail(); }, 'prompt-clear'); clear.hidden = !c.variables(record).length && !session.literal && session.versionId === record.currentVersionId; heading.append(clear);
            const preview = this.el('textarea', 'prompt-readonly prompt-preview'); preview.readOnly = true; preview.setAttribute('aria-label', this.t('Preview', 'Completed preview')); this.focusKey(preview, 'preview'); preview.rows = 9;
            const status = this.el('p', 'prompt-preview-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const actions = this.el('div', 'prompt-actions prompt-section');
            const copy = this.button('CopyCompleted', 'Copy completed prompt', () => void this.copy(), 'prompt-primary'); this.focusKey(copy, 'copy');
            const select = this.button('SelectPreview', 'Select text', () => { preview.focus(); preview.select?.(); }); actions.append(copy, select);
            previewSection.append(heading, this.el('p', 'prompt-help', this.t('ClearValuesHelp', 'Clear values resets the active and current version’s values and returns to the current body. Other versions keep their values.')), preview, status, actions); section.append(previewSection); this.main.append(section);
            const compare = root.LocalItabAIModelComparison ? this.button('CompareTitle', 'Compare models', () => root.LocalItabAIModelComparison.open({ view: this, collectionStore: this.modelCollectionStore })) : null;
            if (compare) actions.append(compare);
            const run = root.LocalItabAIModelView ? this.button('ModelTitle', 'Run with your model', () => root.LocalItabAIModelView.open({ view: this, collectionStore: this.modelCollectionStore })) : null;
            if (run) actions.append(run);
            if (root.LocalItabAIPromptRefinement && root.LocalItabAIModelView) actions.append(this.button('ModelRefineTitle', 'Refine saved prompt', () => root.LocalItabAIModelView.open({ view: this, mode: 'refine' })));
            this.previewElements = { literal, variables, preview, status, copy, run, compare }; this.updatePreview();
            this.main.append(this.linkedSection(record.id, c.session(record).versionId, true));
        }
        async chooseExcerpt(name, input, draft = false) {
            const c = this.controller;
            if (this.openDialog) return;
            const context = draft ? c.draftExcerptContext(name) : c.excerptContext(name); if (!context) return;
            const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', 'prompt-dialog prompt-excerpt-dialog');
            overlay.setAttribute('aria-hidden', 'true'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'excerpt-title'); box.setAttribute('aria-describedby', 'excerpt-help');
            const title = this.el('h2', '', `${this.t('ExcerptChoose', 'Choose saved excerpt')}: ${name}`); title.id = 'excerpt-title';
            const help = this.el('p', '', draft ? this.t('DraftExcerptHelp', 'Review the exact saved body and previous value, then replace only this temporary draft variable. Nothing is saved, copied or sent.') : this.t('ExcerptHelp', 'Review one active saved excerpt, then replace only this variable with its exact body. Notes, links and history are excluded. Values stay in this tab; your saved template will not change.')); help.id = 'excerpt-help';
            const status = this.el('p', 'prompt-help', this.t('LinkedLoading', 'Reading saved results…')); status.setAttribute('role', 'status');
            const list = this.el('div', 'prompt-excerpt-list'), review = this.el('div'), actions = this.el('div', 'prompt-actions');
            const view = this;
            const filter = this.el('div', 'prompt-excerpt-filter'), label = this.el('label', '', this.t('ExcerptSearch', 'Search excerpt titles'));
            const search = this.el('input'); search.type = 'search'; search.id = 'excerpt-search'; search.disabled = true;
            label.setAttribute('for', search.id); search.setAttribute('aria-describedby', 'excerpt-search-help');
            const searchHelp = this.el('p', 'prompt-help', this.t('ExcerptSearchHelp', 'Search only titles already loaded here, not excerpt bodies. Changing the search clears your review.')); searchHelp.id = 'excerpt-search-help';
            const count = this.el('p', 'prompt-help'); count.setAttribute('role', 'status');
            const clear = this.button('ExcerptSearchClear', 'Clear title search', () => {
                if (search.disabled) return;
                search.value = ''; paintChoices(); search.focus();
            }); clear.disabled = true;
            filter.append(label, search, clear, searchHelp, count);
            search.addEventListener('input', () => { if (!search.disabled) paintChoices(); });
            let selection = null, close, finished = false, applying = false, generation = null, rows = [], stale = false, queryRevision = 0;
            const lockSearch = () => { search.disabled = true; clear.disabled = true; };
            const finish = () => {
                if (finished) return; finished = true; context.cancelled = true; this.openDialog = false;
                this.cancelExcerptDialog = null; this.checkExcerptDialog = null; close?.(); overlay.remove();
            };
            const cancel = this.button('Cancel', 'Cancel', finish), apply = this.button('ExcerptApply', 'Replace this variable', async () => {
                if (applying || !selection || !c.excerptReviewCurrent(selection)) return;
                // Keep keyboard cancellation reachable when disabling the active Apply button.
                cancel.focus(); applying = true; apply.disabled = true; lockSearch();
                for (const button of list.querySelectorAll('button')) button.disabled = true;
                const chosen = selection;
                const result = await c.applyExcerpt(chosen);
                if (finished) return;
                if (result.ok) {
                    // A render may have replaced the opener/input while the read was pending.
                    // Synchronize only this variable in the still-current draft preview.
                    if (draft) {
                        const ui = this.draftPreviewElements;
                        if (ui?.session === context.session && ui.host.isConnected && c.draftPreviewCurrent(context.session)) {
                            const current = ui.variables.querySelector(`[data-prompt-focus="draft-variable-${name}"]`);
                            if (current) current.value = chosen.body;
                        }
                    } else if (input.isConnected) input.value = chosen.body;
                    finish();
                }
                else { status.textContent = result.code === 'STALE' ? this.t('ExcerptStale', 'This selection changed or is no longer available. Cancel and choose again.') : this.errorText(result.code); }
                applying = false;
            }, 'prompt-primary'); apply.disabled = true;
            this.checkExcerptDialog = () => {
                if (!c.excerptCurrent(context) || (generation !== null && generation !== c.collectionGeneration)) {
                    if (this.doc.activeElement === apply || filter.contains(this.doc.activeElement) || list.contains(this.doc.activeElement) || review.contains(this.doc.activeElement)) cancel.focus();
                    stale = true; lockSearch(); apply.disabled = true; selection = null; review.replaceChildren();
                    for (const button of list.querySelectorAll('button')) button.disabled = true;
                    status.textContent = this.t('ExcerptStale', 'This selection changed or is no longer available. Cancel and choose again.');
                }
            };
            actions.append(cancel, apply); box.append(title, help, filter, status, list, review, actions); overlay.append(box); this.doc.body.append(overlay);
            this.openDialog = true; this.cancelExcerptDialog = finish; close = root.LocalItabDialog.open(overlay, cancel, finish);
            await c.refreshCollections();
            if (finished) return;
            if (!c.excerptCurrent(context)) { this.checkExcerptDialog(); return; }
            generation = c.collectionGeneration;
            if (c.collectionError || !c.collectionState || c.collectionLoading) { status.textContent = this.t('LinkedUnavailable', 'Saved results could not be read safely. This is not an empty result list.'); return; }
            rows = c.excerptRows(context);
            search.disabled = false;
            paintChoices();
            function fold(value) { return value.normalize('NFKC').toLowerCase(); }
            function usable() { return !finished && !applying && !stale && generation !== null && c.excerptCurrent(context) && generation === c.collectionGeneration; }
            // Filtering is local to this opening's immutable rows. Keep each original
            // row/ID; duplicate display titles must never become selection identities.
            function paintChoices() {
                if (!usable()) return;
                const revision = ++queryRevision;
                selection = null; apply.disabled = true; review.replaceChildren(); list.replaceChildren();
                const terms = fold(search.value).trim().split(/\s+/u).filter(Boolean);
                const matches = rows.filter(row => terms.every(term => fold(row.title).includes(term)));
                clear.disabled = !search.value;
                count.textContent = view.t('ExcerptSearchCount', '{shown} of {total} excerpts').replace('{shown}', String(matches.length)).replace('{total}', String(rows.length));
                status.textContent = !rows.length ? view.t('ExcerptEmpty', 'No active saved excerpts are available.') : !matches.length ? view.t('ExcerptSearchEmpty', 'No titles match. Clear the search or try another title.') : view.t('ExcerptSelect', 'Select an excerpt to review its full current body.');
                for (const row of matches) {
                    const button = view.el('button', 'prompt-excerpt-choice', row.title); button.type = 'button'; button.setAttribute('aria-pressed', 'false');
                    button.addEventListener('click', () => {
                        if (!usable() || revision !== queryRevision) return;
                        const selected = c.reviewExcerpt(context, row); if (!selected) { view.checkExcerptDialog?.(); return; }
                        selection = selected; review.replaceChildren();
                        for (const item of list.children) item.setAttribute('aria-pressed', String(item === button));
                        review.append(view.el('h3', '', view.t('ExcerptBody', 'Exact saved body')), view.el('pre', 'prompt-readonly', selected.body));
                        const previous = context.session.values[name];
                        if (previous) review.append(view.el('h3', '', view.t('ExcerptPrevious', 'Current variable value that will be replaced')), view.el('pre', 'prompt-readonly', previous));
                        for (const pre of review.querySelectorAll('pre')) pre.tabIndex = 0;
                        apply.disabled = false;
                    });
                    list.append(button);
                }
            }
        }
        linkedSection(promptId, versionId, session = false) {
            const section = this.el('section', 'prompt-linked-results');
            const entry = { section, promptId, versionId, session };
            (this.linkedSections ||= []).push(entry); this.paintLinkedResults(entry); return section;
        }
        updateLinkedResults() { for (const entry of this.linkedSections || []) this.paintLinkedResults(entry); }
        paintLinkedResults(entry) {
            const c = this.controller, { section, promptId, versionId, session } = entry, record = c.record();
            section.replaceChildren();
            if (!record || record.id !== promptId || c.draft()) return;
            section.append(this.el('h3', '', this.t('LinkedTitle', 'Saved results for this version')));
            const index = record.history.findIndex(version => version.id === versionId);
            const scope = index < 0 ? versionId : `v${index + 1}`;
            section.append(this.el('p', 'prompt-help', `${this.t(session ? 'LinkedPreviewScope' : 'LinkedHistoryScope', session ? 'Exact version used by this preview:' : 'Exact body version selected in history:')} ${scope}`));
            section.append(this.el('p', 'prompt-help', this.t('LinkedHelp', 'Only active saved results explicitly linked to this prompt and body version. Opens in a new tab; your draft and variable values stay here.')));
            if (session) {
                const href = root.LocalItabPromptDraft?.href(promptId, versionId);
                const available = () => c.sessionReady() && !c.disposed && !c.busy && !c.pendingCommand && c.pendingReadGeneration === null &&
                    !c.linkedPromptUnavailable && !c.draft() && c.record()?.id === promptId && !c.record()?.deletedAt &&
                    c.record()?.history.some(version => version.id === versionId && version.body === c.session()?.body) && c.session()?.versionId === versionId;
                if (href && available()) {
                    const link = this.el('a', 'prompt-link prompt-result-draft', this.t('SaveVersionResult', 'Save a result for this version'));
                    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                    const guard = event => { if (!available() || !this.main.contains(section) || !section.contains(link)) event.preventDefault(); };
                    link.addEventListener('click', guard); link.addEventListener('auxclick', guard); section.append(link);
                    section.append(this.el('p', 'prompt-help', this.t('SaveVersionResultHelp', 'Opens a blank, unsaved draft in a new tab with this exact prompt version linked. Nothing is copied or saved.')));
                }
            }
            const status = this.el('p', 'prompt-help'); status.setAttribute('role', 'status');
            if (session && !c.sessionSourceCurrent()) { status.textContent = this.errorText('PREVIEW_UNAVAILABLE'); section.append(status); return; }
            if (c.collectionLoading || c.pendingReadGeneration !== null) status.textContent = this.t('LinkedLoading', 'Reading saved results…');
            else if (c.collectionError || !c.collectionState || c.linkedPromptUnavailable || c.disposed) {
                status.textContent = this.t('LinkedUnavailable', 'Saved results could not be read safely. This is not an empty result list.');
                section.append(status, this.button('LinkedRetry', 'Read results again', () => { void c.refreshCollections(); if (c.linkedPromptUnavailable) void c.refresh(); })); return;
            } else {
                const rows = c.linkedResults(promptId, versionId);
                if (!rows.length) status.textContent = this.t('LinkedEmpty', 'No active saved results are linked to this exact version.');
                else {
                    const list = this.el('ul', 'prompt-linked-list');
                    for (const row of rows) {
                        const href = root.LocalItabAISearch?.href('collection', row.id); if (!href) continue;
                        const item = this.el('li'), link = this.el('a', 'prompt-linked-card'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                        link.append(this.el('span', 'prompt-card-title', row.title), this.el('span', 'prompt-card-meta', row.tool || this.t('LinkedNoTool', 'No tool specified')),
                            this.el('span', 'prompt-card-meta', this.t('LinkedNewTab', 'Open saved result in a new tab')));
                        const guard = event => {
                            if (!this.main.contains(section) || !section.contains(link) || !c.linkedResultCurrent(row, promptId, versionId) || (session && (!c.sessionReady() || c.session()?.versionId !== versionId))) event.preventDefault();
                        };
                        link.addEventListener('click', guard); link.addEventListener('auxclick', guard); item.append(link); list.append(item);
                    }
                    section.append(list); return;
                }
            }
            section.append(status);
        }
        updatePreview() {
            const c = this.controller, ui = this.previewElements; if (!ui) return;
            const result = c.preview(); if (!result) return;
            ui.literal.checked = c.session().literal; ui.variables.hidden = ui.literal.checked;
            ui.literal.disabled = !c.sessionReady();
            for (const control of ui.variables.querySelectorAll('input, textarea, button')) control.disabled = !c.sessionReady();
            ui.preview.value = result.text; this.updateCopyEligibility(result);
            ui.status.textContent = c.error?.scope === 'preview' ? this.errorText(c.error.code) : result.error ? this.errorText(result.error) : result.missing.length ? `${this.t('MissingValues', 'Fill these variables before copying:')} ${result.missing.join(', ')}` : this.t('PreviewReady', 'Ready to copy. Your saved template will not change.');
        }
        updateCopyEligibility(result = this.controller.preview()) {
            if (this.previewElements?.compare) this.previewElements.compare.disabled = !result?.complete || this.controller.disposed || this.controller.busy || Boolean(this.controller.pendingCommand);
            if (this.previewElements?.run) this.previewElements.run.disabled = !result?.complete || this.controller.disposed || this.controller.busy || Boolean(this.controller.pendingCommand);
            if (this.previewElements) this.previewElements.copy.disabled = !result?.complete || this.controller.disposed || this.controller.busy || Boolean(this.controller.pendingCommand) || this.copying;
        }
        async copy() {
            const c = this.controller, result = c.preview(), ui = this.previewElements;
            if (!ui || c.disposed || !result?.complete || c.busy || c.pendingCommand || this.copying) return;
            this.copying = true;
            const generation = ++this.copyGeneration, record = c.record(), session = c.session();
            const context = { id: record.id, version: record.version, currentVersionId: record.currentVersionId, versionId: session.versionId, literal: session.literal, text: result.text };
            // A pending clipboard write belongs to this exact preview, not just its DOM nodes.
            const isCurrent = () => {
                if (c.disposed) return false;
                const current = c.record(), active = c.session(), preview = c.preview();
                return generation === this.copyGeneration && this.previewElements === ui && !c.busy && !c.pendingCommand &&
                    current?.id === context.id && current.version === context.version && current.currentVersionId === context.currentVersionId &&
                    active?.versionId === context.versionId && active.literal === context.literal && preview?.complete && preview.text === context.text;
            };
            this.updateCopyEligibility(result);
            try {
                if (!this.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await this.clipboard.writeText(context.text);
                if (!isCurrent()) return;
                ui.status.textContent = this.t('Copied', 'Copied. Paste it into the tool you choose.');
            } catch (_) {
                if (!isCurrent()) return;
                ui.status.textContent = this.t('CopyFailed', 'Copy was blocked. Your preview is still here. Select the text and use your browser’s Copy command.');
                ui.preview.focus(); ui.preview.select?.();
            } finally {
                this.copying = false;
                this.refreshModelCopy?.();
                // Navigation may have replaced the button while the old write was pending.
                // Refresh only eligibility so a current success/fallback message stays visible.
                this.updateCopyEligibility();
                const activeDraft = this.draftPreviewElements;
                if (!this.destroyed && activeDraft) activeDraft.copy.disabled = !c.draftPreviewResult()?.complete;
            }
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
            let selectedVersion;
            const use = this.button('UseVersion', 'Use this version', () => {
                if (selectedVersion && c.useVersion(selectedVersion.id, selectedVersion.body, record.id)) this.focusDetail('preview');
            });
            const linked = this.linkedSection(record.id, record.currentVersionId);
            const linkedEntry = this.linkedSections[this.linkedSections.length - 1];
            const paint = version => { selectedVersion = version; use.disabled = c.busy || Boolean(c.pendingCommand) || c.pendingReadGeneration !== null || c.linkedPromptUnavailable || Boolean(record.deletedAt); linkedEntry.versionId = version.id; this.paintLinkedResults(linkedEntry); this.historyId = version.id; body.textContent = version.body; caption.textContent = `${this.t('VersionSaved', 'Body saved')} ${this.date(version.createdAt)}`; restore.disabled = c.busy || Boolean(c.pendingCommand) || Boolean(record.deletedAt) || version.id === record.currentVersionId;
                for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.versionId === version.id)); };
            for (const [index, version] of [...record.history].entries()) {
                const button = this.el('button', '', `v${index + 1}${version.id === record.currentVersionId ? ` · ${this.t('Current', 'current')}` : ''}`); button.type = 'button'; button.dataset.versionId = version.id; button.addEventListener('click', () => paint(version)); list.append(button);
            }
            details.append(list, caption, body, linked, this.el('div', 'prompt-section')); details.lastElementChild?.append(use, restore);
            // append directly when running the small synthetic DOM model as well.
            if (!restore.parentElement) details.append(use, restore);
            paint(record.history.find(version => version.id === this.historyId) || record.history[record.history.length - 1]);
            this.renderComparison(record, details); this.main.append(details);
        }
        renderComparison(record, history) {
            const c = this.controller, panel = this.el('section', 'prompt-comparison');
            const opener = this.focusKey(this.button('Compare', 'Compare saved versions', () => {
                if (c.selected !== record.id || c.error?.scope === 'read') return;
                const from = record.history.find(v => v.id === this.historyId) || record.history[0];
                const to = record.history.find(v => v.id !== from.id && v.id === record.currentVersionId) || record.history.find(v => v.id !== from.id) || from;
                this.comparison = { recordId: record.id, from: from.id, to: to.id }; paint();
                panel.querySelector('select')?.focus();
            }), 'compare-open');
            opener.disabled = c.error?.scope === 'read';
            const close = () => { this.comparison = null; paint(); opener.focus(); };
            panel.addEventListener('keydown', event => {
                if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229 && !event.repeat) { event.preventDefault(); event.stopPropagation(); close(); }
            });
            const paint = () => {
                panel.replaceChildren(); panel.hidden = !this.comparison; opener.setAttribute('aria-expanded', String(!panel.hidden));
                if (!this.comparison) return;
                const state = this.comparison;
                panel.append(this.el('h3', '', this.t('Compare', 'Compare saved versions')),
                    this.el('p', 'prompt-help', this.t('CompareHelp', 'Read-only comparison of saved bodies. Variables are not filled in. From → To determines removed and added text.')));
                const selectors = this.el('div', 'prompt-compare-grid');
                for (const [side, name, fallback] of [['from', 'CompareFrom', 'From'], ['to', 'CompareTo', 'To']]) {
                    const label = this.el('label', 'prompt-field'), select = this.focusKey(this.el('select'), `compare-${side}`);
                    label.append(this.el('span', '', this.t(name, fallback)));
                    for (const [index, version] of record.history.entries()) {
                        const option = this.el('option', '', `v${index + 1} · ${this.date(version.createdAt)}`); option.value = version.id; select.append(option);
                    }
                    select.value = state[side]; select.addEventListener('change', () => {
                        if (this.comparison !== state || c.selected !== record.id || c.error?.scope === 'read' || !record.history.some(v => v.id === select.value)) return;
                        state[side] = select.value; paint(); panel.querySelector(`[data-prompt-focus="compare-${side}"]`)?.focus();
                    }); label.append(select); selectors.append(label);
                }
                panel.append(selectors);
                const from = record.history.find(v => v.id === state.from), to = record.history.find(v => v.id === state.to);
                if (!from || !to) { close(); return; }
                const result = compareBodies(from.body, to.body), status = this.el('p', 'prompt-help'); status.setAttribute('role', 'status');
                status.textContent = result.equal ? this.t('CompareEqual', 'These saved bodies are identical.') : result.fallback ? this.t('CompareFallback', 'Large change: unchanged edges are matched; the middle is shown as removed and added blocks.') : this.t('CompareLegend', '− Removed · + Added · = Unchanged. Line endings are compared exactly.');
                panel.append(status);
                // Explain invisible differences outside the unmodified literal bodies.
                for (const [name, fallback, counts] of [['CompareFrom', 'From', result.beforeEndings], ['CompareTo', 'To', result.afterEndings]]) {
                    panel.append(this.el('p', 'prompt-help prompt-compare-endings', `${this.t(name, fallback)} · ${this.t('CompareEndings', 'Line endings')}: CRLF ${counts.crlf} · LF ${counts.lf} · CR ${counts.cr} · ${this.t('CompareFinalNewline', 'Ends with newline')}: ${counts.final ? this.t('CompareYes', 'Yes') : this.t('CompareNo', 'No')}`));
                }
                const changes = this.el('div', 'prompt-compare-changes');
                for (const group of result.groups) {
                    const block = this.el('section', `prompt-compare-${group.kind}`);
                    block.append(this.el('h4', '', this.t(`Compare${group.kind}`, ({ removed: '− Removed', added: '+ Added', unchanged: '= Unchanged' })[group.kind])));
                    const pre = this.el('pre', 'prompt-readonly', group.text); pre.tabIndex = 0; block.append(pre); changes.append(block);
                }
                panel.append(changes);
                const originals = this.el('details', 'prompt-compare-originals');
                originals.append(this.el('summary', '', this.t('CompareOriginals', 'Original saved text (From / To)')));
                for (const [name, fallback, version] of [['CompareFrom', 'From', from], ['CompareTo', 'To', to]]) {
                    originals.append(this.el('h4', '', this.t(name, fallback)));
                    const pre = this.el('pre', 'prompt-readonly', version.body); pre.tabIndex = 0; originals.append(pre);
                }
                panel.append(originals, this.focusKey(this.button('CompareClose', 'Close comparison', close), 'compare-close'));
            };
            history.append(opener, panel); if (this.comparison) history.open = true; paint();
        }
        date(value) {
            try { return new Intl.DateTimeFormat(this.doc.documentElement.lang || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); } catch (_) { return value; }
        }
        errorText(code) {
            if (code === 'OUTCOME_UNCERTAIN') return this.t('OutcomeUncertain', 'The earlier save may already have completed. Your draft is kept and new saves are paused. Check its saved receipt; if no matching receipt remains, keep this tab open and inspect the library before taking further action.');
            if (code === 'SESSION_LIMIT') return this.t('PreviewSessionLimit', 'Temporary preview memory is full or this value is too large. Shorten values, clear this preview, or explicitly clear all preview values in this tab. Existing preview values are kept.');
            if (code === 'PREVIEW_UNAVAILABLE') return this.t('PreviewUnavailable', 'This exact preview source cannot currently be verified. Your body and values are kept; copying and saved-excerpt insertion are paused. Read again or explicitly return to the current version.');
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
                const preview = root.LocalItabAIMarkdown.serialize('prompt', snapshot);
                const accepted = await this.dialog({
                    title: this.t('MarkdownReview', 'Review saved-item Markdown export'),
                    body: `${this.t('MarkdownWarning', 'This is an unencrypted, readable copy of one current saved item, not a recovery backup. Unsaved work and history are excluded. Text and notes may still contain private information.')}\n\n${snapshot.title}\n${snapshot.id}\n${this.t('MarkdownVersion', 'Saved version')} · ${snapshot.version}\n${this.t('MarkdownBodyVersion', 'Body version')} · ${snapshot.currentVersionId}`,
                    accept: this.t('MarkdownDownload', 'Download Markdown'), markdownPreview: preview, markdownCurrent: current,
                    sourceCheckbox: undefined
                });
                if (!accepted || !current()) return;
                const data = root.LocalItabAIMarkdown.serialize('prompt', snapshot, { includeSourceUrl });
                const blob = new root.Blob([data], { type: 'text/markdown;charset=utf-8' });
                url = root.URL.createObjectURL(blob); anchor = this.el('a');
                anchor.href = url; anchor.download = 'local-itab-prompt.md'; this.doc.body.append(anchor);
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
        dialog({ title, body, accept, markdownPreview, sourceCheckbox, sourceValue, markdownCurrent }) {
            if (this.openDialog) return Promise.resolve(false);
            return new Promise(resolve => {
                const c = this.controller, opener = this.doc.activeElement;
                const focus = { selected: c.selected, draft: c.draft(), key: this.main.contains(opener) ? opener?.dataset.promptFocus : null, stale: false };
                this.dialogFocus = focus;
                const overlay = this.el('div', 'prompt-dialog-overlay'), box = this.el('section', 'prompt-dialog'); overlay.setAttribute('aria-hidden', 'true');
                box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'prompt-dialog-title'); box.setAttribute('aria-describedby', 'prompt-dialog-body');
                const heading = this.el('h2', '', title); heading.id = 'prompt-dialog-title'; const content = this.el('p', '', body); content.id = 'prompt-dialog-body';
                box.append(heading, content);
                if (markdownPreview !== undefined) { const preview = this.el('pre', 'prompt-readonly', markdownPreview); preview.setAttribute('tabindex', '0'); box.append(preview); }
                if (sourceCheckbox) {
                    const label = this.el('label', 'prompt-check'), input = this.el('input'); input.type = 'checkbox'; input.checked = false;
                    const source = this.el('pre', 'prompt-readonly', sourceValue || ''); source.hidden = true;
                    input.addEventListener('change', () => { sourceCheckbox(input.checked); source.hidden = !input.checked; });
                    label.append(input, this.el('span', '', this.t('MarkdownSource', 'Include the saved source URL (may reveal private conversation links). Text and notes may still contain private information.'))); box.append(label, source);
                }
                const actions = this.el('div', 'prompt-actions'); let close, finished = false;
                const finish = answer => {
                    if (finished) return;
                    finished = true; this.openDialog = false; this.dialogFocus = null;
                    if (markdownPreview !== undefined) this.cancelMarkdownDialog = null;
                    const active = this.doc.activeElement;
                    const usable = node => node?.isConnected && !node.disabled && !node.closest('[hidden], [inert]') && node.getClientRects().length;
                    // A newer selection or a nested dialog owns its own focus. Only
                    // recover a replaced opener while this confirmation still owns it.
                    const restore = !c.disposed && !focus.stale && c.selected === focus.selected && c.draft() === focus.draft &&
                        (markdownPreview === undefined || !markdownCurrent || markdownCurrent()) &&
                        (overlay.contains(active) || active === this.doc.body || active === this.doc.documentElement || !usable(active));
                    close?.(restore); overlay.remove();
                    if (restore && !opener?.isConnected && focus.key) {
                        const target = Array.from(this.main.querySelectorAll('[data-prompt-focus]')).find(node => node.dataset.promptFocus === focus.key);
                        if (usable(target)) target.focus();
                    }
                    resolve(answer);
                };
                if (markdownPreview !== undefined) this.cancelMarkdownDialog = () => finish(false);
                const cancel = this.button('Cancel', 'Cancel', () => finish(false)), proceed = this.el('button', 'prompt-primary', accept); proceed.type = 'button'; proceed.addEventListener('click', () => finish(true));
                actions.append(cancel, proceed); box.append(actions); overlay.append(box); this.doc.body.append(overlay); this.openDialog = true;
                // A long export review must open at its scope/privacy introduction.
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
    root.LocalItabPromptsView = { View, compareBodies };
})(typeof window === 'undefined' ? globalThis : window);
