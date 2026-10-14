// shots_f22c.js — retake the 3 weak shots: altar, king, ronin (camera at its
// OWN terrain height + clearance) + the eclipse (factor forced full).
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
    // camera at its OWN ground height + clearance, aimed at the target
    const aimAt = async (name, camX, camZ, camLift, tx, ty, tz) => {
      const camY = Math.max(H(camX, camZ), ty) + camLift;
      g.rig.freeCam = true;
      g.rig.freePos.set(camX, camY, camZ);
      g.rig.yaw = Math.atan2(tx - camX, tz - camZ);
      g.rig.pitch = Math.atan2(ty - camY, Math.hypot(tx - camX, tz - camZ));
      await frame();
      hideUI();
      await wait(400);
      await window.saveShot(name);
      restoreUI();
      g.rig.freeCam = false;
    };

    g.world.sky.dayFraction = 0.42;

    // Altar of the Gods: camera from the EAST at its own height
    await aimAt('c_altar', -141.5, -268, 1.6, -148, H(-148, -268) + 1.3, -268);
    // The Pirate King: camera from the south at its own height
    await aimAt('c_king', -536, -449.5, 1.7, -536, H(-536, -455) + 1.3, -455);
    // The Storm Ronin: camera from the south at its own height
    await aimAt('c_ronin', -12, 619.5, 1.7, -12, H(-12, 616) + 1.3, 616);
    // THE ECLIPSE at full factor (set past the ramp: 240−8 → factor 1)
    {
      g.world.sky.dayFraction = 0.5;
      g.forge.setEclipse(232); // full totality, no multi-second ramp needed
      await wait(2500);
      g.rig.freeCam = true;
      g.rig.freePos.set(20, H(20, 230) + 6.5, 230);
      g.rig.yaw = Math.PI * 0.55;
      g.rig.pitch = 0.22;
      await frame();
      hideUI();
      await wait(400);
      await window.saveShot('c_eclipse');
      restoreUI();
      g.rig.freeCam = false;
    }
    return 'ok';
  });
  console.log('result:', r);
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
