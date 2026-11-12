'use strict';

/*
 * GridOps Regional Asset Portal -- CTF challenge backend.
 *
 * Deliberately vulnerable training target. Do not deploy on a public network.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const PORT = Number(process.env.PORT || 3000);
const FLAG = process.env.FLAG || 'HSLU{s1_m4p_t00lt1p_1nn3rHTML_1s_n0t_4_t3xt_n0d3}';
const ADMIN_USER = process.env.ADMIN_USER || 'ot.supervisor';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url');
const BOT_TOKEN = process.env.BOT_TOKEN || 'bot-token-change-me';
const SESSION_COOKIE = 'gridops_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MINUTES || 30) * 60 * 1000;
// -1 disables the library's tooltip truncation. Raise difficulty by setting a
// small value (e.g. 50, the library default) to force a compact payload.
const MAX_LABEL_LENGTH = Number(process.env.MAX_LABEL_LENGTH || -1);
const REVIEW_COOLDOWN_MS = Number(process.env.REVIEW_COOLDOWN_SECONDS || 15) * 1000;
const COLLECTOR_HINT = process.env.COLLECTOR_HINT || 'http://collector:8080';
const COLLECTOR_PUBLIC = process.env.COLLECTOR_PUBLIC || 'http://localhost:8200';
// Stage 2 of the lab: the regional load dispatch centre (FUXA SCADA/HMI).
// Only the supervisor may see that it exists, or where it lives.
const STAGE2_ENABLED = String(process.env.STAGE2_ENABLED || 'false') === 'true';
const SCADA_URL = process.env.SCADA_URL || 'http://localhost:8300';
const SCADA_INTERNAL_URL = process.env.SCADA_INTERNAL_URL || 'http://scada:1881';
// When ADMIN_PASSWORD is not provided it is randomised per deployment (above),
// so the supervisor password never lives in the compose file. The admin bot runs
// in its own container and learns the password through this shared-volume file.
const HANDSHAKE_DIR = process.env.HANDSHAKE_DIR || '/handshake';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

/* ------------------------------------------------- open source inventory */

/*
 * Written at image build time by tools/collect-licenses.js from the actually
 * installed dependency trees, so the About page lists what really ships.
 */
const readInventory = file => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch {
    return [];
  }
};

const inventory = [...readInventory('licenses-frontend.json'), ...readInventory('licenses-backend.json')];

const versionOf = name => inventory.find(pkg => pkg.name === name)?.version;

const GEO_PACKAGES = new Set([
  'ol',
  'ol-ext',
  'ol-mapbox-style',
  'geotiff',
  'pbf',
  'earcut',
  'rbush',
  'quickselect',
  'mapbox-to-css-font',
  'quick-lru',
  'pako',
  'lerc',
  'web-worker',
  'xml-utils',
  'zstddec'
]);

const CATEGORY_RULES = [
  {
    key: 'element',
    name: 'Siemens Element design system',
    match: pkg => pkg.scope === 'frontend' && pkg.name.startsWith('@siemens/')
  },
  {
    key: 'angular',
    name: 'Angular application platform',
    match: pkg =>
      pkg.scope === 'frontend' &&
      (pkg.name.startsWith('@angular/') || ['rxjs', 'zone.js', 'tslib'].includes(pkg.name))
  },
  {
    key: 'geo',
    name: 'Mapping and geospatial libraries',
    match: pkg => pkg.scope === 'frontend' && (GEO_PACKAGES.has(pkg.name) || pkg.name.startsWith('@mapbox/'))
  },
  {
    key: 'ui',
    name: 'Styling and icons',
    match: pkg => pkg.scope === 'frontend' && ['bootstrap', '@popperjs/core'].includes(pkg.name)
  },
  {
    key: 'frontend-other',
    name: 'Further browser dependencies',
    match: pkg => pkg.scope === 'frontend'
  },
  {
    key: 'backend',
    name: 'Portal backend (Node.js)',
    match: pkg => pkg.scope === 'backend'
  },
  { key: 'other', name: 'Other open source components', match: () => true }
];

const licenseCategories = CATEGORY_RULES.map(rule => ({ ...rule, packages: [] }));

for (const pkg of inventory) {
  const target = licenseCategories.find(category => category.match(pkg));
  target.packages.push(pkg);
}

const APP_NAME = 'GridOps Regional Asset Portal';
const APP_VERSION = '2.4.1';

