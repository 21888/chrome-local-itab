// Options page JavaScript - with storage management
const THEME_PRESETS = ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'];
const PRIVACY_PERMISSION_ORIGINS = {
    favicons: 'https://www.google.com/*'
};
let driveBackupSnapshots = [];
let driveActionInProgress = false;
let cloudReplacementInProgress = false;

// A category baseline belongs to this form, never to a later storage read.
let categoryBaseline = null;
let categoryRawBaseline = null;
let settingsSaveQueue = Promise.resolve();
let settingsSession = 0;
let settingsReplacementPending = false;
let settingsReplacementRunning = false;
let categorySaveTimeout;
const categorySnapshot = categories => categories.map(({ id, name, icon }) => ({ id, name, icon }));
const sameCategories = (a, b) => JSON.stringify(categorySnapshot(a)) === JSON.stringify(categorySnapshot(b));
function queueSettingsWrite(operation) {
    const result = settingsSaveQueue.then(operation);
    settingsSaveQueue = result.catch(() => {});
    return result;
}
async function replaceSettings(operation) {
    if (settingsReplacementRunning) throw new Error('A settings replacement is already in progress.');
    settingsReplacementRunning = true;
    settingsReplacementPending = true;
    ++settingsSession;
    if (categorySaveTimeout !== undefined) clearTimeout(categorySaveTimeout);
    try {
        const result = await queueSettingsWrite(operation);
        if (result === false) settingsReplacementPending = false;
        return result;
    } catch (error) {
        settingsReplacementPending = false;
        throw error;
    } finally { settingsReplacementRunning = false; }
}

// HTML migration owns a separate, additive transaction and never uses backup restore.
let bookmarkImportPending = false;
let bookmarkDeferredSettingsSave = false;
function bookmarkImportText(en, zh) {
    const language = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.() || document.documentElement.lang || 'en';
    return language.toLowerCase().startsWith('zh') ? zh : en;
}
function bookmarkImportError(code, en, zh) {
    const error = new Error(bookmarkImportText(en, zh)); error.code = code; return error;
}
function bookmarkCategorySignature() {
    return JSON.stringify(Array.from(document.querySelectorAll('#category-manage-list .category-manage-item')).map(li => ({
        id: li.dataset.id, name: li.querySelector('.cat-name').value, icon: li.querySelector('.cat-icon').value
    })));
}
function bookmarkCategoryFormClean() {
    return categoryBaseline !== null && categoryRawBaseline !== null && bookmarkCategorySignature() === categoryRawBaseline;
}
function assertBookmarkImportReady() {
    if (settingsReplacementPending || settingsReplacementRunning || !bookmarkCategoryFormClean()) {
        throw bookmarkImportError('BOOKMARK_IMPORT_FORM_DIRTY', 'Save your category edits and finish other settings changes before previewing or applying bookmarks.', '请先保存分类编辑并完成其他设置更改，再预览或应用书签。');
    }
}
async function prepareBookmarkImport(text) {
    if (bookmarkImportPending) throw bookmarkImportError('BOOKMARK_IMPORT_PENDING', 'An import is still running.', '导入仍在进行中。');
    const session = settingsSession;
    await settingsSaveQueue;
    assertBookmarkImportReady();
    if (session !== settingsSession) throw bookmarkImportError('BOOKMARK_IMPORT_CONFLICT', 'Settings changed. Preview the file again.', '设置已更改，请重新预览文件。');
    const categorySignature = bookmarkCategorySignature();
    const snapshot = await storageManager.getBookmarkImportSnapshot();
    assertBookmarkImportReady();
    if (session !== settingsSession || categorySignature !== bookmarkCategorySignature()) throw bookmarkImportError('BOOKMARK_IMPORT_FORM_DIRTY', 'Category edits changed. Preview again after saving.', '分类编辑已更改，请保存后重新预览。');
    const batchId = crypto.randomUUID().replace(/-/g, '');
    const rootLabel = bookmarkImportText('Imported bookmarks', '导入的书签');
    const plan = window.LocalItabBookmarkImport.planImport(text, snapshot, {
        rootLabel, createCategoryId: ({index}) => `import_${batchId}_${index}`
    });
    return {text, snapshot, plan, batchId, rootLabel, settingsSession: session, categorySignature};
}
async function applyBookmarkImport(prepared) {
    if (bookmarkImportPending) throw bookmarkImportError('BOOKMARK_IMPORT_PENDING', 'An import is still running.', '导入仍在进行中。');
    bookmarkImportPending = true;
    try {
        return await queueSettingsWrite(async () => {
            assertBookmarkImportReady();
            if (prepared.settingsSession !== settingsSession || prepared.categorySignature !== bookmarkCategorySignature()) {
                throw bookmarkImportError('BOOKMARK_IMPORT_CONFLICT', 'Settings or category edits changed. Preview the file again.', '设置或分类编辑已更改，请重新预览文件。');
            }
            // Disable the category editor only during the write. Other fields are never re-rendered.
            const controls = Array.from(document.querySelectorAll('#category-manage-list input, #category-manage-list button, #add-category'));
            const previousDisabled = controls.map(control => control.disabled);
            controls.forEach(control => { control.disabled = true; });
            try {
                const result = await storageManager.appendBookmarkImport({text: prepared.text,
                    expectedSnapshot: prepared.snapshot, expectedPrivacy: prepared.snapshot.privacy,
                    batchId: prepared.batchId, rootLabel: prepared.rootLabel});
                if (prepared.settingsSession !== settingsSession) {
                    throw bookmarkImportError('BOOKMARK_IMPORT_UNVERIFIED', 'Import finished while settings were being replaced. Reload to inspect the current saved state before importing again.', '导入完成时设置正在被替换，请刷新查看当前保存状态后再导入。');
                }
                if (prepared.categorySignature === bookmarkCategorySignature() && bookmarkCategoryFormClean()) {
                    setupCategoryManagement(result.snapshot.categories);
                }
                // If a newer edit appeared, retain both its DOM and old CAS baseline.
                // Its next save then conflicts rather than deleting the imported categories.
                return result;
            } finally {
                controls.forEach((control, index) => { control.disabled = previousDisabled[index]; });
            }
        });
    } finally {
        bookmarkImportPending = false;
        if (bookmarkDeferredSettingsSave) {
            bookmarkDeferredSettingsSave = false;
            // Capture the form only after our successful category refresh; an
            // ordinary auto-save requested during import must not disappear.
            await saveAllSettings();
        }
    }
}
function setupBookmarkImport() {
    if (!window.bookmarkImportView && window.LocalItabBookmarkImportView) {
        window.bookmarkImportView = window.LocalItabBookmarkImportView.mount(document.getElementById('bookmark-import'), {
            prepare: prepareBookmarkImport, apply: applyBookmarkImport
        });
    }
}

// Serialize background-only writes while the newest request owns the controls.
// A rejected operation must not poison the next upload/removal/type-change attempt.
let backgroundMutationQueue = Promise.resolve();
let backgroundRequest = 0;
function queueBackgroundTask(operation) {
    const request = ++backgroundRequest;
    const isCurrent = () => request === backgroundRequest;
    const result = backgroundMutationQueue.then(() => operation(isCurrent));
    backgroundMutationQueue = result.catch(() => {});
    return result;
}

function normalizeThemePreset(preset) {
    if (typeof preset !== 'string') return 'aurora-glass';
    return THEME_PRESETS.includes(preset) ? preset : 'aurora-glass';
}
function applyThemePreset(preset) {
    const normalized = normalizeThemePreset(preset);
    document.documentElement.dataset.theme = normalized;
    document.body.dataset.theme = normalized;
    return normalized;
}

function normalizeSearchTemplateForOptions(rawTemplate) {
    if (window.LocalItabSearch?.normalizeSearchTemplate) {
        return window.LocalItabSearch.normalizeSearchTemplate(rawTemplate);
    }

    const value = String(rawTemplate || '').trim();
    if (!value) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS URLs are supported');
    }
    return parsed.toString();
}

function setupSettingsTabs() {
    const tabs = Array.from(document.querySelectorAll('.tab-button'));
    const panels = Array.from(document.querySelectorAll('.tab-panel'));
    if (!tabs.length || !panels.length) return;

    const activateTab = (tabId) => {
        tabs.forEach(btn => {
            const isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.tabIndex = isActive ? 0 : -1;
        });

        panels.forEach(panel => {
            const isActive = panel.dataset.tab === tabId;
            panel.classList.toggle('active', isActive);
        });

        const content = document.querySelector('.options-content');
        if (content) content.scrollTop = 0;
    };

    // The sidebar becomes a wrapped horizontal tablist at the CSS breakpoint.
    const tablist = document.querySelector('.options-tabs');
    const compactTabs = window.matchMedia?.('(max-width: 960px)');
    const updateTabOrientation = () => tablist?.setAttribute('aria-orientation', compactTabs?.matches ? 'horizontal' : 'vertical');
    updateTabOrientation();
    compactTabs?.addEventListener('change', updateTabOrientation);
    tabs.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            activateTab(btn.dataset.tab);
        });
        btn.addEventListener('keydown', event => {
            if (event.target !== btn || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
            const horizontal = compactTabs?.matches === true;
            const previous = horizontal ? 'ArrowLeft' : 'ArrowUp';
            const next = horizontal ? 'ArrowRight' : 'ArrowDown';
            let targetIndex;
            if (event.key === previous) targetIndex = (index + tabs.length - 1) % tabs.length;
            else if (event.key === next) targetIndex = (index + 1) % tabs.length;
            else if (event.key === 'Home') targetIndex = 0;
            else if (event.key === 'End') targetIndex = tabs.length - 1;
            else return; // Keep native Enter/Space clicks and ordinary Tab navigation.
            event.preventDefault();
            activateTab(tabs[targetIndex].dataset.tab);
            tabs[targetIndex].focus();
        });
    });

    const hash = window.location.hash ? window.location.hash.slice(1) : '';
    if (hash) {
        const targetSection = document.getElementById(hash);
        const targetPanel = targetSection?.closest('.tab-panel');
        if (targetPanel?.dataset.tab) {
            activateTab(targetPanel.dataset.tab);
            setTimeout(() => {
                targetSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
            return;
        }
    }

    activateTab(tabs[0].dataset.tab);
}

function setupCloudSyncChangeListener() {
    if (!chrome?.storage?.onChanged || !window.storageManager?.syncMetaKey) return;
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName === 'local' && changes[storageManager.syncIdentityStateKey]) {
            await renderSyncStatus().catch(error => console.warn('Sync status unavailable:', error));
            return;
        }
        if (areaName !== 'sync' || !Object.keys(changes).some(key => key === storageManager.syncMetaKey || key.startsWith(storageManager.syncChunkPrefix))) return;
        try {
            if (await storageManager.shouldIgnoreRemoteSyncChange?.(changes)) return;
            const result = await storageManager.pullFromSync();
            if (result?.applied) {
                showMessage(t('syncRemoteUpdated', '云端设置已更新，正在重新加载...'), 'info');
                setTimeout(() => window.LocalItabContentLifecycle.reload(), 800);
            } else {
                await renderSyncStatus(result?.status);
            }
        } catch (error) {
            console.warn('Cloud sync change handling failed:', error);
            await renderSyncStatus();
        }
    });
}

function syncDashboardPaddingControls() {
    const paddingInputs = [
        document.getElementById('dashboard-padding-top'),
        document.getElementById('dashboard-padding-right'),
        document.getElementById('dashboard-padding-bottom'),
        document.getElementById('dashboard-padding-left')
    ];
    const paddingAuto = document.getElementById('dashboard-padding-auto');
    if (!paddingAuto || paddingInputs.every(input => !input)) return;
    const isAuto = !!paddingAuto.checked;
    paddingInputs.forEach(input => {
        if (input) input.disabled = isAuto;
    });
}

function syncShortcutTitleColorControls() {
    const titleColorInput = document.getElementById('shortcut-title-color');
    const titleColorTextInput = document.getElementById('shortcut-title-color-text');
    const titleColorAuto = document.getElementById('shortcut-title-color-auto');
    if (!titleColorAuto || !titleColorInput || !titleColorTextInput) return;
    const isAuto = !!titleColorAuto.checked;
    titleColorInput.disabled = isAuto;
    titleColorTextInput.disabled = isAuto;
}

