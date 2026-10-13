window.__kotfsE2EBLog = null;
setTimeout(() => {
// E2E FASE 11-B — olas, barcos (timón+colliders GLB), señálero,
// finales con actores reales. Corre sobre la partida viva (sin combat tests).
  (async () => {
  if (window.__kotfsE2EBStarted) return 'already';
  window.__kotfsE2EBStarted = true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const mdown = (btn = 0) => window.dispatchEvent(new MouseEvent('mousedown', { button: btn, bubbles: true }));
  const mup = (btn = 0) => window.dispatchEvent(new MouseEvent('mouseup', { button: btn, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => {
    const ex = extra ? ` [${extra}]` : '';
    log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${ex}`);
  };
  const step = (s) => { window.__e2eStepB = s; };
  window.addEventListener('error', (e) => { window.__e2eErrB = e.message; });
  try {
    const g = window.__kotfsGame;
    const st = () => g.state;
    const p = g.player;
    if (!g.input.pointerLocked) g.input.pointerLocked = true;
    // ---- start a fresh game if we're at the menu ----
    for (let i = 0; i < 90; i++) {
      const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
      if (btn || !document.body.innerText.includes('NUEVA PARTIDA')) break;
      await wait(500);
    }
    if (document.body.innerText.includes('NUEVA PARTIDA')) {
      Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'))?.click();
      await wait(2600);
      press('Space'); release('Space');
      await wait(1800);
    }
    g.engine.applyQuality('xlow');
    g.world.vegetation.setGrassDensity(0.2);

    // ================= 1. OLAS — solo cerca =================
    step('olas');
    const water = g.world.water;
    const uWave = water.material.uniforms.uWaveMotion.value;
    check('Radio de oleaje por preset ≤ 160 m', uWave <= 160, `${uWave} m`);
    const px = p.position.x, pz = p.position.z;
    const nearH = water.waveHeightAt(px + 12, pz + 6);
    const farH = water.waveHeightAt(px + 320, pz + 160);
    check('Olas cerca del jugador: se mueven (CPU)', Math.abs(nearH) > 0.0005, nearH.toFixed(3));
    check('Olas a ~350 m: PLANO (CPU = GPU)', Math.abs(farH) < 0.001, farH.toFixed(4));

    // ================= 2. BARCOS =================
    step('barcos');
    if (!g.naval.playerShip) {
      st().setFlag('ship_repaired');
      g.launchShip();
      await wait(2500);
    }
    const pship = g.naval.playerShip;
    check('Colibrí existe (repair + launchShip)', !!pship);
    await wait(2200); // GLB hull dress
    check('Colibrí con casco GLB', !!pship && pship.usesGlbHull === true);
    check('Colliders escalados al casco REAL (colSX>1)', pship.colSX > 1.0, `sx=${pship.colSX.toFixed(2)} sz=${pship.colSZ.toFixed(2)}`);
    check('Cubierta más ancha que la procedural', pship.deckHalfW > 1.63, `w=${pship.deckHalfW.toFixed(2)}`);
    // collider AABB coverage vs visual hull width
    let visW = 0;
    if (pship.glbHull) {
      pship.glbHull.updateWorldMatrix(true, true);
      let minX = Infinity, maxX = -Infinity;
      pship.glbHull.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        o.updateWorldMatrix(true, false);
        const gPos = o.geometry.attributes.position;
        const m = o.matrixWorld.elements;
        for (let i = 0; i < gPos.count; i += Math.max(1, Math.floor(gPos.count / 200))) {
          const x = gPos.getX(i), y = gPos.getY(i), z = gPos.getZ(i);
          const wx = m[0] * x + m[4] * y + m[8] * z + m[12];
          if (wx < minX) minX = wx;
          if (wx > maxX) maxX = wx;
        }
      });
      visW = maxX - minX;
    }
    check('Ancho visual del casco medido', visW > 4, `${visW.toFixed(2)} m`);
    // query the registry near the ship
    const near = p.position;
    const boxes = g.colliders.query(pship.pos.x, pship.pos.z, 30).filter((c) => c.kind === 'box');
    let coverW = 0;
    for (const c of boxes) {
      const w = Math.max(c.maxX - c.minX, c.maxZ - c.minZ);
      if (w > coverW) coverW = w;
    }
    check('Colliders cubren el casco visible (≥75%)', coverW >= visW * 0.75, `collider=${coverW.toFixed(1)} vs visual=${visW.toFixed(1)}`);
    void near;

    // admin ship + helm
    const spawnPos = g.naval.spawnAdminShip(px + 30, pz + 40);
    check('Barco admin spawneado', !!spawnPos, spawnPos ? `(${spawnPos.x.toFixed(0)},${spawnPos.z.toFixed(0)})` : '-');
    p.health = 100;
    p.teleport(spawnPos.x, 3.2, spawnPos.z);
    await wait(1200);
    const cand = g.naval.helmCandidate(p.position);
    check('Candidato al timón (barco anclado ≤13 m)', !!cand, cand?.name ?? 'none');
    const promptNow = g.naval.currentPrompt(p.position);
    check('Prompt: Zarpar a bordo del nuevo barco', !!promptNow && /Zarpar/.test(promptNow.prompt), promptNow?.prompt ?? 'none');
    if (cand) {
      g.naval.takeHelmAt(cand);
      check('Timón tomado (playerSailing)', g.naval.playerSailing === true);
      check('activeShip = barco nuevo', g.naval.activeShip === cand, g.naval.activeShip?.name ?? '-');
      press('KeyW'); release('KeyW'); await wait(120);
      press('KeyW'); release('KeyW'); await wait(120);
      check('Velas izadas (W W → 2)', cand.sailState === 2, `${cand.sailState}`);
      const h0 = cand.heading;
      press('KeyA');
      await wait(2400);
      release('KeyA');
      check('El timón gira el barco (A)', Math.abs(cand.heading - h0) > 0.015, `Δ=${Math.abs(cand.heading - h0).toFixed(3)}`);
      check('El barco navega de verdad', cand.speed > 1.0, `${cand.speed.toFixed(2)} m/s`);
      const cdP0 = cand.cdPort;
      mdown(0); mup(0);
      await wait(200);
      check('Bordada disparada (cañones)', cand.cdPort !== cdP0 || cand.cdPort < cand.cannonCd, `cd=${cand.cdPort.toFixed(1)}`);
      g.naval.leaveHelm();
      check('Soltar timón → ancla', cand.anchored === true && g.naval.playerSailing === false);
    }

    // ================= 3. SEÑÁLERO =================
    step('senalero');
    const qTarget = g.resolveQuestTarget();
    check('Señalero resuelve el objetivo', !!qTarget, qTarget ? `${qTarget.x.toFixed(0)},${qTarget.z.toFixed(0)}` : 'null');
    check('Baliza en el mundo visible', !!g.questBeacon && g.questBeacon.visible === true);
    if (qTarget && g.questBeacon) {
      const bd = Math.hypot(g.questBeacon.position.x - qTarget.x, g.questBeacon.position.z - qTarget.z);
      check('Baliza sobre el objetivo (±8 m)', bd < 8, `${bd.toFixed(1)} m`);
    }
    const hudText = document.body.innerText;
    check('HUD: distancia del señálero', /\d+ m/.test(hudText), (hudText.match(/\d+ m/g) || []).slice(0, 2).join(' '));
    const arrow = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === '▲' && (s.style.transform || '').includes('rotate'));
    check('Flecha direccional en el HUD', !!arrow, arrow?.style.transform ?? 'none');

    // ================= 4. CINEMÁTICAS CON ACTORES =================
    step('cine');
    // FINAL III — the ship truly sails
    const okFree = g.adminPlayCinematic('final_free');
    check('FINAL III lanzado (preview)', okFree === true && g.endings.isPlaying === true);
    g.endings.t = 61.8; // shot 7 (idx 6): the ship comes alive
    await wait(1600);
    const fs = g.naval.playerShip;
    check('El Colibrí zarpó de verdad', Math.hypot(fs.pos.x - 170, fs.pos.z - 505) < 45, `(${fs.pos.x.toFixed(0)},${fs.pos.z.toFixed(0)}) v=${fs.speed.toFixed(1)}`);
    check('Velas a tope en el final', fs.sailState === 2 && fs.speed > 2, `v=${fs.speed.toFixed(1)}`);
    const wheelD = p.position.distanceTo(fs.wheelWorld);
    check('Héroe al timón (pegado a la rueda)', wheelD < 0.9, `${wheelD.toFixed(2)} m`);
    g.endings.t = 73.5; // the chase (idx 7): LIVE camera
    await wait(1500);
    const camD = g.engine.camera.position.distanceTo(fs.pos);
    check('Cámara EN VIVO persiguiendo el barco', camD < 45, `${camD.toFixed(1)} m`);
    check('Cámara sobre el barco', g.engine.camera.position.y > fs.group.position.y + 4);
    g.endings.t = 84; // FIN card (idx 8)
    await wait(700);
    g.endings.skip();
    await wait(900);
    check('Final saltable', g.endings.isPlaying === false);
    check('Preview restaura al héroe (altar ±8 m)', Math.hypot(p.position.x - 20, p.position.z + 302) < 8, `(${p.position.x.toFixed(0)},${p.position.z.toFixed(0)})`);
    check('Preview restaura el barco (ancla)', fs.anchored === true);

    // FINAL I — the guardian walks to the cliff
    step('cine2');
    const okGuard = g.adminPlayCinematic('final_guardian');
    check('FINAL I lanzado (preview)', okGuard === true && g.endings.isPlaying === true);
    const walkStart = { x: p.position.x, z: p.position.z };
    g.endings.t = 45; // idx 4: mid-walk
    await wait(1100);
    const d0 = Math.hypot(walkStart.x - 25, walkStart.z + 291);
    const d1 = Math.hypot(p.position.x - 25, p.position.z + 291);
    check('El guardián CAMINA hacia el acantilado', d1 < d0, `${d0.toFixed(1)}→${d1.toFixed(1)}`);
    g.endings.t = 64; // idx 6: the watcher
    await wait(1100);
    const atCliff = Math.hypot(p.position.x - 25, p.position.z + 291);
    check('El guardián llega al acantilado', atCliff < 5, `${atCliff.toFixed(1)} m`);
    check('Cámara EN VIVO sobre el héroe', g.engine.camera.position.distanceTo(p.position) < 45);
    check('FOV del plano del vigilante (40)', Math.abs(g.engine.camera.fov - 40) < 1.5, `${g.engine.camera.fov.toFixed(1)}`);
    g.endings.skip();
    await wait(700);
    check('FINAL I saltable', g.endings.isPlaying === false);

    // ================= 5. NUBES =================
    step('nubes');
    g.world.sky.dayFraction = 0.5;
    g.rig.pitch = 1.02;
    await wait(400);
    check('Página viva tras el nuevo shader de nubes', document.readyState === 'complete' && !window.__e2eErrB);
    window.__e2eCloudShot = 'ready'; // signal for the screenshot step
  } catch (e) {
    log.push(`FAIL — EXCEPCIÓN: ${e && e.message ? e.message : String(e)}`);
  }
  window.__kotfsE2EBLog = log;
  return 'done-b';
  })();

}, 0);
'kicked-b'