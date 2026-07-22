import { copyMatch, copyResult, copyTeams, exportExcel } from "./export.js";
import { ROOM_CODE_PATTERN, ROOM_ROOT, sanitizeRoomCode } from "./room-model.js";

const byId = (id) => document.getElementById(id);
const DEFAULT_LOGO = "../logos/default.svg";
let unsubscribe = [];
let roomCode = "";
let viewState = { meta: {}, current: null, matches: {}, schedule: emptySchedule() };
let renderedScheduleRows = [];
let scheduleNeedsRender = true;
let renderedCurrentScheduleKey = "";

function emptySchedule() {
  return { version: 0, source: "", sourceName: "", sourceTab: "", count: 0, updatedAt: 0, items: {} };
}

function normalizeSchedule(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySchedule();
  const items = value.items && typeof value.items === "object" ? value.items : {};
  return { ...emptySchedule(), ...value, items };
}

function hasScheduleItems() {
  return Object.keys(viewState.schedule?.items || {}).length > 0;
}

function cacheKey(code, part) {
  return `pepslive.matchRoom.viewerCache.v2:${code}:${part}`;
}

function legacyCacheKey(code) {
  return `pepslive.matchRoom.viewerCache.v1:${code}`;
}

function readCachePart(code, part) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey(code, part)) || "null");
    return parsed && Object.prototype.hasOwnProperty.call(parsed, "value") ? parsed.value : null;
  } catch (_) {
    return null;
  }
}

function loadCache(code) {
  const meta = readCachePart(code, "meta");
  const current = readCachePart(code, "current");
  const matches = readCachePart(code, "matches");
  const schedule = readCachePart(code, "schedule");
  const restored = [meta, current, matches, schedule].some((value) => value !== null);

  if (restored) {
    viewState = {
      meta: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {},
      current: current && typeof current === "object" && !Array.isArray(current) ? current : null,
      matches: matches && typeof matches === "object" && !Array.isArray(matches) ? matches : {},
      schedule: normalizeSchedule(schedule)
    };
  } else {
    try {
      const parsed = JSON.parse(localStorage.getItem(legacyCacheKey(code)) || "null");
      if (parsed && (parsed.current || Object.keys(parsed.schedule?.items || {}).length)) {
        viewState = {
          meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {},
          current: parsed.current || null,
          matches: parsed.matches && typeof parsed.matches === "object" ? parsed.matches : {},
          schedule: normalizeSchedule(parsed.schedule)
        };
      }
    } catch (_) {
      // A corrupt legacy cache must never block the live viewer.
    }
  }

  scheduleNeedsRender = true;
  renderedCurrentScheduleKey = "";
}

function saveCachePart(part) {
  if (!roomCode || !Object.prototype.hasOwnProperty.call(viewState, part)) return;
  try {
    localStorage.setItem(cacheKey(roomCode, part), JSON.stringify({
      value: viewState[part],
      cachedAt: Date.now()
    }));
  } catch (_) {
    // Private browsing can reject localStorage; live reads still work.
  }
}

function setConnection(state, label) {
  const element = byId("connectionState");
  element.dataset.state = state;
  element.textContent = label;
}

function setNotice(message) {
  byId("viewerNotice").textContent = message;
}

function setLogo(element, value) {
  const safe = String(value || "").trim();
  let source = DEFAULT_LOGO;
  if (/^https:\/\//i.test(safe) || /^\.\.\/logos\/[A-Za-z0-9%._~-]+$/i.test(safe)) {
    source = safe;
  } else {
    const leaf = safe.replace(/^logos\//i, "");
    if (leaf && !/[\\/]/.test(leaf)) {
      const filename = /\.(png|jpe?g|webp|svg|gif)$/i.test(leaf) ? leaf : `${leaf}.png`;
      source = `../logos/${encodeURIComponent(filename)}`;
    }
  }
  element.onerror = () => {
    element.onerror = null;
    element.src = DEFAULT_LOGO;
  };
  element.src = source;
}

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(999, Math.floor(parsed))) : 0;
}