async function requestOptionalOrigin(origin) {
    if (!origin || !chrome?.permissions?.request) return false;
    try {
        return await chrome.permissions.request({ origins: [origin] });
    } catch (error) {
        console.warn('Optional permission request failed:', error);
        return false;
    }
}

async function ensurePrivacyPermission(kind, enabled) {
    if (!enabled) return true;
    const origin = PRIVACY_PERMISSION_ORIGINS[kind];
    return requestOptionalOrigin(origin);
}

function hasOptionalOriginPermission(origin) {
    return new Promise(resolve => {
        if (!chrome?.permissions?.contains) {
            resolve(false);
            return;
        }

        let settled = false;
        const done = (granted) => {
            if (settled) return;
            settled = true;
            resolve(granted === true);
        };

        try {
            const maybePromise = chrome.permissions.contains({ origins: [origin] }, done);
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(done).catch(() => done(false));
            }
        } catch (_) {
            done(false);
        }
    });
}

async function reconcilePrivacyPermissions(config) {
    const privacy = { ...(config.privacy || {}) };
    delete privacy.onlineWallpapers;
    const effectivePrivacy = { ...privacy };


    if (effectivePrivacy.onlineFavicons === true && !(await hasOptionalOriginPermission(PRIVACY_PERMISSION_ORIGINS.favicons))) {
        effectivePrivacy.onlineFavicons = false;
    }

    config.effectivePrivacy = effectivePrivacy;
    return config;
}

function setPrivacyPermissionMetadata(input, config, key) {
    if (!input) return;
    const storedEnabled = config.privacy?.[key] === true;
    const effectiveEnabled = (config.effectivePrivacy || config.privacy)?.[key] === true;
    input.dataset.permissionMissing = storedEnabled && !effectiveEnabled ? 'true' : 'false';
}

function refreshPrivacyPermissionHints() {
    [
        {
            id: 'privacy-online-favicons',
            key: 'onlineFaviconsPermissionMissing',
            fallback: 'Permission is not granted on this device, so this synced setting is not active here.'
        }
    ].forEach(({ id, key, fallback }) => {
        const input = document.getElementById(id);
        const desc = input?.closest?.('.setting-label')?.querySelector?.('.setting-desc');
        if (!input || !desc) return;

        if (!desc.dataset.permissionBaseText) {
            desc.dataset.permissionBaseText = desc.textContent.trim();
        }

        const baseKey = desc.getAttribute('data-i18n');
        const baseText = baseKey ? t(baseKey, desc.dataset.permissionBaseText) : desc.dataset.permissionBaseText;
        const warning = t(key, fallback);
        const missing = input.dataset.permissionMissing === 'true';
        desc.textContent = missing ? `${baseText} ${warning}` : baseText;
        input.title = missing ? warning : '';
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    console.log('Local iTab options page loaded');
    
    try {
        // Initialize options page with stored data
        await initializeOptionsPage();
        
        // Set up event listeners
        setupEventListeners();

        // Initialize tabbed layout
        setupSettingsTabs();
        setupCloudSyncChangeListener();
        
        // Apply i18n to DOM
        if (window.i18n) {
            window.i18n.localizeDocument(document);
        }

        // Display storage usage info
        await displayStorageInfo();
        await renderSyncStatus();
        await renderDriveBackupPanel();

        refreshPrivacyPermissionHints();
    } catch (error) {
        console.error('Error initializing options page:', error);
        showErrorMessage('Failed to load settings. Please try refreshing the page.');
    }
});

async function initializeOptionsPage() {
    try {
        // Load all configuration data from storage
        const config = await reconcilePrivacyPermissions(await storageManager.getAll());
        
        // Populate form fields with current values
        await populateFormFields(config);
        setupCategoryManagement(config.categories);
        setupBookmarkImport();
        const focusHost = document.getElementById('local-focus-settings');
        if (focusHost && window.LocalItabFocus && !window.localFocusSettingsView) {
            window.localFocusSettingsView = window.LocalItabFocus.mountSettings(focusHost);
        }
        const tasksHost = document.getElementById('local-tasks-settings');
        if (tasksHost && window.LocalItabTasks && !window.localTasksSettingsController) {
            window.localTasksSettingsController = window.LocalItabTasks.mountSettings(tasksHost);
        }
        if (!window.workspacePresetsView && window.LocalItabWorkspace) {
            window.workspacePresetsView = window.LocalItabWorkspace.mount(document.getElementById('workspace-presets'));
        }
        await populateSyncControls(config.sync);

        console.log('Options page initialized with config:', config);
    } catch (error) {
        console.error('Error in initializeOptionsPage:', error);
        throw error;
    }
}

async function populateFormFields(config) {
    applyThemePreset(config.themePreset);
    if (window.LocalItabAppearance) {
        if (window.appearanceController) await window.appearanceController.refresh();
        else window.appearanceController = window.LocalItabAppearance.mount(document.getElementById('options-appearance'), {
            initial: config.appearance,
            onError: error => console.warn('Appearance save/read failed:', error)
        });
    }

    // Time settings
    const hour12Checkbox = document.getElementById('hour12-format');
    const showSecondsCheckbox = document.getElementById('show-seconds');
    
    if (hour12Checkbox) hour12Checkbox.checked = config.clock.hour12;
    if (showSecondsCheckbox) showSecondsCheckbox.checked = config.clock.showSeconds;
    

    
    // Background settings
    const bgTypeSelect = document.getElementById('bg-type');
    const bgColorInput = document.getElementById('bg-color');
    const bgColorTextInput = document.getElementById('bg-color-text');
    
    if (bgTypeSelect) {
        setBackgroundTypeSelection(bgTypeSelect, config.bg.type === 'api' ? 'gradient' : config.bg.type);
        updateBackgroundSections();
    }
    if (bgColorInput && config.bg.type === 'color') {
        bgColorInput.value = config.bg.value || '#1a1a1a';
        if (bgColorTextInput) bgColorTextInput.value = config.bg.value || '#1a1a1a';
    }
    
    // Update background image preview if exists
    if (config.bg.type === 'image' && config.bg.value) {
        updateBackgroundImagePreview(config.bg.value);
    }
    
    // Visibility settings
    const showClockCheckbox = document.getElementById('show-clock');
    const showSearchCheckbox = document.getElementById('show-search');
    const showShortcutsCheckbox = document.getElementById('show-shortcuts');
    const showShortcutTitlesCheckbox = document.getElementById('show-shortcut-titles');
    const showWeatherCheckbox = document.getElementById('show-weather');
    const showHotCheckbox = document.getElementById('show-hot');
    const showMovieCheckbox = document.getElementById('show-movie');

    if (showClockCheckbox) showClockCheckbox.checked = config.show.clock;
    if (showSearchCheckbox) showSearchCheckbox.checked = config.show.search !== false;
    if (showShortcutsCheckbox) showShortcutsCheckbox.checked = config.show.shortcuts;
    if (showWeatherCheckbox) showWeatherCheckbox.checked = config.show.weather === true;
    if (showHotCheckbox) showHotCheckbox.checked = config.show.hot === true;
    if (showMovieCheckbox) showMovieCheckbox.checked = config.show.movie === true;
    if (showShortcutTitlesCheckbox) {
        showShortcutTitlesCheckbox.checked = config.ui?.showShortcutTitles !== false;
    }
    

    

    
    // Quote setting
    const quoteInput = document.getElementById('quote-text');
    if (quoteInput) quoteInput.value = config.quote;

    const searchEngine = document.getElementById('search-engine');
    const searchCustom = document.getElementById('search-custom');
    if (searchEngine) searchEngine.value = config.search?.engine || 'google';
    if (searchCustom) searchCustom.value = config.search?.custom || '';

    const onlineFavicons = document.getElementById('privacy-online-favicons');
    if (onlineFavicons) {
        onlineFavicons.checked = config.privacy?.onlineFavicons === true;
        setPrivacyPermissionMetadata(onlineFavicons, config, 'onlineFavicons');
    }

    const weather = config.weather || {};
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };
    setValue('weather-city', weather.city);
    setValue('weather-temp', weather.temp);
    setValue('weather-condition', weather.cond);
    setValue('weather-aqi-label', weather.aqiLabel);
    setValue('weather-aqi', weather.aqi);
    setValue('weather-low', weather.low);
    setValue('weather-high', weather.high);
    setValue('hot-topics-tab', config.hot?.tab || 'baidu');
    setValue('movie-title', config.movie?.title);
    setValue('movie-note', config.movie?.note);
    if (config.movie?.poster) updateMoviePosterPreview(config.movie.poster);
    populateHotTopicsLists(config.hot || storageManager.defaultConfig.hot);
    switchHotTopicsTab(config.hot?.tab || 'baidu');

    // Dedicated layout controls persist patches; Save Settings does not replay them.
    if (window.LocalItabLayout) {
        if (window.layoutController) await window.layoutController.refresh();
        else {
            window.layoutController = new window.LocalItabLayout.Controller({
                initial: config.layout,
                baseline: config._layoutBaseline,
                onError: error => console.warn('Layout save/read failed:', error)
            });
            window.LocalItabLayout.mount(document.getElementById('options-layout'), window.layoutController, {
                columns: document.getElementById('layout-columns'),
                gridSize: document.getElementById('layout-grid-size')
            });
        }
    }

    const shortcutsStyle = config.ui?.shortcutsStyle || {};
    const gapXInput = document.getElementById('shortcuts-gap-x');
    const gapYInput = document.getElementById('shortcuts-gap-y');
    const iconSizeInput = document.getElementById('shortcut-icon-size');
    const titleSizeInput = document.getElementById('shortcut-title-size');
    if (gapXInput) gapXInput.value = Number.isFinite(shortcutsStyle.gapX) ? shortcutsStyle.gapX : '';
    if (gapYInput) gapYInput.value = Number.isFinite(shortcutsStyle.gapY) ? shortcutsStyle.gapY : '';
    if (iconSizeInput) iconSizeInput.value = Number.isFinite(shortcutsStyle.iconSize) ? shortcutsStyle.iconSize : '';
    if (titleSizeInput) titleSizeInput.value = Number.isFinite(shortcutsStyle.titleSize) ? shortcutsStyle.titleSize : '';

    const titleColorInput = document.getElementById('shortcut-title-color');
    const titleColorTextInput = document.getElementById('shortcut-title-color-text');
    const titleColorAuto = document.getElementById('shortcut-title-color-auto');
    if (titleColorInput && titleColorTextInput && titleColorAuto) {
        const color = typeof shortcutsStyle.titleColor === 'string' ? shortcutsStyle.titleColor.trim() : '';
        const hasColor = color.length > 0;
        titleColorAuto.checked = !hasColor;
        const fallbackColor = '#ffffff';
        const effectiveColor = hasColor ? color : fallbackColor;
        titleColorInput.value = effectiveColor;
        titleColorTextInput.value = hasColor ? color : '';
        syncShortcutTitleColorControls();
    }

    const paddingTopInput = document.getElementById('dashboard-padding-top');
    const paddingRightInput = document.getElementById('dashboard-padding-right');
    const paddingBottomInput = document.getElementById('dashboard-padding-bottom');
    const paddingLeftInput = document.getElementById('dashboard-padding-left');
    const paddingAuto = document.getElementById('dashboard-padding-auto');
    if (paddingAuto && (paddingTopInput || paddingRightInput || paddingBottomInput || paddingLeftInput)) {
        const paddingValue = config.ui?.dashboardPadding;
        let paddingObj = null;
        if (typeof paddingValue === 'number' && Number.isFinite(paddingValue)) {
            paddingObj = {
                top: paddingValue,
                right: paddingValue,
                bottom: paddingValue,
                left: paddingValue
            };
        } else if (paddingValue && typeof paddingValue === 'object') {
            paddingObj = {
                top: paddingValue.top,
                right: paddingValue.right,
                bottom: paddingValue.bottom,
                left: paddingValue.left
            };
        }

        const hasCustom = paddingObj && Object.values(paddingObj).some(val => typeof val === 'number' && Number.isFinite(val));
        paddingAuto.checked = !hasCustom;
        const fallback = 28;
        if (paddingTopInput) paddingTopInput.value = (hasCustom && Number.isFinite(paddingObj.top)) ? paddingObj.top : fallback;
        if (paddingRightInput) paddingRightInput.value = (hasCustom && Number.isFinite(paddingObj.right)) ? paddingObj.right : fallback;
        if (paddingBottomInput) paddingBottomInput.value = (hasCustom && Number.isFinite(paddingObj.bottom)) ? paddingObj.bottom : fallback;
        if (paddingLeftInput) paddingLeftInput.value = (hasCustom && Number.isFinite(paddingObj.left)) ? paddingObj.left : fallback;
        syncDashboardPaddingControls();
    }
}

