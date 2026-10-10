import type { ItemDef } from './items';

/**
 * Fase 4 items — Chapter IV & V relics, trade goods, treasure-hunt pieces
 * and mount equipment. Merged into the main registry by items.ts.
 */
export const ITEMS_F4: Record<string, ItemDef> = {
  // ---- Chapter IV relics ----
  corona_thalassar: {
    id: 'corona_thalassar', name: 'Corona de Thalassar', kind: 'key',
    desc: 'La corona de los reyes hundidos: coral negro engarzado en plata de mar. Late suavemente, como un pulso bajo el agua.',
    icon: 'Crown', stackable: false, rarity: 'legendary',
    lore: [
      'La corona de Thalassar no se forjó para gobernar, sino para recordar.',
      'En su interior, diminutas inscripciones repiten una sola frase en la lengua antigua: «La marea guarda, la marea juzga».',
      'Quien la porta oye, a veces, el rumor de una asamblea de reyes bajo las olas.',
    ],
  },
  carta_navegacion: {
    id: 'carta_navegacion', name: 'Carta de Navegación del Cuervo', kind: 'readable',
    desc: 'La carta náutica secreta del Cuervo de Tres Cabezas. Rutas, arrecifes… y una cala sin nombre rodeada de plumas negras.',
    icon: 'ScrollText', stackable: false, rarity: 'legendary', lore: [
      'La carta está salpicada de alquitrán y firmada con un sello de tres cabezas.',
      'Marcas fúnebres jalonan la ruta sur: «Aquí cayó la Merodeadora. Aquí el mar cobra deudas».',
      'Al noroeste, una cala sin nombre: «Donde duerme el Cuervo. No despertarlo sin las tres llaves».',
    ],
  },
  corazon_cuervo: {
    id: 'corazon_cuervo', name: 'Corazón del Cuervo', kind: 'key',
    desc: 'Un corazón de obsidiana del tamaño de un puño, aún tibio. Dentro late una luz negra que no proyecta sombra.',
    icon: 'Heart', stackable: false, rarity: 'legendary',
  },
  espada_guardian: {
    id: 'espada_guardian', name: 'Espada del Guardián', kind: 'weapon',
    desc: 'Forjada por Bram con el colmillo del Ancestro y escamas de dragón. El filo canta con voz de marea. El arma de los Guardianes de la Orden.',
    icon: 'Sword', stackable: false, equipable: true, rarity: 'legendary',
  },
  // ---- Trade & side-quest goods ----
  pez: {
    id: 'pez', name: 'Pez de arrecife', kind: 'material',
    desc: 'Pesca varada de la marea baja. Tom sabe darle buen uso en la olla.',
    icon: 'Fish', stackable: true,
  },
  semilla_arce: {
    id: 'semilla_arce', name: 'Semilla del Gran Arce', kind: 'material',
    desc: 'Una sámara dorada del árbol más viejo de Eldoria. Maren quiere plantarla junto a la cascada.',
    icon: 'Leaf', stackable: false, rarity: 'rare',
  },
  moneda_antigua: {
    id: 'moneda_antigua', name: 'Moneda de Thalassar', kind: 'treasure',
    desc: 'Oro viejo acuñado con la corona hundida. Los coleccionistas pagan bien por ellas.',
    icon: 'Coins', stackable: true, rarity: 'rare',
  },
  mapa_tesoro: {
    id: 'mapa_tesoro', name: 'Mapa del tesoro del Capitán', kind: 'readable',
    desc: 'Un mapa dibujado con carbón y sangre de pulpo. Una X marca la ensenada este, bajo la sombra del faro en ruinas.',
    icon: 'Map', stackable: false, rarity: 'rare', lore: [
      '«La marea baja descubre lo que la marea alta esconde».',
      'Una X descansa en la ensenada al este, entre dos rocas con forma de ballena.',
      'Al pie, la firma: «Capitán Eirik, Guardián de la Marea. Que lo encuentre mi sangre.»',
    ],
  },
  alforjas: {
    id: 'alforjas', name: 'Alforjas de cuero', kind: 'key',
    desc: 'Sillas de montar con alforjas reforzadas. Tu caballo galopa con más brío sabiéndose equipado.',
    icon: 'Backpack', stackable: false, rarity: 'rare',
  },
  estandarte_orden: {
    id: 'estandarte_orden', name: 'Estandarte de la Marea', kind: 'treasure',
    desc: 'El estandarte de la Orden de la Marea, rescatado del bergantín del Cuervo. Azul profundo con la rueda de mareas bordada en plata.',
    icon: 'Flag', stackable: false, rarity: 'legendary',
  },
  reliquia_cuervo: {
    id: 'reliquia_cuervo', name: 'Pluma de obsidiana', kind: 'treasure',
    desc: 'Una pluma negra, dura como el hierro y fría como el abismo. Cae del cielo cuando el Cuervo ruge.',
    icon: 'Feather', stackable: true, rarity: 'rare',
  },
  // ---- Secret lore tablets (unlocked endings hint) ----
  tablilla_verdad: {
    id: 'tablilla_verdad', name: 'Tablilla de la Verdad', kind: 'readable',
    desc: 'Una tablilla de piedra del santuario hundido. Habla del origen del Cuervo y del precio del pacto.',
    icon: 'BookOpen', stackable: false, rarity: 'legendary', lore: [
      '«Al principio no hubo dragones ni reyes, solo la marea y los que la escuchaban».',
      '«El Cuervo no es un dragón: es la sombra del primer juramento roto. Cada corona que se alza lo alimenta».',
      '«Solo quien renuncie a toda corona verá amanecer el mar libre. Solo quien asuma toda corona podrá salvarlo. Y quien restaure el pacto, lo custodiará para siempre».',
    ],
  },
};
