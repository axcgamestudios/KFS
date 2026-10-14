// e2e_f21_detail_shots.js — UI-free close-ups: knight rear 3/4 (cape) + the
// nearest scattered rock (faceted boulder check).
const { chromium } = require('playwright');
const fs = require('fs');
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
        renderChunks: 4, reflections: 0, postfx: false, resolution: 0.6, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });
  await page.exposeFunction('saveShot', async (name) => {
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 90, timeout: 150000 });
    console.log('shot:', name);
  });

  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    await wait(6000);
    const frame = async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await wait(2500);
    };
    const hideUI = () => {
      const canvas = document.querySelector('canvas');
      for (const el of document.querySelectorAll('body *')) {
        if (el !== canvas && !canvas.contains(el) && el.style.display !== 'none' &&
            !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) {
          el.dataset.kfsHidden = '1'; el.style.display = 'none';
        }
      }
    };
    const restoreUI = () => {
      document.querySelectorAll('[data-kfs-hidden]').forEach((el) => { el.style.display = ''; delete el.dataset.kfsHidden; });
    };

    // 1) knight rear 3/4 on the beach at golden light (cape reads from behind)
    g.world.sky.dayFraction = 0.38;
    g.player.teleport(30, 3.2, 236);
    g.player.yaw = 0.9;
    g.player.group.rotation.y = 0.9;
    {
      const p = g.player.position;
      const yaw = g.player.yaw;
      g.rig.freeCam = true;
      // behind-left, chest height: classic hero framing
      g.rig.freePos.set(p.x - Math.sin(yaw + 2.35) * 3.0, p.y + 1.5, p.z - Math.cos(yaw + 2.35) * 3.0);
      g.rig.yaw = yaw + 2.35 + Math.PI; // look at the knight
      g.rig.pitch = 0.08;
      await frame();
      hideUI();
      await wait(500);
      await window.saveShot('knight_rear');
      restoreUI();
      g.rig.freeCam = false;
    }

    // 2) the nearest rock: find one from the vegetation chunk data
    {
      const V = g.world.vegetation;
      let best = null; let bestD = Infinity;
      for (const [, cd] of V.chunkData ?? new Map()) {
        for (const rk of cd.rocks ?? []) {
          const d = Math.hypot(rk.matrix.elements[12] - 30, rk.matrix.elements[14] - 236);
          if (d < bestD) { bestD = d; best = rk; }
        }
      }
      if (best) {
        const e = best.matrix.elements;
        const rx = e[12], ry = e[13], rz = e[14];
        g.rig.freeCam = true;
        g.rig.freePos.set(rx + 2.6, ry + 1.0, rz + 3.2);
        g.rig.yaw = Math.atan2(rx - g.rig.freePos.x, rz - g.rig.freePos.z);
        g.rig.pitch = -0.12;
        await frame();
        hideUI();
        await wait(500);
        await window.saveShot('rock_closeup');
        restoreUI();
        g.rig.freeCam = false;
      } else {
        console.log('no rock found in chunk data');
      }
    }
    return 'ok';
  });
  console.log('result:', r);
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
