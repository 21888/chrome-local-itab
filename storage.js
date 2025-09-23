/**
 * Storage Manager for Local iTab Extension
 * Handles all chrome.storage.local operations with error handling and validation
 */

class StorageManager {
    constructor() {
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
            show: {
                clock: true,
                search: true,
                shortcuts: true
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
            // Validate the data before storing
            const validatedValue = this.validateData(key, value);
            
            await chrome.storage.local.set({ [key]: validatedValue });
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
            const result = await chrome.storage.local.get(null);
            
            // Merge with defaults for any missing keys
            const completeConfig = { ...this.defaultConfig };
            
            for (const [key, value] of Object.entries(result)) {
                if (this.defaultConfig.hasOwnProperty(key)) {
                    completeConfig[key] = value;
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
    async setAll(data) {
        try {
            const validatedData = {};
            
            // Validate each key-value pair
            for (const [key, value] of Object.entries(data)) {
                validatedData[key] = this.validateData(key, value);
            }
            
            await chrome.storage.local.set(validatedData);
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
            await chrome.storage.local.clear();
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
            
            return {
                bytesInUse,
                quota,
                percentUsed: Math.round((bytesInUse / quota) * 100),
                available: quota - bytesInUse
            };
        } catch (error) {
            console.error('Storage info error:', error);
            return {
                bytesInUse: 0,
                quota: 5242880,
                percentUsed: 0,
                available: 5242880
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
        const custom = typeof value.custom === 'string' ? value.custom : this.defaultConfig.search.custom;
        
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
        const bgValue = typeof value.value === 'string' ? value.value : this.defaultConfig.bg.value;
        
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
            shortcuts: typeof value.shortcuts === 'boolean' ? value.shortcuts : this.defaultConfig.show.shortcuts
        };
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
            
            return {
                title: typeof link.title === 'string' ? link.title.trim() : '',
                url: typeof link.url === 'string' ? link.url.trim() : '',
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
        
        return {
            title: typeof value.title === 'string' ? value.title : this.defaultConfig.movie.title,
            note: typeof value.note === 'string' ? value.note : this.defaultConfig.movie.note,
            poster: typeof value.poster === 'string' ? value.poster : this.defaultConfig.movie.poster
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