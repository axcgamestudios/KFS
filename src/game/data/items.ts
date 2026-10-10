/** Item registry — everything the player can carry. */

export type ItemKind = 'material' | 'consumable' | 'weapon' | 'key' | 'readable' | 'treasure';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  kind: ItemKind;
  /** lucide icon name used by the UI */
  icon: string;
  stackable: boolean;
  equipable?: boolean;
  usable?: boolean;
  rarity?: 'common' | 'rare' | 'legendary';
  /** For readables: lore text shown when read. */
  lore?: string[];
}

export const ITEMS: Record<string, ItemDef> = {
  coin: {
    id: 'coin', name: 'Monedas de oro', kind: 'treasure',
    desc: 'El oro de Eldoria. Sirve para comerciar con mercaderes y arreglar barcos.',
    icon: 'Coins', stackable: true, rarity: 'common',
  },
  petalo: {
    id: 'petalo', name: 'Pétalo de marfil', kind: 'material',
    desc: 'Flor luminosa que crece en la umbría de las cascadas y entre ruinas antiguas. Maren lo necesita para sus remedios.',
    icon: 'Flower2', stackable: true, rarity: 'common',
  },
  pocion: {
    id: 'pocion', name: 'Poción de curación', kind: 'consumable',
    desc: 'Tónico amargo de Maren. Restaura 45 puntos de salud.',
    icon: 'FlaskConical', stackable: true, usable: true,
  },
  espada_eirik: {
    id: 'espada_eirik', name: 'Espada de Eirik', kind: 'weapon',
    desc: 'El acero del capitán desaparecido. La empuñadura lleva grabada una serpiente marina enroscada. Ligera, letal, llena de recuerdos.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  amuleto: {
    id: 'amuleto', name: 'Amuleto de cobre', kind: 'key',
    desc: 'Un amuleto con la marca de la Orden de la Marea. Encaja en el cierre del cofre de Eirik.',
    icon: 'KeyRound', stackable: false, rarity: 'rare',
  },
  carta: {
    id: 'carta', name: 'Carta de Eirik', kind: 'readable',
    desc: 'Una carta escrita a mano, arrugada por la sal y el tiempo.',
    icon: 'ScrollText', stackable: false, lore: [
      'Si lees esto, el mar me ha reclamado — o me ha llamado. Ambas cosas, quizá.',
      'No fui un simple pescador. Fui Guardián de la Marea, como lo fueron mis ancestros. Custodiamos el pacto entre los reyes y los dragones: que jamás despertaran bajo las ciudades hundidas.',
      'El Colibrí de Mar lleva grabado en la quilla el sello de la Orden. Cuidado con el cuervo de tres cabezas: él también lo busca. Busca a la Orden. Busca el Mapa.',
      'Termina lo que empecé. Zarpa hacia la Isla del Cuervo Viejo. Y recuerda: los dragones no son lo que dicen las canciones.',
      '— Eirik, tu padre',
    ],
  },
  mapa: {
    id: 'mapa', name: 'Mapa antiguo', kind: 'readable',
    desc: 'Un mapa de los mares de Eldoria con anotaciones en un idioma que casi nadie recuerda. Marca una isla al noroeste: el Cuervo Viejo.',
    icon: 'Map', stackable: false, rarity: 'legendary', lore: [
      'El pergamino muestra costas que no aparecen en ningún mapa moderno.',
      'Una isla al noroeste está rodeada por un círculo de tinta roja con una nota: «Donde duerme la marea».',
      'En el reverso, con letra de Eirik: «No vayas sin la Orden. No vayas sin el acero.»',
    ],
  },
  cargamento: {
    id: 'cargamento', name: 'Cargamento de Rosa', kind: 'key',
    desc: 'Una caja de especias rescatada del naufragio de la costa oeste. Lleva la marca de la taberna El Ancla Rota.',
    icon: 'Package', stackable: false,
  },
  colmillo: {
    id: 'colmillo', name: 'Colmillo tallado', kind: 'treasure',
    desc: 'Un colmillo antiguo tallado con espirales de agua. Quizá valga algo… o quizá sea algo más.',
    icon: 'Gem', stackable: false, rarity: 'rare',
  },
  madera: {
    id: 'madera', name: 'Madera de roble', kind: 'material',
    desc: 'Roble curado de los almacenes de Puerto Cuervo. Bram lo necesita para el casco del Colibrí.',
    icon: 'TreePine', stackable: true,
  },
  lona: {
    id: 'lona', name: 'Lona de vela', kind: 'material',
    desc: 'Tela encerada y resistente a la sal. Rosa la tiñe con un baño de pétalo que además laconsolida las fibras.',
    icon: 'Layers', stackable: true,
  },
  cuerda: {
    id: 'cuerda', name: 'Cuerda de cáñamo', kind: 'material',
    desc: 'Cáñamo trenzado al estilo de los pescadores de Aldmor. Aguanta un mástil o un puerto entero.',
    icon: 'Cable', stackable: true,
  },
  sello: {
    id: 'sello', name: 'Sello de la Orden de la Marea', kind: 'key',
    desc: 'Un sello de bronce con el círculo de mareas y la llama de los Guardianes. Morwen lo arrebató a un navío de la Orden. Ahora vuelve a manos de un Guardián.',
    icon: 'Award', stackable: false, rarity: 'legendary', lore: [
      'El sello pesa más de lo que promete su tamaño, como si el metal recordara el peso de los juramentos.',
      'En el reverso, una inscripción casi borrada: «Donde la marea duerme, la guardia despierta.»',
      'La carta de tu padre mencionaba la Isla del Cuervo Viejo... pero el sello dibuja otra cosa: un archipiélago de dragones dormidos al que ningún mapa vivo señala.',
    ],
  },
  botin: {
    id: 'botin', name: 'Botín del Cuervo', kind: 'treasure',
    desc: 'Un cofre pequeño con el botín de la Fortaleza del Cuervo: monedas de media docena de reinos y gemas sin tallar.',
    icon: 'Coins', stackable: false, rarity: 'rare',
  },
  espejo: {
    id: 'espejo', name: 'Espejo de latón del faro', kind: 'treasure',
    desc: 'El espejo que una vez multiplicó la llama del faro de la Orden. Nubes de sal lo han vuelto lechoso, pero el latón reluce como el primer día.',
    icon: 'Disc', stackable: false, rarity: 'rare',
  },
  escama: {
    id: 'escama', name: 'Escama de dragón', kind: 'treasure',
    desc: 'Ni fría ni caliente. Al sostenerla, late muy despacio... como si durmiera. Los dragones duermen — algo los está despertando.',
    icon: 'Shell', stackable: false, rarity: 'legendary', lore: [
      'La escama es tan grande como tu palma y cambia de color según la luz: azul abismo, verde marea, gris tormenta.',
      'Al acercarla al oído, juras oír respirar. Muy hondo. Muy despacio.',
      'Alguien la dejó en este cofro a propósito: espirales de agua rodean el hueco donde descansaba, idénticas a las de las ruinas de Vaelthara.',
    ],
  },
};
