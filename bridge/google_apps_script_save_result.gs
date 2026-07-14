/**
 * PepsLive Dock V1 - Google Apps Script webhook
 *
 * รองรับ:
 * - saveResult: บันทึกผลการแข่งขันกลับ Google Sheet
 * - presenceHeartbeat: บันทึก/อัปเดตสถานะผู้ใช้งานออนไลน์
 * - presenceList: ดึงรายชื่อผู้ใช้งานทั้งหมด
 * - presenceOffline: ตั้งสถานะผู้ใช้ให้ offline เมื่อออกจากระบบ
 * - webhookInfo: ตรวจเวอร์ชันและฟีเจอร์ของสคริปต์ที่ deploy อยู่
 * - remoteOpen / remoteSend / remotePoll: ห้องควบคุมผ่านมือถือ
 * - scoreboardSkinRelaySet / scoreboardSkinRelayGet: relay payload ให้ PepsLive Scoreboard Skin Studio overlay
 *
 * ใช้ได้กับ GitHub Pages ผ่าน JSONP doGet(e)
 */
var PEPSLIVE_WEBHOOK_VERSION = '2026-07-14.1';
var PEPSLIVE_SPREADSHEET_ID_KEY = 'PEPSLIVE_SPREADSHEET_ID';
var PEPSLIVE_WEBHOOK_TOKEN_KEY = 'PEPSLIVE_WEBHOOK_TOKEN';
var SCOREBOARD_SKIN_RELAY_PROPERTY_KEY = 'pepslive_scoreboard_skin_state_v1';
var PEPSLIVE_MATCH_SCHEMA = [
  'MatchID','LogoA','TeamA','LogoB','TeamB',
  'Label1','Label2','Label3','Label4','Label5',
  'ScoreA','ScoreB','FinalScore','MatchStatus','Winner',
  'FinishedAt','UpdatedAt','UpdatedBy','Note',
  'TeamA_PrimaryColor','TeamA_SecondaryColor',
  'TeamB_PrimaryColor','TeamB_SecondaryColor',
  'Revision','LastOperationID'
];
var PEPSLIVE_COLOR_FIELDS = ['TeamA_PrimaryColor','TeamA_SecondaryColor','TeamB_PrimaryColor','TeamB_SecondaryColor'];
var PEPSLIVE_OPERATION_SCHEMA = ['OperationID','TargetMatchID','ContractVersion','OperationType','BaseRevision','AppliedRevision','PayloadHash','PatchJSON','SnapshotJSON','ClientID','ClientCreatedAt','Actor','RecordedAt'];
var PEPSLIVE_SYSTEM_SHEETS = {
  PepsLiveConfig: true,
  PepsLiveUsers: true,
  PepsLiveRemote: true,
  PepsLiveRemoteState: true,
  PepsLiveRemoteDevices: true,
  PepsLiveOperations: true
};

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('PepsLive')
      .addItem('Install / Repair Sheet', 'pepsliveInstall')
      .addItem('Repair Sheet Schema', 'pepsliveRepair')
      .addItem('Pick OBS Color', 'pepsliveOpenColorPicker')
      .addItem('Generate Webhook Token', 'pepsliveGenerateWebhookToken')
      .addItem('Show Setup Status', 'pepsliveShowSetup')
      .addToUi();
  } catch (err) {}
}

function pepsliveInstall() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('open_this_script_from_the_target_google_sheet');
  PropertiesService.getScriptProperties().setProperty(PEPSLIVE_SPREADSHEET_ID_KEY, ss.getId());
  var result = setupRepair_({ skipTokenCheck: true });
  pepsliveAlert_(
    'PepsLive install complete',
    'Spreadsheet: ' + result.spreadsheetName + '\n' +
    'Match sheet: ' + result.matchSheet + '\n' +
    'Schema: ' + (result.missingColumns.length ? 'missing ' + result.missingColumns.join(', ') : 'OK') + '\n' +
    'Deploy this Apps Script as a Web App, then paste the Web App URL into PepsLive Dock.'
  );
  return result;
}

function pepsliveRepair() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getScriptProperties().setProperty(PEPSLIVE_SPREADSHEET_ID_KEY, ss.getId());
  var result = setupRepair_({ skipTokenCheck: true });
  pepsliveAlert_('PepsLive repair complete', 'Schema and support sheets are ready.');
  return result;
}

function pepsliveGenerateWebhookToken() {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperty(PEPSLIVE_WEBHOOK_TOKEN_KEY, token);
  try {
    var ss = targetSpreadsheet_();
    writeConfigSheet_(ss, token);
  } catch (err) {}
  pepsliveAlert_(
    'Webhook token generated',
    'Copy this token into PepsLive Dock > Settings > Sheet > Webhook Token:\n\n' + token
  );
  return token;
}

function pepsliveShowSetup() {
  var result = setupCheck_();
  pepsliveAlert_(
    'PepsLive setup status',
    'Ready: ' + (result.ok ? 'YES' : 'NO') + '\n' +
    'Spreadsheet: ' + (result.spreadsheetName || '-') + '\n' +
    'Match sheet: ' + (result.matchSheet || '-') + '\n' +
    'Missing columns: ' + ((result.missingColumns || []).join(', ') || '-') + '\n' +
    'Webhook token: ' + (result.tokenEnabled ? 'enabled' : 'not set')
  );
  return result;
}

function pepsliveAlert_(title, message) {
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (err) {}
}

function parseJson_(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || '{}'));
  } catch (err) {
    return fallback || {};
  }
}

function requestPayload_(payload) {
  if (!payload) return {};
  var body = parseJson_(payload.payload != null ? payload.payload : payload, {});
  if (payload.token != null && body.token == null) body.token = payload.token;
  if (payload.authToken != null && body.authToken == null) body.authToken = payload.authToken;
  return body;
}

function scriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function targetSpreadsheet_() {
  var props = scriptProperties_();
  var id = String(props.getProperty(PEPSLIVE_SPREADSHEET_ID_KEY) || '').trim();
  if (id) return SpreadsheetApp.openById(id);

  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {}
  if (ss) {
    props.setProperty(PEPSLIVE_SPREADSHEET_ID_KEY, ss.getId());
    return ss;
  }
  throw new Error('run_pepslive_install_first');
}

function webhookToken_() {
  var propsToken = String(scriptProperties_().getProperty(PEPSLIVE_WEBHOOK_TOKEN_KEY) || '').trim();
  if (propsToken) return propsToken;
  try {
    return String(configValue_('WebhookToken') || '').trim();
  } catch (err) {
    return '';
  }
}

