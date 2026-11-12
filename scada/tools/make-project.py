#!/usr/bin/env python3
"""
Generates the FUXA project for the GridOps regional load dispatch centre.

Output: scada/seed/project.json -- a normal FUXA project export, seeded into the
container's project database at first start.

The project deliberately contains a server-side script without a `permission`
field. That is the precondition for CVE-2026-43947 (FUXA <= 1.3.0): the
authorisation check in `isAuthorised()` looks at the *stored* script, while
test mode executes the code from the request body.
"""

import json
import pathlib

W, H = 1280, 760
BG = "#001026ff"
PETROL = "#00a3ab"
TEAL = "#00cccc"
GREEN = "#00ffb9"
AMBER = "#ffd732"
RED = "#ff2640"
INK = "#e8e8f0"
MUTED = "#8a90b0"

SERVER_NAME = "FUXA Server"

# ----------------------------------------------------------------- tags ----

TAGS = [
    ("GRID_FREQ_HZ", "number", 50.01, "Hz"),
    ("BUS_A_KV", "number", 110.4, "kV"),
    ("BUS_B_KV", "number", 16.2, "kV"),
    ("T1_LOAD_MW", "number", 28.4, "MW"),
    ("T2_LOAD_MW", "number", 22.1, "MW"),
    ("FEEDER_01_A", "number", 312.0, "A"),
    ("FEEDER_02_A", "number", 268.0, "A"),
    ("FEEDER_03_A", "number", 141.0, "A"),
    ("FEEDER_04_A", "number", 2.0, "A"),
    ("INTERTIE_MW", "number", -14.6, "MW"),
    ("RESERVE_MW", "number", 41.0, "MW"),
    ("ALARMS_ACTIVE", "number", 2, ""),
    # Breaker states are strings so the HMI shows the state text directly.
    ("CB_101_STATE", "string", "CLOSED", ""),
    ("CB_102_STATE", "string", "CLOSED", ""),
    ("CB_201_STATE", "string", "CLOSED", ""),
    ("CB_204_STATE", "string", "OPEN", ""),
    ("DISPATCH_MODE", "string", "AUTOMATIC", ""),
]


def server_tags():
    tags = {}
    for name, ttype, value, _unit in TAGS:
        tags[name] = {
            "id": name,
            "name": name,
            "type": ttype,
            "address": name,
            "init": str(value),
            "value": value,
        }
    return tags


# ----------------------------------------------------------------- views ---

svg_parts = []
items = {}


def add(markup):
    svg_parts.append(markup)


def text(x, y, content, size=14, fill=INK, anchor="start", weight="normal", family="sans-serif"):
    add(
        f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" fill="{fill}" '
        f'text-anchor="{anchor}" font-weight="{weight}" xml:space="preserve">{content}</text>'
    )


def rect(x, y, w, h, fill, stroke=None, sw=0, rx=0):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    r = f' rx="{rx}"' if rx else ""
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}"{s}{r}/>')


