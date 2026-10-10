# Worklog — Kingdoms of the Forgotten Seas

---
Task ID: 1
Agent: Super Z (main agent)
Task: Fase 1 — El mundo y la exploración: videojuego 3D medieval de mundo abierto para navegador (Next.js + Three.js). Terreno 3D, bosques, castillo, personaje, cámara, movimiento, iluminación y primera misión.

Work Log:
- Inicializado entorno fullstack (Next.js 16 + TS + Tailwind 4). Instalado three@0.170.0.
- Analizada imagen de referencia del usuario (tonos naturales verde-gris, paisaje medieval).
- Núcleo del motor: `src/game/core/` — Engine (renderer ACES, sombras, presets de calidad), Input (teclado+ratón+pointer lock+botones), Noise (simplex con semilla), MathUtils.
- Mundo: `src/game/world/` — WorldConfig (isla Aldmor 2048×2048, 9 POIs, caminos), TerrainHeight (función analítica: costa orgánica, bahía, montañas Garrahielo nevadas, meseta del castillo, aldea aplanada, cuenca de cascada; biomas por color de vértice), TerrainSystem (streaming de chunks 64m con presupuesto de 2/frame), WaterSystem (shader Gerstner + espuma costera vía heightmap horneada + reflejo cielo), SkySystem (ciclo día/noche 10min, sol/luna/cielo degradado/estrellas/nubes, niebla y luces), VegetationSystem (3 especies de árbol + rocas + hierba instanciados con viento en shader).
- Estructuras: `src/game/structures/` — Materials (librería de materiales PBR-coherentes + StaticBuilder con merge por material y colisiones), Buildings (casas de entramado con voladillo, taberna, herrería con forja encendida, almacén, muelle transitable, carabela Colibrí de Mar con aparejo y andamios de reparación), Castle (murallas almenadas, 4 torres, arco de puerta transitable, torreón, gran salón, patio con maniquí de entrenamiento), Village (Puerto Cuervo: plaza, pozo, 4 puestos, 11 edificios, antorchas, carteles), POIs (ruinas de Vaelthara, círculo de piedras con runas, torre vigía, naufragio, gruta con cristales, cascada con lámina de agua animada), Props (cofres animados, pétalos de marfil brillantes, sistema de antorchas con pool de luces parpadeantes).
- Entidades: `src/game/entities/` — CharacterModel (humanoide procedural articulado: respiración, caminar, correr, saltar, nadar, ataque con espada, capa), Player (física: gravedad, salto, plataformas transitables como suelo, natación, colisiones push-out cilindro/caja, estamina, daño por caída, pasos por superficie, farol), CameraRig (orbital tercera persona con brazo de resorte contra terreno/props, FOV al esprintar), NPC (rutinas diarias trabajo/tarde/casa con steering y colisiones), WildlifeSystem (gaviotas planeando la bahía).
- Sistemas: `src/game/systems/` — ColliderRegistry (hash espacial), GameState (flags, inventario, misiones con evaluación robusta fuera de orden, XP/niveles, 10 habilidades con efectos reales, diario, niebla de guerra del mapa), DialogueSystem (árboles de diálogo por condiciones + lore narrativo), AudioSystem (100% procedural WebAudio: viento por altitud, olas por costa, pájaros día, grillos noche, pasos por superficie, música adaptativa dorian con eco, SFX de eventos), SaveSystem (3 ranuras + autoguardado + ajustes).
- Datos en español: items, misiones (cadena principal de 3 + secundaria de Rosa), 7 NPCs con diálogos ramificados con decisiones y lore (Orden de la Marea, dragones, el cuervo de tres cabezas), lore de 4 tablillas.
- UI React medieval: GameRoot, LoadingScreen (progreso real + consejos), MainMenu (fondo 3D orbital a la hora dorada), IntroCinematic (4 planos con narración typewriter + letterbox + salto), HUD (barras, brújula, reloj, tracker de misión, prompt, notificaciones, banner de descubrimiento), DialogueBox, InventoryUI, MapUI (canvas con niebla de guerra), JournalUI (3 pestañas), SkillsUI (3 árboles), PauseMenu (guardar/cargar/ajustes/salir), SettingsPanel (calidad, volúmenes, sensibilidad — aplicados en vivo).
- Game.ts: orquestador (fases boot/menú/intro/juego/pausa, cinemática de cámara, descubrimientos orgánicos con XP, exploración del mapa, autoguardado, tutoriales contextuales, api para la UI).