async function populateSyncControls(syncConfig) {
    const syncToggle = document.getElementById('cloud-sync-enabled');
    if (!syncToggle) return;

    const status = await storageManager.getSyncStatus();
    syncToggle.checked = !!(syncConfig?.enabled || status.enabled);
    syncToggle.disabled = !status.available;

    await renderSyncStatus(status);
}

function setupCategoryManagement(categories = []) {
    const list = document.getElementById('category-manage-list');
    const addBtn = document.getElementById('add-category');
    if (!list || !addBtn) return;

    const createItem = (cat) => {
        const li = document.createElement('li');
        li.className = 'category-manage-item';
        li.dataset.id = cat.id;
        const iconInput = document.createElement('input');
        iconInput.type = 'text';
        iconInput.className = 'form-input cat-icon';
        iconInput.value = cat.icon || '';
        iconInput.setAttribute('aria-label', 'icon');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-input cat-name';
        nameInput.value = cat.name || '';
        nameInput.setAttribute('aria-label', 'name');
        const actions = document.createElement('div');
        actions.className = 'category-actions';
        [
            ['cat-up', '上移', '↑', 'btn btn-secondary btn-sm cat-up'],
            ['cat-down', '下移', '↓', 'btn btn-secondary btn-sm cat-down'],
            ['cat-delete', '删除', '✕', 'btn btn-danger btn-sm cat-delete']
        ].forEach(([, title, text, className]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className;
            button.title = title;
            button.textContent = text;
            actions.appendChild(button);
        });
        li.append(iconInput, nameInput, actions);
        return li;
    };

    const render = (cats) => {
        list.replaceChildren();
        cats.forEach(c => list.appendChild(createItem(c)));
    };

    render(categories);
    categoryBaseline = categorySnapshot(getCategoriesFromDOM());
    categoryRawBaseline = bookmarkCategorySignature();
    // Reinitializing this form must not duplicate listeners or leave old timers.
    clearTimeout(categorySaveTimeout);
    if (list.dataset.categoryBound) return;
    list.dataset.categoryBound = 'true';
    const scheduleSave = () => {
        clearTimeout(categorySaveTimeout);
        categorySaveTimeout = setTimeout(() => saveAllSettings(), 800);
    };

    addBtn.addEventListener('click', () => {
        const newCat = { id: `cat_${Date.now()}`, name: '新分类', icon: '📁' };
        list.appendChild(createItem(newCat));
        scheduleSave();
    });

    list.addEventListener('click', (e) => {
        const li = e.target.closest('.category-manage-item');
        if (!li) return;
        if (e.target.classList.contains('cat-delete')) {
            li.remove();
            scheduleSave();
        } else if (e.target.classList.contains('cat-up')) {
            const prev = li.previousElementSibling;
            if (prev) list.insertBefore(li, prev);
            scheduleSave();
        } else if (e.target.classList.contains('cat-down')) {
            const next = li.nextElementSibling;
            if (next) list.insertBefore(next, li);
            scheduleSave();
        }
    });

    list.addEventListener('input', scheduleSave);
}

function getCategoriesFromDOM() {
    const items = document.querySelectorAll('#category-manage-list .category-manage-item');
    return Array.from(items).map(li => {
        const id = li.dataset.id || `cat_${Date.now()}`;
        const icon = li.querySelector('.cat-icon').value.trim() || '📁';
        const name = li.querySelector('.cat-name').value.trim();
        return { id, icon, name };
    }).filter(c => c.name);
}

function setupEventListeners() {
    // Back to dashboard button
    const backButton = document.getElementById('back-to-dashboard');
    if (backButton) {
        backButton.addEventListener('click', function() {
            // Close the options page and return to the new tab page
            if (chrome.tabs) {
                chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                    chrome.tabs.update(tabs[0].id, {url: chrome.runtime.getURL('newtab.html')});
                });
            } else {
                // Fallback for when chrome.tabs is not available
                window.location.href = 'newtab.html';
            }
        });
    }
    
    // Save settings button
    const saveButton = document.getElementById('save-settings');
    if (saveButton) {
        saveButton.addEventListener('click', async function() {
            await saveAllSettings();
        });
    }
    
    // Reset settings button
    const resetButton = document.getElementById('reset-settings');
    if (resetButton) {
        resetButton.addEventListener('click', async function() {
            if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
                await resetAllSettings();
            }
        });
    }
    
    // Export settings button
    const exportButton = document.getElementById('export-settings');
    if (exportButton) {
        exportButton.addEventListener('click', async function() {
            await exportSettings();
        });
    }
    
    // Import settings button (trigger file input)
    const importButton = document.getElementById('import-settings-btn');
    const importInput = document.getElementById('import-settings');
    if (importButton && importInput) {
        importButton.addEventListener('click', function() {
            importInput.click();
        });
        
        importInput.addEventListener('change', async function(event) {
            await importSettings(event.target.files[0]);
        });
    }

    setupDriveBackupEventListeners();
    document.getElementById('sync-replace-local')?.addEventListener('click', replaceLocalFromCloud);
    for (const kind of ['original', 'latest']) document.getElementById(`recovery-${kind}`)?.addEventListener('click', () => downloadRecoveryBackup(kind));
    renderRecoveryControls().catch(error => console.warn('Recovery status unavailable:', error));

    // Chrome cloud sync controls
    const syncToggle = document.getElementById('cloud-sync-enabled');
    const syncUpload = document.getElementById('sync-upload-now');
    const syncDownload = document.getElementById('sync-download-now');
    const syncClear = document.getElementById('sync-clear-cloud');
    const onlineFavicons = document.getElementById('privacy-online-favicons');

    if (syncToggle) {
        syncToggle.addEventListener('change', async () => {
            try {
                syncToggle.disabled = true;
                if (syncToggle.checked) {
                    showMessage(t('syncEnableStart', '正在启用 Chrome 同步...'), 'info');
                    const status = await storageManager.setSyncEnabled(true);
                    showMessage(t('syncEnableDone', 'Chrome 同步已启用，当前设置已上传。'), 'success');
                    await renderSyncStatus(status);
                } else {
                    const current = await storageManager.getSyncStatus();
                    if (current.compatibilityBlocked && !confirm(t('syncBlockedClearConfirm', 'This removes the conflicting cloud copy and keeps this device. A readable cloud copy must be saved locally for recovery first. Other devices may upload again. Continue?'))) { syncToggle.checked = current.enabled; return; }
                    showMessage(t('syncDisableStart', '正在停用 Chrome 同步...'), 'info');
                    const status = await storageManager.setSyncEnabled(false);
                    showMessage(t('syncDisableDone', '此配置中的 Chrome 同步已停用。'), 'success');
                    await renderSyncStatus(status);
                }
            } catch (error) {
                console.error('Cloud sync toggle error:', error);
                syncToggle.checked = (await storageManager.getSyncStatus()).enabled;
                showMessage(t('syncFailed', 'Chrome 同步失败：$1', error.message), 'error');
                await renderSyncStatus();
            } finally {
                const status = await storageManager.getSyncStatus();
                syncToggle.disabled = !status.available;
            }
        });
    }

    if (syncUpload) {
        syncUpload.addEventListener('click', async () => {
            try {
                showMessage(t('syncUploadStart', '正在上传设置到 Chrome 同步...'), 'info');
                const status = await storageManager.pushToSync();
                showMessage(t('syncUploadDone', '设置已上传到 Chrome 同步。'), 'success');
                await renderSyncStatus(status);
            } catch (error) {
                console.error('Cloud sync upload error:', error);
                showMessage(t('syncUploadFailed', '上传失败：$1', error.message), 'error');
                await renderSyncStatus();
            }
        });
    }

    if (syncDownload) {
        syncDownload.addEventListener('click', async () => {
            try {
                showMessage(t('syncDownloadStart', '正在从 Chrome 同步下载设置...'), 'info');
                const result = await storageManager.pullFromSync();
                if (result.applied) {
                    showMessage(t('syncDownloadDone', '云端设置已应用，正在重新加载...'), 'success');
                    setTimeout(() => window.LocalItabContentLifecycle.reload(), 800);
                } else {
                    showMessage(t('syncAlreadyUpToDate', '已经是最新。'), 'success');
                    await renderSyncStatus(result.status);
                }
            } catch (error) {
                console.error('Cloud sync download error:', error);
                showMessage(t('syncDownloadFailed', '下载失败：$1', error.message), 'error');
                await renderSyncStatus();
            }
        });
    }

    if (syncClear) {
        syncClear.addEventListener('click', async () => {
            const current = await storageManager.getSyncStatus();
            if (!confirm(current.compatibilityBlocked ? t('syncBlockedClearConfirm', 'This removes the conflicting cloud copy and keeps this device. A readable cloud copy must be saved locally for recovery first. Other devices may upload again. Continue?') : t('syncClearConfirm', '清除 Chrome 同步中的云端副本？本机设置会保留。'))) return;
            try {
                showMessage(t('syncClearStart', '正在清除云端副本...'), 'info');
                const status = await storageManager.clearSync();
                const syncToggleEl = document.getElementById('cloud-sync-enabled');
                if (syncToggleEl) syncToggleEl.checked = false;
                showMessage(t('syncClearDone', '云端副本已清除。'), 'success');
                await renderSyncStatus(status);
            } catch (error) {
                console.error('Cloud sync clear error:', error);
                showMessage(t('syncClearFailed', '清除失败：$1', error.message), 'error');
                await renderSyncStatus();
            }
        });
    }


    if (onlineFavicons) {
        onlineFavicons.addEventListener('change', async () => {
            if (onlineFavicons.checked && !(await ensurePrivacyPermission('favicons', true))) {
                onlineFavicons.checked = false;
                showMessage('Online favicon permission was not granted.', 'error');
            }
            onlineFavicons.dataset.permissionMissing = 'false';
            refreshPrivacyPermissionHints();
            await saveAllSettings();
        });
    }


    // Dashboard padding controls
    const paddingInputs = [
        document.getElementById('dashboard-padding-top'),
        document.getElementById('dashboard-padding-right'),
        document.getElementById('dashboard-padding-bottom'),
        document.getElementById('dashboard-padding-left')
    ];
    const paddingAuto = document.getElementById('dashboard-padding-auto');
    if (paddingAuto && paddingInputs.some(input => input)) {
        paddingAuto.addEventListener('change', () => {
            syncDashboardPaddingControls();
        });
        paddingInputs.forEach(input => {
            if (!input) return;
            input.addEventListener('input', () => {
                if (paddingAuto.checked) return;
                const max = parseInt(input.max, 10);
                const min = parseInt(input.min, 10);
                let value = parseInt(input.value, 10);
                if (!Number.isFinite(value)) return;
                if (Number.isFinite(min) && value < min) value = min;
                if (Number.isFinite(max) && value > max) value = max;
                input.value = value;
            });
        });
    }

    const clampNumberInput = (input) => {
        if (!input || input.value === '') return;
        const max = parseInt(input.max, 10);
        const min = parseInt(input.min, 10);
        let value = parseInt(input.value, 10);
        if (!Number.isFinite(value)) return;
        if (Number.isFinite(min) && value < min) value = min;
        if (Number.isFinite(max) && value > max) value = max;
        input.value = value;
    };

    const shortcutsGapX = document.getElementById('shortcuts-gap-x');
    const shortcutsGapY = document.getElementById('shortcuts-gap-y');
    const shortcutIconSize = document.getElementById('shortcut-icon-size');
    const shortcutTitleSize = document.getElementById('shortcut-title-size');
    [shortcutsGapX, shortcutsGapY, shortcutIconSize, shortcutTitleSize].forEach(input => {
        if (!input) return;
        input.addEventListener('input', () => clampNumberInput(input));
    });

    const titleColorInput = document.getElementById('shortcut-title-color');
    const titleColorTextInput = document.getElementById('shortcut-title-color-text');
    const titleColorAuto = document.getElementById('shortcut-title-color-auto');
    if (titleColorInput && titleColorTextInput && titleColorAuto) {
        titleColorAuto.addEventListener('change', () => {
            syncShortcutTitleColorControls();
        });
        const syncColorToText = () => {
            titleColorTextInput.value = titleColorInput.value;
        };
        titleColorInput.addEventListener('input', syncColorToText);
        titleColorInput.addEventListener('change', syncColorToText);
        titleColorTextInput.addEventListener('change', () => {
            let v = titleColorTextInput.value.trim();
            if (/^[0-9A-F]{3}$/i.test(v)) v = '#' + v;
            if (/^[0-9A-F]{6}$/i.test(v)) v = '#' + v;
            if (/^#[0-9A-F]{3}([0-9A-F]{3})?$/i.test(v)) {
                titleColorInput.value = v;
                titleColorTextInput.value = v;
            }
        });
    }

    // Background type selector
    const bgTypeSelect = document.getElementById('bg-type');
    if (bgTypeSelect) {
        bgTypeSelect.addEventListener('change', async function() {
            updateBackgroundSections();
            await saveBackgroundSettings();
        });
    }
    
    // Background color picker and text input sync
    const bgColorInput = document.getElementById('bg-color');
    const bgColorTextInput = document.getElementById('bg-color-text');
    if (bgColorInput && bgColorTextInput) {
        // sync color -> text and save immediately
        const saveColor = async () => {
            bgColorTextInput.value = bgColorInput.value;
            await saveBackgroundSettings();
        };
        bgColorInput.addEventListener('input', saveColor);
        bgColorInput.addEventListener('change', saveColor);
        
        bgColorTextInput.addEventListener('change', async function() {
            let v = bgColorTextInput.value.trim();
            // Normalize values like fff or FFFFFF
            if (/^[0-9A-F]{3}$/i.test(v)) v = '#' + v;
            if (/^[0-9A-F]{6}$/i.test(v)) v = '#' + v;
            if (/^#[0-9A-F]{6}$/i.test(v)) {
                bgColorInput.value = v;
                bgColorTextInput.value = v;
                await saveBackgroundSettings();
            }
        });
    }
    
    // Background image upload
    const bgImageInput = document.getElementById('bg-image-upload');
    if (bgImageInput) {
        bgImageInput.addEventListener('change', async function(event) {
            await handleBackgroundImageUpload(event.target.files[0]);
        });
    }

    // Click upload area to open file dialog
    const bgUploadArea = document.getElementById('bg-upload-area');
    if (bgUploadArea && bgImageInput) {
        bgUploadArea.addEventListener('click', function() {
            bgImageInput.click();
        });
        // Drag & drop support
        bgUploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
        });
        bgUploadArea.addEventListener('drop', async function(e) {
            e.preventDefault();
            const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) {
                await handleBackgroundImageUpload(file);
            }
        });
    }
    
    // Remove background image button
    const removeBgBtn = document.getElementById('remove-bg-image');
    if (removeBgBtn) {
        removeBgBtn.addEventListener('click', async function() {
            await removeBackgroundImage();
        });
    }
    

    
    // Hot topics tab switching
    const topicTabs = document.querySelectorAll('.topic-tab');
    topicTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            switchHotTopicsTab(tab.dataset.tab);
        });
    });
    
    // Hot topics add buttons
    const addTopicButtons = document.querySelectorAll('.add-topic-btn');
    addTopicButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const topicList = btn.closest('.topic-list');
            const titleInput = topicList.querySelector('.topic-title-input');
            const scoreInput = topicList.querySelector('.topic-score-input');
            const tabType = topicList.id.replace('-topics', '');
            
            addHotTopic(tabType, titleInput.value, parseInt(scoreInput.value) || 0);
            titleInput.value = '';
            scoreInput.value = '';
        });
    });
    
    // Auto-save for form inputs (debounced)
    setupAutoSave();
}

