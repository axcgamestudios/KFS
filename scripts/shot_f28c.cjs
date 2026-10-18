// shot_f28c.cjs — directed shots at LOW quality (swiftshader-friendly),
// grounded teleports, noon light, long settles.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--mute-audio',
  ] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.7, showFps: false,
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
    window.__kotfsApi.adminSetTime(0.5); // noon
    g.relocateTraveller(3, false);       // he is at the castle crossing today
    await wait(800);
    // --- the mesa: 4.5m SE of the table, looking straight at it ---
    const th = g.world.terrainHeight;
    g.player.teleport(-12.6, th.height(-12.6, 151.4) + 0.4, 151.4);
    g.player.yaw = Math.atan2(-16 + 12.6, 148 - 151.4);
    if (g.rig) g.rig.yaw = g.player.yaw;
    await wait(4200);
  });
  await page.screenshot({ path: 'scripts/shots_f28/mesa.png' });
  await page.evaluate(async () => {
    const g = window.__kotfsGame;
    const th = g.world.terrainHeight;
    // --- the traveller's camp: camera at the camp edge looking in ---
    g.player.teleport(58, th.height(58, 109) + 0.4, 109);
    g.player.yaw = Math.atan2(0, -1); // facing south, straight into the camp
    if (g.rig) { g.rig.yaw = g.player.yaw; g.rig.pitch = 0.14; }
    await new Promise((r) => setTimeout(r, 4200));
  });
  await page.screenshot({ path: 'scripts/shots_f28/viajero_camp.png' });
  await browser.close();
})();
