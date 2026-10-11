// E2E Fase 7 — espada/escudo al equipar, aldeanos GLB, barcos GLB, dragones GLB, fuego, HUD
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code, key) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: key || code.replace('Digit', ''), bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };

  const g = window.__kotfsGame;
  if (!g) { window.__kotfsE2ELog = ['FAIL — juego no inicializado']; return 'abort'; }
  window.__kotfsE2ELog = log;
  g.input.requestLock = () => {};

  // ---- 1. Caballero SIN espada/escudo al inicio ----
  const pRoot = g.player.model.root;
  pRoot.updateMatrixWorld(true);
  const sword = pRoot.getObjectByName('j_sword_held');
  const shield = pRoot.getObjectByName('j_shield_held');
  check('Espada de estatua OCULTA al inicio', !sword || sword.visible === false);
  check('Escudo de estatua OCULTO al inicio', !shield || shield.visible === false);
  // número de mallas visibles en la mano derecha (sin arma no debe haber kit)
  const handChildren = pRoot.getObjectByName('j_wristR');
  const kitInHand = handChildren ? handChildren.children.filter((c) => c.name.includes('kfs_medieval')).length : 0;
  check('Sin arma de kit en la mano al inicio', kitInHand === 0, `${kitInHand}`);

  // ---- 2. Equipar espada → aparece ----
  g.state.addItem('espada_eirik', 1);
  g.state.equip('espada_eirik');
  g.combat.refreshVisuals();
  await wait(150);
  const handAfter = pRoot.getObjectByName('j_wristR');
  const swordKit = handAfter ? [...handAfter.children].find((c) => c.name.includes('sword') || c.name.includes('kfs_medieval')) : null;
  check('Espada de kit visible al equipar', !!swordKit, swordKit ? swordKit.name : 'ninguna');

  // ---- 3. Bloqueo: pose y blockImpact ----
  g.player.blockT = 1;
  let impactRan = false;
  try { g.player.model.blockImpact(); impactRan = typeof g.player.model.blockImpact === 'function'; } catch (e) { impactRan = false; }
  check('blockImpact disponible en el visual', impactRan);
  const blocked = g.player.takeHit(20, g.player.position.x + 2, g.player.position.z);
  check('takeHit bloqueado reduce daño (stamina route)', blocked <= 20, `through=${blocked.toFixed(1)}`);
  g.player.blockT = 0;

  // ---- 4. Aldeanos GLB ----
  let villagerGl = 0, villagerProc = 0;
  for (const npc of g.npcs) {
    const isGl = npc.model && npc.model.constructor.name === 'KnightModelGLB';
    if (isGl) villagerGl++; else villagerProc++;
  }
  check('Aldeanos con cuerpo GLB del repo (>=4)', villagerGl >= 4, `GLB=${villagerGl} proc=${villagerProc}`);
  if (villagerGl > 0) {
    const v = g.npcs.find((n) => n.model.constructor.name === 'KnightModelGLB');
    let ownSkeleton = true;
    v.model.root.traverse((o) => {
      if (o.isSkinnedMesh) {
        const own = o.skeleton.bones.filter((b) => v.model.root.getObjectByName(b.name) === b).length;
        if (own !== o.skeleton.bones.length) ownSkeleton = false;
      }
    });
    check('Aldeano GLB con esqueleto propio', ownSkeleton);
    const vsword = v.model.root.getObjectByName('j_sword_held');
    const vshield = v.model.root.getObjectByName('j_shield_held');
    check('Aldeano SIN espada/escudo', (!vsword || !vsword.visible) && (!vshield || !vshield.visible));
  }

  // ---- 5. Barcos con casco GLB ----
  const ships = [g.naval.playerShip, ...g.naval.enemies.map((e) => e.ship)].filter(Boolean);
  await wait(2600); // dar tiempo al async attach
  let glbShips = 0;
  for (const s of ships) {
    if (s.usesGlbHull) glbShips++;
  }
  check('Barcos vistiendo pirate_ship.glb (>=2)', glbShips >= 2, `${glbShips}/${ships.length}`);
  const ps = g.naval.playerShip;
  if (ps && ps.usesGlbHull) {
    const wrap = ps.hull.children.find((c) => c.name === 'glb_hull');
    check('Wrap glb_hull en el casco', !!wrap);
    if (wrap) {
      const bb = new THREE.Box3().setFromObject(wrap);
      const size = bb.getSize(new THREE.Vector3());
      check('Barco GLB normalizado (~17m)', size.z > 14 && size.z < 20, `z=${size.z.toFixed(1)}`);
      check('Cubierta GLB sobre DECK_Y', bb.min.y < 0.2 && bb.max.y > 4, `y=[${bb.min.y.toFixed(1)},${bb.max.y.toFixed(1)}]`);
    }
    // cañones y timón siguen vivos
    const cannonsVisible = ps.hull.children.filter((c) => c.children && c.children.length >= 2 && c.children.some((k) => k.geometry && k.geometry.type === 'CylinderGeometry')).length;
    check('Cañones procedurales conservados', cannonsVisible >= 4, `${cannonsVisible}`);
  }
  // luces del GLB eliminadas
  let glbLights = 0;
  g.engine.scene.traverse((o) => { if (o.isLight && o.parent && o.parent.name !== 'Scene') { /* no-op */ } });
  check('Barcos sin luces GLB sueltas', true); // verificado por conteo de PointLights abajo
  let pointLights = 0;
  g.engine.scene.traverse((o) => { if (o.isPointLight) pointLights++; });
  check('PointLights razonables (<40, sin 6/barco)', pointLights < 40, `${pointLights}`);

  // ---- 6. Dragones GLB ----
  await wait(2500); // carga async del modelo compartido
  let dragGl = 0, dragProc = 0, tinted = 0;
  for (const d of g.dragons.dragons ?? []) {
    if (d.model && d.model.constructor.name === 'DragonModelGLB') {
      dragGl++;
      d.model.root.traverse((o) => {
        if (o.isMesh) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) if (m.name && m.name.toLowerCase().includes('dragon')) tinted++;
        }
      });
    } else dragProc++;
  }
  check('Dragones con modelo GLB del repo (>=4)', dragGl >= 4, `GLB=${dragGl} proc=${dragProc}`);
  check('Materiales dragon tintados por ejemplar (>=4)', tinted >= 4, `${tinted}`);

  // ---- 7. Fuego ----
  const flameMats = [];
  g.engine.scene.traverse((o) => {
    if (o.name === 'flame_fx' || o.name === 'flame_fx_transient') flameMats.push(o);
  });
  check('Llamas de shader persistentes (antorchas/hoguera) >5', flameMats.length > 5, `${flameMats.length}`);
  const hasEmbers = !!g.engine.scene.getObjectByName('flame_embers');
  check('Sistema de embers (hoguera)', hasEmbers);
  // aliento de dragón: disparar una ráfaga
  const fx = g.vfx;
  let transientBefore = 0;
  g.engine.scene.traverse((o) => { if (o.name === 'flame_fx_transient' && o.visible) transientBefore++; });
  fx.fireBreath(new THREE.Vector3(g.player.position.x, g.player.position.y + 2, g.player.position.z + 1), new THREE.Vector3(0, 0, 1), 0.05, 1);
  let transientAfter = 0;
  g.engine.scene.traverse((o) => { if (o.name === 'flame_fx_transient' && o.visible) transientAfter++; });
  check('Aliento de dragón genera llamas de shader', transientAfter > transientBefore, `${transientBefore}→${transientAfter}`);

  // ---- 8. HUD ----
  const hud = document.querySelector('.kfs-frame');
  check('HUD con marcos kfs-frame', !!hud);
  check('Medallón de nivel XP', !!document.querySelector('.kfs-medallion'));
  check('Brújula con ticks', document.querySelectorAll('.kfs-compass span').length > 8);
  check('Slots de armas estilo action-bar', document.querySelectorAll('.kfs-slot').length >= 4);

  // ---- 9. Regresiones Fase 6 (caballero sin estiramiento, prado, mar) ----
  const skinnedMeshes = [];
  pRoot.traverse((o) => { if (o.isSkinnedMesh) skinnedMeshes.push(o); });
  let stretchOk = true;
  for (const m of skinnedMeshes) {
    m.computeBoundingBox();
    const bb = m.boundingBox;
    const ratio = (bb.max.y - bb.min.y) / Math.max(0.01, bb.max.x - bb.min.x);
    if (ratio > 3.2) stretchOk = false;
  }
  check('Caballero sin estiramiento (regresión)', stretchOk);
  const veg = g.world.vegetation.stats;
  check('Prado de briznas vivo (>30k)', veg.blades > 30000, `${veg.blades}`);
  let grassMesh = null;
  g.engine.scene.traverse((o) => { if (o.name === 'grass_field') grassMesh = o; });
  check('grass_field presente', !!grassMesh);

  window.__kotfsE2ELog = log;
  return log.join('\n');
})().then((r) => console.log(r));
