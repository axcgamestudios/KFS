const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc --max-old-space-size=1600','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => console.log('[err]', String(e).slice(0,200)));
  await page.addInitScript(() => {
    localStorage.setItem('kotfs_settings', JSON.stringify({ quality:'low', tier:'low', settingsRev:3, waves:false, shadows:false, realLights:false, grass3d:false, renderChunks:4, reflections:0, postfx:false, resolution:0.85, showFps:false, masterVolume:0, musicVolume:0, sfxVolume:0, sensitivity:1, invertY:false }));
    localStorage.setItem('kfs_test_playwright','1');
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 120; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b)=>b.textContent?.toUpperCase()||'')).catch(()=>[]);
    if (btns.some((t)=>t&&t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((res)=>setTimeout(res,ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 200; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:'Space',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:'Space',bubbles:true})); }
      if (ph === 'playing') break;
      await wait(300);
    }
    await wait(1000);
  });
  const series = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res)=>setTimeout(res,ms));
    const g = window.__kotfsGame;
    const e = g.engine;
    const out = [];
    for (let i = 0; i < 12; i++) {
      await wait(1000);
      out.push({ t: i+1, scale: e.adaptiveScale, note: e.adaptiveNote, ema: +e.frameMsEma.toFixed(1), cd: +e.adaptiveCooldown.toFixed(2), ov: +e.overloadT.toFixed(2), idx: e.adaptiveIdx, pr: e.renderer.getPixelRatio() });
    }
    return out;
  });
  console.log(JSON.stringify(series, null, 1));
  await browser.close();
})().catch((e)=>{ console.error('FATAL', e); process.exit(1); });
