// probe_f28_prod.cjs — Fase 28 production boot probe (out/ under /KFS):
// the whole F28 surface must exist in the exported build: the mesa
// interactable, the traveller at his stop, the alchemy catalog, the sell
// tab, a brew, a timed window + HUD push, the new-day relocate, and a
// clean console (0 page errors).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage', '--mute-audio',
  ] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 2, reflections: 0,
        postfx: false, resolution: 0.6, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto('http://localhost:8901/KFS/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    if (!g) return { fail: 'no game' };
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
      await wait(400);
    }
    const api = window.__kotfsApi;
    const out = { phase: window.__kotfsStoreGet().phase };
    out.mesa = !!(g.world?.interactables ?? []).some((it) => it.id === 'mesa_alquimia');
    const v = (g.npcs ?? []).find((n) => n.def.id === 'viajero');
    out.viajero = v ? { x: Math.round(v.position.x), z: Math.round(v.position.z), atDay1Stop: Math.abs(v.position.x + 318) < 6 && Math.abs(v.position.z - 190) < 6 } : 'MISSING';
    const cat = api.alchemyCatalog();
    out.recipes = cat ? cat.recipes.length : 0;
    g.state.addItem('gelatina_basica', 2);
    g.state.addItem('lodo_viscoso', 1);
    g.state.addItem('coin', 50);
    out.brew = api.alchemyCraft('r_menor');
    out.brewFlag = g.state.hasFlag('primera_pocion');
    g.state.addItem('reliquia_marina', 1);
    out.sell = api.sellShopItem('viajero', 'reliquia_marina');
    out.buysCount = api.shopCatalog('viajero')?.buys?.length ?? 0;
    // a timed window + the HUD push + the player sync (wait for real frames)
    g.state.addItem('elixir_masa_inerte', 1);
    api.useItem('elixir_masa_inerte');
    await wait(1200);
    out.masa = {
      direct: g.alchemy.fallAndBlastMul(),
      player: g.player.fallDmgMul,
      hud: window.__kotfsStoreGet().activeEffects.map((e) => e.id),
    };
    g.relocateTraveller(3, false);
    await wait(300);
    const v2 = (g.npcs ?? []).find((n) => n.def.id === 'viajero');
    out.relocate = v2 ? { x: Math.round(v2.position.x), z: Math.round(v2.position.z) } : 'missing';
    out.draws = g.engine.renderer.info.render.calls;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('PAGE ERRORS (' + errors.length + '): ' + errors.slice(0, 4).join(' | '));
  await browser.close();
  process.exit(errors.length > 0 ? 1 : 0);
})();
