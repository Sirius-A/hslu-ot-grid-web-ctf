'use strict';

/*
 * Access gate for the central control system (FUXA SCADA).
 *
 * The dispatch console is on the operations network, not the public internet.
 * We model that boundary here: the console is only reachable by a caller that
 * already holds a GridOps *supervisor* session -- i.e. a student who has
 * completed stage 1 and stolen the supervisor cookie. Without it, the gate
 * returns 401 and the FUXA instance behind it is never touched.
 *
 * The gridops_session cookie is a host-only cookie for `localhost`, and cookies
 * are not isolated by port, so the browser sends it to this gate (:8300) just
 * as it does to the portal (:8100). The gate validates it against the portal's
 * session store before proxying (HTTP and WebSocket) to FUXA.
 */

const http = require('http');
const httpProxy = require('http-proxy');

const PORT = Number(process.env.PORT || 8080);
const TARGET = process.env.SCADA_TARGET || 'http://scada:1881';
const PORTAL = process.env.PORTAL_URL || 'http://web:3000';
const PORTAL_PUBLIC = process.env.PORTAL_PUBLIC_URL || 'http://localhost:8100';
const SESSION_COOKIE = 'gridops_session';

const proxy = httpProxy.createProxyServer({
  target: TARGET,
  ws: true,
  changeOrigin: true,
  xfwd: true
});

proxy.on('error', (err, req, res) => {
  if (res && res.writeHead && !res.headersSent) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('control system temporarily unavailable');
  } else if (res && res.destroy) {
    res.destroy();
  }
});

const readCookie = (header, name) => {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) {
      return part.slice(idx + 1).trim();
    }
  }
  return undefined;
};

/** Validate the supervisor session against the portal. Fails closed. */
const hasSupervisorSession = async req => {
  const token = readCookie(req.headers.cookie, SESSION_COOKIE);
  if (!token) {
    return false;
  }
  try {
    const res = await fetch(`${PORTAL}/api/session`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` }
    });
    if (!res.ok) {
      return false;
    }
    const body = await res.json();
    return body.role === 'admin';
  } catch {
    return false;
  }
};

const DENIED = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>Central control system — access denied</title>
<style>
  body { font-family: Arial, sans-serif; background: #000028; color: #e8e8f0;
         display: flex; min-height: 100vh; margin: 0; align-items: center; justify-content: center; }
  .card { max-width: 440px; padding: 32px 36px; border: 1px solid #33334f;
          border-radius: 4px; background: #15152e; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.5; color: #ccccd4; }
  code { color: #00cccc; }
  a { color: #00cccc; }
</style></head>
<body><div class="card">
  <h1>Supervisor session required</h1>
  <p>The regional load dispatch console is on the operations network. It is only
     reachable with an active <code>${SESSION_COOKIE}</code> supervisor session.</p>
  <p>Sign in at the <a href="${PORTAL_PUBLIC}/admin/login">operations portal</a>.</p>
</div></body></html>`;

const server = http.createServer(async (req, res) => {
  if (await hasSupervisorSession(req)) {
    return proxy.web(req, res);
  }
  res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' });
  res.end(DENIED);
});

server.on('upgrade', async (req, socket, head) => {
  if (await hasSupervisorSession(req)) {
    return proxy.ws(req, socket, head);
  }
  socket.destroy();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[scada-gate] listening on :${PORT} -> ${TARGET} (auth via ${PORTAL})`);
});
