window.__kotfsE2EBLog = null;
setTimeout(() => {
// E2E FASE 12 — mapa -30% + kits texturizados + árboles + pasto + agua
// (reflexión real + estelas) + dragones + espadas elementales + misiones
// de acción + marcador en pantalla. Corre sobre la partida viva.
  (async () => {
  if (window.__kotfsE2EF12Started) return 'already';
  window.__kotfsE2EF12Started = true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => {
    const ex = extra ? ` [${extra}]` : '';
    log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${ex}`);
  };
  const step = (s) => { window.__e2eStepF12 = s; };
  window.addEventListener('error', (e) => { window.__e2eErrF12 = e.message; });
  try {
    const g = window.__kotfsGame;
    const st = () => g.state;
    const p = g.player;
    if (!g.input.pointerLocked) g.input.pointerLocked = true;
    // ---- start a fresh game if we're at the menu ----
    for (let i = 0; i < 90; i++) {
      const btn = Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
      if (btn || !document.body.innerText.includes('NUEVA PARTIDA')) break;
      await wait(500);
    }
    if (document.body.innerText.includes('NUEVA PARTIDA')) {
      Array.from(document.querySelectorAll('button')).find((x) => x.textContent?.toUpperCase().includes('NUEVA PARTIDA'))?.click();
      await wait(2600);
      press('Space'); release('Space');
      await wait(1800);
    }
    g.engine.applyQuality('low');
    g.world.vegetation.setGrassDensity(0.2);

    // ================= A. MAPA -30% =================
    step('mapa');
    const W = await import('/src/game/world/WorldConfig.ts').catch(() => null);
    // ISLANDS positions via the terrain: crow moved to (-540,-450)?
    const hCrow = g.world.terrainHeight.height(-540, -450);
    const hCrowOld = g.world.terrainHeight.height(-620, -520);
    check('Isla del Cuervo en su NUEVA posición (-540,-450) es tierra', hCrow > 5, `${hCrow.toFixed(1)} m`);
    check('La VIEJA posición (-620,-520) quedó en el mar', hCrowOld < 0, `${hCrowOld.toFixed(1)} m`);
    const hFarNew = g.world.terrainHeight.height(575, 108);
    const hBrumaNew = g.world.terrainHeight.height(-60, 590);
    check('Farallón del Faro en (575,108) es tierra', hFarNew > 3, `${hFarNew.toFixed(1)} m`);
    check('Islas de la Bruma en (-60,590) son tierra', hBrumaNew > 1, `${hBrumaNew.toFixed(1)} m`);
    // the fort chest should sit on land at the new fort position
    const hFort = g.world.terrainHeight.height(-490, -445);
    check('Fortaleza del Cuervo (meseta -490,-445) sobre tierra firme', hFort > 6, `${hFort.toFixed(1)} m`);
    // POIs updated: cala moved
    const hCala = g.world.terrainHeight.height(-398, -450);
    check('Cala del Silencio (-398,-450) accesible', hCala > -1 && hCala < 12, `${hCala.toFixed(1)} m`);
    // Kraivenn dragon home = cala
    const kraivenn = g.dragons ? g.dragons.dragonById('kraivenn') : null;
    if (kraivenn) {
      const dHome = Math.hypot(kraivenn.pos.x - (-398), kraivenn.pos.z - (-450));
      check('Kraivenn anida en la Cala nueva', dHome < 160, `${dHome.toFixed(0)} m de la cala`);
    }
    // ships: Gaviota at (-425,-308) in WATER
    const hGav = g.world.terrainHeight.height(-425, -308);
    check('Gaviota Sangrienta (-425,-308) ancla en agua profunda', hGav < -2, `${hGav.toFixed(1)} m`);
    const hZharpa = g.world.terrainHeight.height(110, 430);
    check('Zarpa de Sal (110,430) patrulla en agua', hZharpa < -1, `${hZharpa.toFixed(1)} m`);

    // ================= B. KITS TEXTURIZADOS =================
    step('kits');
    const kits = g.world.kits;
    check('Kit medieval cargado', kits.ready === true);
    const barrel = kits.create('barrel');
    if (barrel) {
      let textured = 0, total = 0;
      barrel.traverse((o) => {
        const m = o;
        if (m.isMesh) {
          total++;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) if (mm.map) { textured++; break; }
        }
      });
      check('Barril del kit con TEXTURA real (no plástico)', textured > 0 && total > 0, `${textured}/${total} mallas texturizadas`);
    } else {
      check('Barril del kit existe', false);
    }
    const sword = kits.weapon('sword');
    if (sword) {
      let metal = 0;
      sword.traverse((o) => {
        const m = o;
        if (m.isMesh) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) if (mm.metalness > 0.4) { metal++; break; }
        }
      });
      check('Espada del kit con METAL real (metalness)', metal > 0, `${metal} mallas metálicas`);
    } else {
      check('Espada del kit existe', false);
    }

    // ================= C. ÁRBOLES =================
    step('arboles');
    const veg = g.world.vegetation;
    // find any visible tree cluster mesh: material must have map (bark/leaf)
    let treeMeshes = 0, texturedTrees = 0, tris = 0;
    veg.sceneRef ? null : null;
    const scene = g.engine.scene;
    scene.traverse((o) => {
      const im = o;
      if (im.isInstancedMesh && im.name === '' && im.count > 0 && im.material && !im.name.includes('grass')) {
        // tree clusters are the only multi-material instanced meshes
        if (Array.isArray(im.material) && im.material.length === 2) {
          treeMeshes++;
          if (im.material[0].map && im.material[1].map) texturedTrees++;
          tris += (im.geometry.attributes.position.count / 3) * Math.max(1, im.count);
        }
      }
    });
    check('Árboles: clusters de 2 materiales (corteza+hoja) instanciados', treeMeshes > 0, `${treeMeshes} meshes`);
    if (treeMeshes > 0) check('TODAS las especies llevan textura de corteza y hoja', texturedTrees === treeMeshes, `${texturedTrees}/${treeMeshes}`);

    // ================= D. AGUA — reflexión real + estelas =================
    step('agua');
    const water = g.world.water;
    check('Render target de reflexión creado (verdad, no procedural)', !!water.reflRT);
    check('Shader con sampler de reflexión real', !!water.material.uniforms.uReflMap.value);
    // walk to the shore and look at the sea: the reflection must render
    // move the player above water near the village dock
    p.position.set(14, 6, 262); // over the water by the dock
    await wait(400);
    let reflRendered = false;
    for (let i = 0; i < 12; i++) {
      water.renderReflection(g.engine.renderer, g.engine.scene, g.engine.camera);
      reflRendered = true;
      await wait(50);
    }
    check('renderReflection() ejecuta sin errores (cámara espejo + plano oblicuo)', reflRendered);
    // wake system
    const wakes0 = water.material.uniforms.uWakes.value.filter((w) => w.w > 0).length;
    water.addWake(14, 262, 0.8, 14, 3.4);
    const wakes1 = water.material.uniforms.uWakes.value.filter((w) => w.w > 0).length;
    check('addWake() registra anillos de estela en el shader', wakes1 === wakes0 + 1, `${wakes1} activos`);
    // wakes decay
    for (let i = 0; i < 240; i++) water.update(1 / 30, g.engine.camera);
    const wakes2 = water.material.uniforms.uWakes.value.filter((w) => w.w > 0).length;
    check('Las estelas decaen y mueren con el tiempo', wakes2 === 0, `${wakes2} tras 8 s`);

    // ================= E. DRAGONES — tamaño 2.2 + clearance =================
    step('dragones');
    const drakeSize = await (async () => {
      // import DRAGON_SIZE_MULT indirectly: measure a live dragon's legHeight
      const d = g.dragons.dragonById('vaelthara');
      return d ? d.legHeight / 1.15 : null;
    })();
    check('Dragones ×2.2 (no los gigantes rotos de ×3)', Math.abs(drakeSize - 2.2) < 0.01, `mult=${drakeSize?.toFixed(2)}`);
    const vaelyx = g.dragons.dragonById('ancestro');
    if (vaelyx) {
      const minY = Math.max(3.5, vaelyx.legHeight * 0.85);
      check('Clearance de vuelo escala con el cuerpo (sin enterrarse)', minY > 4, `minY=${minY.toFixed(1)} m`);
    }

    // ================= F. ESPADAS ELEMENTALES =================
    step('espadas');
    st().addItem('espada_fuego', 1);
    await wait(200);
    const hasFire = st().hasItem('espada_fuego');
    check('Espada de fuego (Colmillo Ígneo) en el inventario', hasFire);
    const equipped = st().equippedWeapon;
    check('Al poseerla, se EQUIPA sola (la mejor espada)', equipped === 'espada_fuego', equipped);
    const combat = g.combat;
    const wpn = combat && combat.WEAPONS ? combat.WEAPONS.espada_fuego : null;
    if (wpn) {
      check('Colmillo Ígneo: daño base 34/58 + elemento fuego', wpn.lightDmg === 34 && wpn.heavyDmg === 58 && wpn.element === 'fire');
    } else {
      // try module import
      try {
        const mod = await import('/src/game/systems/CombatSystem.ts');
        const w = mod.WEAPONS.espada_fuego;
        check('Colmillo Ígneo: daño base 34/58 + elemento fuego', w && w.lightDmg === 34 && w.heavyDmg === 58 && w.element === 'fire');
      } catch { check('WEAPONS accesible', false); }
    }
    // visual: knight sword should be fire-styled
    await wait(300);
    const kmodel = p.model;
    let fireGlow = false;
    if (kmodel && kmodel.activeWeapon) {
      kmodel.activeWeapon.traverse((o) => {
        const m = o;
        if (m.isMesh) {
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mm of mats) {
            if (mm.emissive && mm.emissiveIntensity > 1.5 && mm.emissive.getHex() === 0xff4d12) fireGlow = true;
          }
        }
      });
    }
    check('La hoja del héroe ARDE (runas ígneas emisivas)', fireGlow);

    // ================= G. MISIONES DE ACCIÓN =================
    step('misiones');
    // bounty board interactable exists
    const board = g.world.interactables.find((i) => i.id === 'bounty_board');
    check('Cartel de recompensas en la plaza de Puerto Cuervo', !!board);
    if (board) {
      board.run();
      await wait(300);
      check('La Caza del Cuervo arranca desde el cartel', st().isQuestActive('sq_cazarrecompensas'));
    }
    // kill counters
    const k0 = st().killCounters.bandit ?? 0;
    st().registerKill('bandit');
    st().registerKill('bandit');
    const k1 = st().killCounters.bandit ?? 0;
    check('registerKill cuenta las piezas de la caza', k1 === k0 + 2, `${k1} totales`);
    // ambush spawn
    const banditsBefore = g.bandits ? g.bandits.aliveCount() : 0;
    const amb = g.bandits ? g.bandits.spawnAmbush(p.position.x, p.position.z, 3) : 0;
    const banditsAfter = g.bandits ? g.bandits.aliveCount() : 0;
    check('spawnAmbush(): los caballeros rojos saltan de la maleza', amb === 3 && banditsAfter === banditsBefore + 3, `${amb} spawned`);

    // ================= H. MARCADOR DE MISIÓN =================
    step('marcador');
    const hud1 = window.__kotfsStore ? window.__kotfsStore.getState() : null;
    // force an active quest with a world target (the bounty = kill objective → nearest camp)
    await wait(600); // HUD sync (0.15s cadence)
    const store = (await import('/src/store/gameStore.ts')).useGameStore.getState();
    const tracker = store.questTracker;
    check('Tracker de misión activo con objetivos', !!tracker && tracker.objectives.length > 0, tracker?.title);
    check('Marcador en PANTALLA (pin dorado + distancia)', !!tracker?.marker3d, tracker?.marker3d ? `${tracker.marker3d.dist} m, x=${tracker.marker3d.x.toFixed(2)} y=${tracker.marker3d.y.toFixed(2)}` : 'null');
    // beacon upgraded: diamond + shaft + 2 rings
    const beacon = g.questBeacon || g.world ? g.engine.scene.getObjectByName('quest_beacon') : null;
    let beaconParts = 0;
    if (beacon) beacon.traverse((o) => { if (o.isMesh) beaconParts++; });
    check('Baliza del mundo mejorada (diamantes+columna+anillos)', beaconParts >= 5, `${beaconParts} piezas`);

    // ================= I. PASTO (ventana ampliada) =================
    step('pasto');
    // restore high density and check the window grew (tiles at ~11 rings)
    g.world.vegetation.setGrassDensity(1.0);
    await wait(500);
    const stats = veg.stats;
    check('Prado de briznas denso en gráficos altos', stats.blades > 30000, `${stats.blades} briznas+mattas`);

    // ================= J. ANIMACIONES =================
    step('anim');
    // run forward and sample the hip roll (z rotation ≠ 0 → secondary motion)
    press('KeyW');
    await wait(1200);
    const model = p.model;
    let hipRollSeen = false;
    for (let i = 0; i < 20; i++) {
      const hip = model.bones?.get?.('j_hipL');
      if (hip && Math.abs(hip.rotation.z) > 0.004) { hipRollSeen = true; break; }
      await wait(40);
    }
    release('KeyW');
    check('Marcha con balanceo de cadera (movimiento secundario)', hipRollSeen);

    step('fin');
    window.__kotfsE2EF12Log = log;
    return log.join('\n');
  } catch (e) {
    log.push('EXCEPTION: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)));
    window.__kotfsE2EF12Log = log;
    return log.join('\n');
  }
  })();
}, 900);
