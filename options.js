// Options page JavaScript - with storage management
const THEME_PRESETS = ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'];
const PRIVACY_PERMISSION_ORIGINS = {
    wallpapers: 'https://api.paugram.com/*',
    favicons: 'https://www.google.com/*'
};

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

    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            activateTab(btn.dataset.tab);
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
        if (areaName !== 'sync' || !changes[storageManager.syncMetaKey]) return;
        if (storageManager.shouldIgnoreRemoteSyncChange?.()) return;
        try {
            const result = await storageManager.pullFromSync();
            if (result?.applied) {
                showMessage('Cloud settings updated. Reloading...', 'info');
                setTimeout(() => window.location.reload(), 800);
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
    const effectivePrivacy = { ...privacy };

    if (effectivePrivacy.onlineWallpapers === true && !(await hasOptionalOriginPermission(PRIVACY_PERMISSION_ORIGINS.wallpapers))) {
        effectivePrivacy.onlineWallpapers = false;
    }

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
            id: 'privacy-online-wallpapers',
            key: 'onlineWallpapersPermissionMissing',
            fallback: 'Permission is not granted on this device, so this synced setting is not active here.'
        },
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
        
        // Display storage usage info
        await displayStorageInfo();
        await renderSyncStatus();

        // Apply i18n to DOM
        if (window.i18n) {
            window.i18n.localizeDocument(document);
        }
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
        await populateSyncControls(config.sync);

        console.log('Options page initialized with config:', config);
    } catch (error) {
        console.error('Error in initializeOptionsPage:', error);
        throw error;
    }
}