function assertWebhookToken_(payload) {
  var expected = webhookToken_();
  if (!expected) return true;
  payload = payload || {};
  var actual = String(payload.token || payload.authToken || '').trim();
  if (actual !== expected) throw new Error('invalid_webhook_token');
  return true;
}

function authorizedPayload_(payload) {
  payload = payload || {};
  assertWebhookToken_(payload);
  return payload;
}

function configValue_(key) {
  var ss = targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveConfig');
  if (!sheet) return '';
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === key) return values[i][1];
  }
  return '';
}

function writeConfigSheet_(ss, token) {
  ss = ss || targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveConfig');
  if (!sheet) sheet = ss.insertSheet('PepsLiveConfig');
  var currentToken = token != null ? String(token || '') : String(configValueSafe_(ss, 'WebhookToken') || '');
  var rows = [
    ['Key', 'Value', 'Note'],
    ['SpreadsheetId', ss.getId(), 'Created by PepsLive > Install / Repair Sheet.'],
    ['WebhookToken', currentToken, 'Optional. If filled, paste the same token into PepsLive Dock settings.'],
    ['WebhookVersion', PEPSLIVE_WEBHOOK_VERSION, 'Expected Apps Script webhook version.']
  ];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  return sheet;
}

function configValueSafe_(ss, key) {
  try {
    var sheet = ss.getSheetByName('PepsLiveConfig');
    if (!sheet) return '';
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0] || '').trim() === key) return values[i][1];
    }
  } catch (err) {}
  return '';
}

function matchSheet_(ss) {
  ss = ss || targetSpreadsheet_();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var first = sheets[i].getLastColumn() ? sheets[i].getRange(1, 1, 1, sheets[i].getLastColumn()).getValues()[0] : [];
    var headers = first.map(function(h) { return String(h || '').trim(); });
    if (headers.indexOf('MatchID') !== -1) return sheets[i];
  }
  for (var j = 0; j < sheets.length; j++) {
    if (!PEPSLIVE_SYSTEM_SHEETS[sheets[j].getName()]) return sheets[j];
  }
  return ss.insertSheet('Matches');
}

function ensureMatchSchema_(sheet, repair) {
  var schema = PEPSLIVE_MATCH_SCHEMA;
  var width = Math.max(sheet.getLastColumn(), schema.length);
  var first = width ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  var headers = first.map(function(h) { return String(h || '').trim(); });
  var blankHeader = headers.join('').trim() === '';
  if (blankHeader) {
    sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
    return { missing: [], repaired: true };
  }
  var missing = schema.filter(function(h) { return headers.indexOf(h) === -1; });
  if (repair && missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    missing = [];
  }
  return { missing: missing, repaired: repair };
}

function operationsSheet_(ss) {
  ss = ss || targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveOperations');
  if (!sheet) sheet = ss.insertSheet('PepsLiveOperations');
  var headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), PEPSLIVE_OPERATION_SCHEMA.length)).getValues()[0] : [];
  var current = headers.map(function(h) { return String(h || '').trim(); });
  if (current.join('').trim() === '') {
    sheet.getRange(1, 1, 1, PEPSLIVE_OPERATION_SCHEMA.length).setValues([PEPSLIVE_OPERATION_SCHEMA]);
  } else {
    var missing = PEPSLIVE_OPERATION_SCHEMA.filter(function(h) { return current.indexOf(h) === -1; });
    if (missing.length) sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function normalizeColor_(value, allowBlank) {
  var text = String(value == null ? '' : value).trim().toUpperCase();
  if (!text && allowBlank) return '';
  if (text.charAt(0) !== '#') text = '#' + text;
  if (/^#[0-9A-F]{3}$/.test(text)) text = '#' + text.slice(1).split('').map(function(ch) { return ch + ch; }).join('');
  if (!/^#[0-9A-F]{6}$/.test(text)) throw new Error('invalid_color: ' + String(value));
  return text;
}

function colorTextColor_(hex) {
  if (!/^#[0-9A-F]{6}$/i.test(String(hex || ''))) return '#20242B';
  var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#FFFFFF';
}

function formatMatchColorColumns_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h || '').trim(); });
  PEPSLIVE_COLOR_FIELDS.forEach(function(field) {
    var col = headers.indexOf(field) + 1;
    if (col < 1) return;
    var range = sheet.getRange(2, col, sheet.getLastRow() - 1, 1), values = range.getValues();
    var backgrounds = [], fonts = [];
    values.forEach(function(row) {
      var raw = String(row[0] || '').trim();
      if (!raw) { backgrounds.push(['#FFFFFF']); fonts.push(['#20242B']); return; }
      try { var color = normalizeColor_(raw, true); backgrounds.push([color]); fonts.push([colorTextColor_(color)]); }
      catch (err) { backgrounds.push(['#FFE7EA']); fonts.push(['#B42335']); }
    });
    range.setNumberFormat('@').setBackgrounds(backgrounds).setFontColors(fonts);
    sheet.setColumnWidth(col, 150);
  });
}

function inspectMatchData_(sheet) {
  var issues = [];
  if (!sheet || sheet.getLastRow() < 2) return issues;
  var data = sheet.getDataRange().getValues(), headers = data[0].map(function(h) { return String(h || '').trim(); });
  var matchCol = headers.indexOf('MatchID'), revisionCol = headers.indexOf('Revision'), seen = {};
  for (var r = 1; r < data.length; r++) {
    var matchId = matchCol >= 0 ? String(data[r][matchCol] || '').trim() : '';
    if (!matchId) { issues.push('row ' + (r + 1) + ': missing MatchID'); continue; }
    if (seen[matchId]) issues.push('row ' + (r + 1) + ': duplicate MatchID ' + matchId);
    seen[matchId] = true;
    PEPSLIVE_COLOR_FIELDS.forEach(function(field) {
      var col = headers.indexOf(field), raw = col >= 0 ? String(data[r][col] || '').trim() : '';
      if (raw) try { normalizeColor_(raw, true); } catch (err) { issues.push('row ' + (r + 1) + ': invalid ' + field); }
    });
    if (revisionCol >= 0 && String(data[r][revisionCol] || '').trim() !== '' && (!isFinite(Number(data[r][revisionCol])) || Number(data[r][revisionCol]) < 0)) issues.push('row ' + (r + 1) + ': invalid Revision');
    if (issues.length >= 50) break;
  }
  return issues;
}

