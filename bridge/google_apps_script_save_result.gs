/**
 * PepsLive Dock V1 - Google Apps Script webhook
 *
 * รองรับ:
 * - saveResult: บันทึกผลการแข่งขันกลับ Google Sheet
 * - presenceHeartbeat: บันทึก/อัปเดตสถานะผู้ใช้งานออนไลน์
 * - presenceList: ดึงรายชื่อผู้ใช้งานทั้งหมด
 * - presenceOffline: ตั้งสถานะผู้ใช้ให้ offline เมื่อออกจากระบบ
 *
 * ใช้ได้กับ GitHub Pages ผ่าน JSONP doGet(e)
 */
function doPost(e) {
  try {
    var payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = String(payload.action || '').trim();
    if (action === 'presenceHeartbeat') return json_(presenceHeartbeat_(payload.payload || payload));
    if (action === 'presenceList') return json_(presenceList_());
    if (action === 'presenceOffline') return json_(presenceOffline_(payload.payload || payload));
    return json_(saveResult_(payload));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  var callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  try {
    var action = String((e && e.parameter && e.parameter.action) || '').trim();
    var payload = JSON.parse(String((e && e.parameter && e.parameter.payload) || '{}'));
    if (action === 'saveResult') return jsonp_(saveResult_(payload), callback);
    if (action === 'presenceHeartbeat') return jsonp_(presenceHeartbeat_(payload), callback);
    if (action === 'presenceList') return jsonp_(presenceList_(), callback);
    if (action === 'presenceOffline') return jsonp_(presenceOffline_(payload), callback);
    throw new Error('unsupported_action: ' + action);
  } catch (err) {
    return jsonp_({ ok: false, error: String(err && err.message || err) }, callback);
  }
}

function saveResult_(payload) {
  payload = payload || {};
  var values = payload.values || {};
  var matchId = String(payload.matchId || '').trim();
  if (!matchId) return { ok: false, error: 'missing_matchId' };

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var data = sheet.getDataRange().getValues();
  if (!data.length) return { ok: false, error: 'empty_sheet' };

  var headers = data[0].map(function(h) { return String(h || '').trim(); });
  var schema = [
    'MatchID','LogoA','TeamA','LogoB','TeamB',
    'Label1','Label2','Label3','Label4','Label5',
    'ScoreA','ScoreB','FinalScore','MatchStatus','Winner',
    'FinishedAt','UpdatedAt','UpdatedBy','Note'
  ];
  var missing = schema.filter(function(h) { return headers.indexOf(h) === -1; });
  if (missing.length) return { ok: false, error: 'schema_missing_columns', missing: missing };

  var matchIdCol = headers.indexOf('MatchID');
  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][matchIdCol] || '').trim() === matchId) {
      rowIndex = r + 1;
      break;
    }
  }
  if (rowIndex < 0) return { ok: false, error: 'match_not_found', matchId: matchId };

  var resultCols = ['ScoreA','ScoreB','FinalScore','MatchStatus','Winner','FinishedAt','UpdatedAt','UpdatedBy','Note'];
  resultCols.forEach(function(h) {
    var col = headers.indexOf(h) + 1;
    sheet.getRange(rowIndex, col).setValue(values[h] == null ? '' : values[h]);
  });

  SpreadsheetApp.flush();
  return { ok: true, row: rowIndex, matchId: matchId, saved: values, savedAt: new Date().toISOString() };
}

function usersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PepsLiveUsers');
  if (!sheet) sheet = ss.insertSheet('PepsLiveUsers');
  var headers = ['SessionID','Username','Province','LastSeen','Version','UserAgent','Status'];
  var first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needsHeader = first.join('').trim() === '' || String(first[0] || '') !== 'SessionID';
  if (needsHeader) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function presenceHeartbeat_(payload) {
  payload = payload || {};
  var sessionId = String(payload.sessionId || '').trim();
  var username = String(payload.username || '').trim();
  var province = String(payload.province || '').trim();
  if (!sessionId) return { ok: false, error: 'missing_sessionId' };
  if (!username) username = '-';
  if (!province) province = '-';

  var sheet = usersSheet_();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || '').trim() === sessionId) {
      rowIndex = r + 1;
      break;
    }
  }
  var now = new Date();
  var row = [sessionId, username, province, now, String(payload.version || ''), String(payload.userAgent || ''), 'Online'];
  if (rowIndex < 0) sheet.appendRow(row);
  else sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  SpreadsheetApp.flush();
  var list = presenceList_();
  list.heartbeatAt = now.toISOString();
  return list;
}

function presenceOffline_(payload) {
  payload = payload || {};
  var sessionId = String(payload.sessionId || '').trim();
  if (!sessionId) return { ok: false, error: 'missing_sessionId' };
  var sheet = usersSheet_();
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || '').trim() === sessionId) {
      sheet.getRange(r + 1, 4).setValue(new Date(new Date().getTime() - 24 * 60 * 60 * 1000));
      sheet.getRange(r + 1, 7).setValue('Offline');
      break;
    }
  }
  SpreadsheetApp.flush();
  return presenceList_();
}

function presenceList_() {
  var sheet = usersSheet_();
  var data = sheet.getDataRange().getValues();
  var now = new Date().getTime();
  var ttl = 90 * 1000;
  var users = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var sessionId = String(row[0] || '').trim();
    if (!sessionId) continue;
    var lastDate = row[3] instanceof Date ? row[3] : new Date(row[3]);
    var lastMs = lastDate.getTime();
    var online = !isNaN(lastMs) && (now - lastMs) <= ttl && String(row[6] || 'Online') !== 'Offline';
    users.push({
      sessionId: sessionId,
      username: String(row[1] || '-'),
      province: String(row[2] || '-'),
      lastSeen: isNaN(lastMs) ? String(row[3] || '-') : Utilities.formatDate(lastDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      version: String(row[4] || ''),
      online: online
    });
  }
  users.sort(function(a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return String(b.lastSeen).localeCompare(String(a.lastSeen));
  });
  var onlineCount = users.filter(function(u) { return u.online; }).length;
  return { ok: true, onlineCount: onlineCount, users: users, updatedAt: new Date().toISOString() };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(obj, callback) {
  var safeCallback = String(callback || '').replace(/[^a-zA-Z0-9_.$]/g, '');
  if (!safeCallback) return json_(obj);
  return ContentService
    .createTextOutput(safeCallback + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
