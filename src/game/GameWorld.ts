import * as THREE from 'three';
import { TerrainHeight } from './world/TerrainHeight';
import { TerrainSystem, CHUNK_SIZE } from './world/TerrainSystem';
import { WaterSystem } from './world/WaterSystem';
import { SkySystem } from './world/SkySystem';
import { VegetationSystem, windTime } from './world/VegetationSystem';
import { StructureStreamer } from './world/StructureStreamer';
import { AssetSystem } from './world/AssetSystem';
import { KitSystem } from './world/KitSystem';
import { dressWithKits } from './world/Dressing';
import { WeatherSystem } from './world/WeatherSystem';
import { buildCastle } from './structures/Castle';
import { buildVillage, type VillageLayout } from './structures/Village';
import {
  buildRuins, buildStoneCircle, buildWatchtower, buildShipwreck, buildGrotto, buildWaterfall, buildDragonLair,
} from './structures/POIs';
import { buildPirateFort, buildFaroRuins, buildBrumaCamp } from './structures/Islands';
import { createChest, createHerb, type ChestHandles } from './structures/Props';
import { StaticBuilder, MAT } from './structures/Materials';
import { buildFase4World, type Fase4Refs } from './structures/Fase4POIs';
import { WildlifeSystem, type NPCDef } from './entities/NPC';
import type { ColliderRegistry } from './systems/ColliderRegistry';
import type { GameState } from './systems/GameState';
import { mulberry32 } from './core/MathUtils';
import { WORLD } from './world/WorldConfig';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  prompt: string;
  available?: () => boolean;
  run: () => void;
}

export interface HerbRef { id: string; pos: THREE.Vector3; mesh: THREE.Group }
export interface ChestRef { id: string; pos: THREE.Vector3; handles: ChestHandles }

export interface WorldRefs {
  terrain: TerrainSystem;
  terrainHeight: TerrainHeight;
  water: WaterSystem;
  sky: SkySystem;
  vegetation: VegetationSystem;
  village: VillageLayout;
  castleGate: THREE.Vector3;
  dummyPos: THREE.Vector3;
  interactables: Interactable[];
  chests: ChestRef[];
  herbs: HerbRef[];
  npcDefs: NPCDef[];
  gulls: WildlifeSystem;
  waterfallSheet: THREE.Mesh;
  waterfallFoam: THREE.Mesh;
  waterfallBasin: THREE.Vector3;
  mapCanvas: HTMLCanvasElement;
  streamer: StructureStreamer;
  /** Dock point where the repaired Colibrí spawns / respawns. */
  dockSpawn: { x: number; z: number; heading: number };
  /** Fase 4 systems: assets, weather and the new POI refs. */
  assets: AssetSystem;
  weather: WeatherSystem;
  fase4: Fase4Refs;
  /** Fase 5 — exploded repository kits (weapons, shields, furniture, props). */
  kits: KitSystem;
}

/** Pre-render the top-down world map (colors + hillshade) for the map UI. */
function renderMapCanvas(terrain: TerrainHeight): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const col: [number, number, number] = [0, 0, 0];
  const half = 1024;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i / (size - 1)) - 0.5) * 2 * half;
      const z = ((j / (size - 1)) - 0.5) * 2 * half;
      const h = terrain.height(x, z);
      const slope = terrain.slope(x, z, h);
      terrain.colorAt(x, z, h, slope, col);
      // Hillshade: light from NW
      const hx = terrain.height(x - 8, z) - h;
      const hz = terrain.height(x, z - 8) - h;
      const shade = Math.max(0.55, Math.min(1.25, 1 + (hx + hz) * 0.04));
      const water = h < 0;
      const idx = (j * size + i) * 4;
      if (water) {
        const deep = Math.min(1, -h / 14);
        img.data[idx] = 30 + (1 - deep) * 40;
        img.data[idx + 1] = 58 + (1 - deep) * 50;
        img.data[idx + 2] = 74 + (1 - deep) * 46;
      } else {
        img.data[idx] = Math.min(255, col[0] * 235 * shade);
        img.data[idx + 1] = Math.min(255, col[1] * 235 * shade);
        img.data[idx + 2] = Math.min(255, col[2] * 235 * shade);
      }
      // Sepia tint for parchment feel
      const avg = (img.data[idx] + img.data[idx + 1] + img.data[idx + 2]) / 3;
      img.data[idx] = Math.min(255, img.data[idx] * 0.9 + avg * 0.12 + 14);
      img.data[idx + 1] = Math.min(255, img.data[idx + 1] * 0.9 + avg * 0.08 + 8);
      img.data[idx + 2] = Math.min(255, img.data[idx + 2] * 0.9 + avg * 0.05);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Builds the entire island of Aldmor: terrain streaming, ocean, sky,
 * castle, village, POIs, props, NPCs and wildlife. Returns every handle
 * the Game needs to run interactions and cinematics.
 */
