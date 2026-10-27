/**
 * Google Drive backup manager for Local iTab.
 * Uses chrome.identity and Drive appDataFolder without storing OAuth tokens.
 */

class DriveBackupManager {
    constructor(storage = null) {
        const source = storage || (typeof storageManager !== 'undefined' ? storageManager : null);
        this.storageManager = source?.forDefaultWorkspace ? source.forDefaultWorkspace() : source;
        this.stateKey = '__localItabDriveBackup';
        this.scope = 'https://www.googleapis.com/auth/drive.appdata';
        this.driveApiBase = 'https://www.googleapis.com/drive/v3';
        this.driveUploadBase = 'https://www.googleapis.com/upload/drive/v3';
        this.mimeType = 'application/json';
        this.retentionLimit = 20;
        this.warningSizeBytes = 5 * 1024 * 1024;
        this.maximumSizeBytes = 25 * 1024 * 1024;
        this._uploadInProgress = false;
    }

    static createId(prefix = '') {
        const randomId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        return `${prefix}${randomId}`;
    }

    static getLocalizedMessage(key, fallback) {
        try {
            if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
                const message = chrome.i18n.getMessage(key);
                if (message) return message;
            }
        } catch (_) {}
        return fallback;
    }

    static normalizeDeviceName(name, fallback = '') {
        const defaultName = DriveBackupManager.getLocalizedMessage('driveDefaultDeviceName', 'This device');
        const cleaned = String(name || '')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48)
            .trim();

        if (cleaned) return cleaned;

        const fallbackCleaned = String(fallback || defaultName)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 48)
            .trim();

        return fallbackCleaned || defaultName;
    }

    static normalizeDeviceProfile(profile = {}, fallbackName = 'This device') {
        const rawId = typeof profile.id === 'string'
            ? profile.id
            : (typeof profile.deviceId === 'string' ? profile.deviceId : '');
        const id = rawId.trim() || DriveBackupManager.createId('device_');
        const rawName = typeof profile.name === 'string'
            ? profile.name
            : (typeof profile.deviceName === 'string' ? profile.deviceName : '');

        return {
            id,
            name: DriveBackupManager.normalizeDeviceName(rawName, fallbackName),
            createdAt: typeof profile.createdAt === 'string' ? profile.createdAt : '',
            updatedAt: typeof profile.updatedAt === 'string' ? profile.updatedAt : ''
        };
    }

    static slugifyDeviceName(name) {
        return DriveBackupManager.normalizeDeviceName(name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'device';
    }

    static formatTimestampForFile(date = new Date()) {
        const pad = value => String(value).padStart(2, '0');
        return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate())
        ].join('') + '-' + [
            pad(date.getHours()),
            pad(date.getMinutes()),
            pad(date.getSeconds())
        ].join('');
    }

    static parseFileTimestamp(value) {
        const match = String(value || '').match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
        if (!match) return '';
        const [, year, month, day, hour, minute, second] = match;
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString();
    }

    getAvailabilityStatus() {
        const chromeAvailable = typeof chrome !== 'undefined';
        const storageAvailable = !!(chromeAvailable && chrome.storage?.local);
        const identityAvailable = !!(chromeAvailable && chrome.identity?.getAuthToken);
        const fetchAvailable = typeof fetch === 'function';
        const apiAvailable = storageAvailable && identityAvailable && fetchAvailable;
        const oauthConfigured = chromeAvailable ? this.hasConfiguredOAuthClient() : false;
        let reason = 'ready';

        if (!chromeAvailable) {
            reason = 'chromeUnavailable';
        } else if (!storageAvailable) {
            reason = 'storageUnavailable';
        } else if (!identityAvailable) {
            reason = 'identityUnavailable';
        } else if (!fetchAvailable) {
            reason = 'fetchUnavailable';
        } else if (!oauthConfigured) {
            reason = 'oauthMissing';
        }

        return {
            available: apiAvailable && oauthConfigured,
            apiAvailable,
            chromeAvailable,
            storageAvailable,
            identityAvailable,
            fetchAvailable,
            oauthConfigured,
            reason
        };
    }

    isAvailable() {
        return this.getAvailabilityStatus().apiAvailable;
    }

    hasConfiguredOAuthClient() {
        try {
            const clientId = chrome.runtime?.getManifest?.().oauth2?.client_id || '';
            return !!clientId && !/REPLACE|YOUR_EXTENSION_OAUTH_CLIENT_ID|^0+-0+\.apps\.googleusercontent\.com$/i.test(clientId);
        } catch (_) {
            return true;
        }
    }

    getDefaultDeviceName() {
        return DriveBackupManager.normalizeDeviceName('', DriveBackupManager.getLocalizedMessage('driveDefaultDeviceName', 'This device'));
    }

    async getRawState() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local) return {};
        const result = await chrome.storage.local.get([this.stateKey]);
        return result[this.stateKey] && typeof result[this.stateKey] === 'object'
            ? result[this.stateKey]
            : {};
    }

    normalizeState(state = {}) {
        const fallbackName = this.getDefaultDeviceName();
        const legacyDeviceId = typeof state.deviceId === 'string' && state.deviceId.trim()
            ? state.deviceId.trim()
            : DriveBackupManager.createId('device_');
        const legacyDeviceName = DriveBackupManager.normalizeDeviceName(state.deviceName, fallbackName);
        const profilesById = new Map();

        const addProfile = (profile, fallback = fallbackName) => {
            const normalized = DriveBackupManager.normalizeDeviceProfile(profile, fallback);
            const existing = profilesById.get(normalized.id);
            profilesById.set(normalized.id, {
                ...existing,
                ...normalized,
                name: normalized.name || existing?.name || fallbackName,
                createdAt: existing?.createdAt || normalized.createdAt,
                updatedAt: normalized.updatedAt || existing?.updatedAt || ''
            });
        };

        const rawProfiles = Array.isArray(state.knownDevices) ? state.knownDevices : [];
        rawProfiles.forEach(profile => addProfile(profile));
        addProfile({
            id: legacyDeviceId,
            name: legacyDeviceName,
            createdAt: typeof state.connectedAt === 'string' ? state.connectedAt : '',
            updatedAt: ''
        });

        const requestedActiveId = typeof state.activeDeviceId === 'string' && state.activeDeviceId.trim()
            ? state.activeDeviceId.trim()
            : legacyDeviceId;
        if (!profilesById.has(requestedActiveId)) {
            addProfile({ id: requestedActiveId, name: legacyDeviceName });
        }

        const activeProfile = profilesById.get(requestedActiveId) || profilesById.values().next().value;
        const knownDevices = Array.from(profilesById.values());

        return {
            deviceId: activeProfile.id,
            activeDeviceId: activeProfile.id,
            deviceName: activeProfile.name,
            knownDevices,
            connectedAt: typeof state.connectedAt === 'string' ? state.connectedAt : '',
            lastBackupAt: typeof state.lastBackupAt === 'string' ? state.lastBackupAt : '',
            lastRestoreAt: typeof state.lastRestoreAt === 'string' ? state.lastRestoreAt : '',
            lastError: typeof state.lastError === 'string' ? state.lastError.slice(0, 300) : ''
        };
    }

    async getState() {
        return this.normalizeState(await this.getRawState());
    }

    async updateState(update, { normalizeOnly = false } = {}) {
        const locks = typeof navigator !== 'undefined' && navigator.locks;
        if (!locks?.request) {
            const error = new Error(DriveBackupManager.getLocalizedMessage('driveStateLockUnavailable',
                'Safe computer-profile saving is unavailable. No Drive settings were changed.'));
            error.code = 'DRIVE_STATE_LOCK_UNAVAILABLE';
            throw error;
        }
        // Global provider metadata is shared by every Options instance. Never
        // hold this lock across network requests or another state operation.
        return locks.request('local-itab-drive-state-write', async () => {
            const raw = await this.getRawState();
            const current = this.normalizeState(raw);
            const next = this.normalizeState({ ...current, ...update(current) });
            if (!normalizeOnly || next.deviceId !== raw.deviceId || next.activeDeviceId !== raw.activeDeviceId ||
                next.deviceName !== raw.deviceName || JSON.stringify(next.knownDevices) !== JSON.stringify(Array.isArray(raw.knownDevices) ? raw.knownDevices : [])) {
                await chrome.storage.local.set({ [this.stateKey]: next });
            }
            return next;
        });
    }

    async ensureState() {
        return this.updateState(() => ({}), { normalizeOnly: true });
    }

    async saveState(partial) {
        const metadata = new Set(['connectedAt', 'lastBackupAt', 'lastRestoreAt', 'lastError']);
        if (!partial || typeof partial !== 'object' || Array.isArray(partial) ||
            Object.keys(partial).some(key => !metadata.has(key) || typeof partial[key] !== 'string')) {
            const error = new Error(DriveBackupManager.getLocalizedMessage('driveStatePatchInvalid',
                'Drive status updates cannot replace computer profiles. No Drive settings were changed.'));
            error.code = 'DRIVE_STATE_PATCH_INVALID';
            throw error;
        }
        // Detach the command before waiting for the cross-instance lock.
        const patch = JSON.parse(JSON.stringify(partial));
        return this.updateState(() => patch);
    }

    async setLastError(error) {
        const message = error ? (error.message || String(error)) : '';
        return this.saveState({ lastError: message });
    }

    async renameDevice(name, deviceId) {
        const nextName = DriveBackupManager.normalizeDeviceName(name);
        // Options supplies the displayed field's ID. Legacy callers capture
        // their original target, never carry an old profile list into the lock.
        const targetId = deviceId === undefined ? (await this.getState()).deviceId : String(deviceId || '').trim();
        return this.updateState(state => {
            if (!state.knownDevices.some(profile => profile.id === targetId)) {
                throw new Error('Computer profile was not found.');
            }
            const updatedAt = new Date().toISOString();
            const knownDevices = state.knownDevices.map(profile => profile.id === targetId
                ? { ...profile, name: nextName, updatedAt } : profile);
            // A newer selection is independent of renaming the reviewed ID.
            return { knownDevices, ...(state.deviceId === targetId ? {deviceName: nextName} : {}), lastError: '' };
        });
    }

    async addDevice(name) {
        const nextName = DriveBackupManager.normalizeDeviceName(name);
        let deviceCreated = false;
        const saved = await this.updateState(state => {
            const existing = state.knownDevices.find(profile => profile.name.toLocaleLowerCase() === nextName.toLocaleLowerCase());
            const now = new Date().toISOString();
            const profile = existing || { id: DriveBackupManager.createId('device_'), name: nextName, createdAt: now, updatedAt: now };
            deviceCreated = !existing;
            return {
                deviceId: profile.id, activeDeviceId: profile.id, deviceName: profile.name,
                knownDevices: existing ? state.knownDevices : [...state.knownDevices, profile], lastError: ''
            };
        });
        return { ...saved, deviceCreated };
    }

    async selectDevice(deviceId) {
        const nextId = String(deviceId || '').trim();
        return this.updateState(state => {
            const profile = state.knownDevices.find(item => item.id === nextId);
            if (!profile) throw new Error('Computer profile was not found.');
            return { deviceId: profile.id, activeDeviceId: profile.id, deviceName: profile.name, lastError: '' };
        });
    }

    async connect(options = {}) {
        this.assertAvailable();
        await this.getAuthToken({ interactive: options.interactive === true });
        return this.saveState({
            connectedAt: new Date().toISOString(),
            lastError: ''
        });
    }

    assertAvailable() {
        const availability = this.getAvailabilityStatus();
        if (!availability.apiAvailable) {
            if (availability.reason === 'identityUnavailable') {
                throw new Error('Chrome Identity API is unavailable. Reload the extension after updating manifest permissions.');
            }
            if (availability.reason === 'storageUnavailable') {
                throw new Error('Chrome local storage is unavailable.');
            }
            if (availability.reason === 'fetchUnavailable') {
                throw new Error('Network requests are unavailable in this context.');
            }
            throw new Error('Google Drive backup is available only inside Chrome with the Identity API.');
        }
        if (!availability.oauthConfigured) {
            throw new Error('Google Drive OAuth client ID is not configured in manifest.json.');
        }
    }

    async getAuthToken(options = {}) {
        this.assertAvailable();
        const result = await chrome.identity.getAuthToken({
            interactive: options.interactive === true,
            scopes: [this.scope]
        });
        const token = typeof result === 'string' ? result : result?.token;
        if (!token) {
            throw new Error('Google Drive authorization did not return an access token.');
        }
        return token;
    }

    async removeCachedAuthToken(token) {
        if (!token || typeof chrome === 'undefined' || !chrome.identity?.removeCachedAuthToken) return;
        await chrome.identity.removeCachedAuthToken({ token });
    }

    async authorizedFetch(url, init = {}, options = {}) {
        let token = await this.getAuthToken({ interactive: options.interactive === true });
        let response = await fetch(url, this.withAuthHeaders(init, token));

        if (response.status === 401 && options.retry !== false) {
            await this.removeCachedAuthToken(token);
            token = await this.getAuthToken({ interactive: options.interactive === true });
            response = await fetch(url, this.withAuthHeaders(init, token));
        }

        return response;
    }

    withAuthHeaders(init, token) {
        const headers = new Headers(init.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        return { ...init, headers };
    }

    async driveRequest(pathOrUrl, init = {}, options = {}) {
        const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${this.driveApiBase}${pathOrUrl}`;
        const response = await this.authorizedFetch(url, init, options);
        if (response.ok) return response;

        let detail = '';
        try {
            const body = await response.json();
            detail = body?.error?.message || body?.message || '';
        } catch (_) {
            try {
                detail = await response.text();
            } catch (_) {}
        }

        throw new Error(detail || `Google Drive request failed (${response.status})`);
    }

    async createSnapshotDraft(options = {}) {
        if (!this.storageManager) {
            throw new Error('Storage manager is not available.');
        }

        const state = await this.ensureState();
        const config = await this.storageManager.getAllForBackup();
        const createdAtDate = new Date();
        const createdAt = createdAtDate.toISOString();
        const snapshotId = DriveBackupManager.createId('snapshot_');
        const deviceSlug = DriveBackupManager.slugifyDeviceName(state.deviceName);
        const timestamp = DriveBackupManager.formatTimestampForFile(createdAtDate);
        const fileName = `local-itab-backup.${deviceSlug}.${timestamp}.${snapshotId}.json`;
        const payload = this.storageManager.buildDriveBackupPayload(config, {
            createdAt,
            snapshotId,
            deviceId: state.deviceId,
            deviceName: state.deviceName,
            reason: options.reason || 'manual'
        });
        const json = JSON.stringify(payload, null, 2);
        const sizeBytes = this.storageManager.getUtf8ByteLength(json);
        const metadata = this.createDriveFileMetadata(fileName, state, snapshotId, payload);

        return {
            state,
            fileName,
            payload,
            json,
            sizeBytes,
            metadata,
            snapshotId,
            createdAt
        };
    }

    createDriveFileMetadata(fileName, state, snapshotId, payload) {
        const counts = payload.itemCounts || {};
        return {
            name: fileName,
            parents: ['appDataFolder'],
            mimeType: this.mimeType,
            appProperties: {
                app: 'local-itab',
                type: 'backupSnapshot',
                schemaVersion: String(payload.schemaVersion || 1),
                deviceId: state.deviceId,
                deviceName: state.deviceName,
                snapshotId,
                createdAt: payload.createdAt || '',
                shortcutCount: String(counts.shortcuts || 0),
                localImagesIncluded: counts.localImagesIncluded ? 'true' : 'false',
                dataUrlIcons: String(counts.dataUrlIcons || 0)
            }
        };
    }

    async uploadSnapshotDraft(draft, options = {}) {
        if (this._uploadInProgress) {
            throw new Error('A Google Drive backup is already in progress.');
        }

        this._uploadInProgress = true;
        try {
            this.assertAvailable();
            if (!draft || typeof draft.json !== 'string') {
                throw new Error('Backup snapshot is empty.');
            }
            if (draft.sizeBytes > this.maximumSizeBytes) {
                throw new Error(`Backup is too large (${this.formatBytes(draft.sizeBytes)}). Reduce local images or use manual export.`);
            }

            // Upload and retention belong to this reviewed snapshot, not a computer
            // another tab may select while the network request is pending.
            const uploadDraft = { ...draft, metadata: JSON.parse(JSON.stringify(draft.metadata || {})) };
            const props = uploadDraft.metadata.appProperties;
            const owner = props?.app === 'local-itab' && props.type === 'backupSnapshot' &&
                typeof props.deviceId === 'string' && props.deviceId.trim() && props.deviceId === draft.state?.deviceId &&
                typeof props.snapshotId === 'string' && props.snapshotId.trim() && props.snapshotId === draft.snapshotId
                ? { deviceId: props.deviceId, snapshotId: props.snapshotId } : null;
            const uploaded = uploadDraft.sizeBytes > this.warningSizeBytes
                ? await this.uploadResumable(uploadDraft, options)
                : await this.uploadMultipart(uploadDraft, options);

            let state = await this.saveState({
                lastBackupAt: uploadDraft.createdAt || new Date().toISOString(),
                lastError: ''
            });
            let pruneError = null;

            if (options.prune !== false) {
                try {
                    const acknowledged = uploaded?.appProperties;
                    if (!owner || typeof uploaded?.id !== 'string' || !uploaded.id.trim() ||
                        acknowledged?.app !== 'local-itab' || acknowledged.type !== 'backupSnapshot' ||
                        acknowledged.deviceId !== owner.deviceId || acknowledged.snapshotId !== owner.snapshotId) {
                        throw new Error('Snapshot ownership could not be verified; cleanup was not run and older snapshots were kept.');
                    }
                    await this.pruneSnapshotsForDevice(owner.deviceId, this.retentionLimit, options, uploaded.id);
                } catch (error) {
                    pruneError = error;
                    state = await this.saveState({
                        lastError: `Backup created, but old snapshot cleanup failed: ${error.message || String(error)}`
                    });
                }
            }
            return { ...uploaded, state, pruneError };
        } finally {
            this._uploadInProgress = false;
        }
    }

    async uploadMultipart(draft, options = {}) {
        const boundary = `local_itab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const body = new Blob([
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            JSON.stringify(draft.metadata),
            `\r\n--${boundary}\r\n`,
            'Content-Type: application/json\r\n\r\n',
            draft.json,
            `\r\n--${boundary}--`
        ], { type: `multipart/related; boundary=${boundary}` });

        const response = await this.driveRequest(
            `${this.driveUploadBase}/files?uploadType=multipart&fields=${encodeURIComponent('id,name,size,createdTime,appProperties')}`,
            {
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body
            },
            {
                ...options,
                interactive: options.interactive === true,
                upload: true
            }
        );

        return response.json();
    }

    async uploadResumable(draft, options = {}) {
        const initResponse = await this.driveRequest(
            `${this.driveUploadBase}/files?uploadType=resumable&fields=${encodeURIComponent('id,name,size,createdTime,appProperties')}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': this.mimeType,
                    'X-Upload-Content-Length': String(draft.sizeBytes)
                },
                body: JSON.stringify(draft.metadata)
            },
            {
                ...options,
                interactive: options.interactive === true
            }
        );

        const sessionUrl = initResponse.headers.get('Location');
        if (!sessionUrl) {
            throw new Error('Google Drive did not provide a resumable upload URL.');
        }

        const uploadResponse = await this.driveRequest(
            sessionUrl,
            {
                method: 'PUT',
                headers: { 'Content-Type': this.mimeType },
                body: draft.json
            },
            {
                ...options,
                interactive: options.interactive === true
            }
        );

        return uploadResponse.json();
    }

    getSnapshotQuery() {
        return [
            "appProperties has { key='app' and value='local-itab' }",
            "appProperties has { key='type' and value='backupSnapshot' }",
            'trashed = false'
        ].join(' and ');
    }

    async listSnapshots(options = {}) {
        this.assertAvailable();
        const snapshots = [];
        let pageToken = '';
        const fields = 'nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,appProperties)';

        do {
            const params = new URLSearchParams({
                spaces: 'appDataFolder',
                pageSize: '100',
                fields,
                q: this.getSnapshotQuery()
            });
            if (pageToken) params.set('pageToken', pageToken);

            const response = await this.driveRequest(`/files?${params.toString()}`, {}, {
                ...options,
                interactive: options.interactive === true
            });
            const data = await response.json();
            const files = Array.isArray(data.files) ? data.files : [];
            files.forEach(file => snapshots.push(this.parseSnapshotFile(file)));
            pageToken = data.nextPageToken || '';
        } while (pageToken);

        return snapshots
            .filter(snapshot => snapshot.id)
            .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0));
    }

    parseSnapshotFile(file = {}) {
        const props = file.appProperties && typeof file.appProperties === 'object'
            ? file.appProperties
            : {};
        const name = typeof file.name === 'string' ? file.name : '';
        const nameParts = name.split('.');
        const timestampFromName = DriveBackupManager.parseFileTimestamp(name);
        const createdTime = props.createdAt || file.createdTime || timestampFromName || '';
        const parsedSnapshotId = props.snapshotId || (nameParts.length >= 5 ? nameParts[nameParts.length - 2] : '');
        const deviceName = DriveBackupManager.normalizeDeviceName(props.deviceName || this.deviceNameFromFileName(name), 'Unknown device');
        const schemaVersion = Number.parseInt(props.schemaVersion, 10);
        const shortcutCount = Number.parseInt(props.shortcutCount, 10);
        const dataUrlIcons = Number.parseInt(props.dataUrlIcons, 10);

        return {
            id: typeof file.id === 'string' ? file.id : '',
            name,
            mimeType: file.mimeType || this.mimeType,
            size: Number.parseInt(file.size, 10) || 0,
            createdTime,
            modifiedTime: file.modifiedTime || '',
            deviceId: typeof props.deviceId === 'string' && props.deviceId ? props.deviceId : 'unknown',
            deviceName,
            snapshotId: parsedSnapshotId || '',
            schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : 0,
            shortcutCount: Number.isFinite(shortcutCount) ? shortcutCount : 0,
            localImagesIncluded: props.localImagesIncluded === 'true',
            dataUrlIcons: Number.isFinite(dataUrlIcons) ? dataUrlIcons : 0,
            isMalformed: !props.app || props.app !== 'local-itab' || !parsedSnapshotId
        };
    }

    deviceNameFromFileName(fileName) {
        const match = String(fileName || '').match(/^local-itab-backup\.([^.]+)\./);
        if (!match) return '';
        return match[1].replace(/-/g, ' ');
    }

    groupSnapshotsByDevice(snapshots = [], knownDevices = []) {
        const groups = new Map();
        const profileOrder = new Map();
        const profiles = Array.isArray(knownDevices) ? knownDevices : [];

        const ensureGroup = (deviceId, deviceName, fromProfile = false) => {
            const key = deviceId || 'unknown';
            if (!groups.has(key)) {
                groups.set(key, {
                    deviceId: key,
                    deviceName: deviceName || 'Unknown device',
                    snapshots: [],
                    fromProfile,
                    order: profileOrder.has(key) ? profileOrder.get(key) : Number.MAX_SAFE_INTEGER
                });
            }
            const group = groups.get(key);
            if (fromProfile) {
                group.fromProfile = true;
                group.deviceName = deviceName || group.deviceName;
            } else if (!group.fromProfile && deviceName) {
                group.deviceName = deviceName;
            }
            return group;
        };

        profiles.forEach((profile, index) => {
            const normalized = DriveBackupManager.normalizeDeviceProfile(profile);
            profileOrder.set(normalized.id, index);
            ensureGroup(normalized.id, normalized.name, true);
        });

        snapshots.forEach(snapshot => {
            const key = snapshot.deviceId || 'unknown';
            const group = ensureGroup(key, snapshot.deviceName || 'Unknown device');
            group.snapshots.push(snapshot);
        });

        return Array.from(groups.values()).map(group => ({
            ...group,
            snapshots: group.snapshots.sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0)),
            deviceName: group.fromProfile ? group.deviceName : (group.snapshots[0]?.deviceName || group.deviceName || 'Unknown device')
        })).sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            const aLatest = new Date(a.snapshots[0]?.createdTime || 0).getTime();
            const bLatest = new Date(b.snapshots[0]?.createdTime || 0).getTime();
            return bLatest - aLatest;
        });
    }

    selectPrunableSnapshots(snapshots = [], deviceId, limit = this.retentionLimit) {
        const numericLimit = Number.isFinite(limit) ? Math.max(0, limit) : this.retentionLimit;
        return snapshots
            .filter(snapshot => snapshot.deviceId === deviceId)
            .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0))
            .slice(numericLimit);
    }

    async pruneSnapshotsForDevice(deviceId, limit = this.retentionLimit, options = {}, uploadedFileId = '') {
        const snapshots = await this.listSnapshots(options);
        const prunable = this.selectPrunableSnapshots(snapshots, deviceId, limit);
        // Client-created timestamps can be ahead of this device's clock. Never
        // acknowledge a successful backup and immediately delete that same file.
        // Reject the whole plan before any deletion; do not substitute other copies.
        if (uploadedFileId && prunable.some(snapshot => snapshot.id === uploadedFileId)) {
            throw new Error(DriveBackupManager.getLocalizedMessage('driveRetentionCurrentSnapshot',
                'Cleanup was skipped because the snapshot order would remove the backup just uploaded. All previous copies were kept.'));
        }
        for (const snapshot of prunable) {
            await this.deleteSnapshot(snapshot.id, options);
        }
        return prunable;
    }

    async downloadSnapshotPayload(fileId, options = {}) {
        if (!fileId) throw new Error('No backup snapshot selected.');
        const response = await this.driveRequest(`/files/${encodeURIComponent(fileId)}?alt=media`, {}, {
            ...options,
            interactive: options.interactive === true
        });
        return response.json();
    }

    async deleteSnapshot(fileId, options = {}) {
        if (!fileId) throw new Error('No backup snapshot selected.');
        await this.driveRequest(`/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' }, {
            ...options,
            interactive: options.interactive === true
        });
        return true;
    }

    async deleteSnapshotAndList(fileId, options = {}) {
        await this.deleteSnapshot(fileId, options);
        try {
            return {
                deleted: true,
                snapshots: await this.listSnapshots(options),
                listError: null
            };
        } catch (error) {
            await this.setLastError(new Error(`Backup deleted, but list refresh failed: ${error.message || String(error)}`));
            return {
                deleted: true,
                snapshots: null,
                listError: error
            };
        }
    }

    async markRestored() {
        return this.saveState({
            lastRestoreAt: new Date().toISOString(),
            lastError: ''
        });
    }

    formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
        if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DriveBackupManager;
} else {
    window.DriveBackupManager = DriveBackupManager;
    window.driveBackupManager = new DriveBackupManager(window.storageManager);
}
