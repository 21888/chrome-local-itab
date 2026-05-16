/**
 * Storage Manager for Local iTab Extension
 * Handles all chrome.storage.local operations with error handling and validation
 */

class StorageManager {
    constructor() {
        this.syncMetaKey = '__localItabSyncMeta';
        this.syncChunkPrefix = '__localItabSyncData_';
        this.syncMaxChunks = 20;
        this.syncTotalBudget = 98000;
        this._textEncoder = null;
        this._syncInitialized = false;
        this._syncInitPromise = null;
        this._isApplyingSync = false;
        this._ignoreRemoteSyncUntil = 0;
        this._syncPushTimer = null;

        // Default configuration schema
        this.defaultConfig = {
            clock: { 
                hour12: false, 
                showSeconds: true 
            },
            search: { 
                engine: 'google', 
                custom: '' 
            },
            bg: {
                type: 'gradient',
                value: ''
            },
            themePreset: 'aurora-glass',
            show: {
                clock: true,
                search: true,
                shortcuts: true,
                weather: false,
                hot: false,
                movie: false
            },
            privacy: {
                onlineWallpapers: false,
                onlineFavicons: false
            },
            categories: [
                { id: 'work', name: '\u5de5\u4f5c', icon: '\ud83d\udcbc' },
                { id: 'social', name: '\u793e\u4ea4', icon: '\ud83d\udc65' },
                { id: 'entertainment', name: '\u5a31\u4e50', icon: '\ud83c\udfae' },
                { id: 'tools', name: '\u5de5\u5177', icon: '\ud83d\udd27' },
                { id: 'learning', name: '\u5b66\u4e60', icon: '\ud83d\udcda' }
            ],
            links: [],
            weather: {
                city: 'Local',
                temp: 22,
                cond: 'Sunny',
                aqiLabel: 'Good',
                aqi: 50,
                low: 18,
                high: 26
            },
            hot: {
                tab: 'baidu',
                baidu: [],
                weibo: [],
                zhihu: []
            },
            movie: {
                title: 'Sample Movie',
                note: 'A great movie to watch',
                poster: ''
            },
            quote: 'Welcome to your personalized new tab page!',
            layout: {
                autoArrange: true,
                alignToGrid: true,
                gridSize: 96,
                columns: 6,
                positions: {}
            },
            ui: {
                dashboardHidden: false,
                dashboardPadding: null,
                showShortcutTitles: true,
                shortcutsStyle: {
                    gapX: null,
                    gapY: null,
                    iconSize: null,
                    titleSize: null,
                    titleColor: ''
                }
            },
            sync: {
                enabled: false,
                lastSync: '',
                lastError: '',
                includeLargeAssets: false
            }
        };
    }

    /**
     * Get a value from storage with default fallback
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {Promise<*>} - Retrieved value or default
     */
    async get(key, defaultValue = null) {
        try {
            await this.ensureSyncInitialized();
            const result = await chrome.storage.local.get([key]);
            
            if (result[key] !== undefined) {
                // Validate retrieved data
                try {
                    const validatedValue = this.validateData(key, result[key]);
                    return validatedValue;
                } catch (validationError) {
                    console.warn(`Data validation failed for key "${key}", using default:`, validationError);
                    
                    // Notify about data corruption recovery
                    if (typeof errorHandler !== 'undefined') {
                        errorHandler.showDataRecovery([key]);
                    }
                    
                    const defaultVal = defaultValue !== null ? defaultValue : this.getDefaultValue(key);
                    
                    // Try to save the corrected default value
                    try {
                        await this.set(key, defaultVal);
                    } catch (saveError) {
                        console.error(`Failed to save corrected value for key "${key}":`, saveError);
                    }
                    
                    return defaultVal;
                }
            }
            
            // Return provided default or schema default
            if (defaultValue !== null) {
                return defaultValue;
            }
            
            return this.getDefaultValue(key);
        } catch (error) {
            console.error(`Storage get error for key "${key}":`, error);
            
            // Handle specific storage errors
            if (typeof errorHandler !== 'undefined') {
                errorHandler.handleStorageError(error, `retrieve ${key}`);
            }
            
            return defaultValue !== null ? defaultValue : this.getDefaultValue(key);
        }
    }

