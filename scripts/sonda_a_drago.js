// Sonda directa: vuelo de dragón montado (ya está montado por la sonda previa)
(async () => {
  const out = [];
  try {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    const g = window.__kotfsGame;
    const d = g.dragons.riddenDragon;
    if (!d) { out.push('FAIL — no hay dragón montado'); window.__sondaA = out; return; }
    out.push('PASS — dragón montado: ' + d.def.name);
    out.push((d.ridden ? 'PASS' : 'FAIL') + ' — IA suspendida (ridden=' + d.ridden + ', aggro=' + d.aggro + ')');

    // 1) despegue con ESPACIO
    const y0 = d.pos.y;
    press('Space');
    await wait(1600);
    let flying = d.flying;
    await wait(1600);
    release('Space');
    out.push((d.flying ? 'PASS' : 'FAIL') + ' — ESPACIO despega (flying=' + d.flying + ')');
    out.push((d.pos.y > y0 + 1.5 ? 'PASS' : 'FAIL') + ' — gana altura (+' + (d.pos.y - y0).toFixed(1) + ' m)');

    // 2) avanzar con W
    const x0 = d.pos.x, z0 = d.pos.z;
    press('KeyW');
    await wait(2400);
    release('KeyW');
    const flew = Math.hypot(d.pos.x - x0, d.pos.z - z0);
    out.push((flew > 5 ? 'PASS' : 'FAIL') + ' — W avanza el vuelo (' + flew.toFixed(1) + ' m)');

    // 3) aliento de fuego con clic izquierdo
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    await wait(700);
    const glow = d.model.glowValue ?? 0;
    await wait(500);
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    out.push('INFO — brillo de boca durante aliento: ' + glow.toFixed(2));
    let instFlames = 0;
    g.engine.scene.traverse((o) => { if (o.name === 'flame_fx_instanced' && o.isInstancedMesh) instFlames++; });
    out.push((instFlames >= 1 ? 'PASS' : 'FAIL') + ' — pool instanciado de llamas (' + instFlames + ' mesh)');
    let legacy = 0;
    g.engine.scene.traverse((o) => { if (o.name === 'flame_fx_transient') legacy++; });
    out.push((legacy === 0 ? 'PASS' : 'FAIL') + ' — cero llamas legacy (' + legacy + ')');

    // 4) descenso con MAYÚS hasta aterrizar
    press('ShiftLeft', 'Shift');
    let landed = d.flying === false;
    for (let i = 0; i < 26 && !landed; i++) { await wait(500); landed = d.flying === false; }
    release('ShiftLeft');
    out.push((landed ? 'PASS' : 'FAIL') + ' — MAYÚS desciende y aterriza (flying=' + d.flying + ', y=' + d.pos.y.toFixed(1) + ')');

    // 5) HUD de montura muestra el dragón
    const m = window.__kotfsStoreGet().mount;
    out.push((m && m.horseName ? 'PASS' : 'FAIL') + ' — HUD de montura: ' + (m ? m.horseName + ' · ' + m.gait + ' · ' + m.speedKmh + ' km/h' : 'null'));

    // 6) desmontar
    const dis = g.dragons.dismountDragon();
    g.rig.setMountMode(false);
    out.push((dis && g.dragons.ridingId === null ? 'PASS' : 'FAIL') + ' — desmontar (ridingId=' + g.dragons.ridingId + ')');
    out.push((dis && !dis.ridden && !dis.aggro ? 'PASS' : 'FAIL') + ' — dragón dócil tras desmontar');
  } catch (e) {
    out.push('EXCEPTION: ' + (e && e.message ? e.message : String(e)));
  }
  window.__sondaA = out;
})();
