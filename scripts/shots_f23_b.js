// shots_f23_b.js — knight in motion: walk cycle frames, run, attack chain.
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
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 250)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'medium', tier: 'medium', settingsRev: 3, waves: false, shadows: true,
        realLights: false, grass3d: false, renderChunks: 3, reflections: 0,
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

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    await wait(12000);
    console.log('[diag] armed');
    g.state.addItem('espada_acero', 1);
    g.state.equip('espada_acero');
    g.state.setShield?.(true);

    const frame = async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await wait(700);
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

    // place the knight on the open green, camera locked on him from the front
    g.player.position.set(26, H(26, 158) + 0.1, 158);
    g.player.velocity.set(0, 0, 0);
    await wait(800);

    const trackCam = () => {
      const p = g.player.position;
      g.rig.freeCam = true;
      g.rig.freePos.set(p.x + 3.2, H(p.x, p.z) + 1.35, p.z + 3.2);
      g.rig.yaw = Math.atan2(p.x - (p.x + 3.2), p.z - (p.z + 3.2));
      g.rig.pitch = 0.10;
    };

    // ---- WALK: 4 frames across the cycle (no sprint) ----
    g.player.position.set(20, H(20, 190) + 0.1, 190);
    g.player.velocity.set(0, 0, 0);
    await wait(500);
    press('KeyW');
    for (let f = 0; f < 4; f++) {
      await wait(850);
      trackCam();
      await frame();
      hideUI(); await wait(250); await window.saveShot('m_walk' + f); restoreUI();
    }
    release('KeyW');
    console.log('[diag] walk done');

    // ---- RUN (shift): 4 frames ----
    press('ShiftLeft'); press('KeyW');
    for (let f = 0; f < 4; f++) {
      await wait(750);
      trackCam();
      await frame();
      hideUI(); await wait(250); await window.saveShot('m_run' + f); restoreUI();
    }
    release('KeyW'); release('ShiftLeft');
    console.log('[diag] run done');

    // ---- ATTACKS: light1, light2, heavy, thrust — catch mid-swing ----
    g.player.position.set(26, H(26, 158) + 0.1, 158);
    g.player.velocity.set(0, 0, 0);
    await wait(600);
    trackCam(); await frame();
    const attacks = ['m_atk1a', 'm_atk1b', 'm_atk2a', 'm_heavy', 'm_thrust'];
    for (let ai = 0; ai < attacks.length; ai++) {
      const name = attacks[ai];
      if (name === 'm_heavy' || name === 'm_thrust') {
        // hold to charge -> heavy release
        g.input.leftDown = true;
        await wait(620);
        g.input.leftDown = false;
      } else {
        // quick click -> light attack (chains)
        g.input.leftDown = true;
        await wait(160);
        g.input.leftDown = false;
      }
      await wait(240 + (name === 'm_heavy' ? 200 : 0)); // mid-swing
      trackCam();
      await frame();
      hideUI(); await wait(180); await window.saveShot(name); restoreUI();
      await wait(1300); // let it recover
    }
    console.log('[diag] attacks done');
    g.rig.freeCam = false;
    return 'ok';
  });
  console.log('result:', r);
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
