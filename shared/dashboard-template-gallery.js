/* Schematics select immediately in Settings; new-tab choices preview real content until Apply. */
(function (global) {
    'use strict';
    function mount(host, select, preview = null) {
        const registry = global.LocalItabTemplates;
        if (!host || !registry) return null;
        const doc = host.ownerDocument;
        const locale = global.chrome?.i18n?.getUILanguage?.() || doc.documentElement?.lang || 'en';
        const zh = /^zh(?:-|_|$)/i.test(locale);
        const details = doc.createElement('details');
        details.className = 'template-gallery';
        const summary = doc.createElement('summary');
        summary.textContent = zh ? `浏览 ${registry.all.length} 种布局` : `Browse ${registry.all.length} layouts`;
        const help = doc.createElement('p');
        help.className = 'template-gallery-help';
        help.textContent = preview ? (zh ? '点击模板可用当前内容临时试看；应用后才保存。取消、关闭或 Esc 会退出预览。背景、卡片和网站坐标保持不变。' : 'Choose a template to preview your current content. Apply saves it; Cancel, Close or Escape ends the preview. Backgrounds, cards and site positions stay unchanged.') : zh ? '示意图仅展示布局。点击模板即保存；浏览或收起不会修改设置。自定义背景、卡片和网站布局保持不变。' : 'Diagrams show layout only. Choose a template to save it; browsing or closing changes nothing. Custom backgrounds, cards and site placement stay unchanged.';
        const grid = doc.createElement('div');
        grid.className = 'template-gallery-grid';
        const buttons = new Map();
        for (const entry of registry.all) {
            const copy = registry.localize(entry.id, locale);
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'template-gallery-choice';
            button.dataset.templateChoice = entry.id;
            button.setAttribute('aria-pressed', 'false');
            const diagram = doc.createElement('span');
            diagram.className = 'template-gallery-diagram';
            diagram.dataset.composition = entry.composition;
            diagram.dataset.previewTemplate = entry.id;
            diagram.setAttribute('aria-hidden', 'true');
            for (const role of ['nav', 'header', 'search', 'links', 'cards']) {
                const part = doc.createElement('span');
                part.className = 'template-preview-' + role;
                if (role === 'links') for (let index = 0; index < 6; index++) part.appendChild(doc.createElement('i'));
                diagram.appendChild(part);
            }
            const name = doc.createElement('strong');
            name.textContent = copy.name;
            const description = doc.createElement('span');
            description.textContent = copy.description;
            button.append(diagram, name, description);
            button.addEventListener('click', () => select(entry.id));
            buttons.set(entry.id, button);
            grid.appendChild(button);
        }
        details.append(summary, help, grid);
        const actions = doc.createElement('div');
        actions.className = 'template-preview-actions';
        actions.hidden = true;
        const notice = doc.createElement('span');
        notice.tabIndex = -1; notice.setAttribute('role', 'status');
        notice.textContent = zh ? '临时预览 · 尚未保存' : 'Temporary preview · Not saved';
        const apply = doc.createElement('button'); apply.type = 'button';
        apply.className = 'template-preview-apply'; apply.textContent = zh ? '应用' : 'Apply';
        const cancel = doc.createElement('button'); cancel.type = 'button';
        cancel.className = 'template-preview-cancel'; cancel.textContent = zh ? '取消' : 'Cancel';
        const close = () => {
            void preview?.cancel();
            details.open = false;
            summary.focus();
        };
        if (preview) {
            apply.addEventListener('click', () => void preview.apply());
            cancel.addEventListener('click', () => void preview.cancel());
            const dismiss = doc.createElement('button'); dismiss.type = 'button';
            dismiss.className = 'template-preview-close'; dismiss.textContent = zh ? '关闭' : 'Close';
            dismiss.addEventListener('click', close);
            actions.append(notice, apply, cancel, dismiss);
            details.append(actions);
            summary.addEventListener('click', () => { if (details.open) void preview.cancel(); });
            details.addEventListener('toggle', () => { if (!details.open) void preview.cancel(); });
        }
        details.addEventListener('keydown', event => {
            // Respect the same IME/inner-control ownership as the outer preview listener.
            if (event.key !== 'Escape' || !details.open || event.defaultPrevented ||
                event.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            close();
        });
        host.appendChild(details);
        return { close, render(value, state = '') {
            const active = preview && ['preview', 'preview-loading', 'preview-saving', 'preview-restoring'].includes(state);
            // Initial admission disables the focused choice synchronously. Move
            // only that owned focus before disabling it; late reads never claim it.
            const ownedFocus = actions.contains(doc.activeElement) || (preview && state === 'preview-loading' &&
                [...buttons.values()].includes(doc.activeElement));
            actions.hidden = !active;
            details.dataset.livePreview = active ? 'true' : 'false';
            const busy = active && state !== 'preview';
            apply.disabled = busy;
            cancel.disabled = Boolean(busy);
            if (ownedFocus) { if (!active) summary.focus(); else if (busy) notice.focus(); }
            notice.textContent = state === 'preview-saving' ? (zh ? '正在应用…' : 'Applying…') :
                busy ? (zh ? '正在读取已保存外观…' : 'Reading saved appearance…') : (zh ? '临时预览 · 尚未保存' : 'Temporary preview · Not saved');
            for (const [id, button] of buttons) {
                button.setAttribute('aria-pressed', String(id === value.template));
                button.disabled = Boolean(busy);
            }
        } };
    }
    global.LocalItabTemplateGallery = { mount };
})(window);
