// Probe 4 (light): fire sword + bounty + marker — no heavy streaming loops
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERR: ' + e.message));
  page.on('crash', () => errors.push('CRASH'));
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
    const st = () => g.state;
    g.input.pointerLocked = true;
    const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) { btn.click(); await wait(3000); press('Space'); release('Space'); await wait(1500); }
    g.engine.applyQuality('xlow');
    g.world.vegetation.setGrassDensity(0.0);
    // ESPADA DE FUEGO
    st().addItem('espada_fuego', 1);
    await wait(300);
    check('Colmillo Ígneo en inventario', st().hasItem('espada_fuego'));
    check('Se equipa sola', st().equippedWeapon === 'espada_fuego', st().equippedWeapon);
    await wait(500);
    const km = p.model;
    let fireGlow = false, fireHex = 0;
    if (km && km.activeWeapon) {
      km.activeWeapon.traverse(o => {
        const m = o;
        if (m.isMesh) {
          const ms = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of ms) if (mm.emissive && mm.emissiveIntensity > 1.5) {
            const hex = mm.emissive.getHex();
            if (hex === 0xff4d12 || hex === 0xff6a1e) { fireGlow = true; fireHex = hex; }
          }
        }
      });
    }
    check('La hoja del héroe ARDE (runas ígneas)', fireGlow, '0x'+fireHex.toString(16));
    check('Elemento de espada activo en el juego (estela de brasas)', g.equippedElement === 'fire', String(g.equippedElement));
    // MISIONES
    const board = g.world.interactables.find(i => i.id === 'bounty_board');
    check('Cartel de recompensas en la plaza', !!board);
    if (board) { board.run(); await wait(250); check('La Caza del Cuervo arranca', st().isQuestActive('sq_cazarrecompensas')); }
    const k0 = st().killCounters.bandit ?? 0;
    st().registerKill('bandit'); st().registerKill('bandit');
    check('registerKill cuenta piezas', (st().killCounters.bandit ?? 0) === k0 + 2);
    const before = g.bandits.aliveCount();
    const amb = g.bandits.spawnAmbush(p.position.x, p.position.z, 3);
    check('EMBOSCADA: 3 caballeros rojos', amb === 3 && g.bandits.aliveCount() === before + 3);
    // MARCADOR
    await wait(800);
    const tracker = window.__kotfsHud ? null : null;
    // read the store via the zustand hook installed on window by GameRoot
    const storeGet = window.__kotfsStoreGet || null;
    const tr = storeGet ? storeGet().questTracker : null;
    check('Tracker activo', !!tr, tr?.title);
    check('Pin de misión EN PANTALLA', !!tr?.marker3d, tr?.marker3d ? tr.marker3d.dist+' m x='+tr.marker3d.x.toFixed(2) : 'null');
    let beaconParts = 0;
    const beacon = g.engine.scene.getObjectByName('quest_beacon');
    if (beacon) beacon.traverse(o => { if (o.isMesh) beaconParts++; });
    check('Baliza mejorada (≥5 piezas)', beaconParts >= 5, beaconParts+'');
    // ANIMACIÓN hip roll
    press('KeyW');
    let hipRollSeen = false;
    for (let i = 0; i < 24; i++) {
      const hip = km.bones?.get?.('j_hipL');
      if (hip && Math.abs(hip.rotation.z) > 0.004) { hipRollSeen = true; break; }
      await wait(60);
    }
    release('KeyW');
    check('Marcha con balanceo de cadera', hipRollSeen);
    return log.join('\\n');
  })()`;
  const result = await page.evaluate(script).catch((e) => 'EVAL ERR: ' + e.message);
  console.log(result);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  await browser.close();
})();