/* ------------------------------------------------------------------ state */

const sites = new Map();
const sessions = new Map();
const reviewQueue = [];
const lastReviewRequest = new Map();
// Shopping carts for the Red Herring storefront, keyed by a cart cookie. This
// is an ordinary webshop flow over plain HTTP so it can be inspected/replayed.
const carts = new Map();
const CART_COOKIE = 'gridops_cart';
const CART_TTL_MS = 60 * 60 * 1000;
let siteCounter = 0;

const nowIso = () => new Date().toISOString();

const newId = () => {
  siteCounter += 1;
  return `SITE-${String(siteCounter).padStart(4, '0')}`;
};

const seed = [
  {
    name: 'UW Rotkreuz 110/16 kV',
    description: 'Primary distribution substation, two 40 MVA transformers.',
    assetType: 'substation',
    criticality: 'high',
    operator: 'Regional Grid North',
    lat: 47.1402,
    lon: 8.4312
  },
  {
    name: 'RTU Seetal Pumpwerk 3',
    description: 'Remote terminal unit, water pumping station, IEC 60870-5-104.',
    assetType: 'rtu',
    criticality: 'medium',
    operator: 'Water Works Lucerne',
    lat: 47.2089,
    lon: 8.2871
  },
  {
    name: 'PLC Hall B Compressor Line',
    description: 'S7-1500 controlling the compressed air line of production hall B.',
    assetType: 'plc',
    criticality: 'low',
    operator: 'Industriewerke Horw',
    lat: 47.0171,
    lon: 8.3082
  },
  {
    name: 'UW Emmenbruecke Feeder 4',
    description: 'Feeder bay with protection relay, scheduled for retrofit.',
    assetType: 'substation',
    criticality: 'high',
    operator: 'Regional Grid North',
    lat: 47.0769,
    lon: 8.2774
  },
  {
    // A vendor/supplier record that drifted into the asset register and comes
    // with a toy storefront (served by the /api/shop/* endpoints below). It has
    // nothing to do with either lab stage; keep the giveaway to the name and the
    // product range only -- the record itself reads like any other vendor entry.
    name: 'Red Herring Fishing Co.',
    description:
      'Supplier of maritime consumables (procurement vendor record). Runs a small online shop; not connected to any operational asset.',
    assetType: 'sensor',
    criticality: 'low',
    operator: 'Red Herring Fishing Co.',
    lat: 47.558,
    lon: 7.5885,
    webshop: {
      shopName: 'Red Herring Fishing Co. -- Online Shop',
      tagline: 'Nautical sundries and maritime provisions, Basel, since 1891.',
      products: [
        {
          name: 'Seemannsgarn (Premium)',
          price: 'CHF 4.90',
          blurb: "Finest hand-spun sailor's yarn, woven from genuine tall tales. At least 3 knots per metre.",
          badge: 'Bestseller'
        },
        {
          name: 'Snake Oil «Nordsee»',
          price: 'CHF 7.50',
          blurb: 'Traditional tonic in a maritime bottle. Cures absolutely everything, results may vary.'
        },
        {
          name: 'Smoked Red Herring',
          price: 'CHF 12.00',
          blurb: 'Our signature fillet. Guaranteed to draw attention away from what actually matters.',
          badge: 'Staff pick'
        },
        {
          name: 'Phishing Tackle Set',
          price: 'CHF 19.90',
          blurb: '14-piece beginner set. No spam included. Catch-and-release strongly recommended.'
        },
        {
          name: 'Maritime Patch Cable, 5 m',
          price: 'CHF 9.90',
          blurb: 'Saltwater-proof braided cable. Explicitly not rated for use in the control room.'
        },
        {
          name: 'Canned Sea Breeze',
          price: 'CHF 3.20',
          blurb: 'A fresh gust of the North Sea in a 400 ml tin. Shake well before opening.'
        }
      ]
    }
  }
];

for (const entry of seed) {
  const id = newId();
  sites.set(id, {
    id,
    ...entry,
    restricted: false,
    createdAt: nowIso(),
    review: { status: 'approved', requestedAt: nowIso(), finishedAt: nowIso(), note: 'Imported from asset register.' }
  });
}

/*
 * The regional load dispatch centre. Classified: it is filtered out of the
 * public asset register and its record -- which carries the address of the
 * control system -- is only served to a supervisor session.
 */
