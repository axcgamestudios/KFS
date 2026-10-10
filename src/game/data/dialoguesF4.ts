import { DIALOGUES, type DialogueTree, type NPCDialogue } from './dialogues';

/**
 * Fase 4 dialogue trees.
 *
 * Trees are PREPENDED to each NPC's list so their specific conditions match
 * before the unconditional defaults. Includes Halvard (new NPC, the stable
 * master) and the virtual "altar" dialogue used by the ending choice.
 */
const INSERTS: Record<string, DialogueTree[]> = {
  // ---------------- ALDRIC — Chapters IV & V ----------------
  aldric: [
    {
      // q10: after the Ancestor falls — the Order assembles
      cond: 'ancestro_dead',
      notCond: 'aldric_f4_talked',
      start: 'f4_1',
      nodes: {
        f4_1: {
          text: 'El Colmillo del Ancestro… entonces es cierto: el pacto puede volver a tejerse. Escucha bien, muchacho, porque esto no lo he contado en cien años. La Orden de la Marea custodiaba tres reliquias: el Sello que recuperaste a Morwen, el Corazón de Marea que arrancaste a la guardiana… y la Corona de Thalassar, que se hundió con los reyes del santuario.',
          options: [
            { text: '¿Un santuario… hundido?', next: 'f4_2' },
            { text: '¿Para qué servirían las tres reliquias?', next: 'f4_2b' },
          ],
        },
        f4_2: {
          text: 'Al noreste de la bahía, donde el agua baja turquesa, duermen las ruinas de Thalassar bajo cinco metros de marea. Con la respiración tranquila se pueden recorrer a nado. La Corona descansaba en su altar… y con ella, la llave del Cuervo: la sombra busca esas reliquias tanto como nosotros.',
          options: [{ text: 'Iré a por la Corona.', next: 'f4_3' }],
        },
        f4_2b: {
          text: 'Juntas, cantan. El Sello convoca a la Orden, el Corazón templa a los dragones, la Corona… la Corona decide quién guarda el pacto. Por eso el Cuervo las fue robando una a una durante un siglo. Tú le has arrebatado dos. Ve por la tercera: el santuario de Thalassar, al noreste de la bahía.',
          options: [{ text: 'Iré a por la Corona.', next: 'f4_3' }],
        },
        f4_3: {
          text: 'Una cosa más: cuando vuelvas con la Corona, busca a Halvard, el herrador de establos, junto al camino del norte. Guardó algo de tu padre todos estos años… algo con cuatro patas y mal genio. La Orden vuelve a tener Guardián — y un Guardián no va a pie.',
          options: [
            {
              text: 'Por la Orden, Aldric.',
              action: [
                { t: 'talk', target: 'aldric_f4' },
                { t: 'flag', flag: 'aldric_f4_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // q11: report after the flagship
      cond: 'flagship_looted',
      notCond: 'aldric_estandarte_talked',
      start: 'st1',
      nodes: {
        st1: {
          text: '¿La carta de navegación del Cuervo? Déjame ver… aquí: la cala sin nombre, al pie de la Fortaleza del Cuervo Viejo. «Donde duerme el Cuervo. No despertarlo sin las tres llaves». Bueno, Guardian: tienes dos. La tercera está en tu mochila.',
          options: [
            { text: '¿La Corona es la tercera llave?', next: 'st2' },
            { text: '¿Qué encontraremos en esa cala?', next: 'st2' },
          ],
        },
        st2: {
          text: 'Un anfiteatro de basalto que los piratas nunca se atrevieron a profanar. Dicen que una estatua de caballero —uno de los nuestros— vigila la entrada desde hace trescientos años. Prepara el acero, muchacho: Kraivenn no es un dragón más. Es la sombra del primer juramento roto, y bebe de cada corona que se alza.',
          options: [
            {
              text: 'Que me espere despierto.',
              action: [
                { t: 'flag', flag: 'aldric_estandarte_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // q14: the Council
      cond: 'kraivenn_dead',
      notCond: 'aldric_consejo_talked',
      start: 'cn1',
      nodes: {
        cn1: {
          text: 'El Corazón del Cuervo… aún está caliente. Lo oigo latir a través del cuero. Guardián — el último Consejo de las Mareas se celebró hace cien años, la noche antes de que todo se hundiera. Esta noche se celebra el siguiente. En el Nido del Ancestro, donde el pacto se firmó.',
          options: [
            { text: '¿Qué debo hacer?', next: 'cn2' },
            { text: '¿Y tú qué harás, Aldric?', next: 'cn3' },
          ],
        },
        cn2: {
          text: 'Llevar las tres reliquias al altar del Nido: Sello, Corona y Corazón. El altar reconocerá al Guardián… y entonces tendrás que decidir. Restaurar el pacto, alzar la corona o devolverlo todo al mar. Ningún maestre puede elegir por ti. Ni tu padre pudo.',
          options: [{ text: 'Iré al Nido.', next: 'cn4' }],
        },
        cn3: {
          text: 'Lo que hice la primera vez: escribirlo todo, para que quien venga después sepa que existimos. Pero esta vez lo escribiré con final feliz… si se te ocurre uno, elige ese.',
          options: [{ text: 'Iré al Nido, Aldric.', next: 'cn4' }],
        },
        cn4: {
          text: 'Un consejo de viejo, si me permites: pase lo que pase ahí arriba, abajo seguirá habiendo un puerto con gente que cree en ti. Las coronas y los pactos son para las canciones. La gente, para las noches de taberna. No lo olvides.',
          options: [
            {
              text: 'No lo olvidaré.',
              action: [
                { t: 'talk', target: 'aldric_consejo' },
                { t: 'flag', flag: 'aldric_consejo_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_guardianes: the knight statue report
      cond: 'knight_seen',
      notCond: 'estatua_reported',
      start: 'es1',
      nodes: {
        es1: {
          text: '¿La estatua sigue en pie? Trescientos años mirando al mar… Los Guardianes de piedra eran el último homenaje de la Orden: «velarán por nosotros cuando nosotros ya no podamos». Y la gruta, ¿sigue cantando?',
          options: [
            {
              text: 'Los cristales siguen allí. También los drakelings.',
              next: 'es2',
            },
          ],
        },
        es2: {
          text: 'La vida vuelve, pues. Como los dragones, como las desgracias, como los Guardianes. Apuntaré la estatua en el libro de la Orden: «El Caballero del Norte aún vela». Algo hay que el Cuervo no ha podido robar.',
          options: [
            {
              text: 'Aún vela.',
              action: [
                { t: 'talk', target: 'aldric_estatua' },
                { t: 'flag', flag: 'estatua_reported' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_estandarte: obsidian feathers
      cond: 'plumas_f4_started',
      notCond: 'plumas_f4_done',
      requireItem: { id: 'reliquia_cuervo', count: 3 },
      start: 'pl1',
      nodes: {
        pl1: {
          text: 'A ver esas plumas… Mmm. No son plumas, muchacho. Son escamas de sombra: el Cuervo se está deshaciendo en juramentos, y los juramentos buscan dueño. ¿Las oyes? Susuran. Guárdalas lejos de tu cama y cerca de tu espada.',
          options: [
            {
              text: '¿De quién eran estos juramentos?',
              next: 'pl2',
            },
          ],
        },
        pl2: {
          text: 'De reyes, Guardianes y dragones que prometieron demasiado. El Cuervo los bebió uno a uno. Si cae alguna vez, esas escamas volverán a ser promesas… y ojalá alguien con mejor cabeza que la mía esté allí para no recogerlas.',
          options: [
            {
              text: 'Quédalas vos, Aldric.',
              action: [
                { t: 'takeItem', id: 'reliquia_cuervo', count: 3 },
                { t: 'talk', target: 'aldric_plumas' },
                { t: 'flag', flag: 'plumas_f4_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_lamento: after listening to the ruins
      cond: 'lamento_done',
      notCond: 'lamento_reported',
      start: 'lm1',
      nodes: {
        lm1: {
          text: '¿Y qué decía el silencio? … Ya veo. Duelo, dices. Un guardián sin dragón y un dragón sin guardián. Así se siente perder la mitad de un juramento. Ahora entiendes por qué existimos: alguien tiene que quedar para escuchar.',
          options: [
            {
              text: 'Para escuchar.',
              action: [
                { t: 'talk', target: 'aldric_lamento' },
                { t: 'flag', flag: 'lamento_reported' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_estandarte: offer the feather hunt
      cond: 'ancestro_dead',
      notCond: 'plumas_f4_started',
      start: 'pl0',
      nodes: {
        pl0: {
          text: 'Los pescadores traen plumas negras del norte — «más duras que el hierro, frías como el fondo». Si te cruzas con tres, tráemel: querría confirmar una sospecha vieja sobre el Cuervo.',
          options: [
            {
              text: 'Las traeré.',
              action: [
                { t: 'flag', flag: 'plumas_f4_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- HALVARD — the stable master (new NPC) ----------------
  // (full definition below, not an insert)

  // ---------------- BRAM — the Guardian forge (q12) ----------------
  bram: [
    {
      cond: 'ancestro_dead',
      notCond: 'bram_forge_talked',
      start: 'fg1',
      nodes: {
        fg1: {
          text: 'El colmillo del Ancestro… El acero de los Guardianes se forjaba así: dragón viejo, juramento nuevo. Tráeme tres escamas de dragón además del colmillo, y en mi yunque nacerá la Espada del Guardián. La que silba, sí. He oído las historidades.',
          options: [
            { text: '¿Escamas de cualquier dragón?', next: 'fg2' },
            { text: 'Trato hecho, Bram.', next: 'fg3' },
          ],
        },
        fg2: {
          text: 'De cualquier dragón que hayas derrotado, no robado. La forja distingue. Trae las escamas y el colmillo al yunque — sabré qué hacer con ellos.',
          options: [{ text: 'Trato hecho, Bram.', next: 'fg3' }],
        },
        fg3: {
          text: 'Y avisa a Maren para las provisiones y a Halvard para Tormenta. Si vas a despertar al Cuervo, irás con la Orden entera a la espalda. Nunca fuisteis héroes solitarios — para eso ya están las canciones.',
          options: [
            {
              text: 'Con la Orden entera.',
              action: [
                { t: 'talk', target: 'bram_forge' },
                { t: 'flag', flag: 'bram_forge_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_yunque: scales delivery
      cond: 'yunque_started',
      notCond: 'yunque_done',
      requireItem: { id: 'escama', count: 3 },
      start: 'yq1',
      nodes: {
        yq1: {
          text: '¡Mis escamas! Perfectas, perfectas… Con esto templeré un acero que cortará la bruma como la proa de tu carabela. Déjalas aquí — y acepta esto, que un herrero sin deudas forja mejor.',
          options: [
            {
              text: 'Un placer, maestro.',
              action: [
                { t: 'takeItem', id: 'escama', count: 3 },
                { t: 'talk', target: 'bram_yunque' },
                { t: 'flag', flag: 'yunque_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_yunque: offer
      cond: 'ship_repaired',
      notCond: 'yunque_started',
      start: 'yq0',
      nodes: {
        yq0: {
          text: '¿Tú otra vez? Bien. Escamas de dragón busco — tres, bien gruesas. Con ellas templaré el mejor acero del norte y te lo deberé. «Bram el Herrero debe una» es una frase que abre puertas, ya verás.',
          options: [
            {
              text: 'Veré qué encuentro.',
              action: [
                { t: 'flag', flag: 'yunque_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- MAREN — potions & petals ----------------
  maren: [
    {
      // q12: provisions
      cond: 'bram_forge_talked',
      notCond: 'maren_potions_talked',
      start: 'mp1',
      nodes: {
        mp1: {
          text: '¿Vas a ir a despertar al Cuervo? Pues no irás con la despensa vacía. Toma: tres pociones de la buena, la de la raíz que solo crece de noche. Y bebe despacio, que la prisa se paga en erupciones.',
          options: [
            { text: 'Gracias, Maren.', next: 'mp2' },
          ],
        },
        mp2: {
          text: 'Agradece a tu padre: la Orden me sacó de un naufragio cuando era niña. Si su hijo camina hacia el Cuervo, caminará con la marea a favor. Vuelve entero, ¿oíste? Las hierbas no se recogen solas.',
          options: [
            {
              text: 'Volveré entera… volveré entero.',
              action: [
                { t: 'item', id: 'pocion', count: 3 },
                { t: 'talk', target: 'maren_potions' },
                { t: 'flag', flag: 'maren_potions_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_petalo_tumba: petals delivery
      cond: 'petalo_tumba_started',
      notCond: 'petalo_tumba_done',
      requireItem: { id: 'petalo', count: 5 },
      start: 'pt1',
      nodes: {
        pt1: {
          text: 'Cinco pétalos de marfil… los has buscado bien. Los pondré en el altar del círculo: los Guardianes caídos merecen flores que no se marchitan. Duerme gente buena ahí abajo. Gente que prometió demasiado, como todos.',
          options: [
            {
              text: 'Que duerman con música.',
              action: [
                { t: 'takeItem', id: 'petalo', count: 5 },
                { t: 'talk', target: 'maren_petalo' },
                { t: 'flag', flag: 'petalo_tumba_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_arce: maple seed delivery
      cond: 'arce_started',
      notCond: 'arce_done',
      requireItem: { id: 'semilla_arce', count: 1 },
      start: 'ar1',
      nodes: {
        ar1: {
          text: '¡La semilla del Gran Arce! Todavía calientita… La plantaré junto al estanque de la cascada, donde el agua canta. «Un arce por cada juramento cumplido» — decían los Guardianes. El segundo juramento crecerá aquí, con nosotros.',
          options: [
            {
              text: 'Que crezca sano.',
              action: [
                { t: 'takeItem', id: 'semilla_arce', count: 1 },
                { t: 'talk', target: 'maren_arce' },
                { t: 'flag', flag: 'arce_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_petalo_tumba: offer
      cond: 'maren_herbs_done',
      notCond: 'petalo_tumba_started',
      start: 'pt0',
      nodes: {
        pt0: {
          text: 'Te iba a buscar. Los Guardianes caídos duermen en el círculo de piedras sin una sola flor — y los pétalos de marfil son las únicas que no se marchitan. Cinco bastan. ¿Me los conseguirías?',
          options: [
            {
              text: 'Cinco pétalos. Doy fe.',
              action: [
                { t: 'flag', flag: 'petalo_tumba_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_arce: offer
      cond: 'maren_herbs_done',
      notCond: 'arce_started',
      start: 'ar0',
      nodes: {
        ar0: {
          text: '¿Conoces al Gran Arce? El árbol dorado del valle norte… el último que plantaron los Guardianes. Tráeme una de sus semillas: quiero plantar el segundo. Un juramento nuevo para un puerto que empieza a creer en cosas de nuevo.',
          options: [
            {
              text: 'Semilla del Gran Arce. Marchando.',
              action: [
                { t: 'flag', flag: 'arce_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- TOM — fish, sails & storms ----------------
  tom: [
    {
      // sq_raciones: fish delivery
      cond: 'raciones_started',
      notCond: 'raciones_done',
      requireItem: { id: 'pez', count: 4 },
      start: 'ra1',
      nodes: {
        ra1: {
          text: '¡Cuatro peces! Y gordos, como manda la marea baja. Con esto las despensas aguantan un mes y el guiso de esta noche sabe a domingo. Deja, deja, que yo cargo — tú tienes dragones que molestar.',
          options: [
            {
              text: 'Buen provecho, Tom.',
              action: [
                { t: 'takeItem', id: 'pez', count: 4 },
                { t: 'talk', target: 'tom_raciones' },
                { t: 'flag', flag: 'raciones_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_vela: sailcloth delivery
      cond: 'vela_started',
      notCond: 'vela_done',
      requireItem: { id: 'lona', count: 3 },
      start: 've1',
      nodes: {
        ve1: {
          text: '¡La lona y las cuerdas! Con esto el velero vuelve a ser barco y no colador. Mi abuelo decía que una vela bien parcheada dura tres inviernos y dos bodas. Esta durará cuatro, para escándalo del cura.',
          options: [
            {
              text: 'A navegar, Tom.',
              action: [
                { t: 'takeItem', id: 'lona', count: 3 },
                { t: 'takeItem', id: 'cuerda', count: 2 },
                { t: 'talk', target: 'tom_vela' },
                { t: 'flag', flag: 'vela_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cazatormentas: report the storm
      cond: 'storm_at_sea',
      notCond: 'tormenta_done',
      start: 'to1',
      nodes: {
        to1: {
          text: '¿Así que aguantaste la tormenta de verdad? ¿Con truenos, olas y ese silencio feo que viene antes del golpe? … Bah. Yo también aguanté una, en el 84. Pero reconozco a un marinero cuando lo veo servir bien la apuesta. Tuya es la jarra.',
          options: [
            {
              text: 'Con todas las letras, Tom.',
              action: [
                { t: 'talk', target: 'tom_tormenta' },
                { t: 'flag', flag: 'tormenta_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_raciones: offer
      cond: 'talked_aldric',
      notCond: 'raciones_started',
      start: 'ra0',
      nodes: {
        ra0: {
          text: '¡Eh, marino! La marea baja dejó la pesca varada por toda la costa — cuatro peces y las gaviotas se lo comen antes que yo. Recógelos tú, que tienes piernas jóvenes, y las despensas del pueblo te lo agradecerán.',
          options: [
            {
              text: 'Por el guiso del domingo.',
              action: [
                { t: 'flag', flag: 'raciones_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_vela: offer
      cond: 'ship_repaired',
      notCond: 'vela_started',
      start: 've0',
      nodes: {
        ve0: {
          text: 'Mi velero tiene más parches que vela, y el invierno no espera. Tres lonas enceradas y dos cuerdas de cáñamo me lo dejan como nuevo. Rosa prepara la lona — esta vez la buena, no la de los corsarios.',
          options: [
            {
              text: 'Te las consigo.',
              action: [
                { t: 'flag', flag: 'vela_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cazatormentas: offer
      cond: 'ship_repaired',
      notCond: 'storm_at_sea',
      start: 'ca0',
      nodes: {
        ca0: {
          text: '¿Ves ese cielo? Tarde o temprano tronará. Y te apuesto la jarra a que no hay cuerpo vivo que aguante una tormenta de verdad allá fuera, en alta mar. Navega cuando truene y vuelve a contármelo… si vuelves.',
          options: [
            {
              text: 'Apuesta aceptada.',
              action: [
                { t: 'flag', flag: 'cazatormentas_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- ROSA — the tavern tales ----------------
  rosa: [
    {
      // sq_cartas: tablets report
      cond: 'lore_tower_door',
      notCond: 'cartas_done',
      start: 'rc1f',
      nodes: {
        rc1f: {
          text: '¡Las tres historias! El reino hundido, el altar que respira y el vigía loco… con eso tengo noches de taberna para todo el invierno. «La taberna El Ancla Rota presenta: LAS TABLILLAS DE LA COSTA». Toma algo de la casa — y de mi parte.',
          options: [
            {
              text: 'Las canciones son tuyas, Rosa.',
              action: [
                { t: 'talk', target: 'rosa_cartas' },
                { t: 'flag', flag: 'cartas_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cartas: offer
      cond: 'rosa_done',
      notCond: 'cartas_started',
      start: 'rc0',
      nodes: {
        rc0: {
          text: 'Negocio lento y noches largas, así está la casa. Necesito historias nuevas, ¿me oyes? Dicen que hay tres tablillas antiguas por la isla — ruinas, piedras, torre — con relatos de reyes hundidos. Léelas todas y tráeme el jugo, que yo lo convierto en canción.',
          options: [
            {
              text: 'Soy todo oídos… y ojos.',
              action: [
                { t: 'flag', flag: 'cartas_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- ELIN — the shopkeeper ----------------
  elin: [
    {
      // sq_espejo: mirror delivery
      cond: 'espejo_started',
      notCond: 'espejo_done',
      requireItem: { id: 'espejo', count: 1 },
      start: 'ep1',
      nodes: {
        ep1: {
          text: '¡El espejo del faro! ¿Sabes cuántas tormentas habrá reflejado este latón? Lo pondré junto a la caja: quiero ver quién entra dos veces. Precio justo, trato limpio — como siempre con vos.',
          options: [
            {
              text: 'Trato limpio.',
              action: [
                { t: 'takeItem', id: 'espejo', count: 1 },
                { t: 'talk', target: 'elin_espejo' },
                { t: 'flag', flag: 'espejo_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_caravana: wood delivery (needs the cart hitched)
      cond: 'caravana_started',
      notCond: 'caravana_done',
      requireItem: { id: 'madera', count: 2 },
      start: 'cv1',
      nodes: {
        cv1: {
          text: '¡La carreta y la madera! Escucha ese crujido, ese es el sonido del comercio de verdad. Descarguemos… Listo. El doble de monedas, como prometí: los caminos que crujen pagan mejor que las promesas.',
          options: [
            {
              text: 'Crujidos que se oyen desde lejos.',
              action: [
                { t: 'takeItem', id: 'madera', count: 2 },
                { t: 'talk', target: 'elin_caravana' },
                { t: 'flag', flag: 'caravana_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_moneda: ancient coins delivery
      cond: 'moneda_started',
      notCond: 'moneda_done',
      requireItem: { id: 'moneda_antigua', count: 3 },
      start: 'mn1',
      nodes: {
        mn1: {
          text: 'Tres monedas de Thalassar… mira el canto, todavía se lee la corona. El oro viejo cuenta historias mejor que el nuevo — y las historias son mi mercancía más cara. Precio de coleccionista, sin regatear.',
          options: [
            {
              text: 'Oro que cuenta historias.',
              action: [
                { t: 'takeItem', id: 'moneda_antigua', count: 3 },
                { t: 'talk', target: 'elin_moneda' },
                { t: 'flag', flag: 'moneda_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_comercio: rich report
      cond: 'rich_200',
      notCond: 'comercio_done',
      start: 'cm1',
      nodes: {
        cm1: {
          text: 'Doscientas monedas contigo encima… ja. Reconozco a un comerciante de verdad cuando lo veo, aunque vaya con espada. Toma lo prometido: alforjas de cuero del bueno, costuras dobles, para tu montura. Que el oro nunca te pese más que la silla.',
          options: [
            {
              text: 'Buen cuero, Elin.',
              action: [
                { t: 'item', id: 'alforjas', count: 1 },
                { t: 'talk', target: 'elin_comercio' },
                { t: 'flag', flag: 'comercio_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // Offers: mirror + coins
      cond: 'talked_aldric',
      notCond: 'espejo_started',
      start: 'ep0',
      nodes: {
        ep0: {
          text: '¿Sabes qué colecciono? Cualquier cosa que refleje historias. Dicen que en el cofre del Farallón del Faro sigue el espejo de latón de los Guardianes… Si me lo traes, te pago como a un pariente.',
          options: [
            {
              text: 'Un espejo con historia. Veré.',
              action: [
                { t: 'flag', flag: 'espejo_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      cond: 'talked_aldric',
      notCond: 'moneda_started',
      start: 'mn0',
      nodes: {
        mn0: {
          text: 'Otra cosa: la marea arrastra monedas de Thalassar — oro del reino hundido — hasta las cuevas más escondidas. Tres monedas me harían la colección del siglo. Búscalas en los cofres que nadie recuerda.',
          options: [
            {
              text: 'Las cuevas que nadie recuerda. Marchando.',
              action: [
                { t: 'flag', flag: 'moneda_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      cond: 'ship_repaired',
      notCond: 'caravana_started',
      start: 'cv0',
      nodes: {
        cv0: {
          text: 'El almacén se queda sin madera y los caminos no se andan solos. Si consiguieras una carreta — Halvard tiene una — y dos maderas de roble para mi tienda, te pago el doble. El triple, si la carreta cruje con dignidad.',
          options: [
            {
              text: 'Crujirá con muchísima dignidad.',
              action: [
                { t: 'flag', flag: 'caravana_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      cond: 'ship_repaired',
      notCond: 'comercio_started',
      start: 'cm0',
      nodes: {
        cm0: {
          text: 'Un comerciante de verdad llega a tener doscientas monedas encima — «el oro que no se cuenta no hace ruido». Reúnelas y vuelve a presumir delante: te tengo reservado algo de cuero que te va a interesar.',
          options: [
            {
              text: 'Doscientas… y a presumir.',
              action: [
                { t: 'flag', flag: 'comercio_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- JORUND — the guard ----------------
  jorund: [
    {
      // sq_fuegos: lighthouse report
      cond: 'poi_faro',
      notCond: 'fuegos_done',
      start: 'fu1',
      nodes: {
        fu1: {
          text: '¿Sigue en pie? Tres siglos de tormentas y ahí sigue, terco como un juramento. Lo apunto en el libro de guardia: «La costa ve. La costa sabe». Buen trabajo, civil — para un civil.',
          options: [
            {
              text: 'La costa ve, guardia.',
              action: [
                { t: 'talk', target: 'jorund_fuegos' },
                { t: 'flag', flag: 'fuegos_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_bounty: drakelings reward
      cond: 'drake_grotto_dead',
      notCond: 'bounty_done',
      start: 'bo1',
      nodes: {
        bo1: {
          text: '¿El círculo Y la gruta? Ambos nidos limpios… Los pastores volverán a dormir siesta y el gremio pagará sin llorar. Dos recompensas, una por nido. Te llamaré «limpiacielos», y no sé si es rango o insulto. Toma el oro.',
          options: [
            {
              text: 'Limpiacielos suena bien.',
              action: [
                { t: 'talk', target: 'jorund_bounty' },
                { t: 'flag', flag: 'bounty_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_fuegos: offer
      cond: 'talked_aldric',
      notCond: 'fuegos_started',
      start: 'fu0',
      nodes: {
        fu0: {
          text: 'Trabajo para ti, si te gustan los caminos: al este hay un Farallón con un faro en ruinas. Un reino sin faro es un reino a ciegas, decía mi capitán. Comprueba que sigue en pie y tráeme la noticia.',
          options: [
            {
              text: 'Camino largo, noticias frescas.',
              action: [
                { t: 'flag', flag: 'fuegos_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_bounty: offer
      cond: 'talked_aldric',
      notCond: 'bounty_started',
      start: 'bo0',
      nodes: {
        bo0: {
          text: 'Dragones pequeños, problemas grandes: los drakelings del círculo de vigías y de la gruta cristal tienen a los pastores pastoreando con miedo. Yo pago por cada nido limpio. Sin preguntas, con monedas.',
          options: [
            {
              text: 'Nidos limpios, monedas contadas.',
              action: [
                { t: 'flag', flag: 'bounty_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],

  // ---------------- SIGRID — the laundress ----------------
  sigrid: [
    {
      // sq_cascada: nightfall report
      cond: 'cascada_escuchada',
      notCond: 'cascada_done',
      start: 'sc1',
      nodes: {
        sc1: {
          text: '¿La oíste? ¡Sabía que no estaba loca! «Si te sientas al borde cuando cae el último sol, el agua canta con voz de gente» — eso dije, y eso pasó. Los que duermen abajo saben canciones nuevas. Gracias por escuchar por mí.',
          options: [
            {
              text: 'Canta distinto, sí.',
              action: [
                { t: 'talk', target: 'sigrid_cascada' },
                { t: 'flag', flag: 'cascada_done' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_cascada: offer
      cond: 'talked_aldric',
      notCond: 'cascada_started',
      start: 'sc0',
      nodes: {
        sc0: {
          text: 'Los del puerto me dicen loca por esto, pero escucha: la cascada canta distinto al caer la noche. Siéntate al borde del estanque cuando el último sol se ponga — y luego cuéntame qué oíste. Necesito saber que no lo soñé.',
          options: [
            {
              text: 'Escucharé por los dos.',
              action: [
                { t: 'flag', flag: 'cascada_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],
};

// ---- Halvard: brand-new NPC (the stable master) ----
const HALVARD: NPCDialogue = {
  npcId: 'halvard',
  name: 'Halvard el Herrador',
  trees: [
    {
      // q10: Tormenta, the Order's warhorse
      cond: 'corona_thalassar_counted',
      notCond: 'halvard_horse_talked',
      start: 'h1',
      nodes: {
        h1: {
          text: 'Así que la Corona ha vuelto… y tú eres el Guardián que la trajo. Entonces es hora. Ven, te presento a alguien: TORRENTE. El caballo de guerra de Eirik. Doce inviernos cuidándolo yo, esperando a que la Orden volviera a tener voz humana.',
          options: [
            { text: '¿Era de mi padre?', next: 'h2' },
            { text: 'Doce inviernos… ¿por qué no lo montaste vos?', next: 'h3' },
          ],
        },
        h2: {
          text: 'Desde que eras un crío. Eirik decía que «un Guardián a pie es un Guardián a medias». Este animal conoce los senderos de Aldmor mejor que los mapas de Aldric. Y te va a querer — ya lo hace. Los caballos de la Orden huelen la sangre de sus jinetes.',
          options: [{ text: '¿Y está listo para cabalgar?', next: 'h4' }],
        },
        h3: {
          text: '¿Y robarle el caballo al hijo de mi mejor cliente? En esta casa el honor pesa más que la silla. Además: Tormenta solo aceptaría a un Guardián. Llévalo con orgullo… y con zanahorias de vez en cuando.',
          options: [{ text: '¿Y está listo para cabalgar?', next: 'h4' }],
        },
        h4: {
          text: 'Apareado y ansioso. También te dejo la carreta del establo, para cuando el comercio llame — engánchala cuando quieras. Y si estás sin montura lejos, sílbele: los caballos de la Orden siempre acuden. Que te lleve lejos, Guardián.',
          options: [
            {
              text: 'Que nos lleve lejos, Halvard.',
              action: [
                { t: 'talk', target: 'halvard_horse' },
                { t: 'flag', flag: 'halvard_horse_talked' },
                { t: 'flag', flag: 'tormenta_gifted' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // q12: barding & saddlebags
      cond: 'bram_forge_talked',
      notCond: 'halvard_barding_talked',
      start: 'hb1',
      nodes: {
        hb1: {
          text: '¿Vas a ir a por el Cuervo? Pues Tormenta también va. Le he apareado con las alforjas de batalla — agua, grano, vendas. Un caballo de la Orden entra al combate preparado. Ni un clavo suelto, Guardián.',
          options: [
            {
              text: 'Cuidaré de él.',
              action: [
                { t: 'item', id: 'alforjas', count: 1 },
                { t: 'talk', target: 'halvard_barding' },
                { t: 'flag', flag: 'halvard_barding_talked' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_caballos: wild horses report
      cond: 'wildhorse_2_done',
      notCond: 'caballos_paid',
      start: 'hc1',
      nodes: {
        hc1: {
          text: '¡Los dos marcados! Prado norte y prado oeste… ya sabía dónde rondaban esos pillos. Silbaré y volverán solos, como buen ganado. Toma tu pago — y un consejo gratis: si algún día quieres comprar un potro propio, el alazán que pastaba con ellos es de buena casta.',
          options: [
            {
              text: 'Buen ganado y buen consejo.',
              action: [
                { t: 'talk', target: 'halvard_caballos' },
                { t: 'flag', flag: 'caballos_paid' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // sq_caballos: offer
      cond: 'talked_aldric',
      notCond: 'caballos_started',
      start: 'hc0',
      nodes: {
        hc0: {
          text: '¿Brazos libres? Bien. Se me escaparon dos potros — el alazán hacia el prado norte, cerca del sendero de la cascada, y el gris hacia el prado oeste, rumbo a las ruinas. Márcamelos cuando los veas, que yo iré con la soga y la paciencia.',
          options: [
            {
              text: 'Potro norte y potro oeste. Anotado.',
              action: [
                { t: 'flag', flag: 'caballos_started' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
    {
      // Default tree
      start: 'hd0',
      nodes: {
        hd0: {
          text: 'El establo de Halvard: caballos de verdad, historias de verdad. Si necesitas montura, hablamos. Si necesitas lumbre, la taberna de Rosa.',
          options: [
            { text: 'Hasta luego, Halvard.', action: { t: 'close' } },
          ],
        },
      },
    },
  ],
};

// ---- The final choice at the Altar of the Tides ----
const ALTAR_DECISION: NPCDialogue = {
  npcId: 'altar_decision',
  name: 'El Altar de la Marea',
  trees: [
    {
      cond: 'altar_ready',
      start: 'ad1',
      nodes: {
        ad1: {
          text: 'Las tres reliquias descansan en sus cuencas. El Sello canta bajo, la Corona pesa como una promesa, el Corazón del Cuervo late sin sombra. El altar espera tu mano — y Eldoria entero contiene el aliento. ¿Qué harás, Guardián?',
          options: [
            {
              text: 'Restaurar el pacto: la Orden custodiará las mareas para siempre.',
              next: 'ad_guardian',
            },
            {
              text: 'Alzar la Corona: unir las islas bajo un nuevo trono — el mío.',
              next: 'ad_crown',
            },
            {
              text: 'Liberar el mar: ni pactos ni coronas. Devolverlo todo a la marea.',
              next: 'ad_free',
            },
          ],
        },
        ad_guardian: {
          text: 'Colocas la mano sobre el Sello. La luz de marea recorre las reliquias, el Nido y el cielo entero: el pacto antiguo se teje de nuevo, con tu juramento como hilo. Los dragones volverán a dormir custodiados. La Orden de la Marea ha vuelto — para quedarse.',
          options: [
            {
              text: 'Por la Orden. Por Eldoria.',
              action: [
                { t: 'flag', flag: 'ending_guardian' },
                { t: 'close' },
              ],
            },
          ],
        },
        ad_crown: {
          text: 'Alzas la Corona de Thalassar sobre tu frente. El metal frío se templa de pronto, como si llevase cien años esperando esta sien. Las tres luces convergen en ti: Sello, Corazón y Corona juran lealtad a un solo nombre — el tuyo. Eldoria tiene nuevo soberano.',
          options: [
            {
              text: 'Que el mar recuerde mi nombre.',
              action: [
                { t: 'flag', flag: 'ending_crown' },
                { t: 'close' },
              ],
            },
          ],
        },
        ad_free: {
          text: 'Una a una, devuelves las reliquias a la marea: el Sello al agua, la Corona al fondo, el Corazón a la corriente. Ningún pacto, ninguna corona, ningún juramento que romper. El mar queda libre… y con él, todo lo que nada, vuela y respira en Eldoria.',
          options: [
            {
              text: 'El mar no tiene dueño.',
              action: [
                { t: 'flag', flag: 'ending_free' },
                { t: 'close' },
              ],
            },
          ],
        },
      },
    },
  ],
};

// ---- Apply: prepend trees, add new NPCs ----
for (const [npcId, trees] of Object.entries(INSERTS)) {
  const npc = DIALOGUES[npcId];
  if (npc) {
    npc.trees.unshift(...trees);
  }
}
DIALOGUES[HALVARD.npcId] = HALVARD;
DIALOGUES[ALTAR_DECISION.npcId] = ALTAR_DECISION;
