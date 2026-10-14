const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1400', '--disable-dev-shm-usage', '--mute-audio',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
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
    await wait(8000);
    const H = g.world.terrainHeight.height.bind(g.world.terrainHeight);
    // find the village group meshes by material name
    const out = { mats: {}, plaza: [] };
    const root = g.engine.scene;
    root.traverse((o) => {
      const m = o;
      if (!m.isMesh || !m.geometry) return;
      const nm = m.material?.name || 'unnamed';
      if (!out.mats[nm]) out.mats[nm] = { count: 0, verts: 0 };
      out.mats[nm].count++;
      out.mats[nm].verts += m.geometry.attributes.position?.count ?? 0;
    });
    // sample plaza stones: find flagstone meshes near (20,150), compare vertex Y vs terrain
    root.traverse((o) => {
      const m = o;
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.attributes.color || !m.material?.vertexColors) return;
      const pos = m.geometry.attributes.position;
      const v = new (window.THREE ? window.THREE.Vector3 : Object)();
      let n = 0; const gaps = []; const worst = [];
      for (let i = 0; i < pos.count; i += 24) { // one sample per stone (24 verts each)
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const dx = vx - 20, dz = vz - 150;
        const r2 = dx * dx + dz * dz;
        if (r2 > 49) continue; // within 7m of the fountain
        n++;
        const gap = vy - H(vx, vz);
        gaps.push(gap);
        worst.push({ gap: +gap.toFixed(3), x: +vx.toFixed(1), z: +vz.toFixed(1), y: +vy.toFixed(2) });
      }
      if (n > 0) {
        gaps.sort((a, b) => a - b);
        worst.sort((a, b) => b.gap - a.gap);
        out.plaza.push({
          stones: n,
          p10: +gaps[Math.floor(gaps.length * 0.1)].toFixed(3),
          median: +gaps[Math.floor(gaps.length * 0.5)].toFixed(3),
          p90: +gaps[Math.floor(gaps.length * 0.9)].toFixed(3),
          worst: worst.slice(0, 12),
        });
      }
    });
    // terrain profile across the green
    out.terrainProfile = [];
    for (const [x, z] of [[20,150],[20,144],[20,156],[14,150],[26,150],[20,158.5],[20,141.5]]) {
      out.terrainProfile.push([x, z, +H(x, z).toFixed(2)]);
    }
    return out;
  }).catch(e => 'EVAL-DEAD: ' + String(e).slice(0, 150));
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})().catch(e => { console.error('CRASH', String(e).slice(0, 200)); process.exit(2); });
