(function initCardLayout(global) {
    'use strict';
    const cards = [
        ['local-tasks-card', 'cardLayoutTasks', 'Tasks'], ['local-focus-card', 'cardLayoutFocus', 'Focus timer'],
        ['local-scratchpad-card', 'cardLayoutNotes', 'Scratchpad'], ['local-countdown-card', 'cardLayoutCountdown', 'Countdown'],
        ['world-clocks-card', 'cardLayoutClocks', 'World clocks'], ['weather-container', 'cardLayoutWeather', 'Weather'],
        ['hot-container', 'cardLayoutTopics', 'Hot topics'], ['movie-container', 'cardLayoutMovie', 'Movie']
    ];
    const ids = cards.map(([id]) => id);
    const tr = (key, fallback) => { const text = global.i18n?.t(key); return text && text !== key ? text : fallback; };
    const effectiveColumns = (columns, width) => width <= 620 ? 1 : width <= 1000 ? Math.min(2, columns ?? 3) : columns ?? 3;
    const effectiveSpan = (span, columns, width) => Math.min(span ?? 1, effectiveColumns(columns, width));
    // A missing mode preserves old backups and saved order-only grid layouts.
    const layoutMode = (value = {}) => value.cardColumns != null || value.cardSpans != null || value.cardLayoutMode === 'grid' ||
        (value.cardLayoutMode == null && value.cardOrder != null) ? 'grid' : 'template';
    function paint(value = {}) {
        const doc = global.document, dashboard = doc.getElementById('dashboard'), container = doc.getElementById('info-cards-container');
        if (!dashboard) return;
        const custom = layoutMode(value) === 'grid';
        dashboard.dataset.customCardLayout = String(custom);
        dashboard.style.setProperty('--card-layout-columns', String(value.cardColumns ?? 3));
        if (!container) return;
        const ordered = (value.cardOrder ?? ids).map(id => doc.getElementById(id)).filter(node => node?.parentElement === container);
        // Move existing nodes, never recreate module views or their unsaved content.
        // State-preserving moveBefore is preferred; restore focus in older Chromium.
        const active = doc.activeElement, focused = container.contains(active);
        const selection = focused && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null;
        const current = [...container.children].filter(node => ids.includes(node.id));
        if (ordered.some((node, i) => node !== current[i])) {
            for (const node of ordered) {
                if (typeof container.moveBefore === 'function') container.moveBefore(node, null);
                else container.appendChild(node);
            }
            if (focused && doc.activeElement !== active) {
                active.focus({ preventScroll: true });
                if (selection && typeof active.setSelectionRange === 'function') active.setSelectionRange(...selection);
            }
        }
        for (const node of ordered) node.style.setProperty('--card-layout-span', String(value.cardSpans?.[node.id] ?? 1));
    }
    function mount(host, change) {
        const doc = host.ownerDocument;
        const section = doc.createElement('section'); section.className = 'card-layout-editor';
        const heading = doc.createElement('h3'); heading.textContent = tr('cardLayoutHeading', 'Card order and width');
        const hint = doc.createElement('p'); hint.textContent = tr('cardLayoutHint', "Move cards earlier or later without changing visibility. Template mode keeps the selected structure; custom widths or columns use a grid below shortcuts. The live dashboard previews your changes before Save.");
        const modeLabel = doc.createElement('label'); modeLabel.className = 'customize-field';
        const modeTitle = doc.createElement('span'); modeTitle.textContent = tr('cardLayoutMode', 'Card layout');
        const modeSelect = doc.createElement('select'); modeSelect.dataset.cardLayoutMode = '';
        for (const [value, key, fallback] of [['template', 'cardLayoutTemplate', 'Keep template structure'], ['grid', 'cardLayoutGrid', 'Custom grid below shortcuts']]) {
            const option = doc.createElement('option'); option.value = value; option.textContent = tr(key, fallback); modeSelect.append(option);
        }
        modeSelect.addEventListener('change', () => { if (!pending) change('cardLayoutMode', modeSelect.value); });
        modeLabel.append(modeTitle, modeSelect);
        const modeNote = doc.createElement('p'); modeNote.className = 'card-layout-mode-note'; modeNote.setAttribute('aria-live', 'polite');
        const diagram = doc.createElement('div'); diagram.className = 'card-layout-diagram';
        const shortcuts = doc.createElement('div'); shortcuts.className = 'card-layout-shortcuts'; shortcuts.textContent = tr('cardLayoutShortcuts', 'Shortcuts');
        const list = doc.createElement('div'); list.className = 'card-layout-list';
        const preview = doc.createElement('div'); preview.className = 'card-layout-preview';
        preview.setAttribute('aria-label', tr('cardLayoutPreview', 'Card order preview including hidden cards'));
        const rows = new Map(); let draft = {}, pending = false;
        for (const [id, key, fallback] of cards) {
            const name = tr(key, fallback), row = doc.createElement('div'); row.className = 'card-layout-row'; row.dataset.cardLayoutId = id;
            const title = doc.createElement('span'); title.className = 'card-layout-name'; title.textContent = name;
            const up = doc.createElement('button'), down = doc.createElement('button');
            for (const [button, labelKey, fallbackText, delta] of [[up, 'cardLayoutEarlier', 'Move earlier', -1], [down, 'cardLayoutLater', 'Move later', 1]]) {
                button.type = 'button'; button.textContent = delta < 0 ? '↑' : '↓'; button.setAttribute('aria-label', `${name}: ${tr(labelKey, fallbackText)}`);
                button.addEventListener('click', () => {
                    if (pending) return;
                    const order = [...(draft.cardOrder ?? ids)], index = order.indexOf(id), target = index + delta;
                    if (target < 0 || target >= order.length) return;
                    [order[index], order[target]] = [order[target], order[index]]; change('cardOrder', order);
                });
            }
            const label = doc.createElement('label'), width = doc.createElement('span'), select = doc.createElement('select');
            width.textContent = tr('cardLayoutWidth', 'Width'); select.dataset.cardSpan = id;
            select.setAttribute('aria-label', `${name}: ${tr('cardLayoutWidth', 'Width')}`);
            for (const value of ['', '1', '2', '3', '4']) {
                const option = doc.createElement('option'); option.value = value;
                option.textContent = value ? `${value} ${tr('cardLayoutColumnsUnit', 'column(s)')}` : tr('cardLayoutDefault', 'Default'); select.append(option);
            }
            select.addEventListener('change', () => {
                if (pending) return;
                const spans = { ...(draft.cardSpans ?? {}) };
                if (select.value === '') delete spans[id]; else spans[id] = Number(select.value);
                change('cardSpans', Object.keys(spans).length ? spans : null);
            });
            label.append(width, select); row.append(title, up, down, label); list.append(row); rows.set(id, { row, title, up, down, select, name });
        }
        const reset = doc.createElement('button'); reset.type = 'button'; reset.className = 'card-layout-reset'; reset.textContent = tr('cardLayoutReset', 'Restore card order and widths');
        reset.addEventListener('click', () => { if (!pending) { change('cardOrder', null); change('cardSpans', null); change('cardLayoutMode', null); } });
        diagram.append(shortcuts, preview); section.append(heading, hint, modeLabel, modeNote, diagram, list, reset); host.append(section);
        return { render(value, saving) {
            draft = value; pending = saving;
            const order = value.cardOrder ?? ids;
            const mode = layoutMode(value);
            modeSelect.value = mode; modeSelect.disabled = saving;
            diagram.dataset.layoutMode = mode;
            diagram.dataset.template = doc.documentElement.dataset.dashboardTemplate || 'clarity';
            modeNote.textContent = mode === 'template'
                ? tr('cardLayoutTemplateNote', 'Order changes keep the selected template’s structure. Choosing widths or columns switches to grid. Returning here clears custom widths and columns; order is kept. Preview includes hidden cards; visibility is unchanged.')
                : tr('cardLayoutGridNote', 'Custom grid: cards sit below shortcuts. Choosing template structure clears custom widths and columns but keeps order. Widths clamp to available columns (at most 2 on medium screens, 1 on phones). Preview includes hidden cards; visibility is unchanged.');
            preview.style.setProperty('--card-layout-columns', String(value.cardColumns ?? 3));
            preview.replaceChildren(...order.map(id => {
                const tile = doc.createElement('div'); tile.textContent = rows.get(id).name;
                tile.style.setProperty('--card-layout-span', String(value.cardSpans?.[id] ?? 1));
                return tile;
            }));
            // Keep focused editor controls attached; numbered positions describe
            // the live card order without rebuilding or reordering this form.
            for (const [id, entry] of rows) {
                const index = order.indexOf(id);
                entry.title.textContent = `${index + 1}. ${entry.name}`;
                // Boundary arrows remain focusable: disabling the focused arrow
                // would strand keyboard focus outside the modal in Chromium.
                entry.up.disabled = entry.down.disabled = saving;
                entry.up.setAttribute('aria-disabled', String(saving || index === 0));
                entry.down.setAttribute('aria-disabled', String(saving || index === ids.length - 1));
                entry.select.disabled = saving; entry.select.value = value.cardSpans?.[id] == null ? '' : String(value.cardSpans[id]);
            }
            reset.disabled = saving;
        } };
    }
    global.LocalItabCardLayout = { ids, paint, mount, effectiveColumns, effectiveSpan, layoutMode };
})(window);
