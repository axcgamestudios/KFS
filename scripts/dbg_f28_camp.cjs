const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { try { localStorage.setItem('kotfs_settings', JSON.stringify({quality:'low',tier:'low',settingsRev:3,waves:false,shadows:false,realLights:false,grass3d:false,renderChunks:2,reflections:0,postfx:false,resolution:0.7,showFps:false,masterVolume:0,musicVolume:0,sfxVolume:0,sensitivity:1,invertY:false})); localStorage.setItem('kfs_test_playwright','1'); } catch(e){} });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) { const b = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map((x)=>x.textContent?.toUpperCase()||'')).catch(()=>[]); if (b.some(t=>t&&t.includes('NEW GAME'))) break; await page.waitForTimeout(500); }
  const r = await page.evaluate(async () => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {}; g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 150; i++) { const ph = window.__kotfsStoreGet().phase; if (ph==='intro') { window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:'Space',bubbles:true})); window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:'Space',bubbles:true})); } if (ph==='playing') break; await wait(400); }
    g.relocateTraveller(3, false);
    const th = g.world.terrainHeight;
    g.player.teleport(55.2, th.height(55.2, 98.2) + 0.4, 98.2);
    g.player.yaw = Math.atan2(58 - 55.2, 100 - 98.2);
    await wait(4200);
    const out = {};
    out.player = { x: +g.player.position.x.toFixed(2), y: +g.player.position.y.toFixed(2), z: +g.player.position.z.toFixed(2), yawDeg: +(g.player.yaw*180/Math.PI).toFixed(1) };
    out.ground = +th.height(55.2, 98.2).toFixed(2);
    const ce = g.engine.camera.matrixWorld.elements;
    out.cam = { x: +ce[12].toFixed(1), y: +ce[13].toFixed(1), z: +ce[14].toFixed(1) };
    // meshes within 15m of the camp center, with visibility
    const near = [];
    g.engine.scene.traverse((o) => {
      if (o.isMesh) {
        const e = o.matrixWorld.elements;
        const d = Math.hypot(e[12] - 58, e[14] - 100);
        if (d < 15) near.push({ d: +d.toFixed(1), vis: o.visible, y: +e[13].toFixed(1), n: (o.name || o.parent?.name || 'anon').slice(0, 18) });
      }
    });
    out.campMeshes = near.length;
    out.sample = near.sort((a,b)=>a.d-b.d).slice(0, 16);
    // the traveller NPC himself
    const v = (g.npcs ?? []).find((n) => n.def.id === 'viajero');
    out.viajero = v ? { x: +v.position.x.toFixed(1), z: +v.position.z.toFixed(1), y: +v.position.y.toFixed(1), vis: v.group.visible, modelVis: v.model?.root?.visible } : 'missing';
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  await browser.close();
})();
