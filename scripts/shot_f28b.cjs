// shot_f28b.cjs — the mesa at NOON, camera 3.5m out, facing it.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--mute-audio',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'high', tier: 'high', settingsRev: 3, waves: true, shadows: true,
        realLights: true, grass3d: true, renderChunks: 4, reflections: 1,
        postfx: true, resolution: 0.9, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true })); }
      if (ph === 'playing') break;
      await wait(400);
    }
    window.__kotfsApi.adminSetTime(0.55); // bright afternoon
    await wait(600);
    // 3.5m out, south-east of the table, looking straight at it
    g.player.teleport(-13.2, 3, 150.8);
    g.player.yaw = Math.atan2(-16 - -13.2, 148 - 150.8);
    await wait(2600);
  });
  await page.screenshot({ path: 'scripts/shots_f28/mesa.png' });
  await browser.close();
})();
