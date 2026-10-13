// E2E FASE 17 runner (hardened) — survives page death and reports why.
const { chromium } = require('playwright');
const fs = require('fs');

const SHOT_DIR = '/home/z/my-project/download/capturas';
const PAYLOAD = fs.readFileSync('/home/z/my-project/scripts/e2e_f17_payload.js', 'utf8');
const LAUNCHER = `window.__code17 = ${JSON.stringify(PAYLOAD)}; window.__kotfsE2ELogF17 = null; setTimeout(() => { eval(window.__code17); }, 0); 'kicked'`;

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=500',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  let crashed = false;
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', async (m) => {
    const t = (m.text() || '').match(/^__kfs17shot:(.+)$/);
    if (t) {
      try {
        await page.screenshot({ path: `${SHOT_DIR}/f17_${t[1]}.png` });
        await page.evaluate((tag) => { window.__kfs17shotAck = tag; }, t[1]);
      } catch { /* ignore */ }
      return;
    }
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });
  page.on('crash', () => { crashed = true; errors.push('RENDERER CRASH'); });
  page.on('close', () => errors.push('PAGE CLOSED'));
  await page.addInitScript(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kotfs_settings') || '{}');
      raw.tier = 'xlow'; raw.quality = 'xlow'; raw.settingsRev = 3;
      Object.assign(raw, {
        waves: false, shadows: false, realLights: false, grass3d: false,
        reflections: 0, postfx: false, resolution: 0.4, renderChunks: 2, showFps: false,
      });
      localStorage.setItem('kotfs_settings', JSON.stringify(raw));
    } catch { /* ignore */ }
  });

  const gotoRes = await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => { errors.push('GOTO: ' + e.message); return null; });
  console.log('goto ->', gotoRes ? gotoRes.status() : 'failed');
  const loadTitle = await page.evaluate(() => document.body.innerText.match(/CHAPTER 1[^\n]*/) || '').catch(() => '');
  console.log('loading title seen:', JSON.stringify(loadTitle && loadTitle[0] || ''));
  console.log('page title:', await page.title().catch(() => '?'));
  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(9000).catch(() => {});
  if (page.isClosed() || crashed) {
    console.log('PAGE DIED AT BOOT:\n' + errors.join('\n'));
    await browser.close().catch(() => {});
    return;
  }

  console.log('kick ->', await page.evaluate(LAUNCHER).catch((e) => 'kick failed: ' + e.message));
  let result = null;
  let logs = null;
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(1000).catch(() => {});
    const st = await page.evaluate(() => ({
      s: window.__kotfsE2EStatusF17 || null,
      l: window.__kotfsE2ELogF17 || null,
    })).catch(() => null);
    if (st && st.l && st.l !== logs) { logs = st.l; }
    if (st && st.s) { result = st.s; logs = st.l; break; }
    if (page.isClosed() || crashed) { errors.push('DETECTED DEAD AT POLL ' + i); break; }
    if (i % 30 === 0) console.log(`poll ${i}: alive, errors so far ${errors.length}`);
  }
  console.log('status ->', result);
  if (logs) console.log('\n===== F17 PAYLOAD LOG =====\n' + logs.join('\n'));
  await page.screenshot({ path: `${SHOT_DIR}/f17_end.png` }).catch(() => {});
  console.log('\n===== PAGE ERRORS (' + errors.length + ') =====');
  console.log(errors.slice(0, 14).join('\n') || 'none');
  await browser.close().catch(() => {});
  process.exit(0);
})().catch((e) => { console.log('RUNNER FATAL:', e.message); process.exit(1); });
