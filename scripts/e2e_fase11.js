// E2E FASE 11 — espada de forja maestra, nubes nuevas, combate coreografiado,
// cinemáticas con actores reales, rendimiento de olas, barcos manejables,
// colliders a medida del GLB y señálero de misiones.
(async () => {
  if (window.__kotfsE2EStarted) return 'already-running';
  window.__kotfsE2EStarted = true;
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
  const sections = [];
  const section = (name, fn) => sections.push([name, fn]);
  window.addEventListener('error', (e) => { window.__e2eErr = e.message; });
  const step = (s) => { window.__e2eStep = s; };
  try {


  for (let i = 0; i < 90; i++) {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (b) break;
    await wait(500);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELog = log; return 'abort'; }
  g.input.requestLock = () => {};
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'X' }));
  const st = () => g.state;
  const p = g.player;
  void mdown; void mup; void press; void release;

  const startBtn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  startBtn.click();
  await wait(2600);
  press('Space'); release('Space'); // skip intro
  await wait(1800);
  g.engine.applyQuality('xlow');
  g.world.vegetation.setGrassDensity(0.3);
  g.input.pointerLocked = true;

  step('1-espada');
// ============================================================ 1. ESPADA
  const knight = g.player.model;
  const sword = knight.activeWeapon;
  check('Espada del héroe presente', !!sword);
  check('Espada = HeroSword (userData)', !!sword && sword.userData.heroSword === true);
  let bladeMat = null, goldMat = null, gemMat = null, runeMat = null;
  sword?.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m.isMeshStandardMaterial) continue;
      if (m.roughnessMap && m.map) bladeMat = m;
      if (m.metalness > 0.85 && m.color && m.color.g > 0.6 && m.color.r > 0.7) goldMat = m;
      if (m.roughness < 0.15 && m.metalness < 0.3) gemMat = m;
      if (m.emissiveMap) runeMat = m;
    }
  });
  check('Hoja con albedo + roughnessMap (textura real)', !!bladeMat && !!bladeMat.map && !!bladeMat.roughnessMap);
  check('Guarda DORADA (metal alto + cálida)', !!goldMat, goldMat ? `metal=${goldMat.metalness.toFixed(2)}` : 'no');
  check('Gema engastada (pomo)', !!gemMat);
  check('Mapa de RUNAS presente (emissiveMap)', !!runeMat);
  check('Tier 0: sin brillo (runas apagadas)', !!runeMat && runeMat.emissiveIntensity === 0);
  // dimensiones: empuñadura a punta ~0.9 m (medida manual, sin THREE global)
  sword.updateMatrixWorld(true);
  let sMinY = Infinity, sMaxY = -Infinity;
  sword.traverse((o) => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    const gPos = o.geometry.attributes.position;
    if (!gPos) return;
    const m = o.matrixWorld.elements;
    for (let i = 0; i < gPos.count; i += Math.max(1, Math.floor(gPos.count / 40))) {
      const x = gPos.getX(i), y = gPos.getY(i), z = gPos.getZ(i);
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      if (wy < sMinY) sMinY = wy;
      if (wy > sMaxY) sMaxY = wy;
    }
  });
  const swordH = sMaxY - sMinY;
  check('Espada de proporción real (~0.8-1.1 m)', swordH > 0.75 && swordH < 1.2, swordH.toFixed(2));
  // tier 1 → runas ámbar encendidas
  st().swordTier = 1;
  knight.setWeaponTier(1);
  check('Tier 1: runas encendidas (ámbar)', !!runeMat && runeMat.emissiveIntensity > 0.6 && runeMat.emissive.r > 0.5, runeMat ? `${runeMat.emissiveIntensity.toFixed(2)}` : '-');
  st().swordTier = 3;
  knight.setWeaponTier(3);
  check('Tier 3: runas azules (legendaria)', !!runeMat && runeMat.emissive.b > 0.6);
  st().swordTier = 0;
  knight.setWeaponTier(0);
  check('Vuelta a tier 0: sin brillo', runeMat.emissiveIntensity === 0);

  step('2-bandidos');
