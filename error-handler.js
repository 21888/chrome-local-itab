/**
 * Error Handler for Local iTab Extension
 * Provides centralized error handling and user feedback
 */

class ErrorHandler {
    constructor() {
        this.messageContainer = null;
        this.messageQueue = [];
        this.isInitialized = false;
        
        // Error types and their default messages
        this.errorTypes = {
            VALIDATION: 'Validation Error',
            STORAGE: 'Storage Error', 
            NETWORK: 'Network Error',
            FILE: 'File Error',
            PERMISSION: 'Permission Error',
            QUOTA: 'Storage Quota Error',
            CORRUPTION: 'Data Corruption Error',
            UNKNOWN: 'Unknown Error'
        };

        // User-friendly error messages
        this.friendlyMessages = {
            STORAGE_QUOTA_EXCEEDED: 'Storage is full. Please remove some data or export your settings.',
            STORAGE_ACCESS_DENIED: 'Unable to access storage. Please check browser permissions.',
            FILE_TOO_LARGE: 'File is too large. Please select a smaller file.',
            FILE_INVALID_TYPE: 'Invalid file type. Please select a supported file format.',
            FILE_CORRUPTED: 'File appears to be corrupted. Please try a different file.',
            NETWORK_OFFLINE: 'You appear to be offline. Please check your internet connection.',
            VALIDATION_REQUIRED: 'This field is required.',
            VALIDATION_INVALID_FORMAT: 'Please enter a valid format.',
            DATA_CORRUPTED: 'Some data was corrupted and has been reset to defaults.',
            PERMISSION_DENIED: 'Permission denied. Please check browser settings.',
            IMPORT_INVALID_FORMAT: 'Invalid import file format. Please select a valid settings file.',
            EXPORT_FAILED: 'Failed to export settings. Please try again.',
            SAVE_FAILED: 'Failed to save settings. Please try again.'
        };
    }

    /**
     * Initialize the error handler
     */
    init() {
        if (this.isInitialized) return;
        
        this.createMessageContainer();
        this.setupGlobalErrorHandlers();
        this.isInitialized = true;
    }

