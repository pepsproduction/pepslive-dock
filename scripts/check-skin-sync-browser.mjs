import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSameOriginServer } from './serve-same-origin.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 8123);
const BASE = `http://${HOST}:${PORT}`;

const requiredUrls = [
  '/pepslive-dock/PepsLive_Dock_V1.html',
  '/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&debug=1',
  '/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01&debug=1',
  '/pepslive-scoreboard-skin-studio/overlays/live.html?skin=BB-LIVE-01&debug=1',
  '/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=BB-SUM-01&debug=1'
];

function log(msg) {
  console.log(`[sync-qa] ${msg}`);
}

async function assertHttp200(urlPath) {
  const response = await fetch(BASE + urlPath, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${urlPath}`);
  }
  log(`PASS HTTP 200 ${urlPath}`);
}

function printManualChecklist() {
  log('Playwright/browser automation not available in current environment.');
  log('Manual same-origin checklist:');
  log(`1) Start server: node ${path.relative(process.cwd(), path.resolve(__dirname, 'serve-same-origin.mjs'))}`);
  log(`2) Open Dock: ${BASE}/pepslive-dock/PepsLive_Dock_V1.html`);
  log(`3) Open Live Debug: ${BASE}/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&debug=1`);
  log(`4) Open Summary Debug: ${BASE}/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01&debug=1`);
  log('5) In Dock: open the Skin popup if needed, then change score/time/status normally.');
  log('6) Verify overlay debug source=pepslive-dock and values update.');
  log('7) Check localStorage key pepslive.scoreboard.sharedState.v1 on same origin.');
}

async function tryPlaywrightAutomation() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (_) {
    return { supported: false };
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const dock = await context.newPage();
  const overlay = await context.newPage();

  try {
    await dock.addInitScript(() => {
      localStorage.setItem('pepslive_dock_v1_auth', JSON.stringify({
        authenticated: true,
        username: 'QA Bot',
        province: 'กรุงเทพมหานคร'
      }));
    });

    await dock.goto(`${BASE}/pepslive-dock/PepsLive_Dock_V1.html`, { waitUntil: 'domcontentloaded' });
    await dock.waitForSelector('#scoreBtnsA button', { timeout: 10000 });

    await overlay.goto(`${BASE}/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&debug=1`, { waitUntil: 'domcontentloaded' });
    await overlay.waitForTimeout(700);

    await dock.click('#scoreBtnsA button');
    await dock.waitForTimeout(1200);

    const storagePayload = await dock.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('pepslive.scoreboard.sharedState.v1') || '{}');
      } catch (_) {
        return null;
      }
    });

    if (!storagePayload || storagePayload.protocol !== 'PEPSLIVE_SCOREBOARD_STATE_V1') {
      throw new Error('invalid localStorage payload protocol');
    }

    const debugText = await overlay.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('div,span')).map((el) => (el.textContent || '').trim());
      return candidates.find((txt) => txt.includes('pepslive-dock') || txt.includes('PEPSLIVE_SCOREBOARD_STATE_V1')) || '';
    });

    if (!debugText) {
      throw new Error('overlay debug signal not found');
    }

    log('PASS browser automation: background sync + overlay debug signal');
    return { supported: true, passed: true };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  const service = createSameOriginServer({ host: HOST, port: PORT });
  await service.start();
  log(`server started at ${BASE}`);

  try {
    for (const url of requiredUrls) {
      await assertHttp200(url);
    }

    const automationResult = await tryPlaywrightAutomation();
    if (!automationResult.supported) {
      printManualChecklist();
      return;
    }
    if (!automationResult.passed) {
      throw new Error('automation failed');
    }
  } finally {
    await service.stop();
    log('server stopped');
  }
}

main().catch((error) => {
  console.error('[sync-qa] FAIL', error && error.message ? error.message : error);
  process.exitCode = 1;
});
