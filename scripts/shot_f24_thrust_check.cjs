// shot_f24_thrust_check.cjs — hold thrust 0.52, verify geometry AND capture
// the screenshot in the SAME frames, so the numbers and pixels correspond.
const { chromium } = require('playwright');
const OUT = '/home/z/my-project/scripts/shots_f24';

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
  const r = await page.evaluate(async () => {
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
    const h = g.world.terrainHeight.height(24, 162);
    p.position.set(24, h + 0.1, 162);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await waitFrames(40);
    p.attackKind = 'thrust'; p.attackDur = 99999; p.attackT = 0.52;
    await waitFrames(6);

    const mulPoint = (m, x, y, z) => [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
    let sw = null;
    g.player.model.root.traverse((o) => { if (!sw && o.name === 'hero_sword') sw = o; });
    sw.updateWorldMatrix(true, false);
    const m = sw.matrixWorld.elements;
    const loc = (v) => {
      const pp = p.position, yaw = p.yaw;
      return {
        x: Math.cos(yaw) * (v[0] - pp.x) - Math.sin(yaw) * (v[2] - pp.z),
        z: Math.sin(yaw) * (v[0] - pp.x) + Math.cos(yaw) * (v[2] - pp.z),
        y: v[1] - pp.y,
      };
    };
    const tipL = loc(mulPoint(m, 0, 0.88, 0));
    const gripL = loc(mulPoint(m, 0, 0, 0));
    let d = { x: tipL.x - gripL.x, y: tipL.y - gripL.y, z: tipL.z - gripL.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    d = { x: +(d.x / len).toFixed(3), y: +(d.y / len).toFixed(3), z: +(d.z / len).toFixed(3) };
    const sh = g.player.model.boneByName('j_shoulderR');
    const el = g.player.model.boneByName('j_elbowR');
    const wr = g.player.model.boneByName('j_wristR');

    // camera + shot — sample AGAIN after the shot to prove the pose held
    g.rig.freeCam = true;
    g.rig.freePos.set(p.position.x - 3.1, p.position.y + 1.45, p.position.z + 0.25);
    g.rig.yaw = Math.PI / 2;
    g.rig.pitch = -0.06;
    await waitFrames(5);
    await window.saveShot('s24_thrust_check');
    const still = {
      attackT: +p.attackT.toFixed(3),
      blade: d,
      shoulderR: sh.rotation.x.toFixed(2), elbowR: el.rotation.x.toFixed(2), wristR: wr.rotation.x.toFixed(2),
    };
    return still;
  }).catch((e) => ({ err: String(e) }));
  console.log('GEOMETRY+SHOT', JSON.stringify(r));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
