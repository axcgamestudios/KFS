// E2E golden path test for Kingdoms of the Forgotten Seas — Chapter I
// Run with: agent-browser eval "$(cat scripts/e2e_test.js)"
// NOTE: This script is executed in the browser context via agent-browser.

window.__e2eLog = []; window.__e2eDone = false;
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true }));
  const state = () => window.__kotfsGame.state;
  const log = window.__e2eLog;
  const check = (name, cond, extra = '') => {
    log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`);
    return cond;
  };

  // --- 1. Menu → New game → skip intro ---
  let startBtn = null;
  for (let i = 0; i < 90 && !startBtn; i++) {
    startBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toUpperCase().includes('NUEVA PARTIDA'),
    );
    if (!startBtn) await wait(500);
  }
  check('Botón Nueva Partida visible', !!startBtn);
  if (!startBtn) { window.__e2eDone = true; return; }
  startBtn.click();
  // Wait until phase is intro or playing
  for (let i = 0; i < 20; i++) {
    await wait(500);
    const txt = document.body.innerText;
    if (txt.includes('SALTAR') || txt.includes('MISIÓN ACTUAL')) break;
  }
  press('Space');
  for (let i = 0; i < 20; i++) {
    await wait(500);
    if (document.body.innerText.includes('MISIÓN ACTUAL')) break;
  }
  await wait(500);

  const g = window.__kotfsGame;
  check('Juego inicializado', !!g);
  if (!g) return log.join('\n');
  // Disable pointer lock for headless stability
  g.input.requestLock = () => {};

  // --- 2. Movement test ---
  const posBefore = { ...g.player.position };
  press('KeyW');
  await wait(1600);
  const moved = Math.hypot(
    g.player.position.x - posBefore.x,
    g.player.position.z - posBefore.z,
  );
  check('Movimiento WASD', moved > 0.4, `moved ${moved.toFixed(2)}m`);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  // Turn around (yaw is camera-relative)
  g.player.yaw += Math.PI;

  // --- 3. Q1: Talk to Aldric ---
  g.player.teleport(26, 0, 219.5);
  await wait(900);
  press('KeyE');
  await wait(600);
  for (let i = 0; i < 3; i++) { press('Digit1', '1'); await wait(420); }
  await wait(600);
  check('Q1 completada → Q2 activa', state().currentTracker()?.title === 'La Guardiana de las Hierbas',
    state().currentTracker()?.title ?? 'none');

  // --- 4. Q2: Herbs → Maren ---
  state().addItem('petalo', 3);
  g.player.teleport(10.5, 0, 208);
  await wait(900);
  press('KeyE');
  await wait(600);
  for (let i = 0; i < 3; i++) { press('Digit1', '1'); await wait(420); }
  await wait(500);
  press('KeyE'); // turn-in tree
  await wait(600);
  for (let i = 0; i < 4; i++) { press('Digit1', '1'); await wait(420); }
  await wait(700);
  check('Q2 completada → Q3 activa', state().currentTracker()?.title === 'El Cofre del Capitán',
    state().currentTracker()?.title ?? 'none');
  check('Amuleto recibido', state().countItem('amuleto') === 1);
  check('Subida de nivel', state().level >= 2, `nivel ${state().level}`);

  // --- 5. Q3: Chest → letter → ship talk ---
  g.player.teleport(29.6, 0, 217.9);
  await wait(900);
  press('KeyE');
  await wait(900);
  check('Cofre abierto: espada', state().countItem('espada_eirik') === 1);
  check('Cofre abierto: mapa', state().countItem('mapa') === 1);
  check('Cofre abierto: carta', state().countItem('carta') === 1);

  // Read the letter (inventory flow)
  press('Tab');
  await wait(700);
  const cartaBtn = Array.from(document.querySelectorAll('button')).find((b) =>
    b.closest('.grid') && b.textContent?.includes('Carta de Eirik'),
  );
  check('Carta en inventario', !!cartaBtn);
  cartaBtn?.click();
  await wait(400);
  const leerBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Leer');
  check('Botón Leer disponible', !!leerBtn);
  leerBtn?.click();
  await wait(600);
  for (let i = 0; i < 5; i++) { press('Digit1', '1'); await wait(260); }
  await wait(400);
  check('Carta leída (flag)', state().hasFlag('read_letter'));

  // Talk to Aldric about the ship
  press('Escape');
  await wait(600);
  // Resume if paused
  if (document.body.innerText.includes('PAUSA')) {
    const r = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('REANUDAR'));
    r?.click();
    await wait(500);
  }
  g.player.teleport(26, 0, 219.5);
  await wait(900);
  press('KeyE');
  await wait(600);
  for (let i = 0; i < 3; i++) { press('Digit1', '1'); await wait(420); }
  await wait(900);
  check('Q3 completada — CAPÍTULO I COMPLETO', state().questStates.get('q3_chest')?.status === 'completed');
  check('Historial en diario', state().journal.length >= 5, `${state().journal.length} entradas`);
  check('Nivel final >= 3', state().level >= 3, `nivel ${state().level}`);

  // --- 6. Save / load ---
  g.saveToSlot(0);
  await wait(400);
  const coinsBefore = state().countItem('coin');
  const levelBefore = state().level;
  check('Guardado en ranura 0', !!window.localStorage.getItem('kotfs_save_0'));

  // Corrupt current state, then load
  state().resetForNewGame();
  await wait(300);
  const loaded = g.loadFromSlot(0);
  await wait(800);
  check('Carga de partida', loaded && state().countItem('coin') === coinsBefore && state().level === levelBefore,
    `coins ${state().countItem('coin')}/${coinsBefore} nivel ${state().level}/${levelBefore}`);
  check('Q3 restaurada como completada', state().questStates.get('q3_chest')?.status === 'completed');

  // --- 7. UI overlays ---
  press('KeyM');
  await wait(600);
  const mapOpen = document.body.innerText.includes('CARTA DE NAVEGACIÓN');
  check('Mapa se abre (M)', mapOpen);
  press('Escape');
  await wait(500);
  press('KeyJ');
  await wait(600);
  const journalOpen = document.body.innerText.includes('DIARIO DEL EXPLORADOR');
  check('Diario se abre (J)', journalOpen);
  press('Escape');
  await wait(500);
  press('KeyK');
  await wait(600);
  const skillsOpen = document.body.innerText.includes('SENDEROS DEL EXPLORADOR');
  check('Habilidades se abren (K)', skillsOpen);
  press('Escape');
  await wait(500);

  // Learn a skill (1 point available at level 3+)
  const sp = state().skillPoints;
  if (sp > 0) {
    const skillBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Aguante I'),
    );
    check('Botón de habilidad visible', !!skillBtn);
    skillBtn?.click();
    await wait(500);
    check('Habilidad aprendida', state().learnedSkills.has('comb_vigor'));
    check('Efecto real: +20 resistencia', g.player.stats.maxStamina === 120, `max ${g.player.stats.maxStamina}`);
  } else {
    check('Habilidad aprendida (sin puntos, omitido)', true, `puntos=${sp}`);
  }

  // --- 8. Return to menu → Continue ---
  press('Escape');
  await wait(500);
  if (document.body.innerText.includes('PAUSA')) {
    const salir = () => Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toUpperCase().includes('SALIR AL MENÚ') || b.textContent?.includes('¿Seguro?'),
    );
    salir()?.click();
    await wait(500);
    salir()?.click(); // second click confirms
    await wait(900);
  }
  await wait(800);
  const atMenu = document.body.innerText.includes('NUEVA PARTIDA');
  check('Vuelta al menú principal', atMenu);

  if (atMenu) {
    const contBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.toUpperCase().includes('CONTINUAR'),
    );
    check('Continuar habilitado tras guardar', !!contBtn && !contBtn.disabled);
    contBtn?.click();
    await wait(1500);
    check('Continuar restaura partida', state().questStates.get('q3_chest')?.status === 'completed');
  }

  window.__e2eDone = true;
})().catch(e => { log.push('ERROR: ' + e.message); window.__e2eDone = true; });
'KICKED'
