// ============================================================
//  SIMPLE TIME CLOCK  —  Google Apps Script Backend
//  2-week pay periods · Full archive · Auto-recalc · Payroll
// ============================================================

// ── CONFIGURATION ──────────────────────────────────────────
var LOG_SHEET      = 'TimeLog';
var SUMMARY_SHEET  = 'Pay Period Summary';
var PAYROLL_SHEET  = 'Payroll';
var SETTINGS_SHEET = 'Settings';

// The Monday your FIRST pay period started.
// All 2-week periods are calculated forward from this date.
// Format: new Date(YEAR, MONTH-1, DAY)  ← month is 0-indexed
var PAY_PERIOD_EPOCH = new Date(2026, 2, 2); // March 2, 2026

// Employee names — must match exactly what appears on the clock-in screen
var EMPLOYEES = [
  'Employee 1',
  'Employee 2',
  'Employee 3',
  'Employee 4',
  'Employee 5'
];

// Brand colors
var BRAND_NAVY   = '#0e2558';
var BRAND_INDIGO = '#2f3192';
var BRAND_SKY    = '#25a4dd';
var BRAND_TAUPE  = '#a79880';
var BRAND_SAND   = '#cbc2b4';

// Accent colors for payroll states
var COLOR_GRAY   = '#cccccc';
var COLOR_ORANGE = '#e65100';
var COLOR_GREEN  = '#059669';
var TIPS_BG      = '#eaf4fb';
// ───────────────────────────────────────────────────────────


// ── WEB APP ENTRY POINT ─────────────────────────────────────

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Time Clock')
    // Apps Script ignores the viewport tag inside index.html — it must be
    // set on the wrapper page or phones render the app zoomed-out and tiny
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Run manually from the editor to force a full rebuild of all tabs
function setupNewSheets() {
  updateSummary();
}


// ── SPREADSHEET HELPER ──────────────────────────────────────

function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch(e) {}
  }
  var ss = SpreadsheetApp.create('Time Clock Data');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}


// ── SHEET HELPERS ───────────────────────────────────────────

function getLogSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    sheet.appendRow(['Employee', 'Action', 'Timestamp']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(2, 80);
    sheet.setColumnWidth(3, 200);
  }
  return sheet;
}

// Creates the Settings sheet with wage-rate rows if it doesn't exist yet.
function getSettingsSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(SETTINGS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET);

    sheet.getRange(1, 1, 1, 2).merge()
      .setValue('⚙️  Wage Rates')
      .setFontSize(14).setFontWeight('bold')
      .setBackground(BRAND_NAVY).setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sheet.setRowHeight(1, 40);

    sheet.getRange(2, 1, 1, 2)
      .setValues([['Employee', 'Hourly Wage ($)']])
      .setFontWeight('bold').setBackground(BRAND_SAND).setFontColor(BRAND_NAVY);

    EMPLOYEES.forEach(function(emp, i) {
      sheet.getRange(3 + i, 1).setValue(emp);
      sheet.getRange(3 + i, 2).setValue(0).setNumberFormat('"$"#,##0.00');
    });

    var noteRow = 3 + EMPLOYEES.length + 1;
    sheet.getRange(noteRow, 1, 1, 2).merge()
      .setValue('ℹ️  Fill in the hourly wage for each employee above. ' +
                'Run installTrigger() once from the Apps Script editor ' +
                'to enable auto-recalculation when the time log is edited.')
      .setWrap(true).setFontColor('#888').setFontSize(10);
    sheet.setRowHeight(noteRow, 80);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 160);
  }
  return sheet;
}

// Returns { employeeName: hourlyRate, ... }
function getWageRates() {
  var sheet = getSettingsSheet();
  var data  = sheet.getDataRange().getValues();
  var rates = {};
  // Row 0 = title, Row 1 = headers, Row 2+ = data
  for (var i = 2; i < data.length; i++) {
    var name = String(data[i][0]).trim();
    var rate = parseFloat(data[i][1]) || 0;
    if (name && EMPLOYEES.indexOf(name) >= 0) rates[name] = rate;
  }
  return rates;
}