function getDriveBackupManager() {
    return window.driveBackupManager || null;
}

function createStatusRow(label, value, extraClass = '') {
    const row = document.createElement('div');
    row.className = 'sync-status-row';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    if (extraClass) valueEl.className = extraClass;
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    return row;
}

function formatDateTime(value) {
    if (!value) return t('never', '从未');
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? t('unknown', '未知') : date.toLocaleString();
}

function getDriveAvailability(manager) {
    if (!manager) {
        return {
            available: false,
            apiAvailable: false,
            storageAvailable: false,
            oauthConfigured: false,
            reason: 'managerUnavailable'
        };
    }

    if (typeof manager.getAvailabilityStatus === 'function') {
        return manager.getAvailabilityStatus();
    }

    const apiAvailable = manager.isAvailable?.() === true;
    return {
        available: apiAvailable && manager.hasConfiguredOAuthClient?.() !== false,
        apiAvailable,
        storageAvailable: apiAvailable,
        oauthConfigured: manager.hasConfiguredOAuthClient?.() !== false,
        reason: apiAvailable ? 'ready' : 'chromeUnavailable'
    };
}

function getDriveAvailabilityLabel(availability, state) {
    if (!availability.apiAvailable) {
        if (availability.reason === 'identityUnavailable') {
            return t('driveStatusIdentityUnavailable', '请重新加载扩展');
        }
        if (availability.reason === 'storageUnavailable') {
            return t('driveStatusStorageUnavailable', '存储不可用');
        }
        if (availability.reason === 'fetchUnavailable') {
            return t('driveStatusNetworkUnavailable', '网络不可用');
        }
        return t('driveStatusUnavailable', '不可用');
    }

    if (!availability.oauthConfigured) {
        return t('driveStatusOAuthNeeded', '需要配置 OAuth 客户端');
    }

    return state?.connectedAt
        ? t('driveStatusConnected', '已连接')
        : t('driveStatusNotConnected', '未连接');
}

function setDriveActionsDisabled(disabled) {
    ['drive-connect', 'drive-backup-now', 'drive-refresh-list', 'drive-rename-device', 'drive-add-device', 'drive-device-select'].forEach(id => {
        const control = document.getElementById(id);
        if (control) control.disabled = disabled;
    });
    document.querySelectorAll('[data-drive-action]').forEach(button => {
        button.disabled = disabled;
    });
}

async function renderDriveBackupPanel(snapshots = null) {
    const manager = getDriveBackupManager();
    const statusElement = document.getElementById('drive-backup-status');
    const historyElement = document.getElementById('drive-backup-history');
    const nameInput = document.getElementById('drive-device-name');
    const deviceSelect = document.getElementById('drive-device-select');
    if (!statusElement && !historyElement && !nameInput && !deviceSelect) return;

    if (!manager) {
        if (statusElement) {
            statusElement.replaceChildren(createStatusRow(t('syncStatus', '状态'), t('driveStatusUnavailable', '不可用'), 'is-error'));
        }
        setDriveActionsDisabled(true);
        return;
    }

    const availability = getDriveAvailability(manager);
    const apiReady = availability.apiAvailable === true;
    const oauthReady = apiReady && availability.oauthConfigured !== false;
    let state = null;
    try {
        state = availability.storageAvailable ? await manager.getState() : manager.normalizeState({});
    } catch (_) {
        state = manager.normalizeState({});
    }
    const connected = !!state.connectedAt;
    const knownDevices = Array.isArray(state.knownDevices) && state.knownDevices.length
        ? state.knownDevices
        : [{ id: state.deviceId, name: state.deviceName }];

    if (deviceSelect && document.activeElement !== deviceSelect) {
        const options = knownDevices.map(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name || t('driveUnknownDevice', '未知设备');
            return option;
        });
        deviceSelect.replaceChildren(...options);
        deviceSelect.value = state.deviceId;
    }

    if (nameInput && document.activeElement !== nameInput) {
        nameInput.value = state.deviceName || t('driveDevicePlaceholder', '家里的电脑');
    }

    const rows = [];
    const statusClass = (!apiReady || !oauthReady) ? 'is-error' : (connected ? 'is-on' : 'is-off');
    rows.push(createStatusRow(t('syncStatus', '状态'), getDriveAvailabilityLabel(availability, state), statusClass));
    rows.push(createStatusRow(t('driveActiveComputer', '当前备份电脑'), state.deviceName || t('driveUnknownDevice', '未知设备')));
    rows.push(createStatusRow(t('driveLatestBackup', '最近备份'), formatDateTime(state.lastBackupAt)));
    rows.push(createStatusRow(t('driveLatestRestore', '最近恢复'), formatDateTime(state.lastRestoreAt)));
    if (apiReady && !oauthReady) {
        const oauthNote = document.createElement('div');
        oauthNote.className = 'sync-status-note is-error';
        oauthNote.textContent = t('driveOAuthMissingHelp', '需要先在 manifest.json 中配置真实的 Google OAuth 客户端 ID，之后才能连接 Google 云盘。');
        rows.push(oauthNote);
    }
    if (state.lastError) {
        const error = document.createElement('div');
        error.className = 'sync-status-note is-error';
        error.textContent = state.lastError;
        rows.push(error);
    }
    if (statusElement) statusElement.replaceChildren(...rows);

    const connect = document.getElementById('drive-connect');
    const backup = document.getElementById('drive-backup-now');
    const refresh = document.getElementById('drive-refresh-list');
    const rename = document.getElementById('drive-rename-device');
    const addDevice = document.getElementById('drive-add-device');
    if (connect) connect.disabled = !apiReady || !oauthReady;
    if (backup) backup.disabled = !apiReady || !oauthReady || !connected;
    if (refresh) refresh.disabled = !apiReady || !oauthReady || !connected;
    if (rename) rename.disabled = !availability.storageAvailable;
    if (addDevice) addDevice.disabled = !availability.storageAvailable;
    if (deviceSelect) deviceSelect.disabled = !availability.storageAvailable;

    if (Array.isArray(snapshots)) {
        driveBackupSnapshots = snapshots;
    }
    renderDriveBackupHistory(driveBackupSnapshots, {
        ready: apiReady && oauthReady,
        connected,
        knownDevices,
        activeDeviceId: state.deviceId
    });
}

function renderDriveBackupHistory(snapshots, options = {}) {
    const manager = getDriveBackupManager();
    const historyElement = document.getElementById('drive-backup-history');
    if (!historyElement) return;

    const safeSnapshots = Array.isArray(snapshots) ? snapshots : [];
    const knownDevices = Array.isArray(options.knownDevices) ? options.knownDevices : [];
    const showEmptyDeviceGroups = knownDevices.length > 1;

    if (!manager || (safeSnapshots.length === 0 && !showEmptyDeviceGroups)) {
        const empty = document.createElement('div');
        empty.className = 'drive-empty-state';
        if (!options.ready) {
            empty.textContent = t('driveEmptyStateUnavailable', '此设备上的 Google 云盘备份尚未就绪。');
        } else if (!options.connected) {
            empty.textContent = t('driveEmptyState', '连接 Google 云盘后刷新，即可查看备份历史。');
        } else {
            empty.textContent = t('driveEmptyStateNoBackups', '还没有 Google 云盘备份。');
        }
        historyElement.replaceChildren(empty);
        return;
    }

    const groups = manager.groupSnapshotsByDevice(safeSnapshots, knownDevices);
    const groupEls = groups.map(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'drive-device-group';

        const header = document.createElement('div');
        header.className = 'drive-device-header';
        const titleWrap = document.createElement('div');
        titleWrap.className = 'drive-device-title';
        const title = document.createElement('strong');
        title.textContent = group.deviceName || t('driveUnknownDevice', '未知设备');
        titleWrap.appendChild(title);
        if (group.deviceId === options.activeDeviceId) {
            const badge = document.createElement('span');
            badge.className = 'drive-device-badge';
            badge.textContent = t('driveCurrentComputerBadge', '当前');
            titleWrap.appendChild(badge);
        }
        const count = document.createElement('span');
        count.textContent = t('driveBackupCount', '$1 个备份', String(group.snapshots.length));
        header.append(titleWrap, count);

        const list = document.createElement('div');
        list.className = 'drive-snapshot-list';
        if (group.snapshots.length) {
            group.snapshots.forEach(snapshot => {
                list.appendChild(createDriveSnapshotRow(snapshot));
            });
        } else {
            const empty = document.createElement('div');
            empty.className = 'drive-device-empty';
            empty.textContent = t('driveEmptyDevice', '这个电脑名称下还没有备份。');
            list.appendChild(empty);
        }

        groupEl.append(header, list);
        return groupEl;
    });

    historyElement.replaceChildren(...groupEls);
}

