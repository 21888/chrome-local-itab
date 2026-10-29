(function initDashboardCustomization(global) {
    'use strict';
    const tr = (key, fallback) => { const value = global.i18n?.t(key); return value && value !== key ? value : fallback; };
    let saved = {}, previewing = false;
    const editors = new Set();

    function paint(value = {}) {
        global.LocalItabCardLayout?.paint(value);
        const root = global.document.documentElement;
        const dashboard = global.document.getElementById('dashboard');
        const customBackground = ['solid', 'gradient'].includes(value.backgroundMode);
        root.dataset.customBackground = customBackground ? 'true' : 'false';
        root.style.setProperty('--custom-background', value.backgroundMode === 'gradient'
            ? `linear-gradient(${value.backgroundAngle}deg, ${value.backgroundStart}, ${value.backgroundEnd})`
            : value.backgroundStart || '#edf2ef');
        for (const [key, suffix, unit] of [['cardPadding', 'padding', 'px'], ['cardGap', 'gap', 'px'], ['cardRadius', 'radius', 'px'], ['cardOpacity', 'opacity', '%'], ['cardColumns', 'columns', '']]) {
            if (value[key] != null) root.style.setProperty(`--custom-card-${suffix}`, `${value[key]}${unit}`);
            else root.style.removeProperty(`--custom-card-${suffix}`);
            if (dashboard) dashboard.dataset[`custom${key[0].toUpperCase()}${key.slice(1)}`] = value[key] == null ? 'false' : 'true';
        }
    }
    function apply(value) {
        saved = { ...value };
        if (!previewing) paint(saved);
    }

    class Controller {
        constructor({ storage, baseline, initial, render = () => {}, onSaved = () => {} }) {
            this.storage = storage;
            this.baseline = { generation: baseline?.generation, customization: storage.validateDashboardCustomization(initial) };
            this.original = { ...this.baseline.customization };
            this.draft = { ...this.original };
            this.render = render;
            this.onSaved = onSaved;
            this.pending = false;
            this.closed = false;
            previewing = true;
            this.update();
        }
        update(message = '') { paint(this.draft); this.render(this.draft, this.pending, message); }
        change(key, value) {
            if (this.pending || this.closed) return;
            try {
                const patch = { [key]: value };
                if (key === 'cardLayoutMode' && value === 'template') Object.assign(patch, { cardSpans: null, cardColumns: null });
                if (['cardColumns', 'cardSpans'].includes(key) && value !== null) patch.cardLayoutMode = 'grid';
                // Only a new, previously uncustomized order opts into template geometry.
                // Missing/null mode on saved overrides retains the legacy grid.
                if (key === 'cardOrder' && value !== null && this.draft.cardLayoutMode == null &&
                    this.draft.cardOrder == null && this.draft.cardSpans == null && this.draft.cardColumns == null) patch.cardLayoutMode = 'template';
                this.draft = this.storage.validateDashboardCustomization({ ...this.draft, ...patch }); this.update();
            }
            catch (_) { this.render(this.draft, false, tr('customizeInvalid', 'Use a valid color or a number within the shown range.')); }
        }
        reset() {
            if (this.pending || this.closed) return;
            this.draft = this.storage.validateDashboardCustomization();
            this.update();
        }
        cancel() {
            if (this.pending || this.closed) return false;
            this.closed = true; previewing = false; paint(saved); return true;
        }
        async save() {
            if (this.pending || this.closed) return false;
            const patch = Object.fromEntries(Object.entries(this.draft).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(this.original[key])));
            this.pending = true; this.update(tr('appearanceSaving', 'Saving…'));
            try {
                const result = await this.storage.patchDashboardCustomization(patch, this.baseline);
                saved = { ...result.customization };
                this.closed = true; previewing = false; paint(saved);
                this.onSaved(result);
                return true;
            } catch (error) {
                this.pending = false;
                this.update(error.code?.startsWith('APPEARANCE_') ? tr('customizeConflict', 'Saved settings changed or could not be safely read. Your preview is kept. Cancel and reopen to use the latest settings.') : tr('customizeSaveFailed', 'Could not save. Your preview is kept. Try again or cancel.'));
                return false;
            }
        }
    }

    function mount(host, { storage, baseline, refresh, canOpen = () => true }) {
        if (!host || !global.LocalItabDialog) return;
        const doc = host.ownerDocument;
        const launch = doc.createElement('button'); launch.type = 'button'; launch.className = 'customize-launch';
        launch.textContent = tr('customizeDashboard', 'Customize'); host.append(launch);
        let open = false;
        launch.addEventListener('click', async () => {
            if (open || !canOpen()) return;
            open = true;
            // Read before opening, without rebasing the settings generation fence.
            let initial;
            try { initial = await storage.getAppearanceForUpdate(); }
            catch (_) { open = false; launch.textContent = tr('customizeReadFailed', 'Could not read settings. Try again.'); return; }
            if (!canOpen()) { open = false; return; }
            apply(initial.customization);
            const overlay = doc.createElement('div'); overlay.className = 'customize-overlay';
            const panel = doc.createElement('section'); panel.className = 'customize-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'customize-heading');
            const heading = doc.createElement('h2'); heading.id = 'customize-heading'; heading.textContent = tr('customizeHeading', 'Make this workspace yours');
            const note = doc.createElement('p'); note.textContent = tr('customizePreviewNote', 'Live preview only. Save to keep your changes, or Cancel to return to your saved look.');
            panel.append(heading, note);
            const sample = doc.createElement('div'); sample.className = 'customize-sample'; sample.setAttribute('aria-label', tr('customizeSample', 'Style preview with sample cards'));
            for (const [key, text] of [['customizeSampleOne', 'Today'], ['customizeSampleTwo', 'My notes'], ['customizeSampleThree', 'Focus']]) {
                const card = doc.createElement('div'); card.textContent = tr(key, text); sample.append(card);
            }
            panel.append(sample);
            const fields = doc.createElement('div'); fields.className = 'customize-fields'; panel.append(fields);
            const controls = {}, colorTexts = {}, colorErrors = {};
            const invalid = new Set();
            const labels = [
                ['backgroundMode', 'customizeBackground', 'Background', [['template', 'customizeUseSaved', 'Use saved background'], ['solid', 'customizeSolid', 'Solid color'], ['gradient', 'customizeGradient', 'Two-color gradient']]],
                ['backgroundStart', 'customizeColorStart', 'First color', 'color'],
                ['backgroundEnd', 'customizeColorEnd', 'Second color', 'color'],
                ['backgroundAngle', 'customizeAngle', 'Gradient angle (0–360°)', 'number', 0, 360],
                ['cardPadding', 'customizePadding', 'Card padding (8–32 px)', 'number', 8, 32],
                ['cardGap', 'customizeGap', 'Card spacing (0–40 px)', 'number', 0, 40],
                ['cardRadius', 'customizeRadius', 'Card corners (0–32 px)', 'number', 0, 32],
                ['cardOpacity', 'customizeOpacity', 'Card background opacity (40–100%)', 'number', 40, 100],
                ['cardColumns', 'customizeColumns', 'Grid columns (1–4; switches to grid)', 'number', 1, 4]
            ];
            for (const [key, labelKey, fallback, type, min, max] of labels) {
                const label = doc.createElement('label'); label.className = 'customize-field';
                const title = doc.createElement('span'); title.textContent = tr(labelKey, fallback);
                const input = doc.createElement(Array.isArray(type) ? 'select' : 'input'); input.dataset.customizeField = key;
                if (Array.isArray(type)) for (const [value, optionKey, text] of type) {
                    const option = doc.createElement('option'); option.value = value; option.textContent = tr(optionKey, text); input.append(option);
                } else { input.type = type; if (type === 'number') { input.min = String(min); input.max = String(max); input.step = '1'; input.placeholder = tr('customizeAuto', 'Template default'); } }
                label.append(title, input); controls[key] = input;
                if (type === 'color') {
                    // Separate labels keep both native picker and exact text entry accessible.
                    const group = doc.createElement('div'); group.className = 'customize-color-field';
                    const textLabel = doc.createElement('label'); textLabel.className = 'customize-field';
                    const textTitle = doc.createElement('span'); textTitle.textContent = `${tr(labelKey, fallback)} ${tr('customizeHexLabel', '(hex)')}`;
                    const text = doc.createElement('input'); text.type = 'text'; text.dataset.customizeHex = key;
                    text.placeholder = '#RRGGBB'; text.autocomplete = 'off'; text.spellcheck = false;
                    const error = doc.createElement('span'); error.id = `customize-${key}-error`; error.className = 'customize-color-error';
                    text.setAttribute('aria-describedby', error.id); text.setAttribute('aria-invalid', 'false');
                    textLabel.append(textTitle, text); group.append(label, textLabel, error); fields.append(group);
                    colorTexts[key] = text; colorErrors[key] = error;
                } else fields.append(label);
            }
            let editor, focusBeforePending = null;
            panel.tabIndex = -1;
            const cardLayout = global.LocalItabCardLayout?.mount(panel, (key, value) => {
                if (key === 'cardLayoutMode' && value === 'template') {
                    invalid.delete('cardColumns'); controls.cardColumns.setAttribute('aria-invalid', 'false');
                }
                editor?.change(key, value);
            });
            const hint = doc.createElement('p'); hint.className = 'customize-hint';
            hint.textContent = tr('customizeLayoutHint', "Blank style values follow the template. Choosing widths or columns places information cards below shortcuts in grid mode. Order-only customization can keep the template structure. Over custom backgrounds, card opacity blends with a contrast-safe panel behind the cards. Free-placement shortcuts keep their positions.");
            const more = doc.createElement('a'); more.textContent = tr('customizeShortcutSettings', 'Shortcut size, shortcuts per row and visibility →');
            more.href = global.LocalItabWorkspacesView?.settingsUrl(global.LocalItabWorkspaces?.session?.id, 'layout-settings') || 'options.html#layout-settings';
            more.target = '_blank'; more.rel = 'noopener';
            const status = doc.createElement('p'); status.className = 'customize-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
            const actions = doc.createElement('div'); actions.className = 'customize-actions';
            const reset = doc.createElement('button'); reset.type = 'button'; reset.textContent = tr('customizeReset', 'Reset preview');
            const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = tr('cancel', 'Cancel');
            const save = doc.createElement('button'); save.type = 'button'; save.className = 'customize-save'; save.textContent = tr('save', 'Save');
            actions.append(reset, cancel, save); panel.append(hint, more, status, actions); overlay.append(panel); doc.body.append(overlay);
            editor = new Controller({ storage, baseline, initial: initial.customization, onSaved: () => refresh(), render(value, pending, message) {
                if (pending && !focusBeforePending) focusBeforePending = doc.activeElement;
                cardLayout?.render(value, pending);
                for (const [key, control] of Object.entries(controls)) { if (!invalid.has(key)) control.value = value[key] == null ? '' : String(value[key]); control.disabled = pending; }
                controls.backgroundStart.disabled = pending || value.backgroundMode === 'template';
                controls.backgroundEnd.disabled = controls.backgroundAngle.disabled = pending || value.backgroundMode !== 'gradient';
                for (const [key, text] of Object.entries(colorTexts)) {
                    if (!invalid.has(key)) text.value = value[key];
                    text.disabled = controls[key].disabled;
                }
                sample.style.background = value.backgroundMode === 'gradient' ? `linear-gradient(${value.backgroundAngle}deg, ${value.backgroundStart}, ${value.backgroundEnd})` : value.backgroundMode === 'solid' ? value.backgroundStart : 'var(--template-page)';
                sample.style.gap = `${value.cardGap ?? 12}px`;
                sample.style.gridTemplateColumns = `repeat(${value.cardColumns ?? 3}, minmax(0, 1fr))`;
                for (const card of sample.children) {
                    card.style.padding = `${value.cardPadding ?? 16}px 6px`;
                    card.style.borderRadius = `${value.cardRadius ?? 10}px`;
                    card.style.background = `color-mix(in srgb, var(--template-surface) ${value.cardOpacity ?? 100}%, transparent)`;
                }
                reset.disabled = cancel.disabled = pending; save.disabled = pending || invalid.size > 0;
                status.textContent = message || (invalid.size ? tr('customizeInvalid', 'Use a valid color or a number within the shown range.') : ''); panel.setAttribute('aria-busy', String(pending));
                // Disabled Save/card controls can send native focus to body.
                // Keep pending/error keyboard events inside this dialog.
                if (pending) panel.focus({ preventScroll: true });
                else if (focusBeforePending) { focusBeforePending.focus({ preventScroll: true }); focusBeforePending = null; }
            } });
            // Own raw invalid input as well as validated preview changes. The
            // lifecycle may defer departure, but never saves this dialog for us.
            const lifecycle = {
                pending: () => !editor.closed && editor.pending,
                dirty: () => !editor.closed && (editor.pending || invalid.size > 0 ||
                    Object.keys(editor.draft).some(key => JSON.stringify(editor.draft[key]) !== JSON.stringify(editor.original[key])))
            };
            editors.add(lifecycle);
            const finish = () => { editors.delete(lifecycle); cleanup(); overlay.remove(); open = false; launch.textContent = tr('customizeDashboard', 'Customize'); };
            const close = () => { if (editor.cancel()) finish(); };
            const cleanup = global.LocalItabDialog.open(overlay, controls.backgroundMode, close);
            for (const [key, control] of Object.entries(controls)) control.addEventListener('input', () => {
                if (control.disabled || editor.pending || editor.closed) return;
                // Keep invalid intermediate number input visible; never save it silently.
                if (control.type === 'number' && (control.validity?.badInput || (control.value !== '' && (!Number.isInteger(Number(control.value)) || Number(control.value) < Number(control.min) || Number(control.value) > Number(control.max))))) {
                    invalid.add(key); control.setAttribute('aria-invalid', 'true'); save.disabled = true; status.textContent = tr('customizeInvalid', 'Use a valid color or a number within the shown range.'); return;
                }
                if (key === 'backgroundMode') {
                    // Hidden-by-mode drafts must not trap Save behind disabled fields.
                    // The controller still holds each field's last validated value.
                    const inactive = control.value === 'template' ? ['backgroundStart', 'backgroundEnd', 'backgroundAngle']
                        : control.value === 'solid' ? ['backgroundEnd', 'backgroundAngle'] : [];
                    for (const field of inactive) {
                        invalid.delete(field); controls[field].setAttribute('aria-invalid', 'false');
                        if (colorTexts[field]) { colorTexts[field].setAttribute('aria-invalid', 'false'); colorErrors[field].textContent = ''; }
                    }
                }
                invalid.delete(key); control.setAttribute('aria-invalid', 'false');
                if (colorTexts[key]) { colorTexts[key].setAttribute('aria-invalid', 'false'); colorErrors[key].textContent = ''; }
                editor.change(key, control.type === 'number' ? (control.value === '' ? (key === 'backgroundAngle' ? 135 : null) : Number(control.value)) : control.value);
            });
            for (const [key, text] of Object.entries(colorTexts)) text.addEventListener('input', () => {
                if (text.disabled || editor.pending || editor.closed) return;
                // Incomplete typing/pastes remain visible, never entering preview or storage.
                if (text.value.length !== 7 || !/^#[0-9a-fA-F]{6}$/.test(text.value)) {
                    invalid.add(key); text.setAttribute('aria-invalid', 'true'); save.disabled = true;
                    colorErrors[key].textContent = tr('customizeHexInvalid', 'Enter # followed by 6 hexadecimal digits (0–9, A–F), for example #336699.');
                    status.textContent = colorErrors[key].textContent; return;
                }
                invalid.delete(key); text.setAttribute('aria-invalid', 'false'); colorErrors[key].textContent = '';
                editor.change(key, text.value);
            });
            reset.addEventListener('click', () => {
                if (editor.pending || editor.closed) return;
                invalid.clear();
                for (const control of [...Object.values(controls), ...Object.values(colorTexts)]) control.setAttribute('aria-invalid', 'false');
                for (const error of Object.values(colorErrors)) error.textContent = '';
                editor.reset();
            }); cancel.addEventListener('click', close);
            save.addEventListener('click', async () => { if (!invalid.size && await editor.save()) finish(); });
            overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        });
        return launch;
    }
    global.LocalItabCustomization = { apply, paint, Controller, mount, get isPreviewing() { return previewing; },
        get pending() { return [...editors].some(editor => editor.pending()); },
        hasUncommittedWork: () => [...editors].some(editor => editor.dirty()) };
})(window);
