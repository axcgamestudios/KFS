const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  page.on('pageerror', e => console.log('PAGEERR', String(e).slice(0, 200)));
  page.on('console', m => { const t = m.text(); if (/error|fail|warn|glb|knight/i.test(t)) console.log('[console]', t.slice(0, 160)); });
  page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(-60), r.failure()?.errorText));
  page.on('response', r => { if (/knight|glb/i.test(r.url())) console.log('RESP', r.status(), r.url().slice(-60)); });
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
    // wait + sample the player model every 2 s for 40 s
    const samples = [];
    for (let i = 0; i < 20; i++) {
      await wait(2000);
      const vis = g.player?.model;
      const names = [];
      if (vis) vis.root.traverse((o) => { if (o.isMesh && names.length < 6) names.push(o.name); });
      samples.push({ cls: vis?.constructor?.name, names });
      if (names.includes('knight_upper')) break;
    }
    return samples;
  }).catch(e => ({ err: String(e).slice(0, 200) }));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
