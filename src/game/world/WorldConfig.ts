/**
 * Global world layout for the island of Aldmor (Fase 1 region of Eldoria).
 * All coordinates are world units (1 unit = 1 meter).
 */

export const WORLD = {
  /** World spans [-1024, 1024] on X/Z. */
  halfSize: 1024,
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

export const POIS: POIDef[] = [
  {
    id: 'village', name: 'Puerto Cuervo', x: 20, z: 150, radius: 90, xp: 20,
    journal: 'Un pequeño puerto de pescadores en la bahía meridional de Aldmor. Sus muelles huelen a sal y brea. Aquí crecí, y aquí desapareció la pista de mi padre.',
  },
  {
    id: 'castle', name: 'Castillo de Aldmor', x: 110, z: -40, radius: 85, xp: 30,
    journal: 'La fortaleza del viejo señor local, alzada sobre una meseta rocosa. Sus murallas vigilan la bahía desde hace tres siglos. Dicen que bajo el torreón descansan los archivos de la Orden de la Marea.',
  },
  {
    id: 'waterfall', name: 'La Cascada Susurrante', x: -95, z: -195, radius: 45, xp: 25,
    journal: 'Las aguas caen desde las cumbres occidentales y se pierden entre las rocas. Los pétalos de marfil florecen en la umbría del sendero. Un lugar de extraña calma.',
  },
  {
    id: 'ruins', name: 'Ruinas de Vaelthara', x: -240, z: -140, radius: 45, xp: 35,
    journal: 'Columnas rotas cubiertas de musgo, más antiguas que cualquier reino vivo. Los símbolos tallados muestran dragones enroscados en espirales de agua. ¿Fue esto una ciudad de los Que Hablaban con Dragones?',
  },
  {
    id: 'stones', name: 'El Círculo de las Vigilias', x: -140, z: -260, radius: 40, xp: 25,
    journal: 'Nueve monolitos alineados en un prado que ninguna oveja se atreve a cruzar. Por la noche, las runas emiten un tenue fulgor. Los aldeanos lo evitan desde siempre.',
  },
  {
    id: 'wreck', name: 'El Naufragio de la Costa Oeste', x: -330, z: 190, radius: 45, xp: 30,
    journal: 'Un casco partido por la mitad, medio enterrado en la arena. La marea deja aportes de madera y sal. Encontré un cargamento con la marca de la taberna de Rosa... y algo más.',
  },
  {
    id: 'tower', name: 'Torre del Vigía', x: 300, z: 60, radius: 45, xp: 25,
    journal: 'Una atalaya solitaria sobre el acantilado oriental. Desde arriba se ve todo el mar. La campana está oxidada: nadie vigia ya el horizonte. Alguien debería.',
  },
  {
    id: 'grotto', name: 'La Gruta del Eco', x: 200, z: -180, radius: 40, xp: 30,
    journal: 'Una caverna al abrigo de las estribaciones montañosas. El eco devuelve las voces con un instante de retraso... como si algo las repitiera desde muy abajo.',
  },
  {
    id: 'peak', name: 'Cumbres de Garrahielo', x: 40, z: -320, radius: 90, xp: 40,
    journal: 'Las montañas del norte, coronadas de nieve eterna. Los pastores juran que a veces una sombra enorme cruza el cielo al atardecer. Los dragones dormían... ¿durmiendo aún?',
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
