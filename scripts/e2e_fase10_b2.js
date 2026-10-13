// E2E FASE 10-B2 — repetición con pointerLocked forzado: combate contra el
// bandido + marometa verificada POR FOTOGRAMAS (frame-stepped).
(async () => {
  try {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = [];
  const mark = (s) => { window.__f10b2 = s; };
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  const g = window.__kotfsGame;
  const p = g.player;
  const state = () => g.state;

  // ---- armar el entorno de prueba ----
  g.input.pointerLocked = true;   // ← los clics ya registran ataques
  g.input.requestLock = () => {};
  p.health = 100;
  p.stamina = 100;

  // ------------------------------------------------------------
  // 1. MAROMETA — muestreo por fotogramas
  // ------------------------------------------------------------
  mark('marometa');
  for (let i = 0; i < 12 && !p.grounded; i++) await wait(150);
  await wait(400);
  p.stamina = 100;
  // primer salto
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
  await wait(500); // un frame a ~1 fps
  const air1 = !p.grounded;
  // segundo salto (marometa)
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
  let maxRot = 0;
  let sawFlip = false;
  for (let i = 0; i < 14; i++) {
    await wait(650);
    maxRot = Math.max(maxRot, Math.abs(p.model.root.rotation.x));
    if (p.flipT > 0) sawFlip = true;
    if (p.flipT === 0 && maxRot > 3) break;
  }
  check('Primer salto: en el aire', air1);
  check('Marometa detectada (flipT > 0 en algún frame)', sawFlip);
  check('Cuerpo dio la vuelta completa (rot > 3 rad)', maxRot > 3, `max=${maxRot.toFixed(2)}`);
  let settled = false;
  for (let i = 0; i < 10; i++) {
    await wait(600);
    if (p.flipT === 0 && Math.abs(p.model.root.rotation.x) < 0.5) { settled = true; break; }
  }
  check('Marometa completada y cuerpo derecho', settled, `flipT=${p.flipT.toFixed(2)}, rot=${p.model.root.rotation.x.toFixed(2)}`);
  // triple salto bloqueado (en el suelo, ya reposicionado)
  p.stamina = 100;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
  await wait(700);
  const jumpsAfterGround = p.jumpsUsed;
  check('Salto tras aterrizar reinicia la cuenta (1)', jumpsAfterGround === 1 || p.jumpsUsed === 0, `jumps=${jumpsAfterGround}`);

  // ------------------------------------------------------------
  // 2. COMBATE CONTRA BANDIDO (pointerLocked)
  // ------------------------------------------------------------
  mark('fight');
  p.health = 100;
  const coins0 = state().countItem('coin');
  // espada equipada + tier 2 (de la fase B)
  const banditsArr = g.bandits.bandits || [];
  let target = null;
  for (const b of banditsArr) { if (!b.dead && b.group.visible) { target = b; break; } }
  check('Objetivo bandido', !!target);
  const mdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  const mup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  let hitSeen = false;
  const hp0 = target ? target.hp : 0;
  if (target) {
    for (let i = 0; i < 22 && !target.dead; i++) {
      const ty = g.world.terrainHeight.height(target.pos.x, target.pos.z);
      p.teleport(target.pos.x, ty, target.pos.z - 1.65);
      p.yaw = Math.atan2(target.pos.x - p.position.x, target.pos.z - p.position.z);
      p.group.rotation.y = p.yaw;
      p.stamina = 100;
      mdown();                       // golpe ligero al instante
      await wait(900);               // ~1 frame para el swing completo
      mup();
      await wait(700);               // recovery
      if (target.hp < hp0) hitSeen = true;
    }
    await wait(900);
    check('Golpes conectando (hp baja)', hitSeen, `hp ${hp0}→${target.hp}`);
    check('Bandido abatido', target.dead, `hp=${target.hp}`);
    check('Botín: monedas ganadas', state().countItem('coin') > coins0, `+${state().countItem('coin') - coins0}`);
    // el bandito muerto cae y se hunde
    let rotFalling = false;
    for (let i = 0; i < 6; i++) {
      await wait(700);
      if (Math.abs(target.group.rotation.x) > 0.5) { rotFalling = true; break; }
    }
    check('Bandido cae al morir (rotación)', rotFalling, `rot=${target.group.rotation.x.toFixed(2)}`);
  }

  // ------------------------------------------------------------
  // 3. Bloqueo con escudo sigue funcionando (regresión)
  // ------------------------------------------------------------
  mark('block');
  const rdown = () => window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  const rup = () => window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  rdown();
  await wait(800);
  const blocking = p.blocking;
  const blockT = p.blockT;
  rup();
  await wait(600);
  check('Bloqueo con RMB activo', blocking && blockT > 0.3, `blockT=${blockT.toFixed(2)}`);

  g.input.pointerLocked = false;
  window.__kotfsE2ELogB2 = log;
  mark('done');
  return 'done';
  } catch (e) {
    const log = window.__kotfsE2ELogB2 || [];
    log.push('FAIL — EXCEPCION: ' + e.message);
    window.__kotfsE2ELogB2 = log;
    window.__f10b2 = 'error';
    return 'error';
  }
})()
