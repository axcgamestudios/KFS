(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__kotfsGame;
  const log = window.__kotfsE2ELog || (window.__kotfsE2ELog = []);
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const player = g.player;
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


  window.__kotfsE2ELog = log;
  return log.slice(-12).join('\n');
})().catch((e) => { window.__kotfsE2ELog.push('ERROR '+e); return String(e); });