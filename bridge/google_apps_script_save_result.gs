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
var PEPSLIVE_WEBHOOK_VERSION = '2026-05-18.1';
var SCOREBOARD_SKIN_RELAY_PROPERTY_KEY = 'pepslive_scoreboard_skin_state_v1';

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
  return parseJson_(payload.payload != null ? payload.payload : payload, {});
}

function doPost(e) {
  try {
    var payload = parseJson_((e && e.postData && e.postData.contents) || '{}', {});
    var action = String(payload.action || '').trim();
    if (action === 'webhookInfo') return json_(webhookInfo_());
    if (action === 'remoteOpen') return json_(remoteOpen_(requestPayload_(payload)));
    if (action === 'remoteSend') return json_(remoteSend_(requestPayload_(payload)));
    if (action === 'remotePoll') return json_(remotePoll_(requestPayload_(payload)));
    if (action === 'remoteStateSet') return json_(remoteStateSet_(requestPayload_(payload)));
    if (action === 'remoteStateGet') return json_(remoteStateGet_(requestPayload_(payload)));
    if (action === 'remotePing') return json_(remotePing_(requestPayload_(payload)));
    if (action === 'scoreboardSkinRelaySet') return json_(scoreboardSkinRelaySet_(requestPayload_(payload)));
    if (action === 'scoreboardSkinRelayGet') return json_(scoreboardSkinRelayGet_());
    if (action === 'presenceHeartbeat') return json_(presenceHeartbeat_(requestPayload_(payload)));
    if (action === 'presenceList') return json_(presenceList_());
    if (action === 'presenceOffline') return json_(presenceOffline_(requestPayload_(payload)));
    return json_(saveResult_(payload));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  var callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  try {
    var action = String((e && e.parameter && e.parameter.action) || '').trim();
    var payload = parseJson_(String((e && e.parameter && e.parameter.payload) || '{}'), {});
    if (action === 'webhookInfo') return jsonp_(webhookInfo_(), callback);
    if (action === 'remoteOpen') return jsonp_(remoteOpen_(payload), callback);
    if (action === 'remoteSend') return jsonp_(remoteSend_(payload), callback);
    if (action === 'remotePoll') return jsonp_(remotePoll_(payload), callback);
    if (action === 'remoteStateSet') return jsonp_(remoteStateSet_(payload), callback);
    if (action === 'remoteStateGet') return jsonp_(remoteStateGet_(payload), callback);
    if (action === 'remotePing') return jsonp_(remotePing_(payload), callback);
    if (action === 'scoreboardSkinRelaySet') return jsonp_(scoreboardSkinRelaySet_(payload), callback);
    if (action === 'scoreboardSkinRelayGet') return jsonp_(scoreboardSkinRelayGet_(), callback);
    if (action === 'saveResult') return jsonp_(saveResult_(payload), callback);
    if (action === 'presenceHeartbeat') return jsonp_(presenceHeartbeat_(payload), callback);
    if (action === 'presenceList') return jsonp_(presenceList_(), callback);
    if (action === 'presenceOffline') return jsonp_(presenceOffline_(payload), callback);
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
      scoreboardSkinRelay: true
    }
  };
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

  var resultCols = ['TeamA','TeamB','ScoreA','ScoreB','FinalScore','MatchStatus','Winner','FinishedAt','UpdatedAt','UpdatedBy','Note'];
  resultCols.forEach(function(h) {
    if (values[h] == null) return;
    var col = headers.indexOf(h) + 1;
    if (col > 0) sheet.getRange(rowIndex, col).setValue(values[h]);
  });

  SpreadsheetApp.flush();
  return { ok: true, row: rowIndex, matchId: matchId, saved: values, savedAt: new Date().toISOString() };
}

function usersSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PepsLiveRemoteState');
  if (!sheet) sheet = ss.insertSheet('PepsLiveRemoteState');
  return ensureRemoteHeaders_(sheet, ['Room','RoomName','StateJson','UpdatedAt']);
}

function remoteDevicesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
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
