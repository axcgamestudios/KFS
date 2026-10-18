const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  page.on('pageerror', e => console.log('PAGEERR: ' + String(e).slice(0,200)));
  await page.addInitScript(() => { try { localStorage.setItem('kotfs_settings', JSON.stringify({quality:'low',tier:'low',settingsRev:3,waves:false,shadows:false,realLights:false,grass3d:false,renderChunks:2,reflections:0,postfx:false,resolution:0.6,showFps:false,masterVolume:0,musicVolume:0,sfxVolume:0,sensitivity:1,invertY:false})); localStorage.setItem('kfs_test_playwright','1'); } catch(e){} });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) { const b = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((x)=>x.textContent?.toUpperCase()||'')).catch(()=>[]); if (b.some(t=>t&&t.includes('NEW GAME'))) break; await page.waitForTimeout(500); }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r)=>setTimeout(r,ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) { const ph = window.__kotfsStoreGet().phase; if (ph==='intro') { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:'Space',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:'Space',bubbles:true})); } if (ph==='playing') break; await wait(400); }
    const probe = (label) => {
      const left = g.alchemy.activeEffectsView().map(e => `${e.id}:${e.left.toFixed(1)}`);
      return { label, left, fall: g.player.fallDmgMul, storeN: window.__kotfsStoreGet().activeEffects.length };
    };
    const steps = [];
    // step 0: open masa inerte, confirm decaying
    g.state.addItem('elixir_masa_inerte', 1);
    window.__kotfsApi.useItem('elixir_masa_inerte');
    await wait(500);
    steps.push(probe('after-use'));
    // step 1: quest flow (like the big probe)
    g.state.addItem('lodo_viscoso', 3);
    g.state.addItem('gelatina_basica', 2);
    g.state.startQuest('sq_alquimia');
    g.state.evaluateQuests();
    await wait(500);
    steps.push(probe('after-quest'));
    // step 2: applyPlayerDamage like the piedra test
    g.state.addItem('pocion_piel_piedra', 1);
    window.__kotfsApi.useItem('pocion_piel_piedra');
    await wait(300);
    g.applyPlayerDamage(100, g.player.position.x + 1, g.player.position.z, 'bestiary');
    g.player.health = 100;
    await wait(500);
    steps.push(probe('after-damage'));
    // step 3: craft like the big probe
    g.state.addItem('gelatina_elemental', 2);
    g.state.addItem('polvora_fina', 1);
    window.__kotfsApi.alchemyCraft('r_fuego');
    await wait(500);
    steps.push(probe('after-craft'));
    return { steps, phase: window.__kotfsStoreGet().phase, dead: g.dead };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