def line(x1, y1, x2, y2, stroke=PETROL, sw=2, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{d}/>')


def circle(cx, cy, r, stroke=INK, sw=2, fill="none"):
    add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')


counter = [0]


def value_item(x, y, tag, ranges, size=15, fill=TEAL, anchor="start", weight="bold"):
    """A FUXA svg-ext-value: a <g> wrapper whose <text> the runtime fills in."""
    counter[0] += 1
    gid = f"VAL_gridops_{counter[0]:03d}"
    tid = f"VAL_gridops_text_{counter[0]:03d}"
    add(
        f'<g id="{gid}" type="svg-ext-value" text-anchor="{anchor}" font-family="sans-serif" '
        f'font-size="{size}" fill="none" stroke-width="0">'
        f'<text id="{tid}" x="{x}" y="{y}" font-family="sans-serif" font-size="{size}" '
        f'fill="{fill}" font-weight="{weight}" text-anchor="{anchor}" xml:space="preserve">##.##</text>'
        f"</g>"
    )
    items[gid] = {
        "id": gid,
        "type": "svg-ext-value",
        "name": tag,
        "property": {
            "events": [],
            "variable": tag,
            # The client keys live values by the raw tag id.
            "variableId": tag,
            "variableSrc": SERVER_NAME,
            "alarmId": "",
            "alarmSrc": "",
            "alarm": "",
            "alarmColor": "",
            "ranges": ranges,
        },
        "label": "Value",
    }


unit = lambda u: [{"type": "unit", "min": -1000000, "max": 1000000, "text": f" {u}"}]
onoff = []
plain = []

# --- chrome
rect(0, 0, W, H, BG)
rect(0, 0, W, 54, "#00182eff")
line(0, 54, W, 54, PETROL, 2)
text(28, 34, "REGIONAL LOAD DISPATCH CENTRE", 20, INK, weight="bold")
text(470, 34, "GridOps North  &#183;  UW Rotkreuz 110/16 kV", 13, MUTED)
text(W - 28, 34, "SCADA / HMI", 13, PETROL, anchor="end")

# --- incoming grid
text(90, 92, "INFEED 220 kV / NETZ NORD", 12, MUTED)
line(200, 100, 200, 136, PETROL, 3)
line(880, 100, 880, 136, PETROL, 3)

# --- 110 kV busbar
rect(90, 136, W - 300, 9, PETROL)
text(90, 128, "BUSBAR A &#8212; 110 kV", 13, INK, weight="bold")
value_item(330, 128, "BUS_A_KV", unit("kV"))
text(395, 128, "kV", 12, MUTED)

# --- transformers
for cx, label, tag in ((330, "T1  40 MVA", "T1_LOAD_MW"), (700, "T2  40 MVA", "T2_LOAD_MW")):
    line(cx, 145, cx, 196, INK, 2)
    circle(cx, 214, 20)
    circle(cx, 238, 20)
    line(cx, 258, cx, 306, INK, 2)
    text(cx + 32, 214, label, 12, MUTED)
    value_item(cx + 32, 236, tag, unit("MW"))
    text(cx + 92, 236, "MW", 12, MUTED)

# --- 16 kV busbar
rect(90, 306, W - 300, 9, PETROL)
text(90, 298, "BUSBAR B &#8212; 16 kV", 13, INK, weight="bold")
value_item(320, 298, "BUS_B_KV", unit("kV"))
text(380, 298, "kV", 12, MUTED)

# --- feeders
feeders = (
    (180, "ABGANG 01  Rotkreuz Dorf", "FEEDER_01_A", "CB_101_STATE"),
    (400, "ABGANG 02  Industrie Ost", "FEEDER_02_A", "CB_102_STATE"),
    (620, "ABGANG 03  Pumpwerk Seetal", "FEEDER_03_A", "CB_201_STATE"),
    (840, "ABGANG 04  Reserve", "FEEDER_04_A", "CB_204_STATE"),
)
for x, label, amp, cb in feeders:
    line(x, 315, x, 372, INK, 2)
    rect(x - 13, 372, 26, 26, "#00182eff", INK, 2)
    line(x, 398, x, 452, INK, 2)
    line(x - 16, 452, x + 16, 452, INK, 3)
    text(x, 486, label, 11, MUTED, anchor="middle")
    value_item(x - 6, 428, amp, unit("A"), size=13, anchor="end", fill=INK)
    text(x + 1, 428, "A", 11, MUTED)
    value_item(x, 512, cb, onoff, size=12, anchor="middle", fill=GREEN, weight="normal")

# --- right panel
px = W - 182
rect(px - 18, 90, 180, 420, "#00182eff", "#1d3a5a", 1, rx=4)
text(px, 118, "SYSTEM", 12, PETROL, weight="bold")

panel = (
    (158, "Frequenz [Hz]", "GRID_FREQ_HZ", unit("Hz"), TEAL),
    (212, "Kuppelleistung [MW]", "INTERTIE_MW", unit("MW"), TEAL),
    (266, "Regelreserve [MW]", "RESERVE_MW", unit("MW"), GREEN),
    (320, "Aktive Alarme", "ALARMS_ACTIVE", plain, AMBER),
    (374, "Betriebsart", "DISPATCH_MODE", plain, INK),
)
for y, label, tag, rng, colour in panel:
    text(px, y, label, 11, MUTED)
    value_item(px, y + 24, tag, rng, size=17, fill=colour)

text(px, 440, "Leitstelle besetzt", 11, MUTED)
text(px, 462, "SCHICHT B", 13, INK, weight="bold")

# --- footer
line(0, H - 46, W, H - 46, "#1d3a5a", 1)
text(28, H - 20, "FUXA 1.3.0  &#183;  project: gridops-dispatch  &#183;  server scripts: 2", 11, MUTED)
text(W - 28, H - 20, "Zutritt nur fuer autorisiertes Betriebspersonal", 11, MUTED, anchor="end")

svgcontent = (
    f'<svg width="{W}" height="{H}" xmlns="http://www.w3.org/2000/svg" '
    f'xmlns:svg="http://www.w3.org/2000/svg" xmlns:html="http://www.w3.org/1999/xhtml">'
    f"<g><title>Layer 1</title>" + "".join(svg_parts) + "</g></svg>"
)

view = {
    "id": "v_gridops_dispatch",
    "name": "LoadDispatch",
    "profile": {"width": W, "height": H, "bkcolor": BG},
    "items": items,
    "variables": [],
    "svgcontent": svgcontent,
}

# --------------------------------------------------------------- scripts ---

TELEMETRY = """
// Cyclic refresh of the dispatch telemetry (simulated field values).
var jitter = function (base, span) { return Math.round((base + (Math.random() - 0.5) * span) * 100) / 100; };

$setTag('GRID_FREQ_HZ', jitter(50.0, 0.06));
$setTag('BUS_A_KV', jitter(110.2, 0.8));
$setTag('BUS_B_KV', jitter(16.1, 0.3));
$setTag('T1_LOAD_MW', jitter(28.0, 3.5));
$setTag('T2_LOAD_MW', jitter(22.0, 3.0));
$setTag('FEEDER_01_A', jitter(310, 28));
$setTag('FEEDER_02_A', jitter(265, 24));
$setTag('FEEDER_03_A', jitter(140, 18));
$setTag('INTERTIE_MW', jitter(-14.0, 6.0));
$setTag('RESERVE_MW', jitter(41.0, 4.0));
""".strip()

LOAD_SHEDDING = """
// Stage 1 load shedding: trips the lowest priority feeder and logs the action.
$setTag('CB_204_STATE', 'OPEN');
$setTag('FEEDER_04_A', 0);
$setTag('DISPATCH_MODE', 'LOAD SHEDDING');
return 'stage 1 load shedding executed';
""".strip()

scripts = [
    {
        # No `permission` field -- this is what CVE-2026-43947 abuses.
        "id": "s_gridops_telemetry",
        "name": "RefreshDispatchTelemetry",
        "code": TELEMETRY,
        "parameters": [],
        "sync": False,
        "mode": "SERVER",
        "scheduling": {"mode": "interval", "interval": 2, "schedules": []},
    },
    {
        "id": "s_gridops_shedding",
        "name": "LoadSheddingStage1",
        "code": LOAD_SHEDDING,
        "parameters": [],
        "sync": False,
        "mode": "SERVER",
        "scheduling": {"mode": "none", "interval": 0, "schedules": []},
    },
]

# The internal FUXA server device. It has to appear both as `server` (the
# project descriptor) and in `devices` -- the runtime only activates devices it
# finds in `devices`, and `FuxaServerId` is hard-coded to '0'.
fuxa_server = {
    "id": "0",
    "name": SERVER_NAME,
    "type": "FuxaServer",
    "property": {},
    "enabled": True,
    "polling": 1000,
    "tags": server_tags(),
}

project = {
    "version": "1.03",
    "name": "gridops-dispatch",
    "server": fuxa_server,
    "devices": {SERVER_NAME: fuxa_server},
    "hmi": {
        "views": [view],
        "layout": {
            "showdev": False,
            "showhome": True,
            "header": {"title": "GridOps Load Dispatch", "bkcolor": "#00182eff", "fontcolor": INK},
            "navigation": {"mode": "void"},
            "start": view["id"],
        },
    },
    "scripts": scripts,
    "alarms": [],
    "charts": [],
    "texts": [],
}

out = pathlib.Path(__file__).resolve().parents[1] / "seed" / "project.json"
out.write_text(json.dumps(project, indent=1), encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size} bytes, {len(items)} bound items, {len(scripts)} scripts)")
