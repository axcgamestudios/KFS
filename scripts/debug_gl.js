// debug_gl.js — did the WebGL context die when the knight started rendering?
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
  const logs = [];
  page.on('pageerror', (e) => logs.push('PAGEERR: ' + e.message.slice(0, 200)));
  page.on('console', (m) => logs.push(`${m.type().toUpperCase()}: ${m.text().slice(0, 200)}`));
  page.on('crash', () => logs.push('!!! PAGE CRASH'));
  page.on('weberror', (we) => logs.push('WEBERR: ' + String(we.error).slice(0, 150)));
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
    // hook context-lost
    const cv = g.engine.renderer.domElement;
    const events = [];
    cv.addEventListener('webglcontextlost', (e) => events.push('CONTEXT LOST'));
    cv.addEventListener('webglcontextrestored', () => events.push('CONTEXT RESTORED'));
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(12000);
    const gl = g.engine.renderer.getContext();
    return {
      phase: window.__kotfsStoreGet().phase,
      t: g.player.model.t,
      ctxLost: gl.isContextLost(),
      events,
      engineRunning: g.engine.running,
      lastFps: g.engine.fps,
      visibility: document.visibilityState,
      hidden: document.hidden,
      knightLoaded: !!g.player.model,
    };
  }).catch((e) => ({ evalErr: String(e).slice(0, 300) }));
  console.log(JSON.stringify(out, null, 1));
  console.log('--- BROWSER LOGS (last 25) ---');
  for (const l of logs.slice(-25)) console.log(l);
  await browser.close();
})();
