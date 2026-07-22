import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  connectDatabaseEmulator,
  get,
  getDatabase,
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
let runtimePromise;

export function resolveFirebaseMode(url = window.location.href) {
  const parsed = new URL(url, window.location.href);
  const requested = parsed.searchParams.get("firebaseMode");
  if (requested === "production" || requested === "emulator") return requested;
  return LOCAL_HOSTS.has(parsed.hostname) ? "emulator" : "production";
}

export function viewerUrlForRoom(roomCode, mode = resolveFirebaseMode()) {
  const url = new URL("../", import.meta.url);
  url.searchParams.set("room", String(roomCode || ""));
  if (LOCAL_HOSTS.has(url.hostname) || mode === "emulator") {
    url.searchParams.set("firebaseMode", mode);
  }
  return url.toString();
}

export async function getFirebaseRuntime() {
  if (runtimePromise) return runtimePromise;
  runtimePromise = (async () => {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const database = getDatabase(app);
    const mode = resolveFirebaseMode();

    if (mode === "emulator") {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectDatabaseEmulator(database, "127.0.0.1", 9000);
    }

    const credential = auth.currentUser
      ? { user: auth.currentUser }
      : await signInAnonymously(auth);

    return Object.freeze({
      app,
      auth,
      database,
      mode,
      user: credential.user
    });
  })();

  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = undefined;
    throw error;
  }
}

export { get, onValue, ref, runTransaction, serverTimestamp, set, update };