function matchAliases(match = {}) {
  const aliases = [];
  const key = text(match.matchKey);
  const id = text(match.matchId);
  if (key) aliases.push(`key:${key}`);
  if (id) aliases.push(`id:${id}`);
  return aliases;
}

function isFinalMatch(match = {}) {
  return [match.matchStatus, match.status].some((value) => {
    const status = text(value).toUpperCase();
    return status === "FINISHED" || status === "FULL TIME" || status === "FINAL" || status === "FT";
  });
}

function newerMatch(left, right) {
  if (!left) return right;
  const leftTime = Number(left.createdAt || left.updatedAt || 0);
  const rightTime = Number(right.createdAt || right.updatedAt || 0);
  if (rightTime !== leftTime) return rightTime > leftTime ? right : left;
  return Number(right.revision || 0) >= Number(left.revision || 0) ? right : left;
}

function findByAliases(index, match) {
  for (const alias of matchAliases(match)) {
    if (index.has(alias)) return index.get(alias);
  }
  return null;
}

function mergedSchedule() {
  const scheduleItems = Object.entries(viewState.schedule?.items || {}).map(([key, item], index) => ({
    ...(item && typeof item === "object" ? item : {}),
    matchKey: text(item?.matchKey, key),
    order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index
  }));
  if (!scheduleItems.length) return [];

  const historyIndex = new Map();
  for (const history of Object.values(viewState.matches || {})) {
    if (!history || typeof history !== "object" || !isFinalMatch(history)) continue;
    const latest = newerMatch(findByAliases(historyIndex, history), history);
    for (const alias of matchAliases(history)) historyIndex.set(alias, latest);
  }

  const current = viewState.current && typeof viewState.current === "object" ? viewState.current : null;
  const currentAliases = new Set(matchAliases(current || {}));
  const rows = scheduleItems.map((scheduled) => {
    const history = findByAliases(historyIndex, scheduled);
    const isCurrent = matchAliases(scheduled).some((alias) => currentAliases.has(alias));
    const active = isCurrent ? current : null;
    const merged = { ...scheduled, ...(history || {}), ...(active || {}) };
    const hasScore = active ? true : history ? true : Boolean(scheduled.hasScore);
    const hasResult = active ? isFinalMatch(active) : history ? true : Boolean(scheduled.hasResult);
    const pendingStatus = text(merged.matchStatus || merged.status).toUpperCase();
    return {
      ...merged,
      teamAName: text(merged.teamAName, "TEAM A"),
      teamBName: text(merged.teamBName, "TEAM B"),
      scoreA: number(merged.scoreA),
      scoreB: number(merged.scoreB),
      hasScore,
      hasResult,
      isCurrent,
      matchStatus: hasResult ? "FINISHED" : active ? text(active.status || active.matchStatus, "LIVE") : pendingStatus || "WAITING"
    };
  });

  rows.sort((left, right) => {
    const order = Number(left.order) - Number(right.order);
    if (Number.isFinite(order) && order !== 0) return order;
    return text(left.matchId).localeCompare(text(right.matchId), "th", { numeric: true });
  });
  return rows.map((row, index) => ({ ...row, order: index + 1 }));
}

function scheduleSourceLabel() {
  if (!hasScheduleItems()) return "รอ Host โหลด Google Sheet หรือ Excel";
  const schedule = viewState.schedule || {};
  const source = text(schedule.source).toLowerCase();
  const type = source.includes("excel") ? "Excel" : "Google Sheet";
  const location = [text(schedule.sourceName), text(schedule.sourceTab)].filter(Boolean).join(" • ");
  return location ? `${type} • ${location}` : type;
}

function createCell(label, className = "") {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  if (className) cell.className = className;
  return cell;
}

function currentScheduleKey() {
  const current = viewState.current;
  if (!current || typeof current !== "object") return "";
  return JSON.stringify([
    current.matchKey,
    current.matchId,
    current.teamAName,
    current.teamBName,
    current.scoreA,
    current.scoreB,
    current.matchStatus,
    current.status,
    current.winner,
    current.label1,
    current.label2,
    current.label3,
    current.label4,
    current.label5
  ]);
}

