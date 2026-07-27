// ============================================================
//  STAFF SCHEDULER  —  Google Apps Script Backend
//  Weekly schedule grid · PIN-protected edit mode
// ============================================================

// ── CONFIGURATION ──────────────────────────────────────────
var SCHEDULE_SHEET = 'Schedule';
var NOTES_SHEET    = 'Notes';

// Fallback PIN only. For better security, set a Script Property named
// MANAGER_PIN instead (Project Settings → Script Properties) — that way
// the PIN never lives in the source code.
var MANAGER_PIN    = '0000';

var EMPLOYEES = [
  'Employee 1',
  'Employee 2',
  'Employee 3',
  'Employee 4',
  'Employee 5'
];

var TOKEN_TTL_SECONDS = 21600;  // manager session lasts 6 hours
var MAX_PIN_ATTEMPTS  = 5;      // wrong guesses allowed before lockout
var LOCKOUT_SECONDS   = 600;    // lockout duration: 10 minutes
// ───────────────────────────────────────────────────────────


function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Staff Schedule')
    // Apps Script ignores the viewport tag inside index.html — it must be
    // set on the wrapper page or phones render the app zoomed-out and tiny
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}


// ── SPREADSHEET HELPER ──────────────────────────────────────

function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch(e) {}
  }
  var ss = SpreadsheetApp.create('Staff Schedule Data');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function getScheduleSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(SCHEDULE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SCHEDULE_SHEET);
    sheet.appendRow(['ID', 'WeekStart', 'Employee', 'Day', 'StartTime', 'EndTime']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 140);
    sheet.setColumnWidth(4, 60);
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 80);
    // Time columns are plain text so Sheets never reinterprets "09:00"
    sheet.getRange('E:F').setNumberFormat('@');
  }
  return sheet;
}


function getNotesSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(NOTES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOTES_SHEET);
    sheet.appendRow(['WeekStart', 'Note']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 100);
    sheet.setColumnWidth(2, 420);
  }
  return sheet;
}


// ── DATE HELPERS ─────────────────────────────────────────────
//
// weekStart is stored as a plain integer (e.g. 20260302 for March 2 2026).
// Google Sheets will NEVER auto-convert an 8-digit integer into a Date
// object, so getValues() always returns a plain JavaScript number —
// fully immune to timezone / date-parsing bugs.
//
// normaliseWeekStart() handles all three possible raw cell types:
//   • number  20260302         → "2026-03-02"   (new rows)
//   • string  "2026-03-02"     → "2026-03-02"   (if somehow stored as text)
//   • Date    object           → "2026-03-02"   (legacy rows from old code)

function weekStartToInt(weekStartStr) {
  // "2026-03-02" → 20260302
  var parts = String(weekStartStr).replace(/\D/g,' ').trim().split(/\s+/);
  if (parts.length === 3) {
    return Number(parts[0]) * 10000 + Number(parts[1]) * 100 + Number(parts[2]);
  }
  return 0;
}

function normaliseWeekStart(val) {
  if (val instanceof Date) {
    // Legacy: old code stored actual Date objects
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var n = Number(val);
  if (!isNaN(n) && n > 19000101 && n < 21000101) {
    // Integer format: 20260302 → "2026-03-02"
    var s = String(Math.round(n));
    if (s.length === 8) {
      return s.substring(0,4) + '-' + s.substring(4,6) + '-' + s.substring(6,8);
    }
  }
  // Plain string fallback — keep only the date part
  return String(val).trim().substring(0, 10);
}

function shiftRowValues(id, weekStart, employee, day, startTime, endTime) {
  return [id, weekStartToInt(weekStart), employee, Number(day), startTime, endTime];
}

function writeShiftRow(sheet, rowNum, id, weekStart, employee, day, startTime, endTime) {
  // Belt-and-braces for sheets created by older versions: keep the two time
  // cells text-formatted. No flush needed — Apps Script applies these in order.
  sheet.getRange(rowNum, 5, 1, 2).setNumberFormat('@');
  sheet.getRange(rowNum, 1, 1, 6).setValues([shiftRowValues(id, weekStart, employee, day, startTime, endTime)]);
}


// ── AUTH ────────────────────────────────────────────────────
//
// checkPin() issues a short-lived session token. Every function that
// modifies the schedule requires a valid token, so the PIN actually
// protects the data — not just the buttons in the UI.

function getManagerPin_() {
  var p = PropertiesService.getScriptProperties().getProperty('MANAGER_PIN');
  return p || MANAGER_PIN;
}

function checkPin(pin) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('pinFails') || 0);
  if (fails >= MAX_PIN_ATTEMPTS) {
    return { valid: false, locked: true, error: 'Too many attempts — try again in 10 minutes' };
  }
  if (String(pin) === String(getManagerPin_())) {
    cache.remove('pinFails');
    var token = Utilities.getUuid();
    cache.put('tok_' + token, '1', TOKEN_TTL_SECONDS);
    return { valid: true, token: token };
  }
  cache.put('pinFails', String(fails + 1), LOCKOUT_SECONDS);
  return { valid: false };
}

