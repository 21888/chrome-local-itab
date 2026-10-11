/* Local schematic previews. Browsing never changes preferences; buttons use the existing controller. */
(function (global) {
    'use strict';
    function mount(host, select) {
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
        help.textContent = zh ? '示意图仅展示布局。点击模板即保存；浏览或收起不会修改设置。自定义背景、卡片和网站布局保持不变。' : 'Diagrams show layout only. Choose a template to save it; browsing or closing changes nothing. Custom backgrounds, cards and site placement stay unchanged.';
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
        details.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !details.open) return;
            event.preventDefault();
            details.open = false;
            summary.focus();
        });
        host.appendChild(details);
        return { render(value) {
            for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === value.template));
        } };
    }
    global.LocalItabTemplateGallery = { mount };
})(window);
