/* Native links open existing library pages in a new tab, preserving current edits. */
(function (root) {
    'use strict';
    const labels = {
        Open: 'Search AI library', Scope: 'Current saved prompts and AI excerpts · on this device · opens in a new tab',
        Query: 'Search title, body or tags', Filter: 'Record type', All: 'All types', Prompt: 'Prompt', Collection: 'AI excerpt',
        Loading: 'Reading current saved libraries…', Empty: 'No saved items in this scope.', None: 'No matching saved items.',
        PromptError: 'Prompt library unavailable. Try reading again.', CollectionError: 'AI collection unavailable. Try reading again.',
        Unavailable: 'Both libraries are unavailable. Try reading again.', Partial: 'Only available libraries are shown.', Retry: 'Read again', Clear: 'Clear', Close: 'Close', Results: 'Results',
        Body: 'Body', Title: 'Title', Tags: 'Tags', Invalid: 'This record link is invalid. Choose a saved item from the list.',
        Missing: 'This saved record is no longer available. Nothing else was selected.', Archived: 'This record is archived. Open Archived / Trash to review it.'
    };
    const t = name => { const key = `aiSearch${name}`, value = root.i18n?.t(key); return value && value !== key ? value : labels[name]; };
    function mount(host, stores) {
        const doc = host.ownerDocument;
        const el = (tag, className, text) => { const node = doc.createElement(tag); node.className = className || ''; if (text !== undefined) node.textContent = text; return node; };
        let overlay, input, filter, list, status, errors, cleanup, controller, composing = false, destroyed = false;
        // Keep navigation context only for this mounted page; never store private queries.
        let retainedQuery = '', retainedFilter = 'all';
        const button = (name, action) => {
            const owner = overlay, node = el('button', 'finder-button', t(name)); node.type = 'button';
            node.addEventListener('click', event => { if (!destroyed && node.isConnected && (!owner || owner === overlay)) action(event); });
            return node;
        };
        const opener = button('Open', open); opener.className = 'prompt-library-entry'; opener.setAttribute('aria-haspopup', 'dialog'); host.append(opener);
        function render() {
            if (!overlay) return;
            const hadFocus = list.contains(doc.activeElement) || errors.contains(doc.activeElement);
            list.replaceChildren(); errors.replaceChildren();
            const failed = Object.keys(controller.errors);
            for (const type of failed) errors.append(el('p', 'finder-alert', t(type === 'prompt' ? 'PromptError' : 'CollectionError')));
            if (failed.length) errors.append(button('Retry', () => void controller.refresh()));
            const rows = controller.results(input.value, filter.value);
            status.textContent = controller.loading ? t('Loading') : rows.length ? `${t('Results')}: ${rows.length}${failed.length ? ` · ${t('Partial')}` : ''}` : failed.length ? t(failed.length === 2 ? 'Unavailable' : 'Partial') : t(input.value.trim() ? 'None' : 'Empty');
            list.setAttribute('aria-busy', String(controller.loading));
            for (const row of rows) {
                const item = el('li'), link = el('a', 'finder-button finder-result ai-search-result');
                link.href = row.href; link.target = '_blank'; link.rel = 'noopener';
                link.append(el('span', 'finder-meta', `${t(row.type === 'prompt' ? 'Prompt' : 'Collection')} · ${t(row.field[0].toUpperCase() + row.field.slice(1))}`), el('span', 'finder-title', row.title), el('span', 'finder-url ai-search-snippet', row.snippet));
                const owner = controller;
                link.addEventListener('click', event => { if (composing || !overlay || !link.isConnected || owner !== controller || !owner.current(row)) event.preventDefault(); });
                item.append(link); list.append(item);
            }
            if (hadFocus) input.focus();
        }
        function close() {
            if (!overlay) return;
            retainedQuery = input.value; retainedFilter = filter.value;
            controller.dispose(); const old = overlay; overlay = null; composing = false; cleanup?.(); cleanup = null; old.remove();
        }
        function open() {
            if (destroyed) return;
            if (overlay) { input.focus(); return; }
            overlay = el('div', 'finder-overlay ai-search-overlay');
            const panel = el('section', 'finder-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'ai-search-title');
            const title = el('h2', '', t('Open')); title.id = 'ai-search-title';
            const scope = el('p', 'finder-meta', t('Scope')); scope.id = 'ai-search-scope'; panel.setAttribute('aria-describedby', scope.id);
            const label = el('label', 'finder-label', t('Query')); label.htmlFor = 'ai-search-query';
            input = el('input', 'finder-input'); input.id = 'ai-search-query'; input.type = 'search'; input.maxLength = 500; input.autocomplete = 'off'; input.spellcheck = false; input.value = retainedQuery;
            const filterLabel = el('label', 'finder-label', t('Filter')); filterLabel.htmlFor = 'ai-search-filter';
            filter = el('select', 'finder-input'); filter.id = 'ai-search-filter';
            for (const [value, name] of [['all', 'All'], ['prompt', 'Prompt'], ['collection', 'Collection']]) { const option = el('option', '', t(name)); option.value = value; filter.append(option); } filter.value = retainedFilter;
            const actions = el('div', 'finder-actions'); actions.append(button('Clear', () => { input.value = ''; render(); input.focus(); }), button('Close', close));
            status = el('p', 'finder-meta'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            errors = el('div'); errors.setAttribute('role', 'status'); list = el('ul', 'finder-list');
            panel.append(title, scope, label, input, filterLabel, filter, actions, status, errors, list); overlay.append(panel); doc.body.append(overlay);
            controller = new root.LocalItabAISearch.Controller({ stores, onChange: render });
            const currentOverlay = overlay, active = () => !destroyed && overlay === currentOverlay;
            input.addEventListener('input', () => { if (active() && !composing) render(); }); filter.addEventListener('change', () => { if (active()) render(); });
            input.addEventListener('compositionstart', () => { if (active()) composing = true; }); input.addEventListener('compositionend', () => { if (active()) { composing = false; render(); } });
            input.addEventListener('focusout', () => { if (active() && composing) { composing = false; render(); } });
            overlay.addEventListener('keydown', event => {
                if (!active()) return;
                if (composing || event.isComposing || event.keyCode === 229) { if (event.target !== input && ['Enter', ' '].includes(event.key)) event.preventDefault(); event.stopImmediatePropagation(); return; }
                if (event.key === 'Enter' && event.repeat) { event.preventDefault(); return; }
                if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
                const links = Array.from(list.querySelectorAll('a')), index = links.indexOf(event.target);
                if (!links.length || (event.target !== input && index < 0)) return;
                event.preventDefault(); links[event.target === input ? (event.key === 'ArrowDown' ? 0 : links.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length].focus();
            });
            cleanup = root.LocalItabDialog.open(overlay, input, close); void controller.start();
        }
        return { open, close, destroy() { close(); destroyed = true; retainedQuery = ''; retainedFilter = 'all'; opener.remove(); } };
    }
    function showTargetError(controller, view) {
        if (!controller.navigationError || !['invalid', 'missing', 'archived'].includes(controller.navigationError)) return false;
        const message = view.el('p', 'prompt-conflict', t(controller.navigationError[0].toUpperCase() + controller.navigationError.slice(1)));
        message.setAttribute('role', 'status'); view.main.append(message); return true;
    }
    root.LocalItabAISearchView = { mount, showTargetError };
})(window);
