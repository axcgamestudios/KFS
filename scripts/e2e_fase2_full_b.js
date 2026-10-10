// E2E Fase 2 — Part B (v3): low-quality mode for headless FPS, longer windows.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  window.__kotfsE2ELogB = log;
  const g = window.__kotfsGame;
  const state = () => g.state;
  const naval = g.naval;
  const ship = naval.playerShip;
  g.input.requestLock = () => {};

  // Low quality → headless runs faster (also proves live settings changes)
  g.engine.applyQuality('low');
  await wait(400);

  // --- 1. Board the Colibrí ---
  g.dialogue.close();
  naval.playerSailing = false;
  g.player.teleport(ship.pos.x + 4, 0, ship.pos.z);
  await wait(1400);
  press('KeyE', 'e');
  await wait(1200);
  check('Embarque: jugador al timón', naval.playerSailing === true);
  check('Cámara en modo barco', g.rig.shipTarget === ship);

  // Open water, downwind for a deterministic run
  ship.heading = 2.4;
  ship.pos.set(60, 0, 420);
  g.player.teleport(ship.pos.x, 2, ship.pos.z);

  // --- 2. Raise sails ---
  press('KeyW'); await wait(160);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  await wait(160);
  press('KeyW'); await wait(160);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  await wait(9000);
  check('Velas a tope', ship.sailState === 2, `sail=${ship.sailState}`);
  check('Navegación con viento favorable', Math.abs(ship.speed) > 1.2, `v=${Math.abs(ship.speed).toFixed(2)} m/s`);
  check('HUD náutica activa', document.body.innerText.includes('NUDOS'));

  // --- 3. Rudder ---
  g.dialogue.close();
  const h0 = ship.heading;
  press('KeyD');
  await wait(9000);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
  let dHead = Math.abs(ship.heading - h0) % (Math.PI * 2);
  if (dHead > Math.PI) dHead = Math.PI * 2 - dHead;
  check('Timón gira el barco (D)', dHead > 0.25, `Δ${(dHead * 180 / Math.PI).toFixed(0)}°`);

  // --- 4. Cannons ---
  g.input.pointerLocked = true;
  await wait(200);
  window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  await wait(100);
  window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  await wait(600);
  window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
  await wait(100);
  window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
  await wait(1000);
  check('Bordada de babor disparada', ship.cdPort > 0, `cd=${ship.cdPort.toFixed(1)}s`);
  check('Bordada de estribor disparada', ship.cdStar > 0, `cd=${ship.cdStar.toFixed(1)}s`);

  // --- 5. Crow Isle waters → Q5 obj1 ---
  ship.pos.set(-480, 0, -350);
  await wait(2600);
  check('Q5 obj1: aguas del Cuervo Viejo', state().hasFlag('reached_crow'));

  // --- 6. Cripple & board the Gaviota ---
  const morwen = naval.enemies.find((b) => b.ship.id === 'gaviota');
  morwen.ship.pos.set(ship.pos.x + 9, 0, ship.pos.z);
  morwen.ship.hullHp = 18;
  ship.speed = 0; // heave to next to the prize
  ship.sailState = 0;
  await wait(1600);
  check('Gaviota tocada (abordable)', morwen.ship.crippled === true);
  let boarded = false;
  for (let attempt = 0; attempt < 6 && !boarded; attempt++) {
    press('KeyE', 'e');
    await wait(900);
    boarded = naval.boardingActive;
  }
  check('Abordaje iniciado', boarded === true);
  // Dismiss the two lore pages
  press('Digit1', '1'); await wait(600);
  press('Digit1', '1'); await wait(600);
  g.dialogue.close();
  await wait(400);

  // --- 7. Deck fight (real LMB swings; low fps needs long windows) ---
  state().equip('espada_eirik');
  g.player.model.setEquippedState(true);
  // Softer crew for the slow headless clock (mechanics identical)
  if (naval.boarding) naval.boarding.crew.forEach((c) => { c.hp = 24; });
  let swings = 0;
  for (let round = 0; round < 14 && naval.boardingActive; round++) {
    const enemy = naval.boardingShip;
    g.player.yaw = enemy.heading + Math.PI + (round % 4) * (Math.PI / 2);
    if (g.player.attackT === 0) {
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      await wait(90);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      swings++;
    }
    await wait(2100);
    if (g.player.health < 45) g.player.health = 95;
  }
  check('Tripulación derrotada', naval.boardingActive === false, `swings=${swings}`);
  check('Morwen derrotada (flag)', state().hasFlag('morwen_defeated'));
  check('Sello de la Orden recuperado', state().hasItem('sello'));
  await wait(1800);
  check('Q5 completada (Capítulo II completo)', state().isQuestCompleted('q5_raven'));
  check('Gaviota hundiéndose', morwen.ship.sinking > 0 || morwen.ship.sunk);
  check('Jugador de vuelta al timón', naval.playerSailing === true);

  // --- 8. Anchor ---
  press('Space'); await wait(700);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  check('Ancla fondeada', ship.anchored === true);
  press('Space'); await wait(600);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));

  // --- 9. Graphics settings live (low → ultra) ---
  const lowOk = g.engine.renderer.shadowMap.enabled === false && g.engine.renderer.getPixelRatio() < 1.0;
  g.engine.applyQuality('ultra');
  await wait(500);
  const ultraOk = g.engine.renderer.shadowMap.enabled === true && g.engine.renderer.getPixelRatio() >= 1.0;
  check('Ajustes gráficos aplican en vivo', lowOk && ultraOk, `low=${lowOk} ultra=${ultraOk}`);

  // --- 10. Save / load with naval state ---
  const ok = g.saveToSlot(0);
  await wait(800);
  const raw = JSON.parse(localStorage.getItem('kotfs_save_0') || '{}');
  check('Guardado v2 con estado naval', ok && raw.version === 2 && !!raw.naval?.player, `v=${raw.version}`);
  const loaded = g.loadFromSlot(0);
  await wait(1600);
  check('Carga restaura el Colibrí', loaded && !!g.naval.playerShip, `x=${g.naval.playerShip?.pos.x.toFixed(0)}`);
  check('Sello persiste tras cargar', state().hasItem('sello'));
  check('Q5 sigue completada tras cargar', state().isQuestCompleted('q5_raven'));

  log.push('PART-B-DONE');
  return 'done';
})()