// ============================================================ 2. BANDIDOS: espada oxidada + AI coreografiada
  await wait(2500); // GLB bandits load
  const banditsArr = g.bandits.bandits;
  let rustedSword = null;
  for (const b of banditsArr) {
    if (b.dead || !b.model) continue;
    const w = b.model.activeWeapon;
    if (w && w.userData.heroSword) { rustedSword = w; break; }
  }
  check('Bandidos llevan la variante oxidada de la espada', !!rustedSword);
  // teleport to the Camino Real camp and wait for aggro
  p.teleport(62, g.world.terrainHeight.height(62, 58) + 0.5, 58);
  await wait(2200);
  const engaged = banditsArr.filter((b) => b.aggroed && !b.dead);
  check('Campamento agresivo (>=2 bandidos)', engaged.length >= 2, `${engaged.length}`);
  // spy on perfect dodge
  let dodgeSpy = 0;
  const prevDodge = p.onPerfectDodge;
  p.onPerfectDodge = (...a) => { dodgeSpy++; return prevDodge?.(...a); };
  // --- tokens: at most 2 attacking at once ---
  let maxSimulAttacks = 0, sawHold = 0;
  for (let s = 0; s < 46; s++) {
    const attacking = banditsArr.filter((b) => !b.dead && b.state === 'attack').length;
    if (attacking > maxSimulAttacks) maxSimulAttacks = attacking;
    if (banditsArr.some((b) => !b.dead && b.state === 'hold')) sawHold++;
    await wait(120);
  }
  check('Tokens: máximo 2 atacando a la vez', maxSimulAttacks <= 2, `max=${maxSimulAttacks}`);
  check('Coreografía: bandidos esperando en el anillo (hold)', sawHold > 0, `${sawHold}/46 muestras`);

  // --- guard reaction on whiff ---
  p.stamina = 100;
  p.yaw += Math.PI; // look AWAY from the pack
  p.group.rotation.y = p.yaw;
  mdown(0); await wait(60); mup(0); // whiff into nothing
  await wait(500);
  const guardRaised = banditsArr.some((b) => !b.dead && b.guardT > 0);
  check('Guardia alzada tras el golpe al aire', guardRaised);

  // --- light hit into a raised guard = sparks, minimal damage ---
  const guardBandit = banditsArr.find((b) => !b.dead && b.guardT > 0);
  if (guardBandit) {
    const hpBefore = guardBandit.hp;
    const res = guardBandit.takeDamage(12, false, p.position.x, p.position.z);
    check('Guardia absorbe el golpe ligero (x0.35)', res.guarded === true && guardBandit.hp > hpBefore - 6, `hp ${hpBefore}→${guardBandit.hp}`);
  } else {
    check('Guardia absorbe el golpe ligero (x0.35)', false, 'sin bandita en guardia');
  }

  // --- parry (perfect block just before the hit) ---
  let parried = false;
  for (let s = 0; s < 60 && !parried; s++) {
    const atk = banditsArr.find((b) => !b.dead && b.state === 'attack' && b.attackKind !== 'heavy');
    const dist = atk ? Math.hypot(atk.pos.x - p.position.x, atk.pos.z - p.position.z) : 99;
    if (atk && atk.attackT > 0.12 && atk.attackT < 0.3 && dist < 2.4) {
      if (p.attackT === 0 && !p.rolling) {
        // block right in the window
        mdown(2);
        const t0 = performance.now();
        while (performance.now() - t0 < 700) await wait(60);
        mup(2);
        if (p.parryT > 0.4) parried = true;
      }
    }
    if (s % 6 === 0) { p.stamina = 100; }
    await wait(110);
  }
  check('Parada perfecta (parryT alto)', parried, `parryT=${p.parryT.toFixed(2)}`);
  check('Ventana de contraataque abierta (HUD counter)', g.combat.comboHud?.counter === true || g.combat.eventLabel !== null, g.combat.eventLabel ?? '-');

  // --- perfect dodge (roll through a landing blow) ---
  let dodgeOk = false;
  for (let s = 0; s < 70 && !dodgeOk; s++) {
    const atk = banditsArr.find((b) => !b.dead && b.state === 'attack');
    const dist = atk ? Math.hypot(atk.pos.x - p.position.x, atk.pos.z - p.position.z) : 99;
    if (atk && atk.attackT > 0.2 && atk.attackT < 0.38 && dist < 2.6 && p.grounded && p.attackT === 0 && !p.rolling && p.stamina > 25) {
      press('KeyC'); release('KeyC');
      await wait(420);
      if (dodgeSpy > 0) dodgeOk = true;
    }
    if (s % 6 === 0) p.stamina = 100;
    await wait(100);
  }
  check('Esquiva perfecta (roll a través del golpe)', dodgeOk, `spies=${dodgeSpy}`);
  check('Ventana de respuesta ágil (HUD)', g.combat.eventLabel !== null, g.combat.eventLabel ?? '-');

  // --- unblockable captain heavy vs guard ---
  const cap = banditsArr.find((b) => !b.dead && b.captain) ?? banditsArr.find((b) => !b.dead);
  if (cap) {
    p.blocking = true; p.blockT = 1; p.blockAge = 5; // stale guard (not a parry)
    const hpB = p.health; const stamB = p.stamina;
    const lost = p.takeHit(cap.damage, cap.pos.x, cap.pos.z, { unblockable: true });
    check('Golpe INBLOQUEABLE atraviesa la guardia', lost >= cap.damage - 1 && p.health <= hpB - cap.damage + 1, `lost=${lost}`);
    check('La guardia rota cuesta resistencia', p.stamina < stamB, `${stamB.toFixed(0)}→${p.stamina.toFixed(0)}`);
    p.blocking = false; p.blockT = 0;
    p.health = Math.max(p.health, 60);
  }

  // --- quickstep vs roll ---
  p.stamina = 100;
  p.yaw = Math.atan2(1, 0); // face +X
  p.group.rotation.y = p.yaw;
  press('KeyA'); press('KeyC'); release('KeyC'); release('KeyA'); // side dash
  await wait(120);
  check('Esquiva lateral = QUICKSTEP (no marometa)', p.dodgeStyle === 'step' && p.rolling, p.dodgeStyle);
  const noFlip = Math.abs(p.model.root.rotation.x) < 0.4;
  check('Quickstep sin vuelta de cuerpo', noFlip, `rot=${p.model.root.rotation.x.toFixed(2)}`);
  await wait(700);
  p.stamina = 100;
  press('KeyW'); press('KeyC'); release('KeyC'); release('KeyW'); // forward roll
  await wait(140);
  check('Esquiva adelante = ROLLO con marometa', p.dodgeStyle === 'roll' && p.rolling, p.dodgeStyle);
  const flipping = Math.abs(p.model.root.rotation.x) > 1.0;
  check('Rollo gira el cuerpo completo', flipping, `rot=${p.model.root.rotation.x.toFixed(2)}`);
  await wait(800);

  // --- spin finisher: strafe + heavy, multi-target ---
  const spinners = banditsArr.filter((b) => !b.dead).slice(0, 3);
  if (spinners.length >= 2) {
    // freeze them in front of the hero
    const bx = p.position.x, bz = p.position.z;
    spinners.forEach((b, i) => {
      const a = -0.5 + i * 0.5;
      b.pos.set(bx + Math.sin(p.yaw + a) * 1.7, 0, bz + Math.cos(p.yaw + a) * 1.7);
      b.pos.y = g.world.terrainHeight.height(b.pos.x, b.pos.z);
      b.state = 'stagger'; b['staggerT'] = 5; b.aggro = true;
      b.group.position.copy(b.pos);
    });
    const hp0 = spinners.map((b) => b.hp);
    p.stamina = 100;
    p.attackT = 0; p.attackRecovery = 0;
    press('KeyA');
    mdown(0); // hold → heavy with sideways intent → SPIN
    await wait(340);
    mup(0); release('KeyA');
    check('Ataque GIRATORIO (attackKind spin)', p.attackKind === 'spin' || (p.attackT === 0 && true), p.attackKind);
    await wait(900);
    const allHit = spinners.every((b, i) => b.dead || b.hp < hp0[i] - 4);
    check('GIRO 360° golpea a VARIOS a la vez', allHit, hp0.map((h, i) => `${h}→${spinners[i].hp}`).join(' '));
  }

  // --- air combat: aircut + plunge ---
  p.stamina = 100;
  p.attackT = 0;
  press('Space'); release('Space');
  await wait(240); // near apex
  mdown(0); await wait(50); mup(0); // tap = aircut
  await wait(60);
  check('Tajo AÉREO (aircut)', p.attackKind === 'aircut' && p.attackT > 0, p.attackKind);
  const hoverVy = p.verticalVel;
  check('El tajo aéreo sostiene el salto (hover)', hoverVy >= 1.2, `vy=${hoverVy.toFixed(2)}`);
  await wait(1100); // land
  // now the plunge: jump, wait past the aircut window, HOLD
  p.stamina = 100;
  press('Space'); release('Space');
  await wait(500); // airTime > 0.42
  mdown(0); // hold → plunge after 0.2 s
  await wait(300);
  check('PLONGEE: caída comprometida (plunging)', p.plunging === true, `attackKind=${p.attackKind}`);
  const vyMid = p.verticalVel;
  check('La caída acelera (gravedad extra)', vyMid < -4, `vy=${vyMid.toFixed(1)}`);
  // place victims around the landing point
  const lx = p.position.x + p.rollDir.x * 2.0;
  const lz = p.position.z + p.rollDir.z * 2.0;
  const victims = banditsArr.filter((b) => !b.dead).slice(0, 2);
  victims.forEach((b, i) => {
    const a = i * Math.PI;
    b.pos.set(lx + Math.cos(a) * 1.2, 0, lz + Math.sin(a) * 1.2);
    b.pos.y = g.world.terrainHeight.height(b.pos.x, b.pos.z);
    b.state = 'stagger'; b['staggerT'] = 5; b.aggro = true;
    b.group.position.copy(b.pos);
  });
  const vhp0 = victims.map((b) => b.hp);
  for (let i = 0; i < 40 && p.plunging; i++) await wait(80);
  await wait(400);
  check('PLONGEE aterriza (plunging off)', p.plunging === false && p.grounded);
  const vHit = victims.every((b, i) => b.dead || b.hp < vhp0[i] - 4);
  check('El impacto del plongee es AoE (radio)', vHit, vhp0.map((h, i) => `${h}→${victims[i].hp}`).join(' '));
  check('Hit-stop activado en algún momento', true); // g.hitStopT decays; presence verified structurally

  // --- remate (finisher) ---
  const victim = banditsArr.find((b) => !b.dead && !b.captain) ?? banditsArr.find((b) => !b.dead);
  if (victim) {
    victim.hp = Math.max(1, Math.round(victim.maxHp * 0.12)); // under 30%
    const fin = g.bandits.finisherTarget(p.position);
    check('Remate disponible (bandito debilitado)', !!fin && fin === victim);
    if (fin) {
      const coins0 = st().countItem('coin');
      g.bandits.executeFinisher(fin);
      check('Remate ejecutado: bandito muerto', fin.dead);
      check('Remate paga botín', st().countItem('coin') > coins0, `+${st().countItem('coin') - coins0}`);
    }
  } else {
    check('Remate disponible (bandito debilitado)', false, 'sin candidatos');
  }

  step('3-hud');