function setupCheck_() {
  try {
    var ss = targetSpreadsheet_();
    var sheet = matchSheet_(ss);
    var schema = ensureMatchSchema_(sheet, false);
    var dataIssues = schema.missing.length ? [] : inspectMatchData_(sheet);
    return {
      ok: !schema.missing.length && !dataIssues.length,
      version: PEPSLIVE_WEBHOOK_VERSION,
      spreadsheetReady: true,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      matchSheet: sheet.getName(),
      missingColumns: schema.missing,
      dataIssues: dataIssues,
      tokenEnabled: !!webhookToken_(),
      sheets: {
        config: !!ss.getSheetByName('PepsLiveConfig'),
        users: !!ss.getSheetByName('PepsLiveUsers'),
        remote: !!ss.getSheetByName('PepsLiveRemote'),
        remoteState: !!ss.getSheetByName('PepsLiveRemoteState'),
        remoteDevices: !!ss.getSheetByName('PepsLiveRemoteDevices'),
        operations: !!ss.getSheetByName('PepsLiveOperations')
      }
    };
  } catch (err) {
    return {
      ok: false,
      version: PEPSLIVE_WEBHOOK_VERSION,
      spreadsheetReady: false,
      error: String(err && err.message || err),
      missingColumns: PEPSLIVE_MATCH_SCHEMA
    };
  }
}

function setupRepair_(options) {
  options = options || {};
  if (!options.skipTokenCheck) assertWebhookToken_(options);
  var ss = targetSpreadsheet_();
  scriptProperties_().setProperty(PEPSLIVE_SPREADSHEET_ID_KEY, ss.getId());
  writeConfigSheet_(ss);
  var sheet = matchSheet_(ss);
  ensureMatchSchema_(sheet, true);
  formatMatchColorColumns_(sheet);
  operationsSheet_(ss);
  usersSheet_();
  remoteSheet_();
  remoteStateSheet_();
  remoteDevicesSheet_();
  return setupCheck_();
}

function doPost(e) {
  try {
    var payload = parseJson_((e && e.postData && e.postData.contents) || '{}', {});
    var action = String(payload.action || '').trim();
    if (action === 'webhookInfo') return json_(webhookInfo_());
    if (action === 'setupCheck') return json_(setupCheck_());
    if (action === 'setupRepair') return json_(setupRepair_(requestPayload_(payload)));
    if (action === 'remoteOpen') return json_(remoteOpen_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'remoteSend') return json_(remoteSend_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'remotePoll') return json_(remotePoll_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'remoteStateSet') return json_(remoteStateSet_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'remoteStateGet') return json_(remoteStateGet_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'remotePing') return json_(remotePing_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'scoreboardSkinRelaySet') return json_(scoreboardSkinRelaySet_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'scoreboardSkinRelayGet') return json_(scoreboardSkinRelayGet_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'presenceHeartbeat') return json_(presenceHeartbeat_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'presenceList') return json_(presenceList_(authorizedPayload_(requestPayload_(payload))));
    if (action === 'presenceOffline') return json_(presenceOffline_(authorizedPayload_(requestPayload_(payload))));
    return json_(saveResult_(authorizedPayload_(requestPayload_(payload))));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  var callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  try {
    var action = String((e && e.parameter && e.parameter.action) || '').trim();
    var payload = parseJson_(String((e && e.parameter && e.parameter.payload) || '{}'), {});
    if (e && e.parameter && e.parameter.token != null && payload.token == null) payload.token = e.parameter.token;
    if (e && e.parameter && e.parameter.authToken != null && payload.authToken == null) payload.authToken = e.parameter.authToken;
    if (action === 'webhookInfo') return jsonp_(webhookInfo_(), callback);
    if (action === 'setupCheck') return jsonp_(setupCheck_(), callback);
    if (action === 'setupRepair') return jsonp_(setupRepair_(payload), callback);
    if (action === 'remoteOpen') return jsonp_(remoteOpen_(authorizedPayload_(payload)), callback);
    if (action === 'remoteSend') return jsonp_(remoteSend_(authorizedPayload_(payload)), callback);
    if (action === 'remotePoll') return jsonp_(remotePoll_(authorizedPayload_(payload)), callback);
    if (action === 'remoteStateSet') return jsonp_(remoteStateSet_(authorizedPayload_(payload)), callback);
    if (action === 'remoteStateGet') return jsonp_(remoteStateGet_(authorizedPayload_(payload)), callback);
    if (action === 'remotePing') return jsonp_(remotePing_(authorizedPayload_(payload)), callback);
    if (action === 'scoreboardSkinRelaySet') return jsonp_(scoreboardSkinRelaySet_(authorizedPayload_(payload)), callback);
    if (action === 'scoreboardSkinRelayGet') return jsonp_(scoreboardSkinRelayGet_(authorizedPayload_(payload)), callback);
    if (action === 'saveResult') return jsonp_(saveResult_(authorizedPayload_(payload)), callback);
    if (action === 'presenceHeartbeat') return jsonp_(presenceHeartbeat_(authorizedPayload_(payload)), callback);
    if (action === 'presenceList') return jsonp_(presenceList_(authorizedPayload_(payload)), callback);
    if (action === 'presenceOffline') return jsonp_(presenceOffline_(authorizedPayload_(payload)), callback);
    throw new Error('unsupported_action: ' + action);
  } catch (err) {
    return jsonp_({ ok: false, error: String(err && err.message || err) }, callback);
  }
}

function webhookInfo_() {
  return {
    ok: true,
    app: 'PepsLive Dock Apps Script Webhook',
    version: PEPSLIVE_WEBHOOK_VERSION,
    serverTime: new Date().toISOString(),
    features: {
      saveResult: true,
      teamNameSave: true,
      presenceHeartbeat: true,
      presenceList: true,
      presenceOffline: true,
      offlineAt: true,
      firstSeen: true,
      mobileRemote: true,
      mobileRemoteFallback: true,
      mobileRemoteState: true,
      mobileRemotePresence: true,
      scoreboardSkinRelay: true,
      setupCheck: true,
      setupRepair: true,
      spreadsheetIdBinding: true,
      optionalWebhookToken: true,
      matchDataV2: true,
      teamColors: true,
      idempotentSave: true,
      optimisticRevision: true,
      immutableOperationLog: true,
      sheetColorPicker: true
    },
    setup: setupCheck_()
  };
}

function stableJson_(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson_).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function(key) { return JSON.stringify(key) + ':' + stableJson_(value[key]); }).join(',') + '}';
}

function sha256Hex_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) { var n = byte < 0 ? byte + 256 : byte; return ('0' + n.toString(16)).slice(-2); }).join('');
}

