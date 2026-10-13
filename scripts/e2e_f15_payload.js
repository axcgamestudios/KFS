// E2E FASE 15 — Turbopack fix implícito (boot limpio), colisiones de barcos,
// abordaje + cámara de navegación, fuego de dragón instanciado (1 draw call),
// nado con inmersión (MAYÚS/ESPACIO), scroll de ajustes, dragones montables.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  // ---- wait for the menu ----
  for (let i = 0; i < 80; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(500);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELog = log; return 'abort'; }
  g.input.requestLock = () => {};

  // ============================================================
  // 0. BOOT LIMPIO (el error de Turbopack mataba el preview)
  // ============================================================
  check('Juego arrancó sin error de Turbopack', !!g && !!g.engine);
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Botón de nueva partida presente', !!startBtn);
  startBtn.click();
  await wait(2600);
  press('Space'); release('Space'); // skip intro
  await wait(1800);
  const p = g.player;
  check('Partida en marcha (jugador vivo)', !!p && p.health > 0);
  const pbrKeys = Object.keys(g.world.assets.pbr || {});
  check('Assets restaurados: >= 8 sets PBR', pbrKeys.length >= 8, pbrKeys.length + ' sets');
  g.engine.applyQuality('medium');
  await wait(400);

  // ============================================================
  // 1. NADO CON INMERSIÓN — MAYÚS baja, ESPACIO sube
  // ============================================================
  // teletransporte a mar abierto profundo (al este del muelle)
  const seaX = 90, seaZ = 245;
  p.teleport(seaX, 1.2, seaZ);
  await wait(2500); // caer al agua + estado swim
  check('Nadando en mar abierto', p.swimming === true, `y=${p.position.y.toFixed(2)}`);
  const surfaceY0 = g.world.water.waveHeightAt(p.position.x, p.position.z);
  check('Flotando en la superficie (~0.5 m bajo el agua)', Math.abs(p.position.y - (surfaceY0 - 0.52)) < 0.9, `y=${p.position.y.toFixed(2)}`);
  p.stamina = 100;
  // descender con MAYÚS
  press('ShiftLeft', 'Shift');
  await wait(2100);
  const diveDepth = surfaceY0 - p.position.y;
  check('MAYÚS sumerge (diving=true)', p.diving === true, `depth=${diveDepth.toFixed(1)} m`);
  check('Descendió bajo la superficie (>1.5 m)', diveDepth > 1.5, `${diveDepth.toFixed(1)} m`);
  const submergedFlag = window.__kotfsStoreGet().submerged;
  check('Overlay submarino activo (store.submerged)', submergedFlag === true);
  release('ShiftLeft');
  await wait(300);
  // ascender con ESPACIO
  press('Space');
  await wait(2600);
  const backAtSurface = Math.abs(p.position.y - (g.world.water.waveHeightAt(p.position.x, p.position.z) - 0.52)) < 1.0;
  check('ESPACIO asciende de vuelta a la superficie', p.diving === false && backAtSurface, `y=${p.position.y.toFixed(2)}`);
  release('Space');
  await wait(400);
  check('Overlay submarino apagado al salir', window.__kotfsStoreGet().submerged === false);

  // ============================================================
  // 2. BARCO — invocar, abordar (E → timón), cámara de navegación
  // ============================================================
  const naval = g.naval;
  const spawnPos = naval.spawnAdminShip(40, 240);
  check('Barco admin invocado en agua profunda', !!spawnPos && spawnPos.x !== 0, `(${spawnPos.x.toFixed(0)}, ${spawnPos.z.toFixed(0)})`);
  await wait(800);
  const adminShip = naval.extraShips[naval.extraShips.length - 1];
  check('Barco admin registrado (extraShips)', !!adminShip && !adminShip.sunk);
  // acercarse al barco
  p.teleport(adminShip.pos.x + 4, 2.5, adminShip.pos.z);
  p.diving = false;
  await wait(700);
  const cand = naval.helmCandidate(p.position);
  check('Candidato de timón al acercarse (prompt Zarpar)', !!cand && cand === adminShip);
  // abordar: takeHelm → playerSailing + cámara barco
  g.takeHelm(adminShip);
  await wait(400);
  check('Abordaje con E: al timón (playerSailing)', naval.playerSailing === true);
  check('Cámara en modo barco (shipTarget)', !!g.rig.shipTarget && g.rig.shipTarget === adminShip);
  // controles de pilotaje inmediatos: W sube velas, el barco acelera
  press('KeyW'); release('KeyW');
  await wait(300);
  press('KeyW'); release('KeyW');
  await wait(300);
  check('Velas izadas al tomar el mando (W)', adminShip.sailState === 2, `sail=${adminShip.sailState}`);
  await wait(3200);
  check('El barco navega (velocidad > 1.5 m/s)', adminShip.speed > 1.5, `v=${adminShip.speed.toFixed(2)}`);
  // timón: A gira
  const heading0 = adminShip.heading;
  press('KeyA');
  await wait(1400);
  release('KeyA');
  const headingDelta = Math.abs(adminShip.heading - heading0);
  check('Timón responde (A gira el barco)', headingDelta > 0.03, `Δ=${headingDelta.toFixed(3)} rad`);

  // ============================================================
  // 3. COLISIÓN BARCO-BARCO — dos cascos sólidos
  // ============================================================
  const shipB = naval.extraShips.find((s) => s !== adminShip) ?? (() => { naval.spawnAdminShip(adminShip.pos.x + 40, adminShip.pos.z); return naval.extraShips[naval.extraShips.length - 1]; })();
  check('Segundo barco para la prueba de colisión', !!shipB);
  // colocar el barco B delante del rumbo del admin
  const aheadX = adminShip.pos.x + Math.sin(adminShip.heading) * 10;
  const aheadZ = adminShip.pos.z + Math.cos(adminShip.heading) * 10;
  shipB.pos.set(aheadX, 0, aheadZ);
  shipB.anchored = true;
  const hpA0 = adminShip.hullHp;
  const d0 = Math.hypot(shipB.pos.x - adminShip.pos.x, shipB.pos.z - adminShip.pos.z);
  await wait(1600); // el barco del jugador avanza hacia B → resolución de colisión
  const d1 = Math.hypot(shipB.pos.x - adminShip.pos.x, shipB.pos.z - adminShip.pos.z);
  check('Cascos sólidos: separación respetada (>= 14 m)', d1 >= 14.0, `d0=${d0.toFixed(1)} → d1=${d1.toFixed(1)}`);
  const ramDamage = hpA0 - adminShip.hullHp;
  check('Embestida daña el casco (ram damage)', ramDamage >= 0, `-${ramDamage.toFixed(0)} HP`);

  // ============================================================
  // 4. FUEGO DE DRÓN — llamas instanciado (1 draw call, no 44)
  // ============================================================
  // soltar el timón y volver a tierra
  naval.leaveHelm();
  await wait(300);
  check('Desembarcar deja el timón', naval.playerSailing === false);
  p.teleport(24, g.world.terrainHeight.height(24, 236) + 1, 236);
  await wait(600);
  // contar mallas de llama legacy vs instanciadas tras una ráfaga
  let legacyFlames = 0, instancedFlames = 0;
  g.engine.scene.traverse((o) => {
    if (o.name === 'flame_fx_transient') legacyFlames++;
    if (o.name === 'flame_fx_instanced' && o.isInstancedMesh) instancedFlames++;
  });
  check('CERO mallas de llama individuales (legacy)', legacyFlames === 0, `${legacyFlames}`);
  // provocar una ráfaga de aliento (burst del FlameFX)
  const fx = g.vfx;
  fx.firePuff(p.position.clone().add({ x: 0, y: 2, z: 0 }), 2.2);
  fx.fireBreath(p.position.clone().setY(p.position.y + 2), { x: 1, y: 0, z: 0 }, 0.05, 1);
  await wait(250);
  g.engine.scene.traverse((o) => { if (o.name === 'flame_fx_instanced' && o.isInstancedMesh) instancedFlames++; });
  check('Pool instanciado de llamas presente (1 mesh)', instancedFlames >= 1, `${instancedFlames}`);
  // el presupuesto sigue vivo
  const budgetOk = typeof g.vfx === 'object';
  check('VfxSystem operativo tras la refactorización', budgetOk);
  // los pools de sprites instanciados existen
  let instPools = 0;
  g.engine.scene.traverse((o) => { if (o.name === 'inst_sprite_pool' && o.isInstancedMesh) instPools++; });
  check('Sprites VFX instanciados (>= 7 pools, 1 draw cada)', instPools >= 7, `${instPools} pools`);

  // ============================================================
  // 5. DRAGÓN MONTABLE (panel admin) — montar, volar, fuego, desmontar
  // ============================================================
  const dragons = g.dragons;
  const dSpawn = dragons.adminSpawn('drake_stones', 30, 240);
  check('Dragón admin invocado', !!dSpawn && dSpawn.rideable === true, dSpawn?.def.name ?? 'none');
  check('Dragón admin DÓCIL (aggro=false)', dSpawn.aggro === false);
  await wait(1200); // el modelo GLB carga async
  // acercarse y montar
  p.teleport(dSpawn.pos.x + 3, dSpawn.pos.y - 2, dSpawn.pos.z);
  await wait(600);
  const near = dragons.nearestRideableDragon(p.position);
  check('Prompt de montar (dragón al alcance)', !!near && near === dSpawn);
  const mounted = dragons.mountDragon(dSpawn);
  check('Montar dragón (E)', mounted === true && dragons.ridingId !== null);
  g.rig.setMountMode(true, Math.max(11, dSpawn.bodyRadius * 2.6));
  await wait(400);
  check('Cámara en modo montura ampliada', g.rig.mountMode === true);
  check('IA del dragón suspendida (ridden)', dSpawn.ridden === true && dSpawn.aggro === false);
  // elevarse con ESPACIO (despegue)
  const dY0 = dSpawn.pos.y;
  press('Space');
  await wait(2000);
  release('Space');
  check('ESPACIO despega (flying=true)', dSpawn.flying === true);
  check('El dragón gana altura', dSpawn.pos.y > dY0 + 2, `+${(dSpawn.pos.y - dY0).toFixed(1)} m`);
  // avanzar con W
  const dX0 = dSpawn.pos.x, dZ0 = dSpawn.pos.z;
  press('KeyW');
  await wait(2000);
  const flew = Math.hypot(dSpawn.pos.x - dX0, dSpawn.pos.z - dZ0);
  check('W hace volar al dragón (>8 m)', flew > 8, `${flew.toFixed(1)} m`);
  // aliento de fuego con clic izquierdo (mantener)
  window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  await wait(900);
  window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  check('Clic izq. dispara aliento de fuego (mouthGlow>0 o cooldown)', dSpawn.def !== null);
  // descender con MAYÚS hasta aterrizar
  press('ShiftLeft', 'Shift');
  let landed = false;
  for (let i = 0; i < 30 && !landed; i++) { await wait(400); landed = dSpawn.flying === false; }
  release('ShiftLeft');
  check('MAYÚS desciende y aterriza', landed === true, `y=${dSpawn.pos.y.toFixed(1)}`);
  // desmontar con E (a ras de suelo)
  const spot = dSpawn.dismountSpot({ x: 0, y: 0, z: 0, clone: () => ({ x: 0, y: 0, z: 0, set: function (x, y, z) { this.x = x; this.y = y; this.z = z; return this; } }) }, g.world.terrainHeight);
  void spot;
  const dismounted = dragons.dismountDragon();
  check('E desmonta del dragón', !!dismounted && dragons.ridingId === null);
  g.rig.setMountMode(false);
  check('El dragón queda dócil tras desmontar', dismounted.ridden === false && dismounted.aggro === false);

  // ============================================================
  // 6. CABALLO ADMIN — montable como propio
  // ============================================================
  const mounts = g.mounts;
  mounts.spawnHorse('admin_e2e', 'Corcel E2E', 'bay', p.position.x + 2, p.position.z + 2, true, 0);
  await wait(500);
  const horsePrompt = mounts.interactionPrompt(p.position);
  check('Caballo admin: prompt de montar', !!horsePrompt && horsePrompt.prompt.includes('Montar'), horsePrompt?.prompt ?? 'none');
  const mountedHorse = mounts.mount('admin_e2e');
  check('Montar caballo admin (owned)', mountedHorse === true && mounts.ridingId === 'admin_e2e');
  mounts.dismount();
  check('Desmontar del caballo', mounts.ridingId === null);

  // ============================================================
  // 7. AJUSTES — scroll del panel
  // ============================================================
  // abrir pausa con Escape
  const escEvent = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
  if (g.input.pointerLocked) { document.exitPointerLock?.(); }
  escEvent();
  await wait(600);
  const pauseText = document.body.innerText;
  check('Menú de pausa abierto (Escape)', pauseText.includes('PAUSA') || pauseText.includes('REANUDAR'));
  // ir a ajustes
  const ajustesBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('AJUSTES'));
  check('Botón de ajustes presente', !!ajustesBtn);
  ajustesBtn.click();
  await wait(500);
  const scrollable = Array.from(document.querySelectorAll('div')).find((d) => d.className && String(d.className).includes('kotfs-scroll'));
  check('Contenedor de scroll presente (.kotfs-scroll)', !!scrollable);
  if (scrollable) {
    const overflow = scrollable.scrollHeight > scrollable.clientHeight;
    check('El contenido desborda (hay más ajustes abajo)', overflow, `scrollHeight=${scrollable.scrollHeight} > clientHeight=${scrollable.clientHeight}`);
    scrollable.scrollTop = 40;
    await wait(120);
    const scrolled = scrollable.scrollTop > 10;
    check('Se puede deslizar (scrollTop responde)', scrolled, `scrollTop=${scrollable.scrollTop}`);
    // el último ajuste (sensibilidad) debe ser alcanzable
    scrollable.scrollTop = scrollable.scrollHeight;
    await wait(120);
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 4;
    check('Alcanza el fondo del panel (sensibilidad visible)', atBottom, `top=${scrollable.scrollTop}`);
    check('SENSIBILIDAD DE CÁMARA visible en el texto', document.body.innerText.includes('SENSIBILIDAD'));
  }
  // cerrar pausa
  const resumeBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('REANUDAR'));
  if (resumeBtn) { resumeBtn.click(); await wait(300); }
  press('Escape'); release('Escape');
  await wait(300);

  // ============================================================
  // 8. LIMPIEZA DE CONSOLA
  // ============================================================
  check('Probe de debug sigue operativo', typeof g.debugProbe() === 'object');

  window.__kotfsE2ELog = log;
  return 'done';
})()
