// Settings navigation only. Index this explicit public-label allowlist, never DOM text or values.
(function(root) {
    'use strict';
    const labels = {
        "addCategory": "Add Category",
        "background": "Background",
        "bgColor": "Solid Color",
        "bgGradient": "Template background",
        "bgImage": "Custom Image",
        "bgType": "Background Type",
        "categories": "Categories",
        "cloudSync": "Chrome Sync",
        "colorMode": "Appearance",
        "colorModeDark": "Dark",
        "colorModeLight": "Light",
        "countdownDateLabel": "Target date (YYYY-MM-DD)",
        "countdownEnable": "Show Countdown on the new tab page",
        "countdownEventLabel": "Milestone title (up to 80 characters)",
        "countdownTitle": "Countdown",
        "customSearch": "Custom",
        "customSearchUrl": "Custom search URL",
        "dashboardPadding": "Dashboard padding (px)",
        "dashboardPaddingAuto": "Use automatic spacing",
        "dashboardTemplate": "Template",
        "dataManagement": "Data Management",
        "driveBackupsTitle": "Google Drive Computer Backups",
        "driveCurrentDevice": "Computer name",
        "driveDeviceSelect": "Saved computers",
        "enableCloudSync": "Enable Chrome Sync",
        "exportSettings": "Export Settings",
        "bookmarkExportButton": "Export bookmarks HTML",
        "finderShortcutSetting": "Use / to open Find saved sites",
        "focusEnable": "Show Focus timer on the new tab page",
        "focusTitle": "Focus timer",
        "gridSize": "Grid size (px)",
        "hotTopicGroup": "Topic group",
        "hour12": "12-Hour Format",
        "iconLayout": "Icon Layout",
        "importSettings": "Import Settings",
        "localCards": "Local Cards",
        "moduleVisibility": "Module Visibility",
        "movieNote": "Movie note",
        "movieTitle": "Movie title",
        "onlineFavicons": "Online favicon fetching",
        "updateTitle": "Version & updates",
        "updateAutomatic": "Check at most once a day",
        "updateCheck": "Check GitHub now",
        "paddingBottom": "Bottom",
        "paddingLeft": "Left",
        "paddingRight": "Right",
        "paddingTop": "Top",
        "placementFree": "Free placement",
        "placementGrid": "Grid (default)",
        "placementMode": "Placement",
        "placementSnap": "Manual · snap to grid",
        "privacyNetwork": "Privacy & Network",
        "quoteText": "Quote Text",
        "scratchpadEnable": "Show Scratchpad on the new tab page",
        "scratchpadTitle": "Scratchpad",
        "searchEngine": "Search engine",
        "searchSettings": "Search",
        "settingsSearchBookmarks": "Import browser bookmarks",
        "settingsSearchClear": "Clear search",
        "settingsSearchCount": "{count} settings sections found",
        "settingsSearchEmpty": "No matching settings. Try another setting name.",
        "settingsSearchHelp": "Search setting names across all tabs. Your saved content is not searched.",
        "settingsSearchLabel": "Find a setting",
        "settingsSearchPlaceholder": "Search setting names",
        "shortcutIconSize": "Shortcut icon size (px)",
        "shortcutTitleColor": "Shortcut title color",
        "shortcutTitleColorAuto": "Use theme color",
        "shortcutTitleSize": "Shortcut title size (px)",
        "shortcutsGapX": "Shortcut gap (horizontal)",
        "shortcutsGapY": "Shortcut gap (vertical)",
        "shortcutsPerRow": "Shortcuts per row",
        "showClock": "Clock Module",
        "showHot": "Hot Topics Card",
        "showMovie": "Movie Card",
        "showSearch": "Search Module",
        "showSeconds": "Show Seconds",
        "showShortcutTitles": "Shortcut Titles",
        "showShortcuts": "Shortcuts Module",
        "showWeather": "Weather Card",
        "tabAppearance": "Appearance",
        "tabContent": "Search & cards",
        "tabData": "Data",
        "tabLayout": "Shortcuts",
        "tabPrivacy": "Privacy",
        "tabSync": "Sync",
        "tasksEnable": "Show Tasks on the new tab page",
        "tasksTitle": "Tasks",
        "templateAppearance": "Template & appearance",
        "templateAtelier": "Atelier",
        "templateBlueprint": "Blueprint",
        "templateClarity": "A · Clarity",
        "templateColumn": "Column",
        "templateConsole": "Console",
        "templateFolio": "C · Folio",
        "templateGraphite": "B · Graphite",
        "templateHorizon": "Horizon",
        "templateLedger": "Ledger",
        "templateLibrary": "Library",
        "templateMeadow": "Meadow",
        "templatePrism": "Prism",
        "templateQuiet": "Quiet",
        "templateStudio": "Studio",
        "templateTerrace": "Terrace",
        "timeDisplay": "Time Display",
        "weatherAqi": "AQI",
        "weatherAqiLabel": "AQI label",
        "weatherCity": "Weather city",
        "weatherCondition": "Condition",
        "weatherHigh": "High",
        "weatherLow": "Low",
        "weatherTemp": "Temperature",
        "workspacePresetTitle": "Recommended workspace",
        "worldClockLabel": "Short label (optional)",
        "worldClockZone": "Time zone",
        "worldClocks": "World clocks"
    };
    const registry = [
        {"target": "theme-settings", "tab": "appearance", "tabKey": "tabAppearance", "title": "templateAppearance", "fields": ["dashboardTemplate", "colorMode", "colorModeLight", "colorModeDark", "templateClarity", "templateGraphite", "templateFolio", "templateAtelier", "templateQuiet", "templateStudio", "templateConsole", "templatePrism", "templateLibrary", "templateHorizon", "templateLedger", "templateMeadow", "templateBlueprint", "templateTerrace", "templateColumn", "workspacePresetTitle"]},
        {"target": "time-settings", "tab": "appearance", "tabKey": "tabAppearance", "title": "timeDisplay", "fields": ["hour12", "showSeconds"]},
        {"target": "world-clock-settings", "tab": "appearance", "tabKey": "tabAppearance", "title": "worldClocks", "fields": ["worldClockZone", "worldClockLabel"]},
        {"target": "background-settings", "tab": "appearance", "tabKey": "tabAppearance", "title": "background", "fields": ["bgType", "bgGradient", "bgColor", "bgImage"]},
        {"target": "visibility-settings", "tab": "layout", "tabKey": "tabLayout", "title": "moduleVisibility", "fields": ["showClock", "showSearch", "showShortcuts", "showWeather", "showHot", "showMovie", "showShortcutTitles", "finderShortcutSetting"]},
        {"target": "local-tasks-settings", "tab": "layout", "tabKey": "tabLayout", "title": "tasksTitle", "fields": ["tasksEnable"]},
        {"target": "local-focus-settings", "tab": "layout", "tabKey": "tabLayout", "title": "focusTitle", "fields": ["focusEnable"]},
        {"target": "local-scratchpad-settings", "tab": "layout", "tabKey": "tabLayout", "title": "scratchpadTitle", "fields": ["scratchpadEnable"]},
        {"target": "layout-settings", "tab": "layout", "tabKey": "tabLayout", "title": "iconLayout", "fields": ["placementMode", "placementGrid", "placementFree", "placementSnap", "gridSize", "shortcutsPerRow", "shortcutsGapX", "shortcutsGapY", "shortcutIconSize", "shortcutTitleSize", "dashboardPadding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "dashboardPaddingAuto", "shortcutTitleColor", "shortcutTitleColorAuto"]},
        {"target": "version-update-settings", "tab": "privacy", "tabKey": "tabPrivacy", "title": "updateTitle", "fields": ["updateAutomatic", "updateCheck"]},
        {"target": "privacy-settings", "tab": "privacy", "tabKey": "tabPrivacy", "title": "privacyNetwork", "fields": ["onlineFavicons"]},
        {"target": "countdown-settings", "tab": "content", "tabKey": "tabContent", "title": "countdownTitle", "fields": ["countdownEventLabel", "countdownDateLabel", "countdownEnable"]},
        {"target": "search-settings", "tab": "content", "tabKey": "tabContent", "title": "searchSettings", "fields": ["searchEngine", "customSearchUrl", "customSearch"]},
        {"target": "category-settings", "tab": "content", "tabKey": "tabContent", "title": "categories", "fields": ["addCategory"]},
        {"target": "local-card-settings", "tab": "content", "tabKey": "tabContent", "title": "localCards", "fields": ["weatherCity", "weatherCondition", "weatherTemp", "weatherLow", "weatherHigh", "weatherAqi", "weatherAqiLabel", "hotTopicGroup", "movieTitle", "movieNote"]},
        {"target": "drive-backup-settings", "tab": "sync", "tabKey": "tabSync", "title": "driveBackupsTitle", "fields": ["driveDeviceSelect", "driveCurrentDevice"]},
        {"target": "cloud-sync-settings", "tab": "sync", "tabKey": "tabSync", "title": "cloudSync", "fields": ["enableCloudSync"]},
        {"target": "data-settings", "tab": "data", "tabKey": "tabData", "title": "dataManagement", "fields": ["quoteText", "exportSettings", "bookmarkExportButton", "importSettings", "settingsSearchBookmarks"]},
    ];
    const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().trim();
    function translate(key) {
        const localized = root.i18n?.t(key);
        return localized && localized !== key ? localized : labels[key];
    }
    function index() {
        return registry.map(entry => {
            const title = translate(entry.title), tab = translate(entry.tabKey);
            const fields = entry.fields.map(translate);
            return {...entry, title, tabLabel: tab, fields,
                searchable: normalize([tab, title, ...fields].join(' '))};
        });
    }
    function find(query, entries = index()) {
        const terms = normalize(query).split(/\s+/).filter(Boolean);
        return terms.length ? entries.filter(entry => terms.every(term => entry.searchable.includes(term))) : [];
    }
    const mounted = new WeakMap();
    function mount(host, {activateTab}) {
        if (!host || typeof activateTab !== 'function') return;
        if (mounted.has(host)) return mounted.get(host);
        const input = host.querySelector('#settings-search-input');
        const clear = host.querySelector('#settings-search-clear');
        const results = host.querySelector('#settings-search-results');
        const status = host.querySelector('#settings-search-status');
        if (!input || !clear || !results || !status) return;
        // Translation is resolved once after page localization. No DOM content enters this index.
        const entries = index();
        let composing = false;
        const validTarget = entry => {
            const target = document.getElementById(entry.target);
            return target?.isConnected && target.closest('.tab-panel')?.dataset.tab === entry.tab ? target : null;
        };
        const blocked = event => composing || event.isComposing || event.keyCode === 229 || event.repeat ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
        const guardKey = event => {
            if ((event.key === 'Enter' || event.key === ' ') && blocked(event)) event.preventDefault();
        };
        const navigate = entry => {
            let target = validTarget(entry);
            if (!target || activateTab(entry.tab) === false) return;
            // A conditional host stays conditional: navigate to its enclosing visible section.
            if (!target.getClientRects().length) target = target.closest('.settings-section');
            if (!target?.getClientRects().length) return;
            const heading = target.querySelector('h2.section-title, h3.section-title');
            const focusTarget = heading?.getClientRects().length ? heading : target;
            focusTarget.tabIndex = -1;
            if (focusTarget === target) {
                focusTarget.setAttribute('role', 'group');
                focusTarget.setAttribute('aria-label', entry.title);
            }
            // Never focus an action/control: a held Enter cannot enable a module or save a form.
            focusTarget.focus({preventScroll: true});
            target.scrollIntoView({behavior: 'instant', block: 'start'});
        };
        const render = () => {
            results.replaceChildren();
            const hasQuery = Boolean(normalize(input.value));
            clear.disabled = !input.value;
            results.hidden = !hasQuery;
            if (!hasQuery) { status.textContent = ''; return; }
            const matches = find(input.value, entries).filter(validTarget);
            status.textContent = matches.length ? translate('settingsSearchCount').replace('{count}', String(matches.length)) : translate('settingsSearchEmpty');
            for (const entry of matches) {
                const item = document.createElement('li');
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'settings-search-result';
                const title = document.createElement('span'); title.className = 'settings-search-result-title';
                title.textContent = `${entry.tabLabel} › ${entry.title}`;
                button.append(title);
                const terms = normalize(input.value).split(/\s+/).filter(Boolean);
                const matchedFields = entry.fields.filter(field => terms.some(term => normalize(field).includes(term)));
                if (matchedFields.length) {
                    const detail = document.createElement('span'); detail.className = 'settings-search-result-detail';
                    detail.textContent = matchedFields.join(' · '); button.append(detail);
                }
                button.addEventListener('keydown', guardKey);
                button.addEventListener('click', event => { if (!blocked(event)) navigate(entry); });
                item.append(button); results.append(item);
            }
        };
        input.addEventListener('compositionstart', () => { composing = true; });
        input.addEventListener('compositionend', () => { composing = false; render(); });
        input.addEventListener('input', event => { if (!composing && !event.isComposing) render(); });
        // Deliberately no Enter action or global listener: Tab to a result and use native activation.
        clear.addEventListener('keydown', guardKey);
        clear.addEventListener('click', event => {
            if (blocked(event)) return;
            input.value = ''; render(); input.focus();
        });
        render();
        const controller = Object.freeze({});
        mounted.set(host, controller);
        return controller;
    }
    root.LocalItabSettingsSearch = {mount, find, index};
})(window);
