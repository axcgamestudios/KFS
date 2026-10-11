/**
 * Midship probe: at |z| < 1300 (the middle third of the hull, away from
 * the stern castle and bowsprit), find the top of the hull-side planking
 * (bulwark) and the deck-edge height. That gives the true freeboard and
 * the designed waterline for a realistic ~1.2 m freeboard.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'node:fs';

const path = '/home/z/my-project/public/game/models/pirate_ship.glb';
const data = fs.readFileSync(path);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // hull-side materials (planking / bulwark), NOT rigging/sails/masts
  const HULL = new Set(['Main', 'Mat.1', 'Mat.5', 'Mat.1_1', 'Mat.2', 'material', 'Polygon_Reduction_1__0', 'Mat.3']);
  let midTop = -Infinity;       // highest hull-side vertex at midship
  let midTopX = 0;
  let deckCandidateMin = Infinity; // lowest 'deck furniture' (Mat.6/Mat.7) vertex
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = m.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const isHull = mats.some((mm) => HULL.has((mm as THREE.Material).name || ''));
    const isDeckFurniture = mats.some((mm) => {
      const nm = (mm as THREE.Material).name || '';
      return nm === 'Mat.6' || nm === 'Mat.7';
    });
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      v.applyMatrix4(m.matrixWorld);
      if (Math.abs(v.z) < 1300) {
        if (isHull && Math.abs(v.x) > 300 && v.y > midTop) { midTop = v.y; midTopX = v.x; }
        if (isDeckFurniture && v.y < deckCandidateMin) deckCandidateMin = v.y;
      }
    }
  });
  console.log('Midship hull-side top (bulwark rail): raw y =', midTop.toFixed(0), 'at x =', midTopX.toFixed(0));
  console.log('Deck furniture lowest vertex:        raw y =', deckCandidateMin.toFixed(0));

  const s = 17.2 / 4768.4;
  const keel = -648.6;
  console.log('\nscale s =', s.toFixed(6));
  console.log('keel raw:', keel.toFixed(0), '→ scaled below waterline:', ((keel - (-60)) * s).toFixed(2), 'm (current WL=-60)');
  for (const wl of [-60, -100, -140, -180, -220]) {
    const freeboardToBulwark = (midTop - wl) * s;
    const freeboardToDeck = (deckCandidateMin - wl) * s;
    const draft = (wl - keel) * s;
    console.log(`WL=${wl}: draft=${draft.toFixed(2)}m, freeboard to bulwark=${freeboardToBulwark.toFixed(2)}m, to deck furniture=${freeboardToDeck.toFixed(2)}m`);
  }
  process.exit(0);
}, (err) => { console.error('PARSE ERROR', err); process.exit(1); });
