// shots_f23_diag.js — diagnose the user's 3 complaints:
//  1) village cobble paths look bad, 2) fountain floor looks bad,
//  3) knight animation stiff + sword floating (not gripped).
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f23';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'medium', tier: 'medium', settingsRev: 3, waves: true, shadows: true,
        realLights: false, grass3d: true, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.8, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });
  await page.exposeFunction('saveShot', async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 150000 });
    console.log('shot:', name);
  });

  await page.goto(process.argv[2] || 'http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__kotfsGame;
    if (!g) return 'no game';
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    if (!playing) return 'never playing'; console.log('[diag] playing');
    await wait(12000); // let the world stream in

    // arm the player with the steel sword
    g.state.addItem('espada_acero', 1);
    g.state.equip('espada_acero');

    const frame = async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await wait(900);
    };
    const hideUI = () => {
      const canvas = document.querySelector('canvas');
      for (const el of document.querySelectorAll('body *')) {
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
    const log = (m) => console.log('[diag]', m);
    const shot = async (name) => { hideUI(); await wait(350); await window.saveShot(name); restoreUI(); };
    const aimAt = async (name, camX, camZ, camLift, tx, ty, tz) => {
      const camY = Math.max(H(camX, camZ), ty) + camLift;
      g.rig.freeCam = true;
      g.rig.freePos.set(camX, camY, camZ);
      g.rig.yaw = Math.atan2(tx - camX, tz - camZ);
      g.rig.pitch = Math.atan2(ty - camY, Math.hypot(tx - camX, tz - camZ));
      await frame(); await shot(name);
    };

    g.world.sky.dayFraction = 0.42; // morning light

    // put the knight next to the fountain on the green
    g.player.position.set(23.5, H(23.5, 154) + 0.1, 154);
    g.player.velocity.set(0, 0, 0);
    await wait(600);

    // --- 1) THE PATHS ---
    // overhead of the green->dock path (the main road)
    log('step paths'); await aimAt('p_path_overhead', 20, 168, 14, 20, H(20, 186), 186);
    // ground level along the same path, looking north toward the green
    await aimAt('p_path_ground', 20, 196, 1.2, 20, H(20, 176) + 1.2, 176);
    // a diagonal path (green->Erica) at eye level
    log('step erica'); await aimAt('p_path_erica', 24, 152, 1.4, 30, H(30, 147) + 1.2, 147);

    // --- 2) THE FOUNTAIN FLOOR ---
    log('step fountain'); await aimAt('p_fountain_low', 26, 156.5, 1.3, 20, H(20, 150) + 0.8, 150);
    await aimAt('p_fountain_top', 20, 150, 13, 20, H(20, 150) + 0.5, 150.01);

    // --- 3) THE KNIGHT: idle close-up (front 3/4, sword side) ---
    g.player.position.set(21.5, H(21.5, 152.5) + 0.1, 152.5);
    g.player.velocity.set(0, 0, 0);
    g.player.faceYaw?.(0.5);
    await wait(1200);
    log('step knight idle'); await aimAt('p_knight_idle', 23.2, 154.2, 0.0, 21.5, H(21.5, 152.5) + 1.05, 152.5);
    // tight on the sword hand
    log('step sword hand'); await aimAt('p_sword_hand', 22.4, 153.3, 0.0, 21.5, H(21.5, 152.5) + 0.95, 152.5);
    // rear 3/4 idle
    await aimAt('p_knight_rear', 19.9, 151.1, 0.0, 21.5, H(21.5, 152.5) + 1.05, 152.5);

    // --- walk: drive the player forward while the camera tracks ---
    {
      g.rig.freeCam = false;
      g.player.position.set(20, H(20, 160) + 0.1, 160);
      g.player.velocity.set(0, 0, 0);
      await wait(400);
      // walk toward the fountain from the south
      const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      log('step walk'); press('KeyW');
      await wait(2600);
      g.rig.freeCam = true;
      const p = g.player.position;
      g.rig.freePos.set(p.x + 3.4, H(p.x, p.z) + 1.6, p.z + 3.4);
      g.rig.yaw = Math.atan2(p.x - g.rig.freePos.x, p.z - g.rig.freePos.z);
      g.rig.pitch = 0.12;
      await frame();
      await shot('p_knight_walk');
      await wait(900);
      await shot('p_knight_walk2');
      release('KeyW');
      g.rig.freeCam = false;
    }
    return 'ok';
  });
  console.log('result:', r);
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
