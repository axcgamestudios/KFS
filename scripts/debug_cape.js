// debug_cape.js — focused: why doesn't j_cape1 rotate?
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8899/KFS/';

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
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 3, reflections: 0,
        postfx: false, resolution: 0.5, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const out = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') break;
      await wait(500);
    }
    await wait(3000);
    const m = g.player.model;
    const c1 = m.root.getObjectByName('j_cape1');
    const samples = [];
    const snap = () => samples.push({
      phase: window.__kotfsStoreGet().phase,
      overlay: window.__kotfsStoreGet().overlay,
      dialogue: !!window.__kotfsStoreGet().dialogue,
      t: m.t?.toFixed ? Number(m.t.toFixed(3)) : m.t,
      rot: c1 ? Number(c1.rotation.x.toFixed(4)) : null,
      st: m.cape1st ? m.cape1st.r.map((x) => Number(x.toFixed(4))) : null,
      speedSm: Number((m.speedSm ?? -1).toFixed(3)),
      capeBone1Null: m.capeBone1 === null || m.capeBone1 === undefined,
      same: m.capeBone1 === c1,
    });
    snap();
    press('KeyW');
    await wait(600); snap();
    await wait(600); snap();
    release('KeyW');
    await wait(600); snap();
    // also check dt reaching the model: read last AnimParams-ish state via player pos
    const p0 = { x: g.player.position.x, z: g.player.position.z };
    press('KeyW'); await wait(700); release('KeyW');
    const p1 = { x: g.player.position.x, z: g.player.position.z };
    return { samples, moved: Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(2), playerPos: p1 };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
