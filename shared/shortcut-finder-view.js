(function (root) {
    'use strict';
    const api = root.LocalItabFinder;
    const fallback = {
        finderOpen: 'Find saved sites', finderShortcutHint: 'Press / outside editing fields to find saved sites.', finderScope: 'Only your saved sites · local search',
        finderLabel: 'Title, address, category or built-in use', finderHint: 'Type or choose a category to find a saved site. This does not search the web.',
        finderMatchMode: 'Match', finderMatchPhrase: 'Continuous phrase', finderMatchAllWords: 'All words',
        finderMatchPhraseHint: 'Find the full text in one title, address, category or built-in use/alias. Spaces and punctuation stay literal.',
        finderMatchAllWordsHint: 'Separate words with spaces. Every word must appear in the title, address, category or built-in use/alias, in any order. Punctuation stays literal.',
        finderWorkspaceScope: 'Workspaces', finderCurrentWorkspace: 'Current workspace', finderAllWorkspaces: 'All workspaces',
        finderAllWorkspaceHint: 'Search saved sites in active workspaces on this device. Opening a result keeps this workspace unchanged.',
        finderAllUnavailable: 'All-workspace search is unavailable. Some workspaces could not be checked. Try Current workspace, or close and reopen to retry.',
        finderCategory: 'Filter by category', finderAllCategories: 'All categories',
        finderCategoryHint: 'Counts show saved sites before text filtering. Choose a category to browse without typing.',
        finderEmpty: 'No saved sites yet.', finderNone: 'No matching saved sites.', finderClose: 'Close', finderClear: 'Clear',
        finderPrevious: 'Previous results', finderNext: 'Next results', finderResults: 'Results', finderShowing: 'Showing',
        finderPending: 'Checking the latest saved site…', finderReadError: 'Could not verify the saved site. Nothing was opened. Try again.', finderBlocked: 'Could not open a new tab. Allow this page to open tabs and try again.',
        finderCopyURL: 'Copy URL', finderCopyPending: 'Copying URL…', finderCopySuccess: 'URL copied.', finderCopyError: 'Could not copy the URL. Try again.',
        finderCopyRefresh: 'Copy controls need refreshing. Change the search or close and reopen this panel.',
        finderCopyUnavailable: 'Copying is unavailable in this browser. You can select the displayed URL.', finderCopyStale: 'This result changed. Search again to copy its URL.',
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
    // Finder-only write ownership survives host destroy/remount. No clipboard
    // contents are retained here; observers receive only the busy state.
    let copyPending = null;
    const copyObservers = new Set();
    const notifyCopyPending = () => { for (const observer of copyObservers) observer(); };
    function mount(host, options) {
        const controller = new api.Controller(options);
        let preparation = null, preparationEpoch = 0;
        let copyEpoch = 0, renderEpoch = 0, destroyed = false, pageHidden = false;
        const copyControls = new Set();
        let overlay = null, input, categorySelect, matchSelect, matchHint, list, status, alert, copyNotice, previous, next, cleanup, composing = false, compositionTarget = null;
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
        const compositionStart = event => { compositionTarget = event.target; invalidateCopyReceipt(); };
        const compositionEnd = () => { compositionTarget = null; };
        const compositionFocus = event => {
            if (compositionTarget && !compositionTarget.contains(event.target)) compositionTarget = null;
        };
        document.body.addEventListener('keydown', handleShortcut);
        document.body.addEventListener('compositionstart', compositionStart);
        document.body.addEventListener('compositionend', compositionEnd);
        document.body.addEventListener('focusin', compositionFocus);
        // Clipboard completion owns only its original receipt. The system write
        // cannot be cancelled: keep its lock even when that receipt is retired.
        function invalidateCopyReceipt() {
            copyEpoch++;
            for (const node of list?.querySelectorAll('.finder-copy-status') || []) node.textContent = '';
        }
        function shown(node) {
            if (!node?.isConnected || !node.getClientRects().length) return false;
            const style = root.getComputedStyle?.(node);
            if (style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
            for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
                if (ancestor.tagName !== 'DETAILS' || ancestor.open) continue;
                const summary = Array.from(ancestor.children).find(child => child.tagName === 'SUMMARY');
                if (!summary?.contains(node)) return false;
            }
            return true;
        }
        const visible = () => !destroyed && !pageHidden && shown(host) &&
            !host.closest('[hidden], [aria-hidden="true"]') && !document.hidden && document.visibilityState !== 'hidden';
        function retireCopyControls() {
            renderEpoch++; invalidateCopyReceipt(); updateCopyPending();
            // One fixed hint, with no URL or previous write result.
            if (overlay && copyNotice) copyNotice.textContent = t('finderCopyRefresh');
        }
        // Observe only this view's owner chains and current result subtree.
        // Drain queued records before activation to catch same-task DOM ABA.
        const ownershipChanged = records => {
            if (!overlay) return;
            const containsCopy = node => [...copyControls].some(control => node?.contains?.(control));
            const owns = node => node?.contains?.(host) || node?.contains?.(overlay) || containsCopy(node);
            if (records.some(record => record.type === 'childList' ? Array.from(record.removedNodes).some(owns) :
                owns(record.target) && (record.attributeName !== 'inert' || record.target?.contains?.(overlay) || containsCopy(record.target)))) retireCopyControls();
        };
        const copyObserver = root.MutationObserver ? new root.MutationObserver(ownershipChanged) : null;
        const watchCopyOwners = () => {
            copyObserver?.disconnect();
            for (let ancestor = host; ancestor; ancestor = ancestor.parentElement) copyObserver?.observe(ancestor, {
                childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'class', 'inert', 'open']
            });
            if (overlay) copyObserver?.observe(overlay, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'class', 'inert', 'open'] });
        };
        watchCopyOwners();
        const copyVisibilityChanged = () => { retireCopyControls(); };
        const copyPageHide = () => { pageHidden = true; retireCopyControls(); };
        const copyPageShow = () => { pageHidden = false; retireCopyControls(); };
        document.addEventListener('visibilitychange', copyVisibilityChanged);
        root.addEventListener?.('pagehide', copyPageHide);
        root.addEventListener?.('pageshow', copyPageShow);
        function updateCopyPending() {
            if (!overlay || destroyed) return;
            for (const node of list.querySelectorAll('.finder-copy-url')) node.setAttribute('aria-disabled', String(Boolean(copyPending) || node.disabled || node.dataset.finderCopyEpoch !== String(renderEpoch)));
        }
        copyObservers.add(updateCopyPending);
        function makeCopyControl(row, item) {
            const ownedOverlay = overlay, ownedList = list, generation = renderEpoch;
            const feedback = el('span', 'finder-copy-status'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
            const current = () => { ownershipChanged(copyObserver?.takeRecords() || []); return overlay === ownedOverlay && list === ownedList && generation === renderEpoch &&
                visible() && shown(overlay) && overlay.getAttribute('aria-hidden') !== 'true' &&
                copyControls.has(copy) && item.parentElement === list && copy.parentElement === item && shown(copy) &&
                !copy.closest('[hidden], [aria-hidden="true"], [inert]'); };
            const copy = button(t('finderCopyURL'), event => {
                if (!current() || copy.disabled || copyPending || composing || compositionTarget || event.defaultPrevented ||
                    event.isComposing || event.keyCode === 229 || event.repeat) return;
                const receipt = ++copyEpoch;
                // Only consult the already-loaded snapshot. Do not activate,
                // reserve a tab, reread storage, or use a normalized destination.
                let record;
                try {
                    const links = options.getSnapshot()?.links || [];
                    record = links.includes(row.token.reference) && controller.resolve(row.token, links);
                } catch (_) { /* A changed/unavailable loaded snapshot is stale. */ }
                if (!record || record.url !== row.url || !root.LocalItabStoredURL?.destinationForSavedURL(row.url)) {
                    feedback.textContent = t('finderCopyStale'); return;
                }
                const request = {};
                copyPending = request; notifyCopyPending();
                feedback.textContent = t('finderCopyPending');
                const finish = key => {
                    if (copyPending === request) copyPending = null;
                    notifyCopyPending(); // Unlock only; a late receipt never claims new UI or focus.
                    if (current() && copyEpoch === receipt) feedback.textContent = t(key);
                };
                try {
                    const clipboard = root.navigator?.clipboard;
                    if (typeof clipboard?.writeText !== 'function') { finish('finderCopyUnavailable'); return; }
                    // Must start directly in the explicit native click's activation stack.
                    Promise.resolve(clipboard.writeText(row.url)).then(() => finish('finderCopySuccess'), () => finish('finderCopyError'));
                } catch (_) { finish('finderCopyError'); }
            }, 'finder-button finder-copy-url');
            copy.dataset.finderCopyEpoch = String(generation);
            copy.disabled = !root.LocalItabStoredURL?.destinationForSavedURL(row.url);
            copy.setAttribute('aria-label', `${t('finderCopyURL')}: ${row.title}`);
            copyControls.add(copy); item.append(copy, feedback);
        }
        function close() {
            if (!overlay) return;
            invalidateCopyReceipt(); renderEpoch++; copyControls.clear();
            copyObserver?.disconnect();
            const old = overlay; overlay = null; if (!destroyed) watchCopyOwners(); cleanup?.(); cleanup = null; old.remove();
            preparationEpoch++; options.setScope?.('current');
            controller.clear(); composing = false; compositionTarget = null;
        }
        function render(page = 0) {
            if (!overlay) return;
            invalidateCopyReceipt(); renderEpoch++; copyControls.clear();
            copyNotice.textContent = ''; watchCopyOwners();
            if (preparation) {
                list.replaceChildren(); previous.hidden = next.hidden = true;
                status.textContent = t(preparation === 'loading' ? 'finderPending' : options.getScope?.() === 'all' ? 'finderAllUnavailable' : 'finderReadError');
                list.setAttribute('aria-busy', String(preparation === 'loading'));
                return;
            }
            const focused = document.activeElement;
            const hadResultFocus = list.contains(focused);
            const result = controller.search(input.value, page, categorySelect.value, matchSelect.value);
            matchSelect.value = result.matchMode;
            matchHint.textContent = t(result.matchMode === 'all-words' ? 'finderMatchAllWordsHint' : 'finderMatchPhraseHint');
            const categoryChoices = [['', `${t('finderAllCategories')} (${result.saved})`],
                ...result.categoryOptions.map(category => [category.id, `${category.name} (${category.count})`])];
            // Do not rebuild the native select while its options are unchanged.
            const signature = JSON.stringify(categoryChoices);
            if (categorySelect.dataset.options !== signature) {
                categorySelect.replaceChildren(...categoryChoices.map(([value, label]) => {
                    const option = el('option', '', label); option.value = value; return option;
                }));
                categorySelect.dataset.options = signature;
            }
            categorySelect.value = result.category;
            list.replaceChildren();
            status.textContent = !result.saved ? t('finderEmpty') : !result.query.trim() && !result.category ? t('finderHint') : !result.total ? t('finderNone') :
                `${t('finderResults')}: ${result.total} · ${t('finderShowing')}: ${result.start + 1}–${result.start + result.rows.length}`;
            for (const row of result.rows) {
                const item = el('li', 'finder-row');
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
                        if (options.getScope?.() === 'all' && outcome !== 'blocked') prepare();
                        else render(controller.page);
                        alert.textContent = t({ stale: 'finderChanged', error: 'finderReadError', blocked: 'finderBlocked' }[outcome]);
                    }
                }, 'finder-button finder-result');
                control.disabled = !row.safe; control.dataset.finderUnsafe = String(!row.safe);
                control.append(el('span', 'finder-title', row.title), el('span', 'finder-meta', `${row.category} · ${row.domain || t('finderUnsafe')}`), el('span', 'finder-url', row.url));
                if (row.workspace) control.append(el('span', 'finder-meta finder-workspace', row.workspace));
                if (row.catalogMatches?.length) control.append(el('span', 'finder-meta finder-catalog-match', `${t('finderCatalogMatch')}: ${row.catalogMatches.join(' · ')}`));
                item.append(control); makeCopyControl(row, item); list.append(item);
            }
            previous.hidden = !result.hasPrevious; next.hidden = !result.hasNext;
            updatePending(); updateCopyPending(); copyObserver?.takeRecords();
            if (hadResultFocus || (focused === next && next.hidden) || (focused === previous && previous.hidden)) input.focus({ preventScroll: true });
        }
        function updatePending() {
            if (!overlay || preparation) return;
            list.setAttribute('aria-busy', String(Boolean(controller.pending)));
            for (const control of list.querySelectorAll('.finder-result')) {
                const disabled = Boolean(controller.pending) || control.dataset.finderUnsafe === 'true';
                // Chrome blurs a disabled active button to the body, outside this
                // dialog's Escape/Tab handlers. Transfer only its owned focus
                // before disabling; later read outcomes never reclaim newer focus.
                if (disabled && document.activeElement === control) input.focus({ preventScroll: true });
                control.disabled = disabled;
            }
            alert.textContent = controller.pending ? t('finderPending') : '';
        }
        function filterChanged() {
            alert.textContent = '';
            if (options.getScope?.() === 'all' && preparation === 'loading') prepare();
            else render();
            updatePending();
        }
        function prepare() {
            const ownedOverlay = overlay, epoch = ++preparationEpoch;
            if (options.getScope?.() === 'all') controller.invalidate();
            else controller.cancelPending();
            preparation = options.prepareSnapshot ? 'loading' : null;
            render();
            if (!options.prepareSnapshot) return;
            const current = () => overlay === ownedOverlay && preparationEpoch === epoch;
            Promise.resolve().then(() => { if (current()) return options.prepareSnapshot(current); }).then(() => {
                if (!current()) return;
                preparation = null;
                if (!composing) render();
            }, () => {
                if (!current()) return;
                preparation = 'error'; render();
            });
        }
        function open() {
            if (overlay) { input.focus(); return; }
            composing = false;
            overlay = el('div', 'finder-overlay'); overlay.setAttribute('aria-hidden', 'true');
            const panel = el('section', 'finder-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
            const heading = el('h2', '', t('finderOpen')); heading.id = 'shortcut-finder-title'; panel.setAttribute('aria-labelledby', heading.id);
            const scope = el('p', 'finder-meta', t('finderScope')); scope.id = 'shortcut-finder-scope'; panel.setAttribute('aria-describedby', scope.id);
            let workspaceLabel, workspaceSelect, workspaceHint;
            if (options.setScope) {
                workspaceLabel = el('label', 'finder-label', t('finderWorkspaceScope')); workspaceLabel.htmlFor = 'shortcut-finder-workspaces';
                workspaceSelect = el('select', 'finder-workspace-scope'); workspaceSelect.id = 'shortcut-finder-workspaces';
                for (const [value, key] of [['current', 'finderCurrentWorkspace'], ['all', 'finderAllWorkspaces']]) {
                    const option = el('option', '', t(key)); option.value = value; workspaceSelect.append(option);
                }
                workspaceSelect.value = 'current';
                workspaceHint = el('p', 'finder-meta', t('finderAllWorkspaceHint')); workspaceHint.id = 'shortcut-finder-workspaces-hint';
                workspaceSelect.setAttribute('aria-describedby', workspaceHint.id);
                workspaceSelect.addEventListener('change', () => {
                    controller.clear(); categorySelect.value = ''; alert.textContent = '';
                    options.setScope(workspaceSelect.value); prepare();
                });
            }
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
            copyNotice = el('p', 'finder-copy-notice finder-meta'); copyNotice.setAttribute('role', 'status');
            list = el('ul', 'finder-list');
            previous = button(t('finderPrevious'), () => render(controller.page - 1));
            next = button(t('finderNext'), () => render(controller.page + 1));
            const actions = el('div', 'finder-actions');
            actions.append(button(t('finderClear'), () => { input.value = ''; categorySelect.value = ''; matchSelect.value = 'phrase'; filterChanged(); input.focus(); }), button(t('finderClose'), close));
            const pages = el('div', 'finder-actions'); pages.append(previous, next);
            panel.append(heading, scope);
            if (workspaceSelect) panel.append(workspaceLabel, workspaceSelect, workspaceHint);
            panel.append(label, input, matchLabel, matchSelect, matchHint, categoryLabel, categorySelect, categoryHint, actions, status, alert, copyNotice, list, pages); overlay.append(panel); document.body.append(overlay);
            matchSelect.addEventListener('change', filterChanged);
            categorySelect.addEventListener('change', filterChanged);
            input.addEventListener('input', () => { invalidateCopyReceipt(); alert.textContent = ''; if (!composing) filterChanged(); });
            input.addEventListener('compositionstart', () => {
                invalidateCopyReceipt(); composing = true; controller.cancelPending();
                if (options.getScope?.() === 'all' && preparation === 'loading') preparationEpoch++;
                updatePending();
            });
            input.addEventListener('compositionend', () => { composing = false; filterChanged(); });
            overlay.addEventListener('keydown', event => {
                if (event.isComposing || composing || event.keyCode === 229) {
                    // Prevent native result activation, without suppressing ordinary IME typing in the input.
                    if (event.target !== input && ['Enter', ' '].includes(event.key)) event.preventDefault();
                    event.stopImmediatePropagation(); return;
                }
                if (event.target.closest?.('.finder-copy-url') && (event.defaultPrevented || event.repeat) && ['Enter', ' '].includes(event.key)) { event.preventDefault(); return; }
                if (event.key === 'Enter' && event.repeat) { event.preventDefault(); return; }
                // Results use native buttons, not a synthetic Enter/Space handler.
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                const controls = Array.from(list.querySelectorAll('.finder-result')).filter(node => !node.disabled);
                const index = controls.indexOf(event.target);
                if ((event.target !== input && index < 0) || !controls.length) return;
                event.preventDefault();
                const target = event.target === input ? (event.key === 'ArrowDown' ? 0 : controls.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length;
                controls[target].focus();
            });
            prepare(); cleanup = root.LocalItabDialog.open(overlay, input, close); copyObserver?.takeRecords();
        }
        const unsubscribe = options.subscribe?.(() => {
            if (!overlay) return;
            invalidateCopyReceipt();
            if (options.getScope?.() === 'all') prepare();
            else if (!composing) render(controller.page);
        });
        return { get pending() { return Boolean(controller.pending); }, hasUncommittedWork: () => Boolean(overlay), refresh: () => { invalidateCopyReceipt(); if (overlay && !composing) render(controller.page); }, close, destroy() {
            destroyed = true; invalidateCopyReceipt(); renderEpoch++;
            copyObservers.delete(updateCopyPending); copyObserver?.disconnect();
            document.removeEventListener('visibilitychange', copyVisibilityChanged);
            root.removeEventListener?.('pagehide', copyPageHide);
            root.removeEventListener?.('pageshow', copyPageShow);
            document.body.removeEventListener('keydown', handleShortcut);
            document.body.removeEventListener('compositionstart', compositionStart);
            document.body.removeEventListener('compositionend', compositionEnd);
            document.body.removeEventListener('focusin', compositionFocus);
            close(); unsubscribe?.(); opener.remove();
        } };
    }
    api.mount = mount;
})(window);
