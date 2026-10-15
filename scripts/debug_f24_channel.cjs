// debug_f24_channel.cjs — why doesn't attackWeaponPitch reach the sword?
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
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('console', m => console.log('[console]', m.text().slice(0, 300)));
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
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    if (!g) return 'no game';
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
    const h = g.world.terrainHeight.height(24, 152);
    p.position.set(24, h + 0.1, 152);
    p.yaw = 0;
    g.state.addItem('espada_acero');
    g.state.equip('espada_acero');
    g.combat.refreshVisuals();
    await wait(2500);

    const findSword = () => {
      let sw = null;
      g.player.model.root.traverse((o) => { if (!sw && o.name === 'hero_sword') sw = o; });
      return sw;
    };
    const read = () => {
      const sw = findSword();
      const m = g.player.model;
      return {
        attackT: +p.attackT.toFixed(3),
        kind: p.attackKind,
        chan: +(m.attackWeaponPitch ?? -99).toFixed(3),
        rotX: sw ? +sw.rotation.x.toFixed(3) : null,
        hasGrip: sw ? !!sw.userData.gripPose : null,
        gripRot: sw && sw.userData.gripPose ? sw.userData.gripPose.rot.slice(0,3).map((n) => +n.toFixed(2)) : null,
        lastAtkT: +(m.lastAttackT ?? -99).toFixed(3),
      };
    };
    const out = {};
    out.before = read();
    p.attackKind = 'plunge'; p.attackDur = 99999; p.attackT = 0.5;
    await wait(350); out.t350 = read();
    await wait(700); out.t1050 = read();
    await wait(1200); out.t2250 = read();
    // now check the spear channel the same way
    g.state.addItem('lanza_caza');
    g.state.equip('lanza_caza');
    g.combat.refreshVisuals();
    p.attackT = 0;
    await wait(1500);
    p.attackKind = 'thrust'; p.attackDur = 99999; p.attackT = 0.52;
    await wait(1000);
    const spear = (() => { let sw = null; g.player.model.root.traverse((o) => { if (!sw && o.name.startsWith('spear')) sw = o; }); return sw; })();
    out.spearThrust = {
      attackT: +p.attackT.toFixed(3),
      kind: p.attackKind,
      weaponKind: g.player.model.weaponKind,
      chan: +(g.player.model.attackWeaponPitch ?? -99).toFixed(3),
      rotX: spear ? +spear.rotation.x.toFixed(3) : null,
    };
    return out;
  }).catch((e) => ({ err: String(e) }));
  console.log('RESULT', JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
