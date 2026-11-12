'use strict';

/*
 * Duty supervisor bot.
 *
 * Polls the portal for queued site registrations, signs in as the supervisor and
 * opens the review map. It moves the mouse across the map so the Element map
 * tooltip is rendered for the submitted marker -- which is where the stored XSS
 * in @siemens/maps-ng 49.16.0 fires.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const WEB_URL = process.env.WEB_URL || 'http://web:3000';
const BOT_TOKEN = process.env.BOT_TOKEN || 'bot-token-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'ot.supervisor';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 2000);
const PAGE_DWELL_MS = Number(process.env.PAGE_DWELL_MS || 6000);
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/chromium';
// The portal randomises the supervisor password per deployment and drops it on a
// shared volume. When ADMIN_PASSWORD is pinned in the environment we use that
// instead (deterministic for development).
const HANDSHAKE_DIR = process.env.HANDSHAKE_DIR || '/handshake';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readHandshakePassword = () => {
  try {
    return fs.readFileSync(path.join(HANDSHAKE_DIR, 'admin_password'), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
};

/**
 * Resolves the supervisor password: the pinned env value, or the handshake file
 * the portal writes. Re-read on each sign-in so a portal restart with a fresh
 * random password is picked up.
 */
const resolveAdminPassword = async () => {
  if (process.env.ADMIN_PASSWORD) {
    return process.env.ADMIN_PASSWORD;
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const password = readHandshakePassword();
    if (password) {
      return password;
    }
    await sleep(1000);
  }
  throw new Error('supervisor password unavailable (no ADMIN_PASSWORD env and no handshake file)');
};

const log = (...args) => console.log(new Date().toISOString(), '[bot]', ...args);

let browser;

const getBrowser = async () => {
  if (browser?.connected) {
    return browser;
  }
  browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900'
    ]
  });
  return browser;
};

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${WEB_URL}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-bot-token': BOT_TOKEN, ...(options.headers ?? {}) }
  });
  if (response.status === 204) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }
  return response.json();
};

/** Clicks/fills the first selector that exists on the page. */
const typeFirst = async (page, selectors, value) => {
  for (const selector of selectors) {
    const handle = await page.$(selector);
    if (handle) {
      await handle.type(value, { delay: 10 });
      await handle.dispose();
      return true;
    }
  }
  return false;
};

/** Signs in through the real login form so the session cookie is set by the app. */
const signIn = async page => {
  await page.goto(`${WEB_URL}/admin/login`, { waitUntil: 'networkidle2', timeout: 30000 });

  // The sign-in screen uses si-login-basic (reactive form), so the inputs are
  // addressed by their form control name. The plain name/id selectors are kept
  // as a fallback.
  const userSelectors = [
    'input[formControlName="username"]',
    'input[name="username"]',
    'form input[type="email"]'
  ];
  const passwordSelectors = [
    'input[formControlName="password"]',
    'input[name="password"]',
    'form input[type="password"]'
  ];

  const adminPassword = await resolveAdminPassword();

  await page.waitForSelector(userSelectors.join(', '), { timeout: 15000 });
  if (!(await typeFirst(page, userSelectors, ADMIN_USER))) {
    throw new Error('username field not found');
  }
  if (!(await typeFirst(page, passwordSelectors, adminPassword))) {
    throw new Error('password field not found');
  }

  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/admin/login'), { timeout: 15000 }),
    page.click('form button[type="submit"], button.btn-primary')
  ]);
  await page.waitForFunction(() => document.cookie.includes('gridops_session='), { timeout: 15000 });
};

/**
 * Drags the pointer over the map in a grid so every marker position is hit.
 * OpenLayers only emits the hover event on real pointer movement.
 */
const sweepMap = async page => {
  const box = await page.evaluate(() => {
    const viewport = document.querySelector('.ol-viewport');
    if (!viewport) {
      return null;
    }
    // Make sure the map is on screen before the pointer is moved over it.
    viewport.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = viewport.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  if (!box) {
    log('no map viewport found');
    return false;
  }

  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  // The marker sits on the map centre after zoomToPoints(); sweep a window
  // around it, biased upwards because the pin icon is drawn above the anchor.
  const clampX = value => Math.min(Math.max(value, box.x + 2), box.x + box.width - 2);
  const clampY = value => Math.min(Math.max(value, box.y + 2), box.y + box.height - 2);

  for (let dy = -90; dy <= 40; dy += 6) {
    for (let dx = -60; dx <= 60; dx += 6) {
      await page.mouse.move(clampX(cx + dx), clampY(cy + dy));
    }
  }
  return true;
};

const handleJob = async siteId => {
  log('reviewing', siteId);
  const instance = await getBrowser();
  const context = await instance.createBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('console', msg => log('page console:', msg.type(), msg.text().slice(0, 200)));
  page.on('dialog', async dialog => {
    log('page dialog:', dialog.type(), dialog.message().slice(0, 200));
    await dialog.dismiss();
  });

  try {
    await page.setViewport({ width: 1280, height: 900 });
    await signIn(page);

    await page.goto(`${WEB_URL}/admin/review/${encodeURIComponent(siteId)}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await page.waitForSelector('.ol-viewport', { timeout: 20000 });
    // Give OpenLayers time to render the marker before hovering it.
    await sleep(2500);

    const swept = await sweepMap(page);
    await sleep(PAGE_DWELL_MS);

    await fetchJson(`/api/bot/job/${encodeURIComponent(siteId)}/result`, {
      method: 'POST',
      body: JSON.stringify({
        ok: true,
        note: swept ? 'Reviewed by duty supervisor.' : 'Map did not render, approved from record.'
      })
    });
    log('done', siteId);
  } catch (error) {
    log('review failed', siteId, error.message);
    await fetchJson(`/api/bot/job/${encodeURIComponent(siteId)}/result`, {
      method: 'POST',
      body: JSON.stringify({ ok: false, note: 'Supervisor session aborted.' })
    }).catch(() => undefined);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
};

const main = async () => {
  log('waiting for portal at', WEB_URL);
  for (;;) {
    try {
      const job = await fetchJson('/api/bot/job');
      if (job?.siteId) {
        await handleJob(job.siteId);
        continue;
      }
    } catch (error) {
      log('poll error:', error.message);
    }
    await sleep(POLL_INTERVAL_MS);
  }
};

main().catch(error => {
  console.error('[bot] fatal', error);
  process.exit(1);
});
