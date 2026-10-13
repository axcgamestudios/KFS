#!/usr/bin/env python3
"""Fase 17 — Game.ts Spanish → English translation sweep.
Exact-match replacements; fails loudly if an original string is missing."""

import sys

PATH = '/home/z/my-project/src/game/Game.ts'

# (old, new) — exact literal replacements inside Game.ts
REPLACEMENTS: list[tuple[str, str]] = [
    # ---- intro shots ----
    (
        "text: 'Eldoria… Tierra de reinos que fueron. Los antiguos dominaron los mares bajo el pacto de los dragones… hasta que la gran guerra lo hundió todo bajo las olas.',",
        "text: 'Eldoria… a land of kingdoms that were. The ancients ruled the seas under the pact of the dragons… until the great war sank it all beneath the waves.',",
    ),
    (
        "text: 'Los dragones duermen en las cumbres de Garrahielo. Los piratas siembran el miedo en las rutas. Y algo antiguo despierta bajo las ruinas del océano.',",
        "text: 'The dragons sleep on the Iceclaw peaks. The pirates sow fear along the trade routes. And something ancient is waking beneath the ruins of the ocean.',",
    ),
    (
        "text: 'Los reinos están divididos y los muros se agrietan. En Puerto Cuervo, un maestre de puerto guarda la última voluntad de un amigo desaparecido…',",
        "text: 'The kingdoms are divided and the walls are cracking. In Crowhaven, a port master keeps the last will of a vanished friend…',",
    ),
    (
        "text: '…y la marea trae a alguien de vuelta a casa. El hijo del Guardián ha regresado. KINGDOMS OF THE FORGOTTEN SEAS — Capítulo I: El Legado de Eirik.',",
        "text: '…and the tide carries someone back home. The Warden\\'s son has returned. KINGDOMS OF THE FORGOTTEN SEAS — Chapter 1: A Brand New Beginning.',",
    ),
    # ---- kill streak names ----
    (
        "const names = ['', '', '¡DOBLE!', '¡TRIPLE!', '¡MATANZA!', '¡IMPARABLE!', '¡LEYENDA!'];",
        "const names = ['', '', 'DOUBLE!', 'TRIPLE!', 'SLAUGHTER!', 'UNSTOPPABLE!', 'LEGENDARY!'];",
    ),
    # ---- misc notifications ----
    (
        "useGameStore.getState().notify('info', 'Contexto gráfico perdido', 'Recarga la página para continuar.');",
        "useGameStore.getState().notify('info', 'Graphics context lost', 'Reload the page to continue.');",
    ),
    (
        "useGameStore.getState().notify('info', `Has perdido ${amount} de salud`, 'La caída fue dura.');",
        "useGameStore.getState().notify('info', `You lost ${amount} health`, 'That was a hard fall.');",
    ),
    (
        "this.mounts.spawnHorse('alazan', 'Alazán del Prado', 'chestnut', -50, -100, false, 220);",
        "this.mounts.spawnHorse('alazan', 'Meadow Chestnut', 'chestnut', -50, -100, false, 220);",
    ),
    (
        "onBanditKilled: (captain) => this.registerCombatKill(captain ? '¡CAPITÁN ABATIDO!' : ''),",
        "onBanditKilled: (captain) => this.registerCombatKill(captain ? 'CAPTAIN DOWN!' : ''),",
    ),
    (
        "useGameStore.getState().notify('item', '¡ESPADA LEGENDARIA!', 'El acero nuevo salta a tu mano. Úsala con la tecla 1.');",
        "useGameStore.getState().notify('item', 'LEGENDARY SWORD!', 'The new steel leaps to your hand. Wield it with key 1.');",
    ),
    (
        "this.combat?.flashEvent('¡EMBOSCADA!');",
        "this.combat?.flashEvent('AMBUSH!');",
    ),
    (
        "useGameStore.getState().notify('quest', '¡EMBOSCADA!', '¡Caballeros rojos del Cuervo saltan de la maleza!');",
        "useGameStore.getState().notify('quest', 'AMBUSH!', 'Red knights of the Crow burst from the underbrush!');",
    ),
    # ---- sea chest lore ----
    (
        "'Un cofre de mar reforzado con bandas de hierro. El cierre es extraño: un círculo de mareas alrededor de una llama, fundido en cobre.',",
        "'A sea chest reinforced with iron bands. The clasp is strange: a circle of tides around a flame, cast in copper.',",
    ),
    (
        "'No hay cerradura ni bisagra visible. «Solo el amuleto lo abre», diría Aldric. Maren, la herborista, sabe dónde está.',",
        "'There is no visible lock or hinge. \\\"Only the amulet opens it,\\\" Aldric would say. Maren the herbalist knows where it is.',",
    ),
    (
        "store.getState().notify('quest', 'El cofre de Eirik se abre', 'Espada de Eirik, Mapa antiguo y Carta de Eirik añadidos al inventario.');",
        "store.getState().notify('quest', \\\"Eirik's chest opens\\\", \\\"Eirik's Sword, the Ancient Map and Eirik's Letter added to your inventory.\\\");",
    ),
    (
        "store.getState().notify('info', 'Lee la carta de tu padre', 'Ábrela desde el inventario (Tab).');",
        "store.getState().notify('info', \\\"Read your father's letter\\\", 'Open it from the inventory (TAB).');",
    ),
    (
        "store.getState().notify('item', 'Tesoro encontrado', '18 monedas de oro y una poción de curación.');",
        "store.getState().notify('item', 'Treasure found', '18 gold coins and a healing potion.');",
    ),
    (
        "store.getState().notify('item', 'Tesoro encontrado', '20 monedas de oro y un pétalo de marfil.');",
        "store.getState().notify('item', 'Treasure found', '20 gold coins and an ivory petal.');",
    ),
    (
        "store.getState().notify('item', 'El botín del Cuervo', 'Botín del Cuervo y 60 monedas de oro, arrancados a la guarida pirata.');",
        "store.getState().notify('item', \\\"The Crow's loot\\\", \\\"The Crow's Loot and 60 gold coins, torn from the pirate den.\\\");",
    ),
    (
        "store.getState().notify('item', 'El espejo del faro', 'El viejo espejo de latón de los Guardianes y 30 monedas.');",
        "store.getState().notify('item', 'The lighthouse mirror', \\\"The Wardens' old brass mirror and 30 coins.\\\");",
    ),
    (
        "store.getState().notify('item', 'Algo late en el cofre', 'Una escama que duerme, dos pétalos de marfil y 35 monedas. Léela desde el inventario (Tab).');",
        "store.getState().notify('item', 'Something stirs in the chest', 'A sleeping scale, two ivory petals and 35 coins. Read it from the inventory (TAB).');",
    ),
    (
        "store.getState().notify('item', 'El arsenal del vigía', 'Lanza de Caza, 6 flechas y 15 monedas. Equípala con la tecla 3.');",
        "store.getState().notify('item', \\\"The watchman's arsenal\\\", 'Hunting Spear, 6 arrows and 15 coins. Equip it with key 3.');",
    ),
    (
        "store.getState().notify('item', 'El arco varado por la marea', 'Arco del Naufragio y 12 flechas. Equípalo con la tecla 4: mantén el clic para tensar.');",
        "store.getState().notify('item', 'The tide-stranded bow', 'Wreck Bow and 12 arrows. Equip it with key 4: hold the click to draw.');",
    ),
    (
        "store.getState().notify('item', 'El mapa del Capitán', 'Dibujado con carbón y sangre de pulpo. Una X marca la ensenada del faro. Léelo desde el inventario (Tab).');",
        "store.getState().notify('item', \\\"The Captain's map\\\", 'Drawn in charcoal and octopus blood. An X marks the lighthouse cove. Read it from the inventory (TAB).');",
    ),
    # ---- bounty ----
    (
        "return k >= 10 ? 'Cobrar la recompensa (90 oro)' : `La caza continúa (${k}/10)`;",
        "return k >= 10 ? 'Claim the bounty (90 gold)' : `The hunt continues (${k}/10)`;",
    ),
    (
        "useGameStore.getState().notify('quest', '¡NUEVA CAZA!', 'La Caza del Cuervo: 6 caballeros rojos. 150 monedas de oro al terminar.');",
        "useGameStore.getState().notify('quest', 'NEW HUNT!', 'The Crow Hunt: 6 red knights. 150 gold coins on completion.');",
    ),
    (
        "store.getState().notify('item', 'El Camino Real respira', '90 monedas más. Los carros vuelven a subir al castillo.');",
        "store.getState().notify('item', \\\"The King's Road breathes\\\", '90 more coins. The carts climb to the castle again.');",
    ),
    # ---- petals / cargo / oak ----
    (
        "prompt: 'Recoger pétalo de marfil',",
        "prompt: 'Pick up the ivory petal',",
    ),
    (
        "mult > 1 ? 'Pétalos de marfil ×2' : 'Pétalo de marfil recogido',",
        "mult > 1 ? 'Ivory petals ×2' : 'Ivory petal picked',",
    ),
    (
        "store.getState().notify('item', 'Cargamento de Rosa', 'La caja lleva el sello del Ancla Rota. Rosa pagará bien por esto.');",
        "store.getState().notify('item', \\\"Rosa's cargo\\\", 'The crate bears the Broken Anchor\\'s seal. Rosa will pay well for this.');",
    ),
    (
        "store.getState().notify('item', 'Madera de roble ×2', 'Roble curado con el sello de Bram. Perfecto para el casco del Colibrí.');",
        "store.getState().notify('item', 'Oak planks ×2', 'Oak cured under Bram\\'s seal. Perfect for the Sea Hummingbird\\'s hull.');",
    ),
    (
        "? 'Entregar los materiales para la reparación'\n          : 'Examinar el Colibrí de Mar';",
        "? 'Deliver the repair materials'\n          : 'Inspect the Sea Hummingbird';",
    ),
    (
        "this.dialogue.startLore('El Colibrí de Mar', [",
        "this.dialogue.startLore('The Sea Hummingbird', [",
    ),
    (
        "'El casco aguarda entre andamios. Bram revisa la lista garabateada en carbón sobre la cubierta.',",
        "'The hull waits among the scaffolds. Bram checks the list scribbled in charcoal on the deck.',",
    ),
    (
        "`«Todavía falta: ${missing.join(', ')}. El roble está en cajas con mi sello — muelle, costa del naufragio y sendero de la cascada. La lona la prepara Rosa y la cuerda la tiene Tom.»`,",
        "`\\\"Still missing: ${missing.join(', ')}. The oak sits in crates under my seal — the dock, the wreck coast and the waterfall path. Rosa readies the canvas and Tom holds the rope.\\\"`,",
    ),
    (
        "addLore('ship_colibri', w.village.shipDeck.x, w.village.shipDeck.z, 'Contemplar el Colibrí de Mar');",
        "addLore('ship_colibri', w.village.shipDeck.x, w.village.shipDeck.z, 'Gaze at the Sea Hummingbird');",
    ),
    # ---- crown / relics ----
    (
        "store.getState().notify('item', 'La Corona de Thalassar', 'Los reyes hundidos sueltan su corona. El agua la entrega… como si llevara cien años esperándote.');",
        "store.getState().notify('item', 'The Crown of Thalassar', 'The sunken kings let go of their crown. The water hands it over… as if it had been waiting a hundred years for you.');",
    ),
    (
        "store.getState().notify('info', 'Un lugar en la mesa', 'La Orden custodiaba tres reliquias. Con el Sello y el Corazón ya en tu poder, Halvard espera en el establo del camino norte.');",
        "store.getState().notify('info', 'A seat at the table', 'The Order kept three relics. With the Seal and the Heart already yours, Halvard waits at the stable on the north road.');",
    ),
    (
        "store.getState().notify('item', 'La carta del Cuervo', 'Carta de Navegación del Cuervo y el Estandarte robado de la Orden, arrancados al buque insignia. La cala sin nombre aparece al pie de la fortaleza.');",
        "store.getState().notify('item', \\\"The Crow's chart\\\", 'The Crow\\'s Navigation Chart and the stolen Banner of the Order, torn from the flagship. The nameless cove lies at the foot of the fortress.');",
    ),
    (
        "if (ready) return 'Forjar la Espada del Guardián';",
        "if (ready) return 'Forge the Warden\\'s Sword';",
    ),
    (
        "store.getState().notify('item', '¡La Espada del Guardián!', 'Forjada con el Colmillo del Ancestro. Equípala desde el inventario (Tab): daño terrible, juramento incluido.');",
        "store.getState().notify('item', \\\"The Warden's Sword!\\\", 'Forged from the Ancestor\\'s Fang. Equip it from the inventory (TAB): terrible damage, oath included.');",
    ),
    (
        "? 'Bram templa el acero al rojo: +30% de daño y un filo que canta.'",
        "? 'Bram tempers the red-hot steel: +30% damage and an edge that sings.'",
    ),
    (
        ": 'Runas de marea grabadas a fuego: +70% de daño y un brillo azul en la hoja.',",
        ": 'Tide runes fire-etched into the blade: +70% damage and a blue gleam on the steel.',",
    ),
    (
        "'Bram limpia sus manos en el mandil: «El acero de esta vieja fragua ha visto caer reyes. Tráeme oro — y escamas, si quieres runas — y templaré esa espada tuya hasta que cante».',",
        "'Bram wipes his hands on the apron: \\\"The steel of this old forge has watched kings fall. Bring me gold — and scales, if you want runes — and I will temper that sword of yours until it sings.\\\"',",
    ),
    (
        "'El fuego de la fragua late como un corazón impaciente.',",
        "'The forge fire pulses like an impatient heart.',",
    ),
    (
        "'Colocas el Sello, la Corona y el Corazón en las tres cuencas. La piedra está más fría que el mar.',",
        "'You set the Seal, the Crown and the Heart in the three hollows. The stone is colder than the sea.',",
    ),
    (
        "return ready ? 'Presentar las tres reliquias ante el altar' : 'Altar del pacto (requiere Sello, Corona y Corazón)';",
        "return ready ? 'Present the three relics to the altar' : 'Altar of the pact (requires Seal, Crown and Heart)';",
    ),
    (
        "'Tres cuencas aguardan: el Sello de la Orden, la Corona de los reyes hundidos y el Corazón del Cuervo.',",
        "'Three hollows wait: the Seal of the Order, the Crown of the sunken kings and the Heart of the Crow.',",
    ),
    (
        "'Solo un Guardián con las tres reliquias puede convocar al Consejo de las Mareas.',",
        "'Only a Warden carrying the three relics can summon the Council of the Tides.',",
    ),
    (
        "'Las tres reliquias resuenan entre sí — Sello, Corona y Corazón — y el altar reconoce a su Guardián.',",
        "'The three relics resonate with one another — Seal, Crown and Heart — and the altar knows its Warden.',",
    ),
    (
        "'Toca el altar de nuevo para tomar tu decisión.',",
        "'Touch the altar again to make your choice.',",
    ),
    # ---- treasure / maple / colts / waterfall ----
    (
        "return state.hasItem('mapa_tesoro') ? 'Excavar donde marca la X' : 'Un extraño cruce de tablones en la arena';",
        "return state.hasItem('mapa_tesoro') ? 'Dig where the X marks' : 'A strange crossing of planks in the sand';",
    ),
    (
        "'Dos tablones cruzados clavados en la roca. Algo está enterrado aquí… pero necesitarías un mapa para saber qué — y valor para cavarlo.',",
        "'Two planks nailed crosswise into the rock. Something is buried here… but you would need a map to know what — and the nerve to dig it.',",
    ),
    (
        "store.getState().notify('item', '¡El cofre de Eirik!', '200 monedas, dos monedas de Thalassar y flechas del buen sauz. «Que lo encuentre mi sangre», decía el mapa. Lo encontró.');",
        "store.getState().notify('item', \\\"Eirik's cache!\\\", '200 coins, two Thalassar coins and good willow-wood arrows. \\\"May my own blood find it,\\\" the map said. It did.');",
    ),
    (
        "store.getState().notify('item', 'Semilla del Gran Arce', 'Una sámara dorada, cálida como un recién nacido. Maren sabe dónde plantarla.');",
        "store.getState().notify('item', 'Seed of the Great Maple', 'A golden samara, warm as a newborn. Maren knows where to plant it.');",
    ),
    (
        "return state.hasFlag(flag) ? '' : `Marcar la posición del ${wild.id === 'potro_norte' ? 'potro alazán' : 'potro gris'}`;",
        "return state.hasFlag(flag) ? '' : `Mark the position of the ${wild.id === 'potro_norte' ? 'chestnut colt' : 'grey colt'}`;",
    ),
    (
        "store.getState().notify('info', 'Potro marcado', 'Halvard podrá venir a por él con la soga y la paciencia.');",
        "store.getState().notify('info', 'Colt marked', 'Halvard can come for him with rope and patience.');",
    ),
    (
        "this.dialogue.startLore('El agua canta… de día', [",
        "this.dialogue.startLore('The water sings… by day', [",
    ),
    (
        "'La cascada rumorea con voz de todos los días. Sigrid insists: hay que escucharla al caer el último sol.',",
        "'The waterfall murmurs in its everyday voice. Sigrid insists: it must be heard as the last sun falls.',",
    ),
    (
        "this.dialogue.startLore('La canción de la cascada', [",
        "this.dialogue.startLore('The song of the waterfall', [",
    ),
    (
        "'Te sientas al borde del estanque cuando el último sol se apaga.',",
        "'You sit at the pond\\'s edge as the last light dies.',",
    ),
    (
        "'El agua cambia. No es rumor: es armonía. Voces graves, viejas, que suben y bajan con la corriente como si recordaran nombres.',",
        "'The water changes. It is not a murmur: it is harmony. Deep, old voices rising and falling with the current as if remembering names.',",
    ),
    (
        "'Los que duermen abajo saben canciones nuevas. Ahora lo sabes tú también.',",
        "'Those who sleep below know new songs. Now you know it too.',",
    ),
    (
        "'Juntas podridas, telarañas y una placa oxidada. Jorund hablaba de un escondite «que solo la noche y el fuego encuentran».',",
        "'Rotten joints, cobwebs and an oxidised plate. Jorund spoke of a stash \\\"that only night and fire find\\\".',",
    ),
    (
        "night ? 'Quizá con el farol encendido (F)…' : 'Quizá de noche, con luz propia…',",
        "night ? 'Perhaps with the lantern lit (L)…' : 'Perhaps at night, with a light of your own…',",
    ),
    (
        "store.getState().notify('item', 'El escondite del vigía', 'La luz del farol revela una piedra movida: oro contado, flechas secas y un diario casi ilegible.');",
        "store.getState().notify('item', \\\"The watchman's stash\\\", 'The lantern light reveals a shifted stone: counted gold, dry arrows and a diary barely legible.');",
    ),
    (
        "'Un guardián sin dragón y un dragón sin guardián, ambos sin casa.',",
        "'A warden without a dragon and a dragon without a warden, both without a home.',",
    ),
    (
        "'Aldric entenderá lo que oíste — o lo que no oíste.',",
        "'Aldric will understand what you heard — or what you did not.',",
    ),
    (
        "'Un Guardián de la Orden tallado en piedra, la espada baja y la mirada al mar. Trescientos años de vigilancia ni siquiera han arañado su gesto.',",
        "'A Warden of the Order carved in stone, sword lowered and eyes on the sea. Three hundred years of vigil have not even scratched his expression.',",
    ),
    (
        "'En el pedestal, medio borrada, una inscripción: «Velarán por nosotros cuando nosotros ya no podamos».',",
        "'On the pedestal, half effaced, an inscription: \\\"They will watch over us when we no longer can.\\\"',",
    ),
    (
        "'Algo te dice que la estatua no está mirando al mar. Está mirando lo que duerme detrás de él.',",
        "'Something tells you the statue is not looking at the sea. It is looking at what sleeps behind it.',",
    ),
    # ---- helm / refit ----
    (
        "`Al timón del ${target.name}`,",
        "`At the helm of ${target.name}`,",
    ),
    (
        "'W/S velas · A/D timón · Espacio fondear · Clic izq./der. bordadas · E desembarcar o abordar',",
        "'W/S sails · A/D rudder · SPACE anchor · LMB/RMB broadsides · E disembark or board',",
    ),
    (
        "useGameStore.getState().notify('info', `Al timón del ${target.name}`, 'W/S velas · A/D timón · Espacio fondear · E bordadas.');",
        "useGameStore.getState().notify('info', `At the helm of ${target.name}`, 'W/S sails · A/D rudder · SPACE anchor · E broadsides.');",
    ),
    (
        "'¡El Colibrí de Mar flota de nuevo!',",
        "'The Sea Hummingbird floats again!',",
    ),
    (
        "'La carena está lista. Acércate al costado del barco, junto al muelle, para zarpar. Las habilidades de navegación (K) se han desbloqueado.',",
        "'The hull is ready. Walk to the ship\\'s side by the dock to set sail. Navigation skills (K) have been unlocked.',",
    ),
    # ---- new game / saves ----
    (
        "store.notify('quest', 'Nueva misión: El Legado de Eirik', 'Habla con el Maestre Aldric en el puerto.');",
        "store.notify('quest', 'New quest: The Legacy of Eirik', 'Talk to Master Aldric at the port.');",
    ),
    (
        "store.notify('info', 'Controles', 'WASD moverse · Mayús correr · Espacio saltar · E interactuar · Tab inventario · M mapa · J diario');",
        "store.notify('info', 'Controls', 'WASD move · SHIFT sprint · SPACE jump · E interact · TAB inventory · M map · J journal');",
    ),
    (
        "store.notify('info', 'Combate', 'Clic atacar (mantén = pesado) · Clic der. bloquear · C esquivar · 1-4 cambiar de arma');",
        "store.notify('info', 'Combat', 'Click: 4-hit combos · hold: air launch · Q parry/block · C dodge · F hook dash · E rope dart · V finisher · 1-4 weapons');",
    ),
    (
        "useGameStore.getState().notify('save', 'Partida guardada', `Ranura ${slot + 1} · Día ${this.world!.sky.dayCount}`);",
        "useGameStore.getState().notify('save', 'Game saved', `Slot ${slot + 1} · Day ${this.world!.sky.dayCount}`);",
    ),
    (
        "store.notify('save', 'Partida cargada', `Día ${data.time.dayCount} · Nivel ${data.gameState.level}`);",
        "store.notify('save', 'Game loaded', `Day ${data.time.dayCount} · Level ${data.gameState.level}`);",
    ),
    (
        "store.notify('info', `Día ${w.sky.dayCount} en Aldmor`, formatClock(w.sky.dayFraction));",
        "store.notify('info', `Day ${w.sky.dayCount} in Aldmor`, formatClock(w.sky.dayFraction));",
    ),
    (
        "useGameStore.getState().notify('info', 'Tormenta sobre Aldmor', 'El cielo se cierra. Refúgiate o atraviésala: los marineros de verdad navegan igual.');",
        "useGameStore.getState().notify('info', 'Storm over Aldmor', 'The sky is closing. Shelter or sail through it: true sailors sail all the same.');",
    ),
    (
        "store.notify('quest', 'Tormenta es tuyo', 'El caballo de guerra de Eirik acepta tu montura. Acércate y pulsa E para cabalgar; H para llamarlo.');",
        "store.notify('quest', 'Tormenta is yours', \\\"Eirik's warhorse accepts your saddle. Walk up and press E to ride; H to whistle him over.\\\");",
    ),
    # ---- dragon riding prompts ----
    (
        "prompt: dRidden.tooHighToDismount ? 'Desciende con MAYÚS para desmontar' : 'Desmontar del dragón',",
        "prompt: dRidden.tooHighToDismount ? 'Descend with SHIFT to dismount' : 'Dismount the dragon',",
    ),
    (
        "store.notify('info', 'Demasiado alto para saltar', 'Desciende con MAYÚS y aterriza antes de desmontar.');",
        "store.notify('info', 'Too high to jump', 'Descend with SHIFT and land before dismounting.');",
    ),
    # ---- NPC talk prompt ----
    (
        "prompt: `Hablar con ${npc.name}`,",
        "prompt: `Talk to ${npc.name}`,",
    ),
    # ---- item tutorials ----
    (
        "useGameStore.getState().notify('item', 'Poción de curación', 'Salud restaurada.');",
        "useGameStore.getState().notify('item', 'Healing potion', 'Health restored.');",
    ),
    (
        "useGameStore.getState().notify('item', ITEMS[id].name, 'Armadura equipada: más salud máxima y menos daño recibido.');",
        "useGameStore.getState().notify('item', ITEMS[id].name, 'Armor equipped: more max health and less damage taken.');",
    ),
    (
        "'Alas equipadas. Salta desde lo alto y mantén ESPACIO en el aire para planear.',",
        "'Wings equipped. Jump from a height and hold SPACE in the air to glide.',",
    ),
    (
        "? 'Mantén pulsado el clic para tensar; suelta para disparar. Las flechas clavadas se recuperan.'",
        "? 'Hold the click to draw; release to fire. Stuck arrows can be recovered.'",
    ),
    (
        "? 'Clic para estocadas rápidas de largo alcance; mantén pulsado para un golpe pesado.'",
        "? 'Click for long-reaching quick thrusts; hold for a heavy blow.'",
    ),
    (
        ": 'Clic para atacar; mantén pulsado para un golpe pesado que tambalea a las bestias.'",
        ": 'Click to attack; hold for a heavy blow that staggers beasts.'",
    ),
    (
        "if (item?.armor) statsBits.push(`+${item.armor.hp} salud · −${Math.round(item.armor.reduce * 100)}% daño`);",
        "if (item?.armor) statsBits.push(`+${item.armor.hp} health · −${Math.round(item.armor.reduce * 100)}% damage`);",
    ),
    (
        "if (w) statsBits.push(`${w.lightDmg}/${w.heavyDmg} daño ligero/pesado`);",
        "if (w) statsBits.push(`${w.lightDmg}/${w.heavyDmg} light/heavy damage`);",
    ),
    (
        "`${def.name}: «Trato limpio.» Quedan ${s.countItem('coin')} monedas.`,",
        "`${def.name}: \\\"Fair deal.\\\" You have ${s.countItem('coin')} coins left.`,",
    ),
    # ---- admin panel feedback ----
    (
        "return `${name} (${coat}) apareció frente a ti`;",
        "return `${name} (${coat}) appeared before you`;",
    ),
    (
        "return d ? `${d.def.name.replace(' (invocado)', '')} apareció — dócil y montable (E)` : null;",
        "return d ? `${d.def.name.replace(' (summoned)', '')} appeared — docile and rideable (E)` : null;",
    ),
    (
        "useGameStore.getState().notify('info', 'Modo vuelo ACTIVADO', 'ESPACIO sube · E baja · MAYÚS acelera');",
        "useGameStore.getState().notify('info', 'Flight mode ON', 'SPACE up · E down · SHIFT faster');",
    ),
    # ---- victory cinematics ----
    (
        "title: firstEver ? 'PRIMER DRAGÓN ABATIDO' : undefined,",
        "title: firstEver ? 'FIRST DRAGON FELLED' : undefined,",
    ),
    (
        "subtitle: firstEver ? 'las canciones aún no se atreven a contarlo' : undefined,",
        "subtitle: firstEver ? 'the songs do not yet dare tell it' : undefined,",
    ),
    (
        "title: `${d.def.name.toUpperCase()} HA CAÍDO`,",
        "title: `${d.def.name.toUpperCase()} HAS FALLEN`,",
    ),
    (
        "subtitle: 'las canciones aún no se atreven a contarlo',",
        "subtitle: 'the songs do not yet dare tell it',",
    ),
    # ---- admin cinematic labels ----
    (
        "{ key: 'intro', label: 'Introducción — El Legado de Eirik' },",
        "{ key: 'intro', label: 'Intro — The Legacy of Eirik' },",
    ),
    (
        "{ key: 'cap1', label: 'Hito · Capítulo I completo' },",
        "{ key: 'cap1', label: 'Milestone · Chapter I complete' },",
    ),
    (
        "{ key: 'cap2', label: 'Hito · Capítulo II completo' },",
        "{ key: 'cap2', label: 'Milestone · Chapter II complete' },",
    ),
    (
        "{ key: 'cap3', label: 'Hito · Capítulo III completo' },",
        "{ key: 'cap3', label: 'Milestone · Chapter III complete' },",
    ),
    (
        "{ key: 'cap4', label: 'Hito · Capítulo IV completo' },",
        "{ key: 'cap4', label: 'Milestone · Chapter IV complete' },",
    ),
    (
        "{ key: 'victoria', label: 'Victoria de dragón (genérica)' },",
        "{ key: 'victoria', label: 'Dragon victory (generic)' },",
    ),
    (
        "{ key: 'final_guardian', label: 'FINAL I — El Guardián de la Marea' },",
        "{ key: 'final_guardian', label: 'FINAL I — The Warden of the Tide' },",
    ),
    (
        "{ key: 'final_free', label: 'FINAL III — El Mar sin Dueño' },",
        "{ key: 'final_free', label: 'FINAL III — The Sea Without a Master' },",
    ),
    # ---- chapter milestone cards ----
    (
        "cap1: { n: 1, title: 'CAPÍTULO I COMPLETO', sub: 'el legado de Eirik' },",
        "cap1: { n: 1, title: 'CHAPTER I COMPLETE', sub: 'the legacy of Eirik' },",
    ),
    (
        "cap2: { n: 2, title: 'CAPÍTULO II COMPLETO', sub: 'los mares olvidados' },",
        "cap2: { n: 2, title: 'CHAPTER II COMPLETE', sub: 'the forgotten seas' },",
    ),
    (
        "cap3: { n: 3, title: 'CAPÍTULO III COMPLETO', sub: 'el rumor de las alas' },",
        "cap3: { n: 3, title: 'CHAPTER III COMPLETE', sub: 'the whisper of wings' },",
    ),
    (
        "cap4: { n: 4, title: 'CAPÍTULO IV COMPLETO', sub: 'la corona hundida' },",
        "cap4: { n: 4, title: 'CHAPTER IV COMPLETE', sub: 'the sunken crown' },",
    ),
    (
        "store.notify('quest', 'Misión completada', 'Consulta tu diario (J) para saber más.');",
        "store.notify('quest', 'Quest completed', 'Check your journal (J) to learn more.');",
    ),
    (
        "q3_chest: { n: 1, title: 'CAPÍTULO I COMPLETO', sub: 'el legado de Eirik' },",
        "q3_chest: { n: 1, title: 'CHAPTER I COMPLETE', sub: 'the legacy of Eirik' },",
    ),
    (
        "q5_raven: { n: 2, title: 'CAPÍTULO II COMPLETO', sub: 'los mares olvidados' },",
        "q5_raven: { n: 2, title: 'CHAPTER II COMPLETE', sub: 'the forgotten seas' },",
    ),
    (
        "q9_ancestro: { n: 3, title: 'CAPÍTULO III COMPLETO', sub: 'el rumor de las alas' },",
        "q9_ancestro: { n: 3, title: 'CHAPTER III COMPLETE', sub: 'the whisper of wings' },",
    ),
    (
        "q12_acero: { n: 4, title: 'CAPÍTULO IV COMPLETO', sub: 'la corona hundida' },",
        "q12_acero: { n: 4, title: 'CHAPTER IV COMPLETE', sub: 'the sunken crown' },",
    ),
    (
        "useGameStore.getState().notify('info', 'Contexto gráfico perdido', 'Recarga la página para continuar.')",
        "useGameStore.getState().notify('info', 'Graphics context lost', 'Reload the page to continue.')",
    ),
]


def main() -> int:
    with open(PATH, 'r', encoding='utf-8') as f:
        src = f.read()
    missing = []
    for old, new in REPLACEMENTS:
        if old not in src:
            missing.append(old.splitlines()[0][:110])
            continue
        src = src.replace(old, new)
    with open(PATH, 'w', encoding='utf-8') as f:
        f.write(src)
    if missing:
        print(f"MISSING {len(missing)} originals:")
        for m in missing:
            print('  -', m)
        return 1
    print(f"All {len(REPLACEMENTS)} replacements applied cleanly.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