function createDriveSnapshotRow(snapshot) {
    const row = document.createElement('div');
    row.className = 'drive-snapshot-row';
    row.dataset.fileId = snapshot.id;

    const main = document.createElement('div');
    main.className = 'drive-snapshot-main';
    const date = document.createElement('strong');
    date.textContent = formatDateTime(snapshot.createdTime);
    const name = document.createElement('span');
    name.textContent = snapshot.name || snapshot.snapshotId || t('driveBackupSnapshot', '备份快照');
    main.append(date, name);

    const size = document.createElement('div');
    size.className = 'drive-snapshot-meta';
    size.textContent = formatBytes(snapshot.size);

    const shortcutCount = document.createElement('div');
    shortcutCount.className = 'drive-snapshot-meta';
    shortcutCount.textContent = t('driveShortcutCount', '$1 个快捷方式', String(snapshot.shortcutCount || 0));

    const actions = document.createElement('div');
    actions.className = 'drive-snapshot-actions';
    [
        ['restore', t('driveRestore', '恢复'), 'btn btn-primary btn-sm'],
        ['download', t('driveDownload', '下载'), 'btn btn-secondary btn-sm'],
        ['delete', t('delete', '删除'), 'btn btn-danger btn-sm']
    ].forEach(([action, label, className]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.dataset.driveAction = action;
        button.dataset.fileId = snapshot.id;
        button.textContent = label;
        actions.appendChild(button);
    });

    if (snapshot.localImagesIncluded) {
        const images = document.createElement('span');
        images.className = 'drive-snapshot-meta';
        images.textContent = t('driveIncludesLocalImages', '包含本地图片');
        main.appendChild(images);
    }

    row.append(main, size, shortcutCount, actions);
    return row;
}

function setupDriveBackupEventListeners() {
    const manager = getDriveBackupManager();
    if (!manager) return;

    const connect = document.getElementById('drive-connect');
    const deviceSelect = document.getElementById('drive-device-select');
    const addDevice = document.getElementById('drive-add-device');
    const rename = document.getElementById('drive-rename-device');
    const backup = document.getElementById('drive-backup-now');
    const refresh = document.getElementById('drive-refresh-list');
    const history = document.getElementById('drive-backup-history');

    if (connect) {
        connect.addEventListener('click', async () => {
            await runDriveAction(t('driveConnecting', '正在连接 Google 云盘...'), async () => {
                await manager.connect({ interactive: true });
                showMessage(t('driveConnected', 'Google 云盘已连接。'), 'success');
                try {
                    const snapshots = await manager.listSnapshots({ interactive: true });
                    await renderDriveBackupPanel(snapshots);
                } catch (error) {
                    await manager.setLastError(new Error(`Connected, but backup list refresh failed: ${error.message || String(error)}`));
                    await renderDriveBackupPanel();
                    showMessage(t('driveConnectedListFailed', '已连接，但备份列表刷新失败。'), 'error');
                }
            });
        });
    }

    if (deviceSelect) {
        deviceSelect.addEventListener('change', async () => {
            await runDriveAction(t('driveSelectingDevice', '正在切换电脑...'), async () => {
                await manager.selectDevice(deviceSelect.value);
                await renderDriveBackupPanel(driveBackupSnapshots);
                showMessage(t('driveDeviceSelected', '已切换电脑，后续备份会使用这个电脑名称。'), 'success');
            }, { keepButtons: true });
        });
    }

    if (addDevice) {
        addDevice.addEventListener('click', async () => {
            const input = document.getElementById('drive-device-name');
            const name = input?.value?.trim() || '';
            if (!name) {
                showMessage(t('driveDeviceNameRequired', '请先输入电脑名称。'), 'error');
                return;
            }

            await runDriveAction(t('driveAddingDevice', '正在添加电脑...'), async () => {
                const state = await manager.addDevice(name);
                await renderDriveBackupPanel(driveBackupSnapshots);
                const message = state?.deviceCreated === false
                    ? t('driveDeviceSelected', '已切换电脑，后续备份会使用这个电脑名称。')
                    : t('driveDeviceAdded', '电脑已添加，后续备份会归到这个名称下。');
                showMessage(message, 'success');
            }, { keepButtons: true });
        });
    }

    if (rename) {
        rename.addEventListener('click', async () => {
            const input = document.getElementById('drive-device-name');
            const name = input?.value?.trim() || '';
            if (!name) {
                showMessage(t('driveDeviceNameRequired', '请先输入电脑名称。'), 'error');
                return;
            }

            await runDriveAction(t('driveRenaming', '正在保存电脑名称...'), async () => {
                await manager.renameDevice(name);
                await renderDriveBackupPanel();
                showMessage(t('driveRenamed', '电脑名称已保存，后续备份将使用新名称。'), 'success');
            }, { keepButtons: true });
        });
    }

    if (backup) {
        backup.addEventListener('click', async () => {
            await runDriveAction(t('drivePreparingBackup', '正在准备 Google 云盘备份...'), async () => {
                const draft = await manager.createSnapshotDraft({ reason: 'manual' });
                if (draft.sizeBytes > manager.maximumSizeBytes) {
                    throw new Error(t('driveBackupTooLarge', '备份过大（$1）。请减少本地图片，或改用手动导出。', formatBytes(draft.sizeBytes)));
                }
                if (draft.sizeBytes > manager.warningSizeBytes) {
                    const proceed = confirm(t('driveLargeBackupConfirm', '备份较大（$1），上传可能需要一段时间。继续吗？', formatBytes(draft.sizeBytes)));
                    if (!proceed) {
                        showMessage(t('driveBackupCancelled', '已取消 Google 云盘备份。'), 'info');
                        return;
                    }
                }

                showMessage(t('driveUploading', '正在上传备份到 Google 云盘...'), 'info');
                const result = await manager.uploadSnapshotDraft(draft, { interactive: true });
                showMessage(t('driveBackupCreated', 'Google 云盘备份已创建。'), 'success');
                if (result?.pruneError) {
                    showMessage(t('driveCleanupFailed', '备份已创建，但旧快照清理失败。'), 'error');
                }
                try {
                    const snapshots = await manager.listSnapshots({ interactive: true });
                    await renderDriveBackupPanel(snapshots);
                } catch (error) {
                    await manager.setLastError(new Error(`Backup created, but list refresh failed: ${error.message || String(error)}`));
                    await renderDriveBackupPanel();
                    showMessage(t('driveBackupCreatedListFailed', '备份已创建，但列表刷新失败。'), 'error');
                }
            });
        });
    }

    if (refresh) {
        refresh.addEventListener('click', async () => {
            await refreshDriveBackupList(true);
        });
    }

    if (history) {
        history.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-drive-action]');
            if (!button) return;
            const snapshot = driveBackupSnapshots.find(item => item.id === button.dataset.fileId);
            if (!snapshot) return;

            if (button.dataset.driveAction === 'restore') {
                await restoreDriveSnapshot(snapshot);
            } else if (button.dataset.driveAction === 'download') {
                await downloadDriveSnapshot(snapshot);
            } else if (button.dataset.driveAction === 'delete') {
                await deleteDriveSnapshot(snapshot);
            }
        });
    }
}

async function runDriveAction(workingMessage, action, options = {}) {
    const manager = getDriveBackupManager();
    if (!manager) return;
    if (driveActionInProgress) {
        showMessage(t('driveActionRunning', '已有 Google 云盘操作正在进行。'), 'info');
        return;
    }

    driveActionInProgress = true;
    try {
        showMessage(workingMessage, 'info');
        if (!options.keepButtons) setDriveActionsDisabled(true);
        await action();
    } catch (error) {
        console.error('Google Drive backup error:', error);
        await manager.setLastError(error);
        showMessage(t('driveFailed', 'Google 云盘备份失败：$1', error.message), 'error');
        await renderDriveBackupPanel();
    } finally {
        driveActionInProgress = false;
        if (!options.keepButtons) await renderDriveBackupPanel();
    }
}

async function refreshDriveBackupList(interactive = true) {
    const manager = getDriveBackupManager();
    if (!manager) return;
    await runDriveAction(t('driveRefreshing', '正在刷新 Google 云盘备份...'), async () => {
        const snapshots = await manager.listSnapshots({ interactive });
        await renderDriveBackupPanel(snapshots);
        showMessage(t('driveListRefreshed', 'Google 云盘备份列表已刷新。'), 'success');
    });
}

async function createBeforeRestoreSafetyBackup() {
    const manager = getDriveBackupManager();
    const draft = await manager.createSnapshotDraft({ reason: 'beforeRestore' });
    if (draft.sizeBytes > manager.maximumSizeBytes) {
        throw new Error(t('driveSafetyBackupTooLarge', '安全备份过大（$1）。', formatBytes(draft.sizeBytes)));
    }
    return manager.uploadSnapshotDraft(draft, { interactive: true, prune: false });
}

async function restoreDriveSnapshot(snapshot) {
    const manager = getDriveBackupManager();
    if (!manager) return;

    const confirmed = confirm(t(
        'driveRestoreConfirm',
        '要恢复 $2 的 $1 这条备份吗？本设备上的本地设置将被替换。',
        [
            formatDateTime(snapshot.createdTime),
            snapshot.deviceName || t('driveUnknownDevice', '未知设备')
        ]
    ));
    if (!confirmed) return;

    await runDriveAction(t('driveCreatingSafetyBackup', '恢复前正在创建安全备份...'), async () => {
        try {
            await createBeforeRestoreSafetyBackup();
        } catch (error) {
            const proceed = confirm(t('driveSafetyBackupFailedConfirm', '无法创建安全备份：$1\n\n是否继续在没有安全备份的情况下恢复？', error.message));
            if (!proceed) {
                showMessage(t('driveRestoreCancelled', '已取消恢复。'), 'info');
                return;
            }
        }

        showMessage(t('driveDownloadingSelected', '正在下载所选备份...'), 'info');
        const payload = await manager.downloadSnapshotPayload(snapshot.id, { interactive: true });
        const providerState = await storageManager.getLocalProviderState();
        const validatedSettings = storageManager.prepareRestoredConfig(payload, providerState);
        const success = await replaceSettings(() => storageManager.setAll(validatedSettings, {
            skipSyncSideEffects: true,
            skipSyncInitialization: true,
            confirmedRestore: true
        }));
        if (!success) {
            throw new Error(t('driveRestoreSaveFailed', '保存恢复后的设置失败。'));
        }
        await manager.markRestored();
        showMessage(t('driveSettingsRestored', '设置已恢复，正在重新加载...'), 'success');
        setTimeout(() => window.LocalItabContentLifecycle.reload(), 1200);
    });
}

