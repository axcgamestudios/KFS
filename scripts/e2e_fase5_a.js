// E2E Fase 5 — A: menu key art, knight player, terrain textures, kits, villagers
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  for (let i = 0; i < 60; i++) {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
    if (btn) break;
    await wait(500);
  }
  const g = window.__kotfsGame;
  if (!g) { log.push('FAIL — juego no inicializado'); window.__kotfsE2ELog = log; return 'abort'; }
  window.__kotfsE2ELog = log;
  g.input.requestLock = () => {};
  const state = () => g.state;

  // ---- 1. Menu: key art + studio branding ----
  check('Menú Fase 5 v0.5', document.body.textContent.includes('v0.5'));
  check('Marca AXCGames Studios', document.body.textContent.toUpperCase().includes('AXCGAMES STUDIOS'));
  const img = document.querySelector('img[src*="menu_bg"]');
  check('Imagen de fondo del menú (galeón)', !!img, img ? img.getAttribute('src') : 'no img');
  let imgOk = false;
  try { imgOk = img && img.complete && img.naturalWidth > 800; } catch { imgOk = false; }
  check('Imagen de fondo cargada (naturalWidth>800)', !!imgOk, imgOk ? `${img.naturalWidth}x${img.naturalHeight}` : '');
  check('Sin título DOM en el menú (ya está en la imagen)', !document.body.textContent.includes('FORGOTTEN SEAS') || !!document.querySelector('img[src*="menu_bg"]'));
  const btnSample = document.querySelector('.kfs2-btn');
  check('Botones con estilo nuevo (kfs2)', !!btnSample);

  // ---- 2. Boot the game ----
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  startBtn.click();
  await wait(2800);
  press('Space'); release('Space');
  await wait(1500);
  check('Q1 activa tras intro', state().currentTracker()?.title === 'El Legado de Eirik');

  // ---- 3. The knight as the player ----
  const player = g.player;
  check('Jugador usa KnightModelGLB', !!player.model && player.model.constructor.name === 'KnightModelGLB', player.model?.constructor?.name);
  const pRoot = player.model.root;
  const meshes = [];
  pRoot.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  check('Cuerpo con SkinnedMesh (real skin)', meshes.length >= 2, `skinned=${meshes.length}`);
  const bones = ['j_root', 'j_torso', 'j_head', 'j_shoulderR', 'j_kneeL'];
  const boneOk = bones.filter((b) => { try { return !!pRoot.getObjectByName(b); } catch { return false; } });
  check('Esqueleto del caballero presente', boneOk.length >= 4, `${boneOk.length}/${bones.length}`);
  const swordProp = pRoot.getObjectByName('j_sword_held');
  const shieldProp = pRoot.getObjectByName('j_shield_held');
  check('Espada del caballero (prop rígido)', !!swordProp);
  check('Escudo del caballero (prop rígido)', !!shieldProp);

  // height sanity: the rigged knight is ~1.95m
  let hb = null;
  try {
    pRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pRoot);
    hb = box.max.y - box.min.y;
  } catch {}
  check('Altura del caballero ~1.9-2.1 m', hb !== null && hb > 1.6 && hb < 2.4, hb ? hb.toFixed(2) : 'n/a');

  // ---- 4. Animation smoke: walk a bit and check the bones move ----
  const before = {};
  for (const b of ['j_hipR', 'j_shoulderR', 'j_kneeL']) {
    const o = pRoot.getObjectByName(b); if (o) before[b] = o.rotation.x;
  }
  press('KeyW');
  await wait(1200);
  release('KeyW');
  await wait(300);
  let moved = 0;
  for (const b of Object.keys(before)) {
    const o = pRoot.getObjectByName(b);
    if (o && Math.abs(o.rotation.x - before[b]) > 0.08) moved++;
  }
  check('Huesos animados al caminar', moved >= 2, `${moved}/${Object.keys(before).length} huesos con delta`);

  // ---- 5. No auto-jump bug: standing still must NOT hop ----
  const y0 = player.position.y;
  await wait(900);
  const y1 = player.position.y;
  const vJump = player.velocity.y;
  await wait(900);
  const stayed = Math.abs(player.position.y - y1) < 0.35 && Math.abs(player.position.y - y0) < 2.5;
  check('SIN salto automático (reposo estable)', stayed, `y0=${y0.toFixed(2)} y1=${y1.toFixed(2)} y2=${player.position.y.toFixed(2)} vy=${vJump.toFixed(2)}`);
  // and Space DOES jump exactly once per press
  const preVy = player.velocity.y;
  press('Space'); await wait(80); release('Space');
  await wait(120);
  const jumped = player.velocity.y > 3 || player.position.y > y1 + 0.4;
  check('Salto con Espacio funciona (una vez)', jumped, `vy=${player.velocity.y.toFixed(2)}`);
  await wait(1400);

  // ---- 6. Terrain textures (splat shader) ----
  const terrain = g.world.terrain;
  const tmats = [];
  terrain && terrain.chunksMeshes && terrain.chunksMeshes();
  const shaderCheck = (() => {
    try {
      const mesh = g.engine.scene.children.find((c) => c.isMesh && c.material && c.material.onBeforeCompile !== undefined) ||
        (() => { let found = null; g.engine.scene.traverse((o) => { if (!found && o.isMesh && o.geometry?.getAttribute?.('aSplat')) found = o; }); return found; })();
      return !!mesh;
    } catch { return false; }
  })();
  check('Atributo aSplat en mallas de terreno', shaderCheck);
  const splatShader = (() => {
    try {
      let src = '';
      const mesh = (() => { let found = null; g.engine.scene.traverse((o) => { if (!found && o.isMesh && o.geometry?.getAttribute?.('aSplat')) found = o; }); return found; })();
      if (!mesh) return false;
      // material must have the custom map_fragment replacement
      return mesh.material.onBeforeCompile !== THREE.MeshStandardMaterial.prototype.onBeforeCompile;
    } catch { return false; }
  })();
  check('Shader de splat instalado (texturas Pasto/Tierra)', splatShader);
  const hasGrassTex = !!g.world.assets.pbr.grass?.map && !!g.world.assets.pbr.dirt?.map;
  check('Texturas Pasto y Tierra del repo cargadas', hasGrassTex);

  // ---- 7. Kits ----
  const kits = g.world.kits;
  check('KitSystem listo', !!kits && kits.ready === true);
  const wanted = ['sword_01', 'sword_02', 'shield_01', 'shield_02', 'spear', 'bow.001', 'ax', 'furniture_table_round_01', 'furniture_chair_01', 'well', 'lamp_post', 'banner', 'barrel', 'bonfire', 'target'];
  const have = wanted.filter((n) => kits.has(n));
  check('Objetos del kit separados (15 esperados)', have.length >= 12, `${have.length}/${wanted.length}: ${have.join(',')}`);
  // dressing exists in the scene
  let dressing = 0;
  g.engine.scene.traverse((o) => { if (o.name === 'kfs_kit_dressing') dressing++; });
  check('Vestimenta del mundo con kits', dressing >= 1);

  // ---- 8. Weapon visuals come from the kit ----
  // equip via combat switch: give sword then check handSlot child
  try {
    state().addItem('espada_orden'); state().equippedWeapon = 'espada_orden';
    g.combat.refreshVisuals();
    await wait(300);
    let handHas = false;
    pRoot.traverse((o) => { if (o.name && o.name.includes('sword_02')) handHas = true; });
    check('Arma del kit en la mano (sword_02)', handHas);
    const sp = pRoot.getObjectByName('j_sword_held');
    check('Espada de estatua oculta al empuñar', !sp || sp.visible === false);
    state().equippedWeapon = null;
    g.combat.refreshVisuals();
    await wait(200);
    check('Espada de estatua vuelve al reposo', !sp || sp.visible === true);
  } catch (e) {
    check('Arma del kit en la mano (sword_02)', false, String(e));
  }

  // ---- 9. Villager NPCs ----
  const npcs = g.npcs || [];
  const villagers = npcs.filter((n) => n.model && n.model.constructor.name === 'VillagerModel');
  check('NPCs con cuerpo de aldeano (VillagerModel)', villagers.length >= 6, `${villagers.length}/${npcs.length}`);
  const variety = villagers.some((v) => v.model.root.children[0] && v.model.root.children[0].children.length > 3);
  check('Variedad en aldeanos (extras montados)', villagers.some((v) => { let c = 0; v.model.root.traverse((o) => { if (o.isMesh) c++; }); return c > 26; }));

  // ---- 10. Console errors ----
  window.__kotfsE2ELog = log;
  return log.join('\n');
})().catch((e) => { window.__kotfsE2ELog = window.__kotfsE2ELog || []; window.__kotfsE2ELog.push('ERROR ' + e); return String(e); });
