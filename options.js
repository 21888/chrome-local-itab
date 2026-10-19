// Options page JavaScript - with storage management
const THEME_PRESETS = ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'];
const PRIVACY_PERMISSION_ORIGINS = {
    favicons: 'https://www.google.com/*'
};
let driveBackupSnapshots = [];
let driveActionInProgress = false;
let drivePanelRenderVersion = 0;
let drivePanelRenderPending = Promise.resolve();
let drivePanelState = null;
// Field state and per-computer drafts live only for this page and DOM input.
const driveDeviceNameFields = new WeakMap();
let cloudReplacementInProgress = false;
// Explicit Sync actions can wait outside the workspace Session's write queue.
// Count the entire UI operation, including preflight and final status reads.
let manualSyncActionsPending = 0;
async function runManualSyncAction(operation) {
    ++manualSyncActionsPending;
    try { return await operation(); }
    finally { --manualSyncActionsPending; }
}

// A category baseline belongs to this form, never to a later storage read.
let clockBaseline = null;
let clockFormInitialized = false;
let worldClockDraft = [];
let worldClockSaves = 0;
let worldClockRenderVersion = 0;
const copyClock = value => ({hour12: value.hour12, showSeconds: value.showSeconds,
    worldClocks: (value.worldClocks || []).map(entry => ({...entry}))});
