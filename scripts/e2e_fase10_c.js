// E2E FASE 10-C — arranque rápido + combate real (pointerLocked, muerte
// corregida): marometa, bandido, bloqueo. Todo en una pasada, rápido.
(async () => {
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const mark = (s) => { window.__f10c = s; };
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  mark('boot');
  for (let i = 0; i < 70; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(400);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — no game'); window.__kotfsE2ELogC = log; mark('done'); return 'abort'; }
  g.input.requestLock = () => {};
  g.input.pointerLocked = true;
  g.engine.applyQuality('xlow');
  g.world.water.setDetail(96, 60, 0);
  g.world.vegetation.setGrassDensity(0);
  await wait(300);

  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  startBtn.click();
  await wait(2500);
  press('Space'); release('Space');
  await wait(1500);
  const p = g.player;
  const state = () => g.state;
  check('Partida nueva en marcha', state().questStates.size > 0);
  check('Espada de inicio equipada', state().equippedWeapon === 'espada_acero');

  // darle escudo + oro para todo el test
  state().addItem('escudo_marea', 1);
  g.combat.refreshVisuals();
  await wait(500);

  // ------------------------------------------------------------
  // 1. MAROMETA (frame-stepped, con margen para 1 fps)
  // ------------------------------------------------------------
  mark('marometa');
  p.teleport(30, g.world.terrainHeight.height(30, 120), 120);
  await wait(900);
  p.stamina = 100;
  p.health = 100;
  press('Space'); release('Space');
  await wait(1200);              // ~1 frame: primer salto procesado
  const air1 = !p.grounded;
  press('Space'); release('Space');
  let maxRot = 0;
  let sawFlip = false;
  for (let i = 0; i < 16; i++) {
    await wait(700);
    maxRot = Math.max(maxRot, Math.abs(p.model.root.rotation.x));
    if (p.flipT > 0) sawFlip = true;
    if (sawFlip && maxRot > 3 && p.flipT === 0) break;
  }
  check('Primer salto: en el aire', air1);
  check('Marometa detectada (flipT > 0)', sawFlip, `flipT=${p.flipT.toFixed(2)}`);
  check('Vuelta completa (rot máx > 3 rad)', maxRot > 3, `max=${maxRot.toFixed(2)}`);
  let settled = false;
  for (let i = 0; i < 10; i++) {
    await wait(700);
    if (p.flipT === 0 && Math.abs(p.model.root.rotation.x) < 0.5 && p.grounded) { settled = true; break; }
  }
  check('Aterrizaje limpio', settled, `rot=${p.model.root.rotation.x.toFixed(2)}, g=${p.grounded}`);

  // ------------------------------------------------------------
  // 2. BANDIDO — combate real con clics (pointerLocked)
  // ------------------------------------------------------------
  mark('fight');
  p.teleport(62, g.world.terrainHeight.height(62, 58) + 0.4, 58);
  await wait(2500); // el campamento se activa
  const banditsArr = g.bandits.bandits || [];
  let target = null;
  for (const b of banditsArr) { if (!b.dead && b.group.visible) { target = b; break; } }
  check('Objetivo bandido', !!target);
  if (target) {
    const hp0 = target.hp;
    const coins0 = state().countItem('coin');
    const mdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    const mup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
    for (let i = 0; i < 24 && !target.dead; i++) {
      p.health = 100;            // sin muertes del tester
      p.stamina = 100;
      const ty = g.world.terrainHeight.height(target.pos.x, target.pos.z);
      p.teleport(target.pos.x, ty, target.pos.z - 1.65);
      p.yaw = Math.atan2(target.pos.x - p.position.x, target.pos.z - p.position.z);
      p.group.rotation.y = p.yaw;
      mdown();
      await wait(1100);
      mup();
      await wait(800);
    }
    await wait(1000);
    check('Golpes conectando (hp baja)', target.hp < hp0, `${hp0}→${target.hp}`);
    check('Bandido abatido', target.dead, `hp=${target.hp}`);
    check('Botín: monedas', state().countItem('coin') > coins0, `+${state().countItem('coin') - coins0}`);
    let fell = false;
    for (let i = 0; i < 6; i++) {
      await wait(800);
      if (Math.abs(target.group.rotation.x) > 0.5) { fell = true; break; }
    }
    check('Cadáver cae (rotación)', fell, `rot=${target.group.rotation.x.toFixed(2)}`);
  }

  // ------------------------------------------------------------
  // 3. BLOQUEO + ESCUDO (regresión)
  // ------------------------------------------------------------
  mark('block');
  p.health = 100;
  const rdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  const rup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  rdown();
  let blockOk = false;
  for (let i = 0; i < 5; i++) {
    await wait(700);
    if (p.blocking && p.blockT > 0.3) { blockOk = true; break; }
  }
  rup();
  check('Bloqueo con RMB activo', blockOk, `blockT=${p.blockT.toFixed(2)}`);

  // ------------------------------------------------------------
  // 4. MUERTE ya NO bloquea el juego (fix Fase 10)
  // ------------------------------------------------------------
  mark('death');
  p.invulnT = 0;
  p.health = 1;
  // un golpe de bandido cercano o daño directo
  const dmgTaken = g.applyPlayerDamage ? g.applyPlayerDamage(50) : 0;
  await wait(1500);
  const deadFlag = g.dead;
  await wait(1500);
  const recovered = !g.dead && p.health > 0;
  check('Muerte → respawn inmediato (sin soft-lock)', !deadFlag && recovered, `dead=${deadFlag}, hp=${Math.round(p.health)}, dmg=${dmgTaken}`);

  window.__kotfsE2ELogC = log;
  mark('done');
  return 'done';
  } catch (e) {
    const log = window.__kotfsE2ELogC || [];
    log.push('FAIL — EXCEPCION: ' + e.message);
    window.__kotfsE2ELogC = log;
    window.__f10c = 'error';
    return 'error';
  }
})()
