// shot_f28.cjs — F28 live shots of the FIXED player model (idle/walk closeup)
const { chromium } = require('playwright');
const BASE = process.argv[2] ?? 'http://localhost:3000/';
const shot = process.argv[3] ?? 'idle';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 880, height: 520 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.85, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') break;
      await wait(400);
    }
    await wait(3500);
    if ('__shotMode' in window === false) {}
    // drive: walk forward a bit for the walk shot
    if (window.__f28Walk) {
      const t0 = performance.now();
      window.__f28WalkUntil = t0 + 2600;
    }
  });
  if (shot === 'walk') {
    await page.evaluate(() => {
      window.__f28Walk = true;
      // hold W via the game's input stub — probe_f26 pattern
      const g = window.__kotfsGame;
      g.input.key['KeyW'] = true;
    });
    await page.waitForTimeout(2200);
  } else {
    await page.waitForTimeout(600);
  }
  // move camera close & low for a body shot
  await page.evaluate(() => {
    const g = window.__kotfsGame;
    if (g?.camera) {
      const p = g.player.position;
      g.camera.position.set(p.x + 2.6, p.y + 1.7, p.z + 3.4);
      g.camera.lookAt(p.x, p.y + 1.0, p.z);
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/home/z/my-project/scripts/shots_f28/live_${shot}.png` });
  await browser.close();
  console.log('saved live_' + shot + '.png');
})();
