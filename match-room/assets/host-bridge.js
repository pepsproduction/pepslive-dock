import {
  ROOM_CODE_PATTERN,
  ROOM_ROOT,
  normalizeCurrent,
  normalizeMeta,
  normalizeSchedule,
  randomRoomCode,
  scheduleFingerprint,
  safeEventKey
} from "./room-model.js";

const bridge = window.PepsLiveDockMatchRoomBridge;
const params = new URLSearchParams(window.location.search);
const HOST_SESSION_KEY = "pepslive.matchRoom.hostSession.v1";
const HOST_BACKUP_KEY = "pepslive.matchRoom.hostBackup.v1";

if (bridge && params.get("remote") !== "1" && window.location.protocol !== "file:") {
  startMatchRoomHost().catch((error) => {
    console.warn("PepsLive Match Room host failed to start", error);
  });
}

async function startMatchRoomHost() {
  const isEnabled = () => typeof bridge.isEnabled !== "function" || bridge.isEnabled();
  mountStyles();
  const ui = mountUi();
  const backup = loadJson(HOST_BACKUP_KEY, {
    version: 3,
    latestSnapshot: bridge.getSnapshot(),
    pendingCurrent: isEnabled() ? bridge.getSnapshot() : null,
    pendingCurrentSequence: 0,
    currentSequence: 0,
    syncedSequence: 0,
    pendingResults: {},
    pendingFinishes: {},
    lastFingerprint: "",
    lastScheduleFingerprint: ""
  });
  backup.pendingResults = backup.pendingResults && typeof backup.pendingResults === "object" ? backup.pendingResults : {};
  backup.pendingFinishes = backup.pendingFinishes && typeof backup.pendingFinishes === "object" ? backup.pendingFinishes : {};
  Object.entries(backup.pendingResults).forEach(([eventId, item]) => {
    if (!item || typeof item !== "object") {
      delete backup.pendingResults[eventId];
      return;
    }
    if (!item.snapshot) item.snapshot = backup.pendingFinishes[eventId]?.snapshot || backup.pendingCurrent || backup.latestSnapshot;
  });
  backup.currentSequence = Math.max(0, Number(backup.currentSequence || 0));
  backup.pendingCurrentSequence = Math.max(0, Number(backup.pendingCurrentSequence || 0));
  backup.syncedSequence = Math.max(0, Number(backup.syncedSequence || 0));
  const storedSession = loadJson(HOST_SESSION_KEY, null);
  let session = Object.prototype.hasOwnProperty.call(backup, "session")
    ? (backup.session ? { ...(storedSession || {}), ...backup.session } : null)
    : storedSession;
  let firebase;
  let runtime;
  let syncing = false;
  let syncAgain = false;
  let syncWaiters = [];
  let syncTimer;
  let closing = false;
  let databaseConnectionStop;
  let databaseConnected = false;
  let backupPersistenceError = "";

  function hostState() {
    const active = Boolean(session && ROOM_CODE_PATTERN.test(session.code || ""));
    return {
      available: true,
      enabled: isEnabled(),
      connected: Boolean(runtime && databaseConnected),
      roomCode: active ? session.code : "",
      roomStatus: active ? session.status : "",
      pending: active && session.status !== "CLOSED" ? hasPendingSync() : false,
      resultPending: active && session.status !== "CLOSED" ? hasPendingResultSync() : false,
      syncing,
      closing,
      backupError: backupPersistenceError,
      statusText: ui.status.textContent || "",
      mode: runtime?.mode || session?.mode || ""
    };
  }

  function reportHostState() {
    if (typeof bridge.reportHostState === "function") bridge.reportHostState(hostState());
  }

  function persist() {
    backup.version = 3;
    backup.savedAt = Date.now();
    backup.session = session ? {
      code: session.code,
      ownerUid: session.ownerUid,
      status: session.status,
      publicView: session.publicView,
      mode: session.mode
    } : null;
    let backupSaved = false;
    try {
      localStorage.setItem(HOST_BACKUP_KEY, JSON.stringify(backup));
      backupSaved = true;
      backupPersistenceError = "";
    } catch (_) {
      backupPersistenceError = "firebase_local_backup_failed";
    }
    try {
      if (session) localStorage.setItem(HOST_SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(HOST_SESSION_KEY);
    } catch (_) {}
    return backupSaved;
  }

  function quarantinePending(reason) {
    const pendingFinishes = backup.pendingFinishes || {};
    const pendingResults = backup.pendingResults || {};
    if (session || backup.pendingCurrent || Object.keys(pendingFinishes).length || Object.keys(pendingResults).length) {
      const entries = Array.isArray(backup.orphanedSessions) ? backup.orphanedSessions : [];
      backup.orphanedSessions = [...entries, {
        reason,
        quarantinedAt: Date.now(),
        session,
        pendingCurrent: backup.pendingCurrent || null,
        pendingResults,
        pendingFinishes
      }].slice(-3);
    }
    backup.pendingResults = {};
    backup.pendingFinishes = {};
    backup.pendingCurrent = backup.latestSnapshot || bridge.getSnapshot();
    backup.pendingCurrentSequence = backup.currentSequence;
    backup.lastFingerprint = "";
    backup.lastScheduleFingerprint = "";
  }

  function notify(message) {
    if (bridge.notify) bridge.notify(message);
  }

  function setStatus(state, message) {
    ui.status.dataset.state = state;
    ui.status.textContent = message;
    reportHostState();
  }

  function waitForDatabaseConnection(nextRuntime, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) {
          databaseConnected = false;
          if (typeof databaseConnectionStop === "function") databaseConnectionStop();
          databaseConnectionStop = undefined;
          reject(error);
        } else resolve();
      };
      const timer = setTimeout(() => finish(new Error("database_connection_timeout")), timeoutMs);
      if (typeof databaseConnectionStop === "function") databaseConnectionStop();
      databaseConnectionStop = firebase.onValue(
        firebase.ref(nextRuntime.database, ".info/connected"),
        (snapshot) => {
          databaseConnected = snapshot.val() === true;
          if (databaseConnected) {
            finish();
            if (runtime) {
              renderSession();
              if (session?.status !== "CLOSED") scheduleSync(100);
            }
          } else if (runtime && session?.status !== "CLOSED") {
            setStatus("backup", "Local backup • รอเชื่อมต่อ");
            renderSession();
          }
        },
        (error) => finish(error)
      );
    });
  }

  function renderSession() {
    const active = Boolean(session && ROOM_CODE_PATTERN.test(session.code || ""));
    const closed = active && session.status === "CLOSED";
    const enabled = isEnabled();
    const connectedWritable = Boolean(runtime && databaseConnected);
    const writable = enabled && connectedWritable;
    ui.container.dataset.enabled = enabled ? "true" : "false";
    ui.code.textContent = active ? session.code : "------";
    ui.create.disabled = !writable || (active && !closed);
    ui.create.textContent = closed ? "สร้างห้องใหม่" : "สร้างห้อง";
    ui.save.disabled = !writable || !active || closed;
    ui.copy.disabled = !active;
    ui.open.disabled = !active;
    ui.close.disabled = !connectedWritable || !active || closed || closing;
    ui.link.textContent = active ? session.viewerUrl : "ยังไม่ได้สร้างห้อง";
    ui.publicView.checked = session ? session.publicView !== false : true;
    if (session?.meta) {
      ui.eventName.value = session.meta.eventName || ui.eventName.value;
      ui.venue.value = session.meta.venue || ui.venue.value;
      ui.round.value = session.meta.round || ui.round.value;
      ui.group.value = session.meta.group || ui.group.value;
    }
    [ui.eventName, ui.venue, ui.round, ui.group, ui.publicView].forEach((field) => {
      field.disabled = !enabled || closed;
    });
    if (backupPersistenceError) {
      setStatus("error", "Firebase Local backup เขียนไม่ได้");
    } else if (!enabled) {
      setStatus("backup", active && !closed
        ? `Firebase พักอยู่ • ปิด Room ${session.code} ก่อนเปลี่ยนระบบ`
        : "Firebase ไม่ได้ถูกเลือกใน Settings");
    } else if (active) {
      if (closed) setStatus("backup", `Room ${session.code} ปิดแล้ว`);
      else if (!databaseConnected) setStatus("backup", "Local backup • รอเชื่อมต่อ");
      else setStatus("online", `Room ${session.code} • ${session.mode}`);
    } else if (runtime && databaseConnected) setStatus("online", `Firebase ${runtime.mode} พร้อม`);
    else reportHostState();
  }

  function readMetaDraft(code = session?.code || "") {
    const snapshot = backup.latestSnapshot || bridge.getSnapshot();
    return {
      roomCode: code,
      publicView: ui.publicView.checked,
      status: session?.status || "OPEN",
      eventName: ui.eventName.value.trim() || "PepsLive Match Room",
      venue: ui.venue.value.trim() || snapshot.label3 || "",
      round: ui.round.value.trim() || snapshot.label1 || "",
      group: ui.group.value.trim() || snapshot.label4 || ""
    };
  }

  function fingerprint(snapshot) {
    const normalized = normalizeCurrent(snapshot || {}, 1, 0);
    delete normalized.revision;
    delete normalized.updatedAt;
    return JSON.stringify(normalized);
  }

  function readSchedule() {
    const input = typeof bridge.getSchedule === "function" ? bridge.getSchedule() : { source: "none", rows: [] };
    return normalizeSchedule(input);
  }

  function pendingScheduleFingerprint() {
    return scheduleFingerprint(readSchedule());
  }

  function hasPendingSchedule() {
    if (!isEnabled() || !session || session.status === "CLOSED") return false;
    try {
      return pendingScheduleFingerprint() !== backup.lastScheduleFingerprint;
    } catch (_) {
      return true;
    }
  }

  function hasPendingResultSync() {
    if (!session || session.status === "CLOSED") return false;
    return Boolean(
      Object.keys(backup.pendingResults || {}).length
      || Object.keys(backup.pendingFinishes || {}).length
    );
  }

  function hasPendingSync() {
    if (!session || session.status === "CLOSED") return false;
    return Boolean(
      backup.pendingCurrent
      || Object.keys(backup.pendingResults || {}).length
      || Object.keys(backup.pendingFinishes || {}).length
      || hasPendingSchedule()
    );
  }

  function markSequenceSynced(sequence) {
    const nextSequence = Math.max(0, Number(sequence || 0));
    backup.syncedSequence = Math.max(Number(backup.syncedSequence || 0), nextSequence);
  }

  function scheduleSync(delay = 320) {
    clearTimeout(syncTimer);
    if (!isEnabled()) return;
    syncTimer = setTimeout(() => flushAll().catch(() => {}), delay);
  }

  bridge.subscribe((event) => {
    backup.latestSnapshot = event.snapshot;
    if (!isEnabled()) {
      persist();
      reportHostState();
      return;
    }
    const sequence = Math.max(0, Number(backup.currentSequence || 0)) + 1;
    backup.currentSequence = sequence;
    const isFinish = event.type === "finish" && Boolean(event.eventId);
    const isResult = (event.type === "result" || isFinish) && Boolean(event.eventId);
    const roomOpen = Boolean(session && session.status !== "CLOSED");
    const queueForRoom = !closing && (!session || session.status !== "CLOSED");
    if (queueForRoom) {
      backup.pendingCurrent = event.snapshot;
      backup.pendingCurrentSequence = sequence;
    }
    if (isResult && roomOpen) {
      backup.pendingResults[event.eventId] = {
        eventId: event.eventId,
        type: event.type,
        sequence,
        capturedAt: event.capturedAt,
        snapshot: event.snapshot
      };
    }
    if (isFinish && roomOpen) {
      backup.pendingCurrent = event.snapshot;
      backup.pendingCurrentSequence = sequence;
      backup.pendingFinishes[event.eventId] = {
        eventId: event.eventId,
        sequence,
        capturedAt: event.capturedAt,
        snapshot: event.snapshot
      };
    }
    if (isFinish && session?.status === "CLOSED") {
      quarantinePending("finish_after_room_closed");
      persist();
      return;
    }
    if (!persist()) {
      setStatus("error", "Firebase Local backup เขียนไม่ได้");
      return;
    }
    if (!closing && (queueForRoom || (isFinish && roomOpen))) {
      scheduleSync(isFinish ? 0 : (event.snapshot.timerRunning ? 850 : 280));
    }
    reportHostState();
  });

  async function flushCurrent() {
    if (!backup.pendingCurrent || !session || session.status === "CLOSED") return;
    const pendingSnapshot = backup.pendingCurrent;
    const pendingSequence = Math.max(0, Number(backup.pendingCurrentSequence || backup.currentSequence || 0));
    const nextFingerprint = fingerprint(pendingSnapshot);
    if (nextFingerprint === backup.lastFingerprint) {
      if (fingerprint(backup.pendingCurrent) === nextFingerprint) {
        markSequenceSynced(Math.max(pendingSequence, Number(backup.pendingCurrentSequence || 0)));
        backup.pendingCurrent = null;
        backup.pendingCurrentSequence = 0;
      }
      persist();
      return;
    }
    const currentRef = firebase.ref(runtime.database, `${ROOM_ROOT}/${session.code}/current`);
    const result = await firebase.runTransaction(currentRef, (current) => {
      const revision = Number(current?.revision || 0) + 1;
      return {
        ...normalizeCurrent(pendingSnapshot, revision, Date.now()),
        updatedAt: firebase.serverTimestamp()
      };
    }, { applyLocally: false });
    if (!result.committed) throw new Error("current_sync_not_committed");
    backup.lastFingerprint = nextFingerprint;
    if (fingerprint(backup.pendingCurrent) === nextFingerprint) {
      markSequenceSynced(Math.max(pendingSequence, Number(backup.pendingCurrentSequence || 0)));
      backup.pendingCurrent = null;
      backup.pendingCurrentSequence = 0;
    } else {
      markSequenceSynced(pendingSequence);
    }
    backup.revision = Number(result.snapshot.val()?.revision || backup.revision || 0);
    persist();
  }

  async function flushSchedule() {
    if (!session || session.status === "CLOSED") return true;
    const normalized = readSchedule();
    const nextFingerprint = scheduleFingerprint(normalized);
    if (nextFingerprint === backup.lastScheduleFingerprint) return true;
    const scheduleRef = firebase.ref(runtime.database, `${ROOM_ROOT}/${session.code}/schedule`);
    const result = await firebase.runTransaction(scheduleRef, (current) => ({
      ...normalized,
      fingerprint: nextFingerprint,
      revision: Number(current?.revision || 0) + 1,
      updatedAt: firebase.serverTimestamp()
    }), { applyLocally: false });
    if (!result.committed) throw new Error("schedule_sync_not_committed");
    backup.lastScheduleFingerprint = nextFingerprint;
    backup.scheduleError = "";
    persist();
    return true;
  }

  async function flushResult(item) {
    if (!item?.eventId || !item.snapshot) throw new Error("firebase_result_operation_invalid");
    const nextFingerprint = fingerprint(item.snapshot);
    if (nextFingerprint !== backup.lastFingerprint) {
      const currentRef = firebase.ref(runtime.database, `${ROOM_ROOT}/${session.code}/current`);
      const result = await firebase.runTransaction(currentRef, (current) => {
        const revision = Number(current?.revision || 0) + 1;
        return {
          ...normalizeCurrent(item.snapshot, revision, Date.now()),
          updatedAt: firebase.serverTimestamp()
        };
      }, { applyLocally: false });
      if (!result.committed) throw new Error("result_sync_not_committed");
      backup.lastFingerprint = nextFingerprint;
      backup.revision = Number(result.snapshot.val()?.revision || backup.revision || 0);
    }
    delete backup.pendingResults[item.eventId];
    markSequenceSynced(item.sequence);
    if (fingerprint(backup.pendingCurrent) === nextFingerprint) {
      markSequenceSynced(Math.max(Number(item.sequence || 0), Number(backup.pendingCurrentSequence || 0)));
      backup.pendingCurrent = null;
      backup.pendingCurrentSequence = 0;
    }
    persist();
  }

  async function flushFinish(item) {
    const eventKey = safeEventKey(item.eventId);
    const roomPath = `${ROOM_ROOT}/${session.code}`;
    const existing = await firebase.get(firebase.ref(runtime.database, `${roomPath}/matches/${eventKey}`));
    if (existing.exists()) {
      if (fingerprint(existing.val()) !== fingerprint(item.snapshot)) {
        throw new Error("firebase_finish_operation_payload_mismatch");
      }
      delete backup.pendingFinishes[item.eventId];
      delete backup.pendingResults[item.eventId];
      markSequenceSynced(item.sequence);
      persist();
      return;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const currentSnapshot = await firebase.get(firebase.ref(runtime.database, `${roomPath}/current`));
      const revision = Number(currentSnapshot.val()?.revision || 0) + 1;
      const now = Date.now();
      const timestamp = firebase.serverTimestamp();
      const current = { ...normalizeCurrent(item.snapshot, revision, now), updatedAt: timestamp };
      const history = { ...current, eventId: eventKey, createdAt: timestamp };
      const audit = {
        eventId: eventKey,
        actorUid: runtime.user.uid,
        action: "FINISH",
        matchKey: current.matchKey,
        matchId: current.matchId,
        createdAt: timestamp,
        revision
      };
      try {
        await firebase.update(firebase.ref(runtime.database, roomPath), {
          current,
          [`matches/${eventKey}`]: history,
          [`audit/${eventKey}`]: audit,
          "meta/updatedAt": timestamp
        });
        backup.lastFingerprint = fingerprint(item.snapshot);
        backup.revision = revision;
        delete backup.pendingFinishes[item.eventId];
        delete backup.pendingResults[item.eventId];
        markSequenceSynced(item.sequence);
        if (fingerprint(backup.pendingCurrent) === backup.lastFingerprint) {
          markSequenceSynced(Math.max(Number(item.sequence || 0), Number(backup.pendingCurrentSequence || 0)));
          backup.pendingCurrent = null;
          backup.pendingCurrentSequence = 0;
        }
        persist();
        return;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
  }

  async function flushAll(force = false) {
    if (!isEnabled() && !force) return true;
    if (syncing) {
      syncAgain = true;
      return false;
    }
    if (!runtime || !databaseConnected || !session || session.status === "CLOSED" || navigator.onLine === false) {
      if (session && hasPendingSync()) setStatus("backup", "Local backup • รอเชื่อมต่อ");
      return !session || !hasPendingSync();
    }
    syncing = true;
    setStatus("backup", "กำลัง Sync Firebase");
    try {
      const orderedResults = Object.values(backup.pendingResults || {})
        .sort((left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0));
      for (const item of orderedResults) {
        if (item.type === "finish") {
          const finish = backup.pendingFinishes?.[item.eventId];
          if (!finish) throw new Error("firebase_finish_operation_missing");
          await flushFinish(finish);
        } else {
          await flushResult(item);
        }
      }
      for (const item of Object.values(backup.pendingFinishes || {})) await flushFinish(item);
      await flushCurrent();
      try {
        await flushSchedule();
      } catch (scheduleError) {
        backup.scheduleError = String(scheduleError?.message || scheduleError);
        persist();
        setStatus("backup", `Room ${session.code} • ตารางรอ Sync`);
        console.warn("PepsLive Match Room schedule sync pending", scheduleError);
        scheduleSync(5000);
        return true;
      }
      setStatus("online", `Room ${session.code} • ${runtime.mode}`);
      return true;
    } catch (error) {
      backup.lastError = String(error?.message || error);
      persist();
      setStatus("error", "Local backup • Sync ไม่สำเร็จ");
      console.warn("PepsLive Match Room sync pending", error);
      return false;
    } finally {
      syncing = false;
      const waiters = syncWaiters;
      syncWaiters = [];
      waiters.forEach((resolve) => resolve());
      reportHostState();
      if (syncAgain) {
        syncAgain = false;
        scheduleSync(50);
      }
    }
  }

  function waitForActiveSync() {
    if (!syncing) return Promise.resolve();
    return new Promise((resolve) => syncWaiters.push(resolve));
  }

  async function flushForDock(options = {}) {
    if (!isEnabled()) {
      const state = hostState();
      return { ok: false, pending: state.pending, error: "firebase_result_mode_disabled", state };
    }
    const operationId = String(options?.operationId || "");
    const operation = operationId
      ? (backup.pendingResults?.[operationId] || backup.pendingFinishes?.[operationId])
      : null;
    const targetSequence = Math.max(
      0,
      Number(operation?.sequence || backup.pendingCurrentSequence || backup.currentSequence || 0)
    );
    const targetAcknowledged = () => {
      if (operationId && (backup.pendingResults?.[operationId] || backup.pendingFinishes?.[operationId])) return false;
      return Number(backup.syncedSequence || 0) >= targetSequence;
    };
    if (!persist()) {
      const state = hostState();
      return { ok: false, pending: true, error: "firebase_local_backup_failed", state };
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await waitForActiveSync();
      await flushAll();
      await waitForActiveSync();
      if (targetAcknowledged()) {
        backup.lastError = "";
        if (!persist()) {
          const state = hostState();
          return { ok: false, pending: true, error: "firebase_local_backup_failed", state };
        }
        const state = hostState();
        return { ok: Boolean(state.connected && state.roomStatus === "OPEN"), pending: false, error: "", state };
      }
      if (!runtime || !databaseConnected || navigator.onLine === false) break;
    }
    const state = hostState();
    return {
      ok: false,
      pending: true,
      error: backupPersistenceError || backup.lastError || "firebase_sync_pending",
      state
    };
  }

  async function createRoom() {
    if (!isEnabled()) {
      notify("เลือก Firebase Realtime Database ที่ Settings > Sheet ก่อนสร้างห้อง");
      return;
    }
    if (!runtime || !databaseConnected || (session && session.status !== "CLOSED")) return;
    ui.create.disabled = true;
    setStatus("backup", "กำลังจองเลขห้อง");
    let lastCreateError;
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = randomRoomCode();
      const now = Date.now();
      const timestamp = firebase.serverTimestamp();
      const initialSnapshot = backup.latestSnapshot || bridge.getSnapshot();
      const meta = {
        ...normalizeMeta({
          ...readMetaDraft(code),
          ownerUid: runtime.user.uid,
          status: "OPEN"
        }, { createdAt: now, updatedAt: now }),
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const current = { ...normalizeCurrent(initialSnapshot, 1, now), updatedAt: timestamp };
      const initialSchedule = readSchedule();
      const initialScheduleFingerprint = scheduleFingerprint(initialSchedule);
      const schedule = {
        ...initialSchedule,
        fingerprint: initialScheduleFingerprint,
        revision: 1,
        updatedAt: timestamp
      };
      const roomRef = firebase.ref(runtime.database, `${ROOM_ROOT}/${code}`);
      try {
        await firebase.set(roomRef, { meta, current, schedule });
      } catch (error) {
        lastCreateError = error;
        backup.lastError = `room_create:${error?.code || error?.message || error}`;
        persist();
        if (!/permission.?denied/i.test(`${error?.code || ""} ${error?.message || error}`)) break;
        continue;
      }
      backup.lastFingerprint = fingerprint(initialSnapshot);
      backup.lastScheduleFingerprint = initialScheduleFingerprint;
      backup.scheduleError = "";
      backup.revision = 1;
      if (fingerprint(backup.pendingCurrent) === backup.lastFingerprint) backup.pendingCurrent = null;
      session = {
        code,
        ownerUid: runtime.user.uid,
        status: "OPEN",
        publicView: meta.publicView,
        meta,
        mode: runtime.mode,
        viewerUrl: firebase.viewerUrlForRoom(code, runtime.mode),
        createdAt: now
      };
      if (!persist()) {
        setStatus("error", "สร้าง Room แล้ว แต่ Firebase Local backup เขียนไม่ได้");
        renderSession();
        notify(`สร้าง Match Room ${code} แล้ว แต่ห้ามปิดหน้านี้จนกว่าจะบันทึก Local backup ได้`);
        return;
      }
      renderSession();
      await flushAll();
      notify(`สร้าง Match Room ${code} แล้ว`);
      return;
    }
    ui.create.disabled = false;
    throw lastCreateError || new Error("room_code_allocation_failed");
  }

  async function saveMeta() {
    if (!isEnabled() || !runtime || !databaseConnected || !session || session.status === "CLOSED") return;
    const draft = readMetaDraft(session.code);
    const patch = {
      publicView: draft.publicView,
      status: session.status,
      eventName: draft.eventName,
      venue: draft.venue,
      round: draft.round,
      group: draft.group,
      updatedAt: firebase.serverTimestamp()
    };
    await firebase.update(firebase.ref(runtime.database, `${ROOM_ROOT}/${session.code}/meta`), patch);
    session = { ...session, publicView: patch.publicView, meta: { ...session.meta, ...patch } };
    persist();
    renderSession();
    notify("อัปเดตข้อมูล Match Room แล้ว");
  }

  async function closeRoom() {
    if (!runtime || !databaseConnected || !session || session.status === "CLOSED") return;
    closing = true;
    ui.close.disabled = true;
    reportHostState();
    try {
      const flushed = await flushAll(true);
      if (!flushed || hasPendingSync()) {
        throw new Error("ยังมีข้อมูลรอ Sync กรุณาเชื่อมต่อแล้วลองปิดห้องอีกครั้ง");
      }
      const now = Date.now();
      await firebase.update(firebase.ref(runtime.database, `${ROOM_ROOT}/${session.code}/meta`), {
        status: "CLOSED",
        updatedAt: firebase.serverTimestamp()
      });
      if (Object.keys(backup.pendingFinishes || {}).length) {
        quarantinePending("finish_during_room_close");
        notify("พบ Finish ระหว่างปิดห้อง จึงเก็บสำรองไว้ในเครื่องและไม่เปิดห้องเก่ากลับ");
      }
      session = { ...session, status: "CLOSED", meta: { ...session.meta, status: "CLOSED", updatedAt: now } };
      if (!persist()) setStatus("error", "ปิด Room แล้ว แต่ Local session backup เขียนไม่ได้");
      renderSession();
      notify(`ปิด Match Room ${session.code} แล้ว`);
    } finally {
      closing = false;
      if (session && session.status !== "CLOSED" && fingerprint(backup.latestSnapshot) !== backup.lastFingerprint) {
        backup.pendingCurrent = backup.latestSnapshot;
        persist();
        scheduleSync(100);
      }
      renderSession();
    }
  }

  async function copyViewerUrl() {
    if (!session?.viewerUrl) return;
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(session.viewerUrl);
    else {
      const input = document.createElement("textarea");
      input.value = session.viewerUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    notify("Copy Viewer URL แล้ว");
  }

  ui.create.addEventListener("click", () => createRoom().catch((error) => {
    setStatus("error", "สร้างห้องไม่สำเร็จ");
    notify(`สร้าง Match Room ไม่สำเร็จ: ${error.message || error}`);
    renderSession();
  }));
  ui.save.addEventListener("click", () => saveMeta().catch((error) => notify(`อัปเดตห้องไม่สำเร็จ: ${error.message || error}`)));
  ui.copy.addEventListener("click", () => copyViewerUrl().catch((error) => notify(`Copy ไม่สำเร็จ: ${error.message || error}`)));
  ui.open.addEventListener("click", () => { if (session?.viewerUrl) window.open(session.viewerUrl, "_blank", "noopener"); });
  ui.close.addEventListener("click", () => closeRoom().catch((error) => notify(`ปิดห้องไม่สำเร็จ: ${error.message || error}`)));
  const unregisterHostAdapter = typeof bridge.registerHostAdapter === "function"
    ? bridge.registerHostAdapter({ getState: hostState, flush: flushForDock })
    : null;
  window.addEventListener("pagehide", () => {
    if (typeof unregisterHostAdapter === "function") unregisterHostAdapter();
  }, { once: true });
  let firebaseInitPromise;
  let firebaseRetryTimer;

  async function initializeFirebase() {
    if (runtime) return runtime;
    if (firebaseInitPromise) return firebaseInitPromise;
    firebaseInitPromise = (async () => {
      firebase ||= await import("./firebase-runtime.js");
      const nextRuntime = await firebase.getFirebaseRuntime();
      setStatus("backup", `กำลังเชื่อม Firebase ${nextRuntime.mode}`);
      await waitForDatabaseConnection(nextRuntime);
      let ownershipLost = false;
      if (session) {
        let metaSnapshot;
        try {
          metaSnapshot = await firebase.get(firebase.ref(nextRuntime.database, `${ROOM_ROOT}/${session.code}/meta`));
        } catch (error) {
          if (!/permission.?denied/i.test(`${error?.code || ""} ${error?.message || error}`)) throw error;
          ownershipLost = true;
        }
        const liveMeta = metaSnapshot?.val();
        if (ownershipLost || !liveMeta || liveMeta.ownerUid !== nextRuntime.user.uid) {
          backup.lastError = "owner_uid_changed_or_room_missing";
          quarantinePending(backup.lastError);
          session = null;
          persist();
          setStatus("error", "กู้ห้องเดิมไม่ได้ • UID เปลี่ยน");
          notify("Anonymous UID เปลี่ยนหรือห้องเดิมไม่มีแล้ว จึงไม่สามารถเขียนห้องเดิมได้");
        } else {
          session = {
            ...session,
            ownerUid: nextRuntime.user.uid,
            status: liveMeta.status,
            publicView: liveMeta.publicView,
            meta: liveMeta,
            mode: nextRuntime.mode,
            viewerUrl: firebase.viewerUrlForRoom(session.code, nextRuntime.mode)
          };
        }
      }
      runtime = nextRuntime;
      clearTimeout(firebaseRetryTimer);
      renderSession();
      if (!session && !ownershipLost) setStatus("online", `Firebase ${runtime.mode} พร้อม`);
      if (isEnabled()) scheduleSync(50);
      return runtime;
    })();
    try {
      return await firebaseInitPromise;
    } finally {
      firebaseInitPromise = undefined;
    }
  }

  async function connectFirebase() {
    try {
      return await initializeFirebase();
    } catch (error) {
      backup.lastError = String(error?.message || error);
      persist();
      setStatus("error", "Firebase Offline • Local backup ทำงาน");
      renderSession();
      clearTimeout(firebaseRetryTimer);
      if (navigator.onLine !== false && (isEnabled() || session?.status === "OPEN")) {
        firebaseRetryTimer = setTimeout(() => connectFirebase().catch(() => {}), 5000);
      }
      throw error;
    }
  }

  window.addEventListener("online", () => {
    if (!isEnabled() && session?.status !== "OPEN") return;
    connectFirebase().then(() => scheduleSync(100)).catch(() => {});
  });
  if (persist()) setStatus("backup", "Local backup พร้อม");
  else setStatus("error", "Firebase Local backup เขียนไม่ได้");
  renderSession();
  if (isEnabled() || session?.status === "OPEN") await connectFirebase().catch(() => {});
}

function mountStyles() {
  if (document.querySelector("link[data-match-room-style]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./match-room.css", import.meta.url).toString();
  link.dataset.matchRoomStyle = "1";
  document.head.appendChild(link);
}

function mountUi() {
  const mount = document.getElementById("moduleSystem");
  const container = document.createElement("div");
  container.className = "match-room-host";
  container.innerHTML = `
    <div class="match-room-host-head"><h3>Firebase Match Room</h3><span class="match-room-host-status" data-state="backup">กำลังเริ่มระบบ</span></div>
    <div class="match-room-host-head"><strong class="match-room-host-code">------</strong><small>Viewer อ่านอย่างเดียว</small></div>
    <div class="match-room-host-actions">
      <button class="primary tiny" type="button" data-room-action="create" disabled>สร้างห้อง</button>
      <button class="soft tiny" type="button" data-room-action="copy" disabled>Copy Viewer</button>
      <button class="ghost tiny" type="button" data-room-action="open" disabled>เปิด Viewer</button>
      <button class="danger tiny" type="button" data-room-action="close" disabled>ปิดห้อง</button>
    </div>
    <div class="match-room-host-link"><code>ยังไม่ได้สร้างห้อง</code></div>
    <details class="match-room-host-details">
      <summary>ข้อมูลที่แสดงใน Viewer</summary>
      <div class="match-room-host-fields">
        <label>ชื่อรายการ<input type="text" maxlength="150" data-room-field="eventName" value="PepsLive Match Room"></label>
        <label>สถานที่<input type="text" maxlength="200" data-room-field="venue"></label>
        <label>รอบ<input type="text" maxlength="100" data-room-field="round"></label>
        <label>กลุ่ม<input type="text" maxlength="100" data-room-field="group"></label>
        <label class="match-room-host-public"><input type="checkbox" data-room-field="publicView" checked> เปิดให้ Viewer อ่าน</label>
      </div>
      <button class="soft tiny" type="button" data-room-action="save" disabled>บันทึกข้อมูลห้อง</button>
    </details>`;
  mount.appendChild(container);
  return {
    container,
    status: container.querySelector(".match-room-host-status"),
    code: container.querySelector(".match-room-host-code"),
    link: container.querySelector(".match-room-host-link code"),
    create: container.querySelector('[data-room-action="create"]'),
    copy: container.querySelector('[data-room-action="copy"]'),
    open: container.querySelector('[data-room-action="open"]'),
    close: container.querySelector('[data-room-action="close"]'),
    save: container.querySelector('[data-room-action="save"]'),
    eventName: container.querySelector('[data-room-field="eventName"]'),
    venue: container.querySelector('[data-room-field="venue"]'),
    round: container.querySelector('[data-room-field="round"]'),
    group: container.querySelector('[data-room-field="group"]'),
    publicView: container.querySelector('[data-room-field="publicView"]')
  };
}

function loadJson(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch (_) {
    return fallback;
  }
}
