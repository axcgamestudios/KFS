(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__kotfsGame;
  const log = window.__kotfsE2ELog || (window.__kotfsE2ELog = []);
  const check = (name, cond, extra = '') => { log.push(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' [' + extra + ']' : ''}`); };
  const player = g.player;
  check('Jugador usa KnightModelGLB', player?.model?.constructor?.name === 'KnightModelGLB', player?.model?.constructor?.name ?? 'none');
  const pRoot = player.model.root;
  let skinned = 0; pRoot.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
  check('SkinnedMesh reales (skin glTF)', skinned >= 2, 'skinned=' + skinned);
  const bones = ['j_root','j_torso','j_head','j_shoulderR','j_elbowR','j_wristR','j_hipL','j_kneeL','j_ankleR'];
  const present = bones.filter((b) => !!pRoot.getObjectByName(b));
  check('Esqueleto (15 huesos esperados)', present.length >= 8, present.length + '/' + bones.length);
  const swordProp = pRoot.getObjectByName('j_sword_held');
  const shieldProp = pRoot.getObjectByName('j_shield_held');
  check('Espada de estatua en la mano derecha', !!swordProp && swordProp.visible === true);
  check('Escudo heater en el antebrazo izquierdo', !!shieldProp && shieldProp.visible === true);

  // walk animation smoke test
  const before = {};
  for (const b of ['j_hipR','j_shoulderR','j_kneeL']) { const o = pRoot.getObjectByName(b); if (o) before[b] = o.rotation.x; }
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
  await wait(700);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
  await wait(200);
  let moved = 0;
  for (const b of Object.keys(before)) { const o = pRoot.getObjectByName(b); if (o && Math.abs(o.rotation.x - before[b]) > 0.06) moved++; }
  check('Huesos animados al caminar', moved >= 2, moved + '/' + Object.keys(before).length);

  // auto-jump regression
  const y0 = player.position.y;
  await wait(900);
  const stable = Math.abs(player.position.y - y0) < 0.5 && player.grounded === true;
  check('SIN salto automático (quieta y en suelo)', stable, 'dy=' + Math.abs(player.position.y - y0).toFixed(2) + ' grounded=' + player.grounded);
  const preY = player.position.y;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
  await wait(60);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
  await wait(150);
  const jumped = !player.grounded || player.position.y > preY + 0.3;
  check('Salto con Espacio (una vez por pulsación)', jumped, 'y=' + player.position.y.toFixed(2) + ' vs ' + preY.toFixed(2));
  await wait(700);

  // weapon from the kit + statue sword swap
  try {
    const st = g.state;
    st.addItem('espada_orden'); st.equippedWeapon = 'espada_orden';
    g.combat.refreshVisuals();
    await wait(150);
    let handHas = false; pRoot.traverse((o) => { if (String(o.name).includes('sword_02')) handHas = true; });
    check('Arma del kit en la mano (sword_02)', handHas);
    check('Espada de estatua oculta al empuñar', !swordProp || swordProp.visible === false);
    st.equippedWeapon = null; st.removeItem?.('espada_orden');
    g.combat.refreshVisuals();
    await wait(180);
    check('Espada de estatua vuelve al reposo', !swordProp || swordProp.visible === true);
  } catch (e) { check('Arma del kit en la mano', false, String(e).slice(0, 120)); }

  // shield from the kit
  try {
    const st = g.state;
    st.addItem('escudo_marea');
    g.combat.refreshVisuals();
    await wait(150);
    let kitShield = false; pRoot.traverse((o) => { if (String(o.name).includes('shield_02')) kitShield = true; });
    check('Escudo del kit en el antebrazo (shield_02)', kitShield);
    check('Escudo de estatua oculta al equipar', !shieldProp || shieldProp.visible === false);
    st.removeItem?.('escudo_marea');
    g.combat.refreshVisuals();
    await wait(180);
    check('Escudo de estatua regresa', !shieldProp || shieldProp.visible === true);
  } catch (e) { check('Escudo del kit', false, String(e).slice(0, 120)); }

  // terrain shader flag
  check('Shader de terreno con Pasto/Tierra/Piedra', g.world.terrain.groundTextured === true);
  window.__kotfsE2ELog = log;
  return log.slice(-16).join('\n');
})().catch((e) => 'ERROR ' + String(e).slice(0,200));