function renderSchedule() {
  const nextCurrentKey = currentScheduleKey();
  if (!scheduleNeedsRender && nextCurrentKey === renderedCurrentScheduleKey) return;

  renderedScheduleRows = mergedSchedule();
  scheduleNeedsRender = false;
  renderedCurrentScheduleKey = nextCurrentKey;
  byId("scheduleCount").textContent = `${renderedScheduleRows.length} คู่`;
  byId("scheduleSource").textContent = scheduleSourceLabel();
  const body = byId("scheduleRows");
  body.replaceChildren();

  if (!renderedScheduleRows.length) {
    const row = document.createElement("tr");
    row.className = "viewer-table-empty";
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "ยังไม่มีรายการแข่งขันจาก Sheet";
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  for (const [index, match] of renderedScheduleRows.entries()) {
    const row = document.createElement("tr");
    if (match.isCurrent) row.classList.add("current");
    if (match.hasResult) row.classList.add("finished");

    const orderCell = createCell("ลำดับ", "viewer-order-cell");
    orderCell.textContent = String(match.order || index + 1);

    const teamsCell = createCell("คู่แข่งขัน");
    const matchup = document.createElement("div");
    matchup.className = "viewer-matchup";
    const teams = document.createElement("strong");
    teams.textContent = `${match.teamAName} vs ${match.teamBName}`;
    matchup.appendChild(teams);
    if (text(match.matchId)) {
      const matchId = document.createElement("small");
      matchId.textContent = `Match ID: ${match.matchId}`;
      matchup.appendChild(matchId);
    }
    teamsCell.appendChild(matchup);

    const scoreCell = createCell("ผล", "viewer-result-cell");
    scoreCell.textContent = match.hasScore ? `${match.scoreA}-${match.scoreB}` : "—";

    const statusCell = createCell("สถานะ");
    const status = document.createElement("span");
    const liveStatus = text(match.matchStatus).toUpperCase() === "LIVE";
    status.className = `viewer-match-state ${match.hasResult ? "final" : liveStatus ? "live" : "waiting"}`;
    status.textContent = match.hasResult ? "FINISHED" : match.isCurrent ? text(match.matchStatus, "LIVE") : text(match.matchStatus, "WAITING");
    statusCell.appendChild(status);

    const actionsCell = createCell("นำไปใช้");
    const actions = document.createElement("div");
    actions.className = "viewer-schedule-actions";
    const copyTeamsButton = document.createElement("button");
    copyTeamsButton.type = "button";
    copyTeamsButton.dataset.copyKind = "teams";
    copyTeamsButton.dataset.rowIndex = String(index);
    copyTeamsButton.textContent = "Copy ทีม";
    copyTeamsButton.setAttribute("aria-label", `Copy ทีม ${match.teamAName} พบ ${match.teamBName}`);
    const copyResultButton = document.createElement("button");
    copyResultButton.type = "button";
    copyResultButton.dataset.copyKind = "result";
    copyResultButton.dataset.rowIndex = String(index);
    copyResultButton.textContent = "Copy ผลแข่ง";
    copyResultButton.disabled = !match.hasResult;
    copyResultButton.title = match.hasResult ? `Copy ${match.teamAName} ${match.scoreA}-${match.scoreB} ${match.teamBName}` : "ใช้ได้เมื่อการแข่งขันจบแล้ว";
    copyResultButton.setAttribute("aria-label", match.hasResult ? `Copy ผลแข่ง ${match.teamAName} ${match.scoreA} ต่อ ${match.scoreB} ${match.teamBName}` : `ผลแข่ง ${match.teamAName} พบ ${match.teamBName} ยังไม่จบ`);
    actions.append(copyTeamsButton, copyResultButton);
    actionsCell.appendChild(actions);

    row.append(orderCell, teamsCell, scoreCell, statusCell, actionsCell);
    body.appendChild(row);
  }
}

function renderEmptyCurrent() {
  byId("teamAName").textContent = "TEAM A";
  byId("teamBName").textContent = "TEAM B";
  byId("scoreA").textContent = "0";
  byId("scoreB").textContent = "0";
  byId("clockText").textContent = "00:00";
  byId("periodText").textContent = "-";
  byId("matchStatus").textContent = "WAITING";
  byId("matchStatus").classList.remove("closed");
  byId("updatedText").textContent = "ยังไม่มีข้อมูล";
  setLogo(byId("teamALogo"), "");
  setLogo(byId("teamBLogo"), "");
  byId("teamACard").style.setProperty("--team-color", "#ff7a21");
  byId("teamBCard").style.setProperty("--team-color", "#4cc9ff");
}

function render() {
  const meta = { roomCode, ...viewState.meta };
  const current = viewState.current;
  byId("roomBadge").textContent = `ROOM ${roomCode || "------"}`;
  byId("eventName").textContent = meta.eventName || "PepsLive Match Room";
  byId("roundText").textContent = meta.round || "-";
  byId("groupText").textContent = meta.group || "-";
  byId("venueText").textContent = meta.venue || "-";
  byId("historyCount").textContent = `${Object.keys(viewState.matches || {}).length} แมตช์`;
  byId("roomMeta").textContent = [meta.round, meta.group, meta.venue].filter(Boolean).join(" • ") || "รอข้อมูลจาก Host";
  renderSchedule();
  byId("exportExcelButton").disabled = !current && !hasScheduleItems();

  if (!current) {
    byId("copyMatchButton").disabled = true;
    renderEmptyCurrent();
    return;
  }

  byId("teamAName").textContent = current.teamAName || "TEAM A";
  byId("teamBName").textContent = current.teamBName || "TEAM B";
  byId("scoreA").textContent = Number(current.scoreA || 0);
  byId("scoreB").textContent = Number(current.scoreB || 0);
  byId("clockText").textContent = current.clockText || "00:00";
  byId("periodText").textContent = current.period || "-";
  setLogo(byId("teamALogo"), current.logoA);
  setLogo(byId("teamBLogo"), current.logoB);
  byId("teamACard").style.setProperty("--team-color", current.teamAPrimaryColor || "#ff7a21");
  byId("teamBCard").style.setProperty("--team-color", current.teamBPrimaryColor || "#4cc9ff");

  const closed = meta.status === "CLOSED";
  const status = byId("matchStatus");
  status.textContent = closed ? "ROOM CLOSED" : (current.status || "LIVE");
  status.classList.toggle("closed", closed);
  byId("updatedText").textContent = `อัปเดต ${new Date(Number(current.updatedAt || Date.now())).toLocaleString("th-TH")}`;
  byId("copyMatchButton").disabled = false;
}

function stopListening() {
  for (const stop of unsubscribe) {
    try { stop(); } catch (_) {}
  }
  unsubscribe = [];
}

async function joinRoom(code) {
  const normalized = sanitizeRoomCode(code);
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    setConnection("error", "เลขห้องไม่ถูกต้อง");
    setNotice("กรุณากรอกเลขห้อง 6 หลัก");
    return;
  }

  stopListening();
  roomCode = normalized;
  viewState = { meta: {}, current: null, matches: {}, schedule: emptySchedule() };
  loadCache(roomCode);
  render();
  const hasCachedRoomData = Boolean(viewState.current || hasScheduleItems());
  setConnection(hasCachedRoomData ? "offline" : "idle", hasCachedRoomData ? "ข้อมูลสำรอง" : "กำลังเชื่อมต่อ");
  setNotice(hasCachedRoomData ? "กำลังแสดงข้อมูลสำรองระหว่างเชื่อมต่อ Firebase" : "กำลังยืนยันตัวตน Viewer แบบ Anonymous");

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  history.replaceState(null, "", url);

  try {
    const firebase = await import("./firebase-runtime.js");
    const runtime = await firebase.getFirebaseRuntime();
    byId("firebaseModeText").textContent = runtime.mode === "emulator" ? "Local development • Firebase Emulator" : "Production • Firebase Realtime Database";
    const base = `${ROOM_ROOT}/${roomCode}`;
    let liveRead = false;
    const onReadError = () => {
      setConnection(viewState.current ? "offline" : "error", viewState.current ? "ข้อมูลสำรอง" : "เข้าห้องไม่ได้");
      setNotice(viewState.current ? "Firebase อ่านไม่ได้ จึงแสดงข้อมูลสำรองล่าสุด" : "ไม่พบห้อง ห้องเป็น Private หรือคุณไม่มีสิทธิ์อ่าน");
    };

    for (const field of ["publicView", "status", "eventName", "venue", "round", "group", "createdAt", "updatedAt"]) {
      unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/meta/${field}`), (snapshot) => {
        viewState.meta[field] = snapshot.val();
        render();
        saveCachePart("meta");
      }, onReadError));
    }

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/current`), (snapshot) => {
      if (snapshot.exists()) {
        liveRead = true;
        viewState.current = snapshot.val();
        setConnection("online", "LIVE");
        setNotice("เชื่อมต่อแบบ Real-time • Viewer อ่านอย่างเดียว");
        render();
        saveCachePart("current");
      } else if (!liveRead) {
        setConnection("error", "รอ Host");
        setNotice("ห้องนี้ยังไม่มีข้อมูลการแข่งขัน");
      }
    }, onReadError));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/matches`), (snapshot) => {
      viewState.matches = snapshot.val() || {};
      scheduleNeedsRender = true;
      render();
      saveCachePart("matches");
    }, onReadError));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/schedule`), (snapshot) => {
      viewState.schedule = normalizeSchedule(snapshot.val());
      scheduleNeedsRender = true;
      render();
      saveCachePart("schedule");
    }, () => {
      byId("scheduleSource").textContent = "ตาราง Sheet ยังไม่พร้อมใช้งานในห้องนี้";
      if (viewState.current) setNotice("เชื่อมต่อคะแนนแบบ Real-time แล้ว • ตารางทุกคู่ยังไม่พร้อม");
    }));
  } catch (error) {
    setConnection(viewState.current ? "offline" : "error", viewState.current ? "ข้อมูลสำรอง" : "Firebase Offline");
    setNotice(viewState.current ? "กำลังแสดง local backup ล่าสุด" : `เชื่อมต่อ Firebase ไม่สำเร็จ: ${error.message || error}`);
  }
}

