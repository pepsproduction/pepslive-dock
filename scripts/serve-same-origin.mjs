import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DOCK_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SKIN_ROOT = path.resolve('D:/pepslive-scoreboard-skin-studio/pepslive-scoreboard-skin-studio');
let relayState = null;
let relayUpdatedAt = '';

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.ico': return 'image/x-icon';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function safeDecode(uriPart) {
  try {
    return decodeURIComponent(uriPart);
  } catch (_) {
    return uriPart;
  }
}

function resolveScopedFile(scopeRoot, requestPath) {
  const decoded = safeDecode(requestPath);
  const normalized = decoded.replace(/^\/+/, '');
  const candidate = path.resolve(scopeRoot, normalized);
  const rootWithSep = scopeRoot.endsWith(path.sep) ? scopeRoot : scopeRoot + path.sep;
  if (!(candidate === scopeRoot || candidate.startsWith(rootWithSep))) {
    return null;
  }
  return candidate;
}

function statSafe(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (_) {
    return null;
  }
}

function serveFile(res, filePath) {
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, {
    'Content-Type': mimeType(filePath),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*'
  });
  stream.pipe(res);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    res.end('500 Internal Server Error');
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept'
  });
  res.end(JSON.stringify(data));
}

function readRequestBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limitBytes) {
        reject(new Error('request_body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleRelayEndpoint(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return true;
  }

  if (req.method === 'GET') {
    if (!relayState) {
      sendJson(res, 404, { ok: false, error: 'no_relay_state', updatedAt: relayUpdatedAt || null });
      return true;
    }
    sendJson(res, 200, relayState);
    return true;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const parsed = body ? JSON.parse(body) : {};
      const payload = parsed && parsed.payload ? parsed.payload : parsed;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        sendJson(res, 400, { ok: false, error: 'invalid_payload' });
        return true;
      }
      relayState = payload;
      relayUpdatedAt = new Date().toISOString();
      sendJson(res, 200, { ok: true, updatedAt: relayUpdatedAt, protocol: payload.protocol || null, source: payload.source || null });
      return true;
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error && error.message ? error.message : String(error) });
      return true;
    }
  }

  sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  return true;
}

function renderIndex(host, port) {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>PepsLive Same-Origin QA Server</title>
  <style>
    body{font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#0b1220;color:#eaf2ff;padding:24px}
    a{color:#6ec1ff}
    code{background:#182338;padding:2px 6px;border-radius:6px}
    .card{max-width:980px;border:1px solid #2a3b5f;background:#111b2f;border-radius:14px;padding:16px;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <h1>Same-Origin QA Server</h1>
    <p>Origin เดียว: <code>http://${host}:${port}</code></p>
    <ul>
      <li><a href="/pepslive-dock/PepsLive_Dock_V1.html">Dock UI</a></li>
      <li><a href="/pepslive-scoreboard-skin-studio/overlays/live.html?skin=FB-LIVE-01&debug=1">Football Live Debug</a></li>
      <li><a href="/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=FB-SUM-01&debug=1">Football Summary Debug</a></li>
      <li><a href="/pepslive-scoreboard-skin-studio/overlays/live.html?skin=BB-LIVE-01&debug=1">Basketball Live Debug</a></li>
      <li><a href="/pepslive-scoreboard-skin-studio/overlays/summary.html?skin=BB-SUM-01&debug=1">Basketball Summary Debug</a></li>
      <li><a href="/pepslive-relay/state.json">Local relay endpoint</a> <code>/pepslive-relay/state.json</code></li>
    </ul>
  </div>
</body>
</html>`;
}

export function createSameOriginServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 8123);
  const dockRoot = path.resolve(options.dockRoot || process.env.DOCK_ROOT || DEFAULT_DOCK_ROOT);
  const skinRoot = path.resolve(options.skinRoot || process.env.SKIN_STUDIO_ROOT || DEFAULT_SKIN_ROOT);

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
    const pathname = reqUrl.pathname || '/';

    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderIndex(host, port));
      return;
    }

    if (pathname === '/pepslive-relay/state.json') {
      handleRelayEndpoint(req, res);
      return;
    }

    let scopeRoot = null;
    let scopedPath = null;

    if (pathname.startsWith('/pepslive-dock/')) {
      scopeRoot = dockRoot;
      scopedPath = pathname.slice('/pepslive-dock/'.length);
    } else if (pathname.startsWith('/pepslive-scoreboard-skin-studio/')) {
      scopeRoot = skinRoot;
      scopedPath = pathname.slice('/pepslive-scoreboard-skin-studio/'.length);
    }

    if (!scopeRoot) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const resolved = resolveScopedFile(scopeRoot, scopedPath || '');
    if (!resolved) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
      return;
    }

    let target = resolved;
    let st = statSafe(target);

    if (!st && !path.extname(target)) {
      const htmlCandidate = target + '.html';
      const htmlStat = statSafe(htmlCandidate);
      if (htmlStat && htmlStat.isFile()) {
        target = htmlCandidate;
        st = htmlStat;
      }
    }

    if (st && st.isDirectory()) {
      const indexCandidate = path.join(target, 'index.html');
      const indexStat = statSafe(indexCandidate);
      if (indexStat && indexStat.isFile()) {
        target = indexCandidate;
        st = indexStat;
      }
    }

    if (!st || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    serveFile(res, target);
  });

  return {
    host,
    port,
    dockRoot,
    skinRoot,
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve({ host, port, dockRoot, skinRoot });
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    }
  };
}

async function runCli() {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 8123);
  const service = createSameOriginServer({ host, port });
  await service.start();
  console.log('[same-origin-server] running at http://' + host + ':' + port);
  console.log('[same-origin-server] dock root:', service.dockRoot);
  console.log('[same-origin-server] skin root:', service.skinRoot);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked === __filename) {
  runCli().catch((error) => {
    console.error('[same-origin-server] failed:', error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}
