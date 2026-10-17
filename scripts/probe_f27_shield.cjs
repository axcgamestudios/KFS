const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  page.on('pageerror', e => console.log('ERR', String(e).slice(0, 150)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({ quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false, realLights: false, grass3d: false, renderChunks: 2, reflections: 0, postfx: false, resolution: 0.6, showFps: false, masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false }));
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
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true })); }
      if (ph === 'playing') break;
      await wait(400);
    }
    await wait(3500);
    const vis = g.player.model;
    const out = {};
    let shield = null, swordProp = null;
    vis.root.traverse((o) => { if (o.name === 'j_shield_held') shield = o; if (o.name === 'j_sword_held') swordProp = o; });
    out.statueShield = { node: !!shield, visible: shield ? shield.visible : null, childMeshes: shield ? shield.children.filter((c) => c.isMesh).map((c) => ({ visible: c.visible, name: c.name })) : [] };
    out.statueSword = { node: !!swordProp, visible: swordProp ? swordProp.visible : null };
    // the full visible mesh census (F26 pattern)
    const names = [];
    vis.root.traverse((o) => { if (o.isMesh && o.visible) names.push(o.name || '(unnamed)'); });
    out.visibleMeshes = names;
    return out;
  }).catch(e => ({ err: String(e).slice(0, 200) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
