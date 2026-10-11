// E2E Fase 4 — A: boot, graphics (assets/trees/grass/LOD), swimming fix
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

  // ---- 1. Menu & version ----
  check('Menú con versión Fase 4', document.body.textContent.includes('v0.4'));
  const startBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.toUpperCase().includes('NUEVA PARTIDA'));
  check('Nueva partida disponible', !!startBtn);
  startBtn.click();
  await wait(2600);
  press('Space'); release('Space');
  await wait(1400);
  check('Q1 activa tras intro', state().currentTracker()?.title === 'El Legado de Eirik');

  // ---- 2. Repository assets loaded (textures PBR + maple) ----
  const assets = g.world.assets;
  const pbrCount = Object.keys(assets.pbr).length;
  check('Texturas PBR del repositorio cargadas', pbrCount >= 7, `pbr=${pbrCount}`);
  check('Texturas de arce cargadas', !!assets.mapleBark && !!assets.mapleLeaf);
  check('Textura de detalle de terreno', !!assets.terrainDetail);
  const matsTextured = [assets.pbr.stone_wall?.map, assets.pbr.wood?.normalMap, assets.pbr.roof_tiles?.roughnessMap].filter(Boolean).length;
  check('Materiales con map/nrm/rgh', matsTextured >= 2, `${matsTextured}/3`);
  // GLB models load async — wait and check
  await wait(2500);
  check('Modelo caballero (GLB) cargado', assets.hasModel('knight_statue.glb'));
  check('Buque insignia (GLB) cargado', assets.hasModel('pirate_ship.glb'));
  check('Gran Arce (GLB) cargado', assets.hasModel('maple_tree.glb'));

  // ---- 3. Forests: 6 species, density, billboard LOD ----
  const veg = g.world.vegetation;
  const stats = veg.stats;
  check('Bosques activos (clusters)', stats.clusters > 20, `clusters=${stats.clusters}`);
  // Species meshes: count instances across scene via info
  const info = g.engine.renderer.info;
  check('Escena dibujada (>100k tris con bosques)', info.render.triangles > 100000, `tris=${info.render.triangles}`);
  // Find a maple instance: teleport near a dense forest area and count visible tree meshes
  g.player.teleport(-140, 8, -160); // forest area west
  await wait(1800);
  // LOD: full detail near
  const nearLod = info.render.triangles;
  check('Detalle completo cerca (tris altos)', nearLod > 80000, `tris=${nearLod}`);
  g.player.teleport(-500, 30, -160); // far from that forest
  await wait(1800);
  const farTris = info.render.triangles;
  check('LOD billboard a distancia (menos tris)', farTris < nearLod, `far=${farTris} vs near=${nearLod}`);
  g.player.teleport(22, 1.6, 250); // back to dock
  await wait(1200);

  // ---- 4. Grass: present near player, absent on roads ----
  let grassMeshes = 0;
  g.engine.scene.traverse((o) => { if (o.isInstancedMesh && o.count > 40 && o.geometry.attributes.position && o.material && o.material.userData === undefined) {} });
  // count via vegetation internal chunkData is private; use scene walk for the grass material (DoubleSide + wind shader)
  g.engine.scene.traverse((o) => {
    if (o.isInstancedMesh && o.count > 60 && o.geometry && o.geometry.boundingSphere && o.geometry.boundingSphere.radius < 2) grassMeshes++;
  });
  check('Hierba 3D instanciada visible', grassMeshes >= 4, `patches=${grassMeshes}`);

  // ---- 5. Weather: force storm ----
  const weather = g.world.weather;
  weather.force('storm');
  await wait(3500);
  check('Tormenta: lluvia activa', weather.rain > 0.5, `rain=${weather.rain.toFixed(2)}`);
  check('Tormenta: nubes cubren el cielo', weather.cloudCover > 0.9, `cloud=${weather.cloudCover.toFixed(2)}`);
  check('Tormenta: viento fuerte', weather.wind > 0.9, `wind=${weather.wind.toFixed(2)}`);
  weather.force('clear');
  await wait(1500);

  // ---- 6. Swimming: state machine + splash + climb-out ----
  // Find the dock's walkable box at runtime (thin box, top 0.5..2.5 m)
  let dockBox = null;
  for (let x = 10; x <= 42; x += 2) {
    for (let z = 222; z <= 264; z += 2) {
      for (const c of g.colliders.query(x, z, 1)) {
        if (c.kind === 'box' && c.maxY - c.minY <= 0.5 && c.maxY > 0.5 && c.maxY < 2.5) {
          if (!dockBox || c.maxX > dockBox.maxX) dockBox = c;
        }
      }
    }
  }
  check('Muelle detectado (plataforma transitable)', !!dockBox, dockBox ? `x:${dockBox.minX.toFixed(0)}..${dockBox.maxX.toFixed(0)} top:${dockBox.maxY.toFixed(2)}` : 'none');
  g.player.teleport(24, 1.6, 250); // ON the dock
  await wait(500);
  check('Sobre el muelle NO nada', !g.player.swimming, `swimming=${g.player.swimming}`);
  // Dive into deep water (depth ~4.6 m at 40,260)
  let splashFired = false;
  g.player.onWaterEvent = (kind) => { if (kind === 'enter') splashFired = true; };
  g.player.teleport(40, 1.2, 260);
  await wait(1600);
  const swimmingNow = g.player.swimming;
  check('Al caer al mar NADA (no camina sobre el agua)', swimmingNow, `y=${g.player.position.y.toFixed(2)}`);
  check('Salpicadura al entrar', splashFired);
  const surf = g.world.water.waveHeightAt(g.player.position.x, g.player.position.z);
  check('Flota sobre la superficie ondulante', swimmingNow && Math.abs(g.player.position.y - surf) < 0.75, `y=${g.player.position.y.toFixed(2)} surf=${surf.toFixed(2)}`);
  // Swim back to the dock end and vault out with Space
  if (dockBox) {
    const cz = (dockBox.minZ + dockBox.maxZ) / 2;
    g.player.teleport(dockBox.maxX + 1.0, 0, cz);
    await wait(700);
    const swimBesideDock = g.player.swimming;
    press('Space'); release('Space');
    await wait(1300);
    const backOnDock = !g.player.swimming && g.player.position.y > dockBox.maxY - 0.5;
    check('Nada junto al muelle (listo para trepar)', swimBesideDock, `y=${g.player.position.y.toFixed(2)}`);
    check('Trepa de vuelta al muelle (Space junto al borde)', backOnDock, `y=${g.player.position.y.toFixed(2)} dockTop=${dockBox.maxY.toFixed(2)}`);
  }
  // Beach exit: swim towards the shore — swimming ends when the water shallows
  g.player.teleport(60, 0.5, 245);
  await wait(900);
  g.player.teleport(30, 0.5, 243);
  await wait(900);
  g.player.teleport(14, 0.5, 240);
  await wait(900);
  const onLand = !g.player.swimming && g.player.position.y > -0.4;
  check('Sale a la playa caminando (transición somera)', onLand, `y=${g.player.position.y.toFixed(2)} swimming=${g.player.swimming}`);

  log.push('PART-A-DONE');
  window.__kotfsE2ELog = log;
  return 'done';
})()
