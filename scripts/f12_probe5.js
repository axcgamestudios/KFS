// Probe 5: MAPA (-30%) completo + ÁRBOLES en el bosque
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    if (await page.evaluate(() => !!window.__kotfsGame).catch(()=>false)) break;
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
    check('Isla Cuervo NUEVA (-540,-450) tierra', th.height(-540,-450) > 5, th.height(-540,-450).toFixed(1)+' m');
    check('VIEJA (-620,-520) ahora mar', th.height(-620,-520) < 0, th.height(-620,-520).toFixed(1)+' m');
    check('Faro NUEVO (575,108) tierra', th.height(575,108) > 3, th.height(575,108).toFixed(1)+' m');
    check('Bruma NUEVA (-60,590) tierra', th.height(-60,590) > 1, th.height(-60,590).toFixed(1)+' m');
    check('Bruma B (40,655) tierra', th.height(40,655) > 0.5, th.height(40,655).toFixed(1)+' m');
    check('Fortaleza (-490,-445) meseta', th.height(-490,-445) > 6, th.height(-490,-445).toFixed(1)+' m');
    check('Cala (-398,-450) accesible', (h=>h>-1&&h<12)(th.height(-398,-450)), th.height(-398,-450).toFixed(1)+' m');
    check('Bajío (-360,-490) somero', (h=>h>-2&&h<6)(th.height(-360,-490)), th.height(-360,-490).toFixed(1)+' m');
    check('Gaviota (-425,-308) agua profunda', th.height(-425,-308) < -2, th.height(-425,-308).toFixed(1)+' m');
    check('Zarpa (110,430) agua', th.height(110,430) < -1, th.height(110,430).toFixed(1)+' m');
    const kr = g.dragons.dragonById('kraivenn');
    if (kr) {
      const d = Math.hypot(kr.pos.x + 398, kr.pos.z + 450);
      check('Kraivenn junto a la Cala nueva', d < 160, d.toFixed(0)+' m');
    } else check('Kraivenn existe', false);
    // water worldHalf 716 (map bounds)
    const wh = g.world.water.material.uniforms.uWorldHalf.value;
    check('Mapa reducido: uWorldHalf = 716 (-30%)', wh === 716, String(wh));
    // ===== ÁRBOLES: teleport to the forest and let the game loop stream =====
    p.position.set(-190, th.height(-190, -60) + 0.1, -60);
    await wait(12000); // real frames stream chunks around the new position
    let treeMeshes = 0, texTrees = 0, sampleTris = 0;
    g.engine.scene.traverse(o => {
      const im = o;
      if (im.isInstancedMesh && Array.isArray(im.material) && im.material.length === 2 && im.count > 0) {
        treeMeshes++;
        if (im.material[0].map && im.material[1].map) texTrees++;
        if (!sampleTris) sampleTris = im.geometry.attributes.position.count / 3;
      }
    });
    check('Árboles instanciados en el bosque', treeMeshes > 0, treeMeshes+' meshes');
    if (treeMeshes) check('Corteza+hoja TEXTURIZADAS en todas', texTrees === treeMeshes, texTrees+'/'+treeMeshes);
    if (sampleTris) check('Geometría más rica (≥600 tris)', sampleTris >= 600, sampleTris.toFixed(0)+' tris');
    return log.join('\\n');
  })()`;
  const result = await page.evaluate(script).catch((e) => 'EVAL ERR: ' + e.message);
  console.log(result);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  await browser.close();
})();
