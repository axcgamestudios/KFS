/**
 * Global world layout for the island of Aldmor (Fase 1 region of Eldoria).
 * All coordinates are world units (1 unit = 1 meter).
 */

export const WORLD = {
  /** Fase 12 — map reduced 30%: world spans [-716, 716] on X/Z (1432 m). */
  halfSize: 716,
  /** Island center + base radius. */
  islandCenter: { x: 0, z: -60 },
  islandRadius: 430,
  /** Bay (harbor) carve. */
  bayCenter: { x: 0, z: 330 },
  bayRadius: 235,
  /** Mountain massif. */
  mountainCenter: { x: 40, z: -320 },
  mountainRadius: 260,
  /** Castle hill plateau. */
  castlePos: { x: 110, z: -40 },
  castlePlateauHeight: 38,
  castleRadius: 62,
  /** Village / port. */
  villageCenter: { x: 20, z: 150 },
  villageRadius: 125,
  villageHeight: 7,
  /** Waterfall pool. */
  waterfallPool: { x: -95, z: -195 },
  /** Forest region. */
  forestCenter: { x: -190, z: -60 },
  forestRadius: 250,
  /** Sea level. */
  seaLevel: 0,
} as const;

/** Points of interest — discovered organically when the player gets close. */
export interface POIDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  xp: number;
  journal: string;
}

/** Secondary islands of the Forgotten Seas (Fase 2 — ocean region). */
export interface IslandDef {
  id: string;
  name: string;
  x: number;
  z: number;
  radius: number;
  /** Peak height above sea level. */
  height: number;
  biome: 'volcanic' | 'sandy' | 'meadow';
  /** Journal text shown when its POI is discovered. */
  journal: string;
}

export const ISLANDS: IslandDef[] = [
  {
    id: 'crow', name: 'Old Crow Isle',
    x: -540, z: -450, radius: 130, height: 46, biome: 'volcanic',
    journal: 'The island from my father’s map. Cliffs black as crow’s wings, and above the cove a timber fortress bristling with red banners. Here nests the Three-Headed Crow.',
  },
  {
    id: 'faro', name: 'Lighthouse Sea Stack',
    x: 575, z: 108, radius: 82, height: 30, biome: 'volcanic',
    journal: 'A sea stack of volcanic rock crowned by the ruins of a lighthouse older than memory. Its fires guided the ships of the Order of the Tide for centuries. Now only the gulls dwell here.',
  },
  {
    id: 'bruma_a', name: 'Mist Isles',
    x: -60, z: 590, radius: 85, height: 16, biome: 'sandy',
    journal: 'Two sisters of white sand and low palms, forever wrapped in a warm mist. The fishermen say the tide leaves gifts upon their shores… and that something larger visits them too.',
  },
  {
    id: 'bruma_b', name: 'Mist Isles',
    x: 40, z: 655, radius: 64, height: 13, biome: 'sandy',
    journal: 'The younger sister of the isles. Between them lies a shallow passage where the water glitters turquoise at noon.',
  },
  {
    id: 'ombligo', name: 'The Navel of the Sea',
    x: 476, z: 476, radius: 68, height: 15, biome: 'volcanic',
    journal: 'The dead cartographers were right: at the ocean\'s exact center rises a basalt needle ringed by spiral-carved monoliths. The horn-shaped altar listens… and something vast listens back.',
  },
];

