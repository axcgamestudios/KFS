import * as THREE from 'three';
import { TerrainHeight } from './world/TerrainHeight';
import { TerrainSystem, CHUNK_SIZE } from './world/TerrainSystem';
import { WaterSystem } from './world/WaterSystem';
import { SkySystem } from './world/SkySystem';
import { VegetationSystem, windTime } from './world/VegetationSystem';
import { buildCastle } from './structures/Castle';
import { buildVillage, type VillageLayout } from './structures/Village';
import {
  buildRuins, buildStoneCircle, buildWatchtower, buildShipwreck, buildGrotto, buildWaterfall,
} from './structures/POIs';
import { createChest, createHerb, type ChestHandles } from './structures/Props';
import { StaticBuilder } from './structures/Materials';
import { WildlifeSystem, type NPCDef } from './entities/NPC';
import type { ColliderRegistry } from './systems/ColliderRegistry';
import type { GameState } from './systems/GameState';
import { mulberry32 } from './core/MathUtils';

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
export function buildWorld(
  scene: THREE.Scene,
  colliders: ColliderRegistry,
  state: GameState,
  quality: 'low' | 'medium' | 'high' | 'ultra',
  onProgress?: (frac: number, label: string) => void,
): WorldRefs {
  const prog = (f: number, l: string) => onProgress?.(f, l);

  prog(0.02, 'Levantando la costa de Eldoria…');
  const terrainHeight = new TerrainHeight();
  const terrain = new TerrainSystem(terrainHeight, quality);

  prog(0.06, 'Esculpiendo montañas y valles…');
  const water = new WaterSystem(terrainHeight);
  const sky = new SkySystem();
  scene.add(sky.dome);
  scene.add(sky.sunLight);
  scene.add(sky.sunLight.target);
  scene.add(sky.hemiLight);

  prog(0.10, 'Plantando los bosques antiguos…');
  const vegetation = new VegetationSystem(terrainHeight, quality === 'low' ? 0 : quality === 'medium' ? 0.4 : quality === 'high' ? 0.75 : 1, scene);
  terrain.setScatterSink(
    (s) => vegetation.onChunkScatter(s),
    (key) => vegetation.onChunkRemoved(key),
  );
  terrain.attachTo(scene);

  prog(0.18, 'Alzando el Castillo de Aldmor…');
  const castleB = new StaticBuilder(colliders, 'castle');
  const castle = buildCastle(castleB, terrainHeight);
  const castleGroup = new THREE.Group();
  castleB.build(castleGroup, { shadows: true });
  scene.add(castleGroup);

  prog(0.3, 'Construyendo Puerto Cuervo…');
  const village = buildVillage(scene, terrainHeight, colliders);

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
  for (const [b] of [[ruinsB], [stonesB], [towerB], [wreckB], [grottoB], [fallsB]] as Array<[StaticBuilder]>) {
    const grp = new THREE.Group();
    b.build(grp, { shadows: true });
    scene.add(grp);
  }
  scene.add(falls.sheet);
  scene.add(falls.foam);

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
  ];

  prog(0.84, 'Soltando gaviotas sobre la bahía…');
  const gulls = new WildlifeSystem(scene, new THREE.Vector3(20, 3, 240), 9);

  prog(0.9, 'Trazando el mapa de Aldmor…');
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
  };
}

export { CHUNK_SIZE, windTime };