function rowSnapshot_(headers, row) {
  var out = {};
  PEPSLIVE_MATCH_SCHEMA.forEach(function(field) { var col = headers.indexOf(field); if (col >= 0) out[field] = row[col]; });
  return out;
}

function findOperation_(sheet, operationId) {
  if (!operationId || sheet.getLastRow() < 2) return null;
  var data = sheet.getDataRange().getValues(), headers = data[0].map(function(h) { return String(h || '').trim(); }), idCol = headers.indexOf('OperationID');
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][idCol] || '').trim() !== operationId) continue;
    var record = {};
    headers.forEach(function(header, index) { record[header] = data[r][index]; });
    return record;
  }
  return null;
}

function appendOperation_(sheet, record) {
  sheet.appendRow(PEPSLIVE_OPERATION_SCHEMA.map(function(field) { return record[field] == null ? '' : record[field]; }));
}

function projectMatchSnapshot_(sheet, rowIndex, headers, snapshot) {
  var range = sheet.getRange(rowIndex, 1, 1, headers.length), row = range.getValues()[0], formulas = range.getFormulas()[0];
  var writable = ['TeamA','TeamB','ScoreA','ScoreB','FinalScore','MatchStatus','Winner','FinishedAt','UpdatedAt','UpdatedBy','Note'].concat(PEPSLIVE_COLOR_FIELDS).concat(['Revision','LastOperationID']);
  writable.forEach(function(field) { var col = headers.indexOf(field); if (col >= 0 && Object.prototype.hasOwnProperty.call(snapshot, field)) row[col] = snapshot[field]; });
  for (var i = 0; i < row.length; i++) if (formulas[i] && writable.indexOf(headers[i]) === -1) row[i] = formulas[i];
  range.setValues([row]);
  PEPSLIVE_COLOR_FIELDS.forEach(function(field) {
    var col = headers.indexOf(field), color = snapshot[field];
    if (col < 0) return;
    var cell = sheet.getRange(rowIndex, col + 1);
    if (color) cell.setBackground(color).setFontColor(colorTextColor_(color)); else cell.setBackground('#FFFFFF').setFontColor('#20242B');
  });
}

function saveResult_(payload) {
  payload = payload || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'save_busy_retry' };
  try {
    var values = payload.values || {}, matchId = String(payload.matchId || '').trim(), contractVersion = Number(payload.contractVersion || 1) || 1;
    if (!matchId) return { ok: false, error: 'missing_matchId' };
    var sheet = matchSheet_();
    ensureMatchSchema_(sheet, true);
    var data = sheet.getDataRange().getValues();
    if (!data.length) return { ok: false, error: 'empty_sheet' };
    var headers = data[0].map(function(h) { return String(h || '').trim(); }), matchIdCol = headers.indexOf('MatchID'), rowIndex = -1, rowData = null, matchingRows = [];
    for (var r = 1; r < data.length; r++) if (String(data[r][matchIdCol] || '').trim() === matchId) matchingRows.push(r);
    if (matchingRows.length > 1) return { ok: false, error: 'duplicate_match_id', matchId: matchId, rows: matchingRows.map(function(index) { return index + 1; }) };
    if (matchingRows.length === 1) { rowIndex = matchingRows[0] + 1; rowData = data[matchingRows[0]]; }
    if (rowIndex < 0) return { ok: false, error: 'match_not_found', matchId: matchId };

    var writable = ['TeamA','TeamB','ScoreA','ScoreB','FinalScore','MatchStatus','Winner','FinishedAt','UpdatedAt','UpdatedBy','Note'].concat(PEPSLIVE_COLOR_FIELDS), patch = {};
    writable.forEach(function(field) {
      if (!Object.prototype.hasOwnProperty.call(values, field)) return;
      if (contractVersion >= 2 && values[field] === null) throw new Error('null_not_allowed: ' + field);
      if (values[field] == null) return;
      patch[field] = PEPSLIVE_COLOR_FIELDS.indexOf(field) >= 0 ? normalizeColor_(values[field], true) : values[field];
    });
    ['ScoreA','ScoreB'].forEach(function(field) { if (Object.prototype.hasOwnProperty.call(patch, field)) { var score = Number(patch[field]); if (!isFinite(score) || score < 0) throw new Error('invalid_score: ' + field); patch[field] = Math.floor(score); } });

    var current = rowSnapshot_(headers, rowData), currentRevision = Number(current.Revision || 0) || 0;
    var hashInput = { contractVersion: contractVersion, matchId: matchId, baseRevision: payload.baseRevision, patch: patch };
    var payloadHash = sha256Hex_(stableJson_(hashInput));
    var operationId = String(payload.operationId || ('legacy-' + payloadHash.slice(0, 32))).trim();
    var operations = operationsSheet_(), existing = findOperation_(operations, operationId);
    if (existing) {
      if (String(existing.PayloadHash || '') !== payloadHash) return { ok: false, error: 'idempotency_key_reused', operationId: operationId };
      var existingSnapshot = parseJson_(existing.SnapshotJSON, {});
      var existingRevision = Number(existing.AppliedRevision || 0) || 0;
      var duplicateAck = { ok: true, duplicate: true, applied: false, row: rowIndex, matchId: matchId, operationId: operationId, baseRevision: Number(existing.BaseRevision || 0), revision: existingRevision, saved: parseJson_(existing.PatchJSON, {}), savedAt: existing.RecordedAt || new Date().toISOString() };
      if (currentRevision === existingRevision && String(current.LastOperationID || '') === operationId) {
        duplicateAck.outcome = 'duplicate_exact';
        return duplicateAck;
      }
      if (currentRevision < existingRevision) {
        projectMatchSnapshot_(sheet, rowIndex, headers, existingSnapshot);
        SpreadsheetApp.flush();
        duplicateAck.applied = true;
        duplicateAck.outcome = 'duplicate_recovered';
        return duplicateAck;
      }
      if (currentRevision > existingRevision) {
        duplicateAck.outcome = 'duplicate_superseded';
        duplicateAck.superseded = true;
        duplicateAck.revision = currentRevision;
        duplicateAck.currentRevision = currentRevision;
        duplicateAck.current = current;
        return duplicateAck;
      }
      return { ok: false, error: 'revision_conflict', matchId: matchId, operationId: operationId, currentRevision: currentRevision, current: current };
    }

    if (contractVersion >= 2) {
      var baseRevision = Number(payload.baseRevision);
      if (!isFinite(baseRevision)) return { ok: false, error: 'missing_baseRevision', currentRevision: currentRevision };
      if (baseRevision !== currentRevision) return { ok: false, error: 'revision_conflict', currentRevision: currentRevision, current: current };
    }

    var snapshot = {};
    Object.keys(current).forEach(function(key) { snapshot[key] = current[key]; });
    Object.keys(patch).forEach(function(key) { snapshot[key] = patch[key]; });
    if (Object.prototype.hasOwnProperty.call(patch, 'ScoreA') || Object.prototype.hasOwnProperty.call(patch, 'ScoreB')) {
      var a = Number(snapshot.ScoreA || 0) || 0, b = Number(snapshot.ScoreB || 0) || 0;
      snapshot.FinalScore = a + '-' + b;
      snapshot.Winner = a > b ? String(snapshot.TeamA || '') : b > a ? String(snapshot.TeamB || '') : 'DRAW';
      patch.FinalScore = snapshot.FinalScore;
      patch.Winner = snapshot.Winner;
    }
    var appliedRevision = currentRevision + 1, recordedAt = new Date().toISOString();
    snapshot.Revision = appliedRevision;
    snapshot.LastOperationID = operationId;
    appendOperation_(operations, {
      OperationID: operationId,
      TargetMatchID: matchId,
      ContractVersion: contractVersion,
      OperationType: String(payload.operationType || 'MATCH_SAVE'),
      BaseRevision: currentRevision,
      AppliedRevision: appliedRevision,
      PayloadHash: payloadHash,
      PatchJSON: JSON.stringify(patch),
      SnapshotJSON: JSON.stringify(snapshot),
      ClientID: String(payload.clientId || payload.deviceId || ''),
      ClientCreatedAt: String(payload.clientCreatedAt || ''),
      Actor: String(patch.UpdatedBy || ''),
      RecordedAt: recordedAt
    });
    projectMatchSnapshot_(sheet, rowIndex, headers, snapshot);
    SpreadsheetApp.flush();
    return { ok: true, duplicate: false, applied: true, outcome: 'applied', row: rowIndex, matchId: matchId, operationId: operationId, baseRevision: currentRevision, revision: appliedRevision, saved: patch, savedAt: recordedAt };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  } finally {
    lock.releaseLock();
  }
}

