// debug_f24_thrust_live.cjs — watch the model internals live during a thrust hold.
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
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 250)));
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
    await wait(2000);
    const m = g.player.model;
    const sh = m.boneByName('j_shoulderR');
    const wr = m.boneByName('j_wristR');
    const read = (tag) => ({
      tag,
      attackT: +p.attackT.toFixed(3),
      kind: p.attackKind,
      lastAtkT: +(m.lastAttackT ?? -1).toFixed(3),
      hasFrom: !!m.attackFrom,
      shX: +sh.rotation.x.toFixed(2),
      wrX: +wr.rotation.x.toFixed(2),
    });
    const log = [];
    log.push(read('idle1'));
    await wait(500);
    log.push(read('idle2'));
    p.attackKind = 'thrust'; p.attackDur = 99999; p.attackT = 0.52;
    for (let i = 0; i < 8; i++) {
      await wait(400);
      log.push(read('hold' + i));
    }
    return log;
  }).catch((e) => ({ err: String(e) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
