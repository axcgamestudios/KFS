// check_f24_tipclear.cjs — measure the blade tip's height above terrain at
// the light1 strike follow-through (VLM claimed ground intersection).
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.5, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
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
    const m = g.player.model;
    const sh = m.boneByName('j_shoulderR');
    for (let i = 0; i < 16; i++) { await wait(300); void sh.rotation.x; }
    const mulPoint = (mm, x, y, z) => [
      mm[0] * x + mm[4] * y + mm[8] * z + mm[12],
      mm[1] * x + mm[5] * y + mm[9] * z + mm[13],
      mm[2] * x + mm[6] * y + mm[10] * z + mm[14],
    ];
    const out = {};
    for (const [tag, kind, k] of [['strike056', 'light1', 0.56], ['strike068', 'light1', 0.68], ['heavyHit', 'heavy', 0.6]]) {
      p.attackKind = kind; p.attackDur = 99999; p.attackT = k;
      // wait until live (shoulder near the pose)
      for (let i = 0; i < 30; i++) {
        await wait(300);
        if (Math.abs(sh.rotation.x) > 0.3) break;
      }
      await wait(200);
      let sw = null;
      m.root.traverse((o) => { if (!sw && o.name === 'hero_sword') sw = o; });
      sw.updateWorldMatrix(true, false);
      const mm = sw.matrixWorld.elements;
      const tip = mulPoint(mm, 0, 0.88, 0);
      const terrainTip = g.world.terrainHeight.height(tip[0], tip[2]);
      out[tag] = {
        shX: +sh.rotation.x.toFixed(2),
        tipWorldY: +tip[1].toFixed(3),
        terrainAtTip: +terrainTip.toFixed(3),
        clearance: +(tip[1] - terrainTip).toFixed(3),
      };
      p.attackT = 0;
      await wait(400);
    }
    return out;
  }).catch((e) => ({ err: String(e) }));
  console.log('TIPCLEAR', JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