async function downloadDriveSnapshot(snapshot) {
    const manager = getDriveBackupManager();
    if (!manager) return;

    await runDriveAction(t('driveDownloadingBackup', '正在下载 Google 云盘备份...'), async () => {
        const payload = await manager.downloadSnapshotPayload(snapshot.id, { interactive: true });
        const dataStr = JSON.stringify(payload, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = snapshot.name || `local-itab-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showMessage(t('driveBackupJsonDownloaded', '备份 JSON 已下载。'), 'success');
    });
}

async function deleteDriveSnapshot(snapshot) {
    const manager = getDriveBackupManager();
    if (!manager) return;
    if (!confirm(t('driveDeleteConfirm', '永久删除这个 Google 云盘备份？'))) return;

    await runDriveAction(t('driveDeleting', '正在删除 Google 云盘备份...'), async () => {
        const result = await manager.deleteSnapshotAndList(snapshot.id, { interactive: true });
        if (Array.isArray(result.snapshots)) {
            await renderDriveBackupPanel(result.snapshots);
        } else {
            driveBackupSnapshots = driveBackupSnapshots.filter(item => item.id !== snapshot.id);
            await renderDriveBackupPanel(driveBackupSnapshots);
        }
        showMessage(t('driveDeleted', 'Google 云盘备份已删除。'), 'success');
        if (result.listError) {
            showMessage(t('driveDeletedListFailed', '备份已删除，但列表刷新失败。'), 'error');
        }
    });
}

async function saveAllSettings() {
    if (settingsReplacementPending) return;
    if (bookmarkImportPending) { bookmarkDeferredSettingsSave = true; return; }
    const session = settingsSession;
    const submittedCategories = categorySnapshot(getCategoriesFromDOM());
    const submittedCategorySignature = bookmarkCategorySignature();
    return queueSettingsWrite(async () => {
        if (session !== settingsSession || settingsReplacementPending) return;
        try {
            showMessage('Saving settings...', 'info');
            const settings = await collectFormData();
            if (session !== settingsSession || settingsReplacementPending) return;
            const options = {};
            if (categoryBaseline === null || sameCategories(submittedCategories, categoryBaseline)) {
                // Untouched stale forms cannot resurrect, rename or delete categories.
                delete settings.categories;
            } else {
                settings.categories = submittedCategories;
                options.expectedCategories = categorySnapshot(categoryBaseline);
            }
            const success = await storageManager.setAll(settings, options);
            // A committed own write remains the baseline even if a subsequent
            // reset/import fails. Only its obsolete presentation is suppressed.
            if (success && options.expectedCategories) categoryBaseline = categorySnapshot(submittedCategories);
            // Canonical storage and raw form ownership are different baselines:
            // a saved whitespace/default-icon submission is clean, while edits
            // made after this submission stay dirty and are never re-rendered.
            if (success) categoryRawBaseline = submittedCategorySignature;
            if (session !== settingsSession || settingsReplacementPending) return;
            if (success) {
                // Do not re-render: edits made while saving belong to the user.
                showMessage('Settings saved.', 'success');
                await displayStorageInfo();
            } else {
                showMessage('Failed to save settings. Please try again.', 'error');
            }
        } catch (error) {
            if (session !== settingsSession || settingsReplacementPending) return;
            console.error('Error saving settings:', error);
            showMessage(`Error saving settings: ${error.message}`, 'error');
        }
    });
}

async function resetAllSettings() {
    try {
        showMessage('Resetting settings...', 'info');
        
        // Clear all storage
        const cleared = await replaceSettings(() => storageManager.clear());
        if (!cleared) throw new Error('Settings could not be reset. Please try again.');
        
        // Reload the page to show defaults
        window.LocalItabContentLifecycle.reload();
    } catch (error) {
        console.error('Error resetting settings:', error);
        showMessage(`Error resetting settings: ${error.message}`, 'error');
    }
}

async function collectFormData() {
    const settings = {};
    const existingConfig = await storageManager.getAll();

    // Neither appearance nor legacy theme is edited by this form. Omitting both
    // avoids stale selection writes and turning an injected legacy default into
    // an explicit dark preference on a fresh installation.

    // Clock settings
    const hour12 = document.getElementById('hour12-format')?.checked || false;
    const showSeconds = document.getElementById('show-seconds')?.checked !== false;
    settings.clock = { hour12, showSeconds };
    

    
    // Background settings
    const bgTypeSelect = document.getElementById('bg-type');
    let bgType = bgTypeSelect?.value || 'gradient';
    const bgColor = document.getElementById('bg-color')?.value || '';
    if (bgType === 'api') {
        bgType = 'gradient';
    }

    let bgValue = '';
    if (bgType === 'color') {
        bgValue = bgColor;
    } else if (bgType === 'image') {
        bgValue = existingConfig.bg.value; // Keep existing image
    }

    settings.bg = { type: bgType, value: bgValue };

    // Visibility settings
    const showClock = document.getElementById('show-clock')?.checked !== false;
    const showSearch = document.getElementById('show-search')?.checked !== false;
    const showShortcuts = document.getElementById('show-shortcuts')?.checked !== false;
    const showWeather = document.getElementById('show-weather')?.checked === true;
    const showHot = document.getElementById('show-hot')?.checked === true;
    const showMovie = document.getElementById('show-movie')?.checked === true;
    settings.show = { clock: showClock, search: showSearch, shortcuts: showShortcuts, weather: showWeather, hot: showHot, movie: showMovie };

    // Category settings
    settings.categories = getCategoriesFromDOM();


    const searchEngine = document.getElementById('search-engine')?.value || existingConfig.search?.engine || 'google';
    const rawSearchCustom = document.getElementById('search-custom')?.value?.trim() || '';
    let searchCustom = '';
    if (searchEngine === 'custom') {
        if (!rawSearchCustom) {
            throw new Error(t('customSearchUrlRequired', 'Custom search URL is required'));
        }
        try {
            searchCustom = normalizeSearchTemplateForOptions(rawSearchCustom);
        } catch (_) {
            throw new Error(t('customSearchUrlInvalid', 'Enter a valid HTTP or HTTPS search URL'));
        }
    } else if (rawSearchCustom) {
        try {
            searchCustom = normalizeSearchTemplateForOptions(rawSearchCustom);
        } catch (_) {
            searchCustom = '';
        }
    }
    if (searchEngine === 'custom' && !searchCustom) {
        throw new Error(t('customSearchUrlRequired', 'Custom search URL is required'));
    }
    settings.search = { engine: searchEngine, custom: searchCustom };

    const readNumber = (id, fallback) => {
        const val = parseFloat(document.getElementById(id)?.value);
        return Number.isFinite(val) ? val : fallback;
    };
    settings.weather = {
        city: document.getElementById('weather-city')?.value?.trim() || existingConfig.weather.city,
        temp: readNumber('weather-temp', existingConfig.weather.temp),
        cond: document.getElementById('weather-condition')?.value?.trim() || existingConfig.weather.cond,
        aqiLabel: document.getElementById('weather-aqi-label')?.value?.trim() || existingConfig.weather.aqiLabel,
        aqi: readNumber('weather-aqi', existingConfig.weather.aqi),
        low: readNumber('weather-low', existingConfig.weather.low),
        high: readNumber('weather-high', existingConfig.weather.high)
    };

    // Hot topics settings
    const hotTab = document.getElementById('hot-topics-tab')?.value || 'baidu';
    settings.hot = {
        tab: hotTab,
        baidu: collectHotTopicsFromList('baidu'),
        weibo: collectHotTopicsFromList('weibo'),
        zhihu: collectHotTopicsFromList('zhihu')
    };
    
    // Movie settings
    const movieTitle = document.getElementById('movie-title')?.value || 'Sample Movie';
    const movieNote = document.getElementById('movie-note')?.value || 'A great movie to watch';
    settings.movie = {
        title: movieTitle,
        note: movieNote,
        poster: existingConfig.movie.poster // Keep existing poster
    };
    
    // Quote setting
    const quote = document.getElementById('quote-text')?.value || 'Welcome to your personalized new tab page!';
    settings.quote = quote;
    
    // Shortcuts are edited on the dashboard; do not write a stale copy here.

    // Layout, appearance and untouched shortcuts have dedicated mutation paths.

    const existingUi = existingConfig.ui || {};
    const paddingAuto = document.getElementById('dashboard-padding-auto')?.checked ?? true;
    const paddingInputs = {
        top: document.getElementById('dashboard-padding-top'),
        right: document.getElementById('dashboard-padding-right'),
        bottom: document.getElementById('dashboard-padding-bottom'),
        left: document.getElementById('dashboard-padding-left')
    };
    let dashboardPadding = existingUi.dashboardPadding ?? null;
    if (paddingAuto) {
        dashboardPadding = null;
    } else {
        const readValue = (input) => {
            if (!input) return null;
            const val = parseInt(input.value, 10);
            if (!Number.isFinite(val)) return null;
            return Math.max(0, Math.min(160, val));
        };
        const top = readValue(paddingInputs.top);
        const right = readValue(paddingInputs.right);
        const bottom = readValue(paddingInputs.bottom);
        const left = readValue(paddingInputs.left);
        if ([top, right, bottom, left].some(val => val !== null)) {
            dashboardPadding = { top, right, bottom, left };
        } else {
            dashboardPadding = null;
        }
    }
    const showShortcutTitles = document.getElementById('show-shortcut-titles')?.checked !== false;
    const shortcutsGapXVal = parseInt(document.getElementById('shortcuts-gap-x')?.value, 10);
    const shortcutsGapYVal = parseInt(document.getElementById('shortcuts-gap-y')?.value, 10);
    const shortcutIconSizeVal = parseInt(document.getElementById('shortcut-icon-size')?.value, 10);
    const shortcutTitleSizeVal = parseInt(document.getElementById('shortcut-title-size')?.value, 10);
    const titleColorAuto = document.getElementById('shortcut-title-color-auto')?.checked ?? true;
    const titleColorInput = document.getElementById('shortcut-title-color');
    const titleColorTextInput = document.getElementById('shortcut-title-color-text');
    let titleColor = '';
    if (!titleColorAuto) {
        let v = titleColorTextInput?.value?.trim() || titleColorInput?.value || '';
        if (/^[0-9A-F]{3}$/i.test(v)) v = '#' + v;
        if (/^[0-9A-F]{6}$/i.test(v)) v = '#' + v;
        if (/^#[0-9A-F]{3}([0-9A-F]{3})?$/i.test(v)) {
            titleColor = v;
        }
    }
    settings.ui = {
        dashboardHidden: existingUi.dashboardHidden ?? false,
        dashboardPadding,
        showShortcutTitles,
        shortcutsStyle: {
            gapX: Number.isFinite(shortcutsGapXVal) ? Math.max(0, Math.min(80, shortcutsGapXVal)) : null,
            gapY: Number.isFinite(shortcutsGapYVal) ? Math.max(0, Math.min(80, shortcutsGapYVal)) : null,
            iconSize: Number.isFinite(shortcutIconSizeVal) ? Math.max(24, Math.min(96, shortcutIconSizeVal)) : null,
            titleSize: Number.isFinite(shortcutTitleSizeVal) ? Math.max(10, Math.min(24, shortcutTitleSizeVal)) : null,
            titleColor
        }
    };

    settings.sync = existingConfig.sync || storageManager.defaultConfig.sync;
    settings.privacy = {
        onlineFavicons: document.getElementById('privacy-online-favicons')?.checked === true
    };

    return settings;
}

async function exportSettings() {
    try {
        showImportExportFeedback('export', 'info', 'Preparing export...');
        
        const config = await storageManager.getAll();
        const exportData = storageManager.buildManualExportPayload(config);
        const itemCounts = exportData.itemCounts;
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Validate export size
        const exportSizeKB = dataBlob.size / 1024;
        if (exportSizeKB > 5000) { // 5MB warning
            const proceed = confirm(`Export file is large (${exportSizeKB.toFixed(1)} KB). This may be due to images. Continue?`);
            if (!proceed) {
                showImportExportFeedback('export', 'info', 'Export cancelled by user');
                return;
            }
        }
        
        // Create download link
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `local-itab-settings-${new Date().toISOString().split('T')[0]}.json`;
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Success feedback with details
        const details = {
            fileSize: dataBlob.size,
            recordCount: itemCounts.shortcuts + itemCounts.hotTopics + (itemCounts.hasBackgroundImage ? 1 : 0) + (itemCounts.hasMoviePoster ? 1 : 0)
        };
        
        showImportExportFeedback('export', 'success', exportData.schemaVersion === 2 ? t('identityExported', 'Settings exported in schema 2. Import with an updated version that supports independent positions.') : 'Settings exported.', details);
        
    } catch (error) {
        console.error('Error exporting settings:', error);
        
        // Provide specific error messages
        let errorMessage = 'Export failed';
        if (error.message.includes('quota')) {
            errorMessage = 'Export failed: Storage quota exceeded';
        } else if (error.message.includes('memory')) {
            errorMessage = 'Export failed: Not enough memory (try removing large images)';
        } else {
            errorMessage = `Export failed: ${error.message}`;
        }
        
        showImportExportFeedback('export', 'error', errorMessage);
    }
}

async function importSettings(file) {
    try {
        if (!file) {
            showImportExportFeedback('import', 'error', 'No file selected for import');
            return;
        }
        if (!file.name.toLowerCase().endsWith('.json')) {
            showImportExportFeedback('import', 'error', 'Please select a valid JSON file');
            return;
        }

        // Local images can legitimately produce exports larger than 10 MiB.
        // Warn before allocating their text rather than making our own backups unrestorable.
        const warningSize = 10 * 1024 * 1024;
        if (file.size > warningSize) {
            const size = (file.size / 1024 / 1024).toFixed(1);
            const proceed = confirm(t('largeLocalImportConfirm',
                'This backup is $1 MiB. Reading a large file can use substantial memory and may make this tab unresponsive. Continue reading it?', [size]));
            if (!proceed) {
                showImportExportFeedback('import', 'info', t('localImportReadCancelled', 'Import cancelled before reading the file.'));
                return;
            }
        }

        showImportExportFeedback('import', 'info', `Processing file: ${file.name}`, { fileSize: file.size });
        
        const text = await file.text();
        let importData;
        
        try {
            importData = JSON.parse(text);
        } catch (parseError) {
            throw new Error(`Invalid JSON format: ${parseError.message}`);
        }
        
        // Validate import data structure
        const providerState = await storageManager.getLocalProviderState();
        const validatedSettings = storageManager.prepareRestoredConfig(importData, providerState);
        
        if (!validatedSettings) {
            throw new Error('Invalid settings format. Please check your export file.');
        }
        
        // Count items being imported for feedback
        const importCounts = {
            shortcuts: validatedSettings.links ? validatedSettings.links.length : 0,
            hotTopics: (validatedSettings.hot.baidu?.length || 0) + (validatedSettings.hot.weibo?.length || 0) + (validatedSettings.hot.zhihu?.length || 0),
            hasBackgroundImage: validatedSettings.bg.type === 'image' && validatedSettings.bg.value,
            hasMoviePoster: validatedSettings.movie.poster && validatedSettings.movie.poster.length > 0
        };
        
        // Show preview of what will be imported
        let previewMessage = `Import will replace all settings with:\n`;
        previewMessage += `• ${importCounts.shortcuts} shortcuts\n`;
        previewMessage += `• ${importCounts.hotTopics} hot topics\n`;
        if (importCounts.hasBackgroundImage) previewMessage += `• Background image\n`;
        if (importCounts.hasMoviePoster) previewMessage += `• Movie poster\n`;
        previewMessage += `\n${t('restoreRecoveryConfirm', 'A local recovery backup will be kept before replacing settings. Continue?')}`;
        
        if (!confirm(previewMessage)) {
            showImportExportFeedback('import', 'info', 'Import cancelled by user');
            return;
        }
        
        // Save validated settings
        const success = await replaceSettings(() => storageManager.setAll(validatedSettings, {
            skipSyncSideEffects: true,
            skipSyncInitialization: true,
            confirmedRestore: true
        }));
        
        if (success) {
            const details = {
                recordCount: importCounts.shortcuts + importCounts.hotTopics + (importCounts.hasBackgroundImage ? 1 : 0) + (importCounts.hasMoviePoster ? 1 : 0)
            };
            
            showImportExportFeedback('import', 'success', 'Settings imported. Reloading page...', details);
            
            // Reload page after short delay
            setTimeout(() => {
                window.LocalItabContentLifecycle.reload();
            }, 1500);
        } else {
            throw new Error('Failed to save imported settings to storage');
        }
        
    } catch (error) {
        console.error('Error importing settings:', error);
        
        // Provide specific error messages
        let errorMessage = 'Import failed';
        if (error.message.includes('JSON')) {
            errorMessage = `Import failed: ${error.message}`;
        } else if (error.message.includes('quota')) {
            errorMessage = 'Import failed: Not enough storage space';
        } else if (error.message.includes('Invalid settings')) {
            errorMessage = 'Import failed: File format not recognized';
        } else {
            errorMessage = `Import failed: ${error.message}`;
        }
        
        showImportExportFeedback('import', 'error', errorMessage);
    } finally {
        // Clear the file input
        const importInput = document.getElementById('import-settings');
        if (importInput) {
            importInput.value = '';
        }
    }
}

async function handleBackgroundImageUpload(file) {
    // Invalid selections and picker cancellation are not new background intents.
    // They must not take ownership from an image write already in progress.
    if (!file) {
        clearBackgroundImageInput();
        return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        clearBackgroundImageInput();
        showMessage('Please select a valid image file (JPEG, PNG, GIF, or WebP)', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        clearBackgroundImageInput();
        showMessage('Image file is too large. Please select an image smaller than 5MB.', 'error');
        return;
    }
    return queueBackgroundTask(async isCurrent => {
        let previousBackground;
        try {
            if (!isCurrent()) return;
            previousBackground = await storageManager.getBackgroundForUpdate();
            if (!isCurrent()) return;
            showMessage('Uploading background image...', 'info');
            const dataURL = await fileToDataURL(file);
            if (!isCurrent()) return;
            const saved = await storageManager.set('bg', { type: 'image', value: dataURL });
            if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
            if (!isCurrent()) return;

            applyCommittedBackground({ type: 'image', value: dataURL });
            showMessage('Background image uploaded.', 'success');
        } catch (error) {
            console.error('Error uploading background image:', error);
            if (isCurrent()) {
                if (previousBackground) applyCommittedBackground(previousBackground);
                showMessage(`Error uploading image: ${error.message}`, 'error');
            }
        } finally {
            if (isCurrent()) clearBackgroundImageInput();
        }
    });
}

async function handleMoviePosterUpload(file) {
    if (!file) return;
    
    try {
        const dataURL = await fileToDataURL(file);
        const existingMovie = await storageManager.get('movie');
        await storageManager.set('movie', { ...existingMovie, poster: dataURL });
        showMessage('Movie poster uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading movie poster:', error);
        showMessage(`Error uploading poster: ${error.message}`, 'error');
    }
}

function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function displayStorageInfo() {
    try {
        const info = await storageManager.getStorageInfo();
        const storageInfoElement = document.getElementById('storage-info');

        if (storageInfoElement) {
            const local = document.createElement('div');
            local.textContent = `${t('localStorage', 'Local')}: ${formatBytes(info.local.bytesInUse)} / ${formatBytes(info.local.quota)} (${info.local.percentUsed}%)`;
            const sync = document.createElement('div');
            sync.textContent = `${t('chromeSync', 'Chrome Sync')}: ${info.sync.available ? `${formatBytes(info.sync.bytesInUse)} / ${formatBytes(info.sync.quota)} (${info.sync.percentUsed}%)` : t('unavailable', 'Unavailable')}`;
            storageInfoElement.replaceChildren(local, sync);
        }
    } catch (error) {
        console.error('Error displaying storage info:', error);
    }
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function t(key, fallback, substitutions) {
    const values = Array.isArray(substitutions)
        ? substitutions
        : (substitutions === undefined ? [] : [substitutions]);
    const localized = window.i18n ? i18n.t(key, values) : key;
    if (localized && localized !== key) return localized;
    return values.reduce((text, value, index) => {
        return text.replace(new RegExp(`\\$${index + 1}`, 'g'), String(value));
    }, fallback);
}

async function renderRecoveryControls() {
    const available = await storageManager.getRecoveryAvailability?.();
    const container = document.getElementById('layout-recovery-controls');
    if (container) container.hidden = !available?.latest;
    for (const kind of ['original', 'latest']) {
        const button = document.getElementById(`recovery-${kind}`);
        if (button) button.disabled = !available?.[kind];
    }
}

async function downloadRecoveryBackup(kind) {
    try {
        const payload = await storageManager.getRecoveryBackup(kind);
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url; link.download = `local-itab-recovery-${kind}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
        showMessage(t('recoveryDownloaded', 'Recovery backup downloaded. Use Import Settings to review and restore it.'), 'success');
    } catch (error) { showMessage(error.message, 'error'); }
}

async function replaceLocalFromCloud() {
    if (cloudReplacementInProgress) return;
    cloudReplacementInProgress = true;
    const button = document.getElementById('sync-replace-local');
    if (button) button.disabled = true;
    try {
        const expectedRemote = await storageManager.previewCloudReplacement();
        if (!confirm(t('syncReplaceLocalConfirm', 'Replace this device with the current cloud copy ($1 shortcuts)? Independent positions missing from that copy will be removed. A recovery backup of this device must be saved locally first. Other devices may overwrite the cloud again; update them before continuing.', String(expectedRemote.shortcuts)))) return;
        await replaceSettings(() => storageManager.pullFromSync({ confirmedReplacement: true, expectedRemote }));
        window.LocalItabContentLifecycle.reload();
    } catch (error) {
        showMessage(t('syncDownloadFailed', 'Download failed: $1', error.message), 'error');
        await renderSyncStatus();
    } finally { cloudReplacementInProgress = false; if (button) button.disabled = false; }
}

async function renderSyncStatus(status = null) {
    const statusElement = document.getElementById('cloud-sync-status');
    if (!statusElement) return;

    const syncStatus = status || await storageManager.getSyncStatus();
    const remote = syncStatus.remote || {};
    const local = syncStatus.local || {};
    const omitted = Array.isArray(remote.omittedAssets) ? remote.omittedAssets : [];
    const lastSync = local.lastSync
        ? new Date(local.lastSync).toLocaleString()
        : t('never', '从未');
    const stateLabel = !syncStatus.available
        ? t('unavailable', '不可用')
        : (syncStatus.enabled ? t('enabled', '已启用') : t('off', '关闭'));
    const stateClass = !syncStatus.available
        ? 'is-error'
        : (syncStatus.enabled ? 'is-on' : 'is-off');

    const createRow = (label, value, extraClass = '') => {
        const row = document.createElement('div');
        row.className = 'sync-status-row';
        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        const valueEl = document.createElement('strong');
        if (extraClass) valueEl.className = extraClass;
        valueEl.textContent = value;
        row.append(labelEl, valueEl);
        return row;
    };

    const cloudUsage = syncStatus.storage?.available
        ? `${formatBytes(syncStatus.storage.bytesInUse)} / ${formatBytes(syncStatus.storage.quota)}`
        : t('unavailable', '不可用');

    const children = [
        createRow(t('syncStatus', '状态'), stateLabel, stateClass),
        createRow(t('lastSync', '上次同步'), lastSync),
        createRow(t('cloudUsage', '云端用量'), cloudUsage)
    ];
    if (omitted.length) {
        const note = document.createElement('div');
        note.className = 'sync-status-note';
        note.textContent = `${t('localOnlyAssets', '仅本地资源')}: ${omitted.join(', ')}`;
        children.push(note);
    }
    if (syncStatus.compatibilityBlocked) {
        const note = document.createElement('div');
        note.className = 'sync-status-note is-error';
        note.setAttribute('role', 'status');
        note.textContent = `${t('syncCompatibilityDetails', 'Sync is paused for compatibility. Local settings and your enabled preference are preserved. Update other devices and retry Download, or explicitly choose which copy to replace.')} ${syncStatus.compatibilityBlocked.reason}`;
        children.push(note);
    }
    if (local.lastError) {
        const error = document.createElement('div');
        error.className = 'sync-status-note is-error';
        error.textContent = local.lastError;
        children.push(error);
    }
    statusElement.replaceChildren(...children);

    const upload = document.getElementById('sync-upload-now');
    const download = document.getElementById('sync-download-now');
    const clear = document.getElementById('sync-clear-cloud');
    [upload, download, clear].forEach(btn => {
        if (btn) btn.disabled = !syncStatus.available;
    });

    const hotTopicsSelect = document.getElementById('hot-topics-tab');
    if (hotTopicsSelect) {
        hotTopicsSelect.addEventListener('change', () => {
            switchHotTopicsTab(hotTopicsSelect.value);
        });
    }
    const replace = document.getElementById('sync-replace-local');
    if (replace) { replace.hidden = !syncStatus.compatibilityBlocked; replace.disabled = !syncStatus.available || cloudReplacementInProgress; }
    const toggle = document.getElementById('cloud-sync-enabled');
    if (toggle) toggle.checked = syncStatus.enabled;
    await renderRecoveryControls();
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.setAttribute('role', type === 'error' ? 'alert' : 'status');
    messageDiv.textContent = message;
    const container = document.getElementById('toast-container') || document.body;
    container.appendChild(messageDiv);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 3000);
}

function showErrorMessage(message) {
    showMessage(message, 'error');
}

/**
 * Update background sections visibility based on selected type
 */
function updateBackgroundSections() {
    const bgType = document.getElementById('bg-type')?.value;
    const colorSection = document.getElementById('bg-color-section');
    const imageSection = document.getElementById('bg-image-section');
    
    // Hide all sections first
    if (colorSection) colorSection.style.display = 'none';
    if (imageSection) imageSection.style.display = 'none';
    
    // Show relevant section
    switch (bgType) {
        case 'color':
            if (colorSection) colorSection.style.display = 'block';
            break;
        case 'image':
            if (imageSection) imageSection.style.display = 'block';
            break;
        // gradient doesn't need additional controls
    }
}

/**
 * Update background image preview
 */
function updateBackgroundImagePreview(dataURL) {
    const previewDiv = document.getElementById('bg-image-preview');
    const previewImg = document.getElementById('bg-preview-img');
    
    if (previewDiv && previewImg && dataURL) {
        previewImg.src = dataURL;
        previewDiv.style.display = 'block';
    }
}

function setBackgroundTypeSelection(bgTypeSelect, bgType) {
    if (!bgTypeSelect) return;
    const safeType = ['gradient', 'color', 'image'].includes(bgType) ? bgType : 'gradient';
    bgTypeSelect.value = safeType;
    if (bgTypeSelect.dataset) delete bgTypeSelect.dataset.preferredBgType;
}

/**
 * Save background settings immediately
 */
async function saveBackgroundSettings() {
    // Capture the user's choice before an older queued task can update controls.
    const requestedType = document.getElementById('bg-type')?.value || 'gradient';
    const requestedColor = document.getElementById('bg-color')?.value || '';
    return queueBackgroundTask(async isCurrent => {
        let previousBackground;
        try {
            if (!isCurrent()) return;
            previousBackground = await storageManager.getBackgroundForUpdate();
            if (!isCurrent()) return;
            const type = requestedType === 'api' ? 'gradient' : requestedType;
            const value = type === 'color' ? requestedColor : type === 'image' ? previousBackground.value : '';
            const saved = await storageManager.set('bg', { type, value });
            if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
            if (isCurrent()) applyCommittedBackground({ type, value });
        } catch (error) {
            console.error('Error saving background settings:', error);
            if (isCurrent()) {
                if (previousBackground) applyCommittedBackground(previousBackground);
                showMessage(t('failedToSave', 'Failed to save. Please try again.'), 'error');
            }
        } finally {
            if (isCurrent()) clearBackgroundImageInput();
        }
    });
}

function clearBackgroundImageInput() {
    const input = document.getElementById('bg-image-upload');
    if (input) input.value = '';
}

function applyCommittedBackground(background) {
    setBackgroundTypeSelection(document.getElementById('bg-type'), background.type);
    if (background.type === 'color') {
        for (const id of ['bg-color', 'bg-color-text']) {
            const input = document.getElementById(id);
            if (input) input.value = background.value;
        }
    }
    updateBackgroundSections();
    if (background.type === 'image' && background.value) {
        updateBackgroundImagePreview(background.value);
    } else {
        const preview = document.getElementById('bg-image-preview');
        if (preview) preview.style.display = 'none';
    }
}

/**
 * Remove background image and revert to gradient
 */
async function removeBackgroundImage() {
    if (!confirm('Are you sure you want to remove the background image?')) return;
    return queueBackgroundTask(async isCurrent => {
        let previousBackground;
        try {
            if (!isCurrent()) return;
            previousBackground = await storageManager.getBackgroundForUpdate();
            if (!isCurrent()) return;
            const saved = await storageManager.set('bg', { type: 'gradient', value: '' });
            if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
            if (!isCurrent()) return;
            applyCommittedBackground({ type: 'gradient', value: '' });
            showMessage('Background image removed.', 'success');
        } catch (error) {
            console.error('Error removing background image:', error);
            if (isCurrent()) {
                if (previousBackground) applyCommittedBackground(previousBackground);
                showMessage(`Error removing background image: ${error.message}`, 'error');
            }
        } finally {
            if (isCurrent()) clearBackgroundImageInput();
        }
    });
}

/**
 * Populate hot topics lists from configuration
 */
function populateHotTopicsLists(hotConfig) {
    const tabs = ['baidu', 'weibo', 'zhihu'];
    
    tabs.forEach(tab => {
        const listElement = document.getElementById(`${tab}-list`);
        if (listElement && hotConfig[tab]) {
            listElement.replaceChildren();
            hotConfig[tab].forEach((topic, index) => {
                addTopicToList(tab, topic.t, topic.s, index);
            });
        }
    });
}

/**
 * Add a topic to the specified list
 */
function addTopicToList(tabType, title, score, index) {
    const listElement = document.getElementById(`${tabType}-list`);
    if (!listElement || !title) return;
    
    const topicElement = document.createElement('div');
    topicElement.className = 'topic-item';
    const content = document.createElement('div');
    content.className = 'topic-content';
    const titleEl = document.createElement('span');
    titleEl.className = 'topic-title';
    titleEl.textContent = title;
    const scoreEl = document.createElement('span');
    scoreEl.className = 'topic-score';
    scoreEl.textContent = String(score);
    content.append(titleEl, scoreEl);
    const actions = document.createElement('div');
    actions.className = 'topic-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-sm btn-secondary edit-topic-btn';
    editBtn.dataset.index = index;
    editBtn.textContent = t('edit', 'Edit');
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-sm btn-danger delete-topic-btn';
    deleteBtn.dataset.index = index;
    deleteBtn.textContent = t('delete', 'Delete');
    actions.append(editBtn, deleteBtn);
    topicElement.append(content, actions);

    // Add event listeners for edit and delete buttons
    editBtn.addEventListener('click', () => editHotTopic(tabType, index));
    deleteBtn.addEventListener('click', () => deleteHotTopic(tabType, index));
    
    listElement.appendChild(topicElement);
}

/**
 * Switch between hot topics tabs
 */
function switchHotTopicsTab(tabType) {
    // Update tab buttons
    const tabs = document.querySelectorAll('.topic-tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabType);
    });
    
    // Update content visibility
    const contents = document.querySelectorAll('.topic-list');
    contents.forEach(content => {
        const shouldShow = content.id === `${tabType}-topics`;
        content.style.display = shouldShow ? 'block' : 'none';
    });
}