byId("roomCodeInput").addEventListener("input", (event) => {
  event.target.value = sanitizeRoomCode(event.target.value);
});
byId("joinForm").addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(byId("roomCodeInput").value);
});
byId("copyMatchButton").addEventListener("click", async () => {
  try {
    await copyMatch({ roomCode, ...viewState.meta }, viewState.current || {});
    setNotice("Copy ข้อมูลการแข่งขันแล้ว");
  } catch (error) {
    setNotice(`Copy ไม่สำเร็จ: ${error.message || error}`);
  }
});
byId("scheduleRows").addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target.closest("button[data-copy-kind]") : null;
  if (!target || target.disabled) return;
  const match = renderedScheduleRows[Number(target.dataset.rowIndex)];
  if (!match) return;
  try {
    if (target.dataset.copyKind === "result") {
      if (!match.hasResult) return;
      await copyResult(match);
      setNotice(`Copy ผลแข่งแล้ว: ${match.teamAName} ${match.scoreA}-${match.scoreB} ${match.teamBName}`);
    } else {
      await copyTeams(match);
      setNotice(`Copy ทีมแล้ว: ${match.teamAName} vs ${match.teamBName}`);
    }
  } catch (error) {
    setNotice(`Copy ไม่สำเร็จ: ${error.message || error}`);
  }
});
byId("exportExcelButton").addEventListener("click", () => {
  const scheduleRows = hasScheduleItems() ? renderedScheduleRows : [];
  const result = exportExcel({ roomCode, ...viewState.meta }, viewState.current || {}, viewState.matches || {}, scheduleRows);
  setNotice(`สร้างไฟล์ Excel แล้ว: ${result.filename}`);
});

window.addEventListener("offline", () => {
  if (viewState.current) setConnection("offline", "ข้อมูลสำรอง");
});

const initialCode = sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"));
if (initialCode) {
  byId("roomCodeInput").value = initialCode;
  joinRoom(initialCode);
} else {
  byId("firebaseModeText").textContent = "Localhost ใช้ Emulator เป็นค่าเริ่มต้น • GitHub Pages ใช้ Production";
  render();
}
