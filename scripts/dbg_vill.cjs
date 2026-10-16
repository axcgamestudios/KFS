const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc --max-old-space-size=1600','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.addInitScript(() => {
    localStorage.setItem('kotfs_settings', JSON.stringify({ quality:'low', tier:'low', settingsRev:3, waves:false, shadows:false, realLights:false, grass3d:false, renderChunks:4, reflections:0, postfx:false, resolution:0.9, showFps:false, masterVolume:0, musicVolume:0, sfxVolume:0, sensitivity:1, invertY:false }));
    localStorage.setItem('kfs_test_playwright','1');
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 120; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b)=>b.textContent?.toUpperCase()||'')).catch(()=>[]);
    if (btns.some((t)=>t&&t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const out = await page.evaluate(async () => {
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
    const snap = () => ({
      t: Date.now() % 100000,
      npcs: (g.npcs ?? []).length,
      glb: (g.npcs ?? []).filter((n) => n.model?.poseWalk).length,
      ctors: [...new Set((g.npcs ?? []).map((n) => n.model?.constructor?.name))],
      loaded: !!(g.world?.assets?.ready?.('fuse_civilian_2.glb') ?? null),
      fallbacks: (g.npcs ?? []).filter((n) => n.model?.fallback).length,
    });
    const a = snap();
    await wait(6000);
    const b = snap();
    await wait(10000);
    const c = snap();
    return { a, b, c };
  });
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e)=>{ console.error('FATAL', e); process.exit(1); });
