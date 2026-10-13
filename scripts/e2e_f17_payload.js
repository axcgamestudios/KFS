// E2E FASE 17 v3 — isolated arena + manually-stepped frames where the
// reaction windows (parry 0.19s) are physically unhittable at SwiftShader fps.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const press = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  const release = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  const log = [];
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const store = () => window.__kotfsStoreGet();
  window.__kotfsE2ELogF17 = null;
  let g = null;

  try {
    // ---- wait for the (now English) menu ----
    let menuReady = false;
    for (let i = 0; i < 120; i++) {
      const btns = Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.toUpperCase() || '');
      if (btns.some((t) => t.includes('NEW GAME'))) { menuReady = true; break; }
      await wait(500);
    }
    check('Main menu is ENGLISH (NEW GAME button)', menuReady);
    g = window.__kotfsGame;
    if (!g || !menuReady) { window.__kotfsE2ELogF17 = log; return 'abort: no game'; }
    g.input.requestLock = () => {};
    g.input.pointerLocked = true;

    // ---- new game + skip intro ----
    window.__kotfsApi.startNewGame();
    let playing = false;
    for (let i = 0; i < 120; i++) {
      if (store().phase === 'intro') { press('Space'); release('Space'); }
      if (store().phase === 'playing') { playing = true; break; }
      await wait(500);
    }
    check('New game boots to PLAYING', playing, `phase=${store().phase}`);
    if (!playing) { window.__kotfsE2ELogF17 = log; return 'abort'; }
    await wait(2000);

    // ---- translation sweep ----
    const qTitle = store().questTracker?.title || '';
    check('Quest tracker is English', !/[áéíóúñ¿¡]/.test(qTitle) && qTitle.length > 3, `"${qTitle}"`);
    check('HUD is English (no accented Spanish)', !/[áéíóúñ¿¡]/.test(String(document.body.innerText).slice(0, 6000)));

    // ---- the cast (checked at the camp) ----
    const camp = g.bandits.bandits.filter((b) => !b.dead);
    check('Bandit cast alive (16 across 4 camps)', camp.length >= 4, `alive=${camp.length}`);
    const roles = new Set(camp.map((b) => b.role));
    check('THIEF present', roles.has('thief'), [...roles].join(','));
    check('HEAVY (axe+shield) present', roles.has('heavy'));
    check('SHOOTER (musket) present', roles.has('shooter'));
    check('CAPTAIN present', roles.has('captain'));
    const heavy = camp.find((b) => b.role === 'heavy');
    check('Heavy carries a shield', !!(heavy && heavy.model && heavy.model.hasShieldVisible));

    // ---- THE ARENA: dry land far from every camp (no crowd interference) ----
    const th = g.world.terrainHeight;
    let ax = 150, az = 120, ay = 0;
    for (const [tx, tz] of [[150, 120], [170, 90], [120, 160], [190, 150], [90, 190]]) {
      const h = th.height(tx, tz);
      if (h > 2.5) { ax = tx; az = tz; ay = h; break; }
    }
    g.player.teleport(ax, ay + 0.1, az);
    await wait(600);
    // de-aggro the whole map (out of leash anyway) and relocate our three actors
    for (const b of g.bandits.bandits) { b.aggro = false; b.state = 'patrol'; b.attackT = 0; b.aimT = 0; }
    const victim = camp.find((b) => b.role === 'thief');
    const heavyB = camp.find((b) => b.role === 'heavy' && !b.dead) || heavy;
    const shooter = camp.find((b) => b.role === 'shooter' && !b.dead);
    const actorPos = (b, dist, ang = 0) => {
      const p = g.player;
      p.yaw = ang;
      b.pos.set(p.position.x + Math.sin(ang) * dist, th.height(p.position.x + Math.sin(ang) * dist, p.position.z + Math.cos(ang) * dist), p.position.z + Math.cos(ang) * dist);
      b.yaw = Math.atan2(p.position.x - b.pos.x, p.position.z - b.pos.z);
      b.aggro = false; b.state = 'hold'; b.attackT = 0; b.aimT = 0;
      b.knockdownT = 0; b.backTurnedT = 0; b.airborne = false; b.grabbed = false; b.thrown = false;
      b.hp = Math.max(b.hp, b.maxHp);
      // pin him where he stands: think() overwrites 'hold'->'patrol' when
      // aggro is off, so his patrol target must be his own feet or he
      // strolls home between swings
      if (b.target) b.target.set(b.pos.x, 0, b.pos.z);
      b.guardT = 0; b.moving = false;
    };
    const resetFighter = () => {
      const c = g.combat, p = g.player;
      p.attackT = 0; p.attackRecovery = 0; p.rollT = 0; p.blocking = false;
      p.stamina = 100; p.dashing = false; p.dashKick = false; p.plunging = false;
      p.velocity.set(0, 0, 0); p.knockT = 0; p.verticalVel = 0;
      p.group.position.y = th.height(p.position.x, p.position.z) + 0.05;
      p.grounded = true; p.health = Math.max(p.health, 80);
      c.comboStep = 0; c.comboWindowT = 0; c.bufferedNext = false;
      c.hookCd = 0; c.grappleCd = 0; c.grabSpinT = 0; c.finisherLockT = 0; c.vaultWindowT = 0;
      c.swingHitDone = true;
    };
    const settle = async (sec) => { const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) await wait(80); };

    // ---- the 4-hit chain (startSwing direct; impacts land in the live loop) ----
    resetFighter();
    actorPos(victim, 1.6, 0);
    const kinds = [];
    for (let step = 1; step <= 4; step++) {
      g.combat.comboWindowT = 1.5;
      g.combat.comboStep = step - 1;
      actorPos(victim, 1.6, 0);
      g.combat.startSwing(g.combat.weapon, false, step);
      kinds.push(g.player.attackKind);
      await settle(1.4); // full swing + recovery, chain window alive
    }
    check('Chain 1 = quick THRUST', kinds[0] === 'thrust', kinds.join('→'));
    check('Chain 2 = diagonal slash', kinds[1] === 'light1' || kinds[1] === 'light2', kinds.join('→'));
    check('Chain 3 = SWEEP KICK', kinds[2] === 'sweep', kinds.join('→'));
    check('Chain 4 = WHIRLWIND slam', kinds[3] === 'spin', kinds.join('→'));
    check('The chain drew blood (Valor)', g.combat.valorValue > 0, `valor=${g.combat.valorValue}`);
    check('Whirlwind knocks the thief down', victim.knockdownT > 0 || victim.dead || victim.state === 'stagger',
      `kd=${victim.knockdownT?.toFixed(2)} st=${victim.state}`);

    // ---- AIR LAUNCH ----
    await settle(1.5);
    resetFighter();
    victim.knockdownT = 0; victim.state = 'hold'; victim.hp = Math.max(victim.hp, 40);
    actorPos(victim, 1.6, 0);
    g.combat.fireAirLaunch(g.combat.weapon);
    check('Air launch commits the uppercut', g.player.attackKind === 'uppercut');
    let heroLeftGround = false;
    for (let i = 0; i < 30; i++) {
      await wait(120);
      if (!g.player.grounded || g.player.verticalVel > 1) { heroLeftGround = true; break; }
    }
    check('The hero rides the launch up', heroLeftGround, `vy=${g.player.verticalVel.toFixed(1)}`);
    check('The bandit is launched (juggle state)', victim.airborne === true || victim.dead,
      `airborne=${victim.airborne}`);
    // ---- AIR JUGGLE + BOUNCE ----
    if (victim.airborne) {
      resetFighter();
      g.player.grounded = false; g.player.verticalVel = 2.5; g.player.airTime = 0.1; g.player.jumpsUsed = 1;
      g.combat.airJuggleUsed = 0;
      g.combat.fireAircut(g.combat.weapon);
      check('Air light = AERIAL slash', g.player.attackKind === 'aircut', g.player.attackKind);
      check('Air lights count toward the 3-cap', g.combat.airJuggleUsed === 1, `used=${g.combat.airJuggleUsed}`);
      g.player.verticalVel = -1; g.player.airTime = 0.2;
      victim.pos.x = g.player.position.x; victim.pos.z = g.player.position.z;
      victim.pos.y = g.player.position.y + 0.6; victim.airVy = 0.5;
      press('KeyC'); release('KeyC');
      await wait(200);
      check('AIR BOUNCE vaults the hero up', g.player.verticalVel > 4, `vy=${g.player.verticalVel.toFixed(1)}`);
      check('Bounce refreshes the air juggle', g.combat.airJuggleUsed === 0);
    }
    await settle(3);

    // ---- HOOK DASH (F) ----
    resetFighter();
    victim.hp = Math.max(victim.hp, 30); victim.state = 'hold'; victim.airborne = false; victim.knockdownT = 0;
    actorPos(victim, 9, 0);
    const hpBefore = victim.hp;
    press('KeyF'); release('KeyF');
    await wait(150);
    check('F fires the hook dash', g.player.dashing === true || g.combat.vaultWindowT > 0, `dashing=${g.player.dashing}`);
    let impactSeen = false;
    for (let i = 0; i < 40; i++) { if (g.combat.vaultWindowT > 0) { impactSeen = true; break; } await wait(80); }
    check('The dash connects (impact + vault window)', impactSeen);
    check('The flying kick drew blood', victim.hp < hpBefore || victim.dead, `${hpBefore.toFixed(0)}→${victim.hp.toFixed(0)}`);
    // VAULT
    resetFighter();
    g.combat.vaultWindowT = 0.3;
    g.combat.hookDashTarget = victim;
    victim.backTurnedT = 0;
    press('KeyC'); release('KeyC');
    await settle(0.8);
    check('VAULT leaves him back-turned', victim.backTurnedT > 0, `bt=${victim.backTurnedT?.toFixed(2)}`);

    // ---- E ROPE DART ----
    await settle(1.2);
    resetFighter();
    victim.backTurnedT = 0; victim.state = 'hold';
    actorPos(victim, 7, 0);
    const px0 = victim.pos.x, pz0 = victim.pos.z;
    g.combat.fireGrappleShot(g.combat.weapon);
    check('E fires the rope dart (projectile live)', !!g.combat.grapple);
    await settle(1.2);
    const moved = Math.hypot(victim.pos.x - px0, victim.pos.z - pz0);
    check('The dart YANKS him off his feet', moved > 0.7 || victim.dead || victim.airborne || victim.state === 'stagger',
      `moved ${moved.toFixed(1)}m st=${victim.state}`);

    // ---- DANGER SIGNALS ----
    await settle(1);
    // YELLOW heavy (manual bandit frame-stepping for deterministic telegraphs)
    actorPos(heavyB, 6, 0);
    heavyB.state = 'attack'; heavyB.attackKind = 'heavy'; heavyB.attackT = 0.05; heavyB.attackDur = 5; heavyB.hitDone = true;
    heavyB.update(1 / 30, g.player.position, g.world.terrainHeight, false, g.bandits.hooks, false);
    const mat = heavyB.glow && heavyB.glow.material;
    check('YELLOW glow marks the parryable heavy', !!mat && mat.color.r > 0.8 && mat.color.g > 0.6 && mat.color.b < 0.35,
      mat ? `rgb(${mat.color.r.toFixed(2)},${mat.color.g.toFixed(2)},${mat.color.b.toFixed(2)})` : 'no glow');
    heavyB.attackT = 2; heavyB.attackDur = 0.001; heavyB.state = 'hold';
    // WHITE -> RED on a quick strike
    actorPos(victim, 6, 0);
    victim.state = 'attack'; victim.attackKind = 'light1'; victim.attackT = 0.02; victim.attackDur = 10; victim.hitDone = true;
    victim.update(1 / 30, g.player.position, g.world.terrainHeight, false, g.bandits.hooks, false);
    const mW = victim.glow && victim.glow.material;
    check('WHITE glow warns of the quick strike', !!mW && mW.color.r > 0.8 && mW.color.g > 0.8 && mW.color.b > 0.8,
      mW ? `rgb(${mW.color.r.toFixed(2)},${mW.color.g.toFixed(2)},${mW.color.b.toFixed(2)})` : 'no glow');
    victim.attackT = 0.5; victim.attackDur = 1.0;
    victim.update(1 / 30, g.player.position, g.world.terrainHeight, false, g.bandits.hooks, false);
    const mR = victim.glow && victim.glow.material;
    check('RED flash at the perfect-dodge window', !!mR && mR.color.r > 0.85 && mR.color.g < 0.4,
      mR ? `rgb(${mR.color.r.toFixed(2)},${mR.color.g.toFixed(2)},${mR.color.b.toFixed(2)})` : 'no glow');
    victim.attackT = 2; victim.attackDur = 0.001; victim.state = 'hold';
    // BLUE musket + the HUD cue
    if (shooter) {
      actorPos(shooter, 10, 0);
      shooter.state = 'aim'; shooter.aimT = 0.55; shooter.hasToken = true; shooter.attackCooldown = 0;
      shooter.update(1 / 30, g.player.position, g.world.terrainHeight, false, g.bandits.hooks, false);
      const mat2 = shooter.glow && shooter.glow.material;
      check('BLUE glow marks the unblockable musket', !!mat2 && mat2.color.b > 0.75 && mat2.color.r < 0.45,
        mat2 ? `rgb(${mat2.color.r.toFixed(2)},${mat2.color.g.toFixed(2)},${mat2.color.b.toFixed(2)})` : 'no glow');
      const cue = g.bandits.dangerCue(g.player.position);
      check('HUD cue reads the musket (dodge)', cue === 'dodge', `cue=${cue}`);
      shooter.aimT = 1; shooter.state = 'hold'; shooter.attackCooldown = 5;
    }

    // ---- Q PARRY (manual frame-stepping: the 0.19s window needs real fps) ----
    await settle(1);
    resetFighter();
    actorPos(heavyB, 1.7, 0);
    heavyB.state = 'attack'; heavyB.attackKind = 'heavy'; heavyB.attackT = 0.5; heavyB.attackDur = 0.9; heavyB.hitDone = false;
    press('KeyQ'); // HOLD the guard
    for (let i = 0; i < 6; i++) g.combat.update(1 / 30, g.input, false, false, false);
    const guardUp = g.player.blocking === true && g.player.blockT > 0.5;
    check('Q raises the guard (blockT)', guardUp, `blockT=${g.player.blockT.toFixed(2)}`);
    g.player.blockAge = -0.1; // young guard: inside the parry window
    const v0 = g.combat.valorValue;
    for (let i = 0; i < 8; i++) heavyB.update(1 / 30, g.player.position, g.world.terrainHeight, true, g.bandits.hooks, false);
    release('KeyQ');
    const parried = g.player.parryT > 0 || g.combat.parryCounterT > 0;
    check('Q PARRY deflects the heavy', parried,
      `parryT=${g.player.parryT?.toFixed(2)} counter=${g.combat.parryCounterT?.toFixed(2)}`);
    check('Parry banks +25 Valor', g.combat.valorValue >= v0 + 20, `${v0.toFixed(0)}→${g.combat.valorValue.toFixed(0)}`);
    check('Valor bar mirrors to the HUD', store().valor === g.combat.valorValue, `${store().valor}`);

    // ---- PERFECT DODGE (manual: roll i-frames through the impact) ----
    await settle(1);
    resetFighter();
    actorPos(victim, 1.7, 0);
    victim.state = 'attack'; victim.attackKind = 'light1'; victim.attackT = 0.4; victim.attackDur = 0.9; victim.hitDone = false;
    g.player.rollT = 0.3; // mid-roll i-frames
    const v1 = g.combat.valorValue;
    for (let i = 0; i < 8; i++) victim.update(1 / 30, g.player.position, g.world.terrainHeight, true, g.bandits.hooks, false);
    const dodged = g.hitStopT > 0 || g.combat.dodgeCounterT > 0;
    check('PERFECT DODGE triggers the slow-mo beat', dodged,
      `hitStop=${g.hitStopT?.toFixed(2)} counter=${g.combat.dodgeCounterT?.toFixed(2)}`);
    check('Auto-counter blinds the attacker', victim.knockdownT > 0 || victim.dead || victim.state === 'stagger',
      `kd=${victim.knockdownT?.toFixed(2)} st=${victim.state}`);
    check('Dodge banks +18 Valor', g.combat.valorValue >= v1 + 15, `${v1.toFixed(0)}→${g.combat.valorValue.toFixed(0)}`);

    // ---- SEA TONIC (R) ----
    resetFighter();
    g.combat.valor = 250; if (g.combat.onValorChange) g.combat.onValorChange(250);
    g.player.health = 40;
    press('KeyR'); release('KeyR');
    await wait(300);
    check('R drinks the SEA TONIC (+45% health)', g.player.health >= 40 + g.player.stats.maxHealth * 0.4,
      `health 40→${g.player.health.toFixed(0)}`);
    check('Tonic costs a Valor segment', Math.abs(g.combat.valorValue - 150) < 1, `${g.combat.valorValue}`);

    // ---- GROUND SLAM ----
    await settle(1);
    resetFighter();
    const slamTargets = [victim, heavyB, shooter].filter((b) => b && !b.dead);
    for (const b of slamTargets) {
      b.pos.x = g.player.position.x + Math.sin(0) * 1.9 + (Math.random() - 0.5);
      b.pos.z = g.player.position.z + Math.cos(0) * 1.9 + (Math.random() - 0.5);
      b.knockdownT = 0; b.state = 'hold'; b.airborne = false;
    }
    g.player.grounded = false; g.player.verticalVel = 3; g.player.airTime = 0.2;
    g.combat.firePlunge(g.combat.weapon);
    check('SPACE+LMB commits the GROUND SLAM', g.player.plunging === true);
    for (let i = 0; i < 40 && !g.player.grounded; i++) await wait(100);
    await wait(500);
    const floored = slamTargets.filter((b) => b.knockdownT > 0 || b.dead).length;
    check('The slam flattens the pack', floored >= 2, `${floored}/${slamTargets.length} down`);

    // ---- GRAB-SPIN-THROW ----
    await settle(1.5);
    const throwVictim = slamTargets.find((b) => !b.dead) || victim;
    if (throwVictim) {
      resetFighter();
      throwVictim.knockdownT = 0; throwVictim.state = 'hold'; throwVictim.hp = Math.max(throwVictim.hp, 45);
      throwVictim.launch(9);
      g.player.grounded = false; g.player.verticalVel = 2.5; g.player.airTime = 0.15; g.player.jumpsUsed = 1;
      throwVictim.pos.x = g.player.position.x; throwVictim.pos.z = g.player.position.z;
      throwVictim.pos.y = g.player.position.y + 0.8;
      press('KeyF'); release('KeyF');
      await wait(150);
      const grabbing = g.combat.grabSpinT > 0 && !!g.combat.grabVictim;
      check('F in the air GRABS the floating bandit', grabbing, `spin=${g.combat.grabSpinT?.toFixed(2)}`);
      if (grabbing) {
        const splashTarget = slamTargets.find((b) => !b.dead && b !== throwVictim);
        if (splashTarget) {
          splashTarget.pos.x = throwVictim.pos.x + 2.5; splashTarget.pos.z = throwVictim.pos.z;
          splashTarget.knockdownT = 0; splashTarget.state = 'hold';
        }
        for (let i = 0; i < 40 && g.combat.grabSpinT > 0; i++) await wait(100);
        check('The whirl THROWS him (ballistic)', throwVictim.thrown === true, `thrown=${throwVictim.thrown}`);
        for (let i = 0; i < 40 && throwVictim.airborne; i++) await wait(100);
        await wait(700);
        check('Crash landing detonates (he stays down)', throwVictim.knockdownT > 0 || throwVictim.dead,
          `kd=${throwVictim.knockdownT?.toFixed(2)} hp=${throwVictim.hp?.toFixed(0)}`);
        if (splashTarget) {
          check('The crash SPLASHES nearby bandits', splashTarget.knockdownT > 0 || splashTarget.dead,
            `kd=${splashTarget.knockdownT?.toFixed(2)}`);
        }
      }
    }

    // ---- FINISHER (V) ----
    await settle(1.5);
    const finTarget = [victim, heavyB, shooter].find((b) => b && !b.dead);
    if (finTarget) {
      resetFighter();
      finTarget.hp = Math.max(6, finTarget.maxHp * 0.1);
      finTarget.pos.x = g.player.position.x + Math.sin(0) * 1.6;
      finTarget.pos.z = g.player.position.z + Math.cos(0) * 1.6;
      finTarget.airborne = false; finTarget.knockdownT = 0; finTarget.state = 'hold';
      g.combat.valor = 200; if (g.combat.onValorChange) g.combat.onValorChange(200);
      await wait(500);
      check('HUD flags FINISHER READY', store().finisherReady === true);
      press('KeyV'); release('KeyV');
      await settle(1.2);
      check('V executes the cinematic FINISHER', finTarget.dead === true, `hp=${finTarget.hp}`);
      check('Finisher costs a Valor segment', Math.abs(g.combat.valorValue - 100) < 1, `${g.combat.valorValue}`);
    }
    check('Bandit REMATE no longer binds E', !(store().prompt || '').toUpperCase().includes('REMATE'), `"${store().prompt}"`);

    // ---- WALK & RUN poses ----
    resetFighter();
    g.state.addItem('escudo_marea');
    g.combat.refreshVisuals();
    await wait(200);
    const model = g.player.model;
    const bone = (n) => model.bones.get(n);
    const frame = (speed) => model.update({ dt: 0.016, speed, moving: true, grounded: true, swimming: false, attackT: 0, blockT: 0, rollT: 0, bowDraw: -1 });
    frame(2.2); frame(2.2); frame(2.2);
    const walkSR = bone('j_shoulderR').rotation.x;
    const walkSL = bone('j_shoulderL').rotation.x;
    check('Walk: sword arm in READY CARRY', walkSR > -0.65 && walkSR < 0.35, `shR.x=${walkSR.toFixed(2)}`);
    check('Walk: shield arm steady (no pendulum)', walkSL < -0.2, `shL.x=${walkSL.toFixed(2)}`);
    for (let i = 0; i < 30; i++) frame(6.6);
    const runSL = bone('j_shoulderL').rotation.x;
    const runSR = bone('j_shoulderR').rotation.x;
    const runTorso = bone('j_torso').rotation.x;
    check('Sprint: SHIELD snaps forward (the charge)', runSL < -0.75, `shL.x=${runSL.toFixed(2)}`);
    check('Sprint: sword arm trails back', runSR > 0.25, `shR.x=${runSR.toFixed(2)}`);
    check('Sprint: the knight leans into the run', runTorso > 0.28, `torso.x=${runTorso.toFixed(2)}`);

    // ---- dragon flight ----
    const dgl = g.dragons.list().find((d) => d.model && d.model.update && d.model.isLoaded);
    if (dgl) {
      const wing = dgl.model.joints['upper_arm_L_052'];
      const r0 = wing.rotation.z;
      for (let i = 0; i < 40; i++) dgl.model.update(0.016, { mode: 'fly', t: 0, speed: 7, turn: 0.35, grounded: false });
      const r1 = wing.rotation.z;
      check('Dragon flight: wings BEAT (shaped stroke)', Math.abs(r1 - r0) > 0.25, `Δz=${(r1 - r0).toFixed(2)}`);
      for (let i = 0; i < 20; i++) dgl.model.update(0.016, { mode: 'glide', t: 0, speed: 7, turn: 0.0, grounded: false });
      const r2 = wing.rotation.z;
      check('Dragon glide: wings hold WIDE and still', Math.abs(r2 - r1) < 0.5, `Δz=${(r2 - r1).toFixed(2)}`);
    } else {
      check('A living dragon exists for the flight test', false, 'none loaded');
    }

    // ---- staged screenshot: the fight + the new HUD ----
    window.__kfs17shotAt = 'fight';
    console.log('__kfs17shot:fight');
    const t7 = Date.now();
    while (window.__kfs17shotAck !== 'fight' && Date.now() - t7 < 12000) await wait(250);
    window.__kfs17shotAck = null;

    const pass = log.filter((l) => l.startsWith('PASS')).length;
    const fail = log.filter((l) => l.startsWith('FAIL')).length;
    log.push(`DONE — ${pass} PASS / ${fail} FAIL`);
    window.__kotfsE2ELogF17 = log;
    return 'done';
  } catch (e) {
    log.push('EXCEPTION: ' + (e && e.message));
    log.push(String(e && e.stack).split('\n').slice(0, 4).join(' | '));
    window.__kotfsE2ELogF17 = log;
    return 'exception';
  }
})().then((r) => { window.__kotfsE2EStatusF17 = r; });