/**
 * Add a new hot topic
 */
async function addHotTopic(tabType, title, score) {
    if (!title.trim()) {
        showMessage(t('topicTitleRequired', 'Please enter a topic title'), 'error');
        return;
    }
    
    try {
        const config = await storageManager.getAll();
        if (!config.hot[tabType]) {
            config.hot[tabType] = [];
        }
        
        config.hot[tabType].push({ t: title.trim(), s: score || 0 });
        await storageManager.set('hot', config.hot);
        
        // Refresh the list
        populateHotTopicsLists(config.hot);
        showMessage('Topic added.', 'success');
    } catch (error) {
        console.error('Error adding hot topic:', error);
        showMessage(`Error adding topic: ${error.message}`, 'error');
    }
}

/**
 * Edit a hot topic
 */
async function editHotTopic(tabType, index) {
    try {
        const config = await storageManager.getAll();
        const topic = config.hot[tabType][index];
        
        if (!topic) return;
        
        const newTitle = prompt('Edit topic title:', topic.t);
        const newScore = prompt('Edit topic score:', topic.s);
        
        if (newTitle !== null && newTitle.trim()) {
            topic.t = newTitle.trim();
            if (newScore !== null && !isNaN(parseInt(newScore))) {
                topic.s = parseInt(newScore);
            }
            
            await storageManager.set('hot', config.hot);
            populateHotTopicsLists(config.hot);
            showMessage('Topic updated.', 'success');
        }
    } catch (error) {
        console.error('Error editing hot topic:', error);
        showMessage(`Error editing topic: ${error.message}`, 'error');
    }
}

