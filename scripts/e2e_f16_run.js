// E2E FASE 16 runner — two phases across a page reload.
// Phase 1: fixes + features, saves slot 0, reloads.
// Phase 2: fresh session loads the slot; verifies persistence + takes
// staged screenshots (glide + smithy) via the __kfs16shotAt handshake.
const { chromium } = require('playwright');
const fs = require('fs');

const SHOT_DIR = '/home/z/my-project/download/capturas';
const PAYLOAD = fs.readFileSync('/home/z/my-project/scripts/e2e_f16_payload.js', 'utf8');
// Launcher pattern (fases anteriores): inject the payload fire-and-forget so
// page.evaluate returns immediately instead of holding the context minutes.
const LAUNCHER = `window.__code16 = ${JSON.stringify(PAYLOAD)}; window.__kotfsE2ELogF16 = null; setTimeout(() => { eval(window.__code16); }, 0); 'kicked'`;

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=700',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('crash', () => errors.push('RENDERER CRASH'));
  // keep the probe page LIGHT: boot the game at xlow (no waves/grass/shadows,
  // half-res raster) so SwiftShader stays far below the tab memory limit.
  // The tests read config/physics, not visual quality.
  await page.addInitScript(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('kotfs_settings') || '{}');
      raw.tier = 'xlow'; raw.quality = 'xlow'; raw.settingsRev = 3;
      Object.assign(raw, {
        waves: true, shadows: false, realLights: false, grass3d: false,
        reflections: 0, postfx: false, resolution: 0.5, renderChunks: 3, showFps: true,
      });
      localStorage.setItem('kotfs_settings', JSON.stringify(raw));
    } catch { /* ignore */ }
  });

  const gotoRes = await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => { errors.push('GOTO: ' + e.message); return null; });
  console.log('goto ->', gotoRes ? gotoRes.status() : 'failed');
  await page.bringToFront();
  await page.waitForTimeout(9000);
  console.log('url:', page.url(), 'closed:', page.isClosed());
  if (page.isClosed()) {
    console.log('PAGE DIED AT BOOT:\n' + errors.join('\n'));
    await browser.close();
    return;
  }

  // ---- phase 1 ----
  console.log('kick ->', await page.evaluate(LAUNCHER));
  let phase1 = null;
  let reloaded = false;
  let navWarned = 0;
  for (let i = 0; i < 170; i++) {
    await page.waitForTimeout(1000);
    let st = null;
    try {
      st = await page.evaluate(() => ({
        shotAt: window.__kfs16shotAt || null,
        reload: !!window.__kfs16reload,
        step: window.__e2eF16Step || null,
        log: window.__kotfsE2ELogF16 || null,
      }));
    } catch {
      // context destroyed = the payload navigated (phase 1 reload). Re-kick:
      // the payload is idempotent — the localStorage phase marker routes it.
      if (navWarned < 2) console.log('navigation detected; re-kicking the payload');
      navWarned++;
      try { await page.evaluate(LAUNCHER); } catch { /* still loading */ }
      continue;
    }
    if (i % 5 === 0) console.log('step:', st.step, i + 's');
    if (st.shotAt) {
      const file = `${SHOT_DIR}/f16_${st.shotAt}.png`;
      await page.screenshot({ path: file });
      console.log('shot ->', file);
      try {
        await page.evaluate((tag) => { window.__kfs16shotAck = tag; window.__kfs16shotAt = null; }, st.shotAt);
      } catch { /* navigated */ }
    }
    if (st.log) { phase1 = st.log; break; }
    if (st.reload && !reloaded) {
      reloaded = true;
      console.log('== phase 1 requested reload; waiting for the fresh session ==');
      // wait for the new document, then kick phase 2 (the payload waits for
      // the menu internally; retry a few times across the navigation)
      let kicked = false;
      for (let k = 0; k < 12 && !kicked; k++) {
        await page.waitForTimeout(2500);
        if (page.isClosed()) break;
        try {
          await page.evaluate(LAUNCHER);
          kicked = true;
        } catch { /* still navigating */ }
      }
      console.log('phase2 kicked:', kicked);
    }
  }

  // ---- phase 2 (if the reload happened inside the loop) ----
  let final = phase1;
  if (reloaded) {
    for (let i = 0; i < 170; i++) {
      await page.waitForTimeout(1000);
      const st = await page.evaluate(() => ({
        shotAt: window.__kfs16shotAt || null,
        step: window.__e2eF16Step || null,
        log: window.__kotfsE2ELogF16 || null,
      })).catch(() => null);
      if (!st) continue;
      if (st.shotAt) {
        const file = `${SHOT_DIR}/f16_${st.shotAt}.png`;
        await page.screenshot({ path: file });
        console.log('shot ->', file);
        await page.evaluate((tag) => { window.__kfs16shotAck = tag; window.__kfs16shotAt = null; }, st.shotAt);
      }
      if (st.log) { final = st.log; break; }
    }
  }

  console.log('=== FASE 16 E2E RESULT ===');
  console.log(final ? final.join('\n') : 'NO RESULT (timeout)');
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 12).join('\n'));
  await page.screenshot({ path: `${SHOT_DIR}/f16_final.png` }).catch(() => {});
  await browser.close();
  const fails = (final || []).filter((l) => l.startsWith('FAIL')).length;
  console.log(`\nTOTAL: ${final ? final.length : 0} checks, ${fails} FAIL`);
})();
