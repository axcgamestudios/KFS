// shot_f27_knight.cjs — the decisive left-arm shots: knight IDLE and BOW AIM
// (the exact scenario the F27 rig fix addresses), no creatures around.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f27';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: true, shadows: true,
        realLights: true, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 1.2, showFps: false,
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
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true })); }
      if (ph === 'playing') break;
      await wait(400);
    }
    await wait(2500);
    // kill any bestiary streaming near spawn (isolate the knight)
    // (zones are far from the dock; nothing to do)
    // --- SHOT A: idle, camera orbit to the knight's FRONT-LEFT ---
    const rig = g.rig;
    const p = g.player;
    if (rig?.setManual) {
      const yaw = p.yaw;
      const cx = p.position.x + Math.sin(yaw + Math.PI / 2) * 2.0;
      const cz = p.position.z + Math.cos(yaw + Math.PI / 2) * 2.0;
      const cy = p.position.y + 1.35;
      rig.setManual(
        { x: cx, y: cy, z: cz },
        { x: p.position.x, y: p.position.y + 1.15, z: p.position.z },
      );
    }
    await wait(1200);
  });
  await page.screenshot({ path: `${OUT}/knight_idle_left.png` });
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    const p = g.player;
    // --- SHOT B: bow aim — equip the bow and force a full draw (the left
    //     arm extends: shoulderL -1.4 rad — the old rig STRETCHED here) ---
    try {
      g.state.addItem('arco_corto', 1);
      g.combat?.switchTo?.('arco_corto');
      await wait(600);
      // drive the model directly with a full draw (deterministic)
      const vis = p.model;
      for (let i = 0; i < 90; i++) {
        vis.update({
          dt: 1 / 30, speed: 0, moving: false, grounded: true,
          attackT: 0, blockT: 0, rollT: 0, bowDraw: 1, vy: 0, yawRate: 0,
        });
        await wait(33);
      }
    } catch (e) { console.log('bowErr', String(e).slice(0, 100)); }
    const rig = g.rig;
    if (rig?.setManual) {
      const yaw = p.yaw + 0.5;
      const cx = p.position.x + Math.sin(yaw + 0.65) * 1.9;
      const cz = p.position.z + Math.cos(yaw + 0.65) * 1.9;
      rig.setManual(
        { x: cx, y: p.position.y + 1.5, z: cz },
        { x: p.position.x, y: p.position.y + 1.25, z: p.position.z },
      );
    }
    await wait(900);
  });
  await page.screenshot({ path: `${OUT}/knight_bow_left.png` });
  await browser.close();
  console.log('shots taken');
})();
