/**
 * ═══════════════════════════════════════════════════════════
 *  DIGITAL SIGNAGE  –  Google Apps Script Playlist Generator
 * ═══════════════════════════════════════════════════════════
 *
 *  HOW TO USE:
 *  1. Go to https://script.google.com  →  New Project
 *  2. Delete any existing code and paste THIS entire file in.
 *  3. Set FOLDER_ID below to your Google Drive folder's ID.
 *     (Open the folder in Drive → copy the ID from the URL:
 *      https://drive.google.com/drive/folders/  ← THIS PART)
 *  4. Click Deploy → New Deployment
 *       Type:              Web App
 *       Execute as:        Me
 *       Who has access:    Anyone
 *  5. Click Deploy → copy the Web App URL.
 *  6. Paste that URL into player.html  →  CONFIG.playlistUrl
 *
 *  UPDATING CONTENT:
 *  Simply add or remove files from your Google Drive folder.
 *  The TV will pick up changes within 5 minutes automatically.
 *
 *  CONTROLLING SLIDE ORDER:
 *  Name your files with a number prefix:
 *    01_welcome.jpg        ← shown first
 *    02_menu.jpg           ← shown second
 *    03_promo.mp4          ← shown third
 *
 *  CONTROLLING IMAGE DURATION:
 *  Add  _Xs  before the extension (X = seconds):
 *    slide_20s.jpg         ← stays on screen for 20 seconds
 *    logo_5s.png           ← stays on screen for 5 seconds
 * ═══════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ────────────────────────────────────────────
var FOLDER_ID = 'YOUR_FOLDER_ID_HERE';   // ← REPLACE THIS

var DEFAULT_IMAGE_SECONDS = 10;          // Default seconds per image
var SORT_ALPHABETICALLY   = true;        // Sort files by filename
// ─────────────────────────────────────────────────────────────

// Supported MIME types
var IMAGE_TYPES = {
    'image/jpeg'   : true,
    'image/jpg'    : true,
    'image/png'    : true,
    'image/gif'    : true,
    'image/webp'   : true,
    'image/bmp'    : true,
};

var VIDEO_TYPES = {
    'video/mp4'        : true,
    'video/webm'       : true,
    'video/ogg'        : true,
    'video/quicktime'  : true,
    'video/x-msvideo'  : true,
    'video/x-matroska' : true,
};


/**
 * Main entry point — called by the Web App.
 * Returns a JSON array of playlist items.
 */
function doGet(e) {
    var playlist = buildPlaylist();
    var json     = JSON.stringify(playlist);
    var output   = ContentService.createTextOutput(json);
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
}


/**
 * Reads the Drive folder and returns a playlist array.
 */
function buildPlaylist() {
    try {
        if (!FOLDER_ID || FOLDER_ID === 'YOUR_FOLDER_ID_HERE') {
            return [{ error: 'FOLDER_ID not set in Apps Script. Please edit the script and redeploy.' }];
        }

        var folder = DriveApp.getFolderById(FOLDER_ID);
        var iter   = folder.getFiles();
        var items  = [];

        while (iter.hasNext()) {
            var file     = iter.next();
            var mime     = file.getMimeType();
            var name     = file.getName();
            var fileId   = file.getId();

            // Skip hidden/system files
            if (name.charAt(0) === '.') continue;

            // Parse sort order from numeric prefix: "01_name.jpg" → order=1
            var orderMatch = name.match(/^(\d+)[_\-\s]/);
            var sortOrder  = orderMatch ? parseInt(orderMatch[1], 10) : 9999;

            // Parse custom duration: "name_15s.jpg" → 15 seconds
            var durMatch = name.match(/_(\d+)s\./i);
            var duration = durMatch ? parseInt(durMatch[1], 10) : DEFAULT_IMAGE_SECONDS;

            // Ensure the file is accessible with a link
            try {
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            } catch (shareErr) {
                // File may already be shared or we lack permission — continue anyway
            }

            if (IMAGE_TYPES[mime]) {
                items.push({
                    type     : 'image',
                    url      : 'https://lh3.googleusercontent.com/d/' + fileId,
                    name     : name,
                    duration : duration,
                    order    : sortOrder,
                });
            } else if (VIDEO_TYPES[mime]) {
                items.push({
                    type  : 'video',
                    url   : 'https://drive.google.com/uc?export=download&id=' + fileId,
                    name  : name,
                    order : sortOrder,
                });
            }
            // Other file types are silently ignored
        }

        // Sort
        if (SORT_ALPHABETICALLY) {
            items.sort(function(a, b) {
                if (a.order !== b.order) return a.order - b.order;
                return a.name.localeCompare(b.name);
            });
        }

        return items;

    } catch (err) {
        Logger.log('Error: ' + err.toString());
        return [{ error: err.toString() }];
    }
}


/**
 * Test function — run this inside the Apps Script editor
 * (click Run → testPlaylist) to verify your setup before deploying.
 */
function testPlaylist() {
    var result = buildPlaylist();
    Logger.log('Playlist has ' + result.length + ' item(s):\n');
    result.forEach(function(item, i) {
        Logger.log((i + 1) + '. [' + (item.type || 'ERROR') + '] ' + (item.name || item.error));
    });
}
