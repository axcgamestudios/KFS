const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc --max-old-space-size=1600','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => {
    localStorage.setItem('kotfs_settings', JSON.stringify({ quality:'low', tier:'low', settingsRev:3, waves:false, shadows:false, realLights:false, grass3d:false, renderChunks:4, reflections:0, postfx:false, resolution:0.85, showFps:false, masterVolume:0, musicVolume:0, sfxVolume:0, sensitivity:1, invertY:false }));
    localStorage.setItem('kfs_test_playwright','1');
  });
  await page.goto('http://localhost:3121/KFS/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 120; i++) {
    const btns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((b)=>b.textContent?.toUpperCase()||'')).catch(()=>[]);
    if (btns.some((t)=>t&&t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async () => {
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
    await wait(1500);
    // quick functional sweep on PROD: still + traveler + arms census
    const s = g.state;
    for (const [id, n] of [['gelatina_basica',4],['lodo_viscoso',2],['manzana_silvestre',2]]) s.addItem(id, n);
    const craft = window.__kotfsApi.forgeCraft('still', 'brew_curacion');
    window.__kotfsApi.useItem('pocion_curacion_menor');
    const g2 = g.traveler;
    g2.arrive({ id: 'green', name: 'the village green', biome: 'village', x: 20, z: 150 }, g2.dayFloat + 0.25);
    for (let i = 0; i < 4; i++) { g2.update(1/30, g.player.position, g2.dayFloat); await wait(60); }
    g2.startAmbush();
    for (let i = 0; i < 8; i++) { g2.update(1/30, g.player.position, g2.dayFloat); await wait(60); }
    const near = g.bandits.meleeHitCheckRadius(g.player.position, 90, 24).filter((x) => !x.bandit.dead);
    for (const x of near) g.bandits.damage(x.bandit, 100000, true);
    for (let i = 0; i < 8; i++) { g2.update(1/30, g.player.position, g2.dayFloat); await wait(60); }
    let rigid = 0, blended = 0;
    g.player.model.root.traverse((o) => {
      if (!o.isSkinnedMesh || !o.geometry?.attributes?.skinWeight) return;
      const sw = o.geometry.attributes.skinWeight;
      for (let i = 0; i < sw.count; i++) {
        let sum = 0, max = 0;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); sum += w; if (w > max) max = w; }
        if (sum > 0 && max / sum > 0.999) rigid++; else if (sum > 0) blended++;
      }
    });
    return {
      craft, heal: Math.round(g.player.health), max: g.player.stats.maxHealth,
      traveler: { present: g2.present, discount: g2.discountPct, rep: g2.reputation, posture: g2.ambushView },
      census: { rigid, blended },
    };
  }).catch((e) => ({ error: String(e).slice(0, 300) }));
  console.log(JSON.stringify(r, null, 1));
  console.log('pageErrors:', errs.length, errs.slice(0, 3));
  await browser.close();
})().catch((e)=>{ console.error('FATAL', e); process.exit(1); });
