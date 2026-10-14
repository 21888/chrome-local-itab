(function (root) {
    'use strict';
    const api = root.LocalItabFinder;
    const fallback = {
        finderOpen: 'Find saved sites', finderShortcutHint: 'Press / outside editing fields to find saved sites.', finderScope: 'Only your saved sites · local search',
        finderLabel: 'Title, address, category or built-in use', finderHint: 'Type or choose a category to find a saved site. This does not search the web.',
        finderMatchMode: 'Match', finderMatchPhrase: 'Continuous phrase', finderMatchAllWords: 'All words',
        finderMatchPhraseHint: 'Find the full text in one title, address, category or built-in use/alias. Spaces and punctuation stay literal.',
        finderMatchAllWordsHint: 'Separate words with spaces. Every word must appear in the title, address, category or built-in use/alias, in any order. Punctuation stays literal.',
        finderCategory: 'Filter by category', finderAllCategories: 'All categories',
        finderCategoryHint: 'Counts show saved sites before text filtering. Choose a category to browse without typing.',
        finderEmpty: 'No saved sites yet.', finderNone: 'No matching saved sites.', finderClose: 'Close', finderClear: 'Clear',
        finderPrevious: 'Previous results', finderNext: 'Next results', finderResults: 'Results', finderShowing: 'Showing',
        finderPending: 'Checking the latest saved site…', finderReadError: 'Could not verify the saved site. Nothing was opened. Try again.', finderBlocked: 'Could not open a new tab. Allow this page to open tabs and try again.',
        finderChanged: 'This saved site changed or is no longer available. Results refreshed; choose again.', finderUnsafe: 'Unsupported address', finderCatalogMatch: 'Built-in use/alias match'
    };
    const t = key => { const value = root.i18n?.t(key); return value && value !== key ? value : fallback[key]; };
    function el(tag, className, text) {
        const node = document.createElement(tag); node.className = className || '';
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function button(text, action, className = 'finder-button') {
        const node = el('button', className, text); node.type = 'button'; node.addEventListener('click', action); return node;
    }
    function mount(host, options) {
        const controller = new api.Controller(options);
        let preparation = null;
        let overlay = null, input, categorySelect, matchSelect, matchHint, list, status, alert, previous, next, cleanup, composing = false, compositionTarget = null;
        const opener = button(t('finderOpen'), open);
        opener.classList.add('finder-opener'); opener.setAttribute('aria-haspopup', 'dialog');
        const shortcutEnabled = options.shortcutEnabled !== false;
        if (shortcutEnabled) {
            opener.setAttribute('aria-keyshortcuts', '/');
            opener.setAttribute('aria-description', t('finderShortcutHint'));
            opener.title = t('finderShortcutHint');
            const keyHint = el('kbd', 'finder-key-hint', '/'); keyHint.setAttribute('aria-hidden', 'true');
            opener.append(keyHint);
        }
        host.append(opener);
        function handleShortcut(event) {
            // Match the typed character, not a US-only physical key. Shift may produce /.
            if (compositionTarget && (!compositionTarget.isConnected || !compositionTarget.contains(document.activeElement))) compositionTarget = null;
            if (!shortcutEnabled || !host.isConnected || document.hidden || document.visibilityState === 'hidden' ||
                event.key !== '/' || event.defaultPrevented || event.repeat || event.isComposing ||
                event.keyCode === 229 || compositionTarget || event.getModifierState?.('AltGraph') || event.ctrlKey || event.altKey || event.metaKey || overlay) return;
            const controls = 'input, textarea, select, audio, video, iframe, object, embed, [contenteditable], [inert], [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="spinbutton"]';
            const path = event.composedPath?.() || [event.target];
            if (document.designMode === 'on' || path.some(node => node.isContentEditable || node.closest?.(controls)) ||
                document.activeElement?.isContentEditable || document.activeElement?.closest?.(controls)) return;
            // Editors and menus may retain focus elsewhere; do not stack a Finder over them.
            if (Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open], .modal-overlay.active'))
                .some(node => !node.closest('[hidden], [aria-hidden="true"]') && node.getClientRects().length)) return;
            event.preventDefault();
            open();
        }
        const compositionStart = event => { compositionTarget = event.target; };
        const compositionEnd = () => { compositionTarget = null; };
        const compositionFocus = event => {
            if (compositionTarget && !compositionTarget.contains(event.target)) compositionTarget = null;
        };
        document.body.addEventListener('keydown', handleShortcut);
        document.body.addEventListener('compositionstart', compositionStart);
        document.body.addEventListener('compositionend', compositionEnd);
        document.body.addEventListener('focusin', compositionFocus);
        function close() {
            if (!overlay) return;
            const old = overlay; overlay = null; cleanup?.(); cleanup = null; old.remove();
            controller.clear(); composing = false; compositionTarget = null;
        }
        function render(page = 0) {
            if (!overlay) return;
            if (preparation) {
                list.replaceChildren(); previous.hidden = next.hidden = true;
                status.textContent = t(preparation === 'loading' ? 'finderPending' : 'finderReadError');
                list.setAttribute('aria-busy', String(preparation === 'loading'));
                return;
            }
            const focused = document.activeElement;
            const hadResultFocus = list.contains(focused);
            const result = controller.search(input.value, page, categorySelect.value, matchSelect.value);
            matchSelect.value = result.matchMode;
            matchHint.textContent = t(result.matchMode === 'all-words' ? 'finderMatchAllWordsHint' : 'finderMatchPhraseHint');
            const options = [['', `${t('finderAllCategories')} (${result.saved})`],
                ...result.categoryOptions.map(category => [category.id, `${category.name} (${category.count})`])];
            // Do not rebuild the native select while its options are unchanged.
            const signature = JSON.stringify(options);
            if (categorySelect.dataset.options !== signature) {
                categorySelect.replaceChildren(...options.map(([value, label]) => {
                    const option = el('option', '', label); option.value = value; return option;
                }));
                categorySelect.dataset.options = signature;
            }
            categorySelect.value = result.category;
            list.replaceChildren();
            status.textContent = !result.saved ? t('finderEmpty') : !result.query.trim() && !result.category ? t('finderHint') : !result.total ? t('finderNone') :
                `${t('finderResults')}: ${result.total} · ${t('finderShowing')}: ${result.start + 1}–${result.start + result.rows.length}`;
            for (const row of result.rows) {
                const item = el('li');
                const control = button('', async event => {
                    // Browser-generated Enter/Space clicks have detail=0; a composing key must never launch.
                    if (composing || event.isComposing) return;
                    const ownedOverlay = overlay;
                    const activation = controller.activate(row.token);
                    updatePending();
                    const outcome = await activation;
                    if (overlay !== ownedOverlay) return;
                    updatePending();
                    if (['stale', 'error', 'blocked'].includes(outcome)) {
                        render(controller.page);
                        alert.textContent = t({ stale: 'finderChanged', error: 'finderReadError', blocked: 'finderBlocked' }[outcome]);
                    }
                }, 'finder-button finder-result');
                control.disabled = !row.safe; control.dataset.finderUnsafe = String(!row.safe);
                control.append(el('span', 'finder-title', row.title), el('span', 'finder-meta', `${row.category} · ${row.domain || t('finderUnsafe')}`), el('span', 'finder-url', row.url));
                if (row.catalogMatches?.length) control.append(el('span', 'finder-meta finder-catalog-match', `${t('finderCatalogMatch')}: ${row.catalogMatches.join(' · ')}`));
                item.append(control); list.append(item);
            }
            previous.hidden = !result.hasPrevious; next.hidden = !result.hasNext;
            updatePending();
            if (hadResultFocus || (focused === next && next.hidden) || (focused === previous && previous.hidden)) input.focus({ preventScroll: true });
        }
        function updatePending() {
            if (!overlay || preparation) return;
            list.setAttribute('aria-busy', String(Boolean(controller.pending)));
            for (const control of list.querySelectorAll('button')) {
                const disabled = Boolean(controller.pending) || control.dataset.finderUnsafe === 'true';
                // Chrome blurs a disabled active button to the body, outside this
                // dialog's Escape/Tab handlers. Transfer only its owned focus
                // before disabling; later read outcomes never reclaim newer focus.
                if (disabled && document.activeElement === control) input.focus({ preventScroll: true });
                control.disabled = disabled;
            }
            alert.textContent = controller.pending ? t('finderPending') : '';
        }
        function open() {
            if (overlay) { input.focus(); return; }
            composing = false;
            overlay = el('div', 'finder-overlay'); overlay.setAttribute('aria-hidden', 'true');
            const panel = el('section', 'finder-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
            const heading = el('h2', '', t('finderOpen')); heading.id = 'shortcut-finder-title'; panel.setAttribute('aria-labelledby', heading.id);
            const scope = el('p', 'finder-meta', t('finderScope')); scope.id = 'shortcut-finder-scope'; panel.setAttribute('aria-describedby', scope.id);
            const label = el('label', 'finder-label', t('finderLabel')); label.htmlFor = 'shortcut-finder-query';
            input = el('input', 'finder-input'); input.id = 'shortcut-finder-query'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false;
            const matchLabel = el('label', 'finder-label', t('finderMatchMode')); matchLabel.htmlFor = 'shortcut-finder-match-mode';
            matchSelect = el('select', 'finder-input finder-match-mode'); matchSelect.id = 'shortcut-finder-match-mode';
            for (const [value, key] of [['phrase', 'finderMatchPhrase'], ['all-words', 'finderMatchAllWords']]) {
                const option = el('option', '', t(key)); option.value = value; matchSelect.append(option);
            }
            matchSelect.value = 'phrase';
            matchHint = el('p', 'finder-meta'); matchHint.id = 'shortcut-finder-match-hint';
            matchSelect.setAttribute('aria-describedby', matchHint.id); input.setAttribute('aria-describedby', matchHint.id);
            const categoryLabel = el('label', 'finder-label', t('finderCategory')); categoryLabel.htmlFor = 'shortcut-finder-category';
            categorySelect = el('select', 'finder-input finder-category'); categorySelect.id = 'shortcut-finder-category';
            const categoryHint = el('p', 'finder-meta', t('finderCategoryHint')); categoryHint.id = 'shortcut-finder-category-hint';
            categorySelect.setAttribute('aria-describedby', categoryHint.id);
            status = el('p', 'finder-meta'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            alert = el('p', 'finder-alert'); alert.setAttribute('role', 'status');
            list = el('ul', 'finder-list');
            previous = button(t('finderPrevious'), () => render(controller.page - 1));
            next = button(t('finderNext'), () => render(controller.page + 1));
            const actions = el('div', 'finder-actions');
            actions.append(button(t('finderClear'), () => { input.value = ''; categorySelect.value = ''; matchSelect.value = 'phrase'; alert.textContent = ''; render(); input.focus(); }), button(t('finderClose'), close));
            const pages = el('div', 'finder-actions'); pages.append(previous, next);
            panel.append(heading, scope, label, input, matchLabel, matchSelect, matchHint, categoryLabel, categorySelect, categoryHint, actions, status, alert, list, pages); overlay.append(panel); document.body.append(overlay);
            matchSelect.addEventListener('change', () => { alert.textContent = ''; render(); updatePending(); });
            categorySelect.addEventListener('change', () => { alert.textContent = ''; render(); updatePending(); });
            input.addEventListener('input', () => { alert.textContent = ''; if (!composing) render(); });
            input.addEventListener('compositionstart', () => { composing = true; controller.cancelPending(); updatePending(); });
            input.addEventListener('compositionend', () => { composing = false; render(); });
            overlay.addEventListener('keydown', event => {
                if (event.isComposing || composing || event.keyCode === 229) {
                    // Prevent native result activation, without suppressing ordinary IME typing in the input.
                    if (event.target !== input && ['Enter', ' '].includes(event.key)) event.preventDefault();
                    event.stopImmediatePropagation(); return;
                }
                if (event.key === 'Enter' && event.repeat) { event.preventDefault(); return; }
                // Results use native buttons, not a synthetic Enter/Space handler.
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                const controls = Array.from(list.querySelectorAll('button')).filter(node => !node.disabled);
                const index = controls.indexOf(event.target);
                if ((event.target !== input && index < 0) || !controls.length) return;
                event.preventDefault();
                const target = event.target === input ? (event.key === 'ArrowDown' ? 0 : controls.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
                controls[target].focus();
            });
            preparation = options.prepareSnapshot ? 'loading' : null;
            render(); cleanup = root.LocalItabDialog.open(overlay, input, close);
            if (options.prepareSnapshot) {
                const ownedOverlay = overlay;
                Promise.resolve().then(() => options.prepareSnapshot(() => overlay === ownedOverlay)).then(() => {
                    if (overlay !== ownedOverlay) return;
                    preparation = null;
                    if (!composing) render();
                }, () => {
                    if (overlay !== ownedOverlay) return;
                    preparation = 'error'; render();
                });
            }
        }
        const unsubscribe = options.subscribe?.(() => { if (overlay && !composing) render(controller.page); });
        return { get pending() { return Boolean(controller.pending); }, hasUncommittedWork: () => Boolean(overlay), refresh: () => { if (overlay && !composing) render(controller.page); }, close, destroy() {
            document.body.removeEventListener('keydown', handleShortcut);
            document.body.removeEventListener('compositionstart', compositionStart);
            document.body.removeEventListener('compositionend', compositionEnd);
            document.body.removeEventListener('focusin', compositionFocus);
            close(); unsubscribe?.(); opener.remove();
        } };
    }
    api.mount = mount;
})(window);