const CONTROL_SITE_ID = newId();
sites.set(CONTROL_SITE_ID, {
  id: CONTROL_SITE_ID,
  name: 'Central Control System',
  description:
    'Regional load dispatch centre, UW Rotkreuz. SCADA/HMI for the 110/16 kV network, intertie scheduling and load shedding.',
  operator: 'Regional Grid North / Leitstelle',
  assetType: 'gateway',
  criticality: 'high',
  lat: 47.1418,
  lon: 8.4289,
  restricted: true,
  controlSystem: {
    product: 'FUXA',
    version: '1.3.0',
    url: SCADA_URL,
    internalUrl: SCADA_INTERNAL_URL,
    note: 'Operator console. Reachable from the operations network only.'
  },
  createdAt: nowIso(),
  review: {
    status: 'approved',
    requestedAt: nowIso(),
    finishedAt: nowIso(),
    note: 'Classified asset, exempt from the standard validation workflow.'
  }
});

/* --------------------------------------------------------------- sessions */

const pruneSessions = () => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [token, session] of sessions) {
    if (session.createdAt < cutoff) {
      sessions.delete(token);
    }
  }
};

const createSession = role => {
  pruneSessions();
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { role, createdAt: Date.now() });
  return token;
};

const sessionOf = req => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    return undefined;
  }
  const session = sessions.get(token);
  if (!session) {
    return undefined;
  }
  if (session.createdAt < Date.now() - SESSION_TTL_MS) {
    sessions.delete(token);
    return undefined;
  }
  return session;
};

const requireAdmin = (req, res, next) => {
  const session = sessionOf(req);
  if (session?.role !== 'admin') {
    return res.status(401).json({ error: 'Supervisor session required.' });
  }
  req.session = session;
  return next();
};

const requireBot = (req, res, next) => {
  if (req.get('x-bot-token') !== BOT_TOKEN) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
};

/* ------------------------------------------------------------- validation */

const ASSET_TYPES = ['substation', 'rtu', 'plc', 'sensor', 'gateway'];
const CRITICALITY = ['low', 'medium', 'high'];

const asString = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const validateSite = body => {
  const name = asString(body.name, 2000);
  const description = asString(body.description, 4000);
  const operator = asString(body.operator, 200) || 'Unassigned';
  const assetType = ASSET_TYPES.includes(body.assetType) ? body.assetType : 'substation';
  const criticality = CRITICALITY.includes(body.criticality) ? body.criticality : 'medium';
  const lat = Number(body.lat);
  const lon = Number(body.lon);

  if (!name) {
    return { error: 'Site name is required.' };
  }
  if (!Number.isFinite(lat) || lat < -85 || lat > 85) {
    return { error: 'Latitude must be between -85 and 85.' };
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { error: 'Longitude must be between -180 and 180.' };
  }
  return { value: { name, description, operator, assetType, criticality, lat, lon } };
};

/* ------------------------------------------------------------------ routes */

app.get('/api/config', (_req, res) => {
  res.json({
    appName: APP_NAME,
    appVersion: APP_VERSION,
    elementVersion: versionOf('@siemens/element-ng') ?? '49.16.0',
    mapsVersion: versionOf('@siemens/maps-ng') ?? '49.16.0',
    angularVersion: versionOf('@angular/core') ?? '21.0.6',
    openSourcePackages: inventory.length,
    maxLabelLength: MAX_LABEL_LENGTH,
    collectorInternal: COLLECTOR_HINT,
    collectorPublic: COLLECTOR_PUBLIC
  });
});

/* ------------------------------------------------- open source disclosures */

/*
 * Backs the About page (si-about in license "api" mode). The component walks
 * three levels: category list -> file list -> license text.
 */

app.get('/api/licenses', (_req, res) => {
  res.json(
    licenseCategories
      .filter(category => category.packages.length)
      .map(category => ({
        name: `${category.name} (${category.packages.length})`,
        href: `/api/licenses/${category.key}`
      }))
  );
});

app.get('/api/licenses/:category', (req, res) => {
  const category = licenseCategories.find(entry => entry.key === req.params.category);
  if (!category) {
    return res.status(404).json({ error: 'Unknown license category.' });
  }
  return res.json(
    category.packages.map((pkg, index) => ({
      name: `${pkg.name} ${pkg.version} -- ${pkg.license}${pkg.direct ? '' : ' (transitive)'}`,
      href: `/api/licenses/${category.key}/${index}`
    }))
  );
});