// ── CLOCK EVENT ─────────────────────────────────────────────

function clockEvent(name, action) {
  // Reject anything not sent by the real UI — the web app endpoint is
  // public, so never trust the inputs.
  if (EMPLOYEES.indexOf(name) < 0) {
    return { success: false, error: 'Unknown employee' };
  }
  if (action !== 'IN' && action !== 'OUT') {
    return { success: false, error: 'Invalid action' };
  }

  // Lock so two simultaneous punches can't interleave their writes
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var now = new Date();
  try {
    getLogSheet().appendRow([name, action, now]);
    updateSummary();
  } finally {
    lock.releaseLock();
  }

  var formatted = Utilities.formatDate(
    now, Session.getScriptTimeZone(), 'h:mm a, EEE MMM d'
  );
  return { success: true, time: formatted };
}


// ── AUTO-UPDATE TRIGGER ──────────────────────────────────────
//
// Called by an installable onEdit trigger whenever someone edits the
// TimeLog sheet (to correct a punch) OR the Payroll sheet (to enter
// POS/Cash tips). Either edit rebuilds the Summary and Payroll tabs.
//
// !! Run installTrigger() ONCE from the Apps Script editor to activate !!

function onTimeLogEdit(e) {
  try {
    if (e && e.range) {
      var name = e.range.getSheet().getName();
      if (name !== LOG_SHEET && name !== PAYROLL_SHEET) return;
    }
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return;
    try {
      updateSummary();
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    // Never let a trigger error pop up for whoever is editing the sheet
    Logger.log('onTimeLogEdit error: ' + err);
  }
}

// Run this once from the Apps Script editor (click ▶ Run with
// "installTrigger" selected). It installs the edit trigger on the
// spreadsheet so edits auto-recalculate without any manual steps.
function installTrigger() {
  var ss = getSpreadsheet();
  // Remove any stale copies first so it never fires twice
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onTimeLogEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onTimeLogEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  Logger.log('✅ Trigger installed on: ' + ss.getName());
}


// ── STATUS CHECK ────────────────────────────────────────────

function getStatuses() {
  var sheet    = getLogSheet();
  var data     = sheet.getDataRange().getValues();
  var statuses = {}, found = {};
  EMPLOYEES.forEach(function(emp) { statuses[emp] = 'out'; found[emp] = false; });

  for (var i = data.length - 1; i >= 1; i--) {
    var emp = data[i][0], action = data[i][1];
    if (EMPLOYEES.indexOf(emp) >= 0 && !found[emp]) {
      statuses[emp] = (action === 'IN') ? 'in' : 'out';
      found[emp]    = true;
    }
  }
  return { employees: EMPLOYEES, statuses: statuses };
}


// ── PAY PERIOD HELPERS ──────────────────────────────────────

var MS_PER_PERIOD = 14 * 24 * 3600 * 1000;

function getPeriodIndex(date) {
  var epoch = new Date(PAY_PERIOD_EPOCH);
  epoch.setHours(0, 0, 0, 0);
  return Math.floor((date.getTime() - epoch.getTime()) / MS_PER_PERIOD);
}

function getPeriodBounds(idx) {
  var epoch = new Date(PAY_PERIOD_EPOCH);
  epoch.setHours(0, 0, 0, 0);
  var start = new Date(epoch.getTime() + idx * MS_PER_PERIOD);
  var end   = new Date(start.getTime() + MS_PER_PERIOD - 1);
  end.setHours(23, 59, 59, 999);
  return { start: start, end: end };
}

// Calculates regular and overtime hours using a per-week 40-hour threshold.
// US federal law: hours over 40 in any single workweek are paid at 1.5×.
// empEvents = [{action, time}, ...]   periodStart = Date (Monday)
function calcHoursAndOT(empEvents, periodStart) {
  // Week 1: periodStart → periodStart+6days   Week 2: periodStart+7 → periodStart+13
  var week2Start = new Date(periodStart.getTime() + 7 * 24 * 3600 * 1000);
  var week1Ms = 0, week2Ms = 0, lastIn = null;

  empEvents.slice().sort(function(a, b) { return a.time - b.time; })
    .forEach(function(evt) {
      if (evt.action === 'IN') {
        lastIn = evt.time;
      } else if (evt.action === 'OUT' && lastIn) {
        var ms = evt.time.getTime() - lastIn.getTime();
        if (lastIn < week2Start) week1Ms += ms;
        else                     week2Ms += ms;
        lastIn = null;
      }
    });

  var OT_MS  = 40 * 3600 * 1000; // 40 hours in ms
  var otMs   = Math.max(0, week1Ms - OT_MS) + Math.max(0, week2Ms - OT_MS);
  var totMs  = week1Ms + week2Ms;
  var regMs  = totMs - otMs;

  return {
    total:    totMs  / 3600000,
    regular:  regMs  / 3600000,
    overtime: otMs   / 3600000
  };
}


// ── TIPS PRESERVATION ───────────────────────────────────────
// Read POS/Cash tips already entered in the Payroll sheet before we
// clear and rebuild it, so the manager's entries survive the refresh.
// Returns { 'Mar 2 – Mar 15, 2026': { pos: n, cash: n }, ... }

function readSavedTips(sheet) {
  var saved = {};
  if (!sheet) return saved;
  try {
    var data  = sheet.getDataRange().getValues();
    var label = null;
    for (var i = 0; i < data.length; i++) {
      var a = String(data[i][0]).trim();
      // Period title rows look like "▶  CURRENT   PAYROLL — Mar 2 – Mar 15, 2026"
      var m = a.match(/PAYROLL\s*[—–-]\s*(.+)/i);
      if (m) label = m[1].trim();
      if (label && a === 'POS Tips') {
        if (!saved[label]) saved[label] = { pos: 0, cash: 0 };
        saved[label].pos = parseFloat(data[i][1]) || 0;
      }
      if (label && a === 'Cash Tips') {
        if (!saved[label]) saved[label] = { pos: 0, cash: 0 };
        saved[label].cash = parseFloat(data[i][1]) || 0;
      }
    }
  } catch(e) { Logger.log('readSavedTips error: ' + e.message); }
  return saved;
}


// ── PAY PERIOD SUMMARY TAB ──────────────────────────────────
// Master function — rebuilds both the Summary and Payroll tabs.
//
// All cell values and backgrounds are built in memory and written in
// batched calls instead of hundreds of individual setValue()s, so
// punches stay fast even after many pay periods accumulate.

function updateSummary() {
  var ss         = getSpreadsheet();
  var tz         = Session.getScriptTimeZone();
  var currentIdx = getPeriodIndex(new Date());

  // ── Collect all punches grouped by pay period ──
  var log  = getLogSheet();
  var data = log.getDataRange().getValues();
  var periods = {};
  periods[currentIdx] = {};
  EMPLOYEES.forEach(function(emp) { periods[currentIdx][emp] = []; });

  for (var i = 1; i < data.length; i++) {
    var emp    = data[i][0];
    var action = data[i][1];
    var ts     = new Date(data[i][2]);
    if (EMPLOYEES.indexOf(emp) < 0) continue;
    var idx = getPeriodIndex(ts);
    if (!periods[idx]) {
      periods[idx] = {};
      EMPLOYEES.forEach(function(e) { periods[idx][e] = []; });
    }
    periods[idx][emp].push({ action: action, time: ts });
  }

  var periodIndices = Object.keys(periods).map(Number)
    .sort(function(a, b) { return b - a; });

  // ── Rebuild Pay Period Summary ──
  var sheet = ss.getSheetByName(SUMMARY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUMMARY_SHEET);
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
  }
  sheet.clearContents();
  sheet.clearFormats();
  // Old merged regions survive clearContents() and would swallow new values
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();

  var rows   = [];   // cell values, 4 columns wide
  var bgs    = [];   // matching backgrounds
  var blocks = [];   // per-period info for the formatting pass

  function bgRow(c) { return [c, c, c, c]; }
  var WHITE = bgRow('#ffffff');

  rows.push(['🕐  Pay Period Summary', '', '', '']);
  bgs.push(bgRow(BRAND_NAVY));

  rows.push(['Last updated: ' + Utilities.formatDate(new Date(), tz, 'EEE MMM d, h:mm a'), '', '', '']);
  bgs.push(bgRow('#f8f8f8'));

  rows.push(['', '', '', '']);  // spacer
  bgs.push(WHITE);

  periodIndices.forEach(function(idx) {
    var bounds    = getPeriodBounds(idx);
    var isCurrent = (idx === currentIdx);
    var events    = periods[idx];

    var periodLabel =
      Utilities.formatDate(bounds.start, tz, 'MMM d') + ' – ' +
      Utilities.formatDate(bounds.end,   tz, 'MMM d, yyyy');

    var headerBg = isCurrent ? BRAND_NAVY : BRAND_INDIGO;

    var headerRow = rows.length + 1;  // 1-based sheet row
    rows.push([isCurrent ? '▶  CURRENT   ' + periodLabel : periodLabel, '', '', '']);
    bgs.push(bgRow(headerBg));

    rows.push(['Employee', 'Total Hours', 'Punches', 'Notes']);
    bgs.push(bgRow(BRAND_SAND));

    var empStart   = rows.length + 1;
    var hourColors = [];
    var grandTotal = 0;

    EMPLOYEES.forEach(function(emp, empIdx) {
      var empEvents = (events[emp] || []).slice().sort(function(a, b) {
        return a.time - b.time;
      });

      var totalMs = 0, lastIn = null, punches = [], notes = [];

      empEvents.forEach(function(evt) {
        if (evt.action === 'IN') {
          lastIn = evt.time;
          punches.push('IN  ' + Utilities.formatDate(evt.time, tz, 'EEE MMM d, h:mm a'));
        } else if (evt.action === 'OUT' && lastIn) {
          totalMs += evt.time.getTime() - lastIn.getTime();
          punches.push('OUT ' + Utilities.formatDate(evt.time, tz, 'EEE MMM d, h:mm a'));
          lastIn = null;
        } else if (evt.action === 'OUT') {
          punches.push('OUT ' + Utilities.formatDate(evt.time, tz, 'EEE h:mm a'));
          notes.push('OUT with no matching clock-in');
        }
      });
      if (lastIn) notes.push('⚠ Still clocked IN — no clock-out yet');

      var hrs     = totalMs / 3600000;
      grandTotal += hrs;
      var punchText = punches.length ? punches.join('\n') : 'No punches this period';

      rows.push([emp, hrs, punchText, notes.join('\n')]);
      bgs.push(bgRow(empIdx % 2 === 0 ? '#ffffff' : '#f7f5f2'));
      hourColors.push([hrs > 0 ? BRAND_NAVY : COLOR_GRAY]);
    });

    var totalRow = rows.length + 1;
    rows.push(['TOTAL', grandTotal, '', '']);
    bgs.push(bgRow(headerBg));

    rows.push(['', '', '', '']);  // gap between period blocks
    bgs.push(WHITE);
    rows.push(['', '', '', '']);
    bgs.push(WHITE);

    blocks.push({
      headerRow:  headerRow,
      empStart:   empStart,
      empCount:   EMPLOYEES.length,
      totalRow:   totalRow,
      hourColors: hourColors
    });
  });

  // ── Two bulk writes for all values + backgrounds ──
  var all = sheet.getRange(1, 1, rows.length, 4);
  all.setValues(rows);
  all.setBackgrounds(bgs);

  // ── Formatting pass ──
  sheet.getRange(1, 1, 1, 4).merge()
    .setFontSize(16).setFontWeight('bold')
    .setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 46);

  sheet.getRange(2, 1, 1, 4).merge()
    .setFontColor(BRAND_TAUPE).setFontSize(10).setFontStyle('italic')
    .setHorizontalAlignment('center');

  blocks.forEach(function(b) {
    sheet.getRange(b.headerRow, 1, 1, 4).merge()
      .setFontSize(12).setFontWeight('bold')
      .setFontColor('#ffffff').setHorizontalAlignment('center');
    sheet.setRowHeight(b.headerRow, 36);

    sheet.getRange(b.headerRow + 1, 1, 1, 4)
      .setFontWeight('bold').setFontColor(BRAND_NAVY).setFontSize(11);

    sheet.getRange(b.empStart, 1, b.empCount, 1).setFontWeight('bold');
    sheet.getRange(b.empStart, 2, b.empCount, 1)
      .setNumberFormat('0.00" hrs"').setFontWeight('bold').setFontSize(12)
      .setFontColors(b.hourColors);
    sheet.getRange(b.empStart, 3, b.empCount, 1)
      .setFontFamily('Courier New').setFontSize(10).setWrap(true);
    sheet.getRange(b.empStart, 4, b.empCount, 1)
      .setFontColor('#b45309').setFontSize(10).setWrap(true);

    sheet.getRange(b.totalRow, 1, 1, 4).setFontWeight('bold').setFontColor('#ffffff');
    sheet.getRange(b.totalRow, 2)
      .setNumberFormat('0.00" hrs"').setFontSize(13);
  });

  sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 300); sheet.setColumnWidth(4, 260);

  // ── Also rebuild the Payroll tab ──
  updatePayroll(ss, periods, periodIndices, currentIdx);
}