    /**
     * Create message container for displaying notifications
     */
    createMessageContainer() {
        // Check if container already exists
        this.messageContainer = document.getElementById('error-message-container');
        
        if (!this.messageContainer) {
            this.messageContainer = document.createElement('div');
            this.messageContainer.id = 'error-message-container';
            this.messageContainer.className = 'message-container';
            this.messageContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                max-width: 400px;
                pointer-events: none;
            `;
            document.body.appendChild(this.messageContainer);
        }
    }

    /**
     * Setup global error handlers
     */
    setupGlobalErrorHandlers() {
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.handleError(event.reason, 'UNKNOWN', 'An unexpected error occurred');
        });

        // Handle global JavaScript errors
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            this.handleError(event.error, 'UNKNOWN', 'An unexpected error occurred');
        });
    }

    /**
     * Handle and display error with user-friendly message
     * @param {Error|string} error - Error object or message
     * @param {string} type - Error type
     * @param {string} userMessage - User-friendly message
     * @param {Object} options - Additional options
     */
    handleError(error, type = 'UNKNOWN', userMessage = null, options = {}) {
        const {
            showToUser = true,
            logToConsole = true,
            duration = 5000,
            actions = []
        } = options;

        // Log to console
        if (logToConsole) {
            console.error(`[${type}]`, error);
        }

        // Determine user message
        let displayMessage = userMessage;
        if (!displayMessage) {
            displayMessage = this.getFriendlyMessage(error, type);
        }

        // Show to user if requested
        if (showToUser) {
            this.showMessage(displayMessage, 'error', { duration, actions });
        }

        // Return error info for further handling
        return {
            type,
            message: displayMessage,
            originalError: error,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get user-friendly error message
     * @param {Error|string} error - Error object or message
     * @param {string} type - Error type
     * @returns {string} - User-friendly message
     */
    getFriendlyMessage(error, type) {
        const errorMessage = typeof error === 'string' ? error : error?.message || '';
        
        // Check for specific error patterns
        if (errorMessage.includes('QUOTA_EXCEEDED') || errorMessage.includes('quota')) {
            return this.friendlyMessages.STORAGE_QUOTA_EXCEEDED;
        }
        
        if (errorMessage.includes('access denied') || errorMessage.includes('permission')) {
            return this.friendlyMessages.PERMISSION_DENIED;
        }
        
        if (errorMessage.includes('network') || errorMessage.includes('offline')) {
            return this.friendlyMessages.NETWORK_OFFLINE;
        }
        
        if (errorMessage.includes('file') && errorMessage.includes('large')) {
            return this.friendlyMessages.FILE_TOO_LARGE;
        }
        
        if (errorMessage.includes('invalid') && errorMessage.includes('type')) {
            return this.friendlyMessages.FILE_INVALID_TYPE;
        }
        
        if (errorMessage.includes('corrupted') || errorMessage.includes('corrupt')) {
            return this.friendlyMessages.FILE_CORRUPTED;
        }
        
        if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
            return this.friendlyMessages.IMPORT_INVALID_FORMAT;
        }

        // Default messages by type
        switch (type) {
            case 'STORAGE':
                return 'Unable to save data. Please try again.';
            case 'VALIDATION':
                return 'Please check your input and try again.';
            case 'FILE':
                return 'There was a problem with the selected file.';
            case 'NETWORK':
                return 'Network error. Please check your connection.';
            case 'QUOTA':
                return this.friendlyMessages.STORAGE_QUOTA_EXCEEDED;
            case 'CORRUPTION':
                return this.friendlyMessages.DATA_CORRUPTED;
            default:
                return 'An unexpected error occurred. Please try again.';
        }
    }

    /**
     * Show success message
     * @param {string} message - Success message
     * @param {Object} options - Display options
     */
    showSuccess(message, options = {}) {
        this.showMessage(message, 'success', options);
    }

    /**
     * Show info message
     * @param {string} message - Info message
     * @param {Object} options - Display options
     */
    showInfo(message, options = {}) {
        this.showMessage(message, 'info', options);
    }

    /**
     * Show warning message
     * @param {string} message - Warning message
     * @param {Object} options - Display options
     */
    showWarning(message, options = {}) {
        this.showMessage(message, 'warning', options);
    }

    /**
     * Show message to user
     * @param {string} message - Message to display
     * @param {string} type - Message type (success, error, info, warning)
     * @param {Object} options - Display options
     */
    showMessage(message, type = 'info', options = {}) {
        if (!this.isInitialized) {
            this.init();
        }

        const {
            duration = type === 'error' ? 7000 : 4000,
            actions = [],
            persistent = false
        } = options;

        const messageElement = this.createMessageElement(message, type, actions, persistent);
        
        // Add to container
        this.messageContainer.appendChild(messageElement);
        
        // Animate in
        requestAnimationFrame(() => {
            messageElement.classList.add('show');
        });

        // Auto-remove if not persistent
        if (!persistent && duration > 0) {
            setTimeout(() => {
                this.removeMessage(messageElement);
            }, duration);
        }

        return messageElement;
    }

    /**
     * Create message element
     * @param {string} message - Message text
     * @param {string} type - Message type
     * @param {Array} actions - Action buttons
     * @param {boolean} persistent - Whether message persists
     * @returns {HTMLElement} - Message element
     */
    createMessageElement(message, type, actions, persistent) {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.style.cssText = `
            background: ${this.getTypeColor(type)};
            color: white;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            pointer-events: auto;
            transform: translateX(100%);
            transition: transform 0.3s ease, opacity 0.3s ease;
            opacity: 0;
            max-width: 100%;
            word-wrap: break-word;
        `;

        // Message content
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 8px;
        `;

        // Icon
        const iconEl = document.createElement('div');
        iconEl.className = 'message-icon';
        iconEl.innerHTML = this.getTypeIcon(type);
        iconEl.style.cssText = `
            flex-shrink: 0;
            margin-top: 1px;
        `;

        // Text
        const textEl = document.createElement('div');
        textEl.className = 'message-text';
        textEl.textContent = message;
        textEl.style.cssText = `
            flex: 1;
        `;

        contentEl.appendChild(iconEl);
        contentEl.appendChild(textEl);
        messageEl.appendChild(contentEl);

        // Actions
        if (actions.length > 0 || persistent) {
            const actionsEl = document.createElement('div');
            actionsEl.className = 'message-actions';
            actionsEl.style.cssText = `
                margin-top: 8px;
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            `;

            // Add custom actions
            actions.forEach(action => {
                const actionBtn = document.createElement('button');
                actionBtn.textContent = action.text;
                actionBtn.className = 'message-action-btn';
                actionBtn.style.cssText = `
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 0.2s ease;
                `;
                
                actionBtn.addEventListener('click', () => {
                    if (action.handler) {
                        action.handler();
                    }
                    if (action.dismissOnClick !== false) {
                        this.removeMessage(messageEl);
                    }
                });

                actionBtn.addEventListener('mouseenter', () => {
                    actionBtn.style.background = 'rgba(255,255,255,0.3)';
                });

                actionBtn.addEventListener('mouseleave', () => {
                    actionBtn.style.background = 'rgba(255,255,255,0.2)';
                });

                actionsEl.appendChild(actionBtn);
            });

            // Add close button for persistent messages
            if (persistent) {
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '×';
                closeBtn.className = 'message-close-btn';
                closeBtn.style.cssText = `
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s ease;
                    line-height: 1;
                `;

                closeBtn.addEventListener('click', () => {
                    this.removeMessage(messageEl);
                });

                actionsEl.appendChild(closeBtn);
            }

            messageEl.appendChild(actionsEl);
        }

        // Add show class for animation
        messageEl.classList.add('message-enter');

        return messageEl;
    }

    /**
     * Remove message element
     * @param {HTMLElement} messageElement - Message element to remove
     */
    removeMessage(messageElement) {
        if (!messageElement || !messageElement.parentNode) return;

        messageElement.style.transform = 'translateX(100%)';
        messageElement.style.opacity = '0';

        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 300);
    }