app.get('/api/licenses/:category/:index', (req, res) => {
  const category = licenseCategories.find(entry => entry.key === req.params.category);
  const pkg = category?.packages[Number(req.params.index)];
  if (!pkg) {
    return res.status(404).type('text/plain').send('Unknown license entry.');
  }
  const header = [
    `${pkg.name} ${pkg.version}`,
    pkg.description ? pkg.description : undefined,
    pkg.homepage ? pkg.homepage : undefined,
    `Declared license: ${pkg.license}`,
    pkg.direct ? 'Declared as a direct dependency of this application.' : 'Pulled in as a transitive dependency.',
    ''
  ].filter(line => line !== undefined);
  return res.type('text/plain').send(`${header.join('\n')}\n${pkg.text}`);
});

app.get('/api/session', (req, res) => {
  const session = sessionOf(req);
  res.json({ role: session?.role ?? 'anonymous' });
});

const isAdmin = req => sessionOf(req)?.role === 'admin';

app.get('/api/sites', (req, res) => {
  const admin = isAdmin(req);
  const visible = [...sites.values()].filter(site => admin || !site.restricted);
  res.json(visible.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
});

app.post('/api/sites', (req, res) => {
  const { error, value } = validateSite(req.body ?? {});
  if (error) {
    return res.status(400).json({ error });
  }
  if (sites.size > 500) {
    return res.status(429).json({ error: 'Asset register is full, restart the lab instance.' });
  }
  const id = newId();
  const site = {
    id,
    ...value,
    restricted: false,
    createdAt: nowIso(),
    review: { status: 'draft', requestedAt: null, finishedAt: null, note: 'Not submitted for review yet.' }
  };
  sites.set(id, site);
  return res.status(201).json(site);
});

app.get('/api/sites/:id', (req, res) => {
  const site = sites.get(req.params.id);
  if (!site) {
    return res.status(404).json({ error: 'Unknown site.' });
  }
  if (site.restricted && !isAdmin(req)) {
    // Do not confirm that the record exists.
    return res.status(404).json({ error: 'Unknown site.' });
  }
  return res.json(site);
});

app.post('/api/sites/:id/review', (req, res) => {
  const site = sites.get(req.params.id);
  if (!site) {
    return res.status(404).json({ error: 'Unknown site.' });
  }
  if (site.restricted) {
    return res.status(404).json({ error: 'Unknown site.' });
  }
  const key = req.ip || 'unknown';
  const last = lastReviewRequest.get(key) ?? 0;
  const waitMs = REVIEW_COOLDOWN_MS - (Date.now() - last);
  if (waitMs > 0) {
    return res.status(429).json({ error: `Review desk is busy. Try again in ${Math.ceil(waitMs / 1000)}s.` });
  }
  if (reviewQueue.length > 50) {
    return res.status(429).json({ error: 'Review queue is full.' });
  }
  lastReviewRequest.set(key, Date.now());
  site.review = { status: 'queued', requestedAt: nowIso(), finishedAt: null, note: 'Waiting for the duty supervisor.' };
  reviewQueue.push(site.id);
  return res.json(site.review);
});

app.post('/api/admin/login', (req, res) => {
  const username = asString(req.body?.username, 100);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid supervisor credentials.' });
  }
  const token = createSession('admin');
  // The portal keeps the session readable so the "stay signed in" widget in the
  // legacy dashboard can show the remaining session time.
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS
  });
  return res.json({ role: 'admin' });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    sessions.delete(token);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  return res.json({ role: 'anonymous' });
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const pending = [...sites.values()].filter(site => site.review.status === 'queued' || site.review.status === 'reviewing');
  res.json({
    supervisor: ADMIN_USER,
    emergencyOverrideKey: FLAG,
    queueLength: reviewQueue.length,
    pending: pending.map(site => ({ id: site.id, name: site.name, requestedAt: site.review.requestedAt })),
    totalSites: sites.size,
    controlSystem: {
      enabled: STAGE2_ENABLED,
      siteId: CONTROL_SITE_ID,
      url: SCADA_URL,
      note: STAGE2_ENABLED
        ? 'Load dispatch centre console. Classified asset, visible to supervisors only.'
        : 'The dispatch centre is not deployed in this instance.'
    }
  });
});