function pepsliveGetColorPickerData() {
  var sheet = matchSheet_();
  ensureMatchSchema_(sheet, true);
  var data = sheet.getDataRange().getValues(), headers = data[0].map(function(h) { return String(h || '').trim(); });
  var defaults = { TeamA_PrimaryColor:'#FF6A00', TeamA_SecondaryColor:'#111111', TeamB_PrimaryColor:'#0057FF', TeamB_SecondaryColor:'#FFFFFF' };
  var matches = [];
  for (var r = 1; r < data.length; r++) {
    var matchId = String(data[r][headers.indexOf('MatchID')] || '').trim();
    if (!matchId) continue;
    var item = { matchId:matchId, teamA:String(data[r][headers.indexOf('TeamA')] || 'TEAM A'), teamB:String(data[r][headers.indexOf('TeamB')] || 'TEAM B'), revision:Number(data[r][headers.indexOf('Revision')] || 0) || 0, colors:{} };
    PEPSLIVE_COLOR_FIELDS.forEach(function(field) {
      var raw = String(data[r][headers.indexOf(field)] || '').trim();
      try { item.colors[field] = raw ? normalizeColor_(raw, true) : defaults[field]; }
      catch (err) { item.colors[field] = defaults[field]; }
    });
    matches.push(item);
  }
  return { ok:true, sheetName:sheet.getName(), matches:matches, colorFields:PEPSLIVE_COLOR_FIELDS };
}

function pepsliveSaveTeamColors(input) {
  input = input || {};
  var matchId = String(input.matchId || '').trim(), colors = input.colors || {};
  if (!matchId) return { ok:false, error:'missing_matchId' };
  var values = { UpdatedAt:new Date().toISOString(), UpdatedBy:'Google Sheet Pick OBS Color' };
  PEPSLIVE_COLOR_FIELDS.forEach(function(field) { values[field] = normalizeColor_(colors[field], false); });
  return saveResult_({
    contractVersion:2,
    operationType:'SHEET_COLOR_PICK',
    operationId:'sheet-color-' + Utilities.getUuid(),
    clientId:'google-sheet-sidebar',
    clientCreatedAt:new Date().toISOString(),
    baseRevision:Number(input.revision || 0) || 0,
    matchId:matchId,
    values:values
  });
}

