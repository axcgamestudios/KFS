// shot_f28.cjs — directed 3D shots: the mesa and the traveller's camp,
// with the camera actually LOOKING at them (player yaw set toward target).
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
    // put the traveller at stop 0 (castle crossing) and face the camera at the camp
    g.relocateTraveller(3, false);
  });
  // 1. the mesa, from the green side, looking NW at it
  await page.evaluate(() => { const g = window.__kotfsGame; g.player.teleport(-12, 3, 151); g.player.yaw = Math.atan2(-16 - -12, 148 - 151); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'scripts/shots_f28/mesa.png' });
  // 2. the traveller at his fire (stop 0), camera at the camp edge looking in
  await page.evaluate(() => { const g = window.__kotfsGame; g.player.teleport(53.5, 3, 96.5); g.player.yaw = Math.atan2(58 - 53.5, 100 - 96.5); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'scripts/shots_f28/viajero_camp.png' });
  await browser.close();
})();