app.get('/api/bot/job', requireBot, (_req, res) => {
  const id = reviewQueue.shift();
  if (!id) {
    return res.status(204).end();
  }
  const site = sites.get(id);
  if (!site) {
    return res.status(204).end();
  }
  site.review.status = 'reviewing';
  site.review.note = 'Supervisor is opening the review map.';
  return res.json({ siteId: site.id });
});

app.post('/api/bot/job/:id/result', requireBot, (req, res) => {
  const site = sites.get(req.params.id);
  if (!site) {
    return res.status(404).json({ error: 'Unknown site.' });
  }
  const ok = req.body?.ok !== false;
  site.review.status = ok ? 'approved' : 'failed';
  site.review.finishedAt = nowIso();
  site.review.note = asString(req.body?.note, 300) || (ok ? 'Reviewed by duty supervisor.' : 'Review aborted.');
  return res.json(site.review);
});

/* --------------------------------------------------------- webshop (decoy) */

/*
 * A plain webshop cart/checkout over HTTP. Nothing here feeds the exercise --
 * it is a side attraction. The flow is a normal one so it can be observed,
 * intercepted and replayed: prices are resolved server-side from the catalogue,
 * so tampering with a client-sent price has no effect.
 */

const pruneCarts = () => {
  const cutoff = Date.now() - CART_TTL_MS;
  for (const [token, cart] of carts) {
    if (cart.createdAt < cutoff) {
      carts.delete(token);
    }
  }
};

const cartOf = (req, res, create) => {
  const existing = req.cookies?.[CART_COOKIE];
  let cart = existing ? carts.get(existing) : undefined;
  if (!cart && create) {
    pruneCarts();
    const token = crypto.randomBytes(16).toString('hex');
    cart = { items: [], createdAt: Date.now() };
    carts.set(token, cart);
    res.cookie(CART_COOKIE, token, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: CART_TTL_MS
    });
  }
  return cart;
};

const findArticle = (siteId, name) => {
  const products = sites.get(siteId)?.webshop?.products;
  return products?.find(product => product.name === name);
};

app.get('/api/shop/cart', (req, res) => {
  const cart = cartOf(req, res, false);
  res.json({ count: cart?.items.length ?? 0, items: cart?.items ?? [] });
});

app.post('/api/shop/cart', (req, res) => {
  const siteId = asString(req.body?.siteId, 50);
  const name = asString(req.body?.product, 200);
  const article = findArticle(siteId, name);
  if (!article) {
    return res.status(404).json({ error: 'Unknown article.' });
  }
  const cart = cartOf(req, res, true);
  if (cart.items.length >= 99) {
    return res.status(429).json({ error: 'Cart is full.' });
  }
  // Price comes from the catalogue, never from the request body.
  cart.items.push({ name: article.name, price: article.price });
  return res.status(201).json({ count: cart.items.length, items: cart.items });
});

app.post('/api/shop/checkout', (req, res) => {
  const cart = cartOf(req, res, false);
  const count = cart?.items.length ?? 0;
  const orderId = `RH-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  if (cart) {
    cart.items = [];
  }
  return res.json({
    ok: true,
    orderId,
    count,
    message:
      count > 0
        ? `Order ${orderId} confirmed. You bought ${count} item${count === 1 ? '' : 's'}. Thank you for shopping with Red Herring Fishing Co.`
        : `Order ${orderId} confirmed, but your cart was empty.`
  });
});

/* ------------------------------------------------------------ static files */

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, { index: false, maxAge: '1h' }));

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) {
    return next();
  }
  return res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Hand the supervisor password to the bot container over the shared volume.
const publishSupervisorPassword = () => {
  try {
    fs.mkdirSync(HANDSHAKE_DIR, { recursive: true });
    fs.writeFileSync(path.join(HANDSHAKE_DIR, 'admin_password'), ADMIN_PASSWORD, { mode: 0o600 });
  } catch (err) {
    console.warn(`[portal] could not write supervisor handshake file: ${err.message}`);
  }
};

app.listen(PORT, '0.0.0.0', () => {
  publishSupervisorPassword();
  console.log(`[portal] listening on :${PORT}`);
  console.log(`[portal] supervisor account: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
  console.log(`[portal] tooltip maxLabelLength: ${MAX_LABEL_LENGTH}`);
});