    /**
     * Get color for message type
     * @param {string} type - Message type
     * @returns {string} - CSS color
     */
    getTypeColor(type) {
        const colors = {
            success: '#4CAF50',
            error: '#f44336', 
            warning: '#ff9800',
            info: '#2196F3'
        };
        return colors[type] || colors.info;
    }

    /**
     * Get icon for message type
     * @param {string} type - Message type
     * @returns {string} - Icon HTML
     */
    getTypeIcon(type) {
        const icons = {
            success: '✓',
            error: '⚠',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    /**
     * Clear all messages
     */
    clearMessages() {
        if (this.messageContainer) {
            this.messageContainer.innerHTML = '';
        }
    }

    /**
     * Handle storage errors specifically
     * @param {Error} error - Storage error
     * @param {string} operation - Operation that failed
     */
    handleStorageError(error, operation = 'storage operation') {
        let type = 'STORAGE';
        let message = `Failed to ${operation}`;

        if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
            type = 'QUOTA';
            message = this.friendlyMessages.STORAGE_QUOTA_EXCEEDED;
        } else if (error.message && error.message.includes('access denied')) {
            type = 'PERMISSION';
            message = this.friendlyMessages.STORAGE_ACCESS_DENIED;
        }

        return this.handleError(error, type, message);
    }

    /**
     * Handle validation errors
     * @param {Array|Object} errors - Validation errors
     * @param {string} context - Context where validation failed
     */
    handleValidationErrors(errors, context = 'form') {
        if (Array.isArray(errors)) {
            errors.forEach(error => {
                this.showMessage(`${error.field}: ${error.message}`, 'error', { duration: 6000 });
            });
        } else if (errors.message) {
            this.showMessage(errors.message, 'error', { duration: 6000 });
        } else {
            this.showMessage('Please check your input and try again', 'error');
        }
    }

    /**
     * Handle file upload errors
     * @param {Error} error - File error
     * @param {string} fileName - Name of file that failed
     */
    handleFileError(error, fileName = 'file') {
        const message = `Failed to process ${fileName}: ${this.getFriendlyMessage(error, 'FILE')}`;
        return this.handleError(error, 'FILE', message);
    }

    /**
     * Show data recovery notification
     * @param {Array} recoveredFields - Fields that were recovered
     */
    showDataRecovery(recoveredFields) {
        const fieldList = recoveredFields.join(', ');
        const message = `Some data was corrupted and has been reset: ${fieldList}`;
        
        this.showMessage(message, 'warning', {
            duration: 8000,
            actions: [{
                text: 'OK',
                handler: () => {}
            }]
        });
    }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => errorHandler.init());
} else {
    errorHandler.init();
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ErrorHandler;
} else {
    window.ErrorHandler = ErrorHandler;
    window.errorHandler = errorHandler;
}