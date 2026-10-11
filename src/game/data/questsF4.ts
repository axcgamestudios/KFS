import type { QuestDef } from './quests';

/**
 * Fase 4 quest content — Chapters IV & V (the Crow storyline) plus the
 * nineteen secondary quests that complete the 20-mission campaign.
 * Merged into QUESTS by quests.ts.
 *
 * Objective contracts (all resolve through real systems):
 *  - talk    → dialogue options fire { t:'talk', target }
 *  - collect → inventory counts / `collected_` flags
 *  - interact→ world interactable ids (Game.buildInteractables)
 *  - flag    → story flags set by combat/naval/mount/ending systems
 */
export const QUESTS_F4: Record<string, QuestDef> = {
  // ================= CHAPTER IV — LA CORONA HUNDIDA =================
  q10_orden: {
    id: 'q10_orden',
    title: 'La Orden Reunida',
    description: 'Con el Colmillo del Ancestro en tu poder, Aldric debe revelarte el último secreto de la Orden de la Marea: el santuario hundido de Thalassar.',
    journal: 'El Colmillo del Ancestro ha abierto los archivos sellados de Aldric. La Orden de la Marea custodiaba tres reliquias: el Sello (recuperado a Morwen), el Corazón de Marea (arrancado a Vaelthara)… y la Corona de Thalassar, que descansaba con los reyes hundidos en su santuario bajo las aguas. Si la Corona vuelve a la luz, la Orden podrá reunirse de nuevo.',
    objectives: [
      { id: 'o1', text: 'Habla con Aldric sobre la Orden de la Marea', type: 'talk', target: 'aldric_f4' },
      { id: 'o2', text: 'Nada hasta el santuario hundido de Thalassar', type: 'interact', target: 'santuario_thalassar' },
      { id: 'o3', text: 'Recupera la Corona de Thalassar', type: 'collect', target: 'corona_thalassar', count: 1 },
      { id: 'o4', text: 'Habla con Halvard, el herrador de establos', type: 'talk', target: 'halvard_horse' },
    ],
    rewards: { xp: 280, items: [{ id: 'pocion', count: 2 }] },
    nextQuest: 'q11_estandarte',
    completionJournal: 'La Corona de Thalassar pesa en mi mochila como una promesa. Halvard, el herrador, me esperaba: «La Orden vuelve a tener Guardián, y un Guardián no va a pie». Tormenta, el caballo de guerra de mi padre, sigue vivo en su establo. Por fin cabalgo. Capítulo IV: la Corona Hundida.',
  },
  q11_estandarte: {
    id: 'q11_estandarte',
    title: 'El Estandarte del Cuervo',
    description: 'Los corsarios del Cuervo se reorganizan bajo un estandarte negro. Un cazador élite ronda las aguas de la bahía y la carta náutica del Cuervo descansa en un naufragio de la Isla del Cuervo Viejo.',
    journal: 'La Corona ha despertado más que esperanzas: los cuervos también la sienten. Un bergantín élite caza cualquier vela que salga de Puerto Cuervo. Aldric cree que la carta náutica del Cuervo —la ruta a su cala secreta— se hundió con el buque insignia del Almirante en la Isla del Cuervo Viejo. Primero el cazador. Luego, el naufragio.',
    objectives: [
      { id: 'o1', text: 'Hunde al cazador del Cuervo en alta mar', type: 'flag', target: 'elite_hunter_sunk' },
      { id: 'o2', text: 'Explora el naufragio del buque insignia (Isla del Cuervo Viejo)', type: 'interact', target: 'wreck_flagship' },
      { id: 'o3', text: 'Recupera la Carta de Navegación del Cuervo', type: 'collect', target: 'carta_navegacion', count: 1 },
    ],
    rewards: { xp: 300, items: [{ id: 'coin', count: 150 }] },
    nextQuest: 'q12_acero',
    completionJournal: 'El cazador del Cuervo descansa en el fondo, y con él su arrogancia. Entre las costillas del buque insignia encontré la carta: una cala sin nombre al noroeste, «donde duerme el Cuervo», y el estandarte de la Orden que el Cuervo robó hace cien años. La ruta final está trazada. Solo falta el acero.',
  },
  q12_acero: {
    id: 'q12_acero',
    title: 'Acero y Juramento',
    description: 'Bram puede forjar el arma de los Guardianes con el Colmillo del Ancestro y escamas de dragón. Maren prepara sus pociones y Halvard aparea a Tormenta para la batalla.',
    journal: 'La carta marca la cala del Cuervo, pero nadie en su sano juicio despierta a «la sombra de tres cabezas» con una espada de mercado. Bram dice que el colmillo del Ancestro aún recuerda el pacto: con él y tres escamas de dragón puede forjar la Espada del Guardián. Maren prepara ungüentos. Halvard aparea a Tormenta.',
    objectives: [
      { id: 'o1', text: 'Habla con Bram sobre la forja del Guardián', type: 'talk', target: 'bram_forge' },
      { id: 'o2', text: 'Reúne 3 escamas de dragón (0/3)', type: 'collect', target: 'escama', count: 3 },
      { id: 'o3', text: 'Forja la Espada del Guardián en la herrería', type: 'interact', target: 'forge_guardian' },
      { id: 'o4', text: 'Acepta las provisiones de Maren', type: 'talk', target: 'maren_potions' },
      { id: 'o5', text: 'Habla con Halvard para aparear a Tormenta', type: 'talk', target: 'halvard_barding' },
    ],
    rewards: { xp: 320, items: [{ id: 'pocion', count: 3 }] },
    nextQuest: 'q13_despertar',
    completionJournal: 'La forja cantó toda la noche. El colmillo del Ancestro se dobló sobre sí mismo tres veces antes de aceptar su nueva forma: una espada que silba como la marea cuando corta el aire. Maren me cargó de pociones «para ti y para quien no llegues a tiempo de salvar». Halvard puso las alforjas nuevas a Tormenta. Estamos listos. Que el Cuervo despierte.',
  },
  // ================= CHAPTER V — EL CUERVO DE TRES CABEZAS =================
  q13_despertar: {
    id: 'q13_despertar',
    title: 'El Despertar del Cuervo',
    description: 'La carta del Cuervo revela la Cala del Silencio, bajo la Fortaleza del Cuervo Viejo. Allí duerme Kraivenn, el Cuervo de Tres Cabezas: la sombra del primer juramento roto.',
    journal: 'La cala no aparece en ningún mapa moderno: un anfiteatro de basalto bajo la fortaleza pirata, custodiado por una estatua de caballero de la Orden. Aldric me dio la última advertencia: «Kraivenn no es un dragón más. Es la sombra del primer juramento roto. No negociará contigo: los dragones no son lo que dicen las canciones, y él es la razón». El altar del centro lleva tres cuencas: sello, corazón… y una vacía que pide una corona.',
    objectives: [
      { id: 'o1', text: 'Llega a la Cala del Silencio bajo la Fortaleza del Cuervo', type: 'flag', target: 'kraivenn_seen' },
      { id: 'o2', text: 'Despierta al Cuervo en el altar negro', type: 'interact', target: 'altar_cuervo' },
      { id: 'o3', text: 'Derrota a Kraivenn, el Cuervo de Tres Cabezas', type: 'flag', target: 'kraivenn_dead' },
      { id: 'o4', text: 'Recoge el Corazón del Cuervo', type: 'collect', target: 'corazon_cuervo', count: 1 },
    ],
    rewards: { xp: 800, items: [{ id: 'coin', count: 400 }] },
    nextQuest: 'q14_consejo',
    completionJournal: 'Kraivenn ha caído. La sombra que bebió el juramento roto se deshizo en plumas de obsidiana, y en el centro de su pecho ardía un corazón negro que no proyecta sombra. La fortaleza está en silencio; el mar, en calma expectante. La leyenda del Cuervo termina aquí… o empieza la mía. Capítulo V: el Destino de las Mareas.',
  },
  q14_consejo: {
    id: 'q14_consejo',
    title: 'El Consejo de las Mareas',
    description: 'Con las tres reliquias reunidas —Sello, Corona y Corazón— Aldric convoca el primer Consejo de las Mareas en cien años. El santuario de Thalassar responde.',
    journal: 'Tres reliquias: el Sello que Morwen robó, la Corona que el mar guardó, el Corazón que Kraivenn alimentó con juramentos rotos. Aldric dice que juntas «cantan» — y que el santuario hundido las oye. El Consejo de las Mareas debe reunirse en el Nido del Ancestro, donde el pacto se firmó. Allí decidiré qué hacer con el destino de Eldoria.',
    objectives: [
      { id: 'o1', text: 'Vuelve con Aldric con el Corazón del Cuervo', type: 'talk', target: 'aldric_consejo' },
      { id: 'o2', text: 'Sube al Nido del Ancestro en Garrahielo', type: 'interact', target: 'altar_marea' },
    ],
    rewards: { xp: 350 },
    nextQuest: 'q15_destino',
    completionJournal: 'El altar del Nido reconoció las reliquias: el lecho de monedas se abrió y una luz de marea recorrió las costillas de ballena como un latido. Aldric puso su mano en mi hombro: «Tres caminos, Guardián. Ninguno es fácil. Ninguno se puede desandar». El mar entero contiene el aliento.',
  },
  q15_destino: {
    id: 'q15_destino',
    title: 'El Destino de las Mareas',
    description: 'Ante el altar del pacto, las tres reliquias esperan tu decisión: restaurar el pacto, alzar la corona o liberar el mar. El destino de Eldoria está en tus manos.',
    journal: 'El altar del Ancestro acepta las tres reliquias. Siento el peso de cien años de Guardianes muertos y de reinos hundidos. Restaurar el pacto: la Orden custodiará las mareas para siempre, como antes. Alzar la Corona: unir las islas bajo un nuevo trono — el mío — y dragons leales. O devolverlo todo al mar: ni pactos ni coronas, un Eldoria libre. Nadie puede elegir por mí.',
    objectives: [
      { id: 'o1', text: 'Toma una decisión ante el Altar de la Marea', type: 'interact', target: 'altar_decision' },
      { id: 'o2', text: 'Sella tu destino en Eldoria', type: 'flag', target: 'ending_done' },
    ],
    rewards: { xp: 500 },
    completionJournal: 'He decidido. El rumbo de las mareas olvidadas tiene dueño — o lo ha perdido para siempre. Las canciones dirán lo que quieran; yo estuve allí.',
  },

  // ================= SECONDARY QUESTS (sq = side) =================
  sq_raciones: {
    id: 'sq_raciones',
    title: 'Las Raciones del Pueblo',
    description: 'Tom el pescador necesita reponer las despensas: la marea baja ha dejado pesca varada por toda la costa.',
    journal: 'Tom jura que «la marea deja la pesca en la arena para quien se agache». Recoge cuatro peces varados por la costa y llévaselos antes que las gaviotas.',
    objectives: [
      { id: 'o1', text: 'Recoge 4 peces de la costa (0/4)', type: 'collect', target: 'pez', count: 4 },
      { id: 'o2', text: 'Entrégalos a Tom', type: 'talk', target: 'tom_raciones' },
    ],
    rewards: { xp: 70, items: [{ id: 'coin', count: 35 }] },
    completionJournal: 'Tom preparó un guiso que «sabe a domingo». Las despensas del pueblo aguantarán otro mes. «El mar cuida a los que agachan la espalda», dijo, escupiendo al agua con elegancia.',
  },
  sq_yunque: {
    id: 'sq_yunque',
    title: 'El Yunque Encendido',
    description: 'Bram busca escamas de dragón para templar un acero nuevo. Tres escamas bastan.',
    journal: 'Bram colecciona escamas «como otros coleccionan rencores». Tres escamas de dragón le darían para templar el mejor acero del norte — y me lo debe.',
    objectives: [
      { id: 'o1', text: 'Reúne 3 escamas de dragón (0/3)', type: 'collect', target: 'escama', count: 3 },
      { id: 'o2', text: 'Llévaselas a Bram', type: 'talk', target: 'bram_yunque' },
    ],
    rewards: { xp: 90, items: [{ id: 'coin', count: 60 }, { id: 'pocion', count: 1 }] },
    completionJournal: 'Bram sopesó las escamas una a una, sonrió como quien no sonríe desde hace años y prometió «un filo que cortará la bruma». Y una deuda saldada.',
  },
  sq_espejo: {
    id: 'sq_espejo',
    title: 'La Ruta del Espejo',
    description: 'Elin, la tendera, colecciona rarezas de los mares. El espejo de latón del Farallón del Faro sería la joya de su mostrador.',
    journal: 'Elin paga bien por «cualquier cosa que refleje historias». El espejo del faro, si aún está en el cofre del Farallón, refleja un siglo de tormentas.',
    objectives: [
      { id: 'o1', text: 'Consigue el espejo del faro (cofre del Farallón)', type: 'collect', target: 'espejo', count: 1 },
      { id: 'o2', text: 'Véndeselo a Elin', type: 'talk', target: 'elin_espejo' },
    ],
    rewards: { xp: 80, items: [{ id: 'coin', count: 70 }] },
    completionJournal: 'Elin colocó el espejo junto a la caja «para ver quién entra dos veces». Me pagó en oro y en risas, que en Puerto Cuervo valen casi igual.',
  },
  sq_fuegos: {
    id: 'sq_fuegos',
    title: 'Fuegos en la Costa',
    description: 'Jorund quiere confirmar que la vieja linterna del Farallón del Faro sigue en pie y visible desde el mar.',
    journal: 'Jorund patrulla el camino del este y jura que «un reino sin faro es un reino a ciegas». Comprueba que las ruinas del Farallón siguen en pie y díselo.',
    objectives: [
      { id: 'o1', text: 'Descubre el Farallón del Faro', type: 'flag', target: 'poi_faro' },
      { id: 'o2', text: 'Informa a Jorund', type: 'talk', target: 'jorund_fuegos' },
    ],
    rewards: { xp: 70, items: [{ id: 'coin', count: 30 }] },
    completionJournal: 'Las ruinas del faro siguen en pie, tercas como un juramento. Jorund lo anotó en su libro de guardia: «La costa ve. La costa sabe».',
  },
  sq_petalo_tumba: {
    id: 'sq_petalo_tumba',
    title: 'Pétalos para la Tumba',
    description: 'Maren quiere honrar a los Guardianes caídos con cinco pétalos de marfil sobre el círculo de piedras.',
    journal: 'Los Guardianes caídos descansan en el círculo de piedras del oeste. Maren dice que los pétalos de marfil «florece donde el agua canta» y que cinco bastan para que los muertos no se sientan olvidados.',
    objectives: [
      { id: 'o1', text: 'Reúne 5 pétalos de marfil (0/5)', type: 'collect', target: 'petalo', count: 5 },
      { id: 'o2', text: 'Deposítalos con Maren', type: 'talk', target: 'maren_petalo' },
    ],
    rewards: { xp: 90, items: [{ id: 'pocion', count: 2 }] },
    completionJournal: 'Maren colocó los pétalos en el altar con la ternura de quien peina a un durmiente. «Ahora la Orden duerme con música», dijo. Yo pensé en Eirik.',
  },
  sq_caravana: {
    id: 'sq_caravana',
    title: 'La Caravana de Elin',
    description: 'Elin necesita que una carreta con madera llegue a su tienda. Necesitarás un caballo y la carreta de Halvard.',
    journal: 'El almacén de Elin se queda sin madera y «los caminos no se andan solos». Halvard presta su carreta: engánchala a un caballo, carga dos maderas y llévaselas. El comercio de Puerto Cuervo vuelve a moverse.',
    objectives: [
      { id: 'o1', text: 'Engancha la carreta a un caballo', type: 'flag', target: 'cart_hitched' },
      { id: 'o2', text: 'Reúne 2 maderas de roble (0/2)', type: 'collect', target: 'madera', count: 2 },
      { id: 'o3', text: 'Entrega la madera a Elin con la carreta', type: 'talk', target: 'elin_caravana' },
    ],
    rewards: { xp: 110, items: [{ id: 'coin', count: 90 }] },
    completionJournal: 'La carreta crujió hasta la tienda de Elin como una vieja con remedios. La madera quedó apilada y Elin me contó el doble de monedas: «los camiones de verdad pagan mejor que las promesas».',
  },
  sq_caballos: {
    id: 'sq_caballos',
    title: 'Los Caballos Perdidos',
    description: 'Dos caballos salvajes de Halvard pastan perdidos por los prados de Aldmor. Encuéntralos y márcales la posición.',
    journal: 'Los potros de Halvard se escaparon «porque los prados son grandes y las vallas, cortas». Uno pastaba hacia la cascada; el otro, hacia las ruinas. Márcalos para que Halvard pueda traerlos.',
    objectives: [
      { id: 'o1', text: 'Encuentra al potro del prado norte', type: 'interact', target: 'wildhorse_1' },
      { id: 'o2', text: 'Encuentra al potro del prado oeste', type: 'interact', target: 'wildhorse_2' },
      { id: 'o3', text: 'Avisa a Halvard', type: 'talk', target: 'halvard_caballos' },
    ],
    rewards: { xp: 100, items: [{ id: 'coin', count: 50 }] },
    completionJournal: 'Halvard silbó y los potros volvieron solos, «como buen ganado». Me enseñó a silbar igual «por si algún día te compras un caballo con criterio».',
  },
  sq_cascada: {
    id: 'sq_cascada',
    title: 'La Canción de la Cascada',
    description: 'Sigrid jura que la cascada «canta distinto» al caer la noche. Escúchala tú también y cuéntale qué oíste.',
    journal: 'Sigrid lava de día, pero de noche escucha la cascada: «si te sientas al borde cuando cae el último sol, el agua canta con voz de gente». Siéntate junto a la cascada al anochecer y escucha.',
    objectives: [
      { id: 'o1', text: 'Escucha la cascada al caer la noche (junto al estanque)', type: 'interact', target: 'cascada_noche' },
      { id: 'o2', text: 'Cuéntaselo a Sigrid', type: 'talk', target: 'sigrid_cascada' },
    ],
    rewards: { xp: 80, items: [{ id: 'coin', count: 40 }] },
    completionJournal: 'La cascada cantó. No sabría decir con qué voz, pero cantó. Sigrid sonrió como quien confirma un secreto: «los que duermen abajo saben canciones nuevas».',
  },
  sq_cartas: {
    id: 'sq_cartas',
    title: 'Cartas de Náufragos',
    description: 'Rosa colecciona historias de naufragios para sus noches de taberna. Léele las tres tablillas antiguas de la isla.',
    journal: '«Una taberna sin historias es una taberna sin bebida», dice Rosa. Hay tres tablillas antiguas por la isla: una en las ruinas, una en el círculo de piedras y una en la torre vigía. Léelas todas.',
    objectives: [
      { id: 'o1', text: 'Lee la tablilla de las ruinas', type: 'flag', target: 'lore_tablet_ruins' },
      { id: 'o2', text: 'Toca el altar del círculo de piedras', type: 'flag', target: 'lore_stones_center' },
      { id: 'o3', text: 'Examina la puerta tapiada de la torre', type: 'flag', target: 'lore_tower_door' },
      { id: 'o4', text: 'Cuéntaselo a Rosa', type: 'talk', target: 'rosa_cartas' },
    ],
    rewards: { xp: 90, items: [{ id: 'pocion', count: 1 }, { id: 'coin', count: 25 }] },
    completionJournal: 'Rosa escuchó las tres historias con los codos en la barra y los ojos como velas. «Esta noche la taberna canta sola», anunció. La canela volvió a oler a gloria.',
  },
  sq_bounty: {
    id: 'sq_bounty',
    title: 'Cazador de Drakelings',
    description: 'Los drakelings que anidan en el círculo de vigías y la gruta asustan a los pastores. Jorund paga por cada uno.',
    journal: 'Dragones pequeños, problemas grandes: los drakelings del círculo de piedras y de la gruta cristal han puesto a pastar con miedo. Jorund paga bien por cada nido limpio.',
    objectives: [
      { id: 'o1', text: 'Limpia el nido del círculo de vigías', type: 'flag', target: 'drake_stones_dead' },
      { id: 'o2', text: 'Limpia el nido de la gruta', type: 'flag', target: 'drake_grotto_dead' },
      { id: 'o3', text: 'Cobra la recompensa con Jorund', type: 'talk', target: 'jorund_bounty' },
    ],
    rewards: { xp: 140, items: [{ id: 'coin', count: 110 }] },
    completionJournal: 'Los pastores vuelven a dormir siesta. Jorund contó las monedas dos veces —una por nido— y me llamó «limpiacielos», que no sé si es rango o insulto.',
  },
  sq_moneda: {
    id: 'sq_moneda',
    title: 'Monedas del Ayer',
    description: 'Elin colecciona las monedas de Thalassar que la marea arrastra a las cuevas. Tres bastan para hacerle feliz.',
    journal: 'La marea arrastra monedas del reino hundido hasta los rincones más escondidos de la isla. Elin paga generosamente por cada una: «el oro viejo cuenta historias mejor que el nuevo».',
    objectives: [
      { id: 'o1', text: 'Encuentra 3 monedas de Thalassar (0/3)', type: 'collect', target: 'moneda_antigua', count: 3 },
      { id: 'o2', text: 'Llévaselas a Elin', type: 'talk', target: 'elin_moneda' },
    ],
    rewards: { xp: 120, items: [{ id: 'coin', count: 150 }] },
    completionJournal: 'Elin alineó las monedas sobre un paño azul y las miró como se mira un recuerdo. Pagó sin regatear. «El coleccionista honesto paga dos veces: en oro y en historias».',
  },
  sq_tesoro: {
    id: 'sq_tesoro',
    title: 'El Mapa del Capitán',
    description: 'Un mapa del tesoro de tu propio padre ha aparecido en la gruta cristal. La sangre del Capitán Eirik sabe dónde excavar.',
    journal: 'El mapa dibujado por Eirik marca una X en la ensenada este, «bajo la sombra del faro en ruinas», donde la marea baja descubre lo que la marea alta esconde. Que lo encuentre su sangre, escribió.',
    objectives: [
      { id: 'o1', text: 'Recupera el mapa del tesoro (gruta cristal)', type: 'collect', target: 'mapa_tesoro', count: 1 },
      { id: 'o2', text: 'Excava en la X de la ensenada este', type: 'interact', target: 'dig_treasure' },
    ],
    rewards: { xp: 150, items: [{ id: 'coin', count: 200 }] },
    completionJournal: 'Bajo dos palmos de arena descansaba el cofre de campaña de Eirik: oro de la Orden, flechas del buen sauz y una nota — «Sabía que volverías. Los Guardianes siempre vuelven».',
  },
  sq_vela: {
    id: 'sq_vela',
    title: 'La Vela Rota',
    description: 'Tom quiere reparar su velero antes del invierno: tres lonas y dos cuerdas le bastarían.',
    journal: 'El velero de Tom «tiene más parches que vela». Con tres lonas enceradas y dos cuerdas de cáñamo podría volver a salir. Rosa prepara lona; el mismo Tom vende cuerda.',
    objectives: [
      { id: 'o1', text: 'Reúne 3 lonas (0/3)', type: 'collect', target: 'lona', count: 3 },
      { id: 'o2', text: 'Reúne 2 cuerdas (0/2)', type: 'collect', target: 'cuerda', count: 2 },
      { id: 'o3', text: 'Entrégalas a Tom', type: 'talk', target: 'tom_vela' },
    ],
    rewards: { xp: 80, items: [{ id: 'coin', count: 45 }] },
    completionJournal: 'Tom izó la vela nueva en la playa y el velero pareció diez años más joven. «Ahora el mar y yo volvemos a ser socios», dijo, guiñando el ojo al horizonte.',
  },
  sq_guardianes: {
    id: 'sq_guardianes',
    title: 'Guardianes de Piedra',
    description: 'Una estatua de caballero de la Orden vigila la costa norte. Aldric quiere saber si aún «recuerda».',
    journal: 'Aldric habló de un caballero de piedra: «la Orden tallaba a sus muertos mirando al mar, para que vigilen por siempre». Encuentra la estatua y la gruta cristal, y cuéntale qué queda de ellos.',
    objectives: [
      { id: 'o1', text: 'Encuentra la estatua del caballero de la Orden', type: 'flag', target: 'knight_seen' },
      { id: 'o2', text: 'Explora la gruta de los cristales', type: 'flag', target: 'poi_grotto' },
      { id: 'o3', text: 'Cuéntaselo a Aldric', type: 'talk', target: 'aldric_estatua' },
    ],
    rewards: { xp: 110, items: [{ id: 'pocion', count: 1 }] },
    completionJournal: 'El caballero de piedra sigue en pie, con la espada baja y la mirada al mar: un Guardián que no supo morir del todo. Aldric escuchó en silencio y apuntó algo en su libro de la Orden.',
  },
  sq_arce: {
    id: 'sq_arce',
    title: 'El Gran Arce',
    description: 'Maren habla de un arce dorado en lo alto del valle: el árbol más viejo de Eldoria. Su semilla vale más que una promesa.',
    journal: '«Antes de la guerra, los Guardianes plantaban un arce por cada juramento cumplido», dice Maren. Solo queda uno: dorado, enorme, en un claro del valle norte. Tráele una semilla: quiere plantar el segundo.',
    objectives: [
      { id: 'o1', text: 'Encuentra el Gran Arce del valle', type: 'flag', target: 'gran_arce_seen' },
      { id: 'o2', text: 'Recoge una semilla del Gran Arce', type: 'collect', target: 'semilla_arce', count: 1 },
      { id: 'o3', text: 'Llévasela a Maren', type: 'talk', target: 'maren_arce' },
    ],
    rewards: { xp: 100, items: [{ id: 'pocion', count: 2 }] },
    completionJournal: 'Maren guardó la semilla en un paño húmedo, como quien envuelve a un recién nacido. «El segundo juramento crecerá junto a la cascada», prometió. Ojalá viva mejor que el primero.',
  },
  sq_cazatormentas: {
    id: 'sq_cazatormentas',
    title: 'Cazatormentas',
    description: 'Tom apuesta a que no hay marinero que aguante una tormenta de verdad en alta mar. Demuéstrale lo contrario.',
    journal: '«Tormenta en puerto no es tormenta», gruñe Tom. Sal a la mar cuando el cielo se ponga negro y aguantará la apuesta: no hundirte, no volver hasta que truenes y olas lo hayan visto todo.',
    objectives: [
      { id: 'o1', text: 'Sobrevive a una tormenta navegando en alta mar', type: 'flag', target: 'storm_at_sea' },
      { id: 'o2', text: 'Cuéntaselo a Tom', type: 'talk', target: 'tom_tormenta' },
    ],
    rewards: { xp: 130, items: [{ id: 'coin', count: 80 }] },
    completionJournal: 'La tormenta me vio, tronó y se fue; yo seguí a flote. Tom me sirvió la jarra de la apuesta en silencio, con la dignidad de quien aprende. «Marinero —dijo al fin—. Con todas las letras».',
  },
  sq_estandarte: {
    id: 'sq_estandarte',
    title: 'Plumas de Obsidiana',
    description: 'Cae una pluma negra donde el Cuervo ruge. Recoge tres y descubre qué son realmente.',
    journal: 'Los pescadores recogen plumas negras «más duras que el hierro» después de cada vuelo sombra. Reúne tres y llévaselas a Aldric: él sabe leerlas.',
    objectives: [
      { id: 'o1', text: 'Reúne 3 plumas de obsidiana (0/3)', type: 'collect', target: 'reliquia_cuervo', count: 3 },
      { id: 'o2', text: 'Enséñaselas a Aldric', type: 'talk', target: 'aldric_plumas' },
    ],
    rewards: { xp: 150, items: [{ id: 'coin', count: 100 }] },
    completionJournal: 'Aldric sostuvo las plumas contra la luz del atardecer. «No son plumas —dijo—. Son escamas de sombra. El Cuervo se está deshaciendo en juramentos… y los juramentos buscan dueño».',
  },
  sq_lamento: {
    id: 'sq_lamento',
    title: 'El Lamento de Vaelthara',
    description: 'Vuelve a las ruinas de Vaelthara tras la muerte de la guardiana y escucha lo que el silencio tiene que decir.',
    journal: 'La guardiana cayó bajo mi acero, pero las ruinas siguen suyas — de nadie. Vuelve, siéntate entre las columnas y escucha: Aldric dice que los lugares recuerdan a sus dragones.',
    objectives: [
      { id: 'o1', text: 'Vuelve a las ruinas de Vaelthara y escucha el silencio', type: 'interact', target: 'ruins_silence' },
      { id: 'o2', text: 'Habla con Aldric sobre lo que oíste', type: 'talk', target: 'aldric_lamento' },
    ],
    rewards: { xp: 120, items: [{ id: 'pocion', count: 1 }] },
    completionJournal: 'Entre las columnas no había amenaza: había duelo. Un guardián sin dragón y un dragón sin guardián, ambos sin casa. Aldric asintió despacio: «Ahora entiendes por qué existimos».',
  },
  sq_vigia: {
    id: 'sq_vigia',
    title: 'El Último Vigía',
    description: 'Jorund recuerda un escondite del viejo vigía de la torre: solo se abre de noche, con luz de farol.',
    journal: 'El viejo vigía de la torre escondía su tesoro «donde solo la noche y el fuego lo encuentran». Sube a la torre de noche con el farol encendido (F) y registra la puerta tapiada.',
    objectives: [
      { id: 'o1', text: 'Registra la puerta tapiada de noche, con el farol encendido', type: 'interact', target: 'tower_stash' },
    ],
    rewards: { xp: 100, items: [{ id: 'coin', count: 90 }, { id: 'flecha', count: 8 }] },
    completionJournal: 'Detrás de la piedra movida encontré el escondite del vigía: oro contado, flechas secas y un diario con una sola frase legible — «La luz que guardo no es la mía». Así es este trabajo.',
  },
  sq_comercio: {
    id: 'sq_comercio',
    title: 'Rutas de Comercio',
    description: 'Elin dice que un comerciante de verdad llega a tener 200 monedas encima. Demuéstraselo y te conseguirá alforjas de montura.',
    journal: '«El oro que no se cuenta no hace ruido», dice Elin. Reúne 200 monedas a la vez y vuelve a su tienda: te ha reservado unas alforjas de cuero para tu montura.',
    objectives: [
      { id: 'o1', text: 'Ten 200 monedas de oro a la vez', type: 'flag', target: 'rich_200' },
      { id: 'o2', text: 'Presume ante Elin', type: 'talk', target: 'elin_comercio' },
    ],
    rewards: { xp: 130, items: [{ id: 'alforjas', count: 1 }] },
    completionJournal: 'Elin contó mi oro con una mirada y me entregó las alforjas: «cuero del bueno, costuras dobles». Tormenta las lleva mejor que yo la espada.',
  },
};

/** Chapter labels for the journal UI. */
export const CHAPTER_LABELS: Record<string, string> = {
  q10_orden: 'Capítulo IV — La Corona Hundida',
  q11_estandarte: 'Capítulo IV — La Corona Hundida',
  q12_acero: 'Capítulo IV — La Corona Hundida',
  q13_despertar: 'Capítulo V — El Cuervo de Tres Cabezas',
  q14_consejo: 'Capítulo V — El Cuervo de Tres Cabezas',
  q15_destino: 'Capítulo V — El Cuervo de Tres Cabezas',
};
