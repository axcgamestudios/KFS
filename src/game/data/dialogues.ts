/** Dialogue trees — fully data-driven, resolved by the DialogueSystem. */

export type DialogueActionSingle =
  | { t: 'flag'; flag: string }
  | { t: 'item'; id: string; count: number }
  | { t: 'takeItem'; id: string; count: number }
  | { t: 'quest'; id: string }
  | { t: 'xp'; amount: number }
  | { t: 'talk'; target: string }
  | { t: 'close' };

/** Actions can be a single action or a list applied in order. */
export type DialogueAction = DialogueActionSingle | DialogueActionSingle[];

export interface DialogueOption {
  text: string;
  next?: string;
  action?: DialogueAction;
  cond?: string;   // flag must be set to show
  notCond?: string; // flag must NOT be set to show
}

export interface DialogueNode {
  text: string;
  options: DialogueOption[];
}

export interface DialogueTree {
  /** First matching tree for an NPC is used. */
  cond?: string;
  notCond?: string;
  /** Marks a required item count (id>=count) for this tree to trigger. */
  requireItem?: { id: string; count: number };
  nodes: Record<string, DialogueNode>;
  start: string;
}

export interface NPCDialogue {
  npcId: string;
  name: string;
  trees: DialogueTree[];
}

export const DIALOGUES: Record<string, NPCDialogue> = {
  aldric: {
    npcId: 'aldric',
    name: 'Maestre Aldric',
    trees: [
      {
        notCond: 'talked_aldric',
        start: 'a1',
        nodes: {
          a1: {
            text: '¡Por las mareas! ¿Eres tú, muchacho? Eres el spitting image de Eirik cuando tenía tu edad… Saludos. Soy Aldric, maestre de este puerto. Tu padre era mi mejor amigo… y mi peor cliente de taberna.',
            options: [
              { text: 'He vuelto por su herencia. ¿Qué dejó para mí?', next: 'a2' },
              { text: '¿Erais amigos? Cuéntame cómo era.', next: 'a3' },
            ],
          },
          a3: {
            text: 'Terco como un ancla en el fango, y dos veces más leal. Reparaba barcos ajenos antes que el suyo. Los últimos meses hablaba de cartas antiguas, de rumbos que ningún mapamundi muestra… y de un cuervo de tres cabezas que según él le seguía.',
            options: [{ text: 'Un cuervo de tres cabezas…', next: 'a2' }],
          },
          a2: {
            text: 'Dejó un cofre de mar. Está en mi almacén, junto al muelle, cerrado con un cierre que solo abre un amuleto de cobre. Eirik confió el amuleto a Maren, la herborista. Si quieres lo que hay dentro… habla con ella.',
            options: [
              { text: 'Iré a verla. Gracias, Aldric.', next: 'a4', action: { t: 'flag', flag: 'talked_aldric' } },
              { text: '¿Y por qué no lo abriste vos mismo?', next: 'a5' },
            ],
          },
          a5: {
            text: '¿Y profanar la herencia de un amigo muerto? Nunca. Además… ese cierre no es cosa de herreros. Hay grabados en el metal que no vi ni en los archivos del castillo. Cosa de la Orden de la Marea, decía Eirik. Vete a ver a Maren: ella sabe más de lo que cuenta.',
            options: [
              { text: 'Iré a verla.', next: 'a4', action: { t: 'flag', flag: 'talked_aldric' } },
            ],
          },
          a4: {
            text: 'Un consejo, chico: Maren no regala nada. Te pedirá algo a cambio — pétalos, setas, paciencia. Cualquier cosa menos oro. Ah… y bienvenido a casa. Puerto Cuervo te necesita más de lo que crees.',
            options: [
              {
                text: 'Hasta pronto, Aldric.',
                action: [
                  { t: 'talk', target: 'aldric' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'chest_opened',
        notCond: 'aldric_ship_talked',
        start: 's1',
        nodes: {
          s1: {
            text: 'Así que lo has abierto. Vaya… la espada de Eirik. La última vez que la vi partía esa vela vieja hacia el noroeste, jurando que volvería en una semana. Llevo doce inviernos esperándole.',
            options: [
              { text: 'La carta habla de la Isla del Cuervo Viejo. Y de dragones.', next: 's2' },
              { text: 'El Colibrí de Mar… ¿puede volver a navegar?', next: 's2' },
            ],
          },
          s2: {
            text: 'Con madera buena, lona nueva y tres semanas de trabajo, el Colibrí volará sobre las olas. La quilla está sana — tu padre la hizo reposar en el fondo de la bahía para que la marea no la secara. Yo mismo supervisaré la carena… si me dejas ir contigo cuando zarpe.',
            options: [
              { text: 'Es un trato, maestre.', next: 's3' },
              { text: '¿Por qué ayudarías a un desconocido?', next: 's4' },
            ],
          },
          s4: {
            text: 'Porque Eirik era un Guardián de la Marea, y los Guardianes no eligen sucesores: la sal los elige. Tú has vuelto al puerto con su espada. En Aldmor eso solo significa una cosa… El mar te está llamando, muchacho.',
            options: [{ text: 'Entonces que me llame. Reparemos el Colibrí.', next: 's3' }],
          },
          s3: {
            text: '¡JA! ¡Esa chispa tenías que tener! Mientras trabajo el casco, tú hazte a la mar de otra forma: explora Aldmor, reúne provisiones, aprende sus senderos. Cuando el Colibrí esté listo, el Capítulo II de tu historia comenzará: Los Mares Olvidados te esperan.',
            options: [
              {
                text: 'Nos vemos en el muelle, Aldric.',
                action: [
                  { t: 'flag', flag: 'aldric_ship_talked' },
                  { t: 'talk', target: 'aldric_ship' },
                  { t: 'xp', amount: 30 },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        start: 'd1',
        nodes: {
          d1: {
            text: 'El puerto está inquieto. Los mercantes dicen que hay una vela negra patrullando el paso del noroeste. Piratas… o algo peor. Si vas a explorar la costa, vuelve antes del anochecer.',
            options: [
              { text: '¿Piratas tan cerca de la bahía?', next: 'd2' },
              { text: 'Que los mares te sean leves, Aldric.', action: { t: 'close' } },
            ],
          },
          d2: {
            text: 'Los mares cambian, muchacho. Antes los dragones mantenían la paz de las rutas; luego, los reinos; ahora… nadie. Solo el oro manda sobre las olas. Por eso este puerto necesita gente como tú.',
            options: [{ text: 'Lo tendré en cuenta.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  maren: {
    npcId: 'maren',
    name: 'Maren la Herborista',
    trees: [
      {
        notCond: 'maren_met',
        start: 'm1',
        nodes: {
          m1: {
            text: 'Ahí estás. Te esperaba desde que la gaviota anunció tu vela. Tienes los ojos de tu padre… y su tozudez, apuesto. Soy Maren. Curo verrugas, miedos y… guardo recuerdos ajenos, como el amuleto que buscas.',
            options: [
              { text: 'Aldric dice que tenéis el amuleto de Eirik.', next: 'm2' },
              { text: '¿Cómo sabíais que venía a buscarlo?', next: 'm3' },
            ],
          },
          m3: {
            text: 'Porque las mareas traen más que algas, muchacho. Traen noticias, presagios… y a veces traen a la gente justa al lugar justo. El amuleto de cobre lleva años esperándote en mi arcón. Pero nada regalado se aprecia: tendrás que ganártelo.',
            options: [{ text: '¿Qué queréis a cambio?', next: 'm2' }],
          },
          m2: {
            text: 'Tres pétalos de marfil. Florecen donde el agua canta: junto al sendero de la cascada del norte, y entre las ruinas del bosque occidental, donde la umbría es honda. Con ellos preparo el remedio del invierno para el pueblo.',
            options: [
              {
                text: 'Los traeré. Esperadme.',
                next: 'm4',
                action: [
                  { t: 'flag', flag: 'maren_met' },
                  { t: 'talk', target: 'maren' },
                ],
              },
              { text: '¿No hay otra forma de ganármelo?', next: 'm5' },
            ],
          },
          m5: {
            text: 'La hay: robarlo. Pero entonces la marea te daría la espalda, y créeme: vas a necesitar que el mar te mire con buenos ojos. Los pétalos, muchacho. El norte y el oeste.',
            options: [
              {
                text: 'De acuerdo. Pétalos de marfil.',
                next: 'm4',
                action: [
                  { t: 'flag', flag: 'maren_met' },
                  { t: 'talk', target: 'maren' },
                ],
              },
            ],
          },
          m4: {
            text: 'Sigue el arroyo hacia las cumbres y encontrarás la cascada que susurra. Y en el bosque del oeste, las ruinas de los antiguos… ve con respeto: ese lugar recuerda a los que fueron. Que la umbría te sea piadosa.',
            options: [{ text: 'Volveré con los pétalos.', action: { t: 'close' } }],
          },
        },
      },
      {
        cond: 'maren_met',
        notCond: 'maren_herbs_done',
        requireItem: { id: 'petalo', count: 3 },
        start: 't1',
        nodes: {
          t1: {
            text: 'Hueles a rocío de cascada y a piedra antigua… Déjalos ver. ¡Vaya! Tres pétalos, ni uno marchito. Eirik recogía igual: con manos de pescador y paciencia de santo.',
            options: [
              {
                text: 'Entregar los tres pétalos',
                next: 't2',
                action: { t: 'takeItem', id: 'petalo', count: 3 },
              },
            ],
          },
          t2: {
            text: 'Están perfectos. Toma, lo prometido: el amuleto de cobre de tu padre. Y una cosa más, porque los ojos te delatan: tu familia no eran pescadores, muchacho. Eran Guardianes de la Marea. Custodios del pacto con los que duermen bajo el mar.',
            options: [
              { text: '¿El pacto… con los dragones?', next: 't3' },
              { text: '¿Por qué no me lo contaron nunca?', next: 't4' },
            ],
          },
          t3: {
            text: 'Con los dragones, sí. Los que cantan las canciones de taberna y los que de verdad vuelan sobre las Garrahielo. La Orden velaba el equilibrio: que los reyes no codiciaran lo hundido, y que lo hundido no codiciara la superficie. Tu padre fue el último Guardián… que yo conozca.',
            options: [{ text: 'Y ahora ¿qué soy yo?', next: 't5' }],
          },
          t4: {
            text: 'Porque los Guardianes juran silencio, y el silencio protege. Un Guardián que grita su nombre en la taberna pone una diana sobre su familia. Eirik te calló la verdad para que pudieras dormir de niño. Ahora ya puedes despertar.',
            options: [{ text: 'Entonces despertaré.', next: 't5' }],
          },
          t5: {
            text: 'Eres lo que la sal elija. Ahora ve: el cofre de tu padre espera en el almacén del puerto. Y cuando la carta que guardo en mi memoria llegue a tus manos… recuerda que las viejas órdenes nunca mueren mientras alguien recuerde sus votos. Toma también estas pociones: vas a necesitarlas.',
            options: [
              {
                text: 'Gracias, Maren.',
                action: [
                  { t: 'item', id: 'amuleto', count: 1 },
                  { t: 'flag', flag: 'maren_herbs_done' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'maren_met',
        notCond: 'maren_herbs_done',
        start: 'w1',
        nodes: {
          w1: {
            text: '¿Los pétalos, muchacho? Recuerda: florecen en la umbría. La cascada del norte, junto al sendero… y el bosque occidental, entre las ruinas que el musgo reclama. La naturaleza solo abre sus tesoros a quien camina despacio.',
            options: [
              { text: 'Sigo buscando.', action: { t: 'close' } },
              { text: '¿Cómo llego a la cascada?', next: 'w2' },
            ],
          },
          w2: {
            text: 'Del pozo de la plaza, camina al norte siguiendo el arroyo hasta las estribaciones. Oye el agua cantar antes de verla: por eso la llaman la Susurrante. Y de vuelta… cuidado con los lobos al anochecer. El bosque tiene hambre este año.',
            options: [{ text: 'Iré con cuidado.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 'f1',
        nodes: {
          f1: {
            text: 'Las hierbas me contaron que subiste a las Garrahielo. Pocos vuelven de allí con la cabeza girada hacia el cielo… Los pastores dicen que una sombra alada cruza las cumbres al atardecer. Yo digo: reza para que siga durmiendo.',
            options: [
              { text: '¿Creéis en los dragones, Maren?', next: 'f2' },
              { text: 'Debo irme.', action: { t: 'close' } },
            ],
          },
          f2: {
            text: 'Creo en lo que curan mis hierbas y en lo que hunden los mares. Los dragones… son ambas cosas, muchacho. Fueron remedio del mundo una vez. Y fueron su veneno. La Orden lo sabía. Por eso existían Guardianes.',
            options: [{ text: 'Como mi padre.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  rosa: {
    npcId: 'rosa',
    name: 'Rosa, tabernera del Ancla Rota',
    trees: [
      {
        notCond: 'rosa_started',
        start: 'r1',
        nodes: {
          r1: {
            text: '¡Un cara nueva que no me debe dinero! Bienvenido al Ancla Rota, el único lugar de Aldmor donde la cerveza es más honesta que los precios. ¿Pinta? ¿Rumores? ¿Trabajo?',
            options: [
              { text: 'Has dicho ¿trabajo?', next: 'r2' },
              { text: 'Solo miraba la taberna. Adelante con la noche.', action: { t: 'close' } },
            ],
          },
          r2: {
            text: 'La tormenta del mes pasado partió al Espejismo contra la costa oeste. Se llevó medio cargamento de especias con que pagaba la letra de mi taberna. Si me lo traes del naufragio… oro contante y una poción de la casa. Yo no voy: el mar me escupe y yo le escupo a él.',
            options: [
              {
                text: 'Buscaré tu cargamento en la costa oeste.',
                next: 'r3',
                action: { t: 'flag', flag: 'rosa_started' },
              },
              { text: 'Suena a trabajo de marea baja… Lo pensaré.', action: { t: 'close' } },
            ],
          },
          r3: {
            text: '¡Esa es! Sigue la playa del oeste hasta ver el casco partido. Mi caja lleva el sello del ancla rota grabado a fuego. Y cuidado con lo que el mar devuelve… no todo lo que trae la marea está muerto.',
            options: [
              {
                text: 'Volveré con la caja.',
                action: [
                  { t: 'quest', id: 'q_rosa' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'rosa_started',
        notCond: 'rosa_done',
        requireItem: { id: 'cargamento', count: 1 },
        start: 'r4',
        nodes: {
          r4: {
            text: '¡Por el ancla de mi bisabuela! ¡La caja de especias! Huele… a canela y a beneficio. Toma tu recompensa, marinero: el oro prometido y la poción de la casa — la beben los pescadores cuando el mar les escupe mal heridos.',
            options: [
              {
                text: 'Un trato es un trato, Rosa.',
                action: [
                  { t: 'takeItem', id: 'cargamento', count: 1 },
                  { t: 'talk', target: 'rosa_return' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'canvas_given',
        requireItem: { id: 'petalo', count: 3 },
        start: 'rc1',
        nodes: {
          rc1: {
            text: '¿Tres pétalos de marfil más? La luna me sonría. Con el baño de pétalo la lona queda encerada, teñida y tres veces más fuerte — el secreto de las velas que no se rompen. Dame un minuto… ya está: tres piezas de primera, listas para el Colibrí.',
            options: [
              {
                text: 'Un arte, Rosa. Tomad.',
                action: [
                  { t: 'takeItem', id: 'petalo', count: 3 },
                  { t: 'item', id: 'lona', count: 3 },
                  { t: 'flag', flag: 'canvas_given' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'canvas_given',
        requireItem: { id: 'coin', count: 20 },
        start: 'rc2',
        nodes: {
          rc2: {
            text: 'Sin pétalos también se puede, aunque la lona sale blanca y menos noble: lino del norte a veinte monedas las tres piezas. Elige tú: la marea no espera y Bram tampoco.',
            options: [
              {
                text: 'Tomo el lino. Aquí tenéis.',
                action: [
                  { t: 'takeItem', id: 'coin', count: 20 },
                  { t: 'item', id: 'lona', count: 3 },
                  { t: 'flag', flag: 'canvas_given' },
                  { t: 'close' },
                ],
              },
              { text: 'Volveré con pétalos de marfil.', action: { t: 'close' } },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'canvas_given',
        start: 'rc3',
        nodes: {
          rc3: {
            text: '¿La lona para el Colibrí? Claro que sé hacerla — lavé las velas de tu padre años enteros. Tráeme tres pétalos de marfil para el baño de encerado… o veinte monedas si la naturaleza no te sonríe esta semana.',
            options: [
              { text: 'Ya os traigo una cosa u otra.', action: { t: 'close' } },
            ],
          },
        },
      },
      {
        start: 'r5',
        nodes: {
          r5: {
            text: 'Sabías que tu padre pagaba sus deudas cantando? Mal, pero cantando. Si heredaste la voz, la casa invita. Si heredaste la sed… la casa cobra doble.',
            options: [
              { text: 'Tomaré algo y escucharé los rumores.', next: 'r6' },
              { text: 'Otra noche será.', action: { t: 'close' } },
            ],
          },
          r6: {
            text: 'Pues apunta: un mercante jura que vio luces bajo el agua al noroeste, donde se dice que se hundió la vieja capital. Y el viejo Jorund asegura que las piedras del círculo cantan las noches sin luna. Yo solo sé que la marea trae cosas raras este año…',
            options: [{ text: 'Cosas raras… las mías son las peores. Salud.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  bram: {
    npcId: 'bram',
    name: 'Bram el Herrero',
    trees: [
      {
        cond: 'aldric_ship_talked',
        notCond: 'ship_repaired',
        start: 'rf1',
        nodes: {
          rf1: {
            text: 'Así que el Colibrí volverá al agua y tú eres el nuevo dueño. Bien. Aldric ya me adelantó la mitad del pago — la otra mitad me la debes en madera, lona y cuerda. Yo pongo los clavos, el sudor y los juramentos.',
            options: [
              { text: '¿Qué necesita exactamente el casco?', next: 'rf2' },
              { text: '¿Y vos no os hacéis a la mar?', next: 'rf3' },
            ],
          },
          rf2: {
            text: 'Cuatro tablones de roble curado — hay cajas marcadas con mi sello en el muelle, en la costa del naufragio y en el sendero de la cascada. Tres piezas de lona encerada, que Rosa sabe preparar como nadie. Y dos cuerdas de cáñamo del buenísimo de Tom. Cuando lo tengas todo, deja los materiales junto al casco y yo me encargo del resto.',
            options: [
              {
                text: 'Con esa lista, a trabajar. Buena forja, Bram.',
                action: [
                  { t: 'talk', target: 'bram_refit' },
                  { t: 'close' },
                ],
              },
              { text: '¿Y si falta algo?', next: 'rf3' },
            ],
          },
          rf3: {
            text: 'El Colibrí no zarpa a medias, muchacho. Ni los barcos ni los hombres. Consigue la lista completa y hablamos de mareas. Y una cosa más: cuando navegues, escucha al casco. La madera avisa antes de romperse… si sabes escuchar.',
            options: [
              {
                text: 'Aprenderé a escuchar. Adiós, Bram.',
                action: [
                  { t: 'talk', target: 'bram_refit' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'ship_repaired',
        start: 'rf4',
        nodes: {
          rf4: {
            text: '¡Ahí está el nuevo capitán! El casco canta bien, ¿verdad? Le puse refuerzos dobles en la quilla, donde a tu padre le gustaba rozar los arrecifes. Si oyes un crujido raro a babor… es el recuerdo de Eirik protestando, no la madera.',
            options: [{ text: 'Ojalá proteste muchos años. Buena forja.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 'b1',
        nodes: {
          b1: {
            text: '¡Chispas! Acércate al fuego, que el norte corta esta temporada. ¿Hierro que reparar? ¿Uñas de barco? ¿O vienes a que te hable de la vez que vi una escama del tamaño de un escudo caer del cielo?',
            options: [
              { text: '¿Una escama… del cielo?', next: 'b2' },
              { text: '¿Trabajo tienes para mí?', next: 'b3' },
              { text: 'Solo pasaba. Buena forja.', action: { t: 'close' } },
            ],
          },
          b2: {
            text: 'Iba yo con mi abuelo por el paso alto, hace treinta inviernos. Cayó girando como una hoja plateada y clavóse en el hielo a un pie de mi bota. Mi abuelo la miró, la dejó ahí y dijo: «Donde cae una escama, pronto cae su dueño. Corre.» Corrimos. Nunca volvimos por aquel paso.',
            options: [
              { text: '¿Y aún conserváis la escama?', next: 'b4' },
              { text: 'Buena historia para la taberna.', action: { t: 'close' } },
            ],
          },
          b4: {
            text: 'La fundí, muchacho. De ella salieron diez hoces y dos espadas… y te juro por la forja que el acero salió cantando. Aún me despierto algunas noches y oigo el eco de ese canto bajo la tierra. El metal recuerda, como el mar.',
            options: [{ text: 'Entonces el metal y yo nos entenderemos. Adiós.', action: { t: 'close' } }],
          },
          b3: {
            text: 'Para un muchacho con piernas: traeme carbón del monte y te afilo lo que lleves. Pero, entre nosotros, mejor trabajo es el que te da Aldric: el puerto paga… y el mar enseña.',
            options: [{ text: 'Iré a verle. Buena forja, Bram.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  tom: {
    npcId: 'tom',
    name: 'Tom el Pescador',
    trees: [
      {
        cond: 'aldric_ship_talked',
        notCond: 'rope_given',
        requireItem: { id: 'coin', count: 10 },
        start: 'tr1',
        nodes: {
          tr1: {
            text: '¿Eso que suena en tu bolsa? Exacto: monedas. Diez, contadas. Y estas son mis dos mejores cuerdas de cáñamo, trenzadas por mí, aguanta un mástil en plena galerna. Trato hecho, ¿eh? Nada de devoluciones: el cáñamo ya conoce tu olor.',
            options: [
              {
                text: 'Trato hecho, Tom.',
                action: [
                  { t: 'takeItem', id: 'coin', count: 10 },
                  { t: 'item', id: 'cuerda', count: 2 },
                  { t: 'flag', flag: 'rope_given' },
                  { t: 'close' },
                ],
              },
            ],
          },
        },
      },
      {
        cond: 'aldric_ship_talked',
        notCond: 'rope_given',
        start: 'tr2',
        nodes: {
          tr2: {
            text: 'Cuerda de cáñamo para el Colibrí, ¿eh? Tengo las mejores del puerto… pero ya no regalo nada desde que un lobo me debía una red. Diez monedas por las dos cuerdas. El cáñamo no crece en las piedras, muchacho.',
            options: [
              { text: 'Volveré con las monedas.', action: { t: 'close' } },
              { text: '¿Y no bajáis el precio para el hijo de Eirik?', next: 'tr3' },
            ],
          },
          tr3: {
            text: 'Para el hijo de Eirik bajo la charla y subo el cariño: diez monedas igual, pero con un nudo de suerte regalado. Los precios de pescador son como las mareas, muchacho: firmes.',
            options: [{ text: 'Tendrá razón la marea. Hasta luego.', action: { t: 'close' } }],
          },
        },
      },
      {
        start: 't1',
        nodes: {
          t1: {
            text: '¡Eh! Tú el de la barba de Eirik. Bienvenido al muelle: donde los peces son listos y los hombres no tanto. ¿Vienes a pescar o a perderte como tu padre?',
            options: [
              { text: '¿Perderse? Cuéntame.', next: 't2' },
              { text: '¿Qué se pesca por aquí?', next: 't3' },
            ],
          },
          t2: {
            text: 'Eirik se perdía a propósito, muchacho. Tomaba el Colibrí y desaparecía semanas, rumbo al noroeste, donde las cartas se quedan blancas. Volvía con la bodega llena de cosas… raras. Pergaminos. Piedras que brillan. Y una vez, juro por la marea, un diente más largo que mi brazo.',
            options: [
              { text: '¿Un diente? ¿De qué bestia?', next: 't4' },
              { text: 'Parecía otro hombre.', action: { t: 'close' } },
            ],
          },
          t4: {
            text: 'De la que no se pesca con caña, eso seguro. Lo cambió en el mercado del sur por un saco de plata. El comprador llevaba capa con… bah, ya ni lo recuerdo. El mar borra los detalles y se queda con las historias.',
            options: [{ text: 'Gracias, Tom.', action: { t: 'close' } }],
          },
          t3: {
            text: 'Beso de dragón al amanecer, lubina entre las rocas del este y peces espada cuando el agua hierve en agosto. Y mentiras de pescador todo el año — las más sabrosas. Si el Colibrí vuelve a navegar, apúntame: echo el anzuelo y una canción.',
            options: [{ text: 'Te tendré presente.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  elin: {
    npcId: 'elin',
    name: 'Elin, tendera',
    trees: [
      {
        start: 'e1',
        nodes: {
          e1: {
            text: '¡Fruta, queso y cintas de colores! Perdona el desorden, es día de mercado. ¿Sabes que eres el tema de la semana? El hijo del Guardián… digo, del capitán Eirik, vuelve al puerto. La gente habla.',
            options: [
              { text: '¿Y qué dice la gente?', next: 'e2' },
              { text: '¿Qué se vende hoy?', next: 'e3' },
            ],
          },
          e2: {
            text: 'Que los mares se agitan. Que la pesca escasea desde que esa vela negra merodea el paso. Y que las cabras del norte se niegan a pastar en la ladera de las Garrahielo. Los animales saben, muchacho. Siempre saben antes que nosotros.',
            options: [{ text: 'Lo recordaré. Buen mercado.', action: { t: 'close' } }],
          },
          e3: {
            text: 'Queso de cabra de las colinas, manzanas de huerta y sal del este. Todo a precio de amigo del puerto. Ah, y si subes a la cascada del norte, tráeme plumas de halcón: pago bien por ellas, dicen que dan suerte… a los que navegan.',
            options: [{ text: 'Quizá suba a por ellas.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  jorund: {
    npcId: 'jorund',
    name: 'Guardia Jorund',
    trees: [
      {
        start: 'j1',
        nodes: {
          j1: {
            text: 'Alto ahí… bah, tranquilo, muchacho. Todo el pueblo sabe quién eres. Jorund, guardia de la puerta. Mantén la paz dentro de los muros y no tendremos palabras… salvo las amistosas.',
            options: [
              { text: '¿Paz? ¿Pasa algo en el pueblo?', next: 'j2' },
              { text: '¿Algún consejo de guardia veterano?', next: 'j3' },
            ],
          },
          j2: {
            text: 'Bandidos en los caminos del sur, lobos con hambre en el bosque y algo que aúlla cerca del círculo de piedras las noches sin luna. El viejo señor del castillo duplicó la guardia. Yo solo digo: Puerto Cuervo duerme con un ojo abierto.',
            options: [
              { text: '¿El círculo de piedras dices?', next: 'j4' },
              { text: 'Dormiréis bien vigilados.', action: { t: 'close' } },
            ],
          },
          j4: {
            text: 'No vayas, muchacho. En serio. Mi abuelo enterró a dos compañeros que fueron a «ver las runas brillar». Los encontró la marea: mirando al cielo, sonriendo, sin marca alguna. Hay bellezas que no se miran dos veces. Esa es una.',
            options: [{ text: '…Lo recordaré. Gracias, Jorund.', action: { t: 'close' } }],
          },
          j3: {
            text: 'Uno: en las ruinas, pisa fuerte, que las serpientes huyen del ruido. Dos: si el bosque calla de golpe, no corras: cuenta hasta diez y camina despacio. Y tres… la cerveza de Rosa cobra intereses. Cuídate de las tres cosas y vivirás más que yo.',
            options: [{ text: 'Sabiduría de guardia. Me la quedo.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },

  sigrid: {
    npcId: 'sigrid',
    name: 'Sigrid la Lavandera',
    trees: [
      {
        start: 'sg1',
        nodes: {
          sg1: {
            text: 'Cuidado con las baldosas, que el jabón no perdona. Ay, sí, tú eres el hijo de Eirik… Yo lavé sus velas años, sabes. En una encontré una carta cosida al doblez. Se la devolví sin leer… aunque la tentación fue grande, eso sí.',
            options: [
              { text: '¿Una carta cosida? ¿Qué decía?', next: 'sg2' },
              { text: 'Buena persona era mi padre.', action: { t: 'close' } },
            ],
          },
          sg2: {
            text: 'No lo sé, muchacho, y que los dioses me perdonen: no la leí. Pero recuerdo el sello de lacre: un círculo de mareas alrededor de una llama. Días después, tu padre se hizo a la mar con ese mismo sello colgado del cuello… y no volvió más.',
            options: [{ text: 'Un círculo de mareas… como el amuleto.', action: { t: 'close' } }],
          },
        },
      },
    ],
  },
};

/** Narrator-style lore interactions (tablets, stones, doors). */
export interface LoreInteraction {
  id: string;
  title: string;
  text: string[];
}

export const LORE: Record<string, LoreInteraction> = {
  tablet_ruins: {
    id: 'tablet_ruins',
    title: 'Tablilla de Vaelthara',
    text: [
      'La piedra está fría pese al sol. Los caracteres, medio borrados por el musgo, parecen ondular como agua estancada.',
      '«…y juraron los Siete Velar el Suebre de los Señores del Fuego, y sellaron la ciudad bajo la marea…»',
      '«…cuando el cuervo de tres cabezas alce vuelo, despertarán los que duermen. Guardad la Marea. Guardad el pacto…»',
      'Debajo, con caligrafía distinta y más reciente, alguien grabó: «E. estuvo aquí. La Orden vive.»',
    ],
  },
  stones_center: {
    id: 'stones_center',
    title: 'El Altar del Círculo',
    text: [
      'Colocas la mano sobre la piedra del altar. Está tibia, como un animal dormido.',
      'Un zumbido grave recorre el círculo. Las runas de los monolitos laten con una luz verdosa, sincronizadas… con tu pulso.',
      'En cuanto retiras la mano, todo se apaga. El silencio del prado vuelve, pero tarda en volverse natural, como si el aire dudara.',
    ],
  },
  tower_door: {
    id: 'tower_door',
    title: 'Torre del Vigía',
    text: [
      'La puerta está tapiada con maderos podridos. Por las juntas asoman telarañas del tamaño de pañuelos.',
      'Una placa oxidada recuerda mejores tiempos: «Aquí veló Halvor el Alerta, cuarenta años mirando el mar. Ninguna vela enemiga cruzó su horizonte.»',
      'Alguien arrancó la campana de su soporte. En el suelo, marcas de arrastre se pierden monte abajo, hacia el oeste.',
    ],
  },
  ship_colibri: {
    id: 'ship_colibri',
    title: 'Colibrí de Mar',
    text: [
      'La vieja carabela descansa junto al muelle, rodeada de andamios. El casco muestra remiendos recientes y parches de madera nueva.',
      'En la popa, medio borrada por la sal, una figura de colibrí persigue una estrella. Bajo la línea de flotación, en la quilla, hay un sello que te pone la piel de gallina: un círculo de mareas alrededor de una llama.',
      'El mismo sello que describía Sigrid. El barco de tu padre era algo más que un barco.',
    ],
  },
};
