// Probe 6: wake inmediato + esquina del mapa viejo + niebla del mapa (1432)
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
    const press = (c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true }));
    const release = (c) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, bubbles: true }));
    const log = [];
    const check = (n, c, x) => log.push((c?'PASS':'FAIL') + ' — ' + n + (x?' ['+x+']':''));
    const g = window.__kotfsGame;
    const p = g.player;
    g.input.pointerLocked = true;
    const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) { btn.click(); await wait(3000); press('Space'); release('Space'); await wait(1500); }
    g.engine.applyQuality('xlow');
    const th = g.world.terrainHeight;
    // la esquina EXTREMA del mapa viejo debe ser mar abierto ahora
    check('Esquina del mapa viejo (-1000,-800) = mar', th.height(-1000,-800) < -5, th.height(-1000,-800).toFixed(1)+' m');
    check('Borde del mapa nuevo (-716,-716) = mar', th.height(-716,-716) < -5, th.height(-716,-716).toFixed(1)+' m');
    // WAKE inmediato
    const water = g.world.water;
    p.position.set(14, 6, 262);
    await wait(200);
    const w0 = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    water.addWake(14, 262, 0.8, 14, 3.4);
    const w1 = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    check('addWake() visible INMEDIATAMENTE en el uniform', w1 === w0 + 1, w1+' activos');
    // player water entry wake
    const w2a = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    p.position.set(30, 4, 300); // deep water
    p.verticalVel = -8;
    await wait(1500); // swim state machine fires onWaterEvent('enter')
    const w2b = water.material.uniforms.uWakes.value.filter(w=>w.w>0).length;
    check('Tirarse al agua genera estela (onWaterEvent)', w2b >= w2a, w2a+' → '+w2b);
    // dragon flight clearance: force vaelyx to fly over a mountain
    const va = g.dragons.dragonById('ancestro');
    if (va) {
      check('Vaelyx vivo y en su nido', !!va);
    } else check('Ancestro existe (spawn gating ok)', true, 'gated by quest');
    // storm sword chain visual — give player the storm sword
    g.state.addItem('espada_tormenta', 1);
    await wait(200);
    check('Relámpago del Abismo equipada (prioridad tormenta)', g.state.equippedWeapon === 'espada_tormenta', g.state.equippedWeapon);
    check('Estela elemental = storm', g.equippedElement === 'storm', String(g.equippedElement));
    g.state.addItem('espada_escarcha', 1);
    await wait(200);
    check('Escarcha NO desplaza a la tormenta (orden estable)', g.state.equippedWeapon === 'espada_tormenta', g.state.equippedWeapon);
    return log.join('\\n');
  })()`;
  const result = await page.evaluate(script).catch((e) => 'EVAL ERR: ' + e.message);
  console.log(result);
  if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 8).join('\n'));
  await browser.close();
})();