function pepsliveOpenColorPicker() {
  var html = HtmlService.createHtmlOutput(`
<!doctype html><html lang="th"><head><base target="_top"><style>
*{box-sizing:border-box}body{margin:0;background:#0B0F15;color:#F5F7FB;font:13px Arial,sans-serif}.app{padding:14px;display:grid;gap:12px}h1{font-size:18px;margin:0;color:#FF7A35}p{margin:3px 0 0;color:#AAB3C1;line-height:1.45}label{display:grid;gap:5px;font-weight:700}select,input,button{min-height:40px;border-radius:6px;border:1px solid #343D4B;background:#121821;color:#F5F7FB;padding:8px}select,input[type=text]{width:100%}.slot{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:7px;align-items:end;padding:9px;border:1px solid #2B3441;border-radius:7px;background:#10151D}.slot label{font-size:11px}.slot input[type=color]{width:42px;padding:3px}.pick{white-space:nowrap;background:#1B2533;color:#BFEFFF}.actions{display:grid;grid-template-columns:1fr auto;gap:8px}.save{background:#F06A2C;border-color:#FF8B55;font-weight:800}.close{background:#171D26}.status{min-height:36px;padding:9px;border-radius:6px;background:#121821;color:#AAB3C1}.status.ok{color:#8EE9BC;border:1px solid #2B7955}.status.bad{color:#FFB6C1;border:1px solid #8C3343}.hint{font-size:11px;color:#8792A3}
</style></head><body><div class="app"><div><h1>Pick OBS Color</h1><p>เตรียมสีทีมล่วงหน้า สี HEX เดียวกันจะถูกใช้ใน Sheet, Dock และ OBS</p></div><label>คู่แข่งขัน<select id="match"></select></label><div id="slots"></div><div id="status" class="status">กำลังโหลดข้อมูล...</div><div class="actions"><button id="save" class="save">บันทึกสีทั้ง 4 ช่อง</button><button id="close" class="close">ปิด</button></div><div class="hint">ปุ่มหลอดดูดสีใช้ EyeDropper ของเบราว์เซอร์ หากถูกบล็อกยังเลือกจากช่องสีหรือกรอก #RRGGBB ได้</div></div><script>
const fields=[['TeamA_PrimaryColor','ทีม A สีหลัก'],['TeamA_SecondaryColor','ทีม A สีรอง'],['TeamB_PrimaryColor','ทีม B สีหลัก'],['TeamB_SecondaryColor','ทีม B สีรอง']];let matches=[],current=null;
const byId=id=>document.getElementById(id);const valid=v=>/^#[0-9A-F]{6}$/i.test(String(v||''));
function status(text,tone=''){const el=byId('status');el.textContent=text;el.className='status '+tone}
function setColor(field,value){const color=valid(value)?String(value).toUpperCase():'#FFFFFF';byId('color_'+field).value=color;byId('hex_'+field).value=color}
function renderSlots(){byId('slots').innerHTML=fields.map(([field,label])=>'<div class="slot"><input id="color_'+field+'" type="color" aria-label="'+label+'"><label>'+label+'<input id="hex_'+field+'" type="text" maxlength="7" value="#FFFFFF"></label><button class="pick" data-pick="'+field+'">หลอดดูดสี</button></div>').join('');fields.forEach(([field])=>{byId('color_'+field).oninput=e=>setColor(field,e.target.value);byId('hex_'+field).onchange=e=>{if(valid(e.target.value))setColor(field,e.target.value);else status('HEX ไม่ถูกต้อง: '+field,'bad')}});document.querySelectorAll('[data-pick]').forEach(button=>button.onclick=()=>pick(button.dataset.pick))}
function selectMatch(){current=matches.find(item=>item.matchId===byId('match').value)||matches[0];if(!current)return;fields.forEach(([field])=>setColor(field,current.colors[field]));status(current.teamA+' vs '+current.teamB+' | Revision '+current.revision)}
async function pick(field){if(!window.EyeDropper){status('เบราว์เซอร์นี้ไม่อนุญาตหลอดดูดสี ให้ใช้ช่องสีหรือ HEX','bad');return}try{status('คลิกสีที่ต้องการบนหน้าจอ...');const result=await new EyeDropper().open();setColor(field,result.sRGBHex);status('เลือก '+result.sRGBHex.toUpperCase()+' แล้ว')}catch(err){status('ยกเลิกการดูดสี')}}
function init(data){if(!data||data.ok===false){status(data&&data.error||'โหลดข้อมูลไม่สำเร็จ','bad');return}matches=data.matches||[];renderSlots();const match=byId('match');match.replaceChildren();matches.forEach(item=>{const option=document.createElement('option');option.value=String(item.matchId||'');option.textContent='#'+String(item.matchId||'')+' '+String(item.teamA||'')+' vs '+String(item.teamB||'');match.appendChild(option)});match.onchange=selectMatch;if(!matches.length){status('ยังไม่มี MatchID ใน Sheet','bad');byId('save').disabled=true;return}selectMatch()}
byId('save').onclick=()=>{if(!current)return;const colors={};for(const [field] of fields){const value=byId('hex_'+field).value.toUpperCase();if(!valid(value)){status('กรุณาตรวจ HEX ของ '+field,'bad');return}colors[field]=value}byId('save').disabled=true;status('กำลังบันทึก...');google.script.run.withSuccessHandler(result=>{byId('save').disabled=false;if(!result||result.ok===false){status((result&&result.error)||'บันทึกไม่สำเร็จ','bad');return}current.revision=Number(result.revision||current.revision);current.colors=colors;status('บันทึกแล้ว Revision '+current.revision,'ok')}).withFailureHandler(err=>{byId('save').disabled=false;status(err&&err.message||'บันทึกไม่สำเร็จ','bad')}).pepsliveSaveTeamColors({matchId:current.matchId,revision:current.revision,colors})};
byId('close').onclick=()=>google.script.host.close();google.script.run.withSuccessHandler(init).withFailureHandler(err=>status(err&&err.message||'โหลดข้อมูลไม่สำเร็จ','bad')).pepsliveGetColorPickerData();
</script></body></html>`).setTitle('Pick OBS Color').setWidth(390);
  SpreadsheetApp.getUi().showSidebar(html);
}

function onEdit(e) {
  try {
    var range = e && e.range;
    if (!range || range.getRow() < 2 || range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
    var sheet = range.getSheet(), headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h || '').trim(); });
    var field = headers[range.getColumn() - 1];
    if (PEPSLIVE_COLOR_FIELDS.indexOf(field) === -1) return;
    var raw = String(range.getValue() || '').trim();
    if (!raw) range.setBackground('#FFFFFF').setFontColor('#20242B').clearNote();
    else {
      var color = normalizeColor_(raw, true);
      range.setValue(color).setBackground(color).setFontColor(colorTextColor_(color)).clearNote();
    }
    var revisionCol = headers.indexOf('Revision') + 1, operationCol = headers.indexOf('LastOperationID') + 1;
    if (revisionCol > 0) { var revisionCell = sheet.getRange(range.getRow(), revisionCol); revisionCell.setValue((Number(revisionCell.getValue()) || 0) + 1); }
    if (operationCol > 0) sheet.getRange(range.getRow(), operationCol).setValue('sheet-edit-' + new Date().getTime());
  } catch (err) {
    try { e.range.setBackground('#FFE7EA').setFontColor('#B42335').setNote(String(err && err.message || err)); } catch (_) {}
  }
}

function usersSheet_() {
  var ss = targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveUsers');
  if (!sheet) sheet = ss.insertSheet('PepsLiveUsers');
  var headers = ['SessionID','Username','Province','FirstSeen','LastSeen','OfflineAt','Version','UserAgent','Status','LastAction'];
  var lastColumn = Math.max(sheet.getLastColumn(), headers.length);
  var first = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var current = first.map(function(h) { return String(h || '').trim(); });
  var needsHeader = current.join('').trim() === '' || current[0] !== 'SessionID';

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  // Migrate older PepsLiveUsers sheets:
  // SessionID, Username, Province, LastSeen, Version, UserAgent, Status
  if (current.indexOf('FirstSeen') === -1 && current.indexOf('LastSeen') === 3) {
    var lastRow = sheet.getLastRow();
    var oldRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, Math.max(7, sheet.getLastColumn())).getValues() : [];
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (oldRows.length) {
      var migrated = oldRows.map(function(row) {
        var lastSeen = row[3] || '';
        return [
          row[0] || '',
          row[1] || '',
          row[2] || '',
          lastSeen,
          lastSeen,
          String(row[6] || '') === 'Offline' ? lastSeen : '',
          row[4] || '',
          row[5] || '',
          row[6] || 'Offline',
          'migrated'
        ];
      });
      sheet.getRange(2, 1, migrated.length, headers.length).setValues(migrated);
    }
    return sheet;
  }

  headers.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  return sheet;
}

