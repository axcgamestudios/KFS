// debug_king.js — where IS the Pirate King relative to the camera?
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f22';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'medium', tier: 'medium', settingsRev: 3, waves: true, shadows: false,
        realLights: false, grass3d: true, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.7, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });
  await page.goto('http://localhost:8899/KFS/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
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
    const H = (x, z) => g.world.terrainHeight.height(x, z);
    // teleport 7m south of the king, facing him
    g.player.teleport(-536, H(-536, -448), -448);
    g.rig.yaw = Math.atan2(-536 - -536, -455 - -448); // 0 = facing -Z (north)
    g.rig.pitch = 0.1;
    await wait(12000);
    const king = g.bandits.bandits.find((b) => b.legend?.id === 'rey_pirata');
    const cam = g.engine.camera.position;
    return {
      king: king ? {
        pos: king.pos.toArray().map((v) => Number(v.toFixed(1))),
        visible: king.group.visible,
        children: king.group.children.length,
        dead: king.dead,
        aggro: king.aggro,
      } : null,
      player: g.player.position.toArray().map((v) => Number(v.toFixed(1))),
      camera: cam.toArray().map((v) => Number(v.toFixed(1))),
      rigYaw: g.rig.yaw.toFixed(2),
      dist: king ? Math.hypot(king.pos.x - cam.x, king.pos.z - cam.z).toFixed(1) : null,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/d_king.png`, timeout: 150000 });
  await browser.close();
})();
