export const ROOM_ROOT = "matchRoomsV1";
export const ROOM_CODE_PATTERN = /^\d{6}$/;
export const MAX_SCHEDULE_ITEMS = 1000;

const ALLOWED_SPORTS = new Set(["football", "basket3", "basket5"]);
const ALLOWED_CLOCK_MODES = new Set(["up", "down"]);
const ALLOWED_STATUSES = new Set([
  "LIVE",
  "BREAK",
  "HALF TIME",
  "FULL TIME",
  "COMING UP",
  "CLOSED"
]);

function text(value, maxLength, fallback = "") {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return (normalized || fallback).slice(0, maxLength);
}

function integer(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function color(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : "";
}

function encodeKey(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function sanitizeRoomCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

export function randomRoomCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

export function safeMatchKey(matchId) {
  const normalized = text(matchId, 160);
  return normalized ? `m_${encodeKey(normalized).slice(0, 96)}` : "current";
}

export function safeEventKey(eventId) {
  const normalized = text(eventId, 200);
  return `e_${encodeKey(normalized || `${Date.now()}`).slice(0, 108)}`;
}

function firstValue(input, ...keys) {
  for (const key of keys) {
    if (input && input[key] !== undefined && input[key] !== null) return input[key];
  }
  return "";
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function scoreValue(value) {
  if (!hasValue(value)) return null;
  const normalized = String(value).trim();
  if (!/^\d{1,3}$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return parsed >= 0 && parsed <= 999 ? parsed : null;
}

export function normalizeScheduleItem(input = {}, order = 0) {
  const matchId = text(firstValue(input, "matchId", "MatchID"), 160, String(order + 1));
  const rawScoreA = firstValue(input, "scoreA", "ScoreA");
  const rawScoreB = firstValue(input, "scoreB", "ScoreB");
  const rawFinalScore = text(firstValue(input, "finalScore", "FinalScore"), 32);
  const parsedFinal = rawFinalScore.match(/^\s*(\d{1,3})\s*[-:]\s*(\d{1,3})\s*$/);
  const directScoreA = scoreValue(rawScoreA);
  const directScoreB = scoreValue(rawScoreB);
  const scoreA = integer(directScoreA ?? parsedFinal?.[1], 0, 999, 0);
  const scoreB = integer(directScoreB ?? parsedFinal?.[2], 0, 999, 0);
  const matchStatus = text(firstValue(input, "matchStatus", "MatchStatus"), 50).toUpperCase();
  const hasScore = (directScoreA !== null && directScoreB !== null) || Boolean(parsedFinal);
  const hasResult = hasScore && (matchStatus === "FINISHED" || matchStatus === "FULL TIME");
  const teamAName = text(firstValue(input, "teamAName", "TeamA"), 100, "TEAM A");
  const teamBName = text(firstValue(input, "teamBName", "TeamB"), 100, "TEAM B");
  const suppliedWinner = text(firstValue(input, "winner", "Winner"), 100);
  const winner = hasResult ? (suppliedWinner || (scoreA > scoreB ? teamAName : scoreB > scoreA ? teamBName : "DRAW")) : "";

  return {
    order: integer(order, 0, MAX_SCHEDULE_ITEMS - 1, 0),
    matchKey: safeMatchKey(matchId),
    matchId,
    teamAName,
    teamBName,
    scoreA,
    scoreB,
    hasScore,
    hasResult,
    matchStatus,
    winner,
    label1: text(firstValue(input, "label1", "Label1"), 150),
    label2: text(firstValue(input, "label2", "Label2"), 150),
    label3: text(firstValue(input, "label3", "Label3"), 200),
    label4: text(firstValue(input, "label4", "Label4"), 150),
    label5: text(firstValue(input, "label5", "Label5"), 200)
  };
}

export function normalizeSchedule(input = {}) {
  const rows = Array.isArray(input) ? input : (Array.isArray(input.rows) ? input.rows : []);
  if (rows.length > MAX_SCHEDULE_ITEMS) throw new Error(`schedule_limit_${MAX_SCHEDULE_ITEMS}`);
  const sourceValue = String(Array.isArray(input) ? "" : input.source || "").trim().toLowerCase();
  const source = sourceValue === "excel" ? "excel" : rows.length ? "google" : "none";
  const items = {};
  rows.forEach((row, index) => {
    items[`i_${String(index).padStart(3, "0")}`] = normalizeScheduleItem(row, index);
  });
  return { version: 1, source, count: rows.length, items };
}

export function scheduleFingerprint(schedule = {}) {
  const canonical = JSON.stringify({
    version: Number(schedule.version || 1),
    source: String(schedule.source || "none"),
    count: Number(schedule.count || 0),
    items: schedule.items || {}
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `f_${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

export function normalizeMeta(input, timestamps = {}) {
  const roomCode = sanitizeRoomCode(input.roomCode);
  const createdAt = integer(timestamps.createdAt ?? input.createdAt, 0, Number.MAX_SAFE_INTEGER, Date.now());
  const updatedAt = integer(timestamps.updatedAt ?? input.updatedAt, createdAt, Number.MAX_SAFE_INTEGER, createdAt);
  return {
    ownerUid: text(input.ownerUid, 128),
    roomCode,
    publicView: input.publicView !== false,
    status: String(input.status || "OPEN").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN",
    eventName: text(input.eventName, 150, "PepsLive Match Room"),
    venue: text(input.venue, 200),
    round: text(input.round, 100),
    group: text(input.group, 100),
    createdAt,
    updatedAt
  };
}

export function normalizeCurrent(input, revision = 1, updatedAt = Date.now()) {
  const matchId = text(input.matchId, 160);
  const scoreA = integer(input.scoreA, 0, 999, 0);
  const scoreB = integer(input.scoreB, 0, 999, 0);
  const statusValue = text(input.status, 40, "LIVE").toUpperCase();
  const status = ALLOWED_STATUSES.has(statusValue) ? statusValue : "LIVE";
  const clockSec = integer(input.clockSec, 0, 86400, 0);
  const clockMinutes = String(Math.floor(clockSec / 60)).padStart(2, "0");
  const clockSeconds = String(clockSec % 60).padStart(2, "0");
  const sport = ALLOWED_SPORTS.has(input.sport) ? input.sport : "football";
  const clockMode = ALLOWED_CLOCK_MODES.has(input.clockMode) ? input.clockMode : "up";
  const finished = status === "FULL TIME" || String(input.matchStatus || "").toUpperCase() === "FINISHED";

  return {
    matchKey: safeMatchKey(matchId),
    matchId,
    teamAName: text(input.teamAName, 100, "TEAM A"),
    teamBName: text(input.teamBName, 100, "TEAM B"),
    scoreA,
    scoreB,
    logoA: text(input.logoA, 500),
    logoB: text(input.logoB, 500),
    teamAPrimaryColor: color(input.teamAPrimaryColor),
    teamASecondaryColor: color(input.teamASecondaryColor),
    teamBPrimaryColor: color(input.teamBPrimaryColor),
    teamBSecondaryColor: color(input.teamBSecondaryColor),
    sport,
    clockSec,
    clockText: `${clockMinutes}:${clockSeconds}`,
    clockMode,
    timerRunning: Boolean(input.timerRunning),
    period: text(input.period, 100),
    status,
    matchStatus: finished ? "FINISHED" : "LIVE",
    label1: text(input.label1, 150),
    label2: text(input.label2, 150),
    label3: text(input.label3, 200),
    label4: text(input.label4, 150),
    label5: text(input.label5, 200),
    updatedAt: integer(updatedAt, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    revision: integer(revision, 1, Number.MAX_SAFE_INTEGER, 1)
  };
}

export function formatMatchText(meta = {}, current = {}) {
  const lines = [
    text(meta.eventName, 150, "PepsLive Match Room"),
    `${text(current.teamAName, 100, "TEAM A")} ${integer(current.scoreA, 0, 999, 0)}-${integer(current.scoreB, 0, 999, 0)} ${text(current.teamBName, 100, "TEAM B")}`
  ];
  const details = [
    meta.round ? `รอบ ${text(meta.round, 100)}` : "",
    meta.group ? `กลุ่ม ${text(meta.group, 100)}` : "",
    meta.venue ? `สถานที่ ${text(meta.venue, 200)}` : ""
  ].filter(Boolean);
  if (details.length) lines.push(details.join(" | "));
  if (current.period || current.clockText) {
    lines.push([text(current.period, 100), text(current.clockText, 10)].filter(Boolean).join(" | "));
  }
  lines.push(meta.status === "CLOSED" ? "สถานะ: ปิดห้องแล้ว" : `สถานะ: ${text(current.status, 40, "LIVE")}`);
  return lines.join("\n");
}

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function excelCell(value, type = "String") {
  return `<Cell><Data ss:Type="${type}">${xml(value)}</Data></Cell>`;
}

function excelRow(values) {
  return `<Row>${values.map(([value, type]) => excelCell(value, type)).join("")}</Row>`;
}

export function buildExcelXml(meta = {}, current = {}, matches = {}) {
  const history = Object.values(matches || {}).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  const rows = [
    [["PepsLive Match Room", "String"], [meta.roomCode || "", "String"]],
    [["รายการ", "String"], [meta.eventName || "", "String"]],
    [["สถานที่", "String"], [meta.venue || "", "String"]],
    [["รอบ", "String"], [meta.round || "", "String"], ["กลุ่ม", "String"], [meta.group || "", "String"]],
    [],
    [["Match ID", "String"], ["Team A", "String"], ["Score A", "String"], ["Score B", "String"], ["Team B", "String"], ["Period", "String"], ["Status", "String"], ["Updated At", "String"]],
    [[current.matchId || "", "String"], [current.teamAName || "", "String"], [Number(current.scoreA || 0), "Number"], [Number(current.scoreB || 0), "Number"], [current.teamBName || "", "String"], [current.period || "", "String"], [current.status || "", "String"], [new Date(Number(current.updatedAt || Date.now())).toISOString(), "String"]]
  ];

  if (history.length) {
    rows.push([]);
    rows.push([["History", "String"]]);
    for (const item of history) {
      rows.push([
        [item.matchId || "", "String"],
        [item.teamAName || "", "String"],
        [Number(item.scoreA || 0), "Number"],
        [Number(item.scoreB || 0), "Number"],
        [item.teamBName || "", "String"],
        [item.period || "", "String"],
        [item.status || "", "String"],
        [new Date(Number(item.createdAt || item.updatedAt || Date.now())).toISOString(), "String"]
      ]);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Match Room"><Table>${rows.map(excelRow).join("")}</Table></Worksheet></Workbook>`;
}