function presenceHeaders_() {
  return ['SessionID','Username','Province','FirstSeen','LastSeen','OfflineAt','Version','UserAgent','Status','LastAction'];
}

function findPresenceRow_(sheet, sessionId) {
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][0] || '').trim() === sessionId) {
      return { rowIndex: r + 1, row: data[r], data: data };
    }
  }
  return { rowIndex: -1, row: null, data: data };
}

function formatPresenceDate_(value) {
  var date = value instanceof Date ? value : new Date(value);
  var ms = date.getTime();
  if (isNaN(ms)) return String(value || '');
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
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
  var found = findPresenceRow_(sheet, sessionId);
  var now = new Date();
  var firstSeen = found.row && found.row[3] ? found.row[3] : now;
  var row = [
    sessionId,
    username,
    province,
    firstSeen,
    now,
    '',
    String(payload.version || ''),
    String(payload.userAgent || ''),
    'Online',
    String(payload.lastAction || 'presenceHeartbeat')
  ];
  if (found.rowIndex < 0) sheet.appendRow(row);
  else sheet.getRange(found.rowIndex, 1, 1, row.length).setValues([row]);

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
  var found = findPresenceRow_(sheet, sessionId);
  var now = new Date();
  if (found.rowIndex > 0) {
    sheet.getRange(found.rowIndex, 5).setValue(now);
    sheet.getRange(found.rowIndex, 6).setValue(now);
    sheet.getRange(found.rowIndex, 9).setValue('Offline');
    sheet.getRange(found.rowIndex, 10).setValue(String(payload.lastAction || 'presenceOffline'));
  } else {
    sheet.appendRow([
      sessionId,
      String(payload.username || '-'),
      String(payload.province || '-'),
      now,
      now,
      now,
      String(payload.version || ''),
      String(payload.userAgent || ''),
      'Offline',
      String(payload.lastAction || 'presenceOffline')
    ]);
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
    var firstDate = row[3] instanceof Date ? row[3] : new Date(row[3]);
    var lastDate = row[4] instanceof Date ? row[4] : new Date(row[4]);
    var offlineDate = row[5] instanceof Date ? row[5] : new Date(row[5]);
    var lastMs = lastDate.getTime();
    var online = !isNaN(lastMs) && (now - lastMs) <= ttl && String(row[8] || 'Online') !== 'Offline';
    users.push({
      sessionId: sessionId,
      username: String(row[1] || '-'),
      province: String(row[2] || '-'),
      firstSeen: isNaN(firstDate.getTime()) ? String(row[3] || '') : formatPresenceDate_(firstDate),
      lastSeen: isNaN(lastMs) ? String(row[4] || '-') : formatPresenceDate_(lastDate),
      offlineAt: isNaN(offlineDate.getTime()) ? String(row[5] || '') : formatPresenceDate_(offlineDate),
      version: String(row[6] || ''),
      status: online ? 'Online' : 'Offline',
      lastAction: String(row[9] || ''),
      online: online,
      lastSeenMs: isNaN(lastMs) ? 0 : lastMs
    });
  }
  users.sort(function(a, b) {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
  });
  var onlineCount = users.filter(function(u) { return u.online; }).length;
  users.forEach(function(u) { delete u.lastSeenMs; });
  return { ok: true, onlineCount: onlineCount, users: users, updatedAt: new Date().toISOString() };
}

function remoteSheet_() {
  var ss = targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveRemote');
  if (!sheet) sheet = ss.insertSheet('PepsLiveRemote');
  var headers = ['Seq','Room','CommandID','CommandJson','Sender','CreatedAt'];
  var first = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  if (first.join('').trim() === '' || first[0] !== 'Seq') {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureRemoteHeaders_(sheet, headers) {
  var width = Math.max(sheet.getLastColumn(), headers.length);
  var first = sheet.getRange(1, 1, 1, width).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  if (first.join('').trim() === '' || first[0] !== headers[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    headers.forEach(function(header, index) {
      if (first[index] !== header) sheet.getRange(1, index + 1).setValue(header);
    });
  }
  return sheet;
}

function remoteStateSheet_() {
  var ss = targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveRemoteState');
  if (!sheet) sheet = ss.insertSheet('PepsLiveRemoteState');
  return ensureRemoteHeaders_(sheet, ['Room','RoomName','StateJson','UpdatedAt']);
}

function remoteDevicesSheet_() {
  var ss = targetSpreadsheet_();
  var sheet = ss.getSheetByName('PepsLiveRemoteDevices');
  if (!sheet) sheet = ss.insertSheet('PepsLiveRemoteDevices');
  return ensureRemoteHeaders_(sheet, ['Room','Sender','Label','Status','LastSeen','UserAgent']);
}

function remoteDeviceSummary_(room) {
  var sheet = remoteDevicesSheet_();
  var lastRow = sheet.getLastRow();
  var nowMs = new Date().getTime();
  var ttlMs = 20 * 1000;
  var devices = [];
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
    data.forEach(function(row) {
      if (String(row[0] || '').trim() !== room) return;
      var lastSeen = row[4] instanceof Date ? row[4] : new Date(row[4]);
      var lastMs = lastSeen.getTime();
      var online = String(row[3] || 'on') !== 'off' && !isNaN(lastMs) && (nowMs - lastMs) <= ttlMs;
      if (!online) return;
      devices.push({
        sender: String(row[1] || ''),
        label: String(row[2] || 'Mobile Remote'),
        lastSeen: isNaN(lastMs) ? '' : lastSeen.toISOString()
      });
    });
  }
  return { deviceCount: devices.length, devices: devices };
}

function remotePing_(payload) {
  payload = payload || {};
  var room = String(payload.room || '').trim();
  var sender = String(payload.sender || '').trim();
  if (!room) return { ok: false, error: 'missing_room' };
  if (!sender) sender = 'mobile_' + new Date().getTime();
  var sheet = remoteDevicesSheet_();
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === room && String(data[i][1] || '').trim() === sender) {
      rowIndex = i + 2;
      break;
    }
  }
  var row = [
    room,
    sender,
    String(payload.label || 'Mobile Remote'),
    String(payload.status || 'on'),
    new Date(),
    String(payload.userAgent || '')
  ];
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  SpreadsheetApp.flush();
  var summary = remoteDeviceSummary_(room);
  return { ok: true, room: room, sender: sender, deviceCount: summary.deviceCount, devices: summary.devices };
}

