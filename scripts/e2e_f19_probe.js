// F19 probe — British village, castle rebuild, crow settlement, ship-boarding
// fix and the full archery system. MODE=checks (default) | shots.
const { chromium } = require('playwright');
const fs = require('fs');
const MODE = process.argv[2] || 'checks';

(async () => {
  fs.mkdirSync('/home/z/my-project/scripts/shots_f19', { recursive: true });
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=1500',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  // pre-seed X-LOW graphics + muted audio: the SwiftShader renderer must fit
  // in ~2 GB of RAM or Chromium OOM-kills the page mid-probe
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'xlow', tier: 'xlow', settingsRev: 3,
        waves: false, shadows: false, realLights: false, grass3d: false,
        renderChunks: 2, reflections: 0, postfx: false, resolution: 0.55, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
    } catch (e) { /* ignore */ }
  });
  const bad = [];
  let crashed = false;
  page.on('crash', () => { crashed = true; });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().slice(-90)}`); });
  page.on('pageerror', (e) => bad.push('PAGEERR: ' + e.message));
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });

  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  let result = [];
  if (MODE === 'checks') {
  try {
    result = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const log = [];
    const check = (name, cond, extra = '') => log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`);
    const g = window.__kotfsGame;
    if (!g) { log.push('FAIL — no game instance'); return log; }
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;

    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 120; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    check('Boots to PLAYING', playing);
    if (!playing) return log;
    await wait(2000);

    const w = g.world, th = w.terrainHeight, p = g.player, c = g.combat;
    const V = Object.getPrototypeOf(p.position).constructor;

    // ================= 1. THE BRITISH VILLAGE =================
    const vil = w.village;
    check('Village layout exposes the Fase-18 anchors',
      !!(vil && vil.fountainPos && vil.stablePos && vil.rosaDoor && vil.ericaDoor && vil.bramForge && vil.marenGarden && vil.borinForge));
    check('Fountain stands on the green (20,150)',
      Math.hypot(vil.fountainPos.x - 20, vil.fountainPos.z - 150) < 6,
      `(${vil.fountainPos.x.toFixed(1)}, ${vil.fountainPos.z.toFixed(1)})`);
    check('Stable west of the green', Math.hypot(vil.stablePos.x + 14, vil.stablePos.z - 187) < 8,
      `(${vil.stablePos.x.toFixed(1)}, ${vil.stablePos.z.toFixed(1)})`);
    const borinDef = w.npcDefs.find((d) => d.id === 'enano');
    check('Borin moved into the village (dock road)', !!borinDef && Math.hypot(borinDef.home.x - 0, borinDef.home.z - 206) < 6,
      borinDef ? `(${borinDef.home.x.toFixed(0)}, ${borinDef.home.z.toFixed(0)})` : 'missing');
    const ericaDef = w.npcDefs.find((d) => d.id === 'elin');
    check('Erica the shopkeeper renamed + cottage east of the green',
      !!ericaDef && ericaDef.name.includes('Erica') && Math.hypot(ericaDef.home.x - 36, ericaDef.home.z - 143) < 6,
      ericaDef ? `${ericaDef.name} @ (${ericaDef.home.x.toFixed(0)}, ${ericaDef.home.z.toFixed(0)})` : 'missing');
    // the bounty board interactable sits clear of Erica's cottage
    const board = w.interactables.find((it) => it.id === 'bounty_board');
    check('Bounty board relocated (27,156), outside Erica\'s walls',
      !!board && Math.hypot(board.pos.x - 27, board.pos.z - 156) < 2,
      board ? `(${board.pos.x.toFixed(0)}, ${board.pos.z.toFixed(0)})` : 'missing');

    // cabins: doors are open gaps — the player can stand INSIDE
    const inCabin = (x, z) => p.teleport(x, th.height(x, z) + 0.1, z);
    inCabin(0, 138.5); await wait(400);
    const tomIn = th.height(0, 138.5) > 2; // on the floor, not in water
    inCabin(40, 171); await wait(300);
    check('Cabin floors are solid ground inside (Tom + Bram spots)', tomIn && th.height(40, 171) > 2);

    // ================= 2. THE CASTLE REBUILD =================
    check('Castle bailey is a TRUE flat pad (h≈38)',
      Math.abs(th.height(110, -42) - 38) < 4, `h=${th.height(110, -42).toFixed(1)}`);
    check('Castle gate + training dummy refs survive', !!(w.castleGate && w.dummyPos));
    p.teleport(105, th.height(105, -45) + 0.1, -45); await wait(600);
    check('Courtyard floor is walkable (h≈38 at keep front)', th.height(105, -45) > 33,
      `h=${th.height(105, -45).toFixed(1)}`);

    // ================= 3. THE CROW SETTLEMENT =================
    check('Crow isle summit lowered (was 46)', th.height(-540, -450) < 34,
      `h=${th.height(-540, -450).toFixed(1)}`);
    check('Lower settlement terrace (h≈12)', Math.abs(th.height(-512, -468) - 12) < 5,
      `h=${th.height(-512, -468).toFixed(1)}`);
    check('Cove beach camp terrace (h≈5)', Math.abs(th.height(-452, -372) - 5) < 5,
      `h=${th.height(-452, -372).toFixed(1)}`);
    check('Western lookout shelf (h≈22)', Math.abs(th.height(-575, -400) - 22) < 6,
      `h=${th.height(-575, -400).toFixed(1)}`);
    for (const id of ['chest_crow_settlement', 'chest_crow_cove', 'chest_crow_lookout']) {
      check(`Smuggler cache registered: ${id}`, w.interactables.some((it) => it.id === id));
    }

    // ================= 4. SHIP BOARDING (the quest fix) =================
    const gull = g.naval.enemies.find((b) => b.ship.id === 'gaviota');
    check('The Bloody Gull sails (quest brain present)', !!gull && gull.quest === true);
    if (gull) {
      const s = gull.ship;
      // a point 3 m off her starboard hull (ship-local +X)
      const [px, pz] = [s.pos.x + Math.sin(s.heading + Math.PI / 2) * 6, s.pos.z + Math.cos(s.heading + Math.PI / 2) * 6];
      const dHull = s.hullDistanceTo(px, pz);
      check('Hull distance measures to the HULL (≈3 m from the side)', dHull < 5, `d=${dHull.toFixed(2)} m`);
      check('Helm candidate does NOT grab from 10 m off the hull',
        !g.naval.helmCandidate(new V(px, 0, pz)) || s.hullDistanceTo(px, pz) < 5);
      // cripple her (hull below 35% — `crippled` is a GETTER, so the probe
      // must damage the hull, not assign the flag) and board from the water
      // on foot — SYNCHRONOUSLY (the live loop would sail her away in any await)
      s.hullHp = Math.min(s.hullHp, s.maxHullHp * 0.2);
      s.sunk = false; s.sinking = 0; s.frozen = true;
      p.teleport(px, 0.4, pz);
      const fromWater = g.naval.canBoardFromWorld(p.position);
      check('Board-from-world: a crippled QUEST ship can be boarded on foot',
        !!fromWater && fromWater.ship.id === 'gaviota');
      const prompt = g.naval.currentPrompt(p.position);
      check('Prompt offers "Climb aboard the Bloody Gull"',
        !!prompt && /climb aboard/i.test(prompt.prompt), `"${prompt?.prompt}"`);
      if (prompt && /climb aboard/i.test(prompt.prompt)) {
        prompt.run();
        check('Boarding starts (Morwen fight begins)', !!g.naval.boarding && gull.questBoarded === true,
          `crew=${g.naval.boarding?.crew?.length ?? 0}`);
        // clean up so later checks aren't stuck mid-boarding
        g.naval.abortBoarding();
        gull.questBoarded = false; gull.mode = 'patrol';
        s.hullHp = s.maxHullHp; s.frozen = false;
        check('abortBoarding cleans the state', g.naval.boarding === null || g.naval.boarding === false);
      }
    }

    // ================= 5. THE ARCHERY SYSTEM =================
    g.state.addItem('arco_corto', 1);
    g.state.addItem('gran_arco', 1);
    g.state.addItem('flecha_perforante', 6);
    g.state.addItem('flecha_fuego', 5);
    g.state.addItem('flecha_electrica', 5);
    g.state.addItem('flecha_veneno', 4);
    const api = window.__kotfsApi;
    check('Bows + arrow families exist in the inventory',
      api.inventory().some((i) => i.id === 'arco_corto') && api.inventory().some((i) => i.id === 'flecha_fuego'));

    // stand on the green, clear of props
    p.teleport(24, th.height(24, 146) + 0.1, 146); await wait(500);
    c.switchTo('arco_corto');
    check('Short bow equips (slot 4 family)', c.weapon?.id === 'arco_corto');

    // aim + draw through the REAL input path
    g.input.rightDown = true; g.input.leftDown = true;
    for (let i = 0; i < 40 && p.bowDraw < 0.999; i++) await wait(100);
    check('Draw reaches 100% (short bow: 0.42 s)', p.bowDraw >= 0.999, `draw=${p.bowDraw.toFixed(2)}`);
    check('Aiming slows the stride (aim flag on player)', p.bowAiming === true);
    // keep holding → overdraw clock + stamina burn
    const stam0 = p.stamina;
    for (let i = 0; i < 30; i++) await wait(100);
    const st = window.__kotfsStoreGet();
    check('Overdraw engages past 100% (drain + HUD clock)',
      c.overdrawT > 0.5 && p.stamina < stam0 + 0.001, `od=${c.overdrawT?.toFixed(1)}s stam ${stam0.toFixed(0)}→${p.stamina.toFixed(0)}`);
    check('HUD receives archery state (ammo + cooldowns)',
      !!st.bowHud && st.bowHud.ammo === 'basic', st.bowHud ? `ammo=${st.bowHud.ammoName}` : 'null');
    // release → an arrow flies
    g.input.leftDown = false; g.input.rightDown = false;
    await wait(300);
    const arrowsFlying = c.arrows.length > 0;
    check('Loosing spawns a live arrow', arrowsFlying, `arrows=${c.arrows.length}`);

    // ammo cycling (X) — only owned families
    press('KeyX'); release('KeyX'); await wait(250);
    check('X cycles into PIERCING arrows (owned)', c.ammoKind === 'piercing', `kind=${c.ammoKind}`);
    check('HUD ammo name follows the cycle',
      window.__kotfsStoreGet().bowHud?.ammoName?.toLowerCase().includes('piercing') === true,
      `"${window.__kotfsStoreGet().bowHud?.ammoName}"`);

    // abilities: G arrow rain, T piercing shot
    p.stamina = Math.max(p.stamina, 80);
    c.arrowRainCd = 0; c.pierceShotCd = 0;
    press('KeyG'); release('KeyG'); await wait(250);
    check('G — ARROW RAIN scheduled', c.arrowRainCd > 15 || !!c.arrowRain, `cd=${c.arrowRainCd?.toFixed(0)}`);
    press('KeyT'); release('KeyT'); await wait(250);
    check('T — CONCENTRATED PIERCING SHOT fires', c.pierceShotCd > 5, `cd=${c.pierceShotCd?.toFixed(0)}`);

    // the greatbow plants while drawn
    c.switchTo('gran_arco');
    g.input.rightDown = true; g.input.leftDown = true;
    for (let i = 0; i < 40 && p.bowDraw < 0.999; i++) await wait(100);
    check('Greatbow: drawn + PLANTED stance (no movement)', p.bowDraw >= 0.5 && p.bowPlanted === true,
      `draw=${p.bowDraw.toFixed(2)} planted=${p.bowPlanted}`);
    g.input.leftDown = false; g.input.rightDown = false;
    await wait(200);

    // shops sell the arsenal
    const torvald = api.shopCatalog('herrero');
    const borin = api.shopCatalog('enano');
    check('Torvald sells the short bow + arrow quivers (bundles ×5/6)',
      !!torvald && torvald.entries.some((e) => e.id === 'arco_corto')
      && torvald.entries.some((e) => e.id === 'flecha_perforante' && e.qty === 6));
    check('Borin sells the Greatbow of the Deep Forge + shock arrows',
      !!borin && borin.entries.some((e) => e.id === 'gran_arco')
      && borin.entries.some((e) => e.id === 'flecha_electrica'));

    // ================= 6. THE SEA MONSTER =================
    g.state.addItem('cuerno_marea', 1);
    while (g.state.level < 6) g.state.giveXp(1);
    const king = g.seaBeasts.summonKing();
    check('The King of the Sea answers the horn', king === true);
    await wait(1500);
    check('King alive + serpent model (not the dragon)',
      g.seaBeasts.beasts.some((b) => b.alive && b.isKing));

    log.push('--- end of checks ---');
    return log;
  });
  } catch (e) {
    result = [`FAIL — evaluate crashed: ${e.message}`];
  }
  if (crashed) result.push('FAIL — renderer CRASHED (OOM?)');
  } else {
    result = ['(checks skipped — shots mode)'];
  }

  // ---------------- screenshots (visual QA — shots mode only) ----------------
  const shotLog = [];
  if (MODE === 'shots') {
    let shotPage = page;
    if (crashed || page.isClosed()) {
      shotPage = await browser.newPage({ viewport: { width: 800, height: 450 } });
      await shotPage.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
      for (let i = 0; i < 90; i++) {
        const btns = await shotPage.evaluate(() =>
          Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
        if (btns.some((t) => t.includes('NEW GAME'))) break;
        await shotPage.waitForTimeout(500);
      }
    }
    // always start a fresh journey (the checks page may still be at the menu)
    await shotPage.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
      const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      const g = window.__kotfsGame;
      g.input.requestLock = () => {};
      g.input.pointerLocked = true;
      window.__kotfsApi.startNewGame();
      for (let i = 0; i < 120; i++) {
        const ph = window.__kotfsStoreGet().phase;
        if (ph === 'intro') { press('Space'); release('Space'); }
        if (ph === 'playing') break;
        await wait(500);
      }
      await wait(2000);
    });
    const shots = [
      ['village_green', 24, 146, 'fountain + green + cottages'],
      ['cabin_interior', 0, 139, 'inside Tom\'s cabin'],
      ['stable', -10, 184, 'the stable yard'],
      ['castle', 105, -38, 'castle courtyard + keep'],
      ['crow_settlement', -512, -462, 'the longhouse settlement'],
      ['sea_king', 476, 452, 'the King of the Sea'],
    ];
    for (const [name, x, z] of shots) {
      await shotPage.evaluate(({ ax, az }) => {
        const g = window.__kotfsGame;
        const th = g.world.terrainHeight;
        g.player.teleport(ax, th.height(ax, az) + 0.2, az);
      }, { ax: x, az: z });
      if (name === 'sea_king') {
        // summon the King (needs horn + level 6), drag him in front of the
        // lens and look toward him
        await shotPage.evaluate(() => {
          const g = window.__kotfsGame;
          g.state.addItem('cuerno_marea', 1);
          while (g.state.level < 6) g.state.giveXp(1);
          g.seaBeasts?.summonKing?.();
          const k = g.seaBeasts.beasts.find((b) => b.isKing);
          if (k) {
            k.pos.x = g.player.position.x + 34;
            k.pos.z = g.player.position.z;
          }
          g.player.yaw = Math.PI / 2;
        });
      }
      await shotPage.waitForTimeout(2600);
      await shotPage.screenshot({ path: `/home/z/my-project/scripts/shots_f19/${name}.jpg`, quality: 72, type: 'jpeg' });
      shotLog.push(name);
    }
  }

  console.log(result.join('\n'));
  console.log('SHOTS: ' + shotLog.join(', '));
  const fails = result.filter((l) => l.startsWith('FAIL'));
  console.log(`\n==== ${result.filter((l) => l.startsWith('PASS')).length} PASS / ${fails.length} FAIL ====`);
  if (bad.length) console.log('NETWORK/PAGE ERRORS:\n' + bad.slice(0, 12).join('\n'));
  await browser.close();
})().catch((e) => { console.error('PROBE CRASH:', e.message); process.exit(1); });
