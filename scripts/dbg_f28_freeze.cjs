// dbg_f28_freeze.cjs — isolate the freeze: live checks after each step.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', e => console.log('PAGEERR: ' + String(e).slice(0, 250)));
  await page.addInitScript(() => { try { localStorage.setItem('kotfs_settings', JSON.stringify({quality:'low',tier:'low',settingsRev:3,waves:false,shadows:false,realLights:false,grass3d:false,renderChunks:2,reflections:0,postfx:false,resolution:0.6,showFps:false,masterVolume:0,musicVolume:0,sfxVolume:0,sensitivity:1,invertY:false})); localStorage.setItem('kfs_test_playwright','1'); } catch(e){} });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) { const b = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((x)=>x.textContent?.toUpperCase()||'')).catch(()=>[]); if (b.some(t=>t&&t.includes('NEW GAME'))) break; await page.waitForTimeout(500); }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) { const ph = window.__kotfsStoreGet().phase; if (ph==='intro') { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:'Space',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:'Space',bubbles:true})); } if (ph==='playing') break; await wait(400); }
    const live = () => ({
      py: +g.player.position.y.toFixed(2),
      gx: +g.player.position.x.toFixed(1),
      phase: window.__kotfsStoreGet().phase,
      dead: !!g.dead,
    });
    const steps = [];
    await wait(1500); steps.push({ s: 'settled', ...live() });
    // a window to watch decay as the heartbeat
    g.state.addItem('antidoto', 1);
    window.__kotfsApi.useItem('antidoto');
    await wait(1200);
    steps.push({ s: 'after-use', antidoto: +g.alchemy.activeEffectsView()[0]?.left.toFixed(2) ?? 'gone', ...live() });
    // teleport 1: ON the ground (y above terrain)
    const gy = g.world.terrainHeight.height(-13.2, 150.8);
    g.player.teleport(-13.2, gy + 0.5, 150.8);
    await wait(1200);
    steps.push({ s: 'teleport-grounded', ...live(), want: +gy.toFixed(2) });
    // teleport 2: BELOW terrain (y=3 as in the shots)
    g.player.teleport(-13.2, 3, 150.8);
    await wait(1200);
    steps.push({ s: 'teleport-below', ...live() });
    // adminSetTime
    window.__kotfsApi.adminSetTime(0.55);
    await wait(1200);
    steps.push({ s: 'after-settime', ...live(), day: +g.world.sky.dayFraction.toFixed(3) });
    // heartbeats: does the antidoto window still decay?
    await wait(1500);
    steps.push({ s: 'final', antidotoLeft: g.alchemy.activeEffectsView().map((e) => e.id + ':' + e.left.toFixed(1)), ...live() });
    return steps;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
