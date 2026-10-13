// E2E FASE 16 — bugs + comerciantes. Two phases with a page reload in
// between: phase 1 exercises every fix/feature and SAVES; phase 2 loads the
// slot in a FRESH session and verifies the ship/horse/dragon/equipment
// survived (the "loading deletes my stuff" bug).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const mark = (s) => { window.__e2eF16Step = s; if (window.gc) { try { window.gc(); } catch { /* gc not exposed */ } } };
  const store = () => window.__kotfsStoreGet();
  const near = (a, b, tol) => Math.hypot(a.x - b.x, a.z - b.z) < tol;
  // staged screenshot handshake with the runner (both phases)
  const shot = async (tag) => {
    window.__kfs16shotAt = tag;
    const t0 = Date.now();
    while (window.__kfs16shotAck !== tag && Date.now() - t0 < 12000) await wait(250);
    window.__kfs16shotAck = null;
  };
  window.__kotfsE2ELogF16 = null;

  try {
    // ---- wait for the menu ----
    for (let i = 0; i < 90; i++) {
      if (window.__kotfsGame && Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'))) break;
      await wait(500);
    }
    const g = window.__kotfsGame;
    if (!g) { log.push('FAIL — juego no inicializado (Turbopack)'); window.__kotfsE2ELogF16 = log; return 'abort'; }
    g.input.requestLock = () => {};
    mark('boot');
    check('Arranque limpio (sin error de Turbopack)', !!g.engine);

    const phase = (localStorage.getItem('__kfs16phase') || '1');
    if (phase === '2') {
      // ================================================================
      // PHASE 2 — fresh session: LOAD the slot, verify nothing vanished
      // ================================================================
      mark('load');
      const ok = g.loadFromSlot(0);
      check('loadFromSlot(0) devuelve true', ok === true);
      await wait(1200);
      const saved = JSON.parse(localStorage.getItem('__kfs16phase1') || '{}');

      // the player's own ship (Colibrí) — compare against the SAVED spot
      const ps = g.naval.playerShip;
      check('El Colibrí SOBREVIVE la carga', !!ps, ps ? `@${ps.pos.x.toFixed(0)},${ps.pos.z.toFixed(0)}` : 'null');
      if (ps) {
        const expected = saved.playerShipPos || { x: 60, z: 300 };
        check('Colibrí en su sitio guardado', near(ps.pos, expected, 4), `(${ps.pos.x.toFixed(1)},${ps.pos.z.toFixed(1)}) vs (${expected.x.toFixed(0)},${expected.z.toFixed(0)})`);
        check('Casco persiste (hullHp 77)', Math.abs(ps.hullHp - 77) < 1, `${ps.hullHp}`);
        check('Velocidad base +40% tras carga (12.0)', Math.abs(ps.maxSpeed - 12) < 0.05, `${ps.maxSpeed.toFixed(2)}`);
      }
      // admin ship
      const ex = g.naval.extraShips.find((s) => s.id === saved.adminShipId);
      check('El barco del panel SOBREVIVE la carga', !!ex, ex ? ex.id : `extras=${g.naval.extraShips.length}`);
      if (ex && saved.adminShipPos) {
        check('Barco admin en su sitio', near(ex.pos, saved.adminShipPos, 5), `(${ex.pos.x.toFixed(0)},${ex.pos.z.toFixed(0)})`);
      }
      // admin horse (horseList is a getter)
      const herd = g.mounts.horseList;
      const h = herd.find((x) => x.id === saved.adminHorseId);
      check('El caballo del panel SOBREVIVE la carga', !!h && h.owned === true, h ? h.name : `herd=${herd.length}`);
      if (h && saved.adminHorsePos) {
        check('Caballo admin en su sitio', near(h.pos, saved.adminHorsePos, 5), `(${h.pos.x.toFixed(0)},${h.pos.z.toFixed(0)})`);
      }
      // admin dragon
      const adm = g.dragons.list().find((d) => d.def.id === saved.adminDragonId);
      check('El dragón del panel SOBREVIVE la carga', !!adm && adm.rideable, adm ? adm.def.name : 'null');
      if (adm && saved.adminDragonPos) {
        // x/z must round-trip; the flying flag is transient (a living docile
        // dragon lands by itself) — the SAVE carried it (verified phase 1).
        check('Dragón admin en su sitio', near(adm.pos, saved.adminDragonPos, 8), `(${adm.pos.x.toFixed(0)},${adm.pos.y.toFixed(0)},${adm.pos.z.toFixed(0)}) fly=${adm.flying}`);
      }
      // equipment
      check('Alas equipadas persisten', g.state.equippedWings === 'alas_rotas', `${g.state.equippedWings}`);
      check('Armadura equipada persiste', g.state.equippedArmor === 'armadura_placas', `${g.state.equippedArmor}`);
      check('Stats de armadura re-aplicadas (155 HP)', Math.abs(g.player.stats.maxHealth - 155) < 1, `${g.player.stats.maxHealth}`);
      check('Reducción de daño re-aplicada (0.28)', Math.abs((g.player.stats.damageReduction ?? 0) - 0.28) < 0.01);
      check('Alas visibles en la espalda tras carga', g.player.wingsItemId === 'alas_rotas');
      // player position
      if (saved.playerPos) check('Jugador en su sitio guardado', near(g.player.position, saved.playerPos, 4), `(${g.player.position.x.toFixed(0)},${g.player.position.z.toFixed(0)})`);

      // staged screenshots (handshake with the runner) — shared shot() above
      // glide shot over the village (wings spread) — hold through the landing
      const p2 = g.player;
      const hp0 = p2.health;
      p2.teleport(20, 26, 150);
      await wait(600);
      press('Space');
      await wait(1500);
      check('Planeo activo tras carga (fase 2)', p2.gliding === true, `vvel=${p2.verticalVel.toFixed(2)}`);
      await shot('glide');
      // force the touchdown (no wall-clock descent)
      p2.position.y = g.world.terrainHeight.height(p2.position.x, p2.position.z) + 0.2;
      await wait(800);
      release('Space');
      await wait(300);
      check('Aterriza sin daño de caída (salud intacta)', p2.grounded === true && Math.abs(p2.health - hp0) < 0.5, `hp=${p2.health.toFixed(0)}/${hp0.toFixed(0)}`);
      // smithy shot
      p2.teleport(56, g.world.terrainHeight.height(56, 122) + 0.5, 122);
      (window.__kotfsApi || g).adminSetTime(0.42);
      await wait(2600);
      await shot('smithy');
      check('Herrero Torvald presente tras carga', !!g.npcs.find((n) => n.def.id === 'herrero'));
      check('Enano Borin presente tras carga', !!g.npcs.find((n) => n.def.id === 'enano'));

      localStorage.removeItem('__kfs16phase');
      localStorage.removeItem('__kfs16phase1');
      // attach the phase-1 log so the runner reports BOTH phases
      try {
        const l1 = sessionStorage.getItem('__kfs16log1');
        if (l1) for (const line of JSON.parse(l1)) log.push(line);
      } catch { /* ignore */ }
      window.__kotfsE2ELogF16 = log;
      mark('done');
      return 'done';
    }

    // ================================================================
    // PHASE 1 — fixes + features, then SAVE + reload
    // ================================================================
    const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    startBtn.click();
    await wait(2600);
    press('Space'); release('Space'); // skip intro
    await wait(1800);
    const p = g.player;
    const st = () => g.state;
    check('Partida en marcha', !!p && p.health > 0);
    p.health = 100; p.stamina = 100;

    // ---- white concrete + smithies ----
    mark('concreto');
    const pbr = g.world.assets.pbr || {};
    check('PBR white_concrete cargado', !!pbr.white_concrete && !!pbr.white_concrete.map, pbr.white_concrete ? 'set ok' : 'MISSING');
    const probe0 = g.debugProbe();
    const torvaldNpc = probe0.npcs.find((n) => n.id === 'herrero');
    const borinNpc = probe0.npcs.find((n) => n.id === 'enano');
    check('Herrero estándar en su herrería (52,116)', !!torvaldNpc && near({ x: torvaldNpc.x, z: torvaldNpc.z }, { x: 52, z: 116 }, 12), torvaldNpc ? `@${torvaldNpc.x},${torvaldNpc.z}` : 'null');
    check('Enano en el bosque (-120,-60)', !!borinNpc && near({ x: borinNpc.x, z: borinNpc.z }, { x: -120, z: -60 }, 14), borinNpc ? `@${borinNpc.x},${borinNpc.z}` : 'null');
    check('Enano con proporciones de enano (y≈0.64)', !!borinNpc && borinNpc.scale && Math.abs(borinNpc.scale[1] - 0.64) < 0.02, borinNpc && borinNpc.scale ? `scale ${borinNpc.scale.map((v) => v.toFixed(2)).join('/')}` : 'no scale');

    // ---- quest markers: dynamic resolution ----
    mark('markers');
    // q1 is ACTIVE from the intro and shadows everything: complete it first
    st().questStates.set('q1_legacy', { status: 'completed', objectives: new Set(['o1']) });
    st().questStates.delete('q2_herbs'); st().questStates.delete('q5_raven');
    st().questStates.delete('q4_refit'); st().questStates.delete('q3_chest');
    // q2 herbs o3 (maren_herbs_done) → Maren herself, not the square
    st().questStates.set('q2_herbs', { status: 'active', objectives: new Set(['o1', 'o2']) });
    p.teleport(20, g.world.terrainHeight.height(20, 150) + 0.5, 150);
    await wait(400);
    let tgt = g.debugQuestTarget();
    const maren = g.npcs.find((n) => n.def.id === 'maren');
    check('Marcador q2/o3 apunta a MAREN (no a la plaza)', !!tgt && !!maren && near(tgt, maren.position, 12), tgt ? `@${tgt.x},${tgt.z} vs Maren@${maren.position.x.toFixed(0)},${maren.position.z.toFixed(0)}` : 'null');
    st().questStates.delete('q2_herbs');
    // q5 raven o1 (reached_crow) → the real island centre
    st().questStates.set('q5_raven', { status: 'active', objectives: new Set() });
    await wait(250);
    tgt = g.debugQuestTarget();
    check('Marcador q5/o1 apunta a la Isla del Cuervo real', !!tgt && near(tgt, { x: -540, z: -450 }, 8), tgt ? `@${tgt.x},${tgt.z} (esperado -540,-450)` : 'null');
    st().questStates.delete('q5_raven');
    // q4 refit o2 (madera) → nearest AVAILABLE crate (not the spent one)
    st().questStates.set('q4_refit', { status: 'active', objectives: new Set(['o1']) });
    await wait(250);
    tgt = g.debugQuestTarget();
    check('Marcador madera → caja más cercana disponible (muelle)', !!tgt && near(tgt, { x: 17.5, z: 231.5 }, 4), tgt ? `@${tgt.x},${tgt.z}` : 'null');
    st().setFlag('oak_crate_madera_a');
    await wait(250);
    tgt = g.debugQuestTarget();
    check('Caja del muelle gastada → marcador SALTA a la costa oeste', !!tgt && near(tgt, { x: -326, z: 183 }, 4), tgt ? `@${tgt.x},${tgt.z}` : 'null');
    st().setFlag('oak_crate_madera_b');
    await wait(250);
    tgt = g.debugQuestTarget();
    check('Segunda caja gastada → marcador salta a la cascada', !!tgt && near(tgt, { x: -100, z: -188 }, 4), tgt ? `@${tgt.x},${tgt.z}` : 'null');
    st().questStates.delete('q4_refit');
    // q3 chest o2 (read_letter) → NO marker (it is an inventory action)
    st().questStates.set('q3_chest', { status: 'active', objectives: new Set(['o1']) });
    await wait(250);
    tgt = g.debugQuestTarget();
    check('read_letter SIN marcador (se lee desde el inventario)', tgt === null, tgt ? `@${tgt.x},${tgt.z}` : 'null ✓');
    st().questStates.delete('q3_chest');

    // ---- dragon fire cone: narrow jet, not a 140° fan ----
    mark('firecone');
    const vael = g.dragons.list().find((d) => d.def.id === 'vaelthara');
    check('Vaelthara disponible para el test del cono', !!vael);
    if (vael) {
      const V = vael.group.position.clone();
      // deterministic pose: standing at the village square, facing +Z
      vael.pos.set(20, g.world.terrainHeight.height(20, 150) + 6, 150);
      vael.yaw = 0;
      vael.group.position.copy(vael.pos);
      vael.group.rotation.set(0, 0, 0);
      vael.group.updateMatrixWorld(true);
      const mouth = vael.model.mouthWorldPos(V.clone());
      const fwd = vael.group.getWorldDirection(V.clone());
      const right = V.clone().set(fwd.z, 0, -fwd.x).normalize();
      const mk = (f, s, up) => {
        const t = mouth.clone();
        t.addScaledVector(fwd, f);
        t.addScaledVector(right, s);
        t.y += up;
        return t;
      };
      const terrain = g.world.terrainHeight;
      const inJet = mk(8, 0, 0);
      check('Fuego: DENTRO del chorro visible → daña', vael.debugFireCone(inJet, terrain) === true, '@8m eje');
      const side = mk(8, 5.5, 0);
      check('Fuego: 5,5m al costado a 8m → YA NO daña (bug 140°)', vael.debugFireCone(side, terrain) === false, 'el cono viejo (70°) SÍ habría dado');
      const behind = mk(-6, 0, 0);
      check('Fuego: detrás de la boca → no daña', vael.debugFireCone(behind, terrain) === false);
      const far = mk(vael.def.fireRange + 5, 0, 0);
      check('Fuego: más allá del alcance → no daña', vael.debugFireCone(far, terrain) === false, `range=${vael.def.fireRange}`);
      const deadZone = mk(1.0, 0, 0);
      check('Fuego: zona muerta junto a la boca → no daña', vael.debugFireCone(deadZone, terrain) === false);
      const wide = mk(12, 2, 0);
      check('Fuego: 2m del eje a 12m → daña (el chorro es ancho ahí)', vael.debugFireCone(wide, terrain) === true);
      // restore the guardian to her lair, asleep, full health
      vael.spawnAt(terrain, false);
    }

    // ---- ship camera + speed + wake gate ----
    mark('barco');
    st().setFlag('ship_repaired');
    const ship = g.naval.spawnPlayerShip(60, 300, 0.6);
    check('Colibrí a flote para las pruebas', !!ship);
    ship.hullHp = 77; ship.sailState = 1; ship.anchored = true;
    check('Velocidad base +40% (carabela 12.0)', Math.abs(ship.maxSpeed - 12) < 0.05, `${ship.maxSpeed.toFixed(2)} m/s`);
    const raider = g.naval.enemies[0] && g.naval.enemies[0].ship;
    if (raider) check('Corsarias +24% (9.2) — la persecución sigue viva', Math.abs(raider.maxSpeed - 9.2) < 0.05, `${raider.maxSpeed.toFixed(2)}`);
    st().learnedSkills.add('nav_marino'); g.naval.applyPerks();
    check('Marinería ahora +20% (14.4 total)', Math.abs(ship.maxSpeed - 14.4) < 0.05, `${ship.maxSpeed.toFixed(2)}`);
    st().learnedSkills.delete('nav_marino'); g.naval.applyPerks();
    check('Sin Marinería vuelve a 12.0', Math.abs(ship.maxSpeed - 12) < 0.05);
    // camera: take the helm and read the rig
    p.teleport(ship.pos.x + 6, 2, ship.pos.z + 6);
    g.rig.setShipMode(ship);
    check('Cámara de navegación: distancia 21m', Math.abs(g.rig.targetDistance - 21) < 0.01, `${g.rig.targetDistance}`);
    check('Cámara de navegación: pitch ≥ 0.34 (más alta)', g.rig.pitch >= 0.339, g.rig.pitch.toFixed(3));
    g.naval.playerBoardsHelm();
    // settle-poll: wait until the rig actually glides out (SwiftShader fps)
    let camToWheel = 0;
    for (let k = 0; k < 12; k++) {
      await wait(600);
      camToWheel = g.engine.camera.position.distanceTo(ship.wheelWorld);
      if (camToWheel >= 16) break;
    }
    check('Cámara alejada del timón (≥16m)', camToWheel >= 16, `${camToWheel.toFixed(1)}m`);
    // DROP THE WHEEL — otherwise the player is glued to it and the whole
    // merchant/glide section never runs real physics
    g.naval.leaveHelm();
    g.rig.setShipMode(null);
    g.player.platformProbe = undefined;
    p.teleport(20, g.world.terrainHeight.height(20, 150) + 0.5, 150);
    await wait(300);
    check('Timón soltado: física a pie restaurada', g.naval.playerSailing === false && !g.rig.shipTarget, `sailing=${g.naval.playerSailing}`);
    // wake gate with waves OFF
    mark('wakes');
    const s0 = { ...g.settings };
    g.debugApplySettings({ ...s0, waves: false });
    await wait(400);
    check('Oleaje OFF → puerta de wakes cerrada', g.debugProbe().waves === false);
    g.debugApplySettings({ ...s0, waves: true });
    await wait(400);
    check('Oleaje ON → puerta de wakes abierta', g.debugProbe().waves === true);

    // ---- merchants: level gates + shop + purchases ----
    mark('mercaderes');
    st().addItem('coin', 6000);
    st().level = 12;
    // (a) level gate — too low
    st().level = 5;
    p.teleport(52, g.world.terrainHeight.height(52, 116) + 0.5, 118);
    await wait(600);
    g.dialogue.start('herrero');
    await wait(400);
    check('Nivel 5: Torvald rechaza la tienda', (store().dialogue?.text || '').includes('nivel 6'), (store().dialogue?.text || '').slice(0, 60));
    g.dialogue.close();
    await wait(300);
    // (b) level 12: shop opens through the dialogue
    st().level = 12;
    g.dialogue.start('herrero');
    await wait(400);
    check('Nivel 12: saludo de Torvald', (store().dialogue?.text || '').includes('Torvald, para servirte'));
    g.dialogue.choose(0); // "Veamos la mercancía."
    await wait(600);
    check('La TIENDA se abre desde el diálogo', store().shop?.vendor === 'herrero');
    const bodyTxt = document.body.innerText;
    check('Panel de tienda: título + 900 de las alas', bodyTxt.toUpperCase().includes('TORVALD') && bodyTxt.includes('900'));
    // (c) buy the wings through the DOM (card root climbs to the bordered card)
    const buyFor = (label) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Comprar' && (b.closest('[class*="border"]') || b.closest('div')).innerText.includes(label));
    // Torvald's shop has no ROTA versions, so the plain label is unambiguous here
    const alasCardOk = buyFor('Alas del Planeador');
    check('Tarjeta de las Alas con botón Comprar', !!alasCardOk);
    if (alasCardOk) {
      alasCardOk.click();
      await wait(500);
      check('Compra de alas: oro descontado (6000-900=5100)', st().countItem('coin') === 5100, `monedas=${st().countItem('coin')}`);
      check('Alas en el inventario', st().hasItem('alas'));
    }
    // (d) buy the plate armor too
    const plateBtnOk = buyFor('Armadura de placas');
    if (plateBtnOk) { plateBtnOk.click(); await wait(400); }
    check('Armadura de placas comprada', st().hasItem('armadura_placas'));
    // close the shop with ESC, then RESUME (the game pauses on a bare Escape)
    press('Escape'); release('Escape');
    await wait(400);
    check('ESC cierra la tienda', store().shop === null);
    g.resume();
    await wait(300);
    check('Juego corriendo tras cerrar la tienda (no pausado)', store().phase === 'playing', store().phase);
    // (e) equip through the inventory UI
    press('Tab'); release('Tab');
    await wait(600);
    check('Inventario abierto (Tab)', document.body.innerText.includes('ZURRÓN DEL EXPLORADOR'));
    const alasTile = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Alas del Planeador'));
    if (alasTile) { alasTile.click(); await wait(300); }
    const equipBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Equipar');
    check('Botón Equipar para las alas', !!equipBtn);
    if (equipBtn) { equipBtn.click(); await wait(400); }
    check('Alas equipadas (wingsItemId)', p.wingsItemId === 'alas', `${p.wingsItemId}`);
    check('Stats de planeo aplicados (sink -2.6, spd 10.5)', Math.abs((p.stats.glideSink ?? 0) + 2.6) < 0.01 && Math.abs((p.stats.glideSpeed ?? 0) - 10.5) < 0.01, `sink=${p.stats.glideSink} spd=${p.stats.glideSpeed}`);
    check('Rig de alas visible en la espalda', p.wingsRig && p.wingsRig.root.visible === true);
    press('Escape'); release('Escape');
    await wait(300);
    // (f) the dwarf: higher tier, broken (OP) versions
    mark('enano');
    st().addItem('coin', 3000); // room for the broken sword too
    p.teleport(-120, g.world.terrainHeight.height(-120, -60) + 0.5, -58);
    await wait(700);
    g.dialogue.start('enano');
    await wait(400);
    check('Nivel 12: saludo de Borin', (store().dialogue?.text || '').includes('Borin'));
    g.dialogue.choose(0); // "Muéstrame lo roto."
    await wait(600);
    check('Tienda del ENANO abierta', store().shop?.vendor === 'enano');
    const dwarfTxt = document.body.innerText;
    check('Catálogo ROTO del enano (3.000 las alas rotas)', dwarfTxt.includes('ROTAS') && (dwarfTxt.includes('3000') || dwarfTxt.includes('3.000')));
    const rotasBtn = buyFor('Alas del Planeador ROTAS');
    if (rotasBtn) { rotasBtn.click(); await wait(500); }
    check('Alas ROTAS compradas (3.000 oro)', st().hasItem('alas_rotas'), `monedas=${st().countItem('coin')}`);
    const espadaRotaBtn = buyFor('Espada del Almirante ROTA');
    if (espadaRotaBtn) { espadaRotaBtn.click(); await wait(600); }
    check('Espada del Almirante ROTA se AUTO-EQUIPA (SWORD_PRIORITY)', st().equippedWeapon === 'espada_almirante_rota', st().equippedWeapon);
    press('Escape'); release('Escape');
    await wait(400);
    g.resume();
    await wait(300);
    // swap to the broken wings through the inventory
    press('Tab'); release('Tab');
    await wait(500);
    const rotasTile = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Alas del Planeador ROTAS'));
    if (rotasTile) { rotasTile.click(); await wait(300); }
    const eq2 = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Equipar');
    if (eq2) { eq2.click(); await wait(400); }
    check('Alas ROTAS equipadas (mejor planeo)', p.wingsItemId === 'alas_rotas' && Math.abs((p.stats.glideSink ?? 0) + 1.8) < 0.01, `sink=${p.stats.glideSink}`);
    const armorTile = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Armadura de placas'));
    if (armorTile) { armorTile.click(); await wait(300); }
    const eq3 = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Equipar');
    if (eq3) { eq3.click(); await wait(400); }
    check('Armadura equipada: 155 HP máximos', Math.abs(p.stats.maxHealth - 155) < 0.6, `${p.stats.maxHealth}`);
    check('Armadura equipada: −28% daño', Math.abs((p.stats.damageReduction ?? 0) - 0.28) < 0.01);
    press('Escape'); release('Escape');
    await wait(300);
    g.resume();
    await wait(300);
    check('Juego corriendo para el planeo', store().phase === 'playing', store().phase);

    // ---- glide: hold SPACE while falling ----
    mark('planeo');
    p.health = p.stats.maxHealth;
    const hpBefore = p.health;
    p.teleport(20, 34, 150);
    await wait(600); // free fall begins
    check('Caída libre en curso (vvel < -1.2)', p.verticalVel < -1.2, `vvel=${p.verticalVel.toFixed(1)}`);
    press('Space');
    await wait(1900);
    check('ESPACIO mantenido → PLANEO activo', p.gliding === true, `vvel=${p.verticalVel.toFixed(2)}`);
    const sink = p.stats.glideSink ?? -2.6;
    check('Descenso limitado por las alas', p.verticalVel > Math.max(-7, sink - 3) && p.verticalVel < -0.3, `vvel=${p.verticalVel.toFixed(2)} (objetivo ${sink})`);
    const hspd = Math.hypot(p.velocity.x, p.velocity.z);
    check('Empuje hacia delante en el planeo', hspd > 4.5, `${hspd.toFixed(1)} m/s (rampa hacia ${p.stats.glideSpeed})`);
    check('Alas desplegadas (spread > 0.6)', p.wingSpread > 0.6, p.wingSpread.toFixed(2));
    check('Cuerpo inclinado hacia delante', p.model.root.rotation.x > 0.15, p.model.root.rotation.x.toFixed(2));
    // force the touchdown: drop the body the last stretch so the next physics
    // frame lands it at glide speed (~2.6 m/s → well under the 13 m/s threshold)
    p.position.y = g.world.terrainHeight.height(p.position.x, p.position.z) + 0.2;
    await wait(800);
    release('Space');
    await wait(400);
    check('Soltar ESPACIO cierra el planeo', p.gliding === false || p.grounded === true);
    check('Aterrizaje suave: sin daño de caída', p.grounded === true && Math.abs(p.health - hpBefore) < 0.5, `hp=${p.health.toFixed(0)}/${hpBefore.toFixed(0)}`);

    // ---- armor damage reduction (takeHit) ----
    mark('armadura');
    p.health = p.stats.maxHealth;
    const dealt = p.takeHit(100, undefined, undefined, {});
    check('takeHit(100) con placas → solo 72 de daño', Math.abs(dealt - 72) < 1.5, `dealt=${dealt}`);
    check('Salud refleja la reducción (155→83)', Math.abs(p.health - 83) < 1.5, `hp=${p.health.toFixed(0)}`);

    // ---- SAVE with everything on board, then reload (fresh session) ----
    mark('save');
    const api = window.__kotfsApi;
    check('gameApi expuesta para sondas (__kotfsApi)', !!api && typeof api.adminSpawn === 'function');
    // the player's own admin trio — horse+dragon on land (village), the ship
    // from open water (the ring scan needs deep water near the caller)
    api.adminSpawn('horse');
    api.adminSpawn('dragon', 'drake_stones');
    await wait(700);
    p.teleport(0, 2, 330); // out into the bay
    await wait(300);
    api.adminSpawn('ship');
    await wait(700);
    // make the dragon FLY so phase 2 also verifies the flying flag
    const admD = g.dragons.list().find((d) => d.def.id.startsWith('admin_'));
    if (admD) { admD.flying = true; admD.pos.y += 12; admD.group.position.copy(admD.pos); }
    // record what should survive (horseList is a GETTER, not a function)
    const herd = g.mounts.horseList;
    const adminHorse = herd.find((x) => x.id.startsWith('admin_h_'));
    const adminShip = g.naval.extraShips[g.naval.extraShips.length - 1];
    const record = {
      adminShipId: adminShip ? adminShip.id : null,
      adminShipPos: adminShip ? { x: adminShip.pos.x, z: adminShip.pos.z } : null,
      adminHorseId: adminHorse ? adminHorse.id : null,
      adminHorsePos: adminHorse ? { x: adminHorse.pos.x, z: adminHorse.pos.z } : null,
      adminDragonId: admD ? admD.def.id : null,
      adminDragonPos: admD ? { x: admD.pos.x, z: admD.pos.z } : null,
      adminDragonFlying: admD ? admD.flying : false,
      playerShipPos: g.naval.playerShip ? { x: g.naval.playerShip.pos.x, z: g.naval.playerShip.pos.z } : null,
      playerPos: { x: p.position.x, z: p.position.z },
    };
    const saved = g.saveToSlot(0);
    check('saveToSlot(0) guarda', saved === true);
    const raw = JSON.parse(localStorage.getItem('kotfs_save_0') || '{}');
    check('El guardado incluye el barco admin (extras)', raw.naval?.extras?.length >= 1, `extras=${raw.naval?.extras?.length}`);
    check('El guardado incluye el Colibrí (player, hp 77)', raw.naval?.player && Math.abs(raw.naval.player.hullHp - 77) < 1);
    const savedHorse = (raw.mounts?.horses || []).find((x) => x.id === record.adminHorseId);
    check('El guardado incluye el caballo admin (con capa+nombre)', !!savedHorse && !!savedHorse.coat && !!savedHorse.name, savedHorse ? `${savedHorse.name} (${savedHorse.coat})` : 'null');
    const savedDragon = (raw.dragons?.admins || []).find((x) => x.species === 'drake_stones');
    check('El guardado incluye el dragón admin (admins)', !!savedDragon && savedDragon.flying === true);
    check('El guardado incluye alas+armadura equipadas', raw.gameState?.equippedWings === 'alas_rotas' && raw.gameState?.equippedArmor === 'armadura_placas');
    check('El guardado incluye la espada rota equipada', raw.gameState?.equippedWeapon === 'espada_almirante_rota');

    // ---- staged mid-glide shot over the village (visual evidence), then reload ----
    p.health = p.stats.maxHealth;
    p.teleport(20, 34, 150);
    await wait(650);
    press('Space');
    await wait(1500);
    await shot('phase1');
    // force the landing (same trick: no wall-clock descent needed)
    p.position.y = g.world.terrainHeight.height(p.position.x, p.position.z) + 0.2;
    await wait(800);
    release('Space');
    await wait(300);

    // phase 2 marker + reload (keep the phase-1 log for the final report)
    localStorage.setItem('__kfs16phase', '2');
    localStorage.setItem('__kfs16phase1', JSON.stringify(record));
    try { sessionStorage.setItem('__kfs16log1', JSON.stringify(log)); } catch { /* ignore */ }
    window.__kfs16reload = true;
    location.reload();
    return 'reloading';
  } catch (e) {
    log.push('FAIL — EXCEPCION: ' + (e && e.message));
    window.__kotfsE2ELogF16 = log;
    window.__e2eF16Step = 'error';
    return 'error';
  }
})()
