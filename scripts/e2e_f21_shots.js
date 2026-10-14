// e2e_f21_shots.js — scenic visual-QA screenshots at key moments:
// knight 3rd/1st person, sea, mountains, road, rocks, clouds, sun shafts.
// The page drives the game state and calls back into Node to capture.
const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/scripts/shots_f21';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'high', tier: 'high', settingsRev: 3,
        waves: true, shadows: true, realLights: true, grass3d: true,
        renderChunks: 5, reflections: 0, postfx: true, resolution: 0.75, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });

  // the page calls this to capture the CURRENT frame
  const saved = [];
  await page.exposeFunction('saveShot', async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 85, timeout: 60000 });
    saved.push(name);
    console.log('shot:', name);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const result = await page.evaluate(async () => {
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
    await wait(6000); // world + knight settle

    const frame = async () => {
      // two rAF boundaries + a paint settle under SwiftShader
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await wait(2500);
    };
    const teleport = (x, z, y = null) => {
      const h = y ?? g.world.terrainHeight.height(x, z);
      g.player.teleport(x, h + 0.5, z);
    };
    const aim = (yaw, pitch) => { g.rig.yaw = yaw; g.rig.pitch = pitch; };

    // 1) third person behind the knight at the village (afternoon light)
    g.world.sky.dayFraction = 0.42;
    teleport(24, 158);
    aim(Math.PI, 0.24);
    await frame();
    await window.saveShot('village_knight_tp');

    // 2) FIRST PERSON — looking slightly down (hands/chest visible, head hidden)
    g['toggleFirstPerson'](window.__kotfsStoreGet());
    aim(Math.PI, -0.5);
    await frame();
    await window.saveShot('village_fp');
    g['toggleFirstPerson'](window.__kotfsStoreGet());

    // 3) the sea from the pier — menu-style water, low golden sun
    g.world.sky.dayFraction = 0.30;
    teleport(22, 246);
    aim(0.2, 0.06);
    await frame();
    await window.saveShot('sea_dawn');

    // 4) sun shafts toward the low sun
    {
      const sd = g.world.sky.sunDir;
      aim(Math.atan2(sd.x, sd.z), Math.max(0.03, Math.asin(sd.y) * 0.8));
      await frame();
      await window.saveShot('sun_shafts');
    }

    // 5) mountains from the north meadow
    g.world.sky.dayFraction = 0.45;
    teleport(-40, -120);
    aim(Math.PI * 1.15, 0.18);
    await frame();
    await window.saveShot('mountains');

    // 6) a dirt road stretch (village → castle road, mid-point)
    teleport(70, 85);
    aim(Math.PI * 1.3, 0.12);
    await frame();
    await window.saveShot('road');

    // 7) rocks + trees meadow (east meadow)
    teleport(150, 60);
    aim(2.2, 0.1);
    await frame();
    await window.saveShot('rocks_meadow');

    // 8) clouds against the sky (look up)
    g.world.sky.dayFraction = 0.5;
    aim(0.8, 1.15);
    await frame();
    await window.saveShot('clouds');

    return 'ok';
  });

  console.log('result:', result, '| saved:', saved.join(', '));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