Bugs encontrados y corregidos durante la verificación con navegador:
1. mergeGeometries fallaba al mezclar geometrías indexadas/no-indexadas (Extrude/Icosahedron) → normalizadas con toNonIndexed() en StaticBuilder y transformGeo.
2. Carrera Tab/UI: la tecla de alternancia se procesaba por la UI y el juego a la vez re-abriendo overlays → centralizado el toggle en el bucle del juego.
3. Misiones fuera de orden (Maren antes que Aldric) dejaba el objetivo de recolección atascado → flag `collected_<item>` al entregar objetos.
4. Escape cerraba diálogo y a la vez pausaba → orden de listeners garantizado por registro.
5. Pointer lock headless inestable re-pausaba tras reanudar → debounce de 1.2s en auto-pausa.
6. window.confirm bloqueaba "Salir al menú" → reemplazado por confirmación de doble clic.
7. NPC Tom y cofre de Eirik reposicionados (Tom caminaba sobre el agua; cofre accesible junto al almacén, no dentro).
8. Casas/almacén con puertas orientadas correctamente a la calle (orden Euler 'YXZ' en StaticBuilder).

Stage Summary:
- E2E verificado con navegador real (28 comprobaciones): menú → nueva partida → intro saltable → movimiento WASD → cadena completa de misiones (Q1→Q2→Q3, CAPÍTULO I COMPLETO) → cofre con amuleto → carta legible → nivel 3 → guardado/carga con restauración total → mapa/diario/habilidades → aprender habilidad con efecto real (+20 resistencia) → volver al menú → Continuar restaura partida. Consola sin errores; dev.log limpio; lint y tsc sin errores.
- Entregable: aplicación web jugable en la ruta `/` (Next.js dev server puerto 3000). Capturas de verificación en `download/capturas/`.
- Fase 2 pendiente (según plan del usuario): navegación con viento/combate naval, dragones, combate ampliado, bestiario, ramificaciones y finales múltiples. La historia ya lo prepara (Colibrí de Mar bajo reparación, Capítulo II anunciado).

---
Task ID: 2
Agent: Super Z (main agent)
Task: Fase 2 — El océano y los piratas: barco controlable, olas, islas, puertos, navegación, cañones y abordajes. Correcciones: controles A/D invertidos, carga por chunks a lo lejos, menú/pantalla de carga épica, NPCs estáticos, paredes invisibles del castillo, ajustes gráficos sin efecto.

Work Log:
Correcciones de errores (6):
- A/D invertidos: el vector "derecha" de Player.update estaba negado respecto a la convención de cámara (forward=(sin,cos)); corregido a right=(-cos,sin). Verificado E2E (D → -X con cámara a +Z).
- Paredes invisibles del castillo: buildWall pasaba la longitud como ancho (eje X local) con rot=atan2(dx,dz) que orienta el eje Z local → los 4 lienzos quedaban girados 90° (tablones finos cruzando el patio). Corregido w/d intercambiados + crenelas de la puerta (rot π/2). Verificado con test geométrico en Node.
- NPCs estáticos: máquina de estados nueva (pasear→pausar→mirar) con waypoints alrededor de cada ancla (trabajo/tarde/casa), RNG determinista por NPC, anti-atasco (18s), colisión con cajas además de cilindros. Verificado en vivo: 5/8 paseando simultáneamente.
- Ajustes gráficos sin efecto: Engine.applyQuality ahora aplica shadowMapSize a las luces (dispose del mapa viejo), marca needsUpdate en materiales al alternar sombras; VegetationSystem.setGrassDensity reconstruye la hierba visible al instante; aplicado pixelRatio real. E2E: low desactiva sombras/baja resolución, ultra los activa — PASS.
- Carga por chunks a lo lejos: VegetationSystem reescrito con mallas instanciadas POR CLÚSTER (2×2 chunks, frustum culling real; antes 4 meshes globales sin culling dibujaban ~3700 árboles siempre). Nuevo StructureStreamer oculta grupos de estructuras a >560m (castillo, aldea, POIs, islas). Colisiones de árboles registradas/retiradas con el streaming (removePrefix nuevo en ColliderRegistry).
- Menú y pantalla de carga épicos: reveal letra a letra con blur, brillo dorado respirando tras el título, shimmer barriendo "FORGOTTEN SEAS", brasas ascendentes deterministas, olas SVG derivando al pie, rosa de los vientos girando, anillo de progreso con pulso, sheen en la barra, gradientes de horizonte. CSS puro (globals.css) + menuFx.tsx compartido.

