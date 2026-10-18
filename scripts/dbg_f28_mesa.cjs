const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.addInitScript(() => { try { localStorage.setItem('kotfs_settings', JSON.stringify({quality:'high',tier:'high',settingsRev:3,waves:true,shadows:true,realLights:true,grass3d:true,renderChunks:4,reflections:1,postfx:true,resolution:0.9,showFps:false,masterVolume:0,musicVolume:0,sfxVolume:0,sensitivity:1,invertY:false})); localStorage.setItem('kfs_test_playwright','1'); } catch(e){} });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) { const b = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((x)=>x.textContent?.toUpperCase()||'')).catch(()=>[]); if (b.some(t=>t&&t.includes('NEW GAME'))) break; await page.waitForTimeout(500); }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) { const ph = window.__kotfsStoreGet().phase; if (ph==='intro') { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:'Space',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:'Space',bubbles:true})); } if (ph==='playing') break; await wait(400); }
    window.__kotfsApi.adminSetTime(0.55);
    await wait(600);
    g.player.teleport(-13.2, 3, 150.8);
    g.player.yaw = Math.atan2(-16 - -13.2, 148 - 150.8);
    await wait(2600);
    const out = {};
    out.player = { x: +g.player.position.x.toFixed(2), y: +g.player.position.y.toFixed(2), z: +g.player.position.z.toFixed(2), yaw: +g.player.yaw.toFixed(3), yawDeg: +(g.player.yaw * 180 / Math.PI).toFixed(1) };
    out.ground = +g.world.terrainHeight.height(-13.2, 150.8).toFixed(2);
    out.mesaGround = +g.world.terrainHeight.height(-16, 148).toFixed(2);
    const ce = g.engine.camera.matrixWorld.elements;
    out.cam = { x: +ce[12].toFixed(2), y: +ce[13].toFixed(2), z: +ce[14].toFixed(2) };
    const fl = Math.hypot(ce[8], ce[9], ce[10]) || 1;
    out.camForward = { x: +(-ce[8] / fl).toFixed(3), z: +(-ce[10] / fl).toFixed(3) };
    // meshes near the mesa anchor (-16,148), raw matrix reads
    const near = [];
    g.engine.scene.traverse((o) => {
      if (o.isMesh && o.visible) {
        const e = o.matrixWorld.elements;
        const d = Math.hypot(e[12] + 16, e[14] - 148);
        if (d < 7) near.push({ n: (o.name || o.parent.name || 'anon').slice(0, 22), x: +e[12].toFixed(1), y: +e[13].toFixed(1), z: +e[14].toFixed(1) });
      }
    });
    out.nearCount = near.length;
    out.nearMesa = near.slice(0, 14);
    // ANY mesh anywhere within 20m of the camera in the forward half-plane?
    let ahead = 0;
    g.engine.scene.traverse((o) => {
      if (o.isMesh && o.visible) {
        const e = o.matrixWorld.elements;
        const dx = e[12] - ce[12], dz = e[14] - ce[14];
        const dist = Math.hypot(dx, dz);
        if (dist < 30) {
          const fd = (dx * -ce[8] + dz * -ce[10]) / (fl * dist || 1);
          if (fd > 0.6) ahead++;
        }
      }
    });
    out.meshesAhead30m = ahead;
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
