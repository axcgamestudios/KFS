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
