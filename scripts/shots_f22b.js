// shots_f22b.js — UI-free QA shots (F21 proven pattern): freeCam aimed at
// each subject + hideUI. Stations ×3, Sister Ysolt, both legends, eclipse.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f22';
fs.mkdirSync(OUT, { recursive: true });

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
  await page.exposeFunction('saveShot', async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 150000 });
    console.log('shot:', name);
  });

  await page.goto(process.argv[2] || 'http://localhost:8899/KFS/', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    if (!g) return 'no game';
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    if (!playing) return 'never playing';
    await wait(20000);
    const frame = async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await wait(2500);
    };
    const hideUI = () => {
      const canvas = document.querySelector('canvas');
      for (const el of document.querySelectorAll('body *')) {
        // never hide the canvas, its descendants, or its ANCESTORS (F22 fix:
        // the canvas now nests inside layout divs — hiding those blanks it)
        if (el !== canvas && !canvas.contains(el) && !el.contains(canvas) &&
            el.style.display !== 'none' &&
            !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) {
          el.dataset.kfsHidden = '1'; el.style.display = 'none';
        }
      }
    };
    const restoreUI = () => {
      document.querySelectorAll('[data-kfs-hidden]').forEach((el) => { el.style.display = ''; delete el.dataset.kfsHidden; });
    };
    const H = (x, z) => g.world.terrainHeight.height(x, z);
    const aimAt = async (name, camX, camY, camZ, tx, ty, tz) => {
      g.rig.freeCam = true;
      g.rig.freePos.set(camX, camY, camZ);
      g.rig.yaw = Math.atan2(tx - camX, tz - camZ);
      // positive rig pitch looks UP: angle of the TARGET relative to the camera
      g.rig.pitch = Math.atan2(ty - camY, Math.hypot(tx - camX, tz - camZ));
      await frame();
      hideUI();
      await wait(400);
      await window.saveShot(name);
      restoreUI();
      g.rig.freeCam = false;
    };

    // golden light for all shots
    g.world.sky.dayFraction = 0.42;

    // 1) Great Anvil (Bram's yard, at 45,166): camera SE of it, chest height
    await aimAt('b_anvil', 48.2, H(45, 166) + 1.4, 169.2, 45, H(45, 166) + 0.8, 166);
    // 2) Altar of the Gods (-148,-268): camera NE, eye height, sun disc centered
    await aimAt('b_altar', -144.2, H(-148, -268) + 1.7, -264.2, -148, H(-148, -268) + 1.3, -268);
    // 3) Anvil of the Titans (26,-292): from the NE, higher (it is tall)
    await aimAt('b_titans', 31.5, H(26, -292) + 3.4, -286.5, 26, H(26, -292) + 1.6, -292);
    // 4) Sister Ysolt (160,280): camera in front of her stall
    await aimAt('b_ysolt', 163.2, H(160, 280) + 1.5, 283.2, 160, H(160, 280) + 1.1, 280);
    // 5) The Pirate King (-536,-455): camera in front, full figure
    await aimAt('b_king', -532.4, H(-536, -455) + 1.6, -451.4, -536, H(-536, -455) + 1.2, -455);
    // 6) The Storm Ronin (-12,616): camera SE, full figure
    await aimAt('b_ronin', -8.4, H(-12, 616) + 1.6, 619.6, -12, H(-12, 616) + 1.2, 616);
    // 7) the knight's cape at rest, rear 3/4 on the village green
    {
      g.player.teleport(28, H(28, 158), 158);
      g.player.yaw = 0.9;
      g.player.group.rotation.y = 0.9;
      const p = g.player.position;
      const yaw = g.player.yaw;
      g.rig.freeCam = true;
      g.rig.freePos.set(p.x - Math.sin(yaw + 2.35) * 3.0, p.y + 1.5, p.z - Math.cos(yaw + 2.35) * 3.0);
      g.rig.yaw = yaw + 2.35 + Math.PI;
      g.rig.pitch = 0.08;
      await frame();
      hideUI();
      await wait(400);
      await window.saveShot('b_cape');
      restoreUI();
      g.rig.freeCam = false;
    }
    // 8) THE ECLIPSE: summon at noon, wide shot from the village shore
    {
      g.state.addItem('esencia_solar', 1);
      g.forge.summonEclipse();
      g.world.sky.dayFraction = 0.5;
      await wait(9000); // the 6s ramp-in at swiftshader pace
      g.rig.freeCam = true;
      g.rig.freePos.set(20, H(20, 230) + 6.5, 230);
      g.rig.yaw = Math.PI * 0.55;
      g.rig.pitch = 0.22;
      await frame();
      hideUI();
      await wait(400);
      await window.saveShot('b_eclipse');
      restoreUI();
      g.rig.freeCam = false;
    }
    return 'ok';
  });
  console.log('result:', r);
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
