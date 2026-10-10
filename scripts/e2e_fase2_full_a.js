// E2E Fase 2 — Part A (full): boot → A/D fix → Q1..Q4 → launch. Results in window.__kotfsE2ELog.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  window.__kotfsE2ELog = log;

  // Wait for the menu buttons
  for (let i = 0; i < 40; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(500);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); return 'abort'; }
  g.input.requestLock = () => {};
  const state = () => g.state;

  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Nueva partida disponible', !!startBtn);
  startBtn.click();
  await wait(2400);
  press('Space');
  await wait(1200);
  check('Q1 activa tras intro', state().currentTracker()?.title === 'El Legado de Eirik', state().currentTracker()?.title ?? 'none');

  // --- A/D direction bugfix ---
  g.rig.yaw = 0;
  g.rig.snapBehind(g.player.position);
  const p0 = { x: g.player.position.x, z: g.player.position.z };
  press('KeyD'); await wait(1000);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
  const dxD = g.player.position.x - p0.x;
  check('D mueve a la derecha en pantalla', dxD < -0.35, `dx=${dxD.toFixed(2)}`);
  const p1 = { x: g.player.position.x, z: g.player.position.z };
  press('KeyA'); await wait(1000);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
  const dxA = g.player.position.x - p1.x;
  check('A mueve a la izquierda en pantalla', dxA > 0.35, `dx=${dxA.toFixed(2)}`);

  const goNpc = async (id, presses) => {
    const npc = g.npcs.find((n) => n.def.id === id);
    g.player.teleport(npc.position.x, 0, npc.position.z + 0.9);
    await wait(850);
    press('KeyE', 'e');
    await wait(700);
    for (let i = 0; i < presses; i++) { press('Digit1', '1'); await wait(430); }
    await wait(600);
  };

  // --- Q1: Aldric ---
  await goNpc('aldric', 3);
  check('Q2 activa', state().currentTracker()?.title === 'La Guardiana de las Hierbas', state().currentTracker()?.title ?? 'none');

  // --- Q2: Maren (intro then turn-in) ---
  state().addItem('petalo', 4);
  await goNpc('maren', 4);
  await wait(300);
  await goNpc('maren', 4);
  check('Amuleto recibido', state().hasItem('amuleto'));
  check('Q3 activa', state().currentTracker()?.title === 'El Cofre del Capitán', state().currentTracker()?.title ?? 'none');

  // --- Q3: chest → letter → Aldric ship talk ---
  const chest = g.world.chests.find((c) => c.id === 'chest_eirik');
  g.player.teleport(chest.pos.x, 0, chest.pos.z + 1.2);
  await wait(850); press('KeyE', 'e'); await wait(850);
  check('Cofre de Eirik abierto', state().hasItem('espada_eirik'));
  state().setFlag('read_letter');
  await goNpc('aldric', 4);
  check('Q4 (Viento en las Velas) activa', state().currentTracker()?.title === 'Viento en las Velas', state().currentTracker()?.title ?? 'none');

  // --- Q4: Bram talk → materials → delivery ---
  await goNpc('bram', 3);
  check('Bram habla del reacondicionamiento', state().questStates.get('q4_refit')?.objectives.has('o1'));
  state().addItem('madera', 4);
  state().addItem('lona', 3);
  state().addItem('cuerda', 2);
  g.player.teleport(31, 2, 244);
  await wait(900); press('KeyE', 'e'); await wait(1800);
  check('Barco reparado (flag)', state().hasFlag('ship_repaired'));
  check('Colibrí dinámico desplegado', !!g.naval.playerShip);
  await wait(600);
  check('Barco estático oculto', g.world.village.staticShip.visible === false);
  const shipY = g.naval.playerShip?.group.position.y;
  check('Colibrí flotando', shipY > -0.6 && shipY < 1.3, `y=${shipY?.toFixed(2)}`);
  check('Q5 activa', state().currentTracker()?.title === 'El Cuervo de Tres Cabezas', state().currentTracker()?.title ?? 'none');
  check('Habilidad nav_marino aprendible', state().canLearn('nav_marino') === true);
  check('NPCs paseando (máquina de estados)', typeof g.npcs[0].update === 'function' && g.npcs.length >= 8, `${g.npcs.length} NPCs`);

  log.push('PART-A-DONE');
  return 'done';
})()
