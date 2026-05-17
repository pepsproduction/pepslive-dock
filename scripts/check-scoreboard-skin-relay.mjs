import { createRequire } from 'node:module';
import { createSameOriginServer } from './serve-same-origin.mjs';

const require = createRequire(import.meta.url);
const SkinSync = require('../src/scoreboard-skin-sync.js');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8123);
const BASE = `http://${HOST}:${PORT}`;
const RELAY_URL = `${BASE}/pepslive-relay/state.json`;

function log(message) {
  console.log(`[skin-relay-check] ${message}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const service = createSameOriginServer({ host: HOST, port: PORT });
  await service.start();
  log(`server started at ${BASE}`);

  try {
    const payload = SkinSync.createSkinStudioPayloadFromDockState({
      sport: 'football',
      eventTitle: 'PEPS RELAY CUP',
      teamAName: 'Relay Dragons',
      teamBName: 'Relay Tigers',
      teamAScore: 3,
      teamBScore: 2,
      matchTime: '45:00',
      half: '1H',
      matchStatus: 'LIVE'
    });

    const post = await fetch(RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ payload })
    });
    assert(post.ok, `POST failed with HTTP ${post.status}`);
    const postJson = await post.json();
    assert(postJson.ok === true, 'POST response did not return ok=true');
    log('PASS relay POST');

    const get = await fetch(RELAY_URL, { cache: 'no-store' });
    assert(get.ok, `GET failed with HTTP ${get.status}`);
    const state = await get.json();
    assert(state.protocol === 'PEPSLIVE_SCOREBOARD_STATE_V1', 'protocol mismatch');
    assert(state.source === 'pepslive-dock', 'source mismatch');
    assert(state.matchData.homeName === 'Relay Dragons', 'homeName mismatch');
    assert(state.matchData.awayScore === 2, 'awayScore mismatch');
    log('PASS relay GET protocol payload');

    const overlayUrl = `${BASE}/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&relay=${encodeURIComponent(RELAY_URL)}&debug=1`;
    const overlay = await fetch(overlayUrl, { cache: 'no-store' });
    assert(overlay.ok, `overlay relay URL failed with HTTP ${overlay.status}`);
    log('PASS overlay relay URL HTTP 200');
  } finally {
    await service.stop();
    log('server stopped');
  }
}

main().catch((error) => {
  console.error('[skin-relay-check] FAIL', error && error.message ? error.message : error);
  process.exitCode = 1;
});
