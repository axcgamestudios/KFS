// shots_f23_c.js — QA the Fase 23 fixes: flagstone paths, fountain plaza,
// sword grip + idle pose. Lean settings for SwiftShader reliability.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f23';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 3, reflections: 0,
        postfx: false, resolution: 0.65, showFps: false,
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
    if (!playing) return 'never playing';
    await wait(11000);
    console.log('[diag] boot ok — arming');
    g.state.addItem('espada_acero', 1);
    g.state.equip('espada_acero');

    const frame = async () => {
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await wait(600);
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
    const aimAt = async (name, camX, camZ, camLift, tx, ty, tz) => {
      const camY = Math.max(H(camX, camZ), ty) + camLift;
      g.rig.freeCam = true;
      g.rig.freePos.set(camX, camY, camZ);
      g.rig.yaw = Math.atan2(tx - camX, tz - camZ);
      g.rig.pitch = Math.atan2(ty - camY, Math.hypot(tx - camX, tz - camZ));
      await frame();
      hideUI(); await wait(300); await window.saveShot(name); restoreUI();
    };

    g.world.sky.dayFraction = 0.42;

    // --- paths: overhead + ground ---
    console.log('[diag] paths');
    await aimAt('q_path_overhead', 20, 168, 14, 20, H(20, 186), 186);
    await aimAt('q_path_ground', 20, 196, 1.2, 20, H(20, 176) + 1.2, 176);
    await aimAt('q_path_close', 21, 160, 1.5, 16, H(16, 156) + 1.2, 156);

    // --- fountain plaza ---
    console.log('[diag] fountain');
    await aimAt('q_fountain_top', 20, 150, 13, 20, H(20, 150) + 0.5, 150.01);
    await aimAt('q_fountain_low', 26, 156.5, 1.3, 20, H(20, 150) + 0.8, 150);

    // --- knight: idle + grip, next to the fountain on the plaza ---
    if (!process.argv.includes('--no-knight')) {
    console.log('[diag] knight');
    g.player.position.set(24.5, H(24.5, 154.5) + 0.1, 154.5);
    g.player.velocity.set(0, 0, 0);
    await wait(1500);
    await aimAt('q_knight_idle', 26.3, 156.4, 0.0, 24.5, H(24.5, 154.5) + 1.05, 154.5);
    await aimAt('q_sword_hand', 25.6, 155.6, 0.0, 24.5, H(24.5, 154.5) + 0.92, 154.5);
    }
    g.rig.freeCam = false;
    return 'ok';
  });
  console.log('result:', r);
  await browser.close();
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
