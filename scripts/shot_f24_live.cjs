// shot_f24_live.cjs — LIVE-frame-verified screenshots: polls a bone until it
// CHANGES (proving a fresh frame just rendered), then captures immediately.
// node shot_f24_live.cjs <out> <pose> [cam]
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/scripts/shots_f24';
const [name, poseArg, camArg] = process.argv.slice(2);

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
  const r = await page.evaluate(async ([name, poseArg, camArg]) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
    const h = g.world.terrainHeight.height(24, 162);
    p.position.set(24, h + 0.1, 162);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    // keep the renderer busy with polling so rAF stays live
    const m = g.player.model;
    const sh = m.boneByName('j_shoulderR');
    for (let i = 0; i < 20; i++) { await wait(300); void sh.rotation.x; }

    const [kind, kStr] = poseArg.split('_');
    const k = parseFloat(kStr ?? '0');
    if (kind === 'walk') {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift', bubbles: true }));
      // poll until genuinely sprinting, then a few more beats of gait
      for (let i = 0; i < 40 && p.speedSm < 4.5; i++) await wait(300);
      for (let i = 0; i < 6; i++) await wait(250);
    } else if (kind !== 'idle') {
      p.attackKind = kind; p.attackDur = 99999; p.attackT = k;
      // poll until the arm is IN the pose (proves the frame is live)
      const wantSh = kind === 'thrust' ? -1.6 : kind === 'heavy' ? -2.0 : -2.2;
      for (let i = 0; i < 30; i++) {
        await wait(300);
        if (sh.rotation.x < wantSh + 0.45) break;
      }
      await wait(200);
    }

    g.rig.freeCam = true;
    const py = p.position;
    if (camArg === 'front') {
      g.rig.freePos.set(py.x - 2.6, py.y + 1.5, py.z + 2.9);
      g.rig.yaw = Math.PI / 2 - 0.75;
    } else {
      g.rig.freePos.set(py.x - 3.1, py.y + 1.45, py.z + 0.25);
      g.rig.yaw = Math.PI / 2;
    }
    g.rig.pitch = -0.06;
    await wait(350);
    await window.saveShot(name);
    return { pose: poseArg, speed: +p.speedSm.toFixed(1), shX: +sh.rotation.x.toFixed(2) };
  }, [name, poseArg, camArg]).catch((e) => ({ err: String(e) }));
  console.log('LIVE', JSON.stringify(r));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
