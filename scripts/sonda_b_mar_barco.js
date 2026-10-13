// Sonda B (secuencial, página limpia): nado+inmersión, barco (abordaje/velas/
// timón/colisión barco-barco/encallar), y W de vuelo del dragón (re-test limpio)
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
    if (!startBtn) { out.push('FAIL — sin botón de nueva partida'); window.__sondaB = out; return; }
    startBtn.click();
    await wait(2200);
    press('Space'); release('Space');
    await wait(1500);
    press('Space'); release('Space'); // por si el intro aún corría
    await wait(1500);
    const p = g.player;
    check('Partida en marcha', !!p && p.health > 0);
    g.engine.applyQuality('low');
    await wait(300);

    // ============================================================
    // 1. NADO CON INMERSIÓN
    // ============================================================
    p.teleport(90, 1.2, 245);
    await wait(3000);
    check('Nadando en mar abierto', p.swimming === true, 'y=' + p.position.y.toFixed(2));
    p.stamina = 100;
    const surf0 = g.world.water.waveHeightAt(p.position.x, p.position.z);
    press('ShiftLeft', 'Shift');
    await wait(2500);
    const depth = surf0 - p.position.y;
    check('MAYÚS sumerge (diving)', p.diving === true, 'depth=' + depth.toFixed(1) + ' m');
    check('Descendió > 1.5 m bajo la superficie', depth > 1.5, depth.toFixed(1) + ' m');
    check('Overlay submarino (store.submerged)', window.__kotfsStoreGet().submerged === true);
    check('Sigue nadando bajo el agua (swimming)', p.swimming === true);
    release('ShiftLeft');
    await wait(200);
    press('Space');
    await wait(3200);
    const surfNow = g.world.water.waveHeightAt(p.position.x, p.position.z);
    const atSurface = Math.abs(p.position.y - (surfNow - 0.52)) < 1.0;
    check('ESPACIO asciende a la superficie', p.diving === false && atSurface, 'y=' + p.position.y.toFixed(2));
    release('Space');
    await wait(300);
    check('Overlay apagado al salir', window.__kotfsStoreGet().submerged === false);

    // ============================================================
    // 2. BARCO — invocar, abordar, velas, timón
    // ============================================================
    const naval = g.naval;
    const spawnPos = naval.spawnAdminShip(45, 240);
    check('Barco admin invocado', !!spawnPos, '(' + spawnPos.x.toFixed(0) + ',' + spawnPos.z.toFixed(0) + ')');
    await wait(700);
    const ship = naval.extraShips[naval.extraShips.length - 1];
    // teletransporte al barco (en cubierta)
    p.teleport(ship.pos.x + 3, 2.5, ship.pos.z);
    p.diving = false; p.swimming = false;
    await wait(800);
    const cand = naval.helmCandidate(p.position);
    check('Prompt Zarpar (candidato de timón)', !!cand && cand === ship);
    g.takeHelm(ship);
    await wait(300);
    check('Al timón (playerSailing)', naval.playerSailing === true);
    check('Cámara de navegación (shipTarget)', g.rig.shipTarget === ship);
    check('Prompt de timón tomado (store.atHelm)', window.__kotfsStoreGet().atHelm === true);
    press('KeyW'); release('KeyW');
    await wait(200);
    press('KeyW'); release('KeyW');
    await wait(2500);
    check('Velas izadas con W (sailState=2)', ship.sailState === 2, 'sail=' + ship.sailState);
    check('El barco navega (v > 1.5)', ship.speed > 1.5, 'v=' + ship.speed.toFixed(2));
    check('HUD de navegación activo', !!window.__kotfsStoreGet().sailing);
    const h0 = ship.heading;
    press('KeyA');
    await wait(1200);
    release('KeyA');
    check('Timón con A (gira)', Math.abs(ship.heading - h0) > 0.02, 'Δ=' + Math.abs(ship.heading - h0).toFixed(3));
    // soltar el timón
    naval.leaveHelm();
    await wait(300);
    check('Soltar el timón (deja de navegar)', naval.playerSailing === false);

    // ============================================================
    // 3. COLISIÓN BARCO-BARCO (cascos sólidos + daño de embestida)
    // ============================================================
    const ship2 = naval.extraShips.find((s) => s !== ship) ?? (() => {
      naval.spawnAdminShip(ship.pos.x + 60, ship.pos.z + 20);
      return naval.extraShips[naval.extraShips.length - 1];
    })();
    check('Segundo barco presente', !!ship2);
    // colocar el barco 2 pegado al barco 1 (deben empujarse aparte)
    ship.anchored = true; ship2.anchored = true;
    ship.speed = 0; ship2.speed = 0;
    ship.pos.set(200, 0, 200);
    ship2.pos.set(207, 0, 200); // 7 m de distancia — ¡solapados! (mín 14.8)
    ship.syncTransform(); ship2.syncTransform();
    await wait(1500);
    const dAfter = Math.hypot(ship2.pos.x - ship.pos.x, ship2.pos.z - ship.pos.z);
    check('Cascos sólidos: empuje a separación >= 14 m', dAfter >= 13.5, 'd=' + dAfter.toFixed(1) + ' m');

    // embestida con daño: barco 1 acelera hacia el 2
    const hp0 = ship2.hullHp;
    ship.anchored = false;
    ship.heading = Math.atan2(ship2.pos.x - ship.pos.x, ship2.pos.z - ship.pos.z);
    ship.syncTransform();
    ship.sailState = 2;
    ship.speed = 6; // embestida directa
    await wait(1600);
    const dAfterRam = Math.hypot(ship2.pos.x - ship.pos.x, ship2.pos.z - ship.pos.z);
    const ramDmg = hp0 - ship2.hullHp;
    check('Embestida: separación mantenida', dAfterRam >= 13.5, 'd=' + dAfterRam.toFixed(1));
    check('Embestida: daño al casco', ramDmg > 0, '-' + ramDmg.toFixed(0) + ' HP');
    ship.sailState = 0; ship.speed = 0; ship.anchored = true;

    // ============================================================
    // 4. VUELO DEL DRAGÓN — re-test limpio de W (montar→volar→W)
    // ============================================================
    p.teleport(30, g.world.terrainHeight.height(30, 260) + 1, 260);
    await wait(500);
    const d = g.dragons.adminSpawn('drake_stones', 34, 262);
    check('Dragón admin invocado (dócil)', !!d && d.rideable && !d.aggro, d ? d.def.name : 'null');
    await wait(1000);
    p.teleport(d.pos.x + 3, d.pos.y - 1.5, d.pos.z);
    await wait(500);
    check('Dragón al alcance (prompt montar)', g.dragons.nearestRideableDragon(p.position) === d);
    g.dragons.mountDragon(d);
    check('Montado (ridingId)', g.dragons.ridingId !== null);
    await wait(300);
    // despegue + avance sostenido con W (SIN soltar W hasta medir)
    press('Space');
    await wait(2200);
    release('Space');
    check('Despegue con ESPACIO', d.flying === true, 'y=' + d.pos.y.toFixed(1));
    const fx0 = d.pos.x, fz0 = d.pos.z;
    press('KeyW');
    await wait(3000);
    const flew = Math.hypot(d.pos.x - fx0, d.pos.z - fz0);
    release('KeyW');
    check('W avanza el vuelo (> 8 m)', flew > 8, flew.toFixed(1) + ' m');
    check('Vista de montura ampliada (mountMode)', g.rig.mountMode === true);
    // aterrizar y soltar
    press('ShiftLeft', 'Shift');
    let landed = false;
    for (let i = 0; i < 24 && !landed; i++) { await wait(450); landed = d.flying === false; }
    release('ShiftLeft');
    check('Aterrizaje con MAYÚS', landed, 'y=' + d.pos.y.toFixed(1));
    g.dragons.dismountDragon();
    g.rig.setMountMode(false);
    check('Desmontado y cámara restaurada', g.dragons.ridingId === null && g.rig.mountMode === false);
  } catch (e) {
    out.push('EXCEPTION: ' + (e && e.message ? e.message : String(e)));
  }
  window.__sondaB = out;
})();
