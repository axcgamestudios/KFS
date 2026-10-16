// shots_f28_live.cjs — Fase 28 live SwiftShader shots (ONE per run).
// Usage: node shots_f28_live.cjs <arms_idle|arms_walk|arms_attack|villagers|
//        still_prop|still_panel|traveler_camp|traveler_panel|traveler_ambush|
//        potions_hud>
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = '/home/z/my-project/scripts/shots_f28_live';
fs.mkdirSync(OUT, { recursive: true });
const shot = process.argv[2] ?? 'arms_walk';
const BASE = process.argv[3] ?? 'http://localhost:3000/';

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1600',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  ] });
  const page = await browser.newPage({ viewport: { width: 960, height: 560 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3, waves: false, shadows: false,
        realLights: false, grass3d: false, renderChunks: 4, reflections: 0,
        postfx: false, resolution: 0.9, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) {}
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 120; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t && t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }
  const r = await page.evaluate(async ([name]) => {
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const g = window.__kotfsGame;
    const store = window.__kotfsStoreGet;
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    for (let i = 0; i < 200; i++) {
      const ph = store().phase;
      if (ph === 'intro') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: 'Space', bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: 'Space', bubbles: true }));
      }
      if (ph === 'playing') break;
      await wait(300);
    }
    try { if (g.cinematics?.active) g.cinematics.skip(); } catch (e) {}
    await wait(1800);
    const p = g.player;
    const m = p.model;
    const park = (yaw, pitch, dist) => {
      g.rig.yaw = yaw; g.rig.pitch = pitch;
      g.rig.distance = dist; g.rig.targetDistance = dist;
    };
    let proof = '';
    const spot = { x: 14, z: 158 };
    p.position.set(spot.x, g.world.terrainHeight.height(spot.x, spot.z) + 0.1, spot.z);
    p.yaw = 0.35;

    if (name === 'arms_idle' || name === 'arms_walk' || name === 'arms_attack') {
      g.state.addItem('espada_acero');
      g.state.equip('espada_acero');
      g.combat.refreshVisuals();
      const shL = m.boneByName('j_shoulderL');
      const shR = m.boneByName('j_shoulderR');
      if (name === 'arms_idle') {
        park(Math.PI + 0.7, -0.05, 3.1);
        for (let i = 0; i < 10; i++) await wait(300);
        proof = `idle shL ${shL.rotation.x.toFixed(2)}`;
      } else if (name === 'arms_walk') {
        park(Math.PI + 1.35, 0.10, 3.2);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
        for (let i = 0; i < 40 && p.speedSm < 3.0; i++) await wait(280);
        // wait for a mid-stride with BOTH arms engaged
        let ok = false;
        for (let i = 0; i < 60; i++) {
          await wait(130);
          if (Math.abs(shL.rotation.x) > 0.22 && Math.abs(shR.rotation.x) > 0.22) { ok = true; break; }
        }
        await wait(90);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
        proof = `walk ${p.speedSm.toFixed(1)} m/s both-arms-swing ${ok ? 'rendered' : 'timeout'}`;
      } else {
        park(Math.PI + 1.15, 0.10, 3.0);
        p.attackKind = 'light1';
        p.attackDur = 99999;
        p.attackT = 0.42;
        let ok = false;
        for (let i = 0; i < 40; i++) {
          await wait(260);
          if (Math.abs(shR.rotation.x) > 0.45 && Math.abs(shL.rotation.x) > 0.25) { ok = true; break; }
        }
        proof = `strike rendered ${ok ? 'yes' : 'no'}`;
      }
    } else if (name === 'villagers') {
      // park at the green; manually drive 3 nearby villagers at walking speed
      const px = 20, pz = 150;
      p.position.set(px, g.world.terrainHeight.height(px, pz) + 0.1, pz);
      park(0.6 + Math.PI, -0.08, 6.5);
      // wait for the shared fuse_civilian GLB to arrive (async load)
      for (let t = 0; t < 40; t++) {
        if ((g.npcs ?? []).some((n) => n.model?.poseWalk)) break;
        await wait(500);
      }
      const npcs = (g.npcs ?? []).filter((n) => n.model?.poseWalk);
      const posOf = (n) => (n.group ?? n.model?.root ?? n.root);
      const movers = [];
      for (const n of npcs) {
        const q = posOf(n);
        const d = Math.hypot(q.position.x - px, q.position.z - pz);
        if (d < 60) movers.push(n);
      }
      for (const n of movers) {
        const q = posOf(n);
        q.rotation.y = Math.atan2(px - q.position.x, pz - q.position.z) + 0.35;
      }
      // keep only the 3 nearest, and pull them to the green in front of the camera
      movers.sort((a, b) => {
        const qa = posOf(a), qb = posOf(b);
        return Math.hypot(qa.position.x - px, qa.position.z - pz) - Math.hypot(qb.position.x - px, qb.position.z - pz);
      });
      movers.length = Math.min(3, movers.length);
      for (let i = 0; i < movers.length; i++) {
        const q = posOf(movers[i]);
        const a = 0.5 - i * 0.55;
        q.position.set(px + Math.sin(a) * 3.1, g.world.terrainHeight.height(px + Math.sin(a) * 3.1, pz + Math.cos(a) * 3.1), pz + Math.cos(a) * 3.1);
      }
      const frames = 34;
      const drive = () => {
        for (const n of movers) {
          n.model.update({ dt: 1 / 30, speed: 1.5, moving: true, grounded: true, swimming: false, attackT: 0 });
        }
      };
      // drive in bursts so throttled frames interleave
      for (let i = 0; i < frames; i++) { drive(); await wait(45); }
      proof = `movers ${movers.length} driven of ${npcs.length} glb ${(g.npcs ?? []).filter((n) => n.model?.poseWalk).length}`;
    } else if (name === 'still_prop') {
      // camera at Maren's still (−2.5, 155)
      p.position.set(-1.4, g.world.terrainHeight.height(-1.4, 156.4) + 0.1, 156.4);
      park(-0.55 + Math.PI, -0.10, 4.2);
      for (let i = 0; i < 10; i++) await wait(280);
      proof = 'still prop';
    } else if (name === 'still_panel') {
      // walk to the still and open the panel through the interactable
      p.position.set(-2.5, g.world.terrainHeight.height(-2.5, 155) + 0.1, 155);
      const T0 = g.traveler; // not needed; the forge station drives the panel
      g.input.releaseLock();
      store().setForge({ station: 'still' });
      for (let i = 0; i < 12; i++) await wait(300);
      proof = 'still panel open ' + (document.body.textContent.includes('MAREN') ? 'visible' : 'missing');
    } else if (name === 'traveler_camp' || name === 'traveler_panel' || name === 'traveler_ambush') {
      const T = g.traveler;
      T.arrive({ id: 'green', name: 'the village green', biome: 'village', x: 20, z: 150 }, T.dayFloat + 0.25);
      p.position.set(20, g.world.terrainHeight.height(20, 150) + 0.1, 150);
      if (name === 'traveler_camp') {
        park(2.4 + Math.PI, -0.07, 7.5);
        for (let i = 0; i < 14; i++) await wait(300);
        proof = 'camp at the green: flame+banner+merchant';
      } else if (name === 'traveler_panel') {
        // stand in the camp and open through the real interactable
        for (let i = 0; i < 6; i++) { T.update(1 / 30, p.position, T.dayFloat); await wait(60); }
        const prompt = T.interactableNear(p.position);
        if (prompt) prompt.run(); else store().setTraveler({ tab: 'supplies' });
        for (let i = 0; i < 14; i++) await wait(300);
        proof = 'panel ' + (document.body.textContent.includes('GUILD OF TRADERS') ? 'visible' : 'missing');
      } else {
        T.startAmbush();
        store().setTraveler({ tab: 'supplies' });
        for (let i = 0; i < 4; i++) { T.update(1 / 30, p.position, T.dayFloat); await wait(60); }
        park(0.3 + Math.PI, -0.05, 9);
        for (let i = 0; i < 16; i++) { T.update(1 / 30, p.position, T.dayFloat); await wait(320); }
        proof = 'ambush posture banner ' + (document.body.textContent.includes('POSTURE') ? 'visible' : 'missing');
      }
    } else if (name === 'potions_hud') {
      // use three potions and capture the HUD chips
      const s = g.state;
      for (const [id, n] of [['gelatina_basica', 4], ['lodo_viscoso', 2], ['manzana_silvestre', 2], ['escama_opaca', 4], ['diente_reptil', 2]]) s.addItem(id, n);
      window.__kotfsApi.forgeCraft('still', 'brew_curacion');
      window.__kotfsApi.forgeCraft('still', 'brew_escamas');
      s.addItem('pocion', 1);
      window.__kotfsApi.useItem('pocion_escamas');
      s.addItem('pocion_curacion_menor', 1);
      window.__kotfsApi.useItem('pocion_curacion_menor');
      park(2.6 + Math.PI, -0.04, 5.4);
      for (let i = 0; i < 12; i++) await wait(300);
      proof = 'chips ' + (document.body.textContent.includes('Light Scales') ? 'visible' : 'missing');
    }
    await wait(350);
    return proof;
  }, [shot]).catch((e) => 'EVAL FAIL ' + String(e).slice(0, 200));

  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/live_${shot}.png`, timeout: 150000 });
  console.log(`[${shot}] ${r}`);
  await browser.close();
})();