const sameClock = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function clockFormSnapshot(includeWorldClocks = false) {
    return {hour12: document.getElementById('hour12-format')?.checked || false,
        showSeconds: document.getElementById('show-seconds')?.checked !== false,
        worldClocks: (includeWorldClocks ? worldClockDraft : clockBaseline?.worldClocks || []).map(entry => ({...entry}))};
}
function worldClockHasUncommittedWork() {
    return worldClockSaves > 0 || Boolean(document.getElementById('world-clock-zone')?.value ||
        document.getElementById('world-clock-label')?.value) || Boolean(clockBaseline &&
        !sameClock(clockFormSnapshot(true), clockBaseline));
}
function renderWorldClockDraft() {
    const list = document.getElementById('world-clock-list');
    if (!list) return;
    const version = ++worldClockRenderVersion;
    list.replaceChildren();
    worldClockDraft.forEach((entry, index) => {
        const item = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = entry.label ? `${entry.label} · ${entry.timeZone}` : entry.timeZone;
        const actions = document.createElement('div'); actions.className = 'world-clock-actions';
        const ownsRow = () => version === worldClockRenderVersion && item.isConnected && document.getElementById('world-clock-list') === list &&
            list.children[index] === item && worldClockDraft[index] === entry;
        for (const [action, key, fallback, offset] of [
            ['up', 'worldClockMoveUp', 'Move up', -1],
            ['down', 'worldClockMoveDown', 'Move down', 1],
            ['remove', 'worldClockRemove', 'Remove', 0]
        ]) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary';
            button.dataset.clockAction = action;
            button.textContent = t(key, fallback);
            button.setAttribute('aria-label', `${button.textContent}: ${name.textContent}`);
            const target = index + offset;
            button.disabled = offset !== 0 && (target < 0 || target >= worldClockDraft.length);
            button.addEventListener('keydown', event => {
                if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
                    (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            button.addEventListener('click', () => {
                if (!ownsRow() || button.disabled) return;
                if (offset) {
                    if (target < 0 || target >= worldClockDraft.length) return;
                    [worldClockDraft[index], worldClockDraft[target]] = [worldClockDraft[target], entry];
                    renderWorldClockDraft();
                    const moved = list.children[target];
                    const preferred = moved.querySelector(`[data-clock-action="${action}"]`);
                    const opposite = moved.querySelector(`[data-clock-action="${offset < 0 ? 'down' : 'up'}"]`);
                    (preferred.disabled ? opposite : preferred).focus();
                } else {
                    worldClockDraft.splice(index, 1); renderWorldClockDraft();
                    const buttons = list.querySelectorAll('[data-clock-action="remove"]');
                    (buttons[Math.min(index, buttons.length - 1)] || document.getElementById('world-clock-zone')).focus();
                }
            });
            actions.append(button);
        }
        item.append(name, actions); list.append(item);
    });
}
function setupWorldClocks() {
    const add = document.getElementById('world-clock-add');
    if (!add || add.dataset.bound) return;
    add.dataset.bound = 'true';
    const zone = document.getElementById('world-clock-zone');
    const label = document.getElementById('world-clock-label');
    const error = document.getElementById('world-clock-error');
    const append = () => {
        try {
            worldClockDraft = window.WorldClocks.normalize([...worldClockDraft, {timeZone: zone.value, label: label.value}]);
            zone.value = ''; label.value = ''; error.textContent = ''; zone.removeAttribute?.('aria-invalid');
            renderWorldClockDraft(); zone.focus();
        } catch (_) {
            error.textContent = t('worldClockInvalid', 'Use a valid IANA time zone, a label of up to 40 characters, and at most four different zones.');
            zone.setAttribute('aria-invalid', 'true'); zone.focus();
        }
    };
    add.addEventListener('click', append);
    add.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
            (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    for (const input of [zone, label]) input.addEventListener('keydown', event => {
        // Candidate confirmation belongs to the IME, including its final 229
        // event. Held Enter must not validate the newly cleared input again.
        if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        if (!event.repeat) append();
    });
    document.getElementById('world-clock-save').addEventListener('click', () => saveAllSettings(true));
    window.worldClockSettingsView = {hasUncommittedWork: worldClockHasUncommittedWork,
        get pending() { return worldClockSaves > 0; }};
}

// The rendered form and its original storage read have distinct ownership.
// Never refresh these baselines from a later read while a draft is open.
let settingsBaseline = null;
let settingsFormBaseline = null;
let settingsFormConfig = null;
let backgroundFormBaseline = null;
let settingsHelperSaves = 0;
let privacyPermissionRequest = 0;
let privacyPermissionPending = false;
const copySettings = value => JSON.parse(JSON.stringify(value));
function settingsNotice(error) {
    if (error?.code === 'SETTINGS_BASELINE_UNAVAILABLE') return t('settingsBaselineUnavailable', 'Settings could not be read safely. Your edits are still here. Open a new Settings tab before saving.');
    if (error?.code === 'SETTINGS_LOCK_UNAVAILABLE') return t('settingsLockUnavailable', 'Safe Settings saving is unavailable in this browser. Your edits have not been saved.');
    if (error?.code === 'SETTINGS_PERMISSION_REQUIRED') return t('settingsPermissionRequired', 'Online favicon permission is still pending or was not granted. Finish the permission request or turn this setting off before saving.');
    return t('settingsSaveConflict', 'Settings changed in another tab or were replaced. Your edits are still here. Open a new Settings tab to review the latest values and copy your changes there.');
}
function requireSettingsBaseline() {
    if (!settingsBaseline || !settingsFormBaseline) {
        const error = new Error(); error.code = 'SETTINGS_BASELINE_UNAVAILABLE'; throw error;
    }
}
function settingsDirtyPaths(form, baseline = settingsFormBaseline) {
    return storageManager.settingsFormPaths.filter(path => !['bg', 'movie.poster'].includes(path) &&
        JSON.stringify(storageManager.settingsPathValue(form, path)) !== JSON.stringify(storageManager.settingsPathValue(baseline, path)));
}
function advanceSettingsBaseline(settings, paths, submittedForm) {
    for (const path of paths) {
        const value = storageManager.settingsPathValue(settings, path);
        storageManager.setSettingsPath(settingsBaseline.values, path, value);
        storageManager.setSettingsPath(settingsFormConfig, path, value);
        storageManager.setSettingsPath(settingsFormBaseline, path, storageManager.settingsPathValue(submittedForm, path));
    }
}
function settingsHasUncommittedWork() {
    if (manualSyncActionsPending > 0 || driveActionInProgress || driveDeviceNameHasDrafts()) return true;
    if (settingsReplacementRunning || worldClockSaves > 0 || backgroundSaves > 0 || settingsHelperSaves > 0 || privacyPermissionPending) return true;
    if (settingsReplacementPending || !settingsFormBaseline) return false;
    try { return settingsDirtyPaths(collectFormData(false)).length > 0 ||
        (backgroundFormBaseline !== null && backgroundFormSnapshot() !== backgroundFormBaseline) ||
        Array.from(document.querySelectorAll('.topic-title-input')).some(input => input.value) || !bookmarkCategoryFormClean(); }
    catch (_) { return true; }
}

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
    window.importClosureView?.cancel();
    settingsReplacementRunning = true;
    settingsReplacementPending = true;
    ++settingsSession;
    ++backgroundRequest;
    ++privacyPermissionRequest;
    privacyPermissionPending = false;
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
let bookmarkDeferredWorldClockSave = false;
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
            const includeWorldClocks = bookmarkDeferredWorldClockSave;
            bookmarkDeferredWorldClockSave = false;
            // Capture the form only after our successful category refresh; an
            // ordinary auto-save requested during import must not disappear.
            await saveAllSettings(includeWorldClocks);
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

// Complete restore never saves or discards a page-local draft implicitly.
function completeBackupHasDrafts() {
    return settingsHasUncommittedWork() || worldClockHasUncommittedWork() ||
        Boolean(window.localScratchpadSettingsView?.hasUncommittedWork()) ||
        Boolean(window.localCountdownSettingsView?.hasUncommittedWork()) ||
        Boolean(window.localFocusSettingsView?.hasUncommittedWork?.()) ||
        Boolean(window.localFocusSettingsView?.controller.pending) ||
        Boolean(window.localTasksSettingsController?.pending) ||
        Boolean(window.bookmarkImportView?.hasUncommittedWork()) ||
        Boolean(window.bookmarkExportView?.hasUncommittedWork()) ||
        Boolean(window.workspacePresetsView?.hasUncommittedWork()) ||
        bookmarkImportPending || driveActionInProgress || cloudReplacementInProgress;
}
function setupCompleteBackup() {
    const host = document.getElementById('complete-backup');
    if (!host || window.completeBackupView || !window.LocalItabCompleteBackup || !window.LocalItabCompleteBackupView) return;
    const store = new window.LocalItabCompleteBackup.Store(storageManager);
    window.completeBackupView = window.LocalItabCompleteBackupView.mount(host, {
        store,
        restore: (preview, isCurrent) => queueSettingsWrite(async () => {
            if (!isCurrent()) throw Object.assign(new Error(), {code: 'CANCELLED'});
            if (completeBackupHasDrafts()) throw Object.assign(new Error(), {code: 'DIRTY'});
            // Core owns the lock, recovery, baseline check and read-back verification.
            // No confirm(), reload or form refresh belongs inside this transaction.
            return store.restore(preview, {confirmed: true, isCurrent: () => isCurrent() && !completeBackupHasDrafts()});
        }),
        recoverInterruptedRestore: (review, isCurrent) => queueSettingsWrite(async () => {
            if (!isCurrent()) throw Object.assign(new Error(), {code: 'CANCELLED'});
            if (completeBackupHasDrafts()) throw Object.assign(new Error(), {code: 'DIRTY'});
            return store.recoverInterruptedRestore(review, {confirmed: true, isCurrent: () => isCurrent() && !completeBackupHasDrafts()});
        })
    });
}

// Startup recovery must remain reachable without admitting ordinary settings
// reads/writes through the pending-restore fence. Never unlock this page in-place.
function setupInterruptedSettingsRecovery(error) {
    if (error?.code !== 'WORKSPACE_RESTORE_PENDING') return false;
    for (const area of document.querySelectorAll('.options-main, .options-footer, #workspace-switcher')) {
        if (area.id === 'interrupted-settings-recovery') continue;
        area.hidden = true; area.inert = true;
        for (const control of area.querySelectorAll('input, button, select, textarea')) control.disabled = true;
    }
    if (window.interruptedSettingsRecoveryView) return true;
    if (!window.LocalItabCompleteBackup || !window.LocalItabCompleteBackupView) return false;
    const host = document.createElement('section'); host.id = 'interrupted-settings-recovery'; host.className = 'options-main';
    host.setAttribute('tabindex', '-1');
    const notice = document.createElement('p'); notice.className = 'form-hint'; notice.setAttribute('role', 'alert');
    notice.textContent = t('settingsInterruptedRecovery', 'An interrupted local restore is blocking ordinary Settings. Inspect the saved copies below before deciding whether to restore the previous state. No automatic repair has run. After recovery, use Reload; ordinary settings stay unavailable on this page. This does not diagnose or resolve an earlier upgrade data-loss incident.');
    host.append(notice); (document.querySelector('.options-container') || document.body).append(host);
    try {
        const store = new window.LocalItabCompleteBackup.Store(storageManager);
        window.interruptedSettingsRecoveryView = window.LocalItabCompleteBackupView.mount(host, {
            store, recoveryOnly: true,
            recoverInterruptedRestore: (review, isCurrent) => queueSettingsWrite(async () => {
                if (!isCurrent()) throw Object.assign(new Error(), {code: 'CANCELLED'});
                if (completeBackupHasDrafts()) throw Object.assign(new Error(), {code: 'DIRTY'});
                return store.recoverInterruptedRestore(review, {confirmed: true, isCurrent: () => isCurrent() && !completeBackupHasDrafts()});
            })
        });
        document.querySelector('.skip-link')?.setAttribute('href', '#interrupted-settings-recovery');
        return true;
    } catch (setupError) { host.remove(); throw setupError; }
}

// Serialize background-only writes while the newest request owns the controls.
// A rejected operation must not poison the next upload/removal/type-change attempt.
let backgroundRequest = 0;
let backgroundSaves = 0;
function queueBackgroundTask(operation) {
    if (settingsReplacementPending) return Promise.resolve();
    const request = ++backgroundRequest, session = settingsSession;
    const submittedControls = backgroundFormSnapshot();
    const isCurrent = () => request === backgroundRequest && session === settingsSession && !settingsReplacementPending;
    ++backgroundSaves;
    return queueSettingsWrite(() => operation(isCurrent, () => isCurrent() && backgroundFormSnapshot() === submittedControls, submittedControls)).finally(() => { --backgroundSaves; });
}
function backgroundFormSnapshot() {
    return JSON.stringify(['bg-type', 'bg-color', 'bg-color-text'].map(id => document.getElementById(id)?.value || ''));
}
function publishCommittedBackground(background, canPresent, submittedControls) {
    backgroundFormBaseline = submittedControls;
    if (canPresent()) {
        applyCommittedBackground(background);
        backgroundFormBaseline = backgroundFormSnapshot();
    }
}
async function commitBackground(background) {
    requireSettingsBaseline();
    background = storageManager.validateData('bg', background);
    const saved = await storageManager.setAll({bg: background}, {expectedSettings: settingsBaseline, settingsPaths: ['bg']});
    if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
    // Even a superseded successful write is the next queued action's baseline.
    advanceSettingsBaseline({bg: background}, ['bg'], {bg: background});
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

    let navigationVersion = 0;
    const activateTab = (tabId) => {
        if (!tabs.some(tab => tab.dataset.tab === tabId) || !panels.some(panel => panel.dataset.tab === tabId)) return false;
        window.importClosureView?.cancel();
        navigationVersion++;
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
        return true;
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

    // Navigate to existing backup sections without remounting or saving the form.
    // Focus the heading, never Export: a held activation key must not download a file.
    const backupHost = document.getElementById('update-backup-shortcuts');
    const backupTargets = { 'data-settings': 'data', 'countdown-settings': 'content' };
    const blockedBackupEvent = event => event.repeat || event.isComposing || event.keyCode === 229 ||
        event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.detail > 1;
    for (const button of backupHost?.querySelectorAll('button[data-update-backup-target]') || []) {
        button.addEventListener('keydown', event => {
            if (['Enter', ' ', 'Spacebar'].includes(event.key) && blockedBackupEvent(event)) event.preventDefault();
        });
        button.addEventListener('click', event => {
            if (blockedBackupEvent(event) || button.disabled || !button.isConnected ||
                document.getElementById('update-backup-shortcuts') !== backupHost || !backupHost.contains(button) ||
                button.closest('[inert]') || !button.getClientRects().length) return;
            const id = button.dataset.updateBackupTarget, tab = backupTargets[id];
            const target = tab && document.getElementById(id), panel = target?.closest('.tab-panel');
            const heading = target?.querySelector('h2.section-title');
            if (!target?.isConnected || !panel?.isConnected || panel.dataset.tab !== tab ||
                target.closest('[hidden], [inert]') || !heading || activateTab(tab) === false ||
                !heading.getClientRects().length || window.getComputedStyle?.(heading)?.visibility === 'hidden') return;
            heading.tabIndex = -1;
            heading.focus({preventScroll: true});
            target.scrollIntoView({behavior: 'instant', block: 'start'});
        });
    }

    const hash = window.location.hash ? window.location.hash.slice(1) : '';
    if (hash) {
        const targetSection = document.getElementById(hash);
        const targetPanel = targetSection?.closest('.tab-panel');
        if (targetPanel?.dataset.tab) {
            activateTab(targetPanel.dataset.tab);
            const version = navigationVersion;
            setTimeout(() => {
                if (version !== navigationVersion || window.location.hash !== `#${hash}` ||
                    !targetPanel.isConnected || !targetPanel.classList.contains('active') ||
                    document.getElementById(hash) !== targetSection || !targetSection.isConnected ||
                    targetSection.closest('.tab-panel') !== targetPanel || !targetSection.getClientRects().length) return;
                if (hash === 'import-settings-btn') {
                    // Focus only this explicit action destination, after listeners are ready.
                    // A newer tab choice/control owns focus; never open the file picker here.
                    if (targetSection.disabled || targetSection.closest('[inert]') ||
                        window.getComputedStyle?.(targetSection)?.visibility === 'hidden' ||
                        ![document.body, document.documentElement, targetSection].includes(document.activeElement)) return;
                    targetSection.focus({ preventScroll: true });
                }
                targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 80);
            return {activateTab};
        }
    }

    activateTab(tabs[0].dataset.tab);
    return {activateTab};
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
            if (result?.applied && (!storageManager.workspace || storageManager.workspace.id === 'default')) {
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
        await window.LocalItabWorkspacesView?.mountPage();
        await initializeOptionsPage();
        
        // Set up event listeners
        setupEventListeners();

        // Initialize tabbed layout
        const settingsTabs = setupSettingsTabs();
        setupCloudSyncChangeListener();
        
        // Apply i18n to DOM
        if (window.i18n) {
            window.i18n.localizeDocument(document);
        }
        localizeBackgroundImageControls();
        if (settingsTabs && window.LocalItabSettingsSearch) {
            window.LocalItabSettingsSearch.mount(document.getElementById('settings-search'), settingsTabs);
        }

        // Display storage usage info
        await displayStorageInfo();
        await renderSyncStatus();
        await renderDriveBackupPanel();

        refreshPrivacyPermissionHints();
    } catch (error) {
        if (setupInterruptedSettingsRecovery(error)) return;
        console.error('Error initializing options page:', error);
        showErrorMessage(t('settingsLoadFailed', 'Failed to load settings. Please try refreshing the page.'));
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
        setupCompleteBackup();
        setupImportClosure(storageManager);
        const countdownHost = document.getElementById('local-countdown-settings');
        if (countdownHost && window.LocalItabCountdown && !window.localCountdownSettingsView) {
            window.localCountdownSettingsView = window.LocalItabCountdown.mountSettings(countdownHost);
        }
        const scratchpadHost = document.getElementById('local-scratchpad-settings');
        if (scratchpadHost && window.LocalItabScratchpad && !window.localScratchpadSettingsView) {
            window.localScratchpadSettingsView = window.LocalItabScratchpad.mountSettings(scratchpadHost);
        }
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
            baseline: config._settingsBaseline,
            onError: error => console.warn('Appearance save/read failed:', error)
        });
    }

    // Time settings
    const hour12Checkbox = document.getElementById('hour12-format');
    const showSecondsCheckbox = document.getElementById('show-seconds');
    
    if (hour12Checkbox) hour12Checkbox.checked = config.clock.hour12;
    if (showSecondsCheckbox) showSecondsCheckbox.checked = config.clock.showSeconds;
    clockFormInitialized = true;
    clockBaseline = config._clockBaseline ? copyClock(config._clockBaseline) : null;
    worldClockDraft = (config.clock.worldClocks || []).map(entry => ({...entry}));
    renderWorldClockDraft(); setupWorldClocks();
    

    
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
    const finderShortcutCheckbox = document.getElementById('finder-shortcut-enabled');
    const showWeatherCheckbox = document.getElementById('show-weather');
    const showHotCheckbox = document.getElementById('show-hot');
    const showMovieCheckbox = document.getElementById('show-movie');

    if (showClockCheckbox) showClockCheckbox.checked = config.show.clock;
    if (showSearchCheckbox) showSearchCheckbox.checked = config.show.search !== false;
    if (showShortcutsCheckbox) showShortcutsCheckbox.checked = config.show.shortcuts;
    if (showWeatherCheckbox) showWeatherCheckbox.checked = config.show.weather === true;
    if (showHotCheckbox) showHotCheckbox.checked = config.show.hot === true;
    if (showMovieCheckbox) showMovieCheckbox.checked = config.show.movie === true;
    if (finderShortcutCheckbox) finderShortcutCheckbox.checked = config.ui?.finderShortcutEnabled !== false;
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
    settingsFormConfig = copySettings(config);
    settingsBaseline = config._settingsBaseline ? copySettings(config._settingsBaseline) : null;
    settingsFormBaseline = collectFormData(false);
    backgroundFormBaseline = backgroundFormSnapshot();
    window.settingsFormView = {hasUncommittedWork: settingsHasUncommittedWork,
        saveDrafts: () => saveAllSettings(true), flush: () => settingsSaveQueue,
        pauseAutosave() { clearTimeout(categorySaveTimeout); },
        get pending() { return manualSyncActionsPending > 0 || driveActionInProgress || settingsReplacementRunning || worldClockSaves > 0 || backgroundSaves > 0 || settingsHelperSaves > 0 || privacyPermissionPending; }};
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
        iconInput.setAttribute('aria-label', t('settingsCategoryIcon', 'Category icon'));
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'form-input cat-name';
        nameInput.value = cat.name || '';
        nameInput.setAttribute('aria-label', t('settingsCategoryName', 'Category name'));
        const actions = document.createElement('div');
        actions.className = 'category-actions';
        [
            ['settingsCategoryMoveUp', 'Move category up', '↑', 'btn btn-secondary btn-sm cat-up'],
            ['settingsCategoryMoveDown', 'Move category down', '↓', 'btn btn-secondary btn-sm cat-down'],
            ['settingsCategoryDelete', 'Delete category', '✕', 'btn btn-danger btn-sm cat-delete']
        ].forEach(([key, fallback, text, className]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className;
            button.title = t(key, fallback);
            button.setAttribute('aria-label', button.title);
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
        categorySaveTimeout = setTimeout(() => { if (!window.LocalItabContentLifecycle?.autosavePaused) saveAllSettings(); }, 800);
    };

    // Keep native activation, but do not add for held or IME-owned keys.
    addBtn.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
            (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    addBtn.addEventListener('click', () => {
        const newCat = { id: `cat_${Date.now()}`, name: t('settingsNewCategory', 'New category'), icon: '📁' };
        list.appendChild(createItem(newCat));
        scheduleSave();
    });

    list.addEventListener('click', (e) => {
        const li = e.target.closest('.category-manage-item');
        if (!li) return;
        const ownedFocus = document.activeElement === e.target;
        let focusTarget = null;
        if (e.target.classList.contains('cat-delete')) {
            const neighbor = li.nextElementSibling || li.previousElementSibling;
            // Land on a name, not another Delete button, after removing a row.
            focusTarget = neighbor?.querySelector('.cat-name') || addBtn;
            li.remove();
            scheduleSave();
        } else if (e.target.classList.contains('cat-up')) {
            focusTarget = e.target;
            const prev = li.previousElementSibling;
            if (prev) list.insertBefore(li, prev);
            scheduleSave();
        } else if (e.target.classList.contains('cat-down')) {
            focusTarget = e.target;
            const next = li.nextElementSibling;
            if (next) list.insertBefore(next, li);
            scheduleSave();
        }
        // Native removal/move can drop focus to body. Repair only this action's
        // lost focus; a newer focus or replacement editor remains authoritative.
        if (ownedFocus && focusTarget?.isConnected && document.activeElement === document.body &&
            document.getElementById('category-manage-list') === list && list.isConnected &&
            (focusTarget === addBtn ? document.getElementById('add-category') === addBtn : list.contains(focusTarget))) {
            focusTarget.focus();
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
                    chrome.tabs.update(tabs[0].id, {url: chrome.runtime.getURL('newtab.html') + (storageManager.workspace?.id ? '?workspace=' + encodeURIComponent(storageManager.workspace.id) : '')});
                });
            } else {
                // Fallback for when chrome.tabs is not available
                window.location.href = 'newtab.html' + (storageManager.workspace?.id ? '?workspace=' + encodeURIComponent(storageManager.workspace.id) : '');
            }
        });
    }
    
    // Save settings button
    const saveButton = document.getElementById('save-settings');
    if (saveButton) {
        saveButton.addEventListener('click', async function() {
            await saveAllSettings(true, saveButton);
        });
    }
    
    // Reset settings button
    const resetButton = document.getElementById('reset-settings');
    if (resetButton) {
        resetButton.addEventListener('click', async function() {
            if (confirm(t('spacesResetConfirm', "Reset this workspace\u2019s sites, layout and settings to defaults? Tasks, notes, countdown, Focus and shared privacy/cloud preferences are kept. This cannot be undone. Export a backup first if you need a copy. Protected local import evidence is kept and its one-slot capacity is not freed."))) {
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
    
    setupBookmarkExport();

    // Import settings button (trigger file input)
    const importButton = document.getElementById('import-settings-btn');
    const importInput = document.getElementById('import-settings');
    if (importButton && importInput) {
        importButton.addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ') && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
        });
        importButton.addEventListener('click', function(event) {
            if (event.detail > 1 || event.repeat || event.isComposing || importButton.disabled || settingsImportSaving) return;
            retireSettingsImportPreparation();
            importInput.value = '';
            importInput.click();
        });
        importInput.addEventListener('click', event => {
            if (settingsImportSaving) { event.preventDefault(); return; }
            retireSettingsImportPreparation();
            importInput.value = '';
        });
        importInput.addEventListener('cancel', () => {
            if (settingsImportSaving) return;
            retireSettingsImportPreparation();
            importInput.value = '';
        });
        importInput.addEventListener('change', async function(event) {
            await importSettings(event.target.files[0]);
        });
        window.addEventListener?.('pagehide', retireSettingsImportPreparation);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') retireSettingsImportPreparation();
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
        syncToggle.addEventListener('change', () => runManualSyncAction(async () => {
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
                showMessage(t('syncFailed', 'Chrome 同步失败：$1', syncErrorMessage(error)), 'error');
                await renderSyncStatus();
            } finally {
                const status = await storageManager.getSyncStatus();
                syncToggle.disabled = !status.available;
            }
        }));
    }

    if (syncUpload) {
        syncUpload.addEventListener('click', () => runManualSyncAction(async () => {
            try {
                showMessage(t('syncUploadStart', '正在上传设置到 Chrome 同步...'), 'info');
                const status = await storageManager.pushToSync();
                showMessage(t('syncUploadDone', '设置已上传到 Chrome 同步。'), 'success');
                await renderSyncStatus(status);
            } catch (error) {
                console.error('Cloud sync upload error:', error);
                showMessage(t('syncUploadFailed', '上传失败：$1', syncErrorMessage(error)), 'error');
                await renderSyncStatus();
            }
        }));
    }

    if (syncDownload) {
        syncDownload.addEventListener('click', () => runManualSyncAction(async () => {
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
                showMessage(t('syncDownloadFailed', '下载失败：$1', syncErrorMessage(error)), 'error');
                await renderSyncStatus();
            }
        }));
    }

    if (syncClear) {
        syncClear.addEventListener('click', () => runManualSyncAction(async () => {
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
        }));
    }


    if (onlineFavicons) {
        onlineFavicons.addEventListener('change', async () => {
            const request = ++privacyPermissionRequest, session = settingsSession;
            const enabled = onlineFavicons.checked;
            privacyPermissionPending = enabled;
            const granted = !enabled || await ensurePrivacyPermission('favicons', true);
            if (request !== privacyPermissionRequest || session !== settingsSession || settingsReplacementPending) return;
            privacyPermissionPending = false;
            if (!granted) {
                onlineFavicons.checked = false;
                showMessage(t('settingsFaviconPermissionDenied', 'Online favicon permission was not granted.'), 'error');
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
            
            const accepted = addHotTopic(tabType, titleInput.value, parseInt(scoreInput.value) || 0);
            if (accepted !== false) { titleInput.value = ''; scoreInput.value = ''; }
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

function renderDriveActionControls() {
    if (!drivePanelState) { setDriveActionsDisabled(true); return; }
    const { apiReady, oauthReady, stateRead, connected, storageAvailable } = drivePanelState;
    const disabled = {
        'drive-connect': !apiReady || !oauthReady,
        'drive-backup-now': !apiReady || !oauthReady || !connected,
        'drive-refresh-list': !apiReady || !oauthReady || !connected,
        'drive-rename-device': !storageAvailable || !stateRead,
        'drive-add-device': !storageAvailable || !stateRead,
        'drive-device-select': !storageAvailable || !stateRead
    };
    for (const [id, unavailable] of Object.entries(disabled)) {
        const control = document.getElementById(id);
        if (control) control.disabled = driveActionInProgress || unavailable;
    }
    document.querySelectorAll('[data-drive-action]').forEach(button => {
        button.disabled = driveActionInProgress || !apiReady || !oauthReady || !connected;
    });
}

function driveDeviceNameHasDrafts() {
    const input = document.getElementById('drive-device-name');
    if (!input) return false;
    const field = driveDeviceNameFields.get(input);
    if (!field) return Boolean(input.value);
    // The live value supersedes this computer's cached draft, including when
    // edited back to its baseline. Other computers still own their exact drafts.
    return input.value !== field.baseline || [...field.drafts.keys()].some(id => id !== field.deviceId);
}

function renderDriveDeviceName(input, deviceId, savedName) {
    if (!input) return;
    let field = driveDeviceNameFields.get(input);
    if (!field) {
        field = { deviceId, baseline: savedName, drafts: new Map() };
        driveDeviceNameFields.set(input, field);
        if (document.activeElement !== input) input.value = savedName;
        return;
    }
    // Capture against the field's own target, never the freshly rendered selector.
    if (input.value === field.baseline) field.drafts.delete(field.deviceId);
    else field.drafts.set(field.deviceId, input.value);
    if (field.deviceId !== deviceId) {
        input.value = field.drafts.has(deviceId) ? field.drafts.get(deviceId) : savedName;
        field.deviceId = deviceId;
        field.baseline = savedName;
    } else if (!field.drafts.has(deviceId) && document.activeElement !== input) {
        input.value = savedName;
        field.baseline = savedName;
    }
    if (input.value === savedName) {
        field.baseline = savedName;
        field.drafts.delete(deviceId);
    }
}

function acknowledgeDriveDeviceName(input, deviceId, submittedValue, renamedValue) {
    const field = input && driveDeviceNameFields.get(input);
    if (!field) return;
    if (field.deviceId !== deviceId) {
        if (field.drafts.get(deviceId) === submittedValue) field.drafts.delete(deviceId);
        return;
    }
    if (input.value !== submittedValue) {
        // Rename changed this profile's saved value. Retyping the old name
        // during the write is now a draft too. Add leaves the old profile alone.
        if (renamedValue !== undefined) field.baseline = renamedValue;
        return;
    }
    // Only the exact completed submission is clean; later edits remain drafts.
    field.baseline = input.value;
    field.drafts.delete(deviceId);
}

function renderDriveBackupPanel(snapshots = null) {
    const request = ++drivePanelRenderVersion;
    drivePanelRenderPending = renderDriveBackupPanelState(snapshots, request);
    return drivePanelRenderPending;
}

async function renderDriveBackupPanelState(snapshots, request) {
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
        drivePanelState = null; renderDriveActionControls();
        return;
    }

    const defaultWorkspace = !storageManager.workspace || await storageManager.isDefaultWorkspace();
    if (request !== drivePanelRenderVersion) return;
    if (!defaultWorkspace) {
        if (statusElement) statusElement.replaceChildren(createStatusRow(t('syncStatus', 'Status'), t('spacesProviderDefault', 'Cloud backups apply to Default only. Open Settings in Default to manage or restore cloud backups.')));
        historyElement?.replaceChildren(); drivePanelState = null; renderDriveActionControls(); return;
    }
    const availability = getDriveAvailability(manager);
    const apiReady = availability.apiAvailable === true;
    const oauthReady = apiReady && availability.oauthConfigured !== false;
    let state = null, stateRead = false;
    try {
        if (availability.storageAvailable) { state = await manager.getState(); stateRead = true; }
        else state = manager.normalizeState({});
    } catch (_) {
        state = manager.normalizeState({});
    }
    if (request !== drivePanelRenderVersion) return;
    const connected = !!state.connectedAt;
    const knownDevices = Array.isArray(state.knownDevices) && state.knownDevices.length
        ? state.knownDevices
        : [{ id: state.deviceId, name: state.deviceName }];

    // A generated fallback profile cannot establish a new draft owner.
    if (stateRead && deviceSelect) {
        const options = knownDevices.map(profile => {
            const option = document.createElement('option');
            option.value = profile.id;
            option.textContent = profile.name || t('driveUnknownDevice', '未知设备');
            return option;
        });
        deviceSelect.replaceChildren(...options);
        deviceSelect.value = state.deviceId;
    }

    if (stateRead) renderDriveDeviceName(nameInput, state.deviceId, state.deviceName || t('driveDevicePlaceholder', '家里的电脑'));

    const rows = [];
    const statusClass = (!apiReady || !oauthReady || !stateRead) ? 'is-error' : (connected ? 'is-on' : 'is-off');
    rows.push(createStatusRow(t('syncStatus', '状态'), stateRead ? getDriveAvailabilityLabel(availability, state) : t('driveStatusStorageUnavailable', 'Storage unavailable'), statusClass));
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

    drivePanelState = { apiReady, oauthReady, stateRead, connected,
        storageAvailable: availability.storageAvailable, deviceId: stateRead ? state.deviceId : drivePanelState?.deviceId };

    if (Array.isArray(snapshots)) {
        driveBackupSnapshots = snapshots;
    }
    renderDriveBackupHistory(driveBackupSnapshots, {
        ready: apiReady && oauthReady,
        connected,
        knownDevices,
        activeDeviceId: state.deviceId
    });
    renderDriveActionControls();
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
            if (driveActionInProgress || deviceSelect.disabled) {
                // Rejected/programmatic changes cannot imply a different target.
                if (drivePanelState?.deviceId) deviceSelect.value = drivePanelState.deviceId;
                return;
            }
            const requestedDeviceId = deviceSelect.value;
            if (drivePanelState?.deviceId) deviceSelect.value = drivePanelState.deviceId;
            await runDriveAction(t('driveSelectingDevice', '正在切换电脑...'), async () => {
                await manager.selectDevice(requestedDeviceId);
                await renderDriveBackupPanel(driveBackupSnapshots);
                showMessage(t('driveDeviceSelected', '已切换电脑，后续备份会使用这个电脑名称。'), 'success');
            });
        });
    }

    if (addDevice) {
        addDevice.addEventListener('click', async () => {
            const input = document.getElementById('drive-device-name');
            const submittedValue = input?.value || '';
            const submittedDeviceId = input && driveDeviceNameFields.get(input)?.deviceId;
            const name = submittedValue.trim();
            if (!name) {
                showMessage(t('driveDeviceNameRequired', '请先输入电脑名称。'), 'error');
                return;
            }

            await runDriveAction(t('driveAddingDevice', '正在添加电脑...'), async () => {
                const state = await manager.addDevice(name);
                acknowledgeDriveDeviceName(input, submittedDeviceId, submittedValue);
                await renderDriveBackupPanel(driveBackupSnapshots);
                const message = state?.deviceCreated === false
                    ? t('driveDeviceSelected', '已切换电脑，后续备份会使用这个电脑名称。')
                    : t('driveDeviceAdded', '电脑已添加，后续备份会归到这个名称下。');
                showMessage(message, 'success');
            });
        });
    }

    if (rename) {
        rename.addEventListener('click', async () => {
            const input = document.getElementById('drive-device-name');
            const submittedValue = input?.value || '';
            const submittedDeviceId = input && driveDeviceNameFields.get(input)?.deviceId;
            const name = submittedValue.trim();
            if (!name) {
                showMessage(t('driveDeviceNameRequired', '请先输入电脑名称。'), 'error');
                return;
            }

            await runDriveAction(t('driveRenaming', '正在保存电脑名称...'), async () => {
                const state = await manager.renameDevice(name);
                acknowledgeDriveDeviceName(input, submittedDeviceId, submittedValue, state?.deviceName ?? name);
                await renderDriveBackupPanel();
                showMessage(t('driveRenamed', '电脑名称已保存，后续备份将使用新名称。'), 'success');
            });
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

async function runDriveAction(workingMessage, action) {
    const manager = getDriveBackupManager();
    if (!manager) return;
    if (driveActionInProgress) {
        showMessage(t('driveActionRunning', '已有 Google 云盘操作正在进行。'), 'info');
        return;
    }

    const trigger = document.activeElement;
    driveActionInProgress = true;
    ++drivePanelRenderVersion; // Retire reads started before this target mutation.
    setDriveActionsDisabled(true);
    try {
        if (storageManager.workspace && !(await storageManager.isDefaultWorkspace())) { showMessage(t('spacesProviderDefault', 'Cloud backups apply to Default only. Open Settings in Default to manage or restore cloud backups.'), 'info'); return; }
        showMessage(workingMessage, 'info');
        await action();
    } catch (error) {
        console.error('Google Drive backup error:', error);
        await manager.setLastError(error);
        showMessage(t('driveFailed', 'Google 云盘备份失败：$1', error.message), 'error');
        await renderDriveBackupPanel();
    } finally {
        try {
            await renderDriveBackupPanel();
            // A newer read may retire this final refresh. Keep the target locked
            // until the renderer that now owns the panel has also settled.
            let pending;
            do { pending = drivePanelRenderPending; await pending; }
            while (pending !== drivePanelRenderPending);
        } catch (error) {
            drivePanelState = null;
            throw error;
        } finally {
            driveActionInProgress = false;
            renderDriveActionControls();
            // Restore only focus lost to our temporary lock, never newer typing.
            if (trigger?.isConnected && !trigger.disabled &&
                [document.body, document.documentElement].includes(document.activeElement)) trigger.focus?.();
        }
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

// This page owns review lifetime. Core retains exact source bytes and private
// capabilities; this UI only renders allowlisted metadata, never saved content.
function setupImportClosure(manager) {
    const host = document.getElementById('import-closure-controls');
    if (!host) return null;
    if (window.importClosureView?.manager === manager) return window.importClosureView;
    window.importClosureView?.destroy();
    window.importClosureView = mountImportClosureControls(host, manager);
    return window.importClosureView;
}
function mountImportClosureControls(host, manager) {
    let epoch = 0, review = null, busy = false, closed = false;
    const doc = host.ownerDocument;
    const create = (tag, value, parent = host, className = '') => {
        const node = doc.createElement(tag); if (value !== undefined) node.textContent = value;
        if (className) node.className = className; parent.append(node); return node;
    };
    const copy = {
        READY: ['importClosureReady', 'Review the saved workspace below. This decision leaves saved settings and open drafts unchanged.'],
        NORMAL_VERIFICATION_REQUIRED: ['importClosureNormalVerification', 'The current saved fingerprints match. Use the original file for the normal verification flow. A match alone does not establish recoverability.'],
        ORIGINAL_RECOVERY_UNAVAILABLE: ['importClosureRecoveryUnavailable', 'The complete original recovery could not be established. This import cannot be ended here. Inspect saved copies without changing them.'],
        NO_PENDING_IMPORT: ['importClosureNoPending', 'No eligible pending import was found for this workspace. No decision was recorded.'],
        SLOT_OCCUPIED: ['importClosureOccupied', 'The installation-wide archive slot is occupied by a different decision. Another conflict cannot be archived. Reset does not free this slot.'],
        SLOT_INVALID: ['importClosureInvalid', 'The archive slot is occupied but could not be validated. It will be preserved and cannot authorize an import.'],
        SLOT_UNSUPPORTED: ['importClosureUnsupported', 'The archive slot uses an unsupported version. It will be preserved and cannot authorize an import.'],
        ALREADY_CLOSED: ['importClosureAlreadyClosed', 'This exact import already has a recorded keep-current decision. The original receipt still records pending. No second archive was written.'],
        ALREADY_CLOSED_HISTORY_ONLY: ['importClosureHistoryOnly', 'This import was ended earlier. The archive contains the earlier saved snapshot; later changes have not been added to it. No second archive was written.'],
        RECORDED: ['importClosureRecorded', 'The keep-current decision was recorded. The original receipt still records pending; the old import has not been verified. No new import was started.'],
        RECORDED_LIVE_CHANGED: ['importClosureLiveChanged', 'The decision was recorded, but live saved state changed afterward. The archive remains historical. Recheck or inspect saved copies before continuing.'],
        UNCERTAIN: ['importClosureUncertain', 'Recording could not be confirmed. Do not repeat confirmation. Use Recheck recorded decision, which only reads saved evidence.'],
        EMPTY: ['importClosureEmpty', 'No recorded decision was established by this read. A new review and explicit confirmation are required before another attempt.'],
        INVALID: ['importClosureInvalid', 'The archive slot is occupied but could not be validated. It will be preserved and cannot authorize an import.'],
        UNSUPPORTED: ['importClosureUnsupported', 'The archive slot uses an unsupported version. It will be preserved and cannot authorize an import.'],
        FAILED: ['importClosureFailed', 'This review is no longer usable or the source could not be checked safely. No successful decision was established. Recheck saved evidence or start a new review.']
    };
    const message = (code, error = false) => {
        const selected = Object.hasOwn(copy, code) ? copy[code] : copy.FAILED;
        status.textContent = t(...selected); status.dataset.tone = error ? 'error' : 'normal';
    };
    host.replaceChildren();
    const heading = create('h3', t('importClosureTitle', 'End an unverified import')); heading.id = 'import-closure-title';
    host.setAttribute('aria-labelledby', heading.id);
    create('p', t('importClosureIntro', 'If a pending import no longer matches, you can review whether to keep the currently saved settings and explicitly end that unverified import. This does not save open drafts, recover missing data or verify the old import.'), host, 'form-hint');
    create('p', t('importClosureCapacity', 'Only one conflict can be archived for this entire installation, across all workspaces. The decision and its original evidence stay on this device. A different later conflict may remain blocked. Reset keeps this archive and does not free the slot.'), host, 'form-hint');
    const actions = create('div', undefined, host, 'data-actions');
    const status = create('p', '', host, 'form-hint import-closure-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); status.tabIndex = -1;
    const panel = create('section', undefined, host, 'import-closure-review'); panel.hidden = true;
    function button(key, fallback, action, parent = actions) {
        const node = create('button', t(key, fallback), parent, 'btn btn-secondary'); node.type = 'button';
        node.addEventListener('keydown', event => { if (['Enter', ' ', 'Spacebar'].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault(); });
        node.addEventListener('click', event => {
            if (event.detail > 1 || event.repeat || node.disabled || !visible() || !node.getClientRects().length || busy) return;
            void action();
        });
        return node;
    }
    const reviewButton = button('importClosureReview', 'Review keep-current decision', beginReview);
    reviewButton.setAttribute('aria-expanded', 'false'); reviewButton.setAttribute('aria-controls', 'import-closure-review'); panel.id = 'import-closure-review';
    const recheckButton = button('importClosureRecheck', 'Recheck recorded decision (read-only)', recheck);
    const link = create('a', t('recoveryEntry', 'Inspect saved copies (read-only)'), actions);
    const workspace = manager.workspace?.id || manager.workspace?.requestedId;
    link.href = 'recovery.html' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : ''); link.target = '_blank'; link.rel = 'noopener';
    function visible() {
        const tab = host.closest('.tab-panel');
        return !closed && doc.visibilityState !== 'hidden' && host.isConnected && !host.closest('[hidden], [inert]') &&
            (!tab || tab.classList.contains('active')) && host.getClientRects().length > 0;
    }
    function working(value) { busy = value; reviewButton.disabled = value; recheckButton.disabled = value; host.setAttribute('aria-busy', value ? 'true' : 'false'); }
    function cancel(repairFocus = false) {
        epoch++; const previous = review, wasActive = Boolean(review || busy); review = null;
        try { manager.cancelImportClosure?.(previous); } catch (_) { /* UI retirement never writes. */ }
        const contained = panel.contains(doc.activeElement); panel.hidden = true; panel.replaceChildren(); reviewButton.setAttribute('aria-expanded', 'false');
        working(false);
        if (wasActive) status.textContent = t('importClosureExpired', 'This review is no longer active. Recheck recorded evidence or start a new review before continuing.');
        if (repairFocus && contained) reviewButton.focus();
    }
    const current = request => request === epoch && visible();
    async function beginReview() {
        cancel(); const request = epoch; working(true);
        status.textContent = t('importClosureReading', 'Checking this workspace and the single archive slot…');
        try {
            if (typeof manager.reviewImportClosure !== 'function') throw {};
            const next = await manager.reviewImportClosure({ isCurrent: () => current(request) });
            if (!current(request)) { try { manager.cancelImportClosure?.(next); } catch (_) {} return; }
            message(next?.status);
            if (next?.eligible !== true || next.status !== 'READY') { manager.cancelImportClosure?.(next); return; }
            if (!next.workspace || !['id', 'generation', 'migrationId'].every(key => typeof next.workspace[key] === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(next.workspace[key])) ||
                !Number.isSafeInteger(next.bytes) || next.bytes < 0 || next.capacity !== 1) { manager.cancelImportClosure?.(next); message('FAILED', true); return; }
            review = next;
            const title = create('h4', t('importClosureReviewTitle', 'Confirm this saved-state decision'), panel); title.tabIndex = -1;
            const facts = create('dl', undefined, panel, 'import-closure-facts');
            const fact = (key, fallback, value) => { const pair = create('div', undefined, facts); create('dt', t(key, fallback), pair); create('dd', value, pair); };
            if (typeof next.workspace.name === 'string' && next.workspace.name.length <= 160) fact('importClosureWorkspace', 'Workspace', next.workspace.name);
            fact('importClosureWorkspaceId', 'Workspace ID', next.workspace.id);
            fact('importClosureArchiveSize', 'Local archive size (bytes)', String(next.bytes));
            create('p', t('importClosureConfirmHelp', 'Confirming preserves the currently saved configuration and complete original recovery in the one local slot. The original import receipt stays pending. Open drafts stay open and are not included. This choice does not start another import or resume Sync.'), panel, 'form-hint');
            create('p', t('importClosureCapacity', 'Only one conflict can be archived for this entire installation, across all workspaces. The decision and its original evidence stay on this device. A different later conflict may remain blocked. Reset keeps this archive and does not free the slot.'), panel, 'form-hint');
            const controls = create('div', undefined, panel, 'data-actions');
            const confirmButton = button('importClosureConfirm', 'Keep saved settings and end this unverified import', () => commit(request, next, confirmButton), controls);
            button('importClosureCancel', 'Cancel review', () => { cancel(true); status.textContent = t('importClosureCancelled', 'Review cancelled. No decision was submitted.'); }, controls);
            panel.hidden = false; reviewButton.setAttribute('aria-expanded', 'true'); title.focus({ preventScroll: true });
        } catch (error) {
            if (current(request)) message(typeof error?.code === 'string' ? error.code.replace(/^IMPORT_CLOSURE_/, '') : 'FAILED', true);
        } finally { if (request === epoch) working(false); }
    }
    async function commit(request, prepared, confirmButton) {
        if (!current(request) || prepared !== review || panel.hidden) return;
        working(true); confirmButton.disabled = true; status.focus();
        // Hold this identity across the core's lock-time checks, but consume the
        // UI button immediately. There is no automatic retry after uncertainty.
        try {
            const result = await manager.commitImportClosure(prepared, { confirmed: true,
                isCurrent: () => current(request) && review === prepared && !panel.hidden });
            if (!current(request)) return;
            cancel(); message(result?.status, result?.status === 'UNCERTAIN'); status.focus();
        } catch (error) {
            if (!current(request)) return;
            cancel(); message(typeof error?.code === 'string' ? error.code.replace(/^IMPORT_CLOSURE_/, '') : 'FAILED', true); status.focus();
        } finally { if (request === epoch) working(false); }
    }
    async function recheck() {
        cancel(); const request = epoch; working(true);
        status.textContent = t('importClosureReading', 'Checking this workspace and the single archive slot…');
        try {
            const result = await manager.recheckImportClosure();
            if (!current(request)) return;
            if (result?.status === 'RECORDED') {
                status.textContent = t(result.relation === 'active' ? 'importClosureRecheckedActive' : 'importClosureRecheckedHistorical',
                    result.relation === 'active' ? 'A valid keep-current decision for this exact import is recorded. Its saved snapshot is historical; later edits have not been added. The original receipt still records pending.' : 'A valid decision is recorded in the installation-wide slot as historical evidence. It does not authorize a different current import.');
                const owner = result.workspace;
                if (owner && typeof owner.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(owner.id)) {
                    const name = typeof owner.name === 'string' && owner.name.length <= 160 ? owner.name : owner.id;
                    status.textContent += ' ' + t('importClosureArchivedOwner', 'Archived workspace: $1 (ID: $2).', [name, owner.id]);
                }
                status.dataset.tone = 'normal';
            } else message(result?.status, ['INVALID', 'UNSUPPORTED'].includes(result?.status));
        } catch (_) { if (current(request)) message('UNCERTAIN', true); }
        finally { if (request === epoch) working(false); }
    }
    const visibility = () => { if (doc.visibilityState === 'hidden') cancel(); };
    const pagehide = () => cancel();
    // Observe the visibility-owning ancestry, not our own review descendants.
    // A hide/show round trip must not revive an old confirmation capability.
    const observer = typeof window.MutationObserver === 'function' ? new window.MutationObserver(records => { if (records.length > 0) cancel(); }) : null;
    for (let node = host; observer && node; node = node.parentElement) observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'inert', 'class', 'style'] });
    doc.addEventListener('visibilitychange', visibility); window.addEventListener?.('pagehide', pagehide);
    return { manager, cancel, openReview() {
        if (closed || busy || doc.visibilityState === 'hidden') return;
        const tab = host.closest('.tab-panel');
        if (tab && !tab.classList.contains('active')) {
            doc.querySelector('.tab-button[data-tab="data"]')?.click();
            // The navigation already retired the previous review. Drain its
            // queued ancestor records before creating a new review capability.
            observer?.takeRecords();
        }
        const request = epoch;
        Promise.resolve().then(() => { if (current(request) && !busy) { host.scrollIntoView?.({ behavior: 'instant', block: 'start' }); void beginReview(); } });
    }, destroy() { cancel(); closed = true; observer?.disconnect(); doc.removeEventListener?.('visibilitychange', visibility); window.removeEventListener?.('pagehide', pagehide); } };
}

// A generic Boolean is valid only for a previously verified retry conflict.
// An explicitly ended pending import needs a separate private capability.
function showPendingRestoreRecovery(manager, error) {
    if (error.code !== 'RESTORE_PENDING_CONFLICT') return;
    const notice = document.getElementById('restore-conflict-notice');
    if (!notice) return;
    const message = document.createElement('p'); message.textContent = error.message;
    const link = document.createElement('a');
    const workspace = manager.workspace?.id || manager.workspace?.requestedId;
    link.href = 'recovery.html' + (workspace ? '?workspace=' + encodeURIComponent(workspace) : '');
    link.target = '_blank'; link.rel = 'noopener';
    link.textContent = t('recoveryEntry', 'Inspect saved copies (read-only)');
    // Open inspection separately: never reload/leave this page or clear drafts.
    notice.replaceChildren(message, link); notice.hidden = false;
    const closure = typeof setupImportClosure === 'function' ? setupImportClosure(manager) : null;
    if (closure) {
        const reviewButton = document.createElement('button'); reviewButton.type = 'button'; reviewButton.className = 'btn btn-secondary';
        reviewButton.textContent = t('importClosureReview', 'Review keep-current decision');
        reviewButton.addEventListener('click', event => { if (reviewButton.isConnected && !reviewButton.disabled && !event.repeat && !(event.detail > 1)) closure.openReview(); });
        notice.append(reviewButton);
    }
}

let closedRestoreConfirmationEpoch = 0;
async function saveConfirmedRestore(manager, settings) {
    const options = { skipSyncSideEffects: true, skipSyncInitialization: true, confirmedRestore: true };
    const request = ++closedRestoreConfirmationEpoch;
    let retired = false, privateReview = null, ticket = null;
    const isCurrent = () => !retired && request === closedRestoreConfirmationEpoch &&
        (typeof document === 'undefined' || document.visibilityState !== 'hidden');
    const retire = () => { retired = true; try { manager.cancelClosedRestore?.(ticket || privateReview); } catch (_) { /* Local ownership is still retired. */ } };
    const visibility = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') retire(); };
    if (typeof window !== 'undefined') window.addEventListener?.('pagehide', retire);
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', visibility);
    try {
        try { return await manager.setAll(settings, options); }
        catch (error) {
            showPendingRestoreRecovery(manager, error);
            if (error.code === 'RESTORE_CLOSED_RECONFIRM') {
                privateReview = error.closureReview;
                if (!privateReview || typeof manager.confirmClosedRestore !== 'function' || !isCurrent()) throw error;
                const proceed = confirm(t('restoreClosedReconfirm', 'The earlier unverified import was explicitly ended by keeping saved settings. Start a separate new import of this selected file? It will replace the currently saved settings and keep them as the latest recovery copy. The one-slot historical archive stays unchanged, and another conflict cannot be archived.'));
                if (!proceed || !isCurrent()) throw error;
                ticket = await manager.confirmClosedRestore(privateReview, { confirmed: true, isCurrent });
                if (!ticket || !isCurrent()) throw error;
                return await manager.setAll(settings, { ...options, closedRestoreTicket: ticket });
            }
            if (!error.canStartNewRestore || error.code !== 'RESTORE_RETRY_CONFLICT') throw error;
            const proceed = confirm(t('restoreStartNewConfirm', 'This file was already imported and settings have changed since then. Start a new import, replacing the current settings and keeping them as the latest recovery copy?'));
            if (!proceed || !isCurrent()) throw error;
            return await manager.setAll(settings, { ...options, newRestoreOperation: true });
        }
    } finally {
        retire();
        if (typeof window !== 'undefined') window.removeEventListener?.('pagehide', retire);
        if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', visibility);
    }
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
    const providerStorage = storageManager.forDefaultWorkspace?.() || storageManager;
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
        const providerState = await providerStorage.getLocalProviderState();
        const validatedSettings = providerStorage.prepareRestoredConfig(payload, providerState);
        const success = await replaceSettings(() => saveConfirmedRestore(providerStorage, validatedSettings));
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
        requestBackupFileDownload(blob, snapshot.name || `local-itab-backup-${new Date().toISOString().slice(0, 10)}.json`);
        showMessage(t('driveBackupJsonDownloaded', 'Backup JSON download requested. Confirm the file was saved in your browser’s downloads; this page cannot verify completion.'), 'info');
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

// Explicit Save may reveal its own invalid search draft; auto-save and late
// storage failures must never navigate away from the user's newer work.
function focusSubmittedSearchError(owner) {
    if (!owner) return;
    const {trigger, input, engine, value, engineValue} = owner;
    const current = () => document.visibilityState !== 'hidden' &&
        document.getElementById('save-settings') === trigger && trigger.isConnected && !trigger.disabled &&
        document.activeElement === trigger && !trigger.closest('[hidden], [inert]') && trigger.getClientRects().length &&
        document.getElementById('search-custom') === input && input.isConnected && !input.disabled &&
        document.getElementById('search-engine') === engine && engine.isConnected &&
        input.value === value && engine.value === engineValue && !input.closest('[hidden], [inert]');
    if (!current()) return;
    const panel = input.closest('.tab-panel');
    const tab = document.querySelector('.tab-button[data-tab="content"]');
    if (!panel || panel !== document.getElementById('tab-content') || panel.dataset.tab !== 'content' ||
        !tab?.isConnected || tab.disabled || tab.closest('[hidden], [inert]')) return;
    if (!panel.classList.contains('active')) tab.click();
    if (!current() || !panel.contains(input) || !panel.classList.contains('active') || !input.getClientRects().length ||
        window.getComputedStyle?.(input)?.visibility === 'hidden') return;
    input.focus({preventScroll: true});
    input.scrollIntoView({behavior: 'instant', block: 'center'});
}

async function saveAllSettings(includeWorldClocks = false, validationTrigger = null) {
    if (settingsReplacementPending) return;
    if (bookmarkImportPending) { bookmarkDeferredSettingsSave = true; bookmarkDeferredWorldClockSave ||= includeWorldClocks; return; }
    const session = settingsSession;
    const searchInput = validationTrigger && document.getElementById('search-custom');
    const searchEngine = validationTrigger && document.getElementById('search-engine');
    const searchFocus = searchInput && searchEngine && document.getElementById('save-settings') === validationTrigger &&
        document.activeElement === validationTrigger ? {trigger: validationTrigger, input: searchInput, engine: searchEngine,
            value: searchInput.value, engineValue: searchEngine.value} : null;
    const submittedClock = clockFormSnapshot(includeWorldClocks);
    const submittedCategories = categorySnapshot(getCategoriesFromDOM());
    const submittedCategorySignature = bookmarkCategorySignature();
    const submittedBackgroundControls = backgroundFormSnapshot();
    const backgroundDirtyAtSubmission = backgroundFormBaseline !== null && submittedBackgroundControls !== backgroundFormBaseline;
    let submittedForm, collectError;
    try {
        requireSettingsBaseline();
        // A cleared name is an unfinished rename, not a request to delete its
        // category. Capture validation now, alongside this queued submission.
        if (Array.from(document.querySelectorAll('#category-manage-list .cat-name')).some(input => !input.value.trim())) {
            throw new Error(t('settingsCategoryNameRequired', 'Enter a name for every category, or use its Delete (✕) button. Settings have not been saved; your edits are still here.'));
        }
        submittedForm = collectFormData(false);
    }
    catch (error) { collectError = error; }
    ++worldClockSaves;
    return queueSettingsWrite(async () => {
        if (session !== settingsSession || settingsReplacementPending) return;
        let invalidSearch = false;
        try {
            showMessage(t('settingsSaving', 'Saving settings...'), 'info');
            if (collectError) throw collectError;
            const paths = settingsDirtyPaths(submittedForm);
            // A Save clicked during an upload must not replay its untouched old
            // background. An already-dirty choice may retry here after a failure.
            if (backgroundDirtyAtSubmission) {
                if (submittedForm.bg.type === 'color' && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(submittedForm.bg.value)) {
                    throw new Error(t('settingsBackgroundColorInvalid', 'Enter a valid background color, such as #112233, before saving.'));
                }
                if (JSON.stringify(submittedForm.bg) !== JSON.stringify(settingsFormBaseline.bg)) paths.push('bg');
            }
            if (paths.includes('search') && submittedForm.search.engine === 'custom') {
                if (!submittedForm.search.custom) {
                    invalidSearch = true;
                    throw new Error(t('customSearchUrlRequired', 'Custom search URL is required'));
                }
                try { submittedForm.search.custom = normalizeSearchTemplateForOptions(submittedForm.search.custom); }
                catch (_) { invalidSearch = true; throw new Error(t('customSearchUrlInvalid', 'Enter a valid HTTP or HTTPS search URL')); }
            }
            const settings = Object.fromEntries([...new Set(paths.map(path => path.split('.')[0]))].map(key => [key, storageManager.validateData(key, submittedForm[key])]));
            if (paths.includes('privacy.onlineFavicons') && submittedForm.privacy.onlineFavicons &&
                (privacyPermissionPending || !(await hasOptionalOriginPermission(PRIVACY_PERMISSION_ORIGINS.favicons)))) {
                const error = new Error(); error.code = 'SETTINGS_PERMISSION_REQUIRED'; throw error;
            }
            if (session !== settingsSession || settingsReplacementPending) return;
            const options = {expectedSettings: settingsBaseline, settingsPaths: paths};
            if (clockFormInitialized && !clockBaseline) throw new Error(t('worldClockBaselineUnavailable', 'Clock settings could not be read safely. Reload Settings before saving.'));
            // Queued unrelated saves inherit the latest successful own world-clock write.
            if (!includeWorldClocks && clockBaseline) submittedClock.worldClocks = clockBaseline.worldClocks.map(entry => ({...entry}));
            if (clockBaseline && sameClock(submittedClock, clockBaseline)) {
                delete settings.clock;
            } else {
                settings.clock = submittedClock;
                if (clockBaseline) options.expectedClock = copyClock(clockBaseline);
            }
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
            if (success) {
                advanceSettingsBaseline(settings, paths, submittedForm);
                if (paths.includes('bg')) publishCommittedBackground(settings.bg, () => session === settingsSession &&
                    !settingsReplacementPending && backgroundFormSnapshot() === submittedBackgroundControls, submittedBackgroundControls);
            }
            if (success && settings.clock) clockBaseline = copyClock(submittedClock);
            if (success && options.expectedCategories) categoryBaseline = categorySnapshot(submittedCategories);
            // Canonical storage and raw form ownership are different baselines:
            // a saved whitespace/default-icon submission is clean, while edits
            // made after this submission stay dirty and are never re-rendered.
            if (success) categoryRawBaseline = submittedCategorySignature;
            if (session !== settingsSession || settingsReplacementPending) return;
            if (success) {
                // Do not re-render: edits made while saving belong to the user.
                showMessage(t('settingsSaved', 'Settings saved.'), 'success');
                await displayStorageInfo();
            } else {
                showMessage(t('settingsSaveFailed', 'Failed to save settings. Please try again.'), 'error');
            }
        } catch (error) {
            if (session !== settingsSession || settingsReplacementPending) return;
            console.error('Error saving settings:', error);
            const detail = error.code?.startsWith('SETTINGS_') ? settingsNotice(error) : error.code === 'CLOCK_CONFLICT' ? t('worldClockConflict', 'Clock settings changed in another tab or could not be safely compared. Your edits are still here. Review the latest values in a new Settings tab before retrying.') : error.message;
            showMessage(error.code?.startsWith('SETTINGS_') ? detail : `${t('settingsSaveErrorPrefix', 'Error saving settings:')} ${detail}`, 'error');
            if (invalidSearch) focusSubmittedSearchError(searchFocus);
        }
    }).finally(() => { --worldClockSaves; });
}

async function resetAllSettings() {
    try {
        showMessage(t('settingsResetting', 'Resetting settings...'), 'info');
        
        // Reset only this workspace; preserve personal modules and shared preferences.
        const cleared = await replaceSettings(() => storageManager.clear());
        if (!cleared) throw new Error(t('settingsResetFailed', 'Settings could not be reset. Please try again.'));
        // The confirmed reset discards this configuration draft, even when a
        // separate private-content draft still prevents the automatic reload.
        if (clockFormInitialized) {
            clockBaseline = copyClock(storageManager.defaultConfig.clock);
            worldClockDraft = [];
            const hour12 = document.getElementById('hour12-format');
            const seconds = document.getElementById('show-seconds');
            if (hour12) hour12.checked = clockBaseline.hour12;
            if (seconds) seconds.checked = clockBaseline.showSeconds;
            for (const id of ['world-clock-zone', 'world-clock-label']) {
                const input = document.getElementById(id); if (input) input.value = '';
            }
            renderWorldClockDraft();
        }
        
        // Reload the page to show defaults
        window.LocalItabContentLifecycle.reload();
    } catch (error) {
        console.error('Error resetting settings:', error);
        showMessage(`${t('settingsResetErrorPrefix', 'Error resetting settings:')} ${error.message}`, 'error');
    }
}

function collectFormData(validateSearch = true) {
    const settings = {};
    const existingConfig = settingsFormConfig || storageManager.defaultConfig;

    // Neither appearance nor legacy theme is edited by this form. Omitting both
    // avoids stale selection writes and turning an injected legacy default into
    // an explicit dark preference on a fresh installation.

    // Clock settings
    const hour12 = document.getElementById('hour12-format')?.checked || false;
    const showSeconds = document.getElementById('show-seconds')?.checked !== false;
    settings.clock = { hour12, showSeconds, worldClocks: (clockBaseline?.worldClocks || []).map(entry => ({...entry})) };
    

    
    // Background settings
    const bgTypeSelect = document.getElementById('bg-type');
    let bgType = bgTypeSelect?.value || 'gradient';
    const bgColorText = document.getElementById('bg-color-text');
    const colorInput = bgColorText ? bgColorText.value.trim() : document.getElementById('bg-color')?.value || '';
    const bgColor = /^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(colorInput) ? '#' + colorInput : colorInput;
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
        if (!rawSearchCustom && validateSearch) {
            throw new Error(t('customSearchUrlRequired', 'Custom search URL is required'));
        }
        try {
            searchCustom = normalizeSearchTemplateForOptions(rawSearchCustom);
        } catch (_) {
            if (validateSearch) throw new Error(t('customSearchUrlInvalid', 'Enter a valid HTTP or HTTPS search URL'));
            searchCustom = rawSearchCustom;
        }
    } else if (rawSearchCustom) {
        try {
            searchCustom = normalizeSearchTemplateForOptions(rawSearchCustom);
        } catch (_) {
            searchCustom = '';
        }
    }
    if (validateSearch && searchEngine === 'custom' && !searchCustom) {
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
        finderShortcutEnabled: document.getElementById('finder-shortcut-enabled')?.checked ?? (existingUi.finderShortcutEnabled !== false),
        shortcutsStyle: {
            gapX: Number.isFinite(shortcutsGapXVal) ? Math.max(0, Math.min(80, shortcutsGapXVal)) : null,
            gapY: Number.isFinite(shortcutsGapYVal) ? Math.max(0, Math.min(80, shortcutsGapYVal)) : null,
            iconSize: Number.isFinite(shortcutIconSizeVal) ? Math.max(24, Math.min(96, shortcutIconSizeVal)) : null,
            titleSize: Number.isFinite(shortcutTitleSizeVal) ? Math.max(10, Math.min(24, shortcutTitleSizeVal)) : null,
            titleColor
        }
    };

    settings.privacy = {
        onlineFavicons: document.getElementById('privacy-online-favicons')?.checked === true
    };

    return settings;
}

// Requesting a browser download does not establish that the file was saved.
function requestBackupFileDownload(blob, filename) {
    let url, link, requested = false;
    try {
        url = URL.createObjectURL(blob);
        link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.appendChild(link);
        link.click();
        requested = true;
    } finally {
        try { link?.remove(); }
        finally {
            if (url) {
                // Give the browser time to consume a successfully requested URL.
                // Synchronous preparation/trigger failures can release it now.
                if (requested) setTimeout(() => URL.revokeObjectURL(url), 60000);
                else URL.revokeObjectURL(url);
            }
        }
    }
}

async function exportSettings() {
    try {
        showImportExportFeedback('export', 'info', t('settingsExportPreparing', 'Preparing export...'));
        
        const config = await storageManager.getAllForBackup();
        const exportData = storageManager.buildManualExportPayload(config);
        const itemCounts = exportData.itemCounts;
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        // Validate export size
        const exportSizeKB = dataBlob.size / 1024;
        if (exportSizeKB > 5000) { // 5MB warning
            const proceed = confirm(t('settingsExportLargeConfirm', 'Export file is large ($1 KB). This may be due to images. Continue?', [exportSizeKB.toFixed(1)]));
            if (!proceed) {
                showImportExportFeedback('export', 'info', t('settingsExportCancelled', 'Export cancelled by user'));
                return;
            }
        }
        
        requestBackupFileDownload(dataBlob, `local-itab-settings-${new Date().toISOString().split('T')[0]}.json`);

        // The browser owns download completion, cancellation and later failures.
        const details = {
            fileSize: dataBlob.size,
            recordCount: itemCounts.shortcuts + itemCounts.hotTopics + (itemCounts.hasBackgroundImage ? 1 : 0) + (itemCounts.hasMoviePoster ? 1 : 0)
        };
        
        showImportExportFeedback('export', 'info', exportData.version === '2.0' ? t('storedURLExported', 'Settings download requested with original URL spelling and layout relationships. Confirm the file was saved in your browser’s downloads; this page cannot verify completion. Import only with a version that supports stored URL identity backups.') : exportData.schemaVersion === 2 ? t('identityExported', 'Settings download requested in schema 2. Confirm the file was saved in your browser’s downloads; this page cannot verify completion. Import with an updated version that supports independent positions.') : t('settingsExportRequested', 'Settings download requested. Confirm the file was saved in your browser’s downloads; this page cannot verify completion.'), details);
        
    } catch (error) {
        console.error('Error exporting settings:', error);
        
        // Provide specific error messages
        let errorMessage = t('settingsExportFailed', 'Export failed');
        if (error.message.includes('quota')) {
            errorMessage = t('settingsExportQuotaExceeded', 'Export failed: Storage quota exceeded');
        } else if (error.message.includes('memory')) {
            errorMessage = t('settingsExportMemoryInsufficient', 'Export failed: Not enough memory (try removing large images)');
        } else {
            errorMessage = `${t('settingsExportFailedPrefix', 'Export failed:')} ${error.message}`;
        }
        
        showImportExportFeedback('export', 'error', errorMessage);
    }
}

// Only unconfirmed file preparation can be superseded. Once confirmed, the
// existing restore owns its result, including an uncertain submitted write.
let settingsImportPreparation = null;
let settingsImportSaving = false;
function retireSettingsImportPreparation() { settingsImportPreparation = null; }
async function importSettings(file) {
    if (settingsImportSaving) return;
    const input = document.getElementById('import-settings');
    const request = {input};
    settingsImportPreparation = request;
    const ownsPreparation = () => settingsImportPreparation === request &&
        document.visibilityState !== 'hidden' && document.getElementById('import-settings') === input && input?.isConnected !== false;
    let confirmed = false, controls = [];
    try {
        if (!ownsPreparation()) return;
        if (!file) {
            showImportExportFeedback('import', 'error', t('settingsImportNoFile', 'No file selected for import'));
            return;
        }
        if (!file.name.toLowerCase().endsWith('.json')) {
            showImportExportFeedback('import', 'error', t('settingsImportJSONRequired', 'Please select a valid JSON file'));
            return;
        }

        // Local images can legitimately produce exports larger than 10 MiB.
        // Warn before allocating their text rather than making our own backups unrestorable.
        const warningSize = 10 * 1024 * 1024;
        if (file.size > warningSize) {
            const size = (file.size / 1024 / 1024).toFixed(1);
            const proceed = confirm(t('largeLocalImportConfirm',
                'This backup is $1 MiB. Reading a large file can use substantial memory and may make this tab unresponsive. Continue reading it?', [size]));
            if (!ownsPreparation()) return;
            if (!proceed) {
                showImportExportFeedback('import', 'info', t('localImportReadCancelled', 'Import cancelled before reading the file.'));
                return;
            }
        }

        showImportExportFeedback('import', 'info', `${t('settingsImportProcessingPrefix', 'Processing file:')} ${file.name}`, { fileSize: file.size });
        
        const text = await file.text();
        if (!ownsPreparation()) return;
        let importData;
        
        try {
            importData = JSON.parse(text);
        } catch (parseError) {
            throw new Error(`Invalid JSON format: ${parseError.message}`);
        }
        
        // Validate import data structure
        const providerState = await storageManager.getLocalProviderState();
        if (!ownsPreparation()) return;
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
        let previewMessage = `${t('settingsImportReplacePreview', 'Import will replace all settings with:')}\n`;
        previewMessage += `${t('settingsImportShortcutsPreview', '• $1 shortcuts', [importCounts.shortcuts])}\n`;
        previewMessage += `${t('settingsImportHotTopicsPreview', '• $1 hot topics', [importCounts.hotTopics])}\n`;
        if (importCounts.hasBackgroundImage) previewMessage += `${t('settingsImportBackgroundPreview', '• Background image')}\n`;
        if (importCounts.hasMoviePoster) previewMessage += `${t('settingsImportMoviePreview', '• Movie poster')}\n`;
        previewMessage += `\n${t('restoreRecoveryConfirm', 'A local recovery backup will be kept before replacing settings. Continue?')}`;
        
        const proceed = confirm(previewMessage);
        if (!ownsPreparation()) return;
        if (!proceed) {
            showImportExportFeedback('import', 'info', t('settingsImportCancelled', 'Import cancelled by user'));
            return;
        }
        
        // Do not retire a confirmed restore on picker/page events. Block only
        // competing file imports while its original result is still pending.
        confirmed = true;
        settingsImportPreparation = null;
        settingsImportSaving = true;
        controls = [document.getElementById('import-settings-btn'), input].filter(Boolean)
            .map(node => ({node, disabled: node.disabled}));
        for (const {node} of controls) node.disabled = true;
        const success = await replaceSettings(() => saveConfirmedRestore(storageManager, validatedSettings));
        
        if (success) {
            const details = {
                recordCount: importCounts.shortcuts + importCounts.hotTopics + (importCounts.hasBackgroundImage ? 1 : 0) + (importCounts.hasMoviePoster ? 1 : 0)
            };
            
            showImportExportFeedback('import', 'success', t('settingsImportSucceeded', 'Settings imported. Reloading page...'), details);
            
            // Reload page after short delay
            setTimeout(() => {
                window.LocalItabContentLifecycle.reload();
            }, 1500);
        } else {
            throw new Error('Failed to save imported settings to storage');
        }
        
    } catch (error) {
        if (!confirmed && !ownsPreparation()) return;
        console.error('Error importing settings:', error);
        
        // Provide specific error messages
        let errorMessage = t('settingsImportFailed', 'Import failed');
        if (error.message.includes('JSON')) {
            errorMessage = `${t('settingsImportFailedPrefix', 'Import failed:')} ${error.message}`;
        } else if (error.message.includes('quota')) {
            errorMessage = t('settingsImportStorageInsufficient', 'Import failed: Not enough storage space');
        } else if (error.message.includes('Invalid settings')) {
            errorMessage = t('settingsImportFormatUnrecognized', 'Import failed: File format not recognized');
        } else {
            errorMessage = `${t('settingsImportFailedPrefix', 'Import failed:')} ${error.message}`;
        }
        
        showImportExportFeedback('import', 'error', errorMessage);
    } finally {
        // An obsolete read must never clear a later selection/replacement input.
        if ((confirmed || ownsPreparation()) && input && document.getElementById('import-settings') === input) input.value = '';
        if (settingsImportPreparation === request) settingsImportPreparation = null;
        if (confirmed) {
            settingsImportSaving = false;
            for (const {node, disabled} of controls) node.disabled = disabled;
        }
    }
}

// Keep these background controls readable when a catalog entry is unavailable.
// Run after ordinary DOM localization and before the Settings search index mounts.
function localizeBackgroundImageControls() {
    for (const [selector, key, fallback] of [
        ['#bg-upload-area .upload-text', 'settingsBackgroundImageSelect', 'Click to select image or drag & drop'],
        ['#bg-upload-area .upload-hint', 'settingsBackgroundImageHint', 'JPEG, PNG, GIF, WebP (max 5MB)'],
        ['#remove-bg-image', 'settingsBackgroundImageRemove', 'Remove Image']
    ]) {
        const element = document.querySelector(selector);
        if (element) element.textContent = t(key, fallback);
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
        showMessage(t('settingsBackgroundImageTypeInvalid', 'Please select a valid image file (JPEG, PNG, GIF, or WebP)'), 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        clearBackgroundImageInput();
        showMessage(t('settingsBackgroundImageTooLarge', 'Image file is too large. Please select an image smaller than 5MB.'), 'error');
        return;
    }
    return queueBackgroundTask(async (isCurrent, canPresent, submittedControls) => {
        try {
            if (!isCurrent()) return;
            requireSettingsBaseline();
            if (!isCurrent()) return;
            showMessage(t('settingsBackgroundImageUploading', 'Uploading background image...'), 'info');
            const dataURL = await fileToDataURL(file);
            if (!isCurrent()) return;
            // MIME and base64 syntax alone do not establish a usable image.
            // Decode locally before this candidate can replace a saved background.
            const image = new Image(); image.src = dataURL;
            try { await image.decode(); }
            catch (_) { throw Object.assign(new Error(), { code: 'BACKGROUND_IMAGE_INVALID' }); }
            if (!isCurrent()) return;
            await commitBackground({ type: 'image', value: dataURL });
            publishCommittedBackground({ type: 'image', value: dataURL }, canPresent, submittedControls);
            if (!isCurrent()) return;
            showMessage(t('settingsBackgroundImageUploaded', 'Background image uploaded.'), 'success');
        } catch (error) {
            console.error('Error uploading background image:', error);
            if (isCurrent()) {
                showMessage(error.code === 'BACKGROUND_IMAGE_INVALID' ? t('settingsBackgroundImageInvalid', 'This file could not be decoded as an image and was not saved. Choose another JPEG, PNG, GIF, or WebP file.') : error.code?.startsWith('SETTINGS_') ? t('settingsImageSaveConflict', 'The image was not saved because settings changed or could not be safely compared. Keep this page for any other edits, open a new Settings tab, and choose the image again.') : `${t('settingsBackgroundImageUploadErrorPrefix', 'Error uploading image:')} ${error.message}`, 'error');
            }
        } finally {
            if (isCurrent()) clearBackgroundImageInput();
        }
    });
}

async function handleMoviePosterUpload(file) {
    if (!file || settingsReplacementPending) return;
    const session = settingsSession;
    ++settingsHelperSaves;
    return queueSettingsWrite(async () => {
        try {
            requireSettingsBaseline();
            if (session !== settingsSession || settingsReplacementPending) return;
            const dataURL = await fileToDataURL(file);
            if (session !== settingsSession || settingsReplacementPending) return;
            const settings = {movie: {...settingsFormConfig.movie, poster: dataURL}};
            const saved = await storageManager.setAll(settings, {expectedSettings: settingsBaseline, settingsPaths: ['movie.poster']});
            if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
            advanceSettingsBaseline(settings, ['movie.poster'], settings);
            if (session !== settingsSession || settingsReplacementPending) return;
            updateMoviePosterPreview(dataURL);
            showMessage('Movie poster uploaded.', 'success');
        } catch (error) {
            if (session !== settingsSession || settingsReplacementPending) return;
            showMessage(error.code?.startsWith('SETTINGS_') ? settingsNotice(error) : `Error uploading poster: ${error.message}`, 'error');
        }
    }).finally(() => { --settingsHelperSaves; });
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

function syncStoredURLPausedMessage() {
    return t('syncStoredURLPaused', 'Sync transfers are paused to preserve older URL spelling and layout relationships. Your saved copies and enabled preference are unchanged. Cloud preview is still available; use a current-version manual or Drive backup instead of Sync for these records.');
}

function syncErrorMessage(error) {
    return error?.code === 'SYNC_IDENTITY_COMPATIBILITY' && error.kind === 'stored-url'
        ? syncStoredURLPausedMessage()
        : error.message;
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
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        requestBackupFileDownload(blob, `local-itab-recovery-${kind}-${new Date().toISOString().slice(0, 10)}.json`);
        showMessage(t('recoveryDownloaded', 'Recovery backup download requested. Confirm the file was saved in your browser’s downloads; this page cannot verify completion. Use Import Settings to review and restore the saved file.'), 'info');
    } catch (error) { showMessage(error.message, 'error'); }
}

async function replaceLocalFromCloud() {
    if (cloudReplacementInProgress) return;
    cloudReplacementInProgress = true;
    const button = document.getElementById('sync-replace-local');
    if (button) button.disabled = true;
    const replaced = await runManualSyncAction(async () => {
        try {
            const expectedRemote = await storageManager.previewCloudReplacement();
            if (!confirm(t('syncReplaceLocalConfirm', 'Replace this device with the current cloud copy ($1 shortcuts)? Independent positions missing from that copy will be removed. A recovery backup of this device must be saved locally first. Other devices may overwrite the cloud again; update them before continuing.', String(expectedRemote.shortcuts)))) return;
            await replaceSettings(() => storageManager.pullFromSync({ confirmedReplacement: true, expectedRemote }));
            return true;
        } catch (error) {
            showMessage(t('syncDownloadFailed', 'Download failed: $1', syncErrorMessage(error)), 'error');
            await renderSyncStatus();
        } finally { cloudReplacementInProgress = false; if (button) button.disabled = false; }
    });
    // Our own completed action must not block its successful restore reload.
    // The lifecycle still protects every other pending action or open draft.
    if (replaced) window.LocalItabContentLifecycle.reload();
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
        note.textContent = syncStatus.compatibilityBlocked.kind === 'stored-url'
            ? syncStoredURLPausedMessage()
            : syncStatus.compatibilityBlocked.kind === 'review'
            ? t('syncSafetyReview', 'Automatic full-copy Sync replacement is temporarily paused to protect saved data. Preview the cloud copy, then explicitly choose a backed-up replacement. Your saved data and this device’s enabled preference stay unchanged.')
            : `${t('syncCompatibilityDetails', 'Sync is paused for compatibility. Local settings and your enabled preference are preserved. Update other devices and retry Download, or explicitly choose which copy to replace.')} ${syncStatus.compatibilityBlocked.reason}`;
        children.push(note);
    }
    // Suppress only the raw error already represented by this localized guard note.
    const repeatedStoredURLError = syncStatus.compatibilityBlocked?.kind === 'stored-url' &&
        typeof syncStatus.compatibilityBlocked.reason === 'string' &&
        (local.lastError === syncStatus.compatibilityBlocked.reason ||
            local.lastError === storageManager.validateSyncConfig({ lastError: syncStatus.compatibilityBlocked.reason }).lastError);
    if (local.lastError && !repeatedStoredURLError) {
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
    if (storageManager.workspace && !(await storageManager.isDefaultWorkspace())) {
        document.getElementById('cloud-sync-settings')?.querySelectorAll('button, input').forEach(control => { control.disabled = true; });
    }
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
    return queueBackgroundTask(async (isCurrent, canPresent, submittedControls) => {
        let previousBackground;
        try {
            if (!isCurrent()) return;
            requireSettingsBaseline();
            previousBackground = copySettings(settingsFormConfig.bg);
            if (!isCurrent()) return;
            const type = requestedType === 'api' ? 'gradient' : requestedType;
            const value = type === 'color' ? requestedColor : type === 'image' ? previousBackground.value : '';
            await commitBackground({ type, value });
            publishCommittedBackground({ type, value }, canPresent, submittedControls);
        } catch (error) {
            console.error('Error saving background settings:', error);
            if (isCurrent()) {
                showMessage(error.code?.startsWith('SETTINGS_') ? settingsNotice(error) : t('failedToSave', 'Failed to save. Please try again.'), 'error');
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
    if (!confirm(t('settingsBackgroundImageRemoveConfirm', 'Are you sure you want to remove the background image?'))) return;
    return queueBackgroundTask(async (isCurrent, canPresent, submittedControls) => {
        try {
            if (!isCurrent()) return;
            requireSettingsBaseline();
            if (!isCurrent()) return;
            await commitBackground({ type: 'gradient', value: '' });
            publishCommittedBackground({ type: 'gradient', value: '' }, canPresent, submittedControls);
            if (!isCurrent()) return;
            showMessage(t('settingsBackgroundImageRemoved', 'Background image removed.'), 'success');
        } catch (error) {
            console.error('Error removing background image:', error);
            if (isCurrent()) {
                showMessage(error.code?.startsWith('SETTINGS_') ? settingsNotice(error) : `${t('settingsBackgroundImageRemoveErrorPrefix', 'Error removing background image:')} ${error.message}`, 'error');
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
    const ownsRow = () => topicElement.isConnected && listElement.querySelectorAll('.topic-item')[index] === topicElement;
    const runRowAction = (button, action) => {
        if (!ownsRow()) return;
        const ownedFocus = document.activeElement === button;
        const section = listElement.closest('.topic-list');
        action();
        // Accepted edits replace the list synchronously, before the save settles.
        // Repair only focus lost by that replacement, never a later save callback.
        if (!ownedFocus || topicElement.isConnected || document.activeElement !== document.body ||
            document.getElementById(`${tabType}-list`) !== listElement || !listElement.isConnected ||
            !section?.contains(listElement) || section.style.display === 'none' || section.closest('[hidden], [inert]')) return;
        const rows = listElement.querySelectorAll('.topic-item');
        const next = rows[Math.min(index, rows.length - 1)];
        // A removed row continues at Edit (or the empty list's title input),
        // never another Delete action that a held activation could repeat.
        const target = next?.querySelector('.edit-topic-btn') || section.querySelector('.topic-title-input');
        if (target?.isConnected && !target.disabled) target.focus();
    };
    editBtn.addEventListener('click', () => runRowAction(editBtn, () => editHotTopic(tabType, index)));
    deleteBtn.addEventListener('click', () => runRowAction(deleteBtn, () => deleteHotTopic(tabType, index)));
    
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
function persistHotTopicDraft(tabType, topics, message) {
    if (settingsReplacementPending || !['baidu', 'weibo', 'zhihu'].includes(tabType)) return false;
    try { requireSettingsBaseline(); }
    catch (error) { showMessage(settingsNotice(error), 'error'); return false; }
    const path = `hot.${tabType}`, session = settingsSession;
    const settings = {hot: storageManager.validateData('hot', {...settingsFormConfig.hot, [tabType]: topics})};
    // Keep the user's accepted edit visible as a draft on failure/conflict.
    // Refresh only this list, never another topic tab or general form field.
    populateHotTopicsLists({[tabType]: settings.hot[tabType]});
    ++settingsHelperSaves;
    return queueSettingsWrite(async () => {
        if (session !== settingsSession || settingsReplacementPending) return false;
        try {
            const saved = await storageManager.setAll(settings, {expectedSettings: settingsBaseline, settingsPaths: [path]});
            if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
            advanceSettingsBaseline(settings, [path], settings);
            if (session !== settingsSession || settingsReplacementPending) return false;
            showMessage(message, 'success'); return true;
        } catch (error) {
            if (session === settingsSession && !settingsReplacementPending) {
                showMessage(error.code?.startsWith('SETTINGS_') ? settingsNotice(error) : error.message, 'error');
            }
            return false;
        }
    }).finally(() => { --settingsHelperSaves; });
}
function addHotTopic(tabType, title, score) {
    if (!title.trim()) {
        showMessage(t('topicTitleRequired', 'Please enter a topic title'), 'error'); return false;
    }
    return persistHotTopicDraft(tabType, [...collectHotTopicsFromList(tabType), {t: title.trim(), s: score || 0}], t('settingsTopicAdded', 'Topic added.'));
}
function editHotTopic(tabType, index) {
    const topics = collectHotTopicsFromList(tabType), topic = topics[index];
    if (!topic || settingsReplacementPending) return false;
    const newTitle = prompt(t('settingsTopicEditTitle', 'Edit topic title:'), topic.t);
    if (newTitle === null || !newTitle.trim()) return false;
    const newScore = prompt(t('settingsTopicEditScore', 'Edit topic score:'), topic.s);
    topic.t = newTitle.trim();
    if (newScore !== null && !isNaN(parseInt(newScore))) topic.s = parseInt(newScore);
    return persistHotTopicDraft(tabType, topics, t('settingsTopicUpdated', 'Topic updated.'));
}
function deleteHotTopic(tabType, index) {
    if (settingsReplacementPending || !confirm(t('settingsTopicDeleteConfirm', 'Are you sure you want to delete this topic?'))) return false;
    const topics = collectHotTopicsFromList(tabType);
    if (!topics[index]) return false;
    topics.splice(index, 1);
    return persistHotTopicDraft(tabType, topics, t('settingsTopicDeleted', 'Topic deleted.'));
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
    if (settingsReplacementPending || !confirm('Are you sure you want to remove the movie poster?')) return;
    const session = settingsSession;
    ++settingsHelperSaves;
    return queueSettingsWrite(async () => {
        if (session !== settingsSession || settingsReplacementPending) return;
        try {
            requireSettingsBaseline();
            const settings = {movie: {...settingsFormConfig.movie, poster: ''}};
            const saved = await storageManager.setAll(settings, {expectedSettings: settingsBaseline, settingsPaths: ['movie.poster']});
            if (!saved) throw new Error(t('failedToSave', 'Failed to save. Please try again.'));
            advanceSettingsBaseline(settings, ['movie.poster'], settings);
            if (session !== settingsSession || settingsReplacementPending) return;
            const previewDiv = document.getElementById('movie-poster-preview');
            if (previewDiv) previewDiv.style.display = 'none';
            const posterInput = document.getElementById('movie-poster-upload');
            if (posterInput) posterInput.value = '';
            showMessage('Movie poster removed.', 'success');
        } catch (error) {
            if (session === settingsSession && !settingsReplacementPending) {
                showMessage(error.code?.startsWith('SETTINGS_') ? settingsNotice(error) : error.message, 'error');
            }
        }
    }).finally(() => { --settingsHelperSaves; });
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
    let fullMessage = `[${timestamp}] ${operation === 'import' ? t('settingsTransferImportLabel', 'IMPORT') : operation === 'export' ? t('settingsTransferExportLabel', 'EXPORT') : operation.toUpperCase()}: ${message}`;
    
    if (details) {
        if (details.fileSize) {
            fullMessage += ` (${t('settingsTransferFileSizeLabel', 'File size:')} ${(details.fileSize / 1024).toFixed(1)} KB)`;
        }
        if (details.recordCount) {
            fullMessage += ` (${details.recordCount} ${t('settingsTransferItemsLabel', 'items')})`;
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
        'show-clock', 'show-search', 'show-shortcuts', 'show-weather', 'show-hot', 'show-movie', 'show-shortcut-titles', 'finder-shortcut-enabled',
        'search-engine', 'search-custom',
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

// Separate from full settings JSON export; confirmation happens before storage access.
function setupBookmarkExport() {
    const button = document.getElementById('export-bookmarks-html');
    const panel = document.getElementById('bookmark-export-preview');
    if (!button || !panel || button.dataset.bookmarkExportBound) return;
    button.dataset.bookmarkExportBound = 'true';
    const api = window.LocalItabBookmarkExport;
    let epoch = 0, busy = false, closed = false, owner = null, prepared = null, saved = null;
    const create = (tag, id, text, parent = panel) => {
        const node = document.createElement(tag); if (id) node.id = id;
        if (text !== undefined) node.textContent = text; parent.append(node); return node;
    };
    panel.setAttribute('role', 'group'); panel.setAttribute('aria-labelledby', 'bookmark-export-title');
    const title = create('h3', 'bookmark-export-title', t('bookmarkExportPreviewTitle', 'Review bookmark export')); title.tabIndex = -1;
    const label = create('label', null, t('bookmarkExportChooseScope', 'Export scope'));
    label.setAttribute('for', 'bookmark-export-category');
    const select = create('select', 'bookmark-export-category'); select.className = 'form-select';
    const counts = create('p', 'bookmark-export-counts'); counts.setAttribute('role', 'status'); counts.setAttribute('aria-live', 'polite');
    const privacy = create('p', 'bookmark-export-privacy', t('bookmarkExportPreviewPrivacy', 'This file includes full URLs, including private query parameters and fragments. Review the counts and scope before downloading. Keep the file private.'));
    privacy.className = 'form-hint'; select.setAttribute('aria-describedby', 'bookmark-export-counts bookmark-export-privacy');
    const controls = create('div'); controls.className = 'data-actions';
    const download = create('button', 'bookmark-export-download', t('bookmarkExportDownloadReviewed', 'Download reviewed scope'), controls);
    const cancelButton = create('button', 'bookmark-export-cancel', t('bookmarkExportCancelPreview', 'Cancel preview'), controls);
    for (const control of [download, cancelButton]) { control.type = 'button'; control.className = 'btn btn-secondary'; }
    button.setAttribute('aria-controls', panel.id); button.setAttribute('aria-expanded', 'false');
    function visible() {
        const tab = button.closest('.tab-panel');
        return !closed && document.visibilityState !== 'hidden' && button.isConnected && panel.isConnected &&
            document.getElementById(button.id) === button && document.getElementById(panel.id) === panel &&
            !button.closest('[hidden], [inert]') && (!tab || tab.classList.contains('active')) && button.getClientRects().length > 0;
    }
    function captureOwner() {
        const workspace = storageManager.workspace || null;
        const session = window.LocalItabWorkspaces?.session || null;
        return {workspace, id: workspace?.id, generation: workspace?.generation,
            session, sessionId: session?.id, sessionGeneration: session?.generation, settings: settingsSession};
    }
    function ownsWorkspace() {
        return owner && owner.settings === settingsSession && !settingsReplacementPending && !settingsReplacementRunning &&
            !window.LocalItabContentLifecycle?.departing && (storageManager.workspace || null) === owner.workspace &&
            (window.LocalItabWorkspaces?.session || null) === owner.session &&
            (!owner.workspace || (owner.id && owner.generation && !owner.workspace.invalidated && !owner.workspace._suspended &&
                owner.workspace.id === owner.id && owner.workspace.generation === owner.generation)) &&
            (!owner.session || (owner.sessionId && owner.sessionGeneration && !owner.session.invalidated && !owner.session._suspended &&
                owner.session.id === owner.sessionId && owner.session.generation === owner.sessionGeneration));
    }
    function working(value) {
        busy = value; button.disabled = value || Boolean(owner); select.disabled = value || !saved;
        download.disabled = value || !prepared; panel.setAttribute('aria-busy', value ? 'true' : 'false');
    }
    function retire(repairFocus = false) {
        const contained = panel.contains(document.activeElement);
        ++epoch; owner = null; prepared = null; saved = null;
        panel.hidden = true; select.replaceChildren(); select.value = '-1'; counts.textContent = '';
        button.setAttribute('aria-expanded', 'false'); working(false);
        // Only our own hiding follows the last ownership check. Old permissions
        // are already gone; draining here cannot revive any cancelled preview.
        observer?.takeRecords();
        if (repairFocus && contained && visible()) button.focus();
    }
    function invalidating(records) {
        // Appearance refresh paints these bounded custom properties on <html>.
        // They do not hide this review or alter its exported fields. Keep every
        // other style/class change conservative, including hide/show history.
        const withoutAppearance = style => String(style || '').split(';').map(part => part.trim())
            .filter(part => part && !/^--custom-(background|card-(padding|gap|radius|opacity|columns))\s*:/.test(part)).join(';');
        return records.some(record => {
            if (record.type === 'attributes') {
                if (record.attributeName === 'style' && record.target === document.documentElement &&
                    withoutAppearance(record.oldValue) === withoutAppearance(record.target.getAttribute('style'))) return false;
                return true;
            }
            return record.type === 'childList' && Array.from(record.removedNodes).some(node =>
                node === button || node === panel || node.contains?.(button) || node.contains?.(panel));
        });
    }
    function current(request) {
        if (request !== epoch) return false;
        if (invalidating(observer?.takeRecords() || []) || !visible() || !ownsWorkspace() || panel.hidden ||
            panel.closest('[hidden], [inert]') || panel.getClientRects().length === 0) { retire(); return false; }
        return true;
    }
    function scope() {
        if (select.value === '-1') return {kind: 'all'};
        if (!/^(0|[1-9][0-9]*)$/.test(select.value)) throw new Error();
        const category = saved.categories[Number(select.value)];
        if (!category) throw new Error();
        return {kind: 'category', id: category.id};
    }
    function showCounts() {
        counts.textContent = t('bookmarkExportPreviewCounts', 'Sites: $1 · Folders: $2', [prepared.siteCount, prepared.folderCount]);
    }
    const failed = () => showMessage(t('bookmarkExportFailed', 'No bookmark export completed. Saved data could not be read or is unsupported or too large. Check your saved shortcuts and try again.'), 'error');
    const expired = () => showMessage(t('bookmarkExportPreviewExpired', 'Saved bookmarks or this workspace changed, or could not be checked. Nothing was downloaded. Open a new export preview and review it again.'), 'error');
    async function open() {
        if (busy || owner || !visible() || window.LocalItabContentLifecycle?.departing) return;
        retire(); busy = true;
        try {
            if (!confirm(t('bookmarkExportConfirm', 'Read saved shortcut titles, full URLs and category names to preview a local HTML export? URLs may contain private query parameters. Unsaved edits, icons, settings, Tasks, Focus, Scratchpad and Countdown are excluded. Keep this file private.'))) { retire(); return; }
        } catch (_) { retire(); failed(); return; }
        owner = captureOwner(); const request = epoch; working(true);
        panel.hidden = false; button.setAttribute('aria-expanded', 'true'); observer?.takeRecords();
        counts.textContent = t('bookmarkExportPreviewReading', 'Reading saved bookmarks…'); title.focus();
        try {
            if (!current(request)) return;
            const config = await storageManager.getAllForBackup();
            if (!current(request)) return;
            prepared = api.prepare(config); saved = prepared.snapshot;
            const all = create('option', null, t('bookmarkExportAllCategories', 'All saved categories and sites'), select); all.value = '-1';
            const names = new Map();
            for (const category of saved.categories) names.set(category.name, (names.get(category.name) || 0) + 1);
            saved.categories.forEach((category, index) => {
                const name = names.get(category.name) > 1
                    ? t('bookmarkExportCategoryIdentity', '$1 (ID: $2)', [category.name, category.id]) : category.name;
                const option = create('option', null, name, select); option.value = String(index);
            });
            select.value = '-1'; showCounts(); working(false); select.focus();
        } catch (_) { if (current(request)) { retire(true); failed(); } }
        finally { if (request === epoch) working(false); }
    }
    function changeScope() {
        if (!saved || !current(epoch)) return;
        // A newer selection retires an older in-flight verification, even if a
        // stale/programmatic change event reaches the disabled select.
        ++epoch;
        try { prepared = api.prepare(saved, scope()); showCounts(); working(false); }
        catch (_) { retire(true); failed(); }
    }
    async function downloadReviewed() {
        if (busy || !prepared || !current(epoch)) return;
        const request = epoch, reviewed = prepared, selection = select.value;
        // A value change without a change event is not an approved scope.
        try {
            const selected = scope();
            if (selected.kind !== reviewed.scope.kind || selected.id !== reviewed.scope.id) { retire(true); expired(); return; }
        } catch (_) { retire(true); expired(); return; }
        // Native disabling can move focus to body. Keep an owned keyboard
        // action on the still-enabled Cancel control; do not steal outside focus.
        if (document.activeElement === download || document.activeElement === select) cancelButton.focus();
        working(true);
        let url = null, anchor = null;
        try {
            const config = await storageManager.getAllForBackup();
            if (!current(request) || reviewed !== prepared) return;
            if (select.value !== selection || !api.matches(reviewed, config)) { retire(true); expired(); return; }
            url = URL.createObjectURL(new Blob([reviewed.html], {type: 'text/html;charset=utf-8'}));
            anchor = document.createElement('a'); anchor.href = url; anchor.download = 'local-itab-bookmarks.html';
            document.body.appendChild(anchor);
            if (!current(request) || reviewed !== prepared || select.value !== selection) return;
            anchor.click();
            // Allow the browser to consume the reviewed HTML before releasing it.
            const completedURL = url;
            setTimeout(() => URL.revokeObjectURL(completedURL), 1000); url = null;
            retire(true); showMessage(t('bookmarkExportStarted', 'Bookmark HTML download requested.'), 'success');
        } catch (_) { if (request === epoch) { retire(true); expired(); } }
        finally {
            if (anchor) anchor.remove(); if (url) URL.revokeObjectURL(url);
            if (request === epoch) working(false);
        }
    }
    button.addEventListener('click', open); select.addEventListener('change', changeScope);
    download.addEventListener('click', downloadReviewed); cancelButton.addEventListener('click', () => retire(true));
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); retire(true); }
    });
    for (const control of [button, download, cancelButton]) control.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
            (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    const visibility = () => { if (document.visibilityState === 'hidden') retire(); };
    const pagehide = () => retire();
    // Attribute history and ancestor removals revoke a hide/show or detach/reinsert
    // round trip. Unrelated DOM additions (including our download anchor) do not.
    const observer = typeof window.MutationObserver === 'function'
        ? new window.MutationObserver(records => { if (invalidating(records)) retire(); }) : null;
    for (let node = button; observer && node; node = node.parentElement)
        observer.observe(node, {attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'inert', 'class', 'style'], childList: true});
    observer?.observe(panel, {attributes: true, attributeOldValue: true, attributeFilter: ['hidden', 'inert', 'class', 'style']});
    document.addEventListener('visibilitychange', visibility); window.addEventListener?.('pagehide', pagehide);
    const unsubscribe = storageManager.workspace?.manager?.subscribe(() => { if (owner && !ownsWorkspace()) retire(); });
    window.bookmarkExportView = {cancel: retire, get pending() { return busy; },
        hasUncommittedWork() { return Boolean(owner || busy || prepared); }, destroy() {
            retire(); closed = true; observer?.disconnect(); unsubscribe?.();
            document.removeEventListener?.('visibilitychange', visibility); window.removeEventListener?.('pagehide', pagehide);
        }};
    working(false);
}
