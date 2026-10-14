// One-shot: screenshot inside the castle keep great hall
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'xlow', tier: 'xlow', settingsRev: 3,
        waves: false, shadows: false, realLights: false, grass3d: false,
        renderChunks: 2, reflections: 0, postfx: false, resolution: 0.55, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) { /* ignore */ }
  });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 120; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(1500);
    // inside the keep, south end, facing the throne (north)
    g.player.teleport(85, g.world.terrainHeight.height(85, -47) + 0.2, -47);
    g.player.yaw = 0;
  });
  await page.waitForTimeout(2800);
  await page.screenshot({ path: '/home/z/my-project/scripts/shots_f19/castle_keep_interior.jpg', quality: 72, type: 'jpeg' });
  console.log('DONE');
  await browser.close();
})().catch((e) => { console.error('CRASH:', e.message); process.exit(1); });
