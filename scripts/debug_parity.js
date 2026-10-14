// debug_parity.js — rendered-triangle parity check: MY build vs LIVE build.
// Same boot sequence, same wait, same measurement (info delta over 6s, no reset).
const { chromium } = require('playwright');
const URL = process.argv[2];

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 3, reflections: 0,
        postfx: false, resolution: 0.5, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) { /* ignore */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    if (!g) return { fatal: 'no game' };
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    // let the boot streaming settle (30s — swiftshader is slow)
    await wait(30000);
    const r = g.engine.renderer;
    const s0 = { calls: r.info.render.calls, tris: r.info.render.triangles, frame: r.info.render.frame };
    await wait(6000);
    const s1 = { calls: r.info.render.calls, tris: r.info.render.triangles, frame: r.info.render.frame };
    return {
      t: g.player.model.t,
      phase: window.__kotfsStoreGet().phase,
      start: s0, end: s1,
      frames: (s1.frame ?? 0) - (s0.frame ?? 0),
      avgCalls: s1.calls, avgTris: s1.tris,
    };
  }).catch((e) => ({ evalErr: String(e).slice(0, 300) }));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