function remoteStateSet_(payload) {
  payload = payload || {};
  var room = String(payload.room || '').trim();
  var state = payload.state || null;
  if (!room) return { ok: false, error: 'missing_room' };
  if (!state || typeof state !== 'object') return { ok: false, error: 'missing_state' };
  var sheet = remoteStateSheet_();
  var lastRow = sheet.getLastRow();
  var data = lastRow >= 2 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues() : [];
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === room) {
      rowIndex = i + 2;
      break;
    }
  }
  var row = [room, String(state.roomName || payload.roomName || ''), JSON.stringify(state), new Date()];
  if (rowIndex > 0) sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sheet.appendRow(row);
  SpreadsheetApp.flush();
  var summary = remoteDeviceSummary_(room);
  return { ok: true, room: room, stateUpdatedAt: new Date().toISOString(), deviceCount: summary.deviceCount, devices: summary.devices };
}

function remoteStateGet_(payload) {
  payload = payload || {};
  var room = String(payload.room || '').trim();
  if (!room) return { ok: false, error: 'missing_room' };
  if (payload.sender) remotePing_(payload);
  var sheet = remoteStateSheet_();
  var lastRow = sheet.getLastRow();
  var state = null;
  var updatedAt = '';
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || '').trim() !== room) continue;
      try {
        state = JSON.parse(String(data[i][2] || '{}'));
      } catch (err) {
        return { ok: false, error: 'bad_state_json' };
      }
      updatedAt = data[i][3] instanceof Date ? data[i][3].toISOString() : String(data[i][3] || '');
      break;
    }
  }
  var summary = remoteDeviceSummary_(room);
  return { ok: true, room: room, state: state, updatedAt: updatedAt, deviceCount: summary.deviceCount, devices: summary.devices };
}

function remoteLatestSeq_(sheet, room) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 1;
  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var latest = 1;
  data.forEach(function(row) {
    if (String(row[1] || '').trim() === room) latest = Math.max(latest, Number(row[0] || 0));
  });
  return latest;
}

function remoteFindCommand_(sheet, room, id) {
  if (!id) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (String(row[1] || '').trim() === room && String(row[2] || '').trim() === id) {
      return {
        seq: Number(row[0] || 0),
        createdAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5] || '')
      };
    }
  }
  return null;
}

function remoteOpen_(payload) {
  payload = payload || {};
  var room = String(payload.room || '').trim();
  if (!room) return { ok: false, error: 'missing_room' };
  var sheet = remoteSheet_();
  var summary = remoteDeviceSummary_(room);
  return { ok: true, room: room, lastSeq: remoteLatestSeq_(sheet, room), version: PEPSLIVE_WEBHOOK_VERSION, deviceCount: summary.deviceCount, devices: summary.devices };
}

function remoteSend_(payload) {
  payload = payload || {};
  var room = String(payload.room || '').trim();
  var command = payload.command || null;
  if (!room) return { ok: false, error: 'missing_room' };
  if (!command || typeof command !== 'object') return { ok: false, error: 'missing_command' };
  var sheet = remoteSheet_();
  var seq = Math.max(2, sheet.getLastRow() + 1);
  var id = String(command.id || ('remote_' + new Date().getTime() + '_' + Math.floor(Math.random() * 100000)));
  command.id = id;
  var existing = remoteFindCommand_(sheet, room, id);
  if (existing) {
    return { ok: true, duplicate: true, room: room, seq: existing.seq, id: id, sentAt: existing.createdAt };
  }
  sheet.appendRow([
    seq,
    room,
    id,
    JSON.stringify(command),
    String(payload.sender || ''),
    new Date()
  ]);
  SpreadsheetApp.flush();
  return { ok: true, room: room, seq: seq, id: id, sentAt: new Date().toISOString() };
}

function remotePoll_(payload) {
  payload = payload || {};
  var room = String(payload.room || '').trim();
  var afterSeq = Number(payload.afterSeq || 0);
  if (!room) return { ok: false, error: 'missing_room' };
  var sheet = remoteSheet_();
  var summary = remoteDeviceSummary_(room);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, room: room, commands: [], lastSeq: 1, deviceCount: summary.deviceCount, devices: summary.devices };
  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var commands = [];
  var lastSeq = Math.max(1, afterSeq);
  data.forEach(function(row) {
    var seq = Number(row[0] || 0);
    if (String(row[1] || '').trim() !== room || seq <= afterSeq) return;
    var command = null;
    try {
      command = JSON.parse(String(row[3] || '{}'));
    } catch (err) {
      command = { action: 'invalid', error: String(err && err.message || err) };
    }
    commands.push({
      seq: seq,
      id: String(row[2] || ''),
      command: command,
      sender: String(row[4] || ''),
      createdAt: row[5] instanceof Date ? row[5].toISOString() : String(row[5] || '')
    });
    lastSeq = Math.max(lastSeq, seq);
  });
  commands.sort(function(a, b) { return a.seq - b.seq; });
  if (commands.length > 30) commands = commands.slice(commands.length - 30);
  return { ok: true, room: room, commands: commands, lastSeq: lastSeq, polledAt: new Date().toISOString(), deviceCount: summary.deviceCount, devices: summary.devices };
}

function scoreboardSkinRelaySet_(payload) {
  payload = payload || {};
  var state = payload.payload || payload.state || payload;
  if (!state || typeof state !== 'object') return { ok: false, error: 'invalid_payload' };
  if (String(state.protocol || '') !== 'PEPSLIVE_SCOREBOARD_STATE_V1') {
    return { ok: false, error: 'invalid_protocol', protocol: String(state.protocol || '') };
  }
  if (String(state.source || '') !== 'pepslive-dock') state.source = 'pepslive-dock';
  if (!state.timestamp) state.timestamp = new Date().toISOString();
  PropertiesService.getScriptProperties().setProperty(SCOREBOARD_SKIN_RELAY_PROPERTY_KEY, JSON.stringify(state));
  return {
    ok: true,
    action: 'scoreboardSkinRelaySet',
    protocol: state.protocol,
    source: state.source,
    updatedAt: new Date().toISOString()
  };
}

function scoreboardSkinRelayGet_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SCOREBOARD_SKIN_RELAY_PROPERTY_KEY);
  if (!raw) return { ok: false, error: 'no_relay_state' };
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: 'bad_relay_state_json' };
  }
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