function isAuthed_(token) {
  return !!(token && CacheService.getScriptCache().get('tok_' + token));
}

var AUTH_ERROR = { success: false, error: 'Session expired — please log in again', authExpired: true };


// ── VALIDATION ──────────────────────────────────────────────

function validateShiftInput_(weekStart, employee, day, startTime, endTime) {
  if (!weekStart || !employee || day === undefined || !startTime || !endTime) {
    return 'Missing required fields';
  }
  if (EMPLOYEES.indexOf(employee) < 0) return 'Unknown employee';
  var d = Number(day);
  if (isNaN(d) || d < 0 || d > 6) return 'Invalid day';
  var timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRe.test(String(startTime)) || !timeRe.test(String(endTime))) return 'Invalid time';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart))) return 'Invalid week';
  return null;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}


// ── CONFIG ──────────────────────────────────────────────────

function getConfig() {
  var appUrl = '';
  try { appUrl = ScriptApp.getService().getUrl(); } catch(e) {}
  return { employees: EMPLOYEES, appUrl: appUrl };
}


// ── SCHEDULE DATA ───────────────────────────────────────────

function getSchedule(weekStart) {
  var sheet  = getScheduleSheet();
  var data   = sheet.getDataRange().getValues();
  var shifts = [];
  var target = String(weekStart).trim();

  for (var i = 1; i < data.length; i++) {
    if (normaliseWeekStart(data[i][1]) === target) {
      shifts.push({
        id:        String(data[i][0]),
        weekStart: target,
        employee:  String(data[i][2]),
        day:       Number(data[i][3]),
        startTime: String(data[i][4]),
        endTime:   String(data[i][5])
      });
    }
  }
  // The weekly note rides along with the shifts — one server call per week view
  return { shifts: shifts, note: getNote_(target) };
}


// ── WEEKLY NOTES ────────────────────────────────────────────
// One free-text note per week, shown under the schedule grid.
// WeekStart is stored as the same YYYYMMDD integer as the Schedule sheet.

function getNote_(weekStart) {
  var data   = getNotesSheet().getDataRange().getValues();
  var target = String(weekStart).trim();
  for (var i = 1; i < data.length; i++) {
    if (normaliseWeekStart(data[i][0]) === target) return String(data[i][1]);
  }
  return '';
}

function saveNote(token, weekStart, note) {
  if (!isAuthed_(token)) return AUTH_ERROR;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart))) {
    return { success: false, error: 'Invalid week' };
  }
  note = String(note || '').substring(0, 2000);

  return withLock_(function() {
    var sheet  = getNotesSheet();
    var data   = sheet.getDataRange().getValues();
    var target = String(weekStart).trim();
    for (var i = 1; i < data.length; i++) {
      if (normaliseWeekStart(data[i][0]) === target) {
        sheet.getRange(i + 1, 2).setValue(note);
        return { success: true };
      }
    }
    sheet.appendRow([weekStartToInt(target), note]);
    return { success: true };
  });
}


// ── ADD SHIFT ───────────────────────────────────────────────

function addShift(token, weekStart, employee, day, startTime, endTime) {
  if (!isAuthed_(token)) return AUTH_ERROR;
  var err = validateShiftInput_(weekStart, employee, day, startTime, endTime);
  if (err) return { success: false, error: err };

  return withLock_(function() {
    var sheet = getScheduleSheet();
    var id    = Utilities.getUuid();
    writeShiftRow(sheet, sheet.getLastRow() + 1, id, weekStart, employee, day, startTime, endTime);
    return { success: true, id: id };
  });
}


// ── UPDATE SHIFT ────────────────────────────────────────────
// Overwrites a shift in place — one server call instead of the old
// delete-then-add round trip.

function updateShift(token, id, weekStart, employee, day, startTime, endTime) {
  if (!isAuthed_(token)) return AUTH_ERROR;
  var err = validateShiftInput_(weekStart, employee, day, startTime, endTime);
  if (err) return { success: false, error: err };

  return withLock_(function() {
    var sheet = getScheduleSheet();
    var data  = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        writeShiftRow(sheet, i + 1, id, weekStart, employee, day, startTime, endTime);
        return { success: true, id: id };
      }
    }
    return { success: false, error: 'Shift not found' };
  });
}


// ── DELETE SHIFT ─────────────────────────────────────────────

