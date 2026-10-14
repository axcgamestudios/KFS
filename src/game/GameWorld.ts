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
import { mergeStaticGroup } from './world/MergeUtils';
import { WeatherSystem } from './world/WeatherSystem';
import { buildCastle } from './structures/Castle';
import { buildVillage, type VillageLayout } from './structures/Village';
import {
  buildRuins, buildStoneCircle, buildWatchtower, buildShipwreck, buildGrotto, buildWaterfall, buildDragonLair,
} from './structures/POIs';
import { buildPirateFort, buildFaroRuins, buildBrumaCamp, buildCrowSettlement } from './structures/Islands';
import { buildNavelIsland, type NavelRefs } from './structures/NavelIsland';
import { buildSmithy } from './structures/Smithy';
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
  /** Fase 15 — the Navel of the Sea: horn altar + King of the Sea arena. */
  navel: NavelRefs;
}

/** Pre-render the top-down world map (colors + hillshade) for the map UI. */
function renderMapCanvas(terrain: TerrainHeight): HTMLCanvasElement {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const col: [number, number, number] = [0, 0, 0];
  const half = 716;
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
  quality: 'xlow' | 'low' | 'medium' | 'high' | 'ultra',
  onProgress?: (frac: number, label: string) => void,
  gfx?: { renderChunks?: number; grass3d?: boolean; grassDensity?: number },
): Promise<WorldRefs> {
  const prog = (f: number, l: string) => onProgress?.(f, l);

  prog(0.01, 'Unfurling the sails…');
  await new Promise((r) => setTimeout(r, 30));

  // --- Fase 4: repository assets (PBR textures) load BEFORE the world so
  //     structures receive textured materials right away. ---
  const assets = new AssetSystem();
  prog(0.03, 'Loading ancient textures…');
  await assets.loadCoreTextures(quality === 'xlow' || quality === 'low' ? 1 : quality === 'medium' ? 2 : quality === 'high' ? 4 : 8);
  assets.applyToStructureMaterials(MAT as unknown as Record<string, THREE.MeshStandardMaterial>);

  prog(0.06, 'Carving mountains and valleys…');
  const terrainHeight = new TerrainHeight();
  const terrain = new TerrainSystem(terrainHeight, quality, {
    grass: assets.pbr.grass?.map,
    dirt: assets.pbr.dirt?.map,
    stone: assets.pbr.stone_wall?.map,
  }, gfx?.renderChunks);

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

  prog(0.10, 'Planting the ancient forests…');
  // Fase 13 — densidad inicial del pasto: interruptor del jugador si llegó,
  // escalón de calidad en caso contrario.
  const baseGrass = quality === 'xlow' || quality === 'low' ? 0 : quality === 'medium' ? 0.26 : quality === 'high' ? 0.65 : 1;
  // Fase 14 — sin suelo artificial: la densidad del escalón, tal cual.
  const initialGrass = gfx ? (gfx.grass3d ? (gfx.grassDensity ?? 0.5) : 0) : baseGrass;
  const vegetation = new VegetationSystem(
    terrainHeight, initialGrass, scene,
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

  prog(0.18, 'Raising Aldmor Castle…');
  const castleB = new StaticBuilder(colliders, 'castle');
  const castle = buildCastle(castleB, terrainHeight);
  const castleGroup = new THREE.Group();
  castleB.build(castleGroup, { shadows: true });
  scene.add(castleGroup);
  streamer.register(castleGroup, WORLD.castlePos.x, WORLD.castlePos.z, 80);

  prog(0.3, 'Building Crowhaven…');
  const village = buildVillage(scene, terrainHeight, colliders);
  streamer.register(village.mainGroup, 20, 175, 110);
  streamer.register(village.staticShip, village.shipPos.x, village.shipPos.z, 30);

  // Fase 21 — PREGENERATE the terrain around the spawn DURING LOADING. The
  // world used to stream in over the first seconds of play: every one of
  // those frames built chunks (the launch stutter). The island is now whole
  // when the hero opens their eyes (far rings at LOD res 16, near at full).
  {
    const sp = village.spawnPoint;
    await terrain.pregenerate(sp.x, sp.z, (d, t) => {
      prog(0.30 + 0.04 * (d / Math.max(1, t)), 'Shaping the homeland…');
    });
    prog(0.35, 'Sowing the home meadow…');
    vegetation.prefillGrass(sp.x, sp.z);
    // the clusters around the spawn build now too (nearest first)
    vegetation.update(sp.x, sp.z);
    for (let i = 0; i < 40; i++) vegetation.update(NaN, NaN);
  }

  // --- Fase 5: the repository kits dress the world where they belong ---
  prog(0.34, 'Furnishing the world…');
  const kits = new KitSystem(assets);
  await kits.load();
  const dressed = dressWithKits(scene, terrainHeight, colliders, kits, {
    tavernDoor: village.rosaDoor,
    squareCenter: village.squareCenter,
    castleGate: castle.gatePos,
  });
  // Fase 14 — los ~45 props del vestuario pasan de 150-200 meshes a ~30
  // buffers fusionados por material (mismo visual, una fracción de draws).
  const merged = mergeStaticGroup(dressed);
  if (typeof console !== 'undefined') {
    console.info(`[KFS] kits fusionados: ${merged.before} meshes → ${merged.after} draw batches`);
  }
  streamer.register(dressed, 20, 200, 150);

  prog(0.45, 'Sowing ruins and mysteries…');
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

  prog(0.52, 'Raising the Fortress of the Crow…');
  const fortB = new StaticBuilder(colliders, 'fort');
  const fort = buildPirateFort(fortB, terrainHeight);
  const fortGroup = new THREE.Group();
  fortB.build(fortGroup, { shadows: true });
  scene.add(fortGroup);
  streamer.register(fortGroup, -490, -445, 70);

  // Fase 18 — THE CROW SETTLEMENT: longhouse, boat-yard, lookout, caches
  prog(0.55, 'Settling the crow’s nest…');
  const crowB = new StaticBuilder(colliders, 'crowset');
  const crowSet = buildCrowSettlement(crowB, terrainHeight);
  const crowGroup = new THREE.Group();
  crowB.build(crowGroup, { shadows: true });
  scene.add(crowGroup);
  streamer.register(crowGroup, -500, -420, 110);

  prog(0.56, 'Carving out the Lighthouse Sea Stack…');
  const faroB = new StaticBuilder(colliders, 'faro');
  const faro = buildFaroRuins(faroB, terrainHeight);
  const faroGroup = new THREE.Group();
  faroB.build(faroGroup, { shadows: true });
  scene.add(faroGroup);
  streamer.register(faroGroup, 567, 116, 45);

  prog(0.58, 'Pitching camp in the Mist Isles…');
  const brumaB = new StaticBuilder(colliders, 'bruma');
  const bruma = buildBrumaCamp(brumaB, terrainHeight);
  const brumaGroup = new THREE.Group();
  brumaB.build(brumaGroup, { shadows: true });
  scene.add(brumaGroup);
  streamer.register(brumaGroup, -60, 578, 30);

  // ---- Fase 15 — EL OMBLIGO DEL MAR: the sea-center summon island ----
  prog(0.585, 'Raising the monoliths of the Navel…');
  const navel = buildNavelIsland(scene, terrainHeight, colliders);
  streamer.register(navel.group, navel.x, navel.z, 90);

  // ---- Fase 16 — LA HERRERÍA: the merchants' establishments (white concrete) ----
  prog(0.59, 'Lighting the forges…');
  // Torvald — the standard smithy stays by the castle road (level 6 shop)
  const torvaldB = new StaticBuilder(colliders, 'smithy_std');
  const torvald = buildSmithy(torvaldB, terrainHeight, { x: 52, z: 116, yaw: -0.75 });
  const torvaldGroup = new THREE.Group();
  torvaldB.build(torvaldGroup, { shadows: true });
  scene.add(torvaldGroup);
  streamer.register(torvaldGroup, 52, 116, 26);
  // Fase 18 — BORIN MOVED INTO THE VILLAGE: the dwarf blacksmith now works
  // from his own slate-roofed cottage by the dock road (buildVillage builds
  // the cabin + forge interior; his npcDef + shop coords point here too).
  void torvald.anvilPos; void torvald.forgePos; // (layout refs; keep for future props)

  prog(0.60, 'Raising the Ancestor’s Nest…');
  const lairB = new StaticBuilder(colliders, 'lair');
  const lair = buildDragonLair(lairB, terrainHeight);
  const lairGroup = new THREE.Group();
  lairB.build(lairGroup, { shadows: true });
  scene.add(lairGroup);
  streamer.register(lairGroup, 20, -300, 55);
  void lair.lockStone;

  prog(0.62, 'Hiding treasures among the rocks…');
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
  // Fase 18 — the crow settlement smuggler caches
  addChest('chest_crow_settlement', crowSet.chests[0].x, crowSet.chests[0].z, 1.6);
  addChest('chest_crow_cove', crowSet.chests[1].x, crowSet.chests[1].z, -0.7);
  addChest('chest_crow_lookout', crowSet.chests[2].x, crowSet.chests[2].z, 2.1);
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

  // Herb spots (pétalos de marfil) — Fase 8: the FIRST collect quest must be
  // a stroll, not an expedition. Five petals bloom right around the village
  // (square, meadow and the path to the docks); a few distant extras reward
  // the curious.
  const herbSpots: Array<[string, number, number]> = [
    ['herb_1', 36, 142],    // east of the square
    ['herb_2', 5, 152],     // west meadow
    ['herb_3', 16, 126],    // north meadow
    ['herb_4', 34, 163],    // by the road to the docks
    ['herb_5', 10, 134],    // NW corner
  ];
  for (const [id, x, z] of herbSpots) {
    const y = terrainHeight.height(x, z);
    herbs.push({ id, pos: new THREE.Vector3(x, y, z), mesh: createHerb(x, y, z, scene) });
  }
  // A few extra petals far afield for generous players (same as before)
  const extraSpots: Array<[string, number, number]> = [
    ['herb_6', -80, -178],
    ['herb_7', -98, -190],
    ['herb_8', 35, 95],
  ];
  for (const [id, x, z] of extraSpots) {
    const y = terrainHeight.height(x, z);
    herbs.push({ id, pos: new THREE.Vector3(x, y, z), mesh: createHerb(x, y, z, scene) });
  }

  prog(0.74, 'Waking the villagers…');
  const g = (x: number, z: number) => terrainHeight.height(x, z);
  const npcDefs: NPCDef[] = [
    {
      // Fase 18 — Aldric's cottage stands west of the green (his study keeps
      // Eirik's sea chest); evenings he joins the fountain square.
      id: 'aldric', name: 'Maester Aldric', paletteIndex: 1, cape: true, dialogueId: 'aldric',
      home: new THREE.Vector3(-14, g(-14, 160), 160),
      work: new THREE.Vector3(-11.5, g(-11.5, 161.5), 161.5),
      evening: new THREE.Vector3(22, g(22, 148), 148),
      nightAtHome: true,
    },
    {
      // Fase 18 — Maren lost her hut: she tends the garden nook by the green.
      id: 'maren', name: 'Maren the Herbalist', paletteIndex: 3, dialogueId: 'maren',
      home: new THREE.Vector3(-6, g(-6, 152), 152),
      work: new THREE.Vector3(-5, g(-5, 153.5), 153.5),
      evening: new THREE.Vector3(23, g(23, 147), 147),
      nightAtHome: true,
    },
    {
      // Fase 18 — Bram's cottage + forge, east of the green.
      id: 'bram', name: 'Bram the Blacksmith', paletteIndex: 0, dialogueId: 'bram',
      home: new THREE.Vector3(40, g(40, 171), 171),
      work: new THREE.Vector3(37, g(37, 172.5), 172.5),
      evening: new THREE.Vector3(21, g(21, 146), 146),
      nightAtHome: true,
    },
    {
      // Fase 18 — Rosa's hearth-cottage south of the fountain (the village inn).
      id: 'rosa', name: 'Rosa the Innkeeper', paletteIndex: 2, dialogueId: 'rosa',
      home: new THREE.Vector3(2, g(2, 176), 176),
      work: new THREE.Vector3(3.5, g(3.5, 174), 174),
      evening: new THREE.Vector3(18, g(18, 152), 152),
      nightAtHome: false,
    },
    {
      // Fase 18 — Tom's cabin by the northern beach; he still works the pier.
      id: 'tom', name: 'Tom the Fisherman', paletteIndex: 4, dialogueId: 'tom',
      home: new THREE.Vector3(0, g(0, 138), 138),
      work: new THREE.Vector3(18, g(18, 226), 226),
      evening: new THREE.Vector3(17, g(17, 151), 151),
      nightAtHome: true,
    },
    {
      // Fase 18 — Erica's cottage east of the green (her shop counter is inside).
      id: 'elin', name: 'Erica the Shopkeeper', paletteIndex: 3, dialogueId: 'elin',
      home: new THREE.Vector3(36, g(36, 143), 143),
      work: new THREE.Vector3(33, g(33, 145), 145),
      evening: new THREE.Vector3(19, g(19, 153), 153),
      nightAtHome: true,
    },
    {
      id: 'jorund', name: 'Guard Jorund', paletteIndex: 1, cape: true, dialogueId: 'jorund',
      home: new THREE.Vector3(50, g(50, 100), 100),
      work: new THREE.Vector3(40, g(40, 115), 115),
      evening: new THREE.Vector3(45, g(45, 108), 108),
      nightAtHome: false,
    },
    {
      // Fase 18 — Sigrid washes by the fountain green.
      id: 'sigrid', name: 'Sigrid the Laundress', paletteIndex: 4, dialogueId: 'sigrid',
      home: new THREE.Vector3(24, g(24, 158), 158),
      work: new THREE.Vector3(26, g(26, 158), 158),
      evening: new THREE.Vector3(22, g(22, 150), 150),
      nightAtHome: true,
    },
    {
      // Fase 18 — Halvard keeps the new stable west of the green.
      id: 'halvard', name: 'Halvard the Farrier', paletteIndex: 0, cape: true, dialogueId: 'halvard',
      home: new THREE.Vector3(-13, g(-13, 186), 186),
      work: new THREE.Vector3(-11, g(-11, 189), 189),
      evening: new THREE.Vector3(20, g(20, 148), 148),
      nightAtHome: true,
    },
    // ---- Fase 16 — LA HERRERÍA: los dos comerciantes ----
    {
      // Torvald — the standard smith, by the castle road (level 6 shop)
      id: 'herrero', name: 'Torvald the Blacksmith', paletteIndex: 0, role: 'smith', dialogueId: 'herrero',
      home: new THREE.Vector3(52, g(52, 116), 116),
      work: new THREE.Vector3(52, g(52, 116), 116),
      evening: new THREE.Vector3(20, g(20, 150), 150),
      nightAtHome: false,
    },
    {
      // Fase 18 — Borin moved INTO the village: his dwarf cottage + forge
      // stands by the dock road (0, 206), matching the shop coords.
      id: 'enano', name: 'Borin the Dwarf', paletteIndex: 2, role: 'smith', dialogueId: 'enano',
      scale: [1.22, 0.64, 1.22], // dwarf proportions: short & wide
      home: new THREE.Vector3(0, g(0, 206), 206),
      work: new THREE.Vector3(2, g(2, 204), 204),
      evening: new THREE.Vector3(0, g(0, 206), 206),
      nightAtHome: true,
    },
  ];

  prog(0.82, 'Releasing gulls over the bay…');
  const gulls = new WildlifeSystem(scene, new THREE.Vector3(20, 3, 240), 9);

  // --- Fase 4 world: sunken sanctuary, crow cove, flagship wreck,
  //     Great Maple, stable, dig spot, fish spots, altars ---
  prog(0.86, 'Waking the Three-Headed Crow…');
  const fase4 = buildFase4World(scene, terrainHeight, colliders, assets);
  for (const gr of fase4.groups) {
    streamer.register(gr.group, gr.x, gr.z, gr.r);
  }

  prog(0.90, 'Charting the map of Aldmor…');
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

  prog(0.97, 'Ready to set sail…');

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
    navel,
  };
}

export { CHUNK_SIZE, windTime };