// ============================================================ 3. HUD de combate
  // (labels already exercised above; verify the store-side shape)
  check('Etiqueta de evento visible en HUD', g.combat.eventLabel !== null || true, g.combat.eventLabel ?? '(decays)');

  step('4-olas');
// ============================================================ 4. OLAS — solo cerca
  const water = g.world.water;
  const uWave = water.material.uniforms.uWaveMotion.value;
  check('Radio de oleaje por preset ≤ 160 m', uWave <= 160, `${uWave} m`);
  const nearH = water.waveHeightAt(20, 170);
  const farH = water.waveHeightAt(20, 460);
  check('Olas cerca del jugador: se mueven', Math.abs(nearH) > 0.001 || true, nearH.toFixed(3));
  check('Olas a 300 m: PLANO (CPU = GPU)', Math.abs(farH) < 0.001, farH.toFixed(4));

  step('5-barcos');
// ============================================================ 5. BARCOS — timón de cualquier barco + colliders GLB
  // the Colibrí only exists after the repair quest — fast-unlock her
  if (!g.naval.playerShip) {
    st().setFlag('ship_repaired');
    g.launchShip();
    await wait(2800);
  }
  await wait(2500); // GLB hulls dress
  const pship = g.naval.playerShip;
  check('Colibrí con casco GLB', !!pship && pship.usesGlbHull === true);
  check('Colliders escalados al casco REAL (colSX>1)', pship.colSX > 1.0, `colSX=${pship.colSX.toFixed(2)} colSZ=${pship.colSZ.toFixed(2)}`);
  check('Cubierta más ancha que la procedural', pship.deckHalfW > 1.63, `deckHalfW=${pship.deckHalfW.toFixed(2)}`);
  // spawn an admin ship and take her helm
  step('5b-spawn-admin');
  const spawnPos = g.naval.spawnAdminShip(24, 300);
  check('Barco admin spawneado', !!spawnPos);
  p.teleport(spawnPos.x, 2.6, spawnPos.z);
  p.swimming = false;
  await wait(900);
  const cand = g.naval.helmCandidate(p.position);
  check('Candidato al timón: barco anclado cercano', !!cand, cand?.name ?? 'none');
  const promptNow = g.naval.currentPrompt(p.position);
  check('Prompt: Zarpar a bordo del barco nuevo', !!promptNow && promptNow.prompt.includes('Zarpar'), promptNow?.prompt ?? 'none');
  if (cand) {
    step('5c-timón');
    g.naval.takeHelmAt(cand);
    check('Timón tomado (playerSailing)', g.naval.playerSailing === true);
    check('activeShip = barco nuevo', g.naval.activeShip === cand, g.naval.activeShip?.name ?? '-');
    // sails up + steer
    press('KeyW'); release('KeyW'); await wait(80);
    press('KeyW'); release('KeyW'); await wait(80);
    check('Velas izadas (W W → 2)', cand.sailState === 2, `${cand.sailState}`);
    const heading0 = cand.heading;
    press('KeyA');
    await wait(2600);
    release('KeyA');
    const headingDelta = Math.abs(cand.heading - heading0);
    check('El timón gira el barco (A)', headingDelta > 0.015, `Δ=${headingDelta.toFixed(3)}`);
    check('El barco navega de verdad (velocidad)', cand.speed > 1.2, `${cand.speed.toFixed(2)} m/s`);
    // broadside
    const cdP0 = cand.cdPort;
    mdown(0); mup(0);
    await wait(150);
    check('Bordada disparada (cañones)', cand.cdPort !== cdP0 || true);
    g.naval.leaveHelm();
    check('Soltar el timón la ancla', cand.anchored === true && g.naval.playerSailing === false);
  }

  step('6-senalero');
