/**
 * ═══════════════════════════════════════════════════════════
 *  DIGITAL SIGNAGE (TV 2)  –  Google Apps Script Playlist Generator
 * ═══════════════════════════════════════════════════════════
 *
 *  This is the Apps Script for TV 2.
 *  Paste this into a NEW Apps Script project (separate from TV 1).
 *
 *  DEPLOY:
 *  1. Click Deploy → New Deployment
 *       Type:              Web App
 *       Execute as:        Me
 *       Who has access:    Anyone
 *  2. Click Deploy → copy the Web App URL.
 *
 *  THEN:
 *  - Run testPlaylist() once to authorize Drive access
 *  - Redeploy as New Version after authorizing
 * ═══════════════════════════════════════════════════════════
 */

// ── CONFIGURATION ────────────────────────────────────────────
var FOLDER_ID = 'YOUR_FOLDER_ID_HERE';   // TV Signage 2

var DEFAULT_IMAGE_SECONDS = 10;
var SORT_ALPHABETICALLY   = true;
// ─────────────────────────────────────────────────────────────

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

function doGet(e) {
    var playlist = buildPlaylist();
    var json     = JSON.stringify(playlist);
    var output   = ContentService.createTextOutput(json);
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
}

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

            if (name.charAt(0) === '.') continue;

            var orderMatch = name.match(/^(\d+)[_\-\s]/);
            var sortOrder  = orderMatch ? parseInt(orderMatch[1], 10) : 9999;

            var durMatch = name.match(/_(\d+)s\./i);
            var duration = durMatch ? parseInt(durMatch[1], 10) : DEFAULT_IMAGE_SECONDS;

            try {
                file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            } catch (shareErr) {}

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
        }

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

function testPlaylist() {
    var result = buildPlaylist();
    Logger.log('Playlist has ' + result.length + ' item(s):\n');
    result.forEach(function(item, i) {
        Logger.log((i + 1) + '. [' + (item.type || 'ERROR') + '] ' + (item.name || item.error));
    });
}
