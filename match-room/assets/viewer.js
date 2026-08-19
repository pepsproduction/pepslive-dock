import { copyMatch, copyResult, copyTeams, exportExcel } from "./export.js?v=3";
import {
  ROOM_CODE_PATTERN,
  ROOM_ROOT,
  normalizeRoomCodeInput,
  safeLogoKey,
  safeTeamKey,
  sanitizeRoomCode
} from "./room-model.js?v=3";

const byId = (id) => document.getElementById(id);
const DEFAULT_LOGO = "../logos/default.svg";
let unsubscribe = [];
let roomCode = "";
let viewState = { meta: {}, current: null, matches: {}, schedule: emptySchedule(), teamColors: {}, logoAssets: {} };
let renderedScheduleRows = [];
let scheduleNeedsRender = true;
let renderedCurrentScheduleKey = "";
let firebaseApi = null;
let firebaseRuntime = null;
let canEditColors = false;
let activeColorProfile = null;
let colorEditorReturnFocus = null;
let colorEditorReturnSelector = "";
let joinGeneration = 0;
let logoAssetsByRef = new Map();

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
  const teamColors = readCachePart(code, "teamColors");
  const restored = [meta, current, matches, schedule, teamColors].some((value) => value !== null);
  try { localStorage.removeItem(cacheKey(code, "logoAssets")); } catch (_) {}

  if (restored) {
    viewState = {
      meta: meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {},
      current: current && typeof current === "object" && !Array.isArray(current) ? current : null,
      matches: matches && typeof matches === "object" && !Array.isArray(matches) ? matches : {},
      schedule: normalizeSchedule(schedule),
      teamColors: teamColors && typeof teamColors === "object" && !Array.isArray(teamColors) ? teamColors : {},
      logoAssets: {}
    };
  } else {
    try {
      const parsed = JSON.parse(localStorage.getItem(legacyCacheKey(code)) || "null");
      if (parsed && (parsed.current || Object.keys(parsed.schedule?.items || {}).length)) {
        viewState = {
          meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {},
          current: parsed.current || null,
          matches: parsed.matches && typeof parsed.matches === "object" ? parsed.matches : {},
          schedule: normalizeSchedule(parsed.schedule),
          teamColors: {},
          logoAssets: {}
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
  if (part === "logoAssets" || !roomCode || !Object.prototype.hasOwnProperty.call(viewState, part)) return;
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

function normalizedLogoRef(value) {
  return text(value).normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("th-TH");
}

function rebuildLogoAssetLookup() {
  logoAssetsByRef = new Map();
  for (const asset of Object.values(viewState.logoAssets || {})) {
    const key = normalizedLogoRef(asset?.logoRef);
    if (key && !logoAssetsByRef.has(key)) logoAssetsByRef.set(key, asset);
  }
}

function logoAssetFor(value) {
  const key = safeLogoKey(value);
  const direct = key ? viewState.logoAssets?.[key] : null;
  const asset = direct || logoAssetsByRef.get(normalizedLogoRef(value));
  return asset && /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(asset.dataUrl || "")) ? asset : null;
}

function setLogo(element, value) {
  const safe = String(value || "").trim();
  let source = DEFAULT_LOGO;
  const roomAsset = logoAssetFor(safe);
  if (roomAsset) {
    source = roomAsset.dataUrl;
  } else if (/^https:\/\//i.test(safe) || /^\.\.\/logos\/[A-Za-z0-9%._~-]+$/i.test(safe)) {
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

function normalizeColor(value, fallback = "") {
  const normalized = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : fallback;
}

function profileForTeam(teamName, logoRef, explicitKey = "") {
  const key = text(explicitKey) || safeTeamKey(teamName, logoRef);
  return viewState.teamColors?.[key] || null;
}

function resolvedTeamStyle(teamName, logoRef, explicitKey, sheetPrimary, sheetSecondary, side = "A") {
  const profile = profileForTeam(teamName, logoRef, explicitKey);
  const defaults = side === "B"
    ? { primary: "#0057FF", secondary: "#FFFFFF" }
    : { primary: "#FF6A00", secondary: "#111111" };
  return {
    profile,
    teamKey: text(explicitKey) || safeTeamKey(teamName, logoRef),
    primaryColor: normalizeColor(profile?.primaryColor, normalizeColor(sheetPrimary, defaults.primary)),
    secondaryColor: normalizeColor(profile?.secondaryColor, normalizeColor(sheetSecondary, defaults.secondary))
  };
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
    const teamAStyle = resolvedTeamStyle(
      merged.teamAName,
      merged.logoA,
      scheduled.teamAKey,
      merged.teamAPrimaryColor,
      merged.teamASecondaryColor,
      "A"
    );
    const teamBStyle = resolvedTeamStyle(
      merged.teamBName,
      merged.logoB,
      scheduled.teamBKey,
      merged.teamBPrimaryColor,
      merged.teamBSecondaryColor,
      "B"
    );
    return {
      ...merged,
      teamAName: text(merged.teamAName, "TEAM A"),
      teamBName: text(merged.teamBName, "TEAM B"),
      teamAKey: teamAStyle.teamKey,
      teamBKey: teamBStyle.teamKey,
      teamAProfile: teamAStyle.profile,
      teamBProfile: teamBStyle.profile,
      teamASheetPrimaryColor: normalizeColor(scheduled.teamAPrimaryColor),
      teamASheetSecondaryColor: normalizeColor(scheduled.teamASecondaryColor),
      teamBSheetPrimaryColor: normalizeColor(scheduled.teamBPrimaryColor),
      teamBSheetSecondaryColor: normalizeColor(scheduled.teamBSecondaryColor),
      teamAPrimaryColor: teamAStyle.primaryColor,
      teamASecondaryColor: teamAStyle.secondaryColor,
      teamBPrimaryColor: teamBStyle.primaryColor,
      teamBSecondaryColor: teamBStyle.secondaryColor,
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

function createMatchupTeam(name, logoRef) {
  const line = document.createElement("div");
  line.className = "viewer-matchup-team";
  const logo = document.createElement("img");
  logo.alt = `โลโก้ ${name}`;
  setLogo(logo, logoRef);
  const label = document.createElement("strong");
  label.textContent = name;
  line.append(logo, label);
  return line;
}

function createTeamColorChip(label, color, teamName) {
  const chip = document.createElement("span");
  chip.className = "viewer-team-color-chip";
  chip.title = `${teamName} • ${label}: ${color}`;
  const slot = document.createElement("b");
  slot.textContent = label;
  const dot = document.createElement("i");
  dot.className = "viewer-team-color-dot";
  dot.style.setProperty("--team-color-value", color);
  const value = document.createElement("code");
  value.textContent = color;
  chip.append(slot, dot, value);
  return chip;
}

function createTeamColorRow(match, side, rowIndex) {
  const name = match[`team${side}Name`];
  const primaryColor = match[`team${side}PrimaryColor`];
  const secondaryColor = match[`team${side}SecondaryColor`];
  const row = document.createElement("div");
  row.className = "viewer-team-color-row";
  const teamLabel = document.createElement("span");
  teamLabel.className = "viewer-team-color-name";
  teamLabel.textContent = `${side} • ${name}`;
  teamLabel.title = name;
  const colorPair = document.createElement("div");
  colorPair.className = "viewer-team-color-pair";
  colorPair.append(
    createTeamColorChip("หลัก", primaryColor, name),
    createTeamColorChip("รอง", secondaryColor, name)
  );
  const edit = document.createElement("button");
  edit.type = "button";
  edit.dataset.editTeamColor = side;
  edit.dataset.rowIndex = String(rowIndex);
  edit.textContent = "แก้ 2 สี";
  edit.hidden = !canEditColors;
  edit.disabled = viewState.meta?.status === "CLOSED";
  edit.setAttribute("aria-label", `แก้สีหลักและสีรองของทีม ${name}`);
  row.append(teamLabel, edit, colorPair);
  return row;
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
    cell.colSpan = 6;
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
    matchup.append(
      createMatchupTeam(match.teamAName, match.logoA),
      createMatchupTeam(match.teamBName, match.logoB)
    );
    if (text(match.matchId)) {
      const matchId = document.createElement("small");
      matchId.textContent = `Match ID: ${match.matchId}`;
      matchup.appendChild(matchId);
    }
    teamsCell.appendChild(matchup);

    const colorsCell = createCell("PEPS Team Color");
    const colors = document.createElement("div");
    colors.className = "viewer-team-colors";
    colors.append(
      createTeamColorRow(match, "A", index),
      createTeamColorRow(match, "B", index)
    );
    colorsCell.appendChild(colors);

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

    row.append(orderCell, teamsCell, colorsCell, scoreCell, statusCell, actionsCell);
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
  byId("teamACard").style.setProperty("--team-color", "#ff6a00");
  byId("teamACard").style.setProperty("--team-secondary", "#111111");
  byId("teamBCard").style.setProperty("--team-color", "#d9a441");
  byId("teamBCard").style.setProperty("--team-secondary", "#ffffff");
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
  byId("roomAccessLabel").textContent = canEditColors ? "OWNER LIVE ROOM" : "READ-ONLY LIVE ROOM";
  byId("colorEditorMode").textContent = canEditColors
    ? (meta.status === "CLOSED" ? "ห้องปิดแล้ว • ดูสีได้แต่แก้ไขไม่ได้" : "โหมดเจ้าของห้อง • แก้สีทีมใน Firebase ได้และ Dock รับแบบเรียลไทม์")
    : "ผู้ชมเห็นสีและโลโก้แบบเรียลไทม์ • ไม่มีสิทธิ์แก้คะแนนหรือสี";
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
  const teamAStyle = resolvedTeamStyle(current.teamAName, current.logoA, "", current.teamAPrimaryColor, current.teamASecondaryColor, "A");
  const teamBStyle = resolvedTeamStyle(current.teamBName, current.logoB, "", current.teamBPrimaryColor, current.teamBSecondaryColor, "B");
  byId("teamACard").style.setProperty("--team-color", teamAStyle.primaryColor);
  byId("teamACard").style.setProperty("--team-secondary", teamAStyle.secondaryColor);
  byId("teamBCard").style.setProperty("--team-color", teamBStyle.primaryColor);
  byId("teamBCard").style.setProperty("--team-secondary", teamBStyle.secondaryColor);

  const closed = meta.status === "CLOSED";
  const status = byId("matchStatus");
  status.textContent = closed ? "ROOM CLOSED" : (current.status || "LIVE");
  status.classList.toggle("closed", closed);
  byId("updatedText").textContent = `อัปเดต ${new Date(Number(current.updatedAt || Date.now())).toLocaleString("th-TH")}`;
  byId("copyMatchButton").disabled = false;
}

function setColorEditorValues(primary, secondary) {
  const primaryColor = normalizeColor(primary, "#FF6A00");
  const secondaryColor = normalizeColor(secondary, "#111111");
  byId("teamPrimaryColorInput").value = primaryColor;
  byId("teamPrimaryHexInput").value = primaryColor;
  byId("teamSecondaryColorInput").value = secondaryColor;
  byId("teamSecondaryHexInput").value = secondaryColor;
  byId("teamPrimaryHexInput").setAttribute("aria-invalid", "false");
  byId("teamSecondaryHexInput").setAttribute("aria-invalid", "false");
  renderColorEditorPreview(primaryColor, secondaryColor);
}

function renderColorEditorPreview(primary, secondary) {
  const preview = byId("teamColorEditorPreview");
  if (!preview) return;
  const primaryColor = normalizeColor(primary, "#FF6A00");
  const secondaryColor = normalizeColor(secondary, "#111111");
  preview.style.setProperty("--preview-primary", primaryColor);
  preview.style.setProperty("--preview-secondary", secondaryColor);
  byId("teamColorPreviewPrimary").textContent = primaryColor;
  byId("teamColorPreviewSecondary").textContent = secondaryColor;
}

function setColorEditorNotice(message, isError = false) {
  const notice = byId("teamColorEditorNotice");
  if (!notice) return;
  notice.textContent = message || "";
  notice.dataset.state = isError ? "error" : "idle";
}

function closeTeamColorEditor() {
  const backdrop = byId("teamColorEditorBackdrop");
  if (!backdrop) return;
  backdrop.classList.remove("show");
  backdrop.setAttribute("aria-hidden", "true");
  document.body.classList.remove("viewer-dialog-open");
  activeColorProfile = null;
  const fallback = colorEditorReturnSelector ? document.querySelector(colorEditorReturnSelector) : null;
  const focusTarget = colorEditorReturnFocus?.isConnected ? colorEditorReturnFocus : fallback || byId("scheduleTitle");
  if (focusTarget?.focus) focusTarget.focus();
  colorEditorReturnFocus = null;
  colorEditorReturnSelector = "";
}

function openTeamColorEditor(match, side, trigger) {
  if (!canEditColors || viewState.meta?.status === "CLOSED") return;
  const teamKey = match[`team${side}Key`];
  const profile = viewState.teamColors?.[teamKey] || {};
  const teamName = match[`team${side}Name`];
  const logoRef = match[`logo${side}`];
  const defaultPrimary = side === "B" ? "#0057FF" : "#FF6A00";
  const defaultSecondary = side === "B" ? "#FFFFFF" : "#111111";
  activeColorProfile = {
    teamKey,
    teamName,
    logoRef,
    side,
    primaryColor: normalizeColor(profile.primaryColor, match[`team${side}PrimaryColor`] || defaultPrimary),
    secondaryColor: normalizeColor(profile.secondaryColor, match[`team${side}SecondaryColor`] || defaultSecondary),
    sheetPrimaryColor: normalizeColor(profile.sheetPrimaryColor, match[`team${side}SheetPrimaryColor`]),
    sheetSecondaryColor: normalizeColor(profile.sheetSecondaryColor, match[`team${side}SheetSecondaryColor`]),
    defaultPrimary,
    defaultSecondary,
    source: text(profile.source, match[`team${side}SheetPrimaryColor`] ? text(viewState.schedule.source, "google") : "dock")
  };
  const appearances = renderedScheduleRows.filter((row) => row.teamAKey === teamKey || row.teamBKey === teamKey).length;
  byId("teamColorEditorName").textContent = teamName;
  byId("teamColorEditorScope").textContent = `ใช้กับทีมนี้ทุกคู่ • ${appearances} คู่ในตาราง`;
  byId("teamColorEditorSource").textContent = activeColorProfile.source === "viewer"
    ? "แก้ล่าสุดใน Firebase Match Room"
    : activeColorProfile.source === "excel" ? "ค่าเริ่มต้นจาก Excel" : activeColorProfile.source === "google" ? "ค่าเริ่มต้นจาก Google Sheet" : "ค่าเริ่มต้นจาก Dock";
  setLogo(byId("teamColorEditorLogo"), logoRef);
  setColorEditorValues(activeColorProfile.primaryColor, activeColorProfile.secondaryColor);
  setColorEditorNotice("");
  byId("resetTeamColorButton").disabled = !activeColorProfile.sheetPrimaryColor && !activeColorProfile.sheetSecondaryColor;
  colorEditorReturnFocus = trigger || document.activeElement;
  colorEditorReturnSelector = trigger?.dataset?.rowIndex
    ? `button[data-edit-team-color="${side}"][data-row-index="${trigger.dataset.rowIndex}"]`
    : "";
  const backdrop = byId("teamColorEditorBackdrop");
  backdrop.classList.add("show");
  backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("viewer-dialog-open");
  setTimeout(() => byId("teamPrimaryColorInput").focus(), 0);
}

function editorColorValue(inputId) {
  return normalizeColor(byId(inputId).value);
}

async function saveTeamColorProfile(resetToSheet = false) {
  if (!activeColorProfile || !canEditColors || !firebaseApi || !firebaseRuntime || viewState.meta?.status === "CLOSED") return false;
  const profile = { ...activeColorProfile };
  const primaryColor = resetToSheet
    ? (profile.sheetPrimaryColor || profile.defaultPrimary)
    : editorColorValue("teamPrimaryHexInput");
  const secondaryColor = resetToSheet
    ? (profile.sheetSecondaryColor || profile.defaultSecondary)
    : editorColorValue("teamSecondaryHexInput");
  if (!normalizeColor(primaryColor) || !normalizeColor(secondaryColor)) {
    const invalid = !normalizeColor(primaryColor) ? byId("teamPrimaryHexInput") : byId("teamSecondaryHexInput");
    invalid.setAttribute("aria-invalid", "true");
    setColorEditorNotice("รูปแบบสีไม่ถูกต้อง • ใช้ #RRGGBB เช่น #FF6A00", true);
    invalid.focus();
    return false;
  }
  setColorEditorNotice("กำลังบันทึกสีลง Firebase");
  const source = resetToSheet
    ? (profile.sheetPrimaryColor || profile.sheetSecondaryColor ? (viewState.schedule.source === "excel" ? "excel" : "google") : "dock")
    : "viewer";
  const saveButton = byId("saveTeamColorButton");
  const resetButton = byId("resetTeamColorButton");
  saveButton.disabled = true;
  resetButton.disabled = true;
  try {
    const profileRef = firebaseApi.ref(firebaseRuntime.database, `${ROOM_ROOT}/${roomCode}/teamColors/${profile.teamKey}`);
    const result = await firebaseApi.runTransaction(profileRef, (current) => ({
      teamKey: profile.teamKey,
      teamName: profile.teamName,
      logoRef: profile.logoRef,
      primaryColor,
      secondaryColor,
      sheetPrimaryColor: normalizeColor(current?.sheetPrimaryColor, profile.sheetPrimaryColor),
      sheetSecondaryColor: normalizeColor(current?.sheetSecondaryColor, profile.sheetSecondaryColor),
      source,
      revision: Number(current?.revision || 0) + 1,
      updatedAt: firebaseApi.serverTimestamp()
    }), { applyLocally: false });
    if (!result.committed) throw new Error("team_color_not_committed");
    const affectsCurrent = renderedScheduleRows.some((row) => row.isCurrent && (row.teamAKey === profile.teamKey || row.teamBKey === profile.teamKey));
    closeTeamColorEditor();
    setNotice(affectsCurrent ? "บันทึกแล้ว • Dock LIVE SCORE กำลังอัปเดตแบบเรียลไทม์" : "บันทึกแล้ว • สีนี้จะใช้เมื่อ Host โหลดคู่ของทีม");
    return true;
  } catch (error) {
    setColorEditorNotice(`บันทึกสีไม่สำเร็จ: ${error.message || error}`, true);
    return false;
  } finally {
    saveButton.disabled = false;
    if (activeColorProfile) resetButton.disabled = !activeColorProfile.sheetPrimaryColor && !activeColorProfile.sheetSecondaryColor;
  }
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
    setNotice("กรุณากรอกเลขห้อง 4 หลัก • ห้องเดิมยังเชื่อมต่ออยู่");
    return;
  }
  const generation = ++joinGeneration;
  const isCurrentJoin = () => generation === joinGeneration;
  stopListening();

  roomCode = normalized;
  viewState = { meta: {}, current: null, matches: {}, schedule: emptySchedule(), teamColors: {}, logoAssets: {} };
  logoAssetsByRef = new Map();
  canEditColors = false;
  firebaseApi = null;
  firebaseRuntime = null;
  closeTeamColorEditor();
  loadCache(roomCode);
  render();
  const hasCachedRoomData = Boolean(viewState.current || hasScheduleItems());
  setConnection(hasCachedRoomData ? "offline" : "idle", hasCachedRoomData ? "ข้อมูลสำรอง" : "กำลังเชื่อมต่อ");
  setNotice(hasCachedRoomData ? "กำลังแสดงข้อมูลสำรองระหว่างเชื่อมต่อ Firebase" : "กำลังยืนยันตัวตน Viewer แบบ Anonymous");

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  history.replaceState(null, "", url);

  try {
    const firebase = await import("./firebase-runtime.js?v=2");
    const runtime = await firebase.getFirebaseRuntime();
    if (!isCurrentJoin()) return;
    firebaseApi = firebase;
    firebaseRuntime = runtime;
    byId("firebaseModeText").textContent = runtime.mode === "emulator" ? "Local development • Firebase Emulator" : "Production • Firebase Realtime Database";
    const base = `${ROOM_ROOT}/${roomCode}`;
    try {
      const ownerSnapshot = await firebase.get(firebase.ref(runtime.database, `${base}/meta/ownerUid`));
      canEditColors = ownerSnapshot.val() === runtime.user.uid;
    } catch (_) {
      canEditColors = false;
    }
    if (!isCurrentJoin()) return;
    scheduleNeedsRender = true;
    render();
    let liveRead = false;
    const onReadError = () => {
      if (!isCurrentJoin()) return;
      setConnection(viewState.current ? "offline" : "error", viewState.current ? "ข้อมูลสำรอง" : "เข้าห้องไม่ได้");
      setNotice(viewState.current ? "Firebase อ่านไม่ได้ จึงแสดงข้อมูลสำรองล่าสุด" : "ไม่พบห้อง ห้องเป็น Private หรือคุณไม่มีสิทธิ์อ่าน");
    };

    for (const field of ["publicView", "status", "eventName", "venue", "round", "group", "createdAt", "updatedAt"]) {
      unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/meta/${field}`), (snapshot) => {
        if (!isCurrentJoin()) return;
        viewState.meta[field] = snapshot.val();
        if (field === "status") {
          scheduleNeedsRender = true;
          if (viewState.meta.status === "CLOSED") closeTeamColorEditor();
        }
        render();
        saveCachePart("meta");
      }, onReadError));
    }

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/current`), (snapshot) => {
      if (!isCurrentJoin()) return;
      if (snapshot.exists()) {
        liveRead = true;
        viewState.current = snapshot.val();
        setConnection("online", "LIVE");
        setNotice(canEditColors ? "เชื่อมต่อแบบ Real-time • เจ้าของห้องแก้ได้เฉพาะสีทีม คะแนนยังเป็น Read-only" : "เชื่อมต่อแบบ Real-time • Viewer อ่านอย่างเดียว");
        render();
        saveCachePart("current");
      } else if (!liveRead) {
        setConnection("error", "รอ Host");
        setNotice("ห้องนี้ยังไม่มีข้อมูลการแข่งขัน");
      }
    }, onReadError));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/matches`), (snapshot) => {
      if (!isCurrentJoin()) return;
      viewState.matches = snapshot.val() || {};
      scheduleNeedsRender = true;
      render();
      saveCachePart("matches");
    }, onReadError));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/schedule`), (snapshot) => {
      if (!isCurrentJoin()) return;
      viewState.schedule = normalizeSchedule(snapshot.val());
      scheduleNeedsRender = true;
      render();
      saveCachePart("schedule");
    }, () => {
      if (!isCurrentJoin()) return;
      byId("scheduleSource").textContent = "ตาราง Sheet ยังไม่พร้อมใช้งานในห้องนี้";
      if (viewState.current) setNotice("เชื่อมต่อคะแนนแบบ Real-time แล้ว • ตารางทุกคู่ยังไม่พร้อม");
    }));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/teamColors`), (snapshot) => {
      if (!isCurrentJoin()) return;
      viewState.teamColors = snapshot.val() || {};
      scheduleNeedsRender = true;
      render();
      saveCachePart("teamColors");
    }, onReadError));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/logoAssets`), (snapshot) => {
      if (!isCurrentJoin()) return;
      viewState.logoAssets = snapshot.val() || {};
      rebuildLogoAssetLookup();
      scheduleNeedsRender = true;
      render();
      saveCachePart("logoAssets");
    }, () => {
      if (!isCurrentJoin()) return;
      if (viewState.current) setNotice("คะแนนและสีเชื่อมต่อแล้ว • โลโก้ local ยังไม่พร้อมในห้องนี้");
    }));
  } catch (error) {
    if (!isCurrentJoin()) return;
    setConnection(viewState.current ? "offline" : "error", viewState.current ? "ข้อมูลสำรอง" : "Firebase Offline");
    setNotice(viewState.current ? "กำลังแสดง local backup ล่าสุด" : `เชื่อมต่อ Firebase ไม่สำเร็จ: ${error.message || error}`);
  }
}