Fase 2 — El océano y los piratas:
- Mundo: 4 islas nuevas (Isla del Cuervo Viejo volcánica NW con Fortaleza del Cuervo, Farallón del Faro E con faro en ruinas, Islas de la Bruma gemelas arenosas S) en TerrainHeight (máscaras post-blend con plataforma somera propia), biomas por color de vértice, llanuras de construcción (FLATS), POIs con descubrimiento orgánico, árboles en islas. Mapa y heightmap del agua se regeneran solos (misma height()).
- Barcos (naval/Ship.ts): carabela Colibrí de Mar y bergantín pirata Gaviota Sangrienta/Zarpa de Sal — casco por secciones, castillo de popa, bauprés, 2 mástiles con vergas, velas animadas (3 estados, orientación al viento, flameado), timón giratorio, 6 cañones (3/banda), faroles, bandera, humo de daño, estela de espuma. Física: flotabilidad Gerstner 4 puntos compartida con el shader del agua (waveHeightAt CPU idéntico), viento global con precesión (factor por ángulo proa-viento), inercia, gobierno dependiente de velocidad, encallado, hundimiento animado.
- NavalSystem: IA pirata (patrulla/persecución/bordada en círculo a 26-48m con disparo estribor/babor al ser paralela, de-aggro >380m), tocada = muerta en el agua (velas 0) y abordable; balas con gravedad, salpicaduras/destellos/humo con pools de sprites; barriles de botín flotantes; barco del jugador se recupera en el muelle si se hunde; respawn de la Merodeadora a los 10min.
- Abordajes: prompt a <17m de nave tocada, garfios (ambos barcos congelados), jugador teleportado a cubierta con platformProbe exacto en espacio local, 3 piratas (Morwen capitana + corsarios) que persiguen/atacan en coordenadas de cubierta, guardilla anti-caída (las líneas de abordaje te devuelven a cubierta), combate con espada existente (34 daño Eirik), botín: Sello de la Orden + 90 monedas + madera, la Gaviota se hunde tras la victoria y vuelves al timón. Diálogo de aborto cerrado correctamente (fix de diálogo fantasma).
- Jugabilidad: embarcar/zarpar (E), desembarcar en costa detectada (16 direcciones), fondear (Espacio), velas W/S, timón A/D, bordadas clic izq/der con HUD (casco, nudos, velas, rosa de viento relativa, cooldowns por banda, contacto enemigo con aviso "¡ABORDA!"), cámara modo barco (zoom 7-42m), mapa con marcador de carabela, audio procedural nuevo (cañón, crujido, impacto casco, ancla, vela, garfio, hundimiento, viento/olas al navegar).
- Capítulo II: q4 Viento en las Velas (hablar con Bram → 4 madera en cajas marcadas + 3 lona de Rosa (pétalos u oro) + 2 cuerdas de Tom (10 monedas) → entrega junto al casco → el Colibrí real reemplaza al estático con colliders) y q5 El Cuervo de Tres Cabezas (navegar a aguas del Cuervo → tocar y abordar la Gaviota → derrotar a Morwen → Sello). Habilidades de navegación con efectos reales al zarpar (nav_marino +12% velocidad, nav_viento viento adverso suave, nav_bordo recarga -35%). Items nuevos: madera, lona, cuerda, sello, botín, espejo, escama de dragón (lore Fase 3). Cofres nuevos en las 3 islas.
- Guardado v2 compatible hacia atrás (v1 sin naval): estado naval completo (posición, rumbo, casco, velas, fondeado, hundido, enemigos, abordajes), ranuras con capítulo dinámico, continuar a bordo restaurado (cámara en modo barco).

Bugs encontrados y corregidos durante la verificación E2E:
1. Entrega del reacondicionamiento sin flag ship_repaired (bloqueaba habilidades/capítulo) → setFlag explícito.
2. StructureStreamer re-mostraba el barco estático retirado → unregister/register idempotente.
3. Objetivos de recolección solo se evaluaban en hitos de diálogo → addItem ahora evalúa misiones en vivo (con guardia de reentrada) — la entrega ya no pierde objetivos al consumir objetos.
4. Diálogo de abordaje quedaba abierto tras abortar por muerte, bloqueando TODOS los controles → closeDialogue en abortBoarding.
5. Prompts náuticos activos en pleno abordaje (Zarpar/Desembarcar) → currentPrompt devuelve null durante el abordaje.
6. Nave tocada seguía navegando y era inalcanzable → tocada = muerta en el agua (velas 0, velocidad a 0).
7. Jugador podía quedar fuera de la cubierta enemiga con el abordaje irresoluble → guardilla de "líneas de abordaje" (reposición + límites de borda).
8. Test E2E: textContent no reflejaba text-transform CSS (búsqueda case-sensitive), e.key faltante en eventos sintéticos de dígitos, NPCs con posiciones dinámicas (wandering) → lookup dinámico.

Stage Summary:
- E2E verificado con navegador real: 41/41 comprobaciones PASS — menú épico → nueva partida → intro → A/D corregidos (D=-X/A=+X con cámara +Z) → Q1→Q2→Q3→Q4→Q5 completas (CAPÍTULO II COMPLETO: sello recuperado, Morwen derrotada, Gaviota hundida) → embarque/velas/timón(64°)/ancla/bordadas → abordaje con combate en cubierta → guardado v2 + carga con restauración naval total (sello persiste, Q5 completada persiste) → ajustes gráficos aplicando en vivo → NPCs paseando (5/8 en movimiento).
- Consola sin errores; tsc y eslint limpios. Capturas en download/capturas/ (menú épico, carga épica, navegación, fortaleza, bordada, noche).
- Entregable: misma app en la ruta `/` (dev server puerto 3000), Fase 2 jugable de principio a fin.
- Fase 3 pendiente (plan del usuario): dragones (monturas, combate aéreo, Boss), con el Sello y la escama de dragón ya sembrando el gancho narrativo.
