' ╔═══════════════════════════════════════════════════════════╗
' ║            DIGITAL SIGNAGE  –  CONFIGURATION             ║
' ║                                                           ║
' ║  Edit the URL below, then save this file.                 ║
' ║  This is the ONLY file you need to change.                ║
' ╚═══════════════════════════════════════════════════════════╝

function GetConfig() as Object
    return {
        ' ── Paste your Google Apps Script Web App URL here ──────
        '    (the same URL from Step 2 of the setup guide)
        playlistUrl: "https://script.google.com/macros/s/PASTE_YOUR_TV1_APPS_SCRIPT_URL_ID/exec"

        ' ── How long to show each image (seconds) ──────────────
        '    This only applies when you have MORE than 1 image.
        '    If your folder has exactly 1 image, it stays on screen
        '    permanently with no timer — completely gap-free.
        '
        '    Common values:
        '      10     = 10 seconds
        '      30     = 30 seconds
        '      3600   = 1 hour
        '      43200  = 12 hours
        '      86400  = 24 hours
        '
        '    You can also override per-file by adding _Xs to the name:
        '      menu_30s.jpg    shows for 30 seconds
        '      promo_3600s.jpg shows for 1 hour
        imageDuration: 10

        ' ── How often to check Google Drive for new content (seconds)
        '    300  = 5 minutes  (recommended)
        '    60   = 1 minute   (if you update content frequently)
        '    3600 = 1 hour     (if content rarely changes)
        refreshInterval: 300
    }
end function