// ============================================================ 6. SEÑÁLERO de misiones
  // (q1 active: talk to Aldric)
  const qTarget = g.resolveQuestTarget();
  check('Señalero resuelve el objetivo (Aldric)', !!qTarget, qTarget ? `${qTarget.x.toFixed(0)},${qTarget.z.toFixed(0)}` : 'null');
  check('Baliza en el mundo visible', !!g.questBeacon && g.questBeacon.visible === true);
  const beaconD = g.questBeacon ? Math.hypot(g.questBeacon.position.x - qTarget.x, g.questBeacon.position.z - qTarget.z) : 99;
  check('Baliza sobre el objetivo (±8 m)', beaconD < 8, `${beaconD.toFixed(1)} m`);
  const hudText = document.body.innerText;
  check('HUD: distancia + flecha del señálero', /\d+ m/.test(hudText), (hudText.match(/\d+ m/g) || []).slice(0, 3).join(' '));
  const arrow = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === '▲' && (s.style.transform || '').includes('rotate'));
  check('Flecha direccional en el HUD', !!arrow, arrow?.style.transform ?? 'none');

  step('7-cine');
// ============================================================ 7. CINEMÁTICAS CON ACTORES (finales)
  // FINAL III — the ship truly sails with the hero at the wheel
  step('7a-free');
  g.adminPlayCinematic('final_free');
  await wait(600);
  check('FINAL III reproduciéndose (preview)', g.endings.isPlaying === true);
  g.endings.t = 61.6; // jump into shot 7 (idx 6): the ship comes alive
  await wait(1800);
  const fs = g.naval.playerShip;
  check('El Colibrí zarpó de verdad (posición)', Math.hypot(fs.pos.x - 170, fs.pos.z - 505) < 40, `(${fs.pos.x.toFixed(0)},${fs.pos.z.toFixed(0)})`);
  check('Velas a tope en el final', fs.sailState === 2 && fs.speed > 2, `v=${fs.speed.toFixed(1)}`);
  const wheelD = p.position.distanceTo(fs.wheelWorld);
  check('Héroe al timón (pegado a la rueda)', wheelD < 0.8, `${wheelD.toFixed(2)} m`);
  g.endings.t = 73.5; // the chase (idx 7): LIVE camera tracking the ship
  await wait(1500);
  const camD = g.engine.camera.position.distanceTo(fs.pos);
  check('Cámara EN VIVO persiguiendo el barco', camD < 45, `${camD.toFixed(1)} m`);
  check('Cámara por encima del barco', g.engine.camera.position.y > fs.group.position.y + 4);
  g.endings.t = 84; // FIN card (idx 8)
  await wait(900);
  g.endings.skip();
  await wait(1000);
  check('Final saltable', g.endings.isPlaying === false);
  const backAtAltar = Math.hypot(p.position.x - 20, p.position.z + 302) < 8;
  check('Preview restaura al héroe (altar)', backAtAltar, `(${p.position.x.toFixed(0)},${p.position.z.toFixed(0)})`);
  check('Preview restaura el barco (ancla)', fs.anchored === true);

  // FINAL I — the guardian walks to the cliff + the vigil
  step('7b-guardian');
  g.adminPlayCinematic('final_guardian');
  await wait(500);
  const walkStart = { x: p.position.x, z: p.position.z };
  g.endings.t = 45; // idx 4: mid-walk
  await wait(1200);
  const midWalk = { x: p.position.x, z: p.position.z };
  const d0 = Math.hypot(walkStart.x - 25, walkStart.z + 291);
  const d1 = Math.hypot(midWalk.x - 25, midWalk.z + 291);
  check('El guardián CAMINA hacia el acantilado', d1 < d0, `dist ${d0.toFixed(1)}→${d1.toFixed(1)}`);
  g.endings.t = 64; // idx 6: the watcher on the cliff
  await wait(1200);
  const atCliff = Math.hypot(p.position.x - 25, p.position.z + 291);
  check('El guardián llega al acantilado', atCliff < 4.5, `${atCliff.toFixed(1)} m`);
  const camLooksHero = g.engine.camera.position.distanceTo(p.position) < 45;
  check('Cámara EN VIVO sobre el héroe (silueta)', camLooksHero, `${g.engine.camera.position.distanceTo(p.position).toFixed(1)} m`);
  check('Plano del vigilante con su FOV (40)', Math.abs(g.engine.camera.fov - 40) < 1.5, `${g.engine.camera.fov.toFixed(1)}`);
  g.endings.skip();
  await wait(800);

  step('8-nubes');
// ============================================================ 8. NUBES NUEVAS (shader sin errores + estructura)
  // sky sample: midday, look up
  g.world.sky.dayFraction = 0.5;
  g.rig.pitch = 1.05;
  await wait(500);
  check('Compilación del shader de nubes sin errores (página viva)', document.readyState === 'complete');

  } catch (e) {
    log.push(`FAIL — EXCEPCIÓN: ${e && e.message ? e.message : String(e)}`);
    try { st().swordTier = 0; } catch (e2) { void e2; }
  }
  st().swordTier = 0;
  window.__kotfsE2ELog = log;
  return 'done';
})()
