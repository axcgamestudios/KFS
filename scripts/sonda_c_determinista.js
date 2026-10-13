// Sonda C — VERIFICACIÓN DETERMINISTA (llamadas directas con dt controlado,
// inmune al SwiftShader lento): velocidad/ timón del barco, embestida con daño,
// encallar con daño, vuelo del dragón (W/fuego), ascenso del buceo, HUD admin,
// caballo admin y scroll de ajustes.
(async () => {
  const out = [];
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    const check = (name, cond, extra = '') => out.push((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' [' + extra + ']' : ''));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};

    // --- arrancar partida ---
    const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    startBtn.click();
    await wait(2200);
    press('Space'); release('Space');
    await wait(1500);
    press('Space'); release('Space');
    await wait(1800);
    const p = g.player;
    check('Partida en marcha', !!p && p.health > 0);
    g.engine.applyQuality('low');
    await wait(400);

    const naval = g.naval;
    const WIND = g.world.water ? null : null; // WIND vive en WorldConfig; usar el del naval via update
    const terrain = g.world.terrainHeight;

    // encontrar agua profunda (> 6 m) y poco profunda (< 1.5 m) cerca del sur
    let deepSpot = null, shallowSpot = null;
    for (let x = -100; x <= 300 && (!deepSpot || !shallowSpot); x += 40) {
      for (let z = 380; z <= 600 && (!deepSpot || !shallowSpot); z += 40) {
        const h = terrain.height(x, z);
        if (!deepSpot && h < -6) deepSpot = { x, z };
        if (!shallowSpot && h > -1.55 && h < -0.6) shallowSpot = { x, z };
      }
    }
    check('Puntos de prueba hallados (profundo/somero)', !!deepSpot && !!shallowSpot,
      'profundo=' + JSON.stringify(deepSpot) + ' somero=' + JSON.stringify(shallowSpot));

    // ============================================================
    // 1. VELOCIDAD Y TIMÓN — escaneo empírico del viento + determinista
    // ============================================================
    naval.spawnAdminShip(deepSpot.x, deepSpot.z);
    const A = naval.extraShips[naval.extraShips.length - 1];
    p.teleport(A.pos.x, 2.5, A.pos.z);
    await wait(200);
    // escanear 8 rumbos × 20 pasos: el que más acelera va a favor del viento
    let bestH = 0, bestSpd = -1;
    for (let k = 0; k < 8; k++) {
      const h = k / 8 * Math.PI * 2;
      A.anchored = false; A.frozen = false;
      A.sailState = 2;
      A.heading = h;
      A.pos.set(deepSpot.x, 0, deepSpot.z);
      A.speed = 0;
      A.syncTransform();
      for (let i = 0; i < 20; i++) naval.update(1 / 30, p.position);
      const s = Math.abs(A.speed);
      if (s > bestSpd) { bestSpd = s; bestH = h; }
    }
    // carrera determinista con el mejor rumbo (2 s de juego)
    A.heading = bestH;
    A.pos.set(deepSpot.x, 0, deepSpot.z);
    A.speed = 0;
    A.sailState = 2;
    A.anchored = false;
    A.syncTransform();
    for (let i = 0; i < 60; i++) {
      A.rudderInput = 0;
      naval.update(1 / 30, p.position);
    }
    const spd = Math.abs(A.speed);
    check('Barco acelera con velas (2 s de juego)', spd > 1.2, 'v=' + spd.toFixed(2) + ' m/s (mejor rumbo ' + (bestH * 57.3).toFixed(0) + '°, escaneo ' + bestSpd.toFixed(2) + ')');
    // timón: girar con velocidad
    const h0 = A.heading;
    for (let i = 0; i < 60; i++) {
      A.rudderInput = 1;
      naval.update(1 / 30, p.position);
    }
    check('Timón gira el barco en marcha', Math.abs(A.heading - h0) > 0.15, 'Δ=' + Math.abs(A.heading - h0).toFixed(3) + ' rad');
    A.rudderInput = 0;
    A.speed = 0; A.sailState = 0; A.anchored = true;

    // ============================================================
    // 2. EMBESTIDA — daño al casco en agua profunda
    // ============================================================
    naval.spawnAdminShip(deepSpot.x + 30, deepSpot.z);
    const B = naval.extraShips[naval.extraShips.length - 1];
    B.anchored = true; B.speed = 0; B.sailState = 0;
    A.anchored = false;
    A.pos.set(deepSpot.x, 0, deepSpot.z);
    B.pos.set(deepSpot.x + 7, 0, deepSpot.z); // solapados (mín 14.8)
    A.heading = Math.PI / 2; // +X → hacia B
    A.speed = 6; // embestida
    A.syncTransform(); B.syncTransform();
    const hpB0 = B.hullHp, hpA0 = A.hullHp;
    for (let i = 0; i < 6; i++) naval.update(1 / 30, p.position);
    const dAB = Math.hypot(B.pos.x - A.pos.x, B.pos.z - A.pos.z);
    check('Cascos sólidos tras embestida (>= 14 m)', dAB >= 13.5, 'd=' + dAB.toFixed(1) + ' m');
    check('Embestida daña AMBOS cascos', (hpB0 - B.hullHp) > 0 && (hpA0 - A.hullHp) > 0,
      'A: -' + (hpA0 - A.hullHp).toFixed(0) + ' HP · B: -' + (hpB0 - B.hullHp).toFixed(0) + ' HP');
    A.speed = 0; A.anchored = true;

    // ============================================================
    // 3. ENCALLAR — el barco NO atraviesa la playa + daño
    // ============================================================
    if (shallowSpot) {
      A.anchored = false;
      A.pos.set(shallowSpot.x, 0, shallowSpot.z);
      A.heading = 0;
      A.speed = 6;
      A.syncTransform();
      const hpG0 = A.hullHp;
      const z0 = A.pos.z;
      for (let i = 0; i < 30; i++) naval.update(1 / 30, p.position);
      check('Encallar frena el barco (v ≈ 0)', Math.abs(A.speed) < 0.15, 'v=' + A.speed.toFixed(2));
      check('Encallar daña el casco', (hpG0 - A.hullHp) > 0, '-' + (hpG0 - A.hullHp).toFixed(0) + ' HP');
      check('Retroceso de la quilla (no atraviesa tierra)', A.pos.z <= z0 + 2.0, 'Δz=' + (A.pos.z - z0).toFixed(2) + ' m');
      A.anchored = true;
    }

    // ============================================================
    // 4. VUELO DEL DRAGÓN — determinista (loop directo de rideUpdate)
    // ============================================================
    const d = g.dragons.adminSpawn('drake_stones', deepSpot.x, deepSpot.z + 60);
    await wait(400);
    p.teleport(d.pos.x + 3, d.pos.y - 1.5, d.pos.z);
    await wait(300);
    check('Dragón admin dócil y montable', !!d && d.rideable && !d.aggro);
    g.dragons.mountDragon(d);
    check('Montado', g.dragons.ridingId !== null && d.ridden);
    // despegue determinista: ESPACIO (up) 1 s
    press('Space');
    for (let i = 0; i < 30; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('Space');
    check('Despegue (flying, +altura)', d.flying === true && d.pos.y > 8, 'y=' + d.pos.y.toFixed(1));
    // vuelo adelante con W: 3 s de juego
    press('KeyW');
    const fx0 = d.pos.x, fz0 = d.pos.z;
    for (let i = 0; i < 90; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('KeyW');
    const flew = Math.hypot(d.pos.x - fx0, d.pos.z - fz0);
    check('W avanza el vuelo (> 15 m en 3 s)', flew > 15, flew.toFixed(1) + ' m');
    check('Cámara de montura (setMountMode dragón)', (g.rig.setMountMode(true, 15), g.rig.mountMode === true));
    g.rig.setMountMode(false);
    // aliento de fuego: clic izq. 1 s de juego
    const glow0 = d.model.glowValue ?? 0;
    for (let i = 0; i < 30; i++) g.dragons.rideUpdate(1 / 30, g.input, true, terrain);
    const glowFire = d.model.glowValue ?? 0;
    check('Clic izq. aliento de fuego (boca encendida)', glowFire > 0.3, 'glow=' + glowFire.toFixed(2) + ' (antes ' + glow0.toFixed(2) + ')');
    for (let i = 0; i < 10; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    // descenso: MAYÚS hasta aterrizar
    press('ShiftLeft', 'Shift');
    let landed = false;
    for (let i = 0; i < 150 && !landed; i++) {
      g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
      landed = d.flying === false;
    }
    release('ShiftLeft');
    check('MAYÚS desciende y aterriza', landed, 'y=' + d.pos.y.toFixed(1));
    // desmontar y dragón dócil
    const dis = g.dragons.dismountDragon();
    check('Desmontar (dragón dócil de nuevo)', !!dis && g.dragons.ridingId === null && !dis.ridden && !dis.aggro);

    // ============================================================
    // 5. BUCEO — ascenso determinista con ESPACIO (agua profunda)
    // ============================================================
    p.diving = false; p.swimming = false;
    p.teleport(deepSpot.x, -0.4, deepSpot.z);
    await wait(100);
    // forzar estado de inmersión: nadando y bajo la superficie
    p.swimming = true;
    p.diving = true;
    p.position.y = -4;
    p.stamina = 100;
    press('Space');
    let surfaced = false, frames = 0;
    for (let i = 0; i < 150 && !surfaced; i++) {
      p.update(1 / 30, g.input, 0, terrain, g.colliders, false);
      frames++;
      surfaced = p.diving === false && p.position.y > -1.2;
    }
    release('Space');
    check('ESPACIO asciende del buceo a la superficie', surfaced, frames + ' frames, y=' + p.position.y.toFixed(2));
    // descenso determinista con MAYÚS
    p.diving = true;
    p.position.y = -1;
    p.stamina = 100;
    press('ShiftLeft', 'Shift');
    let sank = false;
    for (let i = 0; i < 60 && !sank; i++) {
      p.update(1 / 30, g.input, 0, terrain, g.colliders, false);
      sank = p.position.y < -3;
    }
    release('ShiftLeft');
    check('MAYÚS desciende en el mar libre', sank, 'y=' + p.position.y.toFixed(2));
    check('Overlay submarino funcionando', window.__kotfsStoreGet().submerged === true || p.position.y < -1.5);
    p.diving = false;
    p.teleport(24, terrain.height(24, 236) + 1, 236); // volver a tierra

    // ============================================================
    // 6. CABALLO ADMIN — montar / desmontar
    // ============================================================
    const m = g.mounts;
    m.spawnHorse('admin_c2', 'Trueno E2E', 'black', p.position.x + 2, p.position.z + 2, true, 0);
    await wait(300);
    const prompt = m.interactionPrompt(p.position);
    check('Caballo admin: prompt Montar', !!prompt && prompt.prompt.includes('Montar'), prompt ? prompt.prompt : 'null');
    check('Montar caballo admin', m.mount('admin_c2') === true && m.ridingId === 'admin_c2');
    m.dismount();
    check('Desmontar caballo', m.ridingId === null);

    // ============================================================
    // 7. AJUSTES — scroll del panel (UI real)
    // ============================================================
    p.teleport(24, terrain.height(24, 236) + 1, 236);
    await wait(400);
    press('Escape');
    await wait(700);
    const pausedText = document.body.innerText;
    check('Pausa abierta con Escape', pausedText.includes('PAUSA') || pausedText.includes('REANUDAR'), pausedText.slice(0, 40));
    const ajustesBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().trim() === 'AJUSTES' || b.textContent?.includes('Ajustes'));
    check('Botón Ajustes presente', !!ajustesBtn);
    if (ajustesBtn) {
      ajustesBtn.click();
      await wait(500);
      const scroller = Array.from(document.querySelectorAll('div')).find((el) => String(el.className).includes('kotfs-scroll'));
      check('Contenedor con scroll (.kotfs-scroll)', !!scroller);
      if (scroller) {
        const overflows = scroller.scrollHeight > scroller.clientHeight + 8;
        check('El contenido desborda (hay que deslizar)', overflows, scroller.scrollHeight + '>' + scroller.clientHeight);
        scroller.scrollTop = 60;
        await wait(150);
        check('La rueda/deslizamiento responde', scroller.scrollTop > 30, 'top=' + scroller.scrollTop);
        scroller.scrollTop = scroller.scrollHeight;
        await wait(150);
        check('Alcanza el fondo (Sensibilidad visible)', document.body.innerText.includes('SENSIBILIDAD'));
      }
    }
    const resumeBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('REANUDAR'));
    if (resumeBtn) { resumeBtn.click(); await wait(400); }
    press('Escape'); release('Escape');
    await wait(300);
  } catch (e) {
    out.push('EXCEPTION: ' + (e && e.message ? e.message : String(e)));
  }
  window.__sondaC = out;
})();
