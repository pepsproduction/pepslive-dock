import { copyMatch, exportExcel } from "./export.js";
import { ROOM_CODE_PATTERN, ROOM_ROOT, sanitizeRoomCode } from "./room-model.js";

const byId = (id) => document.getElementById(id);
const DEFAULT_LOGO = "../logos/default.svg";
let unsubscribe = [];
let roomCode = "";
let viewState = { meta: {}, current: null, matches: {} };

function cacheKey(code) {
  return `pepslive.matchRoom.viewerCache.v1:${code}`;
}

function loadCache(code) {
  try {
    const parsed = JSON.parse(localStorage.getItem(cacheKey(code)) || "null");
    if (parsed && parsed.current) viewState = parsed;
  } catch (_) {
    // A corrupt cache must never block the live viewer.
  }
}

function saveCache() {
  if (!roomCode || !viewState.current) return;
  try {
    localStorage.setItem(cacheKey(roomCode), JSON.stringify({ ...viewState, cachedAt: Date.now() }));
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

  if (!current) {
    byId("copyMatchButton").disabled = true;
    byId("exportExcelButton").disabled = true;
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
  byId("exportExcelButton").disabled = false;
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
  viewState = { meta: {}, current: null, matches: {} };
  loadCache(roomCode);
  render();
  setConnection(viewState.current ? "offline" : "idle", viewState.current ? "ข้อมูลสำรอง" : "กำลังเชื่อมต่อ");
  setNotice(viewState.current ? "กำลังแสดงข้อมูลสำรองระหว่างเชื่อมต่อ Firebase" : "กำลังยืนยันตัวตน Viewer แบบ Anonymous");

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
        saveCache();
      }, onReadError));
    }

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/current`), (snapshot) => {
      if (snapshot.exists()) {
        liveRead = true;
        viewState.current = snapshot.val();
        setConnection("online", "LIVE");
        setNotice("เชื่อมต่อแบบ Real-time • Viewer อ่านอย่างเดียว");
        render();
        saveCache();
      } else if (!liveRead) {
        setConnection("error", "รอ Host");
        setNotice("ห้องนี้ยังไม่มีข้อมูลการแข่งขัน");
      }
    }, onReadError));

    unsubscribe.push(firebase.onValue(firebase.ref(runtime.database, `${base}/matches`), (snapshot) => {
      viewState.matches = snapshot.val() || {};
      render();
      saveCache();
    }, onReadError));
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
byId("exportExcelButton").addEventListener("click", () => {
  const result = exportExcel({ roomCode, ...viewState.meta }, viewState.current || {}, viewState.matches || {});
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