export async function buildWorld(
  scene: THREE.Scene,
  colliders: ColliderRegistry,
  state: GameState,
  quality: 'low' | 'medium' | 'high' | 'ultra',
  onProgress?: (frac: number, label: string) => void,
): Promise<WorldRefs> {
  const prog = (f: number, l: string) => onProgress?.(f, l);

  prog(0.01, 'Desplegando las velas…');
  await new Promise((r) => setTimeout(r, 30));

  // --- Fase 4: repository assets (PBR textures) load BEFORE the world so
  //     structures receive textured materials right away. ---
  const assets = new AssetSystem();
  prog(0.03, 'Cargando texturas antiguas…');
  await assets.loadCoreTextures(quality === 'low' ? 1 : quality === 'medium' ? 2 : quality === 'high' ? 4 : 8);
  assets.applyToStructureMaterials(MAT as unknown as Record<string, THREE.MeshStandardMaterial>);

  prog(0.06, 'Esculpiendo montañas y valles…');
  const terrainHeight = new TerrainHeight();
  const terrain = new TerrainSystem(terrainHeight, quality, {
    grass: assets.pbr.grass?.map,
    dirt: assets.pbr.dirt?.map,
    stone: assets.pbr.stone_wall?.map,
  });

  const water = new WaterSystem(terrainHeight);
  const sky = new SkySystem();
  scene.add(water.mesh); // ← the ocean surface itself (was missing: water was
  // physically simulated but never rendered, so the player "swam in the air")
  scene.add(sky.dome);
  scene.add(sky.sunLight);
  scene.add(sky.sunLight.target);
  scene.add(sky.hemiLight);

  // --- Fase 4: dynamic weather (rain, storms, wind) ---
  const weather = new WeatherSystem(scene);

  prog(0.10, 'Plantando los bosques antiguos…');
  const vegetation = new VegetationSystem(
    terrainHeight, quality === 'low' ? 0 : quality === 'medium' ? 0.4 : quality === 'high' ? 0.75 : 1, scene,
    assets.mapleBark && assets.mapleLeaf ? { bark: assets.mapleBark, leaf: assets.mapleLeaf } : undefined,
  );
  // Trees are solid trunks: register/unregister colliders with the streaming
  vegetation.setColliderSinks(
    (x, z, r, key) => colliders.add(key, { kind: 'cylinder', x, z, r, minY: -50, maxY: 60 }),
    (prefix) => colliders.removePrefix(prefix),
  );
  terrain.setScatterSink(
    (s) => vegetation.onChunkScatter(s),
    (key) => vegetation.onChunkRemoved(key),
  );
  terrain.attachTo(scene);

  // Distance streaming for structures (culls far draw calls while sailing)
  const streamer = new StructureStreamer();

  prog(0.18, 'Alzando el Castillo de Aldmor…');
  const castleB = new StaticBuilder(colliders, 'castle');
  const castle = buildCastle(castleB, terrainHeight);
  const castleGroup = new THREE.Group();
  castleB.build(castleGroup, { shadows: true });
  scene.add(castleGroup);
  streamer.register(castleGroup, WORLD.castlePos.x, WORLD.castlePos.z, 60);

  prog(0.3, 'Construyendo Puerto Cuervo…');
  const village = buildVillage(scene, terrainHeight, colliders);
  streamer.register(village.mainGroup, 20, 175, 110);
  streamer.register(village.staticShip, village.shipPos.x, village.shipPos.z, 30);

  // --- Fase 5: the repository kits dress the world where they belong ---
  prog(0.34, 'Desplegando los kits del estudio…');
  const kits = new KitSystem(assets);
  await kits.load();
  const dressed = dressWithKits(scene, terrainHeight, colliders, kits, {
    tavernDoor: village.tavernDoor,
    squareCenter: village.squareCenter,
    castleGate: castle.gatePos,
  });
  streamer.register(dressed, 20, 200, 150);

  prog(0.45, 'Sembrando ruinas y misterios…');
  const ruinsB = new StaticBuilder(colliders, 'ruins');
  const ruins = buildRuins(ruinsB, terrainHeight);
  const stonesB = new StaticBuilder(colliders, 'stones');
  const stones = buildStoneCircle(stonesB, terrainHeight);
  const towerB = new StaticBuilder(colliders, 'tower');
  const tower = buildWatchtower(towerB, terrainHeight);
  const wreckB = new StaticBuilder(colliders, 'wreck');
  const wreck = buildShipwreck(wreckB, terrainHeight);
  const grottoB = new StaticBuilder(colliders, 'grotto');
  const grotto = buildGrotto(grottoB, terrainHeight);
  const fallsB = new StaticBuilder(colliders, 'falls');
  const falls = buildWaterfall(fallsB, terrainHeight);
  for (const [b, pos] of [[ruinsB, { x: -240, z: -140 }], [stonesB, { x: -140, z: -260 }], [towerB, { x: 300, z: 64 }], [wreckB, { x: -334, z: 186 }], [grottoB, { x: 200, z: -180 }], [fallsB, { x: -95, z: -195 }]] as Array<[StaticBuilder, { x: number; z: number }]>) {
    const grp = new THREE.Group();
    b.build(grp, { shadows: true });
    scene.add(grp);
    streamer.register(grp, pos.x, pos.z, 40);
  }
  scene.add(falls.sheet);
  scene.add(falls.foam);

  prog(0.52, 'Alzando la Fortaleza del Cuervo…');
  const fortB = new StaticBuilder(colliders, 'fort');
  const fort = buildPirateFort(fortB, terrainHeight);
  const fortGroup = new THREE.Group();
  fortB.build(fortGroup, { shadows: true });
  scene.add(fortGroup);
  streamer.register(fortGroup, -570, -515, 70);

  prog(0.56, 'Excavando el Farallón del Faro…');
  const faroB = new StaticBuilder(colliders, 'faro');
  const faro = buildFaroRuins(faroB, terrainHeight);
  const faroGroup = new THREE.Group();
  faroB.build(faroGroup, { shadows: true });
  scene.add(faroGroup);
  streamer.register(faroGroup, 652, 128, 45);

  prog(0.58, 'Tendiendo el campamento de la Bruma…');
  const brumaB = new StaticBuilder(colliders, 'bruma');
  const bruma = buildBrumaCamp(brumaB, terrainHeight);
  const brumaGroup = new THREE.Group();
  brumaB.build(brumaGroup, { shadows: true });
  scene.add(brumaGroup);
  streamer.register(brumaGroup, -80, 748, 30);

  prog(0.60, 'Alzando el Nido del Ancestro…');
  const lairB = new StaticBuilder(colliders, 'lair');
  const lair = buildDragonLair(lairB, terrainHeight);
  const lairGroup = new THREE.Group();
  lairB.build(lairGroup, { shadows: true });
  scene.add(lairGroup);
  streamer.register(lairGroup, 20, -300, 55);
  void lair.lockStone;

  prog(0.62, 'Escondiendo tesoros entre las rocas…');
  const chests: ChestRef[] = [];
  const herbs: HerbRef[] = [];

  const addChest = (id: string, x: number, z: number, rotY: number) => {
    const y = terrainHeight.height(x, z);
    const handles = createChest(x, y, z, rotY, scene, colliders);
    chests.push({ id, pos: new THREE.Vector3(x, y, z), handles });
  };
  // Eirik's chest is already created by the village builder
  chests.push({ id: 'chest_eirik', pos: village.eirikChestPos, handles: village.eirikChest });
  addChest('chest_grotto', -183 + 3.2, -180 - 5.5 + 0.2, 2.4); // grotto interior
  addChest('chest_wreck', -334, 186, 0.9);
  addChest('chest_falls', -101, -199, -0.6);
  addChest('chest_crow', fort.chestPos.x, fort.chestPos.z, 0.8);
  addChest('chest_faro', faro.chestPos.x, faro.chestPos.z, 1.2);
  addChest('chest_bruma', bruma.chestPos.x, bruma.chestPos.z, -0.5);
  addChest('chest_lanza', 295.5, 60.5, 0.8);   // watchtower base — la Lanza de Caza
  addChest('chest_arco', -77, 750.5, 1.9);     // mist isles camp — el Arco del Naufragio
  // Fase 4 treasure hunt chests
  addChest('chest_tesoro', -183 + 4.8, -180 - 7.2, 2.9);  // grotto — el mapa del Capitán
  addChest('chest_antigua_1', 632, 148, 0.5);             // faro plateau terrace
  addChest('chest_antigua_2', -134, -262, 1.8);           // stone circle edge
  addChest('chest_antigua_3', -336, 192, -1.1);           // west wreck coast

  // Shipwright material crates (oak for the Colibrí refit)
  const crateB = new StaticBuilder(colliders, 'crates');
  const woodCrates: Array<[string, number, number]> = [
    ['crate_madera_a', 17.5, 231.5],   // by the home pier
    ['crate_madera_b', -326, 183],     // west wreck coast
    ['crate_madera_c', -100, -188],    // falls trail
  ];
  for (const [, x, z] of woodCrates) {
    const y = terrainHeight.height(x, z);
    crateB.solidBox('woodDark', 1.05, 1.05, 1.05, x, y + 0.5, z, 0.3);
    crateB.box('gold', 1.12, 0.1, 0.14, x, y + 0.72, z, 0.3);
  }
  const crateGroup = new THREE.Group();
  crateB.build(crateGroup, { shadows: true });
  scene.add(crateGroup);

  // Herb spots (pétalos de marfil)
  const herbSpots: Array<[string, number, number]> = [
    ['herb_1', -80, -178],
    ['herb_2', -98, -190],
    ['herb_3', -252, -150],
    ['herb_4', -135, -245],
    ['herb_5', 35, 95],
  ];
  for (const [id, x, z] of herbSpots) {
    const y = terrainHeight.height(x, z);
    herbs.push({ id, pos: new THREE.Vector3(x, y, z), mesh: createHerb(x, y, z, scene) });
  }
  // A few extra petals near the falls trail for generous players
  const extraSpots: Array<[string, number, number]> = [
    ['herb_6', -70, -160],
    ['herb_7', -230, -128],
  ];
  for (const [id, x, z] of extraSpots) {
    const y = terrainHeight.height(x, z);
    herbs.push({ id, pos: new THREE.Vector3(x, y, z), mesh: createHerb(x, y, z, scene) });
  }

  prog(0.74, 'Despertando a los aldeanos…');
  const g = (x: number, z: number) => terrainHeight.height(x, z);
  const npcDefs: NPCDef[] = [
    {
      id: 'aldric', name: 'Maestre Aldric', paletteIndex: 1, cape: true, dialogueId: 'aldric',
      home: new THREE.Vector3(29, g(29, 233), 233),
      work: new THREE.Vector3(27, g(27, 218), 218),
      evening: new THREE.Vector3(12, g(12, 173), 173),
      nightAtHome: true,
    },
    {
      id: 'maren', name: 'Maren la Herborista', paletteIndex: 3, dialogueId: 'maren',
      home: new THREE.Vector3(8, g(8, 207), 207),
      work: new THREE.Vector3(9.5, g(9.5, 208), 208),
      evening: new THREE.Vector3(8, g(8, 207), 207),
      nightAtHome: true,
    },
    {
      id: 'bram', name: 'Bram el Herrero', paletteIndex: 0, dialogueId: 'bram',
      home: new THREE.Vector3(39, g(39, 185), 185),
      work: new THREE.Vector3(28, g(28, 193), 193),
      evening: new THREE.Vector3(12, g(12, 172), 172),
      nightAtHome: true,
    },
    {
      id: 'rosa', name: 'Rosa, tabernera', paletteIndex: 2, dialogueId: 'rosa',
      home: new THREE.Vector3(11, g(11, 168), 168),
      work: new THREE.Vector3(11, g(11, 172), 172),
      evening: new THREE.Vector3(10, g(10, 173), 173),
      nightAtHome: false,
    },
    {
      id: 'tom', name: 'Tom el Pescador', paletteIndex: 4, dialogueId: 'tom',
      home: new THREE.Vector3(36, g(36, 234), 234),
      work: new THREE.Vector3(18, g(18, 226), 226),
      evening: new THREE.Vector3(13, g(13, 171), 171),
      nightAtHome: true,
    },
    {
      id: 'elin', name: 'Elin, tendera', paletteIndex: 3, dialogueId: 'elin',
      home: new THREE.Vector3(9, g(9, 137), 137),
      work: new THREE.Vector3(17, g(17, 145), 145),
      evening: new THREE.Vector3(14, g(14, 174), 174),
      nightAtHome: true,
    },
    {
      id: 'jorund', name: 'Guardia Jorund', paletteIndex: 1, cape: true, dialogueId: 'jorund',
      home: new THREE.Vector3(50, g(50, 100), 100),
      work: new THREE.Vector3(40, g(40, 115), 115),
      evening: new THREE.Vector3(45, g(45, 108), 108),
      nightAtHome: false,
    },
    {
      id: 'sigrid', name: 'Sigrid la Lavandera', paletteIndex: 4, dialogueId: 'sigrid',
      home: new THREE.Vector3(32, g(32, 160), 160),
      work: new THREE.Vector3(22, g(22, 152), 152),
      evening: new THREE.Vector3(15, g(15, 175), 175),
      nightAtHome: true,
    },
    {
      id: 'halvard', name: 'Halvard el Herrador', paletteIndex: 0, cape: true, dialogueId: 'halvard',
      home: new THREE.Vector3(34, g(34, 150), 150),
      work: new THREE.Vector3(34, g(34, 153), 153),
      evening: new THREE.Vector3(12, g(12, 173), 173),
      nightAtHome: true,
    },
  ];

  prog(0.82, 'Soltando gaviotas sobre la bahía…');
  const gulls = new WildlifeSystem(scene, new THREE.Vector3(20, 3, 240), 9);

  // --- Fase 4 world: sunken sanctuary, crow cove, flagship wreck,
  //     Great Maple, stable, dig spot, fish spots, altars ---
  prog(0.86, 'Despertando al Cuervo de Tres Cabezas…');
  const fase4 = buildFase4World(scene, terrainHeight, colliders, assets);
  for (const gr of fase4.groups) {
    streamer.register(gr.group, gr.x, gr.z, gr.r);
  }

  prog(0.90, 'Trazando el mapa de Aldmor…');
  const mapCanvas = renderMapCanvas(terrainHeight);

  // Restore opened chests / picked herbs from a loaded save
  for (const c of chests) {
    if (state.openedChests.has(c.id)) {
      c.handles.open();
    }
  }
  for (const h of herbs) {
    if (state.pickedHerbs.has(h.id)) {
      h.mesh.visible = false;
    }
  }

  prog(0.97, 'Listo para zarpar…');

  // Dock spawn for the Colibrí: scan outward from the pier end into deep water
  let dockX = 20, dockZ = 258;
  for (let i = 0; i < 30; i++) {
    const zx = 20 + i * 2;
    if (terrainHeight.height(zx, dockZ) < -2.4) { dockX = zx + 2; break; }
  }
  const dockSpawn = { x: dockX, z: dockZ, heading: 0 };

  return {
    terrain, terrainHeight, water, sky, vegetation,
    village,
    castleGate: castle.gatePos,
    dummyPos: castle.dummyPos,
    interactables: [],
    chests,
    herbs,
    npcDefs,
    gulls,
    waterfallSheet: falls.sheet,
    waterfallFoam: falls.foam,
    waterfallBasin: falls.basin,
    mapCanvas,
    streamer,
    dockSpawn,
    assets,
    weather,
    fase4,
    kits,
  };
}

export { CHUNK_SIZE, windTime };