    /**
     * Set a value in storage with validation
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {Promise<boolean>} - Success status
     */
    async set(key, value) {
        try {
            await this.ensureSyncInitialized();
            // Validate the data before storing
            const validatedValue = this.validateData(key, value);

            await chrome.storage.local.set({ [key]: validatedValue });

            if (!this._isApplyingSync) {
                if (key === 'sync') {
                    if (validatedValue.enabled) {
                        this.scheduleSyncPush();
                    } else {
                        await this.disableRemoteSync();
                    }
                } else if (await this.isSyncEnabledLocally()) {
                    this.scheduleSyncPush();
                }
            }

            return true;
        } catch (error) {
            console.error(`Storage set error for key "${key}":`, error);
            
            // Handle quota exceeded error
            if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
                throw new Error('Storage quota exceeded. Please remove some data or export your settings.');
            }
            
            return false;
        }
    }

    /**
     * Get all stored data
     * @returns {Promise<Object>} - All stored data with defaults for missing keys
     */
    async getAll() {
        try {
            await this.ensureSyncInitialized();
            const result = await chrome.storage.local.get(null);

            // Merge with defaults for any missing keys
            const completeConfig = this.cloneDefaultConfig();

            for (const [key, value] of Object.entries(result)) {
                if (this.defaultConfig.hasOwnProperty(key)) {
                    completeConfig[key] = this.validateData(key, value);
                }
            }
            
            return completeConfig;
        } catch (error) {
            console.error('Storage getAll error:', error);
            return { ...this.defaultConfig };
        }
    }

    /**
     * Set multiple values at once
     * @param {Object} data - Key-value pairs to store
     * @returns {Promise<boolean>} - Success status
     */
    async setAll(data, options = {}) {
        try {
            if (!options.skipSyncInitialization) {
                await this.ensureSyncInitialized();
            }
            const wasSyncEnabled = await this.isSyncEnabledLocally();
            const validatedData = {};

            // Validate each key-value pair
            for (const [key, value] of Object.entries(data)) {
                validatedData[key] = this.validateData(key, value);
            }

            await chrome.storage.local.set(validatedData);

            if (!this._isApplyingSync && !options.skipSyncSideEffects) {
                const syncEnabled = validatedData.sync?.enabled || await this.isSyncEnabledLocally();
                if (syncEnabled) {
                    this.scheduleSyncPush();
                } else if (validatedData.sync && validatedData.sync.enabled === false && wasSyncEnabled) {
                    await this.disableRemoteSync();
                }
            }

            return true;
        } catch (error) {
            console.error('Storage setAll error:', error);
            
            if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
                throw new Error('Storage quota exceeded. Please reduce the amount of data being stored.');
            }
            
            return false;
        }
    }

    /**
     * Clear all stored data
     * @returns {Promise<boolean>} - Success status
     */
    async clear() {
        try {
            const current = await chrome.storage.local.get(['sync']);
            const wasSyncing = current.sync?.enabled === true;
            await chrome.storage.local.clear();
            if (wasSyncing) {
                await this.disableRemoteSync();
            }
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }

    /**
     * Get storage usage information
     * @returns {Promise<Object>} - Storage usage stats
     */
    async getStorageInfo() {
        try {
            const bytesInUse = await chrome.storage.local.getBytesInUse();
            const quota = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
            const syncAvailable = this.isSyncAvailable();
            const syncBytesInUse = syncAvailable ? await chrome.storage.sync.getBytesInUse(null) : 0;
            const syncQuota = syncAvailable ? (chrome.storage.sync.QUOTA_BYTES || 102400) : 0;

            return {
                bytesInUse,
                quota,
                percentUsed: Math.round((bytesInUse / quota) * 100),
                available: quota - bytesInUse,
                local: {
                    bytesInUse,
                    quota,
                    percentUsed: Math.round((bytesInUse / quota) * 100),
                    available: quota - bytesInUse
                },
                sync: {
                    available: syncAvailable,
                    bytesInUse: syncBytesInUse,
                    quota: syncQuota,
                    percentUsed: syncQuota ? Math.round((syncBytesInUse / syncQuota) * 100) : 0,
                    availableBytes: syncQuota ? Math.max(0, syncQuota - syncBytesInUse) : 0
                }
            };
        } catch (error) {
            console.error('Storage info error:', error);
            return {
                bytesInUse: 0,
                quota: 5242880,
                percentUsed: 0,
                available: 5242880,
                local: {
                    bytesInUse: 0,
                    quota: 5242880,
                    percentUsed: 0,
                    available: 5242880
                },
                sync: {
                    available: false,
                    bytesInUse: 0,
                    quota: 0,
                    percentUsed: 0,
                    availableBytes: 0
                }
            };
        }
    }

    /**
     * Get default value for a key from schema
     * @param {string} key - Storage key
     * @returns {*} - Default value
     */
    getDefaultValue(key) {
        return this.defaultConfig.hasOwnProperty(key)
            ? JSON.parse(JSON.stringify(this.defaultConfig[key]))
            : null;
    }

    cloneDefaultConfig() {
        return JSON.parse(JSON.stringify(this.defaultConfig));
    }

    getDisabledSyncConfig() {
        return this.validateSyncConfig({
            enabled: false,
            lastSync: '',
            lastError: '',
            includeLargeAssets: false
        });
    }

    sanitizeConfigForBackup(config) {
        const sanitized = this.validateConfigObject(config);
        sanitized.sync = this.getDisabledSyncConfig();
        return sanitized;
    }

    getExtensionVersion() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
                return chrome.runtime.getManifest().version || '';
            }
        } catch (_) {}
        return '';
    }

    countBackupItems(config) {
        const source = this.validateConfigObject(config);
        const links = Array.isArray(source.links) ? source.links : [];
        const hot = source.hot || {};
        const dataUrlIcons = links.filter(link => typeof link.icon === 'string' && link.icon.startsWith('data:')).length;
        const hasBackgroundImage = source.bg?.type === 'image' && !!source.bg.value;
        const hasMoviePoster = !!source.movie?.poster;

        return {
            shortcuts: links.length,
            categories: Array.isArray(source.categories) ? source.categories.length : 0,
            hotTopics: (hot.baidu?.length || 0) + (hot.weibo?.length || 0) + (hot.zhihu?.length || 0),
            dataUrlIcons,
            hasBackgroundImage,
            hasMoviePoster,
            localImagesIncluded: !!(hasBackgroundImage || hasMoviePoster || dataUrlIcons > 0)
        };
    }

    buildManualExportPayload(config, metadata = {}) {
        const sanitized = this.sanitizeConfigForBackup(config);
        const exportDate = metadata.exportDate || new Date().toISOString();

        return {
            version: '1.0',
            schemaVersion: 1,
            exportDate,
            createdAt: exportDate,
            exportedBy: 'Local iTab Extension',
            extensionVersion: metadata.extensionVersion || this.getExtensionVersion(),
            itemCounts: this.countBackupItems(sanitized),
            data: sanitized
        };
    }

    buildDriveBackupPayload(config, metadata = {}) {
        const sanitized = this.sanitizeConfigForBackup(config);
        const createdAt = metadata.createdAt || new Date().toISOString();
        const snapshotId = metadata.snapshotId || `snapshot_${Date.now()}`;
        const deviceId = typeof metadata.deviceId === 'string' ? metadata.deviceId : '';
        const deviceName = typeof metadata.deviceName === 'string' ? metadata.deviceName : '';

        return {
            version: '1.0',
            schemaVersion: 1,
            type: 'backupSnapshot',
            app: 'local-itab',
            createdAt,
            exportDate: createdAt,
            exportedBy: 'Local iTab Extension',
            extensionVersion: metadata.extensionVersion || this.getExtensionVersion(),
            snapshotId,
            device: {
                id: deviceId,
                name: deviceName
            },
            metadata: {
                app: 'local-itab',
                type: 'backupSnapshot',
                schemaVersion: 1,
                deviceId,
                snapshotId,
                reason: typeof metadata.reason === 'string' ? metadata.reason : 'manual'
            },
            itemCounts: this.countBackupItems(sanitized),
            data: sanitized
        };
    }

    validateImportPayload(importData) {
        let settings;

        if (importData && typeof importData === 'object' && importData.data && (importData.version || importData.schemaVersion || importData.type)) {
            settings = importData.data;
        } else if (importData && typeof importData === 'object' && importData.settings) {
            settings = importData.settings;
        } else {
            settings = importData;
        }

        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error('Settings data must be an object');
        }

        const validated = this.validateConfigObject(settings);
        validated.sync = this.getDisabledSyncConfig();

        if (!Array.isArray(validated.links)) {
            validated.links = [];
        }

        if (typeof validated.quote !== 'string') {
            validated.quote = this.defaultConfig.quote;
        }

        return validated;
    }

    prepareRestoredConfig(importData, currentConfig = null) {
        const restored = this.validateImportPayload(importData);
        if (currentConfig && typeof currentConfig === 'object') {
            restored.sync = this.validateSyncConfig(currentConfig.sync || this.defaultConfig.sync);
        }
        return restored;
    }

    validateConfigObject(data) {
        const validated = this.cloneDefaultConfig();
        if (!data || typeof data !== 'object') {
            return validated;
        }

        for (const key of Object.keys(this.defaultConfig)) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                validated[key] = this.validateData(key, data[key]);
            }
        }

        return validated;
    }

    isSyncAvailable() {
        return !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync);
    }

    async isSyncEnabledLocally() {
        try {
            const result = await chrome.storage.local.get(['sync']);
            return result.sync?.enabled === true;
        } catch (_) {
            return false;
        }
    }

    async getLocalProviderState() {
        const result = await chrome.storage.local.get(['sync']);
        return {
            sync: this.validateSyncConfig(result.sync || this.defaultConfig.sync)
        };
    }

    async ensureSyncInitialized() {
        if (this._syncInitialized) return;
        if (this._syncInitPromise) return this._syncInitPromise;

        this._syncInitPromise = (async () => {
            if (!this.isSyncAvailable()) {
                this._syncInitialized = true;
                return;
            }

            try {
                const remoteMeta = await this.getRemoteMeta();
                if (!remoteMeta?.enabled) {
                    this._syncInitialized = true;
                    return;
                }

                const localResult = await chrome.storage.local.get(['sync']);
                const localSync = this.validateSyncConfig(localResult.sync || this.defaultConfig.sync);
                if (localSync.lastSync === remoteMeta.updatedAt) {
                    this._syncInitialized = true;
                    return;
                }

                const remoteData = await this.readRemoteSyncData(remoteMeta);
                if (!remoteData) {
                    this._syncInitialized = true;
                    return;
                }

                const validated = this.validateConfigObject(remoteData);
                validated.sync = this.validateSyncConfig({
                    enabled: true,
                    lastSync: remoteMeta.updatedAt || '',
                    lastError: '',
                    includeLargeAssets: false
                });

                this._isApplyingSync = true;
                try {
                    await chrome.storage.local.set(validated);
                } finally {
                    this._isApplyingSync = false;
                }
            } catch (error) {
                console.warn('Cloud sync initialization failed:', error);
                await this.updateLocalSyncState({
                    enabled: false,
                    lastError: error.message || String(error)
                });
            } finally {
                this._syncInitialized = true;
            }
        })();

        return this._syncInitPromise;
    }

    async getSyncStatus() {
        await this.ensureSyncInitialized();
        const localResult = await chrome.storage.local.get(['sync']);
        const localSync = this.validateSyncConfig(localResult.sync || this.defaultConfig.sync);
        const remoteMeta = this.isSyncAvailable() ? await this.getRemoteMeta() : null;
        const storageInfo = await this.getStorageInfo();

        return {
            available: this.isSyncAvailable(),
            enabled: localSync.enabled,
            local: localSync,
            remote: remoteMeta,
            storage: storageInfo.sync
        };
    }

    async setSyncEnabled(enabled) {
        await this.ensureSyncInitialized();
        const config = await this.getAll();
        config.sync = this.validateSyncConfig({
            ...config.sync,
            enabled,
            lastError: ''
        });

        await chrome.storage.local.set({ sync: config.sync });

        if (enabled) {
            try {
                return await this.pushToSync();
            } catch (error) {
                await this.updateLocalSyncState({
                    enabled: false,
                    lastError: error.message || String(error)
                });
                throw error;
            }
        }

        await this.disableRemoteSync();
        return this.getSyncStatus();
    }

    async pushToSync() {
        if (this._syncPushTimer) {
            clearTimeout(this._syncPushTimer);
            this._syncPushTimer = null;
        }
        if (this._isApplyingSync) return this.getSyncStatus();
        if (!this.isSyncAvailable()) {
            throw new Error('Chrome Sync storage is not available in this browser.');
        }

        try {
            const config = await this.getAll();
            const { payload, omittedAssets } = this.prepareSyncPayload(config);
            const payloadJson = JSON.stringify(payload);
            const payloadBytes = this.getUtf8ByteLength(payloadJson);

            const oldMeta = await this.getRemoteMeta();
            const chunks = this.createSyncChunks(payloadJson);

            const updatedAt = new Date().toISOString();
            const items = {
                [this.syncMetaKey]: {
                    enabled: true,
                    version: 2,
                    updatedAt,
                    chunkCount: chunks.length,
                    payloadBytes,
                    omittedAssets
                }
            };

            chunks.forEach((chunk, index) => {
                items[`${this.syncChunkPrefix}${index}`] = chunk;
            });

            const syncBytes = this.getSyncItemsBytes(items);
            if (syncBytes > this.syncTotalBudget) {
                throw new Error(`Cloud sync payload is too large (${Math.round(syncBytes / 1024)} KB after Chrome Sync encoding). Remove some shortcuts or use manual export for large data.`);
            }

            this._ignoreRemoteSyncUntil = Date.now() + 2000;
            await chrome.storage.sync.set(items);

            const oldCount = Number.isFinite(oldMeta?.chunkCount) ? oldMeta.chunkCount : 0;
            if (oldCount > chunks.length) {
                const staleKeys = [];
                for (let i = chunks.length; i < oldCount; i += 1) {
                    staleKeys.push(`${this.syncChunkPrefix}${i}`);
                }
                if (staleKeys.length) await chrome.storage.sync.remove(staleKeys);
            }

            await this.updateLocalSyncState({
                enabled: true,
                lastSync: updatedAt,
                lastError: ''
            });

            return this.getSyncStatus();
        } catch (error) {
            await this.updateLocalSyncState({
                enabled: true,
                lastError: error.message || String(error)
            });
            throw error;
        }
    }

    async pullFromSync() {
        if (!this.isSyncAvailable()) {
            throw new Error('Chrome Sync storage is not available in this browser.');
        }

        const remoteMeta = await this.getRemoteMeta();
        if (!remoteMeta?.enabled) {
            await this.updateLocalSyncState({ enabled: false });
            return { applied: false, status: await this.getSyncStatus() };
        }

        const localResult = await chrome.storage.local.get(['sync']);
        const localSync = this.validateSyncConfig(localResult.sync || this.defaultConfig.sync);
        if (localSync.lastSync === remoteMeta.updatedAt) {
            return { applied: false, status: await this.getSyncStatus() };
        }

        const remoteData = await this.readRemoteSyncData(remoteMeta);
        if (!remoteData) {
            throw new Error('Cloud sync data is empty or corrupted.');
        }

        const validated = this.validateConfigObject(remoteData);
        validated.sync = this.validateSyncConfig({
            enabled: true,
            lastSync: remoteMeta.updatedAt || '',
            lastError: '',
            includeLargeAssets: false
        });

        this._isApplyingSync = true;
        try {
            await chrome.storage.local.set(validated);
        } finally {
            this._isApplyingSync = false;
        }

        return { applied: true, status: await this.getSyncStatus() };
    }

    async clearSync() {
        if (!this.isSyncAvailable()) {
            throw new Error('Chrome Sync storage is not available in this browser.');
        }

        await this.disableRemoteSync(true);
        return this.getSyncStatus();
    }

    async getRemoteMeta() {
        if (!this.isSyncAvailable()) return null;
        const result = await chrome.storage.sync.get([this.syncMetaKey]);
        const meta = result[this.syncMetaKey];
        return meta && typeof meta === 'object' ? meta : null;
    }

    async readRemoteSyncData(meta) {
        const chunkCount = Number.isFinite(meta?.chunkCount) ? meta.chunkCount : 0;
        if (chunkCount <= 0 || chunkCount > this.syncMaxChunks) return null;

        const keys = Array.from({ length: chunkCount }, (_, index) => `${this.syncChunkPrefix}${index}`);
        const result = await chrome.storage.sync.get(keys);
        const json = keys.map(key => result[key] || '').join('');
        if (!json) return null;

        return JSON.parse(json);
    }

    async disableRemoteSync(clearChunks = false) {
        if (!this.isSyncAvailable()) return;

        const oldMeta = await this.getRemoteMeta();
        const oldCount = Number.isFinite(oldMeta?.chunkCount) ? oldMeta.chunkCount : 0;
        const keysToRemove = [];
        if (clearChunks || oldCount) {
            for (let i = 0; i < oldCount; i += 1) {
                keysToRemove.push(`${this.syncChunkPrefix}${i}`);
            }
        }

        if (keysToRemove.length) {
            await chrome.storage.sync.remove(keysToRemove);
        }

        this._ignoreRemoteSyncUntil = Date.now() + 2000;
        await chrome.storage.sync.set({
            [this.syncMetaKey]: {
                enabled: false,
                version: 2,
                updatedAt: new Date().toISOString(),
                chunkCount: 0,
                payloadBytes: 0,
                omittedAssets: []
            }
        });

        await this.updateLocalSyncState({
            enabled: false,
            lastError: ''
        });
    }

    getUtf8ByteLength(value) {
        const text = String(value);
        if (typeof TextEncoder !== 'undefined') {
            if (!this._textEncoder) {
                this._textEncoder = new TextEncoder();
            }
            return this._textEncoder.encode(text).length;
        }

        if (typeof Blob !== 'undefined') {
            return new Blob([text]).size;
        }

        return text.length;
    }

    getSyncItemQuotaBytes() {
        const quota = this.isSyncAvailable()
            ? chrome.storage.sync.QUOTA_BYTES_PER_ITEM
            : null;
        return Number.isFinite(quota) ? quota : 8192;
    }

    getSyncItemBudgetBytes() {
        return Math.max(0, this.getSyncItemQuotaBytes() - 64);
    }

    getSyncItemBytes(key, value) {
        return this.getUtf8ByteLength(key) + this.getUtf8ByteLength(JSON.stringify(value));
    }

    getSyncItemsBytes(items) {
        return Object.entries(items).reduce((total, [key, value]) => {
            return total + this.getSyncItemBytes(key, value);
        }, 0);
    }

    createSyncChunks(payloadJson) {
        const chunks = [];
        let chunk = '';

        for (const char of payloadJson) {
            const key = `${this.syncChunkPrefix}${chunks.length}`;
            const candidate = chunk + char;
            if (this.getSyncItemBytes(key, candidate) <= this.getSyncItemBudgetBytes()) {
                chunk = candidate;
                continue;
            }

            if (!chunk) {
                throw new Error('Cloud sync payload contains an item that is too large for Chrome Sync.');
            }

            chunks.push(chunk);
            if (chunks.length >= this.syncMaxChunks) {
                throw new Error('Cloud sync payload needs too many chunks. Remove some shortcuts or use manual export for large data.');
            }

            chunk = char;
            const nextKey = `${this.syncChunkPrefix}${chunks.length}`;
            if (this.getSyncItemBytes(nextKey, chunk) > this.getSyncItemBudgetBytes()) {
                throw new Error('Cloud sync payload contains an item that is too large for Chrome Sync.');
            }
        }

        chunks.push(chunk);
        return chunks;
    }

    async updateLocalSyncState(partial) {
        try {
            const current = await chrome.storage.local.get(['sync']);
            const next = this.validateSyncConfig({
                ...(current.sync || this.defaultConfig.sync),
                ...partial
            });
            await chrome.storage.local.set({ sync: next });
        } catch (error) {
            console.warn('Failed to update local sync state:', error);
        }
    }

    prepareSyncPayload(config) {
        const source = this.validateConfigObject(config);
        const payload = {};
        const omittedAssets = [];

        for (const key of Object.keys(this.defaultConfig)) {
            if (key !== 'sync') {
                payload[key] = JSON.parse(JSON.stringify(source[key]));
            }
        }

        if (payload.bg?.type === 'image' && this.isLargeEmbeddedAsset(payload.bg.value)) {
            payload.bg = { type: 'gradient', value: '' };
            omittedAssets.push('backgroundImage');
        }

        if (payload.movie?.poster && this.isLargeEmbeddedAsset(payload.movie.poster)) {
            payload.movie.poster = '';
            omittedAssets.push('moviePoster');
        }

        if (Array.isArray(payload.links)) {
            payload.links = payload.links.map(link => {
                if (this.isLargeEmbeddedAsset(link.icon)) {
                    return { ...link, icon: '🌐' };
                }
                return link;
            });
        }

        return { payload, omittedAssets };
    }

    isLargeEmbeddedAsset(value) {
        return typeof value === 'string' && (value.startsWith('data:') || value.length > 4000);
    }

    shouldIgnoreRemoteSyncChange() {
        return Date.now() < this._ignoreRemoteSyncUntil;
    }

    scheduleSyncPush(delayMs = 900) {
        if (!this.isSyncAvailable() || this._isApplyingSync) return;
        if (this._syncPushTimer) {
            clearTimeout(this._syncPushTimer);
        }
        this._syncPushTimer = setTimeout(async () => {
            this._syncPushTimer = null;
            try {
                if (await this.isSyncEnabledLocally()) {
                    await this.pushToSync();
                }
            } catch (error) {
                console.warn('Background cloud sync failed:', error);
                await this.updateLocalSyncState({
                    enabled: true,
                    lastError: error.message || String(error)
                });
            }
        }, delayMs);
    }

    /**
     * Validate data according to schema
     * @param {string} key - Storage key
     * @param {*} value - Value to validate
     * @returns {*} - Validated value
     */
    validateData(key, value) {
        if (!this.defaultConfig.hasOwnProperty(key)) {
            throw new Error(`Invalid storage key: ${key}`);
        }

        try {
            switch (key) {
                case 'clock':
                    return this.validateClockConfig(value);
                case 'search':
                    return this.validateSearchConfig(value);
                case 'bg':
                    return this.validateBackgroundConfig(value);
                case 'show':
                    return this.validateShowConfig(value);
                case 'privacy':
                    return this.validatePrivacyConfig(value);
                case 'themePreset':
                    return this.validateThemePreset(value);
                case 'categories':
                    return this.validateCategoriesConfig(value);
                case 'links':
                    return this.validateLinksConfig(value);
                case 'weather':
                    return this.validateWeatherConfig(value);
                case 'hot':
                    return this.validateHotConfig(value);
                case 'movie':
                    return this.validateMovieConfig(value);
                case 'quote':
                    return this.validateQuoteConfig(value);
                case 'layout':
                    return this.validateLayoutConfig(value);
                case 'ui':
                    return this.validateUiConfig(value);
                case 'sync':
                    return this.validateSyncConfig(value);
                default:
                    return value;
            }
        } catch (error) {
            console.warn(`Validation failed for ${key}, using default:`, error);
            return this.getDefaultValue(key);
        }
    }

    /**
     * Validate clock configuration
     */
    validateClockConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Clock config must be an object');
        }
        
        return {
            hour12: typeof value.hour12 === 'boolean' ? value.hour12 : this.defaultConfig.clock.hour12,
            showSeconds: typeof value.showSeconds === 'boolean' ? value.showSeconds : this.defaultConfig.clock.showSeconds
        };
    }

    /**
     * Validate search configuration
     */
    validateSearchConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Search config must be an object');
        }
        
        const validEngines = ['google', 'bing', 'duck', 'custom'];
        const engine = validEngines.includes(value.engine) ? value.engine : this.defaultConfig.search.engine;
        let custom = typeof value.custom === 'string' ? value.custom.trim() : this.defaultConfig.search.custom;
        if (custom) {
            try {
                const parsed = new URL(custom);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') custom = '';
            } catch (_) {
                custom = '';
            }
        }

        return { engine, custom };
    }

    /**
     * Validate background configuration
     */
    validateBackgroundConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Background config must be an object');
        }
        
        const validTypes = ['gradient', 'color', 'image', 'api'];
        const type = validTypes.includes(value.type) ? value.type : this.defaultConfig.bg.type;
        let bgValue = typeof value.value === 'string' ? value.value : this.defaultConfig.bg.value;
        if (type === 'image' && bgValue && !/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(bgValue)) {
            bgValue = '';
        }

        return { type, value: bgValue };
    }

    /**
     * Validate show configuration
     */
    validateShowConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Show config must be an object');
        }
        
        return {
            clock: typeof value.clock === 'boolean' ? value.clock : this.defaultConfig.show.clock,
            search: typeof value.search === 'boolean' ? value.search : this.defaultConfig.show.search,
            shortcuts: typeof value.shortcuts === 'boolean' ? value.shortcuts : this.defaultConfig.show.shortcuts,
            weather: typeof value.weather === 'boolean' ? value.weather : this.defaultConfig.show.weather,
            hot: typeof value.hot === 'boolean' ? value.hot : this.defaultConfig.show.hot,
            movie: typeof value.movie === 'boolean' ? value.movie : this.defaultConfig.show.movie
        };
    }

    validatePrivacyConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Privacy config must be an object');
        }

        return {
            onlineWallpapers: typeof value.onlineWallpapers === 'boolean'
                ? value.onlineWallpapers
                : this.defaultConfig.privacy.onlineWallpapers,
            onlineFavicons: typeof value.onlineFavicons === 'boolean'
                ? value.onlineFavicons
                : this.defaultConfig.privacy.onlineFavicons
        };
    }

    /**
     * Validate theme preset
     */
    validateThemePreset(value) {
        const validThemes = ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'];
        if (typeof value !== 'string') {
            return this.defaultConfig.themePreset;
        }
        return validThemes.includes(value) ? value : this.defaultConfig.themePreset;
    }

    /**
     * Validate categories configuration
     */
    validateCategoriesConfig(value) {
        if (!Array.isArray(value)) {
            throw new Error('Categories must be an array');
        }

        return value.map(cat => {
            if (typeof cat !== 'object' || cat === null) {
                throw new Error('Each category must be an object');
            }

            return {
                id: typeof cat.id === 'string' && cat.id ? cat.id : `cat_${Date.now()}`,
                name: typeof cat.name === 'string' ? cat.name.trim() : '',
                icon: typeof cat.icon === 'string' && cat.icon ? cat.icon : '\ud83d\udcc1'
            };
        }).filter(cat => cat.name);
    }

    /**
     * Validate links configuration
     */
    validateLinksConfig(value) {
        if (!Array.isArray(value)) {
            throw new Error('Links must be an array');
        }

        return value.map(link => {
            if (typeof link !== 'object' || link === null) {
                throw new Error('Each link must be an object');
            }
            
            const rawUrl = typeof link.url === 'string' ? link.url.trim() : '';
            let url = '';
            try {
                const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
                const parsed = new URL(withProtocol);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    url = parsed.toString();
                }
            } catch (_) {}

            return {
                title: typeof link.title === 'string' ? link.title.trim() : '',
                url,
                icon: typeof link.icon === 'string' ? link.icon : '🌐',
                category: typeof link.category === 'string' && link.category
                    ? link.category
                    : 'work'
            };
        }).filter(link => link.title && link.url);
    }

    /**
     * Validate weather configuration
     */
    validateWeatherConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Weather config must be an object');
        }
        
        return {
            city: typeof value.city === 'string' ? value.city : this.defaultConfig.weather.city,
            temp: typeof value.temp === 'number' ? value.temp : this.defaultConfig.weather.temp,
            cond: typeof value.cond === 'string' ? value.cond : this.defaultConfig.weather.cond,
            aqiLabel: typeof value.aqiLabel === 'string' ? value.aqiLabel : this.defaultConfig.weather.aqiLabel,
            aqi: typeof value.aqi === 'number' ? value.aqi : this.defaultConfig.weather.aqi,
            low: typeof value.low === 'number' ? value.low : this.defaultConfig.weather.low,
            high: typeof value.high === 'number' ? value.high : this.defaultConfig.weather.high
        };
    }

    /**
     * Validate hot topics configuration
     */
    validateHotConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Hot topics config must be an object');
        }
        
        const validTabs = ['baidu', 'weibo', 'zhihu'];
        const tab = validTabs.includes(value.tab) ? value.tab : this.defaultConfig.hot.tab;
        
        const validateTopicArray = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(item => ({
                t: typeof item.t === 'string' ? item.t : '',
                s: typeof item.s === 'number' ? item.s : 0
            })).filter(item => item.t);
        };
        
        return {
            tab,
            baidu: validateTopicArray(value.baidu),
            weibo: validateTopicArray(value.weibo),
            zhihu: validateTopicArray(value.zhihu)
        };
    }

    /**
     * Validate movie configuration
     */
    validateMovieConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Movie config must be an object');
        }
        const poster = typeof value.poster === 'string' && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value.poster)
            ? value.poster
            : this.defaultConfig.movie.poster;

        return {
            title: typeof value.title === 'string' ? value.title : this.defaultConfig.movie.title,
            note: typeof value.note === 'string' ? value.note : this.defaultConfig.movie.note,
            poster
        };
    }

    /**
     * Validate quote configuration
     */
    validateQuoteConfig(value) {
        if (typeof value !== 'string') {
            throw new Error('Quote must be a string');
        }
        
        return value.trim() || this.defaultConfig.quote;
    }

    /**
     * Validate layout configuration
     */
    validateLayoutConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Layout config must be an object');
        }

        const autoArrange = typeof value.autoArrange === 'boolean' ? value.autoArrange : this.defaultConfig.layout.autoArrange;
        const alignToGrid = typeof value.alignToGrid === 'boolean' ? value.alignToGrid : this.defaultConfig.layout.alignToGrid;
        let gridSize = typeof value.gridSize === 'number' ? value.gridSize : this.defaultConfig.layout.gridSize;
        if (!Number.isFinite(gridSize) || gridSize < 48) gridSize = 48;
        if (gridSize > 240) gridSize = 240;

        let columns = typeof value.columns === 'number' ? value.columns : this.defaultConfig.layout.columns;
        if (!Number.isFinite(columns)) columns = this.defaultConfig.layout.columns;
        columns = Math.round(columns);
        if (columns < 1) columns = 1;
        if (columns > 10) columns = 10;

        const positions = (value.positions && typeof value.positions === 'object') ? value.positions : {};

        return { autoArrange, alignToGrid, gridSize, columns, positions };
    }

    validateUiConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('UI config must be an object');
        }

        const defaults = this.defaultConfig.ui;
        const clampPadding = (val) => {
            if (typeof val !== 'number' || !Number.isFinite(val)) return null;
            let num = Math.round(val);
            if (num < 0) num = 0;
            if (num > 160) num = 160;
            return num;
        };
        const clampStyleNumber = (val, min, max) => {
            if (typeof val !== 'number' || !Number.isFinite(val)) return null;
            let num = Math.round(val);
            if (num < min) num = min;
            if (num > max) num = max;
            return num;
        };
        const isValidHexColor = (val) => {
            return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val);
        };

        let dashboardPadding = defaults.dashboardPadding;
        const rawPadding = value.dashboardPadding;
        if (typeof rawPadding === 'number' && Number.isFinite(rawPadding)) {
            const clamped = clampPadding(rawPadding);
            if (clamped !== null) {
                dashboardPadding = { top: clamped, right: clamped, bottom: clamped, left: clamped };
            }
        } else if (rawPadding && typeof rawPadding === 'object') {
            const top = clampPadding(rawPadding.top);
            const right = clampPadding(rawPadding.right);
            const bottom = clampPadding(rawPadding.bottom);
            const left = clampPadding(rawPadding.left);
            if ([top, right, bottom, left].some(val => val !== null)) {
                dashboardPadding = { top, right, bottom, left };
            }
        }

        const styleDefaults = defaults.shortcutsStyle || {
            gapX: null,
            gapY: null,
            iconSize: null,
            titleSize: null,
            titleColor: ''
        };
        let shortcutsStyle = { ...styleDefaults };
        const rawStyle = value.shortcutsStyle;
        if (rawStyle && typeof rawStyle === 'object') {
            shortcutsStyle = {
                gapX: clampStyleNumber(rawStyle.gapX, 0, 80),
                gapY: clampStyleNumber(rawStyle.gapY, 0, 80),
                iconSize: clampStyleNumber(rawStyle.iconSize, 24, 96),
                titleSize: clampStyleNumber(rawStyle.titleSize, 10, 24),
                titleColor: ''
            };
            const color = typeof rawStyle.titleColor === 'string' ? rawStyle.titleColor.trim() : '';
            if (color === '' || isValidHexColor(color)) {
                shortcutsStyle.titleColor = color;
            } else {
                shortcutsStyle.titleColor = styleDefaults.titleColor;
            }
        }

        return {
            dashboardHidden: typeof value.dashboardHidden === 'boolean'
                ? value.dashboardHidden
                : defaults.dashboardHidden,
            dashboardPadding,
            showShortcutTitles: typeof value.showShortcutTitles === 'boolean'
                ? value.showShortcutTitles
                : defaults.showShortcutTitles,
            shortcutsStyle
        };
    }

    validateSyncConfig(value) {
        const defaults = this.defaultConfig.sync;
        if (typeof value !== 'object' || value === null) {
            return { ...defaults };
        }

        const lastError = typeof value.lastError === 'string'
            ? value.lastError.slice(0, 240)
            : defaults.lastError;

        return {
            enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
            lastSync: typeof value.lastSync === 'string' ? value.lastSync : defaults.lastSync,
            lastError,
            includeLargeAssets: false
        };
    }
}

// Create singleton instance
const storageManager = new StorageManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
} else {
    window.StorageManager = StorageManager;
    window.storageManager = storageManager;
}
