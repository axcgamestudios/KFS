// F20 diagnosis v2 — correct APIs: player.teleport, terrainHeight.height,
// engine.scene, world.assets.pbr. Boots the game, audits materials + GLB
// presence in the scene, screenshots key landmarks.
const { chromium } = require('playwright');
const fs = require('fs');

const URL = process.argv[2] || 'http://localhost:3000';
const OUT = '/home/z/my-project/scripts/shots_f20';
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=2000',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3,
        waves: false, shadows: false, realLights: false, grass3d: false,
        renderChunks: 3, reflections: 0, postfx: false, resolution: 0.6, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) { /* ignore */ }
  });

  const assetReqs = [];
  const failed = [];
  const pageErrs = [];
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/game/') || u.includes('menu/')) {
      assetReqs.push({ url: u.replace(URL, ''), status: r.status() });
      if (r.status() >= 400) failed.push(`${r.status()} ${u}`);
    }
  });
  page.on('pageerror', (e) => pageErrs.push(e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrs.push(('CONSOLE: ' + m.text()).slice(0, 300)); });

  console.log('[probe] goto', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/00_menu.jpg`, type: 'jpeg', quality: 80 });

  const report = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    if (!g) return ['FAIL — no game instance'];
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    if (!playing) return ['FAIL — never reached PLAYING'];
    await wait(3500);
    const log = [];
    const a = g.world.assets;
    // PBR sets loaded?
    const pbrOk = [];
    for (const [k, v] of Object.entries(a.pbr || {})) {
      pbrOk.push(`${k}:${v.map ? 'alb' : '!'}${v.normalMap ? '/nrm' : ''}${v.roughnessMap ? '/rgh' : ''}${v.map && v.map.image ? '/img' : v.map && v.map.source ? '/src' : '?'}`);
    }
    log.push('PBR: ' + pbrOk.join(' '));
    log.push('TEX singles: mapleBark=' + !!(a.mapleBark && (a.mapleBark.image || a.mapleBark.source)) +
      ' mapleLeaf=' + !!(a.mapleLeaf && (a.mapleLeaf.image || a.mapleLeaf.source)) +
      ' terrainDetail=' + !!(a.terrainDetail && (a.terrainDetail.image || a.terrainDetail.source)));

    // Scene audit on the LIVE scene
    let total = 0, withMap = 0, tri = 0;
    let glbLike = 0, named = {};
    g.engine.scene.traverse((o) => {
      if (o.isMesh) {
        total++;
        tri += (o.geometry && o.geometry.attributes && o.geometry.attributes.position) ? o.geometry.attributes.position.count / 3 : 0;
        if (o.material && o.material.map) withMap++;
        const src = (o.userData && o.userData.kitSrc) || '';
        if (src) { named[src] = (named[src] || 0) + 1; if (o.material && o.material.map) glbLike++; }
      }
    });
    log.push(`SCENE: meshes=${total} withMap=${withMap} tris≈${Math.round(tri)}`);
    log.push('KITSRC: ' + JSON.stringify(named).slice(0, 400));

    // sample material library: does the shared MAT carry maps?
    const mats = g.world.mats || g.world.materials || null;
    if (mats) {
      const sample = {};
      for (const k of ['stone', 'wood', 'roofRed', 'cobble', 'dirt', 'concreteWhite', 'timber']) {
        const m = mats[k];
        if (m) sample[k] = m.map ? 'TEX' : 'PLAIN';
      }
      log.push('MATLIB: ' + JSON.stringify(sample));
    } else log.push('MATLIB: not exposed (fine — PBR wiring happens at build)');

    log.push('RENDER: ' + JSON.stringify({ calls: g.engine.renderer.info.render.calls, geoms: g.engine.renderer.info.memory.geometries, texs: g.engine.renderer.info.memory.textures }));
    return log;
  }).catch((e) => ['EVAL-ERROR: ' + String(e).slice(0, 500)]);

  console.log('=== ENGINE REPORT ===');
  report.forEach((l) => console.log(l));

  // Landmark screenshots
  const landmarks = [
    ['01_village_green', 20, 165, 'village green + fountain + cottages'],
    ['02_castillo', 105, -38, 'castle courtyard + keep'],
    ['03_puerto', -60, 205, 'Crowhaven port — pirate ship GLB'],
    ['04_maple', -235, 10, 'Great Maple — maple_tree.glb'],
    ['05_cabin_row', 32, 139, 'cottage row interiors'],
    ['06_herrero', 40, 130, 'smithy — white concrete'],
  ];
  for (const [name, x, z] of landmarks) {
    const ok = await page.evaluate(async ({ xx, zz }) => {
      const g = window.__kotfsGame;
      const th = g.world.terrainHeight;
      try { g.player.teleport(xx, th.height(xx, zz) + 0.2, zz); return 'OK'; }
      catch (e) { return 'ERR ' + String(e).slice(0, 100); }
    }, { xx: x, zz: z }).catch((e) => 'EVAL-ERR ' + String(e).slice(0,120));
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 82 });
    console.log('[shot]', name, ok);
  }

  console.log('=== ASSET REQUESTS (' + assetReqs.length + ') ===');
  assetReqs.forEach((r) => console.log(String(r.status).padStart(3), r.url.slice(-80)));
  console.log('=== FAILED (' + failed.length + ') ===');
  failed.forEach((f) => console.log(' ', f.slice(-110)));
  console.log('=== PAGE ERRORS (' + pageErrs.length + ') ===');
  pageErrs.slice(0, 20).forEach((e) => console.log(' ', e));
  await browser.close();
  console.log('[probe] done');
})();
