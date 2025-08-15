/**
 * Generate Local iTab Extension Icons
 * Creates PNG icons in different sizes with embedded base64 data
 */

function generateIconDataURL(size) {
    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');
    
    // Fill background
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Add white "T" for Tab
    ctx.fillStyle = 'white';
    ctx.font = `bold ${Math.floor(size * 0.6)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', size / 2, size / 2);
    
    // Return data URL
    return canvas.toDataURL('image/png');
}

// Generate icons for different sizes
const icons = {
    icon16: generateIconDataURL(16),
    icon48: generateIconDataURL(48),
    icon128: generateIconDataURL(128)
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = icons;
} else {
    window.LocaliTabIcons = icons;
}