async function populateFormFields(config) {
    const themePreset = normalizeThemePreset(config.themePreset);
    const themeRadio = document.querySelector(`input[name="theme-preset"][value="${themePreset}"]`);
    if (themeRadio) themeRadio.checked = true;
    applyThemePreset(themePreset);

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
        setBackgroundTypeSelection(bgTypeSelect, config.bg.type, config.effectivePrivacy?.onlineWallpapers === true);
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

    const onlineWallpapers = document.getElementById('privacy-online-wallpapers');
    const onlineFavicons = document.getElementById('privacy-online-favicons');
    if (onlineWallpapers) {
        onlineWallpapers.checked = config.privacy?.onlineWallpapers === true;
        setPrivacyPermissionMetadata(onlineWallpapers, config, 'onlineWallpapers');
    }
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

    // Layout settings
    const autoArrange = document.getElementById('layout-auto-arrange');
    const alignGrid = document.getElementById('layout-align-grid');
    const gridSizeInput = document.getElementById('layout-grid-size');
    const columnsInput = document.getElementById('layout-columns');
    const defaultColumns = storageManager?.defaultConfig?.layout?.columns ?? 6;
    if (autoArrange) autoArrange.checked = !!config.layout?.autoArrange;
    if (alignGrid) alignGrid.checked = !!config.layout?.alignToGrid;
    if (gridSizeInput) gridSizeInput.value = config.layout?.gridSize || 96;
    if (columnsInput) {
        const currentColumns = typeof config.layout?.columns === 'number' ? config.layout.columns : defaultColumns;
        columnsInput.value = currentColumns;
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

    let saveTimeout;
    const scheduleSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => saveAllSettings(), 800);
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

    // Chrome cloud sync controls
    const syncToggle = document.getElementById('cloud-sync-enabled');
    const syncUpload = document.getElementById('sync-upload-now');
    const syncDownload = document.getElementById('sync-download-now');
    const syncClear = document.getElementById('sync-clear-cloud');
    const onlineWallpapers = document.getElementById('privacy-online-wallpapers');
    const onlineFavicons = document.getElementById('privacy-online-favicons');

    if (syncToggle) {
        syncToggle.addEventListener('change', async () => {
            try {
                syncToggle.disabled = true;
                if (syncToggle.checked) {
                    showMessage('Enabling cloud sync...', 'info');
                    const status = await storageManager.setSyncEnabled(true);
                    showMessage('Cloud sync enabled. Current settings uploaded.', 'success');
                    await renderSyncStatus(status);
                } else {
                    showMessage('Disabling cloud sync...', 'info');
                    const status = await storageManager.setSyncEnabled(false);
                    showMessage('Cloud sync disabled on this profile.', 'success');
                    await renderSyncStatus(status);
                }
            } catch (error) {
                console.error('Cloud sync toggle error:', error);
                syncToggle.checked = !syncToggle.checked;
                showMessage(`Cloud sync failed: ${error.message}`, 'error');
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
                showMessage(t('syncUploadStart', 'Uploading settings to Chrome Sync...'), 'info');
                const status = await storageManager.pushToSync();
                showMessage(t('syncUploadDone', 'Settings uploaded to Chrome Sync.'), 'success');
                await renderSyncStatus(status);
            } catch (error) {
                console.error('Cloud sync upload error:', error);
                showMessage(`Upload failed: ${error.message}`, 'error');
                await renderSyncStatus();
            }
        });
    }

    if (syncDownload) {
        syncDownload.addEventListener('click', async () => {
            try {
                showMessage(t('syncDownloadStart', 'Downloading settings from Chrome Sync...'), 'info');
                const result = await storageManager.pullFromSync();
                if (result.applied) {
                    showMessage('Cloud settings applied. Reloading...', 'success');
                    setTimeout(() => window.location.reload(), 800);
                } else {
                    showMessage('Already up to date.', 'success');
                    await renderSyncStatus(result.status);
                }
            } catch (error) {
                console.error('Cloud sync download error:', error);
                showMessage(`Download failed: ${error.message}`, 'error');
                await renderSyncStatus();
            }
        });
    }

    if (syncClear) {
        syncClear.addEventListener('click', async () => {
            if (!confirm(t('syncClearConfirm', 'Clear the cloud copy from Chrome Sync? Local settings will stay on this device.'))) return;
            try {
                showMessage('Clearing cloud copy...', 'info');
                const status = await storageManager.clearSync();
                const syncToggleEl = document.getElementById('cloud-sync-enabled');
                if (syncToggleEl) syncToggleEl.checked = false;
                showMessage('Cloud copy cleared.', 'success');
                await renderSyncStatus(status);
            } catch (error) {
                console.error('Cloud sync clear error:', error);
                showMessage(`Clear failed: ${error.message}`, 'error');
                await renderSyncStatus();
            }
        });
    }

    if (onlineWallpapers) {
        onlineWallpapers.addEventListener('change', async () => {
            if (onlineWallpapers.checked && !(await ensurePrivacyPermission('wallpapers', true))) {
                onlineWallpapers.checked = false;
                showMessage('Online wallpaper permission was not granted.', 'error');
            }
            onlineWallpapers.dataset.permissionMissing = 'false';
            refreshPrivacyPermissionHints();
            await saveAllSettings();
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

    // Theme preset selection
    const themeInputs = document.querySelectorAll('input[name="theme-preset"]');
    if (themeInputs.length) {
        let themeSaveTimeout;
        themeInputs.forEach(input => {
            input.addEventListener('change', () => {
                applyThemePreset(input.value);
                clearTimeout(themeSaveTimeout);
                themeSaveTimeout = setTimeout(async () => {
                    try {
                        await saveAllSettings();
                    } catch (error) {
                        console.error('Theme save error:', error);
                    }
                }, 400);
            });
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

async function saveAllSettings() {
    try {
        showMessage('Saving settings...', 'info');
        
        // Collect all form data
        const settings = await collectFormData();
        
        // Save to storage
        const success = await storageManager.setAll(settings);
        
        if (success) {
            showMessage('Settings saved.', 'success');
            // Update storage info display
            await displayStorageInfo();
        } else {
            showMessage('Failed to save settings. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showMessage(`Error saving settings: ${error.message}`, 'error');
    }
}

async function resetAllSettings() {
    try {
        showMessage('Resetting settings...', 'info');
        
        // Clear all storage
        await storageManager.clear();
        
        // Reload the page to show defaults
        window.location.reload();
    } catch (error) {
        console.error('Error resetting settings:', error);
        showMessage(`Error resetting settings: ${error.message}`, 'error');
    }
}

async function collectFormData() {
    const settings = {};
    const existingConfig = await storageManager.getAll();

    const themePreset = document.querySelector('input[name="theme-preset"]:checked')?.value
        || existingConfig.themePreset
        || 'aurora-glass';
    settings.themePreset = normalizeThemePreset(themePreset);

    // Clock settings
    const hour12 = document.getElementById('hour12-format')?.checked || false;
    const showSeconds = document.getElementById('show-seconds')?.checked !== false;
    settings.clock = { hour12, showSeconds };
    

    
    // Background settings
    const bgTypeSelect = document.getElementById('bg-type');
    let bgType = bgTypeSelect?.value || 'gradient';
    const bgColor = document.getElementById('bg-color')?.value || '';
    const onlineWallpapers = document.getElementById('privacy-online-wallpapers')?.checked === true;
    const preserveApiPreference = bgType === 'gradient'
        && bgTypeSelect?.dataset.preferredBgType === 'api'
        && onlineWallpapers;

    let bgValue = '';
    if (preserveApiPreference) {
        bgType = 'api';
        bgValue = 'https://api.paugram.com/wallpaper/';
    } else if (bgType === 'color') {
        bgValue = bgColor;
    } else if (bgType === 'image') {
        bgValue = existingConfig.bg.value; // Keep existing image
    } else if (bgType === 'api') {
        if (onlineWallpapers) {
            bgValue = 'https://api.paugram.com/wallpaper/'; // API endpoint
        } else {
            bgType = 'gradient';
            bgValue = '';
        }
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
    
    // Get existing data for fields not managed in options page
    settings.links = existingConfig.links;

    // Layout settings
    const existingLayout = existingConfig.layout || {};
    const autoArrange = document.getElementById('layout-auto-arrange')?.checked ?? existingLayout.autoArrange;
    const alignToGrid = document.getElementById('layout-align-grid')?.checked ?? existingLayout.alignToGrid;
    const gridSizeVal = parseInt(document.getElementById('layout-grid-size')?.value, 10);
    const gridSize = Number.isFinite(gridSizeVal) ? gridSizeVal : existingLayout.gridSize;
    const columnsVal = parseInt(document.getElementById('layout-columns')?.value, 10);
    const fallbackColumns = typeof existingLayout.columns === 'number'
        ? existingLayout.columns
        : (storageManager?.defaultConfig?.layout?.columns ?? 6);
    let columns = Number.isFinite(columnsVal) ? columnsVal : fallbackColumns;
    columns = Math.max(1, Math.min(10, columns));
    settings.layout = {
        autoArrange,
        alignToGrid,
        gridSize,
        columns,
        positions: existingLayout.positions || {}
    };

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
        onlineWallpapers,
        onlineFavicons: document.getElementById('privacy-online-favicons')?.checked === true
    };

    return settings;
}

async function exportSettings() {
    try {
        showImportExportFeedback('export', 'info', 'Preparing export...');
        
        // Get all stored data including images as dataURL
        const config = await storageManager.getAll();
        
        // Count exportable items for feedback
        const itemCounts = {
            shortcuts: config.links ? config.links.length : 0,
            hotTopics: (config.hot.baidu?.length || 0) + (config.hot.weibo?.length || 0) + (config.hot.zhihu?.length || 0),
            hasBackgroundImage: config.bg.type === 'image' && config.bg.value,
            hasMoviePoster: config.movie.poster && config.movie.poster.length > 0
        };
        
        // Add metadata to export
        const exportData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            exportedBy: 'Local iTab Extension',
            itemCounts: itemCounts,
            data: config
        };
        
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
        
        showImportExportFeedback('export', 'success', 'Settings exported.', details);
        
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
    if (!file) {
        showImportExportFeedback('import', 'error', 'No file selected for import');
        return;
    }
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
        showImportExportFeedback('import', 'error', 'Please select a valid JSON file');
        return;
    }
    
    // Validate file size (max 10MB for safety)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showImportExportFeedback('import', 'error', `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10MB`);
        return;
    }
    
    try {
        showImportExportFeedback('import', 'info', `Processing file: ${file.name}`, { fileSize: file.size });
        
        const text = await file.text();
        let importData;
        
        try {
            importData = JSON.parse(text);
        } catch (parseError) {
            throw new Error(`Invalid JSON format: ${parseError.message}`);
        }
        
        // Validate import data structure
        const validatedSettings = validateImportData(importData);
        
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
        previewMessage += `\nThis cannot be undone. Continue?`;
        
        if (!confirm(previewMessage)) {
            showImportExportFeedback('import', 'info', 'Import cancelled by user');
            return;
        }
        
        // Save validated settings
        const success = await storageManager.setAll(validatedSettings);
        
        if (success) {
            const details = {
                recordCount: importCounts.shortcuts + importCounts.hotTopics + (importCounts.hasBackgroundImage ? 1 : 0) + (importCounts.hasMoviePoster ? 1 : 0)
            };
            
            showImportExportFeedback('import', 'success', 'Settings imported. Reloading page...', details);
            
            // Reload page after short delay
            setTimeout(() => {
                window.location.reload();
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
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        showMessage('Please select a valid image file (JPEG, PNG, GIF, or WebP)', 'error');
        return;
    }
    
    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showMessage('Image file is too large. Please select an image smaller than 5MB.', 'error');
        return;
    }
    
    try {
        showMessage('Uploading background image...', 'info');
        const dataURL = await fileToDataURL(file);
        
        // Update background type to image and save
        const bgTypeSelect = document.getElementById('bg-type');
        if (bgTypeSelect) {
            bgTypeSelect.value = 'image';
            updateBackgroundSections();
        }
        
        await storageManager.set('bg', { type: 'image', value: dataURL });
        updateBackgroundImagePreview(dataURL);
        showMessage('Background image uploaded.', 'success');
    } catch (error) {
        console.error('Error uploading background image:', error);
        showMessage(`Error uploading image: ${error.message}`, 'error');
    }
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

function t(key, fallback) {
    return (window.i18n && i18n.t(key) !== key) ? i18n.t(key) : fallback;
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
        : t('never', 'Never');
    const stateLabel = !syncStatus.available
        ? t('unavailable', 'Unavailable')
        : (syncStatus.enabled ? t('enabled', 'Enabled') : t('off', 'Off'));
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
        : t('unavailable', 'Unavailable');

    const children = [
        createRow(t('syncStatus', 'Status'), stateLabel, stateClass),
        createRow(t('lastSync', 'Last sync'), lastSync),
        createRow(t('cloudUsage', 'Cloud usage'), cloudUsage)
    ];
    if (omitted.length) {
        const note = document.createElement('div');
        note.className = 'sync-status-note';
        note.textContent = `${t('localOnlyAssets', 'Local-only assets')}: ${omitted.join(', ')}`;
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
    const apiHint = document.getElementById('bg-api-hint');
    
    // Hide all sections first
    if (colorSection) colorSection.style.display = 'none';
    if (imageSection) imageSection.style.display = 'none';
    if (apiHint) apiHint.style.display = 'none';
    
    // Show relevant section
    switch (bgType) {
        case 'color':
            if (colorSection) colorSection.style.display = 'block';
            break;
        case 'image':
            if (imageSection) imageSection.style.display = 'block';
            break;
        case 'api':
            if (apiHint) apiHint.style.display = 'block';
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

function setBackgroundTypeSelection(select, actualType, allowApi) {
    if (!select) return;
    if (!select.dataset) select.dataset = {};
    const blockedApi = actualType === 'api' && allowApi !== true;
    select.value = blockedApi ? 'gradient' : actualType;
    if (blockedApi) {
        select.dataset.preferredBgType = 'api';
    } else {
        delete select.dataset.preferredBgType;
    }
}

/**
 * Save background settings immediately
 */
async function saveBackgroundSettings() {
    try {
        const bgTypeSelect = document.getElementById('bg-type');
        let bgType = bgTypeSelect?.value || 'gradient';
        const bgColor = document.getElementById('bg-color')?.value || '';
        const existingConfig = await storageManager.getAll();

        let bgValue = '';
        if (bgType === 'color') {
            bgValue = bgColor;
        } else if (bgType === 'image') {
            bgValue = existingConfig.bg.value; // Keep existing image
        } else if (bgType === 'api') {
            const onlineWallpapersInput = document.getElementById('privacy-online-wallpapers');
            if (onlineWallpapersInput?.checked === true && onlineWallpapersInput.dataset.permissionMissing === 'true') {
                if (await ensurePrivacyPermission('wallpapers', true)) {
                    onlineWallpapersInput.dataset.permissionMissing = 'false';
                    refreshPrivacyPermissionHints();
                } else {
                    setBackgroundTypeSelection(bgTypeSelect, existingConfig.bg.type || 'gradient', false);
                    updateBackgroundSections();
                    showMessage('Online wallpaper permission was not granted.', 'error');
                    return;
                }
            }

            if (bgType === 'api' && (existingConfig.privacy?.onlineWallpapers === true || onlineWallpapersInput?.checked === true)) {
                bgValue = 'https://api.paugram.com/wallpaper/';
            } else {
                setBackgroundTypeSelection(bgTypeSelect, existingConfig.bg.type || 'gradient', false);
                updateBackgroundSections();
                showMessage('Enable online random wallpapers in Privacy first.', 'error');
                return;
            }
        }

        await storageManager.set('bg', { type: bgType, value: bgValue });
    } catch (error) {
        console.error('Error saving background settings:', error);
    }
}

/**
 * Remove background image and revert to gradient
 */
async function removeBackgroundImage() {
    try {
        if (confirm('Are you sure you want to remove the background image?')) {
            await storageManager.set('bg', { type: 'gradient', value: '' });
            
            // Update UI
            const bgTypeSelect = document.getElementById('bg-type');
            if (bgTypeSelect) {
                bgTypeSelect.value = 'gradient';
                updateBackgroundSections();
            }
            
            // Hide preview
            const previewDiv = document.getElementById('bg-image-preview');
            if (previewDiv) {
                previewDiv.style.display = 'none';
            }
            
            // Clear file input
            const bgImageInput = document.getElementById('bg-image-upload');
            if (bgImageInput) {
                bgImageInput.value = '';
            }
            
            showMessage('Background image removed.', 'success');
        }
    } catch (error) {
        console.error('Error removing background image:', error);
        showMessage(`Error removing background image: ${error.message}`, 'error');
    }
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
        let settings;
        
        // Handle both old format (direct settings) and new format (with metadata)
        if (importData.data && importData.version) {
            // New format with metadata
            settings = importData.data;
            console.log(`Importing settings from version ${importData.version}, exported on ${importData.exportDate}`);
        } else {
            // Old format or direct settings object
            settings = importData;
        }
        
        // Validate that settings is an object
        if (typeof settings !== 'object' || settings === null) {
            throw new Error('Settings data must be an object');
        }
        
        // Get default config for validation
        const defaultConfig = storageManager.defaultConfig;
        const validatedSettings = {};
        
        // Validate each required key exists and has valid structure
        for (const [key, defaultValue] of Object.entries(defaultConfig)) {
            if (settings.hasOwnProperty(key)) {
                try {
                    // Use storage manager's validation
                    validatedSettings[key] = storageManager.validateData(key, settings[key]);
                } catch (validationError) {
                    console.warn(`Validation failed for ${key}, using default:`, validationError);
                    validatedSettings[key] = JSON.parse(JSON.stringify(defaultValue));
                }
            } else {
                // Use default if key is missing
                validatedSettings[key] = JSON.parse(JSON.stringify(defaultValue));
            }
        }
        
        // Validate critical data types
        if (!Array.isArray(validatedSettings.links)) {
            validatedSettings.links = [];
        }
        
        if (typeof validatedSettings.quote !== 'string') {
            validatedSettings.quote = defaultConfig.quote;
        }
        
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
        'privacy-online-wallpapers', 'privacy-online-favicons',
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
