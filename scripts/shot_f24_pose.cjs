// shot_f24_pose.cjs — single-purpose pose screenshot (one shot per browser
// session — SwiftShader RAM discipline):
// node shot_f24_pose.cjs <out> <pose> [cam]
//   pose: idle | walk | light1_0.32 | light1_0.56 | thrust_0.52 | heavy_0.38 | plunge_0.5
//   cam: side (default) | front | back
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f24';
const args = process.argv.slice(2);
const [name, poseArg, camArg] = args;

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 250)));
  page.on('crash', () => console.log('[CRASH]'));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.85, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.exposeFunction('saveShot', async (n) => {
    await page.screenshot({ path: `${OUT}/${n}.png`, timeout: 150000 });
    console.log('shot saved:', n);
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async ([name, poseArg, camArg]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFrames = (n) => new Promise((res) => {
      const t0 = performance.now(); let c = 0;
      const tick = () => { if (++c >= n || performance.now() - t0 > 9000) res(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') break;
      await wait(400);
    }
    const p = g.player;
    // quiet spot outside the village (no NPC photobombs): the meadow south
    const h = g.world.terrainHeight.height(24, 162);
    p.position.set(24, h + 0.1, 162);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await waitFrames(40);

    const [kind, kStr] = poseArg.split('_');
    const k = parseFloat(kStr ?? '0');
    if (kind === 'walk') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift', bubbles: true }));
      await waitFrames(45); // ~1.5s of sprint for the full gait
    } else if (kind !== 'idle') {
      p.attackKind = kind; p.attackDur = 99999; p.attackT = k;
      await waitFrames(6);
    } else {
      await waitFrames(6);
    }

    // camera: side = his right (sword side); front = 3/4 from the front
    g.rig.freeCam = true;
    const py = p.position;
    if (camArg === 'front') {
      g.rig.freePos.set(py.x - 2.6, py.y + 1.5, py.z + 2.9);
      g.rig.yaw = Math.PI / 2 - 0.75; // look +X and -Z-ish toward him
    } else if (camArg === 'back') {
      g.rig.freePos.set(py.x - 2.9, py.y + 1.6, py.z - 0.4);
      g.rig.yaw = Math.PI / 2;
    } else {
      g.rig.freePos.set(py.x - 3.1, py.y + 1.45, py.z + 0.25);
      g.rig.yaw = Math.PI / 2;
    }
    g.rig.pitch = -0.06;
    await waitFrames(5);
    if (kind === 'walk') {
      // let a few more frames pass so the camera settles on a mid-stride
      await waitFrames(3);
    }
    await window.saveShot(name);
    return 'done';
  }, [name, poseArg, camArg]).catch((e) => console.log('ERR', String(e)));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
