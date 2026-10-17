(function (root) {
    'use strict';
    const MAX_BYTES = 10 * 1024 * 1024;
    const SITE_PAGE_SIZE = 50;
    let nextId = 0;
    const messages = {
        en: {
            title: 'Import browser bookmarks', choose: 'Choose bookmark HTML file',
            help: 'Choose a browser-exported Netscape bookmark HTML file (up to 10 MiB). Review first, then add new sites and categories. Existing sites are kept.',
            local: 'The file is read on this device. Its HTML is never rendered, and preview does not contact the imported sites.',
            review: 'Review bookmark import', reading: 'Reading and checking the local file…', ready: 'Review the counts, folder mapping and privacy settings before applying.',
            encountered: 'Bookmarks in file', added: 'New sites', skipped: 'Skipped bookmarks', categories: 'New categories',
            reasons: 'Why bookmarks were skipped', mapping: 'Source folder → new category', root: 'Top-level bookmarks',
            sites: 'Sites to be added ({total})', sitesPrivacy: 'URLs may contain private parameters. Expand this list only when you want to review them.',
            sitesRange: 'Showing {start}–{end} of {total}', sitesPrevious: 'Previous 50', sitesNext: 'Next 50', siteCategory: 'Category',
            duplicate_url: 'Already saved or repeated URL', invalid_url: 'Unsupported or invalid URL', invalid_title: 'Invalid title', duplicate_href_attribute: 'Ambiguous duplicate HREF attribute',
            noneSkipped: 'No bookmarks skipped.', noNew: 'No new sites to import. Nothing will be changed.',
            privacy: 'Privacy settings at preview time', sync: 'Chrome Sync', icons: 'Online site icons', on: 'On', off: 'Off', unknown: 'Unknown',
            disclosure: 'If Chrome Sync is already enabled, imported links may be uploaded to Chrome Sync. If online site icons are enabled, displaying imported sites may request icons from third-party services. This import does not change either setting; both are checked again before saving.',
            apply: 'Add these bookmarks', cancel: 'Cancel', cancelled: 'Import preview cancelled. Nothing was added.',
            applying: 'Saving bookmarks… This save is in progress and cannot be cancelled here.', saved: 'Bookmarks added',
            size: 'Choose a bookmark HTML file no larger than 10 MiB. Nothing was added.',
            file: 'Could not read this local file. Choose it again to retry. Nothing was added.',
            invalid: 'This file could not be imported safely. Export bookmarks as HTML from your browser and try again. Nothing was added.',
            limit: 'This file exceeds a supported import limit. Export a smaller selection of bookmarks and try again. Nothing was added.',
            conflict: 'Saved sites, categories or privacy settings changed. Choose the file again to review a fresh preview. Nothing was added by this attempt.',
            dirty: 'Save your current settings edits and wait for any settings changes to finish, then choose the bookmark file again. Nothing was added.',
            storage: 'Current settings could not be read or updated safely. Check the saved settings and storage availability, then choose the file again. Nothing was added by this attempt.',
            read: 'Could not read the current settings safely. Choose the file again when storage is available. Nothing was added.',
            uncertain: 'Could not confirm the save. Some bookmarks may have been added. Check your saved sites, then choose the file again for a fresh preview. This save will not be retried automatically.'
        },
        zh: {
            title: '导入浏览器书签', choose: '选择书签 HTML 文件',
            help: '选择浏览器导出的 Netscape 书签 HTML 文件（最大 10 MiB）。先预览，再添加新网站和分类；现有网站会保留。',
            local: '文件仅在本机读取。不会渲染文件中的 HTML，预览也不会访问导入的网站。',
            review: '预览书签导入', reading: '正在读取并检查本地文件…', ready: '请核对数量、文件夹对应关系及隐私设置，再确认添加。',
            encountered: '文件中的书签', added: '新增网站', skipped: '跳过的书签', categories: '新增分类',
            reasons: '跳过原因', mapping: '原文件夹 → 新分类', root: '顶层书签',
            sites: '将新增的网站（{total}）', sitesPrivacy: '网址可能含有私人参数，请在需要核对时展开清单。',
            sitesRange: '第 {start}–{end} 条 / 共 {total} 条', sitesPrevious: '上一页（50 条）', sitesNext: '下一页（50 条）', siteCategory: '目标分类',
            duplicate_url: '已保存或重复的网址', invalid_url: '不支持或无效的网址', invalid_title: '无效的标题', duplicate_href_attribute: '存在多个 HREF 属性，网址不明确',
            noneSkipped: '没有跳过的书签。', noNew: '没有可新增的网站，不会更改任何内容。',
            privacy: '预览时的隐私设置', sync: 'Chrome 同步', icons: '在线网站图标', on: '已开启', off: '已关闭', unknown: '未知',
            disclosure: '如果 Chrome 同步已开启，导入的链接可能会上传到 Chrome 同步。如果在线网站图标已开启，显示导入的网站时可能会向第三方服务请求图标。导入不会更改这两项设置；保存前会再次核对。',
            apply: '添加这些书签', cancel: '取消', cancelled: '已取消导入预览，没有添加书签。',
            applying: '正在保存书签… 保存已开始，无法在此取消。', saved: '书签已添加',
            size: '请选择不超过 10 MiB 的书签 HTML 文件。没有添加书签。',
            file: '无法读取此本地文件，请重新选择后重试。没有添加书签。',
            invalid: '无法安全导入此文件。请从浏览器重新导出 HTML 书签文件后重试。没有添加书签。',
            limit: '此文件超出支持的导入限制。请导出较少的书签后重试。没有添加书签。',
            conflict: '已保存的网站、分类或隐私设置发生了变化。请重新选择文件并核对新的预览。本次操作没有添加书签。',
            dirty: '请先保存当前设置中的修改，并等待设置操作完成，再重新选择书签文件。没有添加书签。',
            storage: '无法安全读取或更新当前设置。请检查已保存的设置和存储可用性，再重新选择文件。本次操作没有添加书签。',
            read: '无法安全读取当前设置。请在存储恢复可用后重新选择文件。没有添加书签。',
            uncertain: '无法确认保存结果，部分书签可能已添加。请先检查已保存的网站，再重新选择文件生成新的预览。不会自动重试本次保存。'
        }
    };
    function translator(doc) {
        // Follow the displayed message catalog when available (options.html has a static lang).
        let locale;
        try { locale = root.i18n?.t('dateFormattingLocale') || root.chrome?.i18n?.getMessage?.('dateFormattingLocale'); } catch (_) {}
        if (typeof locale !== 'string' || !/^(en|zh)(?:[-_]|$)/i.test(locale)) locale = doc.documentElement?.lang;
        if (!locale) { try { locale = root.chrome?.i18n?.getUILanguage?.(); } catch (_) {} }
        const language = /^zh(?:[-_]|$)/i.test(locale || '') ? 'zh' : 'en';
        return key => {
            let translated;
            const id = `bookmarkImport${key[0].toUpperCase()}${key.slice(1)}`;
            try { translated = root.i18n?.t(id); } catch (_) {}
            return translated && translated !== id ? translated : messages[language][key];
        };
    }
    function mount(host, { prepare, apply } = {}) {
        if (!host?.ownerDocument || typeof prepare !== 'function' || typeof apply !== 'function') throw new TypeError('Bookmark import requires a host, prepare and apply.');
        const doc = host.ownerDocument, t = translator(doc), prefix = `bookmark-import-${++nextId}`;
        let generation = 0, prepared = null, pending = null, phase = '', destroyed = false, stopFocus = null, siteReview = null;
        const make = (tag, className, text, parent) => {
            const node = doc.createElement(tag); if (className) node.className = className;
            if (text !== undefined) node.textContent = text; if (parent) parent.append(node); return node;
        };
        const shell = make('section', 'bookmark-import', undefined, host);
        const title = make('h3', '', t('title'), shell); title.id = `${prefix}-title`; shell.setAttribute('aria-labelledby', title.id);
        const help = make('p', 'form-hint', t('help'), shell); help.id = `${prefix}-help`;
        make('p', 'form-hint', t('local'), shell);
        const button = (text, className, parent) => { const node = make('button', `btn ${className}`, text, parent); node.type = 'button'; return node; };
        const choose = button(t('choose'), 'btn-secondary bookmark-import-choose', shell); choose.setAttribute('aria-describedby', help.id);
        const file = make('input', 'bookmark-import-file', undefined, shell);
        file.type = 'file'; file.accept = '.html,.htm,text/html'; file.hidden = true; file.setAttribute('aria-label', t('choose'));
        const panel = make('section', 'bookmark-import-preview', undefined, shell); panel.hidden = true;
        const heading = make('h4', '', t('review'), panel); heading.id = `${prefix}-review`; panel.setAttribute('aria-labelledby', heading.id);
        const summary = make('p', 'bookmark-import-summary', '', panel); summary.tabIndex = -1;
        const details = make('div', 'bookmark-import-details', undefined, panel);
        const counts = make('ul', 'bookmark-import-counts', undefined, details);
        make('h5', '', t('reasons'), details);
        const reasons = make('ul', 'bookmark-import-reasons', undefined, details);
        const mappingHeading = make('h5', '', t('mapping'), details); mappingHeading.id = `${prefix}-mapping`;
        const mapping = make('ul', 'bookmark-import-mapping', undefined, details);
        mapping.setAttribute('aria-labelledby', mappingHeading.id); mapping.tabIndex = -1;
        const sites = make('div', 'bookmark-import-sites', undefined, details);
        const privacy = make('div', 'bookmark-import-privacy', undefined, details);
        make('h5', '', t('privacy'), privacy);
        const settings = make('p', '', '', privacy); make('p', '', t('disclosure'), privacy);
        const actions = make('div', 'bookmark-import-actions', undefined, panel);
        const applyButton = button(t('apply'), 'btn-primary bookmark-import-apply', actions);
        const cancel = button(t('cancel'), 'btn-secondary bookmark-import-cancel', actions);
        const status = make('p', 'bookmark-import-status form-hint', '', shell);
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); status.tabIndex = -1;

        const connected = () => !destroyed && host.isConnected && shell.isConnected;
        const current = token => connected() && token === generation;
        function controls() {
            choose.disabled = file.disabled = phase === 'applying';
            applyButton.disabled = phase !== 'ready' || !prepared || prepared.plan.preview.addedBookmarks === 0;
            cancel.disabled = phase === 'applying';
            shell.setAttribute('aria-busy', String(phase === 'reading' || phase === 'applying'));
            siteControls();
        }
        function clearPreview() {
            clearSites();
            prepared = null; panel.hidden = true; details.hidden = true;
            counts.replaceChildren(); reasons.replaceChildren(); mapping.replaceChildren(); settings.textContent = ''; summary.textContent = '';
        }
        const format = (key, values) => t(key).replace(/\{(total|start|end)\}/g, (_, key) => String(values[key]));
        const canReviewSites = state => siteReview === state && current(state.token) && phase === 'ready' &&
            prepared && state.toggle.isConnected && state.region.isConnected;
        function siteControls() {
            if (!siteReview) return;
            const state = siteReview, enabled = canReviewSites(state);
            state.toggle.disabled = !enabled || !state.links.length;
            state.previous.disabled = !enabled || !state.expanded || state.page === 0;
            state.next.disabled = !enabled || !state.expanded || (state.page + 1) * SITE_PAGE_SIZE >= state.links.length;
        }
        function clearSites() {
            if (siteReview) {
                // Detached controls may still have queued events. Drop their data as well as their DOM.
                siteReview.links = null; siteReview.categoryNames = null; siteReview.page = 0; siteReview.expanded = false;
                siteReview.list.replaceChildren(); siteReview.range.textContent = '';
                siteReview.toggle.setAttribute('aria-expanded', 'false'); siteReview.region.hidden = true;
                siteReview.toggle.disabled = siteReview.previous.disabled = siteReview.next.disabled = true;
            }
            siteReview = null; sites.replaceChildren();
        }
        function renderSitePage(state) {
            if (!canReviewSites(state) || !state.expanded) return;
            const start = state.page * SITE_PAGE_SIZE, end = Math.min(start + SITE_PAGE_SIZE, state.links.length);
            state.list.replaceChildren(); state.list.start = start + 1; state.list.scrollTop = 0;
            for (let index = start; index < end; index++) {
                const link = state.links[index], row = make('li', 'bookmark-import-site', undefined, state.list);
                make('strong', 'bookmark-import-site-title', link.title, row);
                make('p', 'bookmark-import-site-url', link.url, row);
                make('p', 'bookmark-import-site-category', `${t('siteCategory')}: ${state.categoryNames.get(link.category)}`, row);
            }
            // Only this bounded page description is live; imported titles and URLs never are.
            state.range.textContent = format('sitesRange', { start: start + 1, end, total: state.links.length });
            siteControls();
        }
        function toggleSites(state, event) {
            if (!canReviewSites(state) || state.toggle.disabled || event.isComposing) return;
            state.expanded = !state.expanded; state.page = 0;
            state.toggle.setAttribute('aria-expanded', String(state.expanded)); state.region.hidden = !state.expanded;
            if (state.expanded) renderSitePage(state);
            else { state.list.replaceChildren(); state.range.textContent = ''; siteControls(); }
        }
        function turnSitePage(state, step, event) {
            if (!canReviewSites(state) || !state.expanded || event.isComposing) return;
            const origin = step < 0 ? state.previous : state.next;
            if (origin.disabled) return;
            const ownedFocus = doc.activeElement === origin;
            state.page += step; renderSitePage(state);
            // Disabling a boundary button can drop native focus to body. Move only our own focus.
            if (ownedFocus && origin.disabled && !doc.hidden && [origin, doc.body].includes(doc.activeElement)) {
                (state.previous.disabled ? state.next : state.previous).focus();
            }
        }
        function showSites(value, token) {
            const additions = value.plan.additions, preview = value.plan.preview;
            if (!additions || !Array.isArray(additions.links) || !Array.isArray(additions.categories) ||
                additions.links.length !== preview.addedBookmarks || additions.links.length > 2000 ||
                additions.categories.length !== preview.newCategories || additions.categories.length > 200) {
                throw Object.assign(new Error('Invalid bookmark additions'), { code: 'INVALID_PREVIEW' });
            }
            const categoryNames = new Map();
            for (const category of additions.categories) {
                if (!category || typeof category.id !== 'string' || !category.id || categoryNames.has(category.id) || typeof category.name !== 'string') {
                    throw Object.assign(new Error('Invalid bookmark category'), { code: 'INVALID_PREVIEW' });
                }
                categoryNames.set(category.id, category.name);
            }
            if (additions.links.some(link => !link || typeof link.title !== 'string' || typeof link.url !== 'string' || !categoryNames.has(link.category))) {
                throw Object.assign(new Error('Invalid bookmark site'), { code: 'INVALID_PREVIEW' });
            }
            const toggle = button(format('sites', { total: additions.links.length }), 'btn-secondary bookmark-import-sites-toggle', sites);
            toggle.id = `${prefix}-sites-toggle`; toggle.setAttribute('aria-expanded', 'false');
            const hint = make('p', 'form-hint', t('sitesPrivacy'), sites); hint.id = `${prefix}-sites-hint`; toggle.setAttribute('aria-describedby', hint.id);
            const region = make('div', 'bookmark-import-sites-region', undefined, sites); region.id = `${prefix}-sites-region`; region.hidden = true;
            region.setAttribute('role', 'region'); region.setAttribute('aria-labelledby', toggle.id); toggle.setAttribute('aria-controls', region.id);
            const list = make('ol', 'bookmark-import-sites-list', undefined, region); list.tabIndex = 0;
            const pager = make('div', 'bookmark-import-sites-pager', undefined, region);
            const previous = button(t('sitesPrevious'), 'btn-secondary bookmark-import-sites-previous', pager);
            const range = make('p', 'bookmark-import-sites-range', '', pager); range.setAttribute('role', 'status'); range.setAttribute('aria-live', 'polite'); range.setAttribute('aria-atomic', 'true');
            const next = button(t('sitesNext'), 'btn-secondary bookmark-import-sites-next', pager);
            const state = { token, links: additions.links, categoryNames, page: 0, expanded: false, toggle, region, list, previous, range, next };
            siteReview = state;
            toggle.addEventListener('click', toggleSites.bind(null, state));
            previous.addEventListener('click', turnSitePage.bind(null, state, -1));
            next.addEventListener('click', turnSitePage.bind(null, state, 1));
        }
        function focusTracking(origin) {
            stopFocus?.();
            let valid = doc.activeElement === origin || doc.activeElement === file;
            const invalidate = () => { valid = false; };
            const moved = event => { if (![origin, file, doc.body].includes(event.target)) invalidate(); };
            const keyed = event => { if (!(event.repeat && ['Enter', ' '].includes(event.key))) invalidate(); };
            doc.addEventListener('pointerdown', invalidate, true); doc.addEventListener('keydown', keyed, true);
            doc.addEventListener('focusin', moved, true); doc.addEventListener('visibilitychange', invalidate, true);
            root.addEventListener?.('blur', invalidate);
            const cleanup = () => {
                doc.removeEventListener('pointerdown', invalidate, true); doc.removeEventListener('keydown', keyed, true);
                doc.removeEventListener('focusin', moved, true); doc.removeEventListener('visibilitychange', invalidate, true);
                root.removeEventListener?.('blur', invalidate); if (stopFocus === cleanup) stopFocus = null;
            };
            stopFocus = cleanup;
            return { cleanup, move(node) { if (valid && connected() && !doc.hidden && shell.getClientRects().length && [origin, file, doc.body].includes(doc.activeElement)) node.focus(); } };
        }
        function errorText(error, duringApply) {
            const code = error?.code || '';
            if (error?.mayHaveCommitted || code === 'BOOKMARK_IMPORT_UNVERIFIED') return t('uncertain');
            if (code === 'CONFLICT' || code.endsWith('_CONFLICT') || code === 'BOOKMARK_IMPORT_PRIVACY_CHANGED') return t('conflict');
            if (code === 'CANCELLED') return t('cancelled');
            if (code === 'BOOKMARK_IMPORT_FORM_DIRTY') return t('dirty');
            if (['BOOKMARK_IMPORT_INVALID_STATE', 'BOOKMARK_IMPORT_STATE_LIMIT', 'BOOKMARK_IMPORT_INVALID_REQUEST',
                'BOOKMARK_IMPORT_UNAVAILABLE', 'LINKS_LOCK_UNAVAILABLE', 'LAYOUT_IDENTITY_INVALID'].includes(code)) return t('storage');
            if (['READ', 'UNAVAILABLE'].includes(code)) return t('read');
            if (duringApply) return t('uncertain');
            if (code === 'INPUT_LIMIT') return t('size');
            if (code === 'FILE') return t('file');
            if (code.endsWith('_LIMIT')) return t('limit');
            return t('invalid');
        }
        function showPreview(value, token) {
            const preview = value?.plan?.preview;
            const fields = [['encounteredBookmarks', 'encountered'], ['addedBookmarks', 'added'], ['skippedBookmarks', 'skipped'], ['newCategories', 'categories']];
            if (!preview || fields.some(([key]) => !Number.isSafeInteger(preview[key]) || preview[key] < 0) ||
                !Array.isArray(preview.folderMapping) || preview.folderMapping.length > 200) throw Object.assign(new Error('Invalid bookmark preview'), { code: 'INVALID_PREVIEW' });
            showSites(value, token);
            for (const [key, label] of fields) make('li', '', `${t(label)}: ${preview[key]}`, counts);
            for (const key of ['duplicate_url', 'invalid_url', 'invalid_title', 'duplicate_href_attribute']) {
                const count = preview.skippedReasons?.[key];
                if (Number.isSafeInteger(count) && count > 0) make('li', '', `${t(key)}: ${count}`, reasons);
            }
            if (!reasons.children.length) make('li', '', t('noneSkipped'), reasons);
            for (const row of preview.folderMapping) {
                // Imported strings are text only: no URL nodes, HTML, icon requests or file DOM.
                make('li', '', `${row.sourcePath || t('root')} → ${row.categoryName}`, mapping);
            }
            // Long text-only mappings must be scrollable with the keyboard, too.
            mapping.tabIndex = preview.folderMapping.length > 6 ? 0 : -1;
            const snapshot = value.snapshot || {};
            const flag = (flat, nested) => typeof flat === 'boolean' ? flat : nested;
            const state = value => t(value === true ? 'on' : value === false ? 'off' : 'unknown');
            settings.textContent = `${t('sync')}: ${state(flag(snapshot.privacy?.syncEnabled, flag(snapshot.syncEnabled, snapshot.sync?.enabled)))} · ${t('icons')}: ${state(flag(snapshot.privacy?.onlineFavicons, snapshot.onlineFavicons))}`;
            summary.textContent = t(preview.addedBookmarks ? 'ready' : 'noNew'); details.hidden = false;
        }
        function cancelReview(restoreFocus = true) {
            if (destroyed || phase === 'applying') return false;
            const hadWork = Boolean(pending || prepared), ownedFocus = shell.contains(doc.activeElement);
            generation++; stopFocus?.(); pending = null; phase = ''; clearPreview(); controls();
            status.textContent = hadWork ? t('cancelled') : '';
            if (restoreFocus && ownedFocus && connected() && !doc.hidden) choose.focus();
            return true;
        }
        function readFile(selected) {
            if (!connected() || phase === 'applying' || !selected) return;
            generation++; const token = generation; stopFocus?.(); pending = null; clearPreview(); status.textContent = '';
            const focus = focusTracking(choose);
            // The File metadata gate deliberately precedes File.text() and preparation.
            if (!Number.isSafeInteger(selected.size) || selected.size < 0 || selected.size > MAX_BYTES) {
                phase = ''; status.textContent = t('size'); controls(); focus.move(status); focus.cleanup(); return;
            }
            phase = 'reading'; panel.hidden = false; summary.textContent = t('reading'); status.textContent = t('reading'); controls();
            const work = Promise.resolve().then(async () => {
                if (!current(token)) return;
                let text;
                try { text = await selected.text(); } catch (_) { throw Object.assign(new Error('Local file read failed'), { code: 'FILE' }); }
                if (!current(token)) return;
                const value = await prepare(text);
                if (!current(token)) return;
                showPreview(value, token); prepared = value; phase = 'ready'; status.textContent = t(value.plan.preview.addedBookmarks ? 'ready' : 'noNew');
                controls(); focus.move(summary);
            }).catch(error => {
                if (!current(token)) return;
                phase = ''; clearPreview(); status.textContent = errorText(error, false); controls(); focus.move(status);
            }).finally(() => {
                focus.cleanup();
                if (pending === work) pending = null;
                if (token !== generation || destroyed) return;
                if (!connected()) { generation++; phase = ''; clearPreview(); }
                controls();
            });
            pending = work;
        }
        choose.addEventListener('click', event => { if (connected() && phase !== 'applying' && !event.isComposing) file.click(); });
        file.addEventListener('change', () => { const selected = file.files?.[0]; file.value = ''; readFile(selected); });
        applyButton.addEventListener('click', event => {
            if (!connected() || phase !== 'ready' || !prepared || !prepared.plan.preview.addedBookmarks || event.isComposing) return;
            const selected = prepared, token = generation, focus = focusTracking(applyButton);
            phase = 'applying'; status.textContent = t('applying'); controls();
            const work = Promise.resolve().then(async () => {
                // A detached/destroyed view cannot start a write queued by an earlier click.
                if (!current(token)) return;
                const result = await apply(selected);
                if (!current(token)) return;
                phase = ''; clearPreview();
                status.textContent = result?.applied === false ? t('noNew') : `${t('saved')}: ${result?.addedBookmarks ?? selected.plan.preview.addedBookmarks} · ${t('categories')}: ${result?.newCategories ?? selected.plan.preview.newCategories}`;
                controls(); focus.move(status);
            }).catch(error => {
                if (!current(token)) return;
                phase = ''; clearPreview(); status.textContent = errorText(error, true); controls(); focus.move(status);
            }).finally(() => {
                focus.cleanup();
                if (pending === work) pending = null;
                if (token !== generation || destroyed) return;
                if (!connected()) { generation++; phase = ''; clearPreview(); }
                controls();
            });
            pending = work;
        });
        cancel.addEventListener('click', () => cancelReview());
        shell.addEventListener('keydown', event => {
            if (event.isComposing || event.keyCode === 229) return;
            if (event.repeat && ['Enter', ' '].includes(event.key)) { event.preventDefault(); return; }
            if (event.key === 'Escape' && !panel.hidden) {
                event.preventDefault(); event.stopPropagation();
                if (phase !== 'applying') cancelReview();
            }
        });
        controls();
        return {
            get pending() { return pending; }, hasUncommittedWork: () => Boolean(pending || prepared),
            close: () => cancelReview(),
            destroy() { if (destroyed) return; destroyed = true; generation++; stopFocus?.(); clearPreview(); if (phase !== 'applying') pending = null; shell.remove(); }
        };
    }
    root.LocalItabBookmarkImportView = Object.freeze({ mount });
})(window);
