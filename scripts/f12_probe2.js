// Probe 2: start new game + section A (mapa) + B (kits) — quick checks
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    if (await page.evaluate(() => !!window.__kotfsGame)) break;
  }
  const script = `
  (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (c, k) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: k || c.replace('Digit',''), bubbles: true }));
    const release = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
    const log = [];
    const check = (n, c, x) => log.push((c?'PASS':'FAIL') + ' — ' + n + (x?' ['+x+']':''));
    const g = window.__kotfsGame;
    const p = g.player;
    g.input.pointerLocked = true;
    const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) { btn.click(); await wait(3000); press('Space'); release('Space'); await wait(1500); }
    g.engine.applyQuality('xlow');
    g.world.vegetation.setGrassDensity(0.0);
    // ===== A. MAPA =====
    const th = g.world.terrainHeight;
    check('Isla Cuervo NUEVA pos (-540,-450) es tierra', th.height(-540,-450) > 5, th.height(-540,-450).toFixed(1)+' m');
    check('VIEJA pos (-620,-520) ahora es mar', th.height(-620,-520) < 0, th.height(-620,-520).toFixed(1)+' m');
    check('Faro NUEVO (575,108) es tierra', th.height(575,108) > 3, th.height(575,108).toFixed(1)+' m');
    check('Bruma NUEVA (-60,590) es tierra', th.height(-60,590) > 1, th.height(-60,590).toFixed(1)+' m');
    check('Fortaleza (-490,-445) meseta firme', th.height(-490,-445) > 6, th.height(-490,-445).toFixed(1)+' m');
    check('Cala (-398,-450) accesible', (h=>h>-1&&h<12)(th.height(-398,-450)), th.height(-398,-450).toFixed(1)+' m');
    check('Gaviota (-425,-308) en agua profunda', th.height(-425,-308) < -2, th.height(-425,-308).toFixed(1)+' m');
    check('Zarpa (110,430) en agua', th.height(110,430) < -1, th.height(110,430).toFixed(1)+' m');
    // Kraivenn home
    const kr = g.dragons.dragonById('kraivenn');
    if (kr) {
      const d = Math.hypot(kr.pos.x + 398, kr.pos.z + 450);
      check('Kraivenn anida junto a la Cala nueva', d < 160, d.toFixed(0)+' m');
    } else check('Kraivenn existe', false);
    // ===== B. KITS =====
    const kits = g.world.kits;
    check('Kit medieval cargado', kits.ready);
    const barrel = kits.create('barrel');
    let texN = 0, totN = 0;
    barrel.traverse(o => { if (o.isMesh) { totN++; const ms = Array.isArray(o.material)?o.material:[o.material]; if (ms.some(m=>m.map)) texN++; } });
    check('Barril del kit con TEXTURA real', texN > 0, texN+'/'+totN);
    const sword = kits.weapon('sword');
    let metN = 0;
    sword.traverse(o => { if (o.isMesh) { const ms = Array.isArray(o.material)?o.material:[o.material]; if (ms.some(m=>m.metalness>0.4)) metN++; } });
    check('Espada del kit con METAL real', metN > 0, metN+' mallas');
    // ===== C. ARBOLES =====
    let treeMeshes = 0, texTrees = 0;
    g.engine.scene.traverse(o => {
      const im = o;
      if (im.isInstancedMesh && Array.isArray(im.material) && im.material.length === 2 && im.count > 0) {
        treeMeshes++;
        if (im.material[0].map && im.material[1].map) texTrees++;
      }
    });
    check('Árboles con 2 materiales (corteza+hoja) instanciados', treeMeshes > 0, treeMeshes+' meshes');
    if (treeMeshes) check('TODAS las especies texturizadas', texTrees === treeMeshes, texTrees+'/'+treeMeshes);
    // ===== D. AGUA =====
    const water = g.world.water;
    check('Render target de reflexión REAL creado', !!water.reflRT);
    check('uReflMap presente en el shader', !!water.material.uniforms.uReflMap.value);
    p.position.set(14, 6, 262);
    await wait(300);
    let reflOk = true;
    try { for (let i=0;i<4;i++) water.renderReflection(g.engine.renderer, g.engine.scene, g.engine.camera); } catch(e) { reflOk = false; }
    check('renderReflection() sin errores (espejo+oblicuo)', reflOk);
    const w0 = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    water.addWake(14, 262, 0.8, 14, 3.4);
    const w1 = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    check('addWake() registra anillos', w1 === w0+1, w1+' activos');
    for (let i=0;i<240;i++) water.update(1/30, g.engine.camera);
    const w2 = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    check('Estelas decaen y mueren', w2 === 0, w2+' tras 8 s');
    // ===== E. DRAGONES =====
    const va = g.dragons.dragonById('vaelthara');
    const mult = va ? va.legHeight / 1.15 : null;
    check('Dragones ×2.2', Math.abs(mult-2.2) < 0.02, 'mult='+mult?.toFixed(2));
    return log.join('\\n');
  })()`;
  const result = await page.evaluate(script).catch((e) => 'EVAL ERR: ' + e.message);
  console.log(result);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  await page.screenshot({ path: '/home/z/my-project/download/capturas/f12_probe2.png' });
  await browser.close();
})();