function deleteShift(token, id) {
  if (!isAuthed_(token)) return AUTH_ERROR;

  return withLock_(function() {
    var sheet = getScheduleSheet();
    var data  = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true };
      }
    }
    return { success: false, error: 'Shift not found' };
  });
}


// ── COPY LAST WEEK ──────────────────────────────────────────

function copyLastWeek(token, weekStart) {
  if (!isAuthed_(token)) return AUTH_ERROR;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart))) {
    return { success: false, error: 'Invalid week' };
  }

  return withLock_(function() {
    var tz = Session.getScriptTimeZone();

    // Parse the incoming weekStart string ("2026-03-09") into date parts
    var parts = String(weekStart).split('-');
    var yr = Number(parts[0]), mo = Number(parts[1]), dy = Number(parts[2]);

    // Calendar-date arithmetic (new Date(y, m, d-7)) instead of milliseconds:
    // millisecond subtraction is not DST-safe.
    var currentDate  = new Date(yr, mo - 1, dy);
    var lastWeekDate = new Date(yr, mo - 1, dy - 7);
    var lastWeekStr  = Utilities.formatDate(lastWeekDate, tz, 'yyyy-MM-dd');
    var currentStr   = Utilities.formatDate(currentDate,  tz, 'yyyy-MM-dd');

    var sheet = getScheduleSheet();
    var data  = sheet.getDataRange().getValues();

    // Delete current week rows (walk backwards so row indices stay valid)
    for (var i = data.length - 1; i >= 1; i--) {
      if (normaliseWeekStart(data[i][1]) === currentStr) {
        sheet.deleteRow(i + 1);
      }
    }
    SpreadsheetApp.flush();

    // Re-read after deletions, collect last week's shifts
    data = sheet.getDataRange().getValues();
    var newRows = [];
    for (var j = 1; j < data.length; j++) {
      if (normaliseWeekStart(data[j][1]) === lastWeekStr) {
        newRows.push(shiftRowValues(
          Utilities.getUuid(), currentStr,
          String(data[j][2]), data[j][3],
          String(data[j][4]), String(data[j][5])
        ));
      }
    }

    // Single batched write instead of one write+flush per row
    if (newRows.length) {
      var startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 5, newRows.length, 2).setNumberFormat('@');
      sheet.getRange(startRow, 1, newRows.length, 6).setValues(newRows);
    }

    return { success: true, copied: newRows.length };
  });
}


// ── DIAGNOSE ─────────────────────────────────────────────────
// Called by the "Diagnose" button in Edit Mode to show exactly
// what values are stored in column B for every row.

function diagnoseCopyLastWeek(token, weekStart) {
  if (!isAuthed_(token)) return AUTH_ERROR;

  var tz          = Session.getScriptTimeZone();
  var parts       = String(weekStart).split('-');
  var currentDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  var lastWkDate  = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) - 7);
  var lastWeekStr = Utilities.formatDate(lastWkDate, tz, 'yyyy-MM-dd');
  var currentStr  = Utilities.formatDate(currentDate, tz, 'yyyy-MM-dd');

  var sheet = getScheduleSheet();
  var data  = sheet.getDataRange().getValues();
  var rows  = [];

  for (var i = 1; i < data.length; i++) {
    var raw  = data[i][1];
    var norm = normaliseWeekStart(raw);
    rows.push({
      row:        i + 1,
      rawType:    raw instanceof Date ? 'Date' : typeof raw,
      rawValue:   String(raw),
      normalised: norm,
      matchesLastWeek: norm === lastWeekStr,
      employee:   String(data[i][2])
    });
  }

  return {
    receivedWeekStart: weekStart,
    currentStr:        currentStr,
    lastWeekStr:       lastWeekStr,
    timezone:          tz,
    totalDataRows:     data.length - 1,
    rows:              rows
  };
}


// ── DEBUG ────────────────────────────────────────────────────
// Run from Apps Script editor: select debugSchedule, click Run,
// then check Execution log to see raw column B values.

function debugSchedule() {
  var sheet  = getScheduleSheet();
  var data   = sheet.getDataRange().getValues();
  var tz     = Session.getScriptTimeZone();
  var lines  = [];

  lines.push('Timezone: ' + tz);
  lines.push('Total rows (including header): ' + data.length);
  lines.push('');

  for (var i = 0; i < data.length; i++) {
    var val     = data[i][1];
    var typeTag = (val instanceof Date)
      ? 'Date → ' + Utilities.formatDate(val, tz, 'yyyy-MM-dd')
      : (typeof val) + ' → "' + String(val) + '"';
    lines.push(
      'Row ' + (i + 1) +
      ' | Col B: ' + typeTag +
      ' | Normalised: ' + normaliseWeekStart(val) +
      ' | Employee: ' + String(data[i][2])
    );
  }

  var output = lines.join('\n');
  Logger.log(output);
  return output;
}
