// Options page JavaScript - with storage management
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Local iTab options page loaded');
    
    try {
        // Initialize options page with stored data
        await initializeOptionsPage();
        
        // Set up event listeners
        setupEventListeners();
        
        // Display storage usage info
        await displayStorageInfo();

        // Apply i18n to DOM
        if (window.i18n) {
            window.i18n.localizeDocument(document);
        }
    } catch (error) {
        console.error('Error initializing options page:', error);
        showErrorMessage('Failed to load settings. Please try refreshing the page.');
    }
});

async function initializeOptionsPage() {
    try {
        // Load all configuration data from storage
        const config = await storageManager.getAll();
        
        // Populate form fields with current values
        await populateFormFields(config);
        setupCategoryManagement(config.categories);

        console.log('Options page initialized with config:', config);
    } catch (error) {
        console.error('Error in initializeOptionsPage:', error);
        throw error;
    }
}

async function populateFormFields(config) {
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
        bgTypeSelect.value = config.bg.type;
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
    const showShortcutsCheckbox = document.getElementById('show-shortcuts');
    
    if (showClockCheckbox) showClockCheckbox.checked = config.show.clock;
    if (showShortcutsCheckbox) showShortcutsCheckbox.checked = config.show.shortcuts;
    

    

    
    // Quote setting
    const quoteInput = document.getElementById('quote-text');
    if (quoteInput) quoteInput.value = config.quote;
}

function setupCategoryManagement(categories = []) {
    const list = document.getElementById('category-manage-list');
    const addBtn = document.getElementById('add-category');
    if (!list || !addBtn) return;

    const createItem = (cat) => {
        const li = document.createElement('li');
        li.className = 'category-manage-item';
        li.dataset.id = cat.id;
        li.innerHTML = `
            <input type="text" class="form-input cat-icon" value="${cat.icon}" aria-label="icon">
            <input type="text" class="form-input cat-name" value="${cat.name}" aria-label="name">
            <div class="category-actions">
                <button type="button" class="btn btn-secondary btn-sm cat-up" title="上移">↑</button>
                <button type="button" class="btn btn-secondary btn-sm cat-down" title="下移">↓</button>
                <button type="button" class="btn btn-danger btn-sm cat-delete" title="删除">✕</button>
            </div>`;
        return li;
    };

    const render = (cats) => {
        list.innerHTML = '';
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
            const titleInput = topicList.querySelector('.topic-title');
            const scoreInput = topicList.querySelector('.topic-score');
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
            showMessage('Settings saved successfully!', 'success');
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
    
    // Clock settings
    const hour12 = document.getElementById('hour12-format')?.checked || false;
    const showSeconds = document.getElementById('show-seconds')?.checked || true;
    settings.clock = { hour12, showSeconds };
    

    
    // Background settings
    const bgType = document.getElementById('bg-type')?.value || 'gradient';
    const bgColor = document.getElementById('bg-color')?.value || '';
    
    let bgValue = '';
    if (bgType === 'color') {
        bgValue = bgColor;
    } else if (bgType === 'image') {
        bgValue = existingConfig.bg.value; // Keep existing image
    } else if (bgType === 'api') {
        bgValue = 'https://api.paugram.com/wallpaper/'; // API endpoint
    }
    
    settings.bg = { type: bgType, value: bgValue };

    // Visibility settings
    const showClock = document.getElementById('show-clock')?.checked !== false;
    const showShortcuts = document.getElementById('show-shortcuts')?.checked !== false;
    settings.show = { clock: showClock, shortcuts: showShortcuts };

    // Category settings
    settings.categories = getCategoriesFromDOM();


    
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
        
        showImportExportFeedback('export', 'success', 'Settings exported successfully', details);
        
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
            
            showImportExportFeedback('import', 'success', 'Settings imported successfully! Reloading page...', details);
            
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
        showMessage('Background image uploaded successfully!', 'success');
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
        showMessage('Movie poster uploaded successfully!', 'success');
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
            storageInfoElement.innerHTML = `
                <div>Storage Used: ${(info.bytesInUse / 1024).toFixed(1)} KB / ${(info.quota / 1024 / 1024).toFixed(1)} MB (${info.percentUsed}%)</div>
                <div>Available: ${(info.available / 1024).toFixed(1)} KB</div>
            `;
        }
    } catch (error) {
        console.error('Error displaying storage info:', error);
    }
}

function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    
    const colors = {
        success: '#4CAF50',
        error: '#f44336',
        info: '#2196F3'
    };
    
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(messageDiv);
    
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

/**
 * Save background settings immediately
 */
async function saveBackgroundSettings() {
    try {
        const bgType = document.getElementById('bg-type')?.value || 'gradient';
        const bgColor = document.getElementById('bg-color')?.value || '';
        const existingConfig = await storageManager.getAll();
        
        let bgValue = '';
        if (bgType === 'color') {
            bgValue = bgColor;
        } else if (bgType === 'image') {
            bgValue = existingConfig.bg.value; // Keep existing image
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
            
            showMessage('Background image removed successfully!', 'success');
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
            listElement.innerHTML = '';
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
    topicElement.innerHTML = `
        <div class="topic-content">
            <span class="topic-title">${escapeHtml(title)}</span>
            <span class="topic-score">${score}</span>
        </div>
        <div class="topic-actions">
            <button type="button" class="btn btn-sm btn-secondary edit-topic-btn" data-index="${index}">Edit</button>
            <button type="button" class="btn btn-sm btn-danger delete-topic-btn" data-index="${index}">Delete</button>
        </div>
    `;
    
    // Add event listeners for edit and delete buttons
    const editBtn = topicElement.querySelector('.edit-topic-btn');
    const deleteBtn = topicElement.querySelector('.delete-topic-btn');
    
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
        showMessage('Please enter a topic title', 'error');
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
        showMessage('Topic added successfully!', 'success');
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
            showMessage('Topic updated successfully!', 'success');
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
        showMessage('Topic deleted successfully!', 'success');
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
            
            showMessage('Movie poster removed successfully!', 'success');
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
        'show-clock', 'show-shortcuts',
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

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}