export const POIS: POIDef[] = [
  {
    id: 'village', name: 'Crowhaven', x: 20, z: 150, radius: 90, xp: 20,
    journal: 'A small fishing port on Aldmor’s southern bay. Its piers smell of salt and tar. Here I grew up, and here my father’s trail vanished.',
  },
  {
    id: 'castle', name: 'Aldmor Castle', x: 110, z: -40, radius: 85, xp: 30,
    journal: 'The old local lord’s fortress, raised upon a rocky plateau. Its walls have watched over the bay for three centuries. They say the archives of the Order of the Tide rest beneath the keep.',
  },
  {
    id: 'waterfall', name: 'The Whispering Falls', x: -95, z: -195, radius: 45, xp: 25,
    journal: 'The waters fall from the western peaks and vanish among the rocks. Ivory petals bloom in the shadow of the trail. A place of strange calm.',
  },
  {
    id: 'ruins', name: 'Ruins of Vaelthara', x: -240, z: -140, radius: 45, xp: 35,
    journal: 'Broken columns shrouded in moss, older than any living kingdom. The carved sigils show dragons coiled in spirals of water. Was this once a city of the Dragon-Speakers?',
  },
  {
    id: 'stones', name: 'The Circle of Vigils', x: -140, z: -260, radius: 40, xp: 25,
    journal: 'Nine monoliths standing in a meadow no sheep dares cross. At night the runes give off a faint glow. The villagers have always shunned this place.',
  },
  {
    id: 'wreck', name: 'The West Coast Wreck', x: -330, z: 190, radius: 45, xp: 30,
    journal: 'A hull split in two, half-buried in the sand. The tide leaves offerings of timber and salt. I found a cargo stamped with Rosa’s tavern mark... and something more.',
  },
  {
    id: 'tower', name: 'The Watchman’s Tower', x: 300, z: 60, radius: 45, xp: 25,
    journal: 'A lonely watchtower on the eastern cliff. From the top, the whole sea lies in view. The bell has rusted: no one watches the horizon now. Someone should.',
  },
  {
    id: 'grotto', name: 'The Echoing Grotto', x: 200, z: -180, radius: 40, xp: 30,
    journal: 'A cavern sheltered in the mountain foothills. The echo returns your voice a heartbeat late... as if something were repeating it from far below.',
  },
  {
    id: 'peak', name: 'The Iceclaw Peaks', x: 40, z: -320, radius: 90, xp: 40,
    journal: 'The mountains of the north, crowned with eternal snow. The shepherds swear that at dusk an enormous shadow sometimes crosses the sky. The dragons once slept here... do they sleep still?',
  },
  {
    id: 'fortaleza', name: 'Fortress of the Crow', x: -540, z: -450, radius: 100, xp: 60,
    journal: 'The pirate lair of Old Crow Isle: a log palisade crowned with the skulls of foes, huts of tarred sailcloth, and a single watchtower. The Bloody Gull anchors in its cove.',
  },
  {
    id: 'faro', name: 'Ruins of the Old Lighthouse', x: 575, z: 108, radius: 60, xp: 40,
    journal: 'The lighthouse of the Tide Wardens, torn down in the great war. Its spiral stairs climb toward nothing. At the summit, a cold brazier waits for a flame no one remembers how to light.',
  },
  {
    id: 'ombligo', name: 'The Navel of the Sea', x: 476, z: 476, radius: 70, xp: 80,
    journal: 'A ring of monoliths around a horn-shaped altar, and the ribs of a leviathan fused into the rock. The dead cartographers called this place the navel of the sea: where the ocean listens, and answers.',
  },
  {
    id: 'bruma', name: 'The Mist Isles', x: -15, z: 622, radius: 115, xp: 40,
    journal: 'White sands, low palms, and warm fog. Among the shells and stranded driftwood I found signs that someone camped here not long ago. Someone who cooked fish and carved spirals in the sand.',
  },
  {
    id: 'nido', name: 'The Ancestor’s Nest', x: 20, z: -300, radius: 50, xp: 60,
    journal: 'A shelf of rock and ice crowns the Iceclaw Peaks, scoured by a wind that whistles like a broken flute. There are whale bones, a bed of frozen coins... and a stone lock shaped exactly like a claw. Something immense sleeps here. Something that remembers the sunken kings.',
  },
  {
    id: 'santuario', name: 'Sanctuary of Thalassar', x: 160, z: 270, radius: 55, xp: 60,
    journal: 'Beneath five meters of turquoise water, columns of green marble bear the weight of the sea. The city of the sunken kings rests as ordered as a graveyard of giants… and its altar still rises, white and patient, among the waves.',
  },
  {
    id: 'cala', name: 'The Cove of Silence', x: -398, z: -450, radius: 45, xp: 70,
    journal: 'An amphitheater of black basalt at the foot of the pirate fortress. No gulls, no grass: only the echo of the sea striking the stone. A stone knight keeps the entrance, sword lowered, and has for three hundred years.',
  },
  {
    id: 'insignia', name: 'The Admiral’s Shoal', x: -360, z: -490, radius: 45, xp: 60,
    journal: 'The Crow’s flagship, stranded forever on a shoal of black rock. Three broken masts, a hull cracked like an old rib. What the Crow stole from the sea, the sea came to reclaim.',
  },
  {
    id: 'granarce', name: 'The Great Maple', x: -120, z: -270, radius: 40, xp: 45,
    journal: 'A golden maple taller than the castle tower, its leaves whispering in a tongue that sounds like the wind. The Wardens planted a maple for every oath fulfilled. This is the last one left.',
  },
];

/** Dirt roads as polylines (tint terrain + block trees). */
export const ROADS: Array<Array<{ x: number; z: number }>> = [
  // Village square → castle gate
  [
    { x: 30, z: 130 }, { x: 50, z: 100 }, { x: 85, z: 58 }, { x: 103, z: 16 },
  ],
  // Village → west beach trail
  [
    { x: -10, z: 145 }, { x: -80, z: 155 }, { x: -170, z: 175 }, { x: -260, z: 185 },
  ],
  // Village → north meadow / stones trail
  [
    { x: 10, z: 120 }, { x: -20, z: 60 }, { x: -60, z: 0 }, { x: -100, z: -80 },
  ],
];

/** Distance from point to segment 2D. */
export function distToSegment(
  px: number, pz: number, ax: number, az: number, bx: number, bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? (apx * abx + apz * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + abx * t);
  const dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dz * dz);
}

/** Distance from a point to the nearest road segment. */
export function distToRoads(x: number, z: number): number {
  let best = Infinity;
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const d = distToSegment(x, z, road[i].x, road[i].z, road[i + 1].x, road[i + 1].z);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Gaussian falloff. */
export const gauss = (dx: number, dz: number, radius: number): number => {
  const d2 = (dx * dx + dz * dz) / (radius * radius);
  return Math.exp(-d2 * 2.2);
};

export const WORLD_SEED = 20261010;

/** Flattened build sites (fort terrace, lighthouse shoulder, beach camp). */
export interface FlatDef { x: number; z: number; r: number; h: number }

export const FLATS: FlatDef[] = [
  { x: -490, z: -445, r: 42, h: 18 },  // Fortaleza del Cuervo terrace
  { x: 567, z: 116, r: 26, h: 22 },    // Faro plateau
  { x: -60, z: 578, r: 24, h: 4 },     // Mist isles camp
  { x: 20, z: -300, r: 30, h: 88 },    // Nido del Ancestro (snowy summit plateau)
  { x: -398, z: -450, r: 34, h: 2.6 }, // Fase 4: Cala del Silencio (crow cove shelf)
  { x: -360, z: -490, r: 26, h: 1.6 }, // Fase 4: bajío del buque insignia (flagship wreck reef)
  { x: 476, z: 476, r: 30, h: 12.3 },  // Fase 15: Navel of the Sea — the Horn Altar plateau
];

/** Global sailing wind — slow precession, shared by ships, HUD and audio. */
export const WIND = {
  /** Direction the wind blows TOWARDS (radians, XZ plane like yaw). */
  dir: 2.4,
  strength: 1,
};
