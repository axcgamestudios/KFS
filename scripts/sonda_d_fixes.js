// Sonda D — re-verificación de los dos fixes: dragón dócil junto al jugador
// y vuelo adelante con W (drake_stones speedFly=0 → fallback).
(async () => {
  const out = [];
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    const check = (name, cond, extra = '') => out.push((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' [' + extra + ']' : ''));
    const g = window.__kotfsGame;
    g.input.requestLock = () => {};

    const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    startBtn.click();
    await wait(2200);
    press('Space'); release('Space');
    await wait(1500);
    press('Space'); release('Space');
    await wait(2000);
    const p = g.player;
    const terrain = g.world.terrainHeight;
    check('Partida en marcha', !!p && p.health > 0);

    // dragón terrestre (speedFly=0): el peor caso del fix
    const d = g.dragons.adminSpawn('drake_stones', 34, 262);
    await wait(500);
    // quedarse junto a él un rato (antes se volvía hostil)
    p.teleport(d.pos.x + 3, d.pos.y - 1.5, d.pos.z);
    await wait(2500);
    check('Dragón dócil aunque te acerques', d.aggro === false, 'aggro=' + d.aggro);
    check('Dragón montable (rideable)', d.rideable === true);
    g.dragons.mountDragon(d);
    check('Montado', g.dragons.ridingId !== null);
    // despegue determinista
    press('Space');
    for (let i = 0; i < 30; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('Space');
    check('Despegue', d.flying === true && d.pos.y > 7, 'y=' + d.pos.y.toFixed(1));
    // W: vuelo adelante (3 s de juego) — el fix del speedFly=0
    press('KeyW');
    const fx0 = d.pos.x, fz0 = d.pos.z;
    for (let i = 0; i < 90; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('KeyW');
    const flew = Math.hypot(d.pos.x - fx0, d.pos.z - fz0);
    check('W avanza el vuelo (drake terrestre montado)', flew > 12, flew.toFixed(1) + ' m');
    // girar con A (1.5 s)
    const yaw0 = d.yaw;
    press('KeyA');
    for (let i = 0; i < 45; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('KeyA');
    check('A/D gira en el aire', Math.abs(d.yaw - yaw0) > 0.3, 'Δ=' + Math.abs(d.yaw - yaw0).toFixed(2) + ' rad');
    // aterrizar + desmontar
    press('ShiftLeft', 'Shift');
    let landed = false;
    for (let i = 0; i < 150 && !landed; i++) {
      g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
      landed = d.flying === false;
    }
    release('ShiftLeft');
    check('Aterrizaje con MAYÚS', landed, 'y=' + d.pos.y.toFixed(1));
    g.dragons.dismountDragon();
    check('Desmontado y dócil', g.dragons.ridingId === null && !d.aggro);

    // dragón VOLADOR real (drake_grotto speedFly=9): el caso normal
    const d2 = g.dragons.adminSpawn('drake_grotto', 60, 280);
    await wait(400);
    p.teleport(d2.pos.x + 3, d2.pos.y - 1.5, d2.pos.z);
    await wait(600);
    check('Wyvern dócil y montable', d2.rideable && !d2.aggro);
    g.dragons.mountDragon(d2);
    press('Space');
    for (let i = 0; i < 30; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('Space');
    check('Wyvern despega', d2.flying === true, 'y=' + d2.pos.y.toFixed(1));
    press('KeyW');
    const gx0 = d2.pos.x, gz0 = d2.pos.z;
    for (let i = 0; i < 90; i++) g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
    release('KeyW');
    const flew2 = Math.hypot(d2.pos.x - gx0, d2.pos.z - gz0);
    check('Wyvern vuela adelante con W', flew2 > 15, flew2.toFixed(1) + ' m');
    press('ShiftLeft', 'Shift');
    let landed2 = false;
    for (let i = 0; i < 150 && !landed2; i++) {
      g.dragons.rideUpdate(1 / 30, g.input, false, terrain);
      landed2 = d2.flying === false;
    }
    release('ShiftLeft');
    g.dragons.dismountDragon();
    check('Wyvern aterrizado y desmontado', landed2 && g.dragons.ridingId === null);
  } catch (e) {
    out.push('EXCEPTION: ' + (e && e.message ? e.message : String(e)));
  }
  window.__sondaD = out;
})();