// ── PAYROLL TAB ─────────────────────────────────────────────
// Columns: Employee | Reg Hrs | OT Hrs | Total Hrs | Wage Rate |
//          Reg Pay  | OT Pay  | Gross Wages | Tips Allocated | Total Pay

var P_COLS = 10;

function updatePayroll(ss, periods, periodIndices, currentIdx) {
  var tz    = Session.getScriptTimeZone();
  var rates = getWageRates();

  // Read tips entered by the manager BEFORE clearing the sheet
  var paySheet  = ss.getSheetByName(PAYROLL_SHEET);
  var savedTips = readSavedTips(paySheet);

  if (!paySheet) {
    paySheet = ss.insertSheet(PAYROLL_SHEET);
  }
  paySheet.clearContents();
  paySheet.clearFormats();
  paySheet.clearNotes();
  paySheet.getRange(1, 1, paySheet.getMaxRows(), paySheet.getMaxColumns()).breakApart();

  // Per-employee-row font weights: bold on Employee, Total Hrs, Gross, Total Pay
  var EMP_WEIGHTS = ['bold','normal','normal','bold','normal','normal','normal','bold','normal','bold'];

  var rows   = [];   // cell values, P_COLS wide
  var bgs    = [];   // matching backgrounds
  var blocks = [];   // per-period info for the formatting pass

  function pad(arr) {
    while (arr.length < P_COLS) arr.push('');
    return arr;
  }
  function bgRow(c) {
    var r = [];
    for (var k = 0; k < P_COLS; k++) r.push(c);
    return r;
  }
  var WHITE = bgRow('#ffffff');

  rows.push(pad(['💰  Payroll']));
  bgs.push(bgRow(BRAND_NAVY));

  rows.push(pad(['Last updated: ' + Utilities.formatDate(new Date(), tz, 'EEE MMM d, h:mm a')]));
  bgs.push(bgRow('#f8f8f8'));

  rows.push(pad([]));  // spacer
  bgs.push(WHITE);

  periodIndices.forEach(function(idx) {
    var bounds      = getPeriodBounds(idx);
    var isCurrent   = (idx === currentIdx);
    var events      = periods[idx];
    var periodLabel = Utilities.formatDate(bounds.start, tz, 'MMM d') + ' – ' +
                      Utilities.formatDate(bounds.end,   tz, 'MMM d, yyyy');
    // NOTE: title text includes "PAYROLL —" which readSavedTips uses to key periods
    var titleText   = (isCurrent ? '▶  CURRENT   ' : '') +
                      'PAYROLL — ' + periodLabel;
    var headerBg    = isCurrent ? BRAND_NAVY : BRAND_INDIGO;

    var headerRow = rows.length + 1;
    rows.push(pad([titleText]));
    bgs.push(bgRow(headerBg));

    rows.push([
      'Employee', 'Reg. Hrs', 'OT Hrs', 'Total Hrs',
      'Wage Rate', 'Reg. Pay', 'OT Pay (1.5×)',
      'Gross Wages', 'Tips Allocated', 'Total Pay'
    ]);
    bgs.push(bgRow(BRAND_SAND));

    // ── Compute hours for every employee ──
    var empRows = [], totalHoursAll = 0;
    EMPLOYEES.forEach(function(emp) {
      var h      = calcHoursAndOT(events[emp] || [], bounds.start);
      var rate   = rates[emp] || 0;
      var regPay = h.regular  * rate;
      var otPay  = h.overtime * rate * 1.5;
      var gross  = regPay + otPay;
      totalHoursAll += h.total;
      empRows.push({ emp: emp, h: h, rate: rate, regPay: regPay, otPay: otPay, gross: gross });
    });

    // Retrieve tips saved for this period
    var tips      = savedTips[periodLabel] || { pos: 0, cash: 0 };
    var totalTips = (tips.pos || 0) + (tips.cash || 0);

    // ── Employee rows ──
    var empStart   = rows.length + 1;
    var fontColors = [];
    var fontWeights = [];
    empRows.forEach(function(d, ei) {
      var pct       = totalHoursAll > 0 ? d.h.total / totalHoursAll : 0;
      var tipsAlloc = totalTips * pct;
      var totalPay  = d.gross + tipsAlloc;
      var hasHours  = d.h.total > 0;

      rows.push([
        d.emp, d.h.regular, d.h.overtime, d.h.total, d.rate,
        d.regPay, d.otPay, d.gross, tipsAlloc, totalPay
      ]);
      bgs.push(bgRow(ei % 2 === 0 ? '#ffffff' : '#f7f5f2'));
      fontColors.push([
        BRAND_NAVY,                                       // Employee
        hasHours        ? BRAND_NAVY   : COLOR_GRAY,      // Reg. Hrs
        d.h.overtime > 0 ? COLOR_ORANGE : COLOR_GRAY,     // OT Hrs
        hasHours        ? BRAND_NAVY   : COLOR_GRAY,      // Total Hrs
        BRAND_NAVY,                                       // Wage Rate
        BRAND_NAVY,                                       // Reg. Pay
        d.otPay > 0     ? COLOR_ORANGE : COLOR_GRAY,      // OT Pay
        BRAND_NAVY,                                       // Gross Wages
        totalTips > 0   ? COLOR_GREEN  : COLOR_GRAY,      // Tips Allocated
        hasHours        ? COLOR_GREEN  : COLOR_GRAY       // Total Pay
      ]);
      fontWeights.push(EMP_WEIGHTS);
    });

    // ── Tips input rows ──
    // The manager types POS/Cash amounts directly into column B.
    // Editing these cells triggers onTimeLogEdit → updateSummary →
    // tips are re-read and tips-allocated column recalculates automatically.
    var tipsStart = rows.length + 1;
    rows.push(pad(['POS Tips', tips.pos || 0]));
    bgs.push(bgRow(TIPS_BG));
    rows.push(pad(['Cash Tips', tips.cash || 0]));
    bgs.push(bgRow(TIPS_BG));
    rows.push(pad(['Total Tips', totalTips]));
    bgs.push(bgRow(TIPS_BG));

    // ── Period grand total row ──
    var grandGross = empRows.reduce(function(s, d) { return s + d.gross; }, 0);
    var grandTotal = grandGross + totalTips;

    var totalRow = rows.length + 1;
    rows.push(['TOTAL', '', '', '', '', '', '', grandGross, totalTips, grandTotal]);
    bgs.push(bgRow(headerBg));

    rows.push(pad([]));  // gap before next period block
    bgs.push(WHITE);
    rows.push(pad([]));
    bgs.push(WHITE);

    blocks.push({
      headerRow:   headerRow,
      empStart:    empStart,
      empCount:    empRows.length,
      tipsStart:   tipsStart,
      totalRow:    totalRow,
      fontColors:  fontColors,
      fontWeights: fontWeights
    });
  });

  // ── Two bulk writes for all values + backgrounds ──
  var all = paySheet.getRange(1, 1, rows.length, P_COLS);
  all.setValues(rows);
  all.setBackgrounds(bgs);

  // ── Formatting pass ──
  var tipNote = 'Type the total tip amount here. ' +
                'Editing this cell auto-recalculates everyone\'s Tips Allocated column.';

  paySheet.getRange(1, 1, 1, P_COLS).merge()
    .setFontSize(16).setFontWeight('bold')
    .setFontColor('#ffffff').setHorizontalAlignment('center');
  paySheet.setRowHeight(1, 46);

  paySheet.getRange(2, 1, 1, P_COLS).merge()
    .setFontColor(BRAND_TAUPE).setFontSize(10).setFontStyle('italic')
    .setHorizontalAlignment('center');

  blocks.forEach(function(b) {
    paySheet.getRange(b.headerRow, 1, 1, P_COLS).merge()
      .setFontSize(12).setFontWeight('bold')
      .setFontColor('#ffffff').setHorizontalAlignment('center');
    paySheet.setRowHeight(b.headerRow, 36);

    paySheet.getRange(b.headerRow + 1, 1, 1, P_COLS)
      .setFontWeight('bold').setFontColor(BRAND_NAVY).setFontSize(11);

    var empRange = paySheet.getRange(b.empStart, 1, b.empCount, P_COLS);
    empRange.setFontColors(b.fontColors);
    empRange.setFontWeights(b.fontWeights);
    paySheet.getRange(b.empStart, 2, b.empCount, 3).setNumberFormat('0.00');
    paySheet.getRange(b.empStart, 5, b.empCount, 6).setNumberFormat('"$"#,##0.00');

    paySheet.getRange(b.tipsStart, 1, 3, 2).setFontWeight('bold');
    paySheet.getRange(b.tipsStart, 2, 3, 1).setNumberFormat('"$"#,##0.00');
    paySheet.getRange(b.tipsStart, 1, 2, 2).setFontColor(BRAND_INDIGO);
    paySheet.getRange(b.tipsStart + 2, 1, 1, 2).setFontColor('#333333');
    paySheet.getRange(b.tipsStart, 2).setNote(tipNote);
    paySheet.getRange(b.tipsStart + 1, 2).setNote(tipNote);

    paySheet.getRange(b.totalRow, 1, 1, P_COLS).setFontWeight('bold').setFontColor('#ffffff');
    paySheet.getRange(b.totalRow, 8, 1, 3)
      .setNumberFormat('"$"#,##0.00').setFontSize(13)
      .setFontColors([['#ffffff', '#ffffff', '#90ee90']]);
  });

  // ── Column widths ──
  paySheet.setColumnWidth(1,  160); // Employee
  paySheet.setColumnWidth(2,   90); // Reg. Hrs
  paySheet.setColumnWidth(3,   80); // OT Hrs
  paySheet.setColumnWidth(4,   90); // Total Hrs
  paySheet.setColumnWidth(5,  110); // Wage Rate
  paySheet.setColumnWidth(6,  110); // Reg. Pay
  paySheet.setColumnWidth(7,  130); // OT Pay
  paySheet.setColumnWidth(8,  130); // Gross Wages
  paySheet.setColumnWidth(9,  130); // Tips Allocated
  paySheet.setColumnWidth(10, 120); // Total Pay
}