/**
 * Delete a hot topic
 */
async function deleteHotTopic(tabType, index) {
    if (!confirm('Are you sure you want to delete this topic?')) return;
    
    try {
        const config = await storageManager.getAll();
        config.hot[tabType].splice(index, 1);
        
        await storageManager.set('hot', config.hot);
        populateHotTopicsLists(config.hot);
        showMessage('Topic deleted.', 'success');
    } catch (error) {
        console.error('Error deleting hot topic:', error);
        showMessage(`Error deleting topic: ${error.message}`, 'error');
    }
}

/**
 * Collect hot topics from a specific list
 */
function collectHotTopicsFromList(tabType) {
    const topics = [];
    const listElement = document.getElementById(`${tabType}-list`);
    
    if (listElement) {
        const topicItems = listElement.querySelectorAll('.topic-item');
        topicItems.forEach(item => {
            const title = item.querySelector('.topic-title')?.textContent;
            const score = parseInt(item.querySelector('.topic-score')?.textContent) || 0;
            if (title) {
                topics.push({ t: title, s: score });
            }
        });
    }
    
    return topics;
}

/**
 * Update movie poster preview
 */
function updateMoviePosterPreview(dataURL) {
    const previewDiv = document.getElementById('movie-poster-preview');
    const previewImg = document.getElementById('movie-preview-img');
    
    if (previewDiv && previewImg && dataURL) {
        previewImg.src = dataURL;
        previewDiv.style.display = 'block';
    }
}

/**
 * Remove movie poster
 */
async function removeMoviePoster() {
    try {
        if (confirm('Are you sure you want to remove the movie poster?')) {
            const config = await storageManager.getAll();
            config.movie.poster = '';
            
            await storageManager.set('movie', config.movie);
            
            // Hide preview
            const previewDiv = document.getElementById('movie-poster-preview');
            if (previewDiv) {
                previewDiv.style.display = 'none';
            }
            
            // Clear file input
            const posterInput = document.getElementById('movie-poster-upload');
            if (posterInput) {
                posterInput.value = '';
            }
            
            showMessage('Movie poster removed.', 'success');
        }
    } catch (error) {
        console.error('Error removing movie poster:', error);
        showMessage(`Error removing poster: ${error.message}`, 'error');
    }
}

/**
 * Validate imported data structure and content
 * @param {Object} importData - Raw imported data
 * @returns {Object|null} - Validated settings or null if invalid
 */
function validateImportData(importData) {
    try {
        const validatedSettings = storageManager.validateImportPayload(importData);
        console.log('Import validation successful');
        return validatedSettings;
        
    } catch (error) {
        console.error('Import validation failed:', error);
        return null;
    }
}

/**
 * Show detailed import/export feedback to user
 * @param {string} operation - 'import' or 'export'
 * @param {string} status - 'success', 'error', 'info'
 * @param {string} message - Detailed message
 * @param {Object} details - Additional details (optional)
 */
function showImportExportFeedback(operation, status, message, details = null) {
    const timestamp = new Date().toLocaleTimeString();
    let fullMessage = `[${timestamp}] ${operation.toUpperCase()}: ${message}`;
    
    if (details) {
        if (details.fileSize) {
            fullMessage += ` (File size: ${(details.fileSize / 1024).toFixed(1)} KB)`;
        }
        if (details.recordCount) {
            fullMessage += ` (${details.recordCount} items)`;
        }
    }
    
    showMessage(fullMessage, status);
    
    // Also log to console for debugging
    console.log(`${operation} ${status}:`, message, details);
}

/**
 * Setup auto-save functionality for form inputs
 */
function setupAutoSave() {
    let saveTimeout;
    
    const autoSaveInputs = [
        'hour12-format', 'show-seconds',
        'show-clock', 'show-search', 'show-shortcuts', 'show-weather', 'show-hot', 'show-movie', 'show-shortcut-titles',
        'search-engine', 'search-custom',
        'privacy-online-favicons',
        'shortcuts-gap-x', 'shortcuts-gap-y', 'shortcut-icon-size', 'shortcut-title-size',
        'shortcut-title-color', 'shortcut-title-color-text', 'shortcut-title-color-auto',
        'dashboard-padding-top', 'dashboard-padding-right', 'dashboard-padding-bottom', 'dashboard-padding-left',
        'dashboard-padding-auto',
        'weather-city', 'weather-temp', 'weather-condition', 'weather-aqi-label', 'weather-aqi', 'weather-low', 'weather-high',
        'movie-title', 'movie-note', 'quote-text', 'hot-topics-tab'
    ];
    
    autoSaveInputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', () => {
                clearTimeout(saveTimeout);
                saveTimeout = setTimeout(async () => {
                    try {
                        await saveAllSettings();
                    } catch (error) {
                        console.error('Auto-save error:', error);
                    }
                }, 1000); // Debounce by 1 second
            });
        }
    });
}
