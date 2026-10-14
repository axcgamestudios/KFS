// debug_frame.js — how long does ONE frame actually take after the freeze?
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8899/KFS/';

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
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(15000);
    // time a forced synchronous render of the current scene
    const t0 = performance.now();
    g.engine.renderer.render(g.engine.scene, g.engine.camera);
    const renderMs = performance.now() - t0;
    // time 3 chained rAFs with a generous timeout
    const t1 = performance.now();
    const rafMs = await Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t1))))),
      wait(20000).then(() => -1),
    ]);
    // fps right now
    const fpsNow = g.engine.fps;
    // count rendered frames over 5s using renderer.info (autoReset off trick)
    const r = g.engine.renderer;
    r.info.autoReset = false;
    r.info.reset();
    await wait(5000);
    const frames5s = r.info.render.frame;
    r.info.autoReset = true;
    return {
      t: g.player.model.t,
      fpsNow,
      renderMs: Math.round(renderMs),
      rafMs: rafMs === -1 ? 'TIMEOUT(>20s)' : Math.round(rafMs),
      framesIn5s: frames5s,
      drawCalls: r.info.render.calls,
      triangles: r.info.render.triangles,
    };
  }).catch((e) => ({ evalErr: String(e).slice(0, 300) }));
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
