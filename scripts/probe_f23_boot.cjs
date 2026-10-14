const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
  page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 250)));
  page.on('crash', () => console.log('[CRASH] page crashed'));
  page.on('console', m => { const t = m.text(); if (/diag|error|Error/i.test(t)) console.log('[console]', t.slice(0, 200)); });
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
      await wait(500);
    }
    const t0 = performance.now();
    console.log('[diag] boot ms', Math.round(t0));
    // walk the boot to the village
    g.player.position.set(20, g.world.terrainHeight.height(20, 150) + 0.2, 150);
    await wait(9000);
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1;
    // count village meshes / draw info
    const renderer = g.engine?.renderer;
    const info = renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles } : null;
    console.log('[diag] alive after village teleport; heapMB', mem, 'info', JSON.stringify(info));
    // free-cam around the green to force rendering everything
    g.rig.freeCam = true;
    g.rig.freePos.set(20, g.world.terrainHeight.height(20, 160) + 8, 160);
    g.rig.yaw = Math.PI; g.rig.pitch = -0.3;
    await wait(12000);
    console.log('[diag] alive after freecam 12s; heapMB',
      performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1);
    return 'alive';
  }).catch(e => 'EVAL-DEAD: ' + String(e).slice(0, 120));
  console.log('result:', r);
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 200)); process.exit(2); });