byId("roomCodeInput").addEventListener("input", (event) => {
  event.target.value = normalizeRoomCodeInput(event.target.value);
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
  const editTarget = event.target instanceof Element ? event.target.closest("button[data-edit-team-color]") : null;
  if (editTarget && !editTarget.disabled) {
    const editMatch = renderedScheduleRows[Number(editTarget.dataset.rowIndex)];
    if (editMatch) openTeamColorEditor(editMatch, editTarget.dataset.editTeamColor, editTarget);
    return;
  }
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
byId("closeTeamColorEditor").addEventListener("click", closeTeamColorEditor);
byId("teamColorEditorBackdrop").addEventListener("click", (event) => {
  if (event.target === byId("teamColorEditorBackdrop")) closeTeamColorEditor();
});
byId("teamColorEditor").addEventListener("submit", (event) => {
  event.preventDefault();
  saveTeamColorProfile(false);
});
byId("resetTeamColorButton").addEventListener("click", () => saveTeamColorProfile(true));
[
  ["teamPrimaryColorInput", "teamPrimaryHexInput"],
  ["teamSecondaryColorInput", "teamSecondaryHexInput"]
].forEach(([colorId, hexId]) => {
  byId(colorId).addEventListener("input", () => {
    byId(hexId).value = byId(colorId).value.toUpperCase();
    renderColorEditorPreview(
      byId("teamPrimaryColorInput").value,
      byId("teamSecondaryColorInput").value
    );
  });
  byId(hexId).addEventListener("input", () => {
    const value = normalizeColor(byId(hexId).value);
    byId(hexId).setAttribute("aria-invalid", value ? "false" : "true");
    if (value) setColorEditorNotice("");
    if (value) {
      byId(colorId).value = value;
      renderColorEditorPreview(
        byId("teamPrimaryColorInput").value,
        byId("teamSecondaryColorInput").value
      );
    }
  });
  byId(hexId).addEventListener("change", () => {
    const value = normalizeColor(byId(hexId).value);
    byId(hexId).setAttribute("aria-invalid", value ? "false" : "true");
    if (value) {
      byId(hexId).value = value;
      byId(colorId).value = value;
      renderColorEditorPreview(
        byId("teamPrimaryColorInput").value,
        byId("teamSecondaryColorInput").value
      );
    }
  });
});
document.addEventListener("keydown", (event) => {
  const editorOpen = byId("teamColorEditorBackdrop").classList.contains("show");
  if (event.key === "Escape" && editorOpen) {
    event.preventDefault();
    closeTeamColorEditor();
    return;
  }
  if (event.key === "Tab" && editorOpen) {
    const controls = Array.from(byId("teamColorEditor").querySelectorAll(
      'button:not([disabled]),input:not([disabled]),summary,[href],[tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

window.addEventListener("offline", () => {
  if (viewState.current) setConnection("offline", "ข้อมูลสำรอง");
});

const initialCode = sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"));
if (initialCode) {
  byId("roomCodeInput").value = initialCode;
  joinRoom(initialCode);
} else {
  byId("firebaseModeText").textContent = "Match Room ใช้ Production Realtime • ใช้ firebaseMode=emulator เฉพาะงานทดสอบนักพัฒนา";
  render();
}
