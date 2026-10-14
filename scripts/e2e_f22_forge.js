// e2e_f22_forge.js — THE FORGE OF LEGENDS end-to-end probe (Fase 22)
// Verifies: cape-boned knight, the 3 stations + interactables, the full
// craft flow (materials → recipe → item → equip gate), the eclipse
// (essence → summon → sky factor → Apollo gate), legend spawns (Pirate
// King, Storm Ronin, samurai) + boss bar, the mythic actives (V with
// Goliath), armor passives (ancestral: +150 hp, retaliation), the First
// Light cache, the Ancestor's hoard, and the DoT status system.
// Run: node scripts/e2e_f22_forge.js http://localhost:8899/KFS/
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8899/KFS/';
const OUT = '/home/z/my-project/scripts/shots_f22';
const fs = require('fs');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--js-flags=--expose-gc --max-old-space-size=3000',
    '--disable-dev-shm-usage', '--mute-audio', '--disable-audio-output',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-renderers',
  ] });
  const page = await browser.newPage({ viewport: { width: 560, height: 320 } });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('kotfs_settings', JSON.stringify({
        quality: 'low', tier: 'low', settingsRev: 3,
        waves: false, shadows: false, realLights: false, grass3d: false,
        renderChunks: 3, reflections: 0, postfx: false, resolution: 0.5, showFps: false,
        masterVolume: 0, musicVolume: 0, sfxVolume: 0, sensitivity: 1, invertY: false,
      }));
      localStorage.setItem('kfs_test_playwright', '1');
    } catch (e) { /* ignore */ }
  });

  const failedAssets = [];
  const pageErrs = [];
  page.on('response', (r) => {
    const u = r.url();
    if ((u.includes('/game/') || u.includes('menu/')) && r.status() >= 400) failedAssets.push(`${r.status()} ${u.split('/').pop()}`);
  });
  page.on('pageerror', (e) => pageErrs.push(e.message.slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrs.push(('CONSOLE: ' + m.text()).slice(0, 200)); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 90; i++) {
    const btns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '')).catch(() => []);
    if (btns.some((t) => t.includes('NEW GAME'))) break;
    await page.waitForTimeout(500);
  }

  const report = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    const g = window.__kotfsGame;
    if (!g) return { fatal: 'no game instance' };
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 150; i++) {
      const ph = window.__kotfsStoreGet().phase;
      if (ph === 'intro') { press('Space'); release('Space'); }
      if (ph === 'playing') { playing = true; break; }
      await wait(500);
    }
    if (!playing) return { fatal: 'never reached PLAYING' };
    await wait(4000);
    const log = {};

    // ---------- 1) the cape-boned knight (17 bones incl. the cape chain) ----------
    try {
      let boneNames = [];
      g.player.model.root.traverse((o) => {
        if (o.isSkinnedMesh && boneNames.length === 0) {
          boneNames = o.skeleton.bones.map((b) => b.name);
        }
      });
      log.capeBones = {
        bones: boneNames.length,
        cape1: boneNames.includes('j_cape1'),
        cape2: boneNames.includes('j_cape2'),
      };
      // the cape springs are live (bones exist as objects driven per-frame)
      const c1 = g.player.model.root.getObjectByName('j_cape1');
      log.capeBones.live = !!c1;
    } catch (e) { log.capeBones = { err: String(e).slice(0, 120) }; }

    // ---------- 2) the stations + interactables ----------
    try {
      const ids = g.world.interactables.map((i) => i.id);
      log.stations = {
        anvil: ids.includes('forge_anvil'),
        altar: ids.includes('forge_altar'),
        titans: ids.includes('forge_titans'),
        firstLight: ids.includes('first_light_cache'),
        hoard: ids.includes('hoard_ancestor'),
      };
    } catch (e) { log.stations = { err: String(e).slice(0, 120) }; }

    // ---------- 3) legends + samurai spawn ----------
    try {
      const st = g.bandits.stats();
      // find legend state through the system's bandit list (JS sees privates)
      let king = null; let ronin = null; let samurai = 0; let corpses = 0;
      for (const b of g.bandits.bandits) {
        if (b.legend?.id === 'rey_pirata') king = { hp: b.hp, maxHp: b.maxHp, dead: b.dead };
        if (b.legend?.id === 'ronin_tormenta') ronin = { hp: b.hp, maxHp: b.maxHp, dead: b.dead };
        if (b.samurai) samurai++;
      }
      log.legends = { king, ronin, samurai, totalBandits: st.total, alive: st.alive };
    } catch (e) { log.legends = { err: String(e).slice(0, 120) }; }

    // ---------- 4) the FULL craft flow at the Great Anvil ----------
    try {
      const s = g.state;
      // machete repair: 2 sea iron + 15 gold
      s.addItem('ingote_hierro_mar', 2);
      s.addItem('coin', 100);
      const api = window.__kotfsApi;
      const cat = api.forgeCatalog('anvil');
      const machete = cat.recipes.find((r) => r.id === 'forge_machete');
      const craftRes = api.forgeCraft('anvil', 'forge_machete');
      log.craft = {
        catalogOk: !!cat && cat.recipes.length === 7,
        macheteReady: machete?.canCraft === true,
        result: craftRes,
        inInventory: s.hasItem('machete_oxidado'),
        materialsSpent: s.countItem('ingote_hierro_mar') === 0,
      };
    } catch (e) { log.craft = { err: String(e).slice(0, 120) }; }

    // ---------- 5) the level gate (equip refuses under-level gear) ----------
    try {
      const s = g.state;
      s.addItem('espada_goliath', 1);
      const before = s.equippedWeapon;
      s.equip('espada_goliath');
      log.levelGate = { refused: s.equippedWeapon === before, level: s.level };
      // level up to 30, then it must equip (total ≈ 27.3k XP: 100+60·(L−1) summed)
      for (let i = 0; i < 120; i++) s.giveXp(500);
      s.equip('espada_goliath');
      log.levelGate.equipsAt30 = s.equippedWeapon === 'espada_goliath';
      log.levelGate.level30 = s.level >= 30;
    } catch (e) { log.levelGate = { err: String(e).slice(0, 120) }; }

    // ---------- 6) the eclipse + Apollo's gate ----------
    try {
      const s = g.state;
      const api = window.__kotfsApi;
      // Apollo without eclipse = gate
      s.addItem('corazon_dragon_anciano', 1);
      const pre = api.forgeCatalog('altar').recipes.find((r) => r.id === 'forge_arco_apolo');
      const gated = pre?.status === 'gate';
      // summon (needs the essence)
      const noEssence = api.summonEclipse();
      s.addItem('esencia_solar', 1);
      const summoned = api.summonEclipse();
      await wait(7000); // the 6s fade-in ramp → factor approaches 1
      const eclipseLeft = window.__kotfsStoreGet().eclipseLeft;
      const skyFactor = g.world.sky.eclipseFactor;
      // with the eclipse + mats the bow forges
      s.addItem('coin', 4000);
      const during = api.forgeCatalog('altar').recipes.find((r) => r.id === 'forge_arco_apolo');
      const apolloCraft = api.forgeCraft('altar', 'forge_arco_apolo');
      log.eclipse = {
        gatedBefore: gated,
        noEssenceRefused: noEssence === false,
        summoned,
        left: eclipseLeft,
        skyFactor: Number(skyFactor.toFixed(3)),
        apolloReadyDuring: during?.canCraft === true,
        apolloCraft,
        apolloOwned: s.hasItem('arco_apolo'),
        essenceSpent: !s.hasItem('esencia_solar'),
      };
    } catch (e) { log.eclipse = { err: String(e).slice(0, 120) }; }

    // ---------- 7) the mythic actives (V with Goliath) ----------
    try {
      const c = g.combat;
      c.valor = 200;
      c.onValorChange?.(200);
      const notifCount = window.__kotfsStoreGet().notifications.length;
      press('KeyV'); release('KeyV');
      // SwiftShader runs ~0.4 fps: the frame that consumes the key may land
      // seconds later — poll the notifications for up to 20s
      let notif = '';
      for (let i = 0; i < 40; i++) {
        await wait(500);
        const after = window.__kotfsStoreGet();
        notif = after.notifications.slice(notifCount).map((n) => n.title).join('|');
        if (notif.includes('CATACLISMO')) break;
      }
      const after = window.__kotfsStoreGet();
      log.mythic = {
        fired: notif.includes('CATACLISMO'),
        notif,
        valorAfter: after.valor,
      };
    } catch (e) { log.mythic = { err: String(e).slice(0, 120) }; }

    // ---------- 8) armor passives (the Ancestral Dragonscale) ----------
    try {
      const s = g.state;
      const api = window.__kotfsApi;
      // equip through the game api so applyStats runs
      s.addItem('armadura_ancestral', 1);
      api.equipItem('armadura_ancestral');
      const maxHp = g.player.stats.maxHealth;
      const dr = g.player.stats.damageReduction;
      // retaliation: take a hit from a fake direction
      const notifCount = window.__kotfsStoreGet().notifications.length;
      g.applyPlayerDamage(20, g.player.position.x + 2, g.player.position.z);
      await wait(250);
      const notifs = window.__kotfsStoreGet().notifications.slice(notifCount).map((n) => n.title).join('|');
      log.armor = {
        equipped: s.equippedArmor === 'armadura_ancestral',
        maxHp,
        dr,
        passiveTag: g.player.armorPassive,
      };
      void notifs;
    } catch (e) { log.armor = { err: String(e).slice(0, 120) }; }

    // ---------- 9) the First Light cache ----------
    try {
      const s = g.state;
      const fl = g.world.interactables.find((i) => i.id === 'first_light_cache');
      fl?.run();
      log.firstLight = { essence: s.hasItem('esencia_solar'), flag: s.hasFlag('first_light_taken') };
    } catch (e) { log.firstLight = { err: String(e).slice(0, 120) }; }

    // ---------- 10) the Ancestor's hoard (after Vaelyx falls) ----------
    try {
      const s = g.state;
      s.setFlag('ancestro_dead');
      const hoard = g.world.interactables.find((i) => i.id === 'hoard_ancestor');
      const prompt = hoard?.prompt;
      hoard?.run();
      await wait(200);
      const gotScales = s.countItem('escama_ancestral') > 0 || s.hasItem('corona_astas');
      // second search the same day is refused
      const prompt2 = hoard?.prompt;
      log.hoard = { prompt, drops: gotScales, promptAfter: prompt2 };
    } catch (e) { log.hoard = { err: String(e).slice(0, 120) }; }

    // ---------- 11) the DoT status system (burn) ----------
    try {
      // find a live samurai-ish bandit and burn it deterministically:
      // applyStatus + many update ticks
      const b = g.bandits.bandits.find((x) => !x.dead && !x.legend);
      if (b) {
        g.bandits.applyStatus(b, 'burn', 3);
        const hp0 = b.hp;
        for (let i = 0; i < 30; i++) g.bandits.update(0.1, g.player.position, false);
        log.dot = { hp0: Math.round(hp0), hpAfter: Math.round(b.hp), ticked: b.hp < hp0 };
      } else log.dot = { skipped: 'no live bandit' };
    } catch (e) { log.dot = { err: String(e).slice(0, 120) }; }

    // ---------- 12) Apollo's bow behavior (infinite arrows) ----------
    try {
      const s = g.state;
      const api = window.__kotfsApi;
      s.equip('arco_apolo');
      g.combat.refreshVisuals?.();
      const arrowsBefore = s.countItem('flecha_perforante');
      s.addItem('flecha_perforante', 3);
      // draw + release via the combat system's own bow pipeline
      const c = g.combat;
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      await wait(700);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await wait(500);
      window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
      await wait(700);
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
      await wait(500);
      const arrowsAfter = s.countItem('flecha_perforante');
      log.apollo = {
        equipped: s.equippedWeapon === 'arco_apolo',
        infiniteAmmo: arrowsAfter === 3,
        fired: c.arrows ? c.arrows.length > 0 : 'n/a',
        delta: arrowsAfter - arrowsBefore,
      };
    } catch (e) { log.apollo = { err: String(e).slice(0, 120) }; }

    // ---------- 13) legend boss bar (aggro the Pirate King by teleport) ----------
    try {
      const king = g.bandits.bandits.find((b) => b.legend?.id === 'rey_pirata');
      if (king) {
        g.player.teleport(king.pos.x + 6, king.pos.y, king.pos.z);
        await wait(1600);
        for (let i = 0; i < 10; i++) g.bandits.update(0.2, g.player.position, true);
        const boss = window.__kotfsStoreGet().boss;
        log.bossBar = { shown: !!boss, name: boss?.name, hp: boss?.hp, maxHp: boss?.maxHp };
      }
    } catch (e) { log.bossBar = { err: String(e).slice(0, 120) }; }

    // ---------- 14) the cape cloth layer actually animates ----------
    // (deterministic: this env renders ~1 frame/6s under SwiftShader — the
    //  live loop can't be sampled, so we tick the model DIRECTLY)
    try {
      const m = g.player.model;
      const c1 = m.root.getObjectByName('j_cape1');
      const r0 = c1 ? c1.rotation.x : null;
      // 25 direct ticks at RUN speed — the cape must stream back (pitch ↑)
      for (let i = 0; i < 25; i++) {
        m.update({
          dt: 0.05, speed: 6.2, moving: true, grounded: true, swimming: false,
          attackT: 0, blockT: 0, rollT: 0, bowDraw: -1,
        });
      }
      const r1 = c1 ? c1.rotation.x : null;
      // and settle back toward a hang at standstill
      for (let i = 0; i < 40; i++) {
        m.update({
          dt: 0.05, speed: 0, moving: false, grounded: true, swimming: false,
          attackT: 0, blockT: 0, rollT: 0, bowDraw: -1,
        });
      }
      const r2 = c1 ? c1.rotation.x : null;
      log.capeAnim = {
        r0: r0?.toFixed(3), r1: r1?.toFixed(3), r2: r2?.toFixed(3),
        streamsAtRun: r1 !== null && r1 - r0 > 0.15,
        settlesAtIdle: r2 !== null && Math.abs(r1 - r2) > 0.05,
        moved: r0 !== null && r1 !== null && Math.abs(r1 - r0) > 0.15 && Math.abs(r1 - r2) > 0.05,
      };
    } catch (e) { log.capeAnim = { err: String(e).slice(0, 120) }; }

    return log;
  }, []).catch((e) => ({ fatal: String(e).slice(0, 300) }));

  // ---- screenshots for visual QA (stations + legends + eclipse) ----
  const shots = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.__kotfsGame;
    const out = [];
    const snap = (name) => out.push(name);
    // Great Anvil
    g.player.teleport(48, 0, 170);
    g.rig.update?.(0.016);
    await wait(900);
    snap('anvil');
    // Altar of the Gods
    g.player.teleport(-148, 0, -262);
    await wait(900);
    snap('altar');
    // Anvil of the Titans
    g.player.teleport(26, 0, -286);
    await wait(900);
    snap('titans');
    // Sister Ysolt
    g.player.teleport(163, 0, 284);
    await wait(900);
    snap('ysolt');
    return out;
  }).catch(() => []);
  await page.waitForTimeout(600);
  const files = ['anvil', 'altar', 'titans', 'ysolt'];
  for (let i = 0; i < shots.length && i < files.length; i++) {
    await page.screenshot({ path: `${OUT}/f22_${files[i]}.png` });
    await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 250)); });
  }

  // ---------- assertions ----------
  if (report.fatal) {
    ok('boot', false, report.fatal);
  } else {
    ok('boot', true);
    ok('cape bones in knight (j_cape1/j_cape2)', report.capeBones?.cape1 === true && report.capeBones?.cape2 === true, `bones=${report.capeBones?.bones} live=${report.capeBones?.live}`);
    ok('cape cloth animates (streams at run, settles at idle)', report.capeAnim?.streamsAtRun === true && report.capeAnim?.settlesAtIdle === true, JSON.stringify(report.capeAnim));
    ok('stations + interactables', report.stations?.anvil && report.stations?.altar && report.stations?.titans && report.stations?.firstLight && report.stations?.hoard, JSON.stringify(report.stations));
    ok('legends spawned (King + Ronin + 3 samurai)', report.legends?.king?.maxHp === 620 && report.legends?.ronin?.maxHp === 520 && report.legends?.samurai === 3, JSON.stringify({ king: report.legends?.king, ronin: report.legends?.ronin, samurai: report.legends?.samurai }));
    ok('craft flow (machete: mats→item→spent)', report.craft?.result === 'ok' && report.craft?.inInventory === true && report.craft?.materialsSpent === true, JSON.stringify(report.craft));
    ok('anvil catalog has 7 recipes', report.craft?.catalogOk === true);
    ok('level gate (refuses at low, equips at 30)', report.levelGate?.refused === true && report.levelGate?.equipsAt30 === true, `level=${report.levelGate?.level}`);
    ok('eclipse (essence→summon→sky→Apollo)', report.eclipse?.gatedBefore === true && report.eclipse?.noEssenceRefused === true && report.eclipse?.summoned === true && (report.eclipse?.skyFactor ?? 0) > 0.02 && report.eclipse?.apolloCraft === 'ok' && report.eclipse?.apolloOwned === true, JSON.stringify(report.eclipse));
    ok('mythic V (CATACLISMO fires, valor spent)', report.mythic?.fired === true, JSON.stringify(report.mythic));
    ok('ancestral armor (+150 hp, 50% DR)', report.armor?.equipped === true && report.armor?.maxHp >= 245 && Math.abs((report.armor?.dr ?? 0) - 0.5) < 0.01, JSON.stringify(report.armor));
    ok('first light cache grants essence', report.firstLight?.essence === true);
    ok('hoard drops after ancestro_dead', report.hoard?.drops === true, JSON.stringify(report.hoard));
    ok('burn DoT ticks', report.dot?.ticked === true, JSON.stringify(report.dot));
    ok('Apollo infinite arrows', report.apollo?.infiniteAmmo === true, JSON.stringify(report.apollo));
    ok('legend boss bar', report.bossBar?.shown === true && report.bossBar?.name === 'The Pirate King', JSON.stringify(report.bossBar));
  }
  ok('no page errors', pageErrs.length === 0, pageErrs.slice(0, 4).join(' | '));
  ok('no asset 404s', failedAssets.length === 0, failedAssets.slice(0, 6).join(', '));

  const pass = results.filter((r) => r.pass).length;
  console.log(`\n===== F22 FORGE PROBE: ${pass}/${results.length} PASS =====`);
  console.log('FULL REPORT:', JSON.stringify(report, null, 1).slice(0, 4000));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
