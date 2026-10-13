// Probe 3: trees in the forest + fire sword + bounty/ambush + marker + hip roll
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
    const st = () => g.state;
    g.input.pointerLocked = true;
    const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) { btn.click(); await wait(3000); press('Space'); release('Space'); await wait(1500); }
    g.engine.applyQuality('xlow');
    g.world.vegetation.setGrassDensity(0.0);
    // ===== ÁRBOLES (teleport to the forest) =====
    p.position.set(-190, g.world.terrainHeight.height(-190,-60) + 0.1, -60);
    for (let i = 0; i < 40; i++) { g.world.terrain.update(-190, -60); g.world.vegetation.update(-190, -60); await wait(150); }
    let treeMeshes = 0, texTrees = 0;
    g.engine.scene.traverse(o => {
      const im = o;
      if (im.isInstancedMesh && Array.isArray(im.material) && im.material.length === 2 && im.count > 0) {
        treeMeshes++;
        if (im.material[0].map && im.material[1].map) texTrees++;
      }
    });
    check('Árboles 2 materiales (corteza+hoja) instanciados en el bosque', treeMeshes > 0, treeMeshes+' meshes');
    if (treeMeshes) check('TODAS las especies texturizadas (corteza+hoja)', texTrees === treeMeshes, texTrees+'/'+treeMeshes);
    // geometry detail: count triangles of one tree mesh (low-poly fix)
    let sampleTris = 0;
    g.engine.scene.traverse(o => {
      const im = o;
      if (im.isInstancedMesh && Array.isArray(im.material) && im.material.length === 2 && im.count > 0 && sampleTris === 0) {
        sampleTris = im.geometry.attributes.position.count / 3;
      }
    });
    check('Geometría de árbol más rica (≥600 tris, antes ~350)', sampleTris >= 600, sampleTris.toFixed(0)+' tris');
    // ===== ESPADA DE FUEGO =====
    st().addItem('espada_fuego', 1);
    await wait(400);
    check('Colmillo Ígneo en el inventario', st().hasItem('espada_fuego'));
    check('Se equipa sola (la mejor espada)', st().equippedWeapon === 'espada_fuego', st().equippedWeapon);
    await wait(600);
    const km = p.model;
    let fireGlow = false;
    if (km && km.activeWeapon) {
      km.activeWeapon.traverse(o => {
        const m = o;
        if (m.isMesh) {
          const ms = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of ms) if (mm.emissive && mm.emissiveIntensity > 1.5) {
            const hex = mm.emissive.getHex();
            if (hex === 0xff4d12 || hex === 0xff6a1e) fireGlow = true;
          }
        }
      });
    }
    check('La hoja del héroe ARDE (runas ígneas)', fireGlow);
    // damage check via module
    const mod = await import('/src/game/systems/CombatSystem.ts');
    const w = mod.WEAPONS.espada_fuego;
    check('Stats: 34/58 + elemento fuego', w.lightDmg === 34 && w.heavyDmg === 58 && w.element === 'fire');
    // ===== MISIONES DE ACCIÓN =====
    const board = g.world.interactables.find(i => i.id === 'bounty_board');
    check('Cartel de recompensas en la plaza', !!board);
    if (board) {
      board.run();
      await wait(300);
      check('La Caza del Cuervo arranca', st().isQuestActive('sq_cazarrecompensas'));
    }
    const k0 = st().killCounters.bandit ?? 0;
    st().registerKill('bandit'); st().registerKill('bandit');
    check('registerKill cuenta piezas', (st().killCounters.bandit ?? 0) === k0 + 2, (st().killCounters.bandit??0)+' totales');
    const before = g.bandits.aliveCount();
    const amb = g.bandits.spawnAmbush(p.position.x, p.position.z, 3);
    check('EMBOSCADA: 3 caballeros rojos saltan', amb === 3 && g.bandits.aliveCount() === before + 3);
    // ===== MARCADOR =====
    await wait(700); // HUD sync
    const storeMod = await import('/src/store/gameStore.ts');
    const tracker = storeMod.useGameStore.getState().questTracker;
    check('Tracker activo', !!tracker && tracker.objectives.length > 0, tracker?.title);
    check('Pin de misión EN PANTALLA (x/y/dist)', !!tracker?.marker3d, tracker?.marker3d ? tracker.marker3d.dist+' m' : 'null');
    let beaconParts = 0;
    const beacon = g.engine.scene.getObjectByName('quest_beacon');
    if (beacon) beacon.traverse(o => { if (o.isMesh) beaconParts++; });
    check('Baliza mejorada (≥5 piezas)', beaconParts >= 5, beaconParts+' piezas');
    // ===== ANIMACIÓN: hip roll =====
    press('KeyW');
    let hipRollSeen = false;
    for (let i = 0; i < 24; i++) {
      const hip = km.bones?.get?.('j_hipL');
      if (hip && Math.abs(hip.rotation.z) > 0.004) { hipRollSeen = true; break; }
      await wait(60);
    }
    release('KeyW');
    check('Marcha con balanceo de cadera (secundario)', hipRollSeen);
    return log.join('\\n');
  })()`;
  const result = await page.evaluate(script).catch((e) => 'EVAL ERR: ' + e.message);
  console.log(result);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  await browser.close();
})();
