const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
  page.on('pageerror', e => console.log('ERR: ' + String(e).slice(0,300)));
  await page.addInitScript(() => { try { localStorage.setItem('kotfs_settings', JSON.stringify({quality:'low',tier:'low',settingsRev:3,waves:false,shadows:false,realLights:false,grass3d:false,renderChunks:2,reflections:0,postfx:false,resolution:0.6,showFps:false,masterVolume:0,musicVolume:0,sfxVolume:0,sensitivity:1,invertY:false})); localStorage.setItem('kfs_test_playwright','1'); } catch(e){} });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) { const b = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((x)=>x.textContent?.toUpperCase()||'')).catch(()=>[]); if (b.some(t=>t&&t.includes('NEW GAME'))) break; await page.waitForTimeout(500); }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r)=>setTimeout(r,ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) { const ph = window.__kotfsStoreGet().phase; if (ph==='intro') { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:'Space',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:'Space',bubbles:true})); } if (ph==='playing') break; await wait(400); }
    // where did the block land?
    const src = g.updatePlaying.toString();
    const inUpdatePlaying = {
      fallDmgMul: src.includes('fallDmgMul'),
      potionSpeedMul: src.includes('potionSpeedMul'),
      alchemyUpdate: src.includes('this.alchemy.update'),
      hudActiveEffects: src.includes('setActiveEffects'),
    };
    // instrument: count frames for 1s
    g.state.addItem('elixir_masa_inerte', 1);
    window.__kotfsApi.useItem('elixir_masa_inerte');
    await wait(900);
    const direct = g.alchemy.fallAndBlastMul();
    const synced = g.player.fallDmgMul;
    const store = window.__kotfsStoreGet().activeEffects.map(e=>e.id);
    return { inUpdatePlaying, direct, synced, store, phase: window.__kotfsStoreGet().phase };
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
