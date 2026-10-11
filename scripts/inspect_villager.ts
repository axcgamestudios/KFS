/**
 * Inspect fuse_civilian_2.glb — the villager model:
 *  - real bbox size in raw model units (to compute the correct human scale)
 *  - rest rotations of every leg/arm bone (to understand "legs backwards")
 *  - skeleton hierarchy sanity + foot world orientation in bind pose
 * Run with bun (three is installed in the project).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as fs from 'node:fs';

const path = '/home/z/my-project/public/game/models/fuse_civilian_2.glb';
const data = fs.readFileSync(path);

// GLTFLoader.parse(arrayBuffer, path, onLoad, onError)
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  console.log('BBOX size  :', size.x.toFixed(3), size.y.toFixed(3), size.z.toFixed(3));
  console.log('BBOX min   :', box.min.x.toFixed(3), box.min.y.toFixed(3), box.min.z.toFixed(3));
  console.log('BBOX max   :', box.max.x.toFixed(3), box.max.y.toFixed(3), box.max.z.toFixed(3));

  // strip the ':' like GLTFLoader does
  const fixName = (n: string) => n.replace(/:/g, '');
  const names = [
    'mixamorigHips_01',
    'mixamorigLeftUpLeg_045', 'mixamorigLeftLeg_046', 'mixamorigLeftFoot_047', 'mixamorigLeftToeBase_048',
    'mixamorigRightUpLeg_049', 'mixamorigRightLeg_050', 'mixamorigRightFoot_051', 'mixamorigRightToeBase_052',
    'mixamorigLeftArm_08', 'mixamorigLeftForeArm_09', 'mixamorigLeftHand_010',
    'mixamorigRightArm_027', 'mixamorigRightForeArm_028', 'mixamorigRightHand_029',
    'mixamorigSpine1_03', 'mixamorigSpine2_04', 'mixamorigNeck_05', 'mixamorigHead_06',
  ];
  const tmpQ = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const up = new THREE.Vector3();
  for (const raw of names) {
    // GLTFLoader strips ':' from node names; our GLB names have no colons anyway
    let b = scene.getObjectByName(raw);
    if (!b) {
      // try to find by suffix
      const suffix = raw.split('_').pop();
      b = scene.getObjectByName(raw) ?? null;
      if (!b) {
        console.log(`MISSING bone ${raw}`);
        continue;
      }
    }
    tmpQ.setFromRotationMatrix(b.matrixWorld);
    tmpE.setFromQuaternion(tmpQ, 'YXZ');
    // direction the bone's -Y (bone axis, typically toward child) points in world
    up.set(0, -1, 0).applyQuaternion(tmpQ);
    console.log(
      `${raw}: localRot=(${b.rotation.x.toFixed(3)}, ${b.rotation.y.toFixed(3)}, ${b.rotation.z.toFixed(3)})`,
      `worldYXZ=(${tmpE.x.toFixed(3)}, ${tmpE.y.toFixed(3)}, ${tmpE.z.toFixed(3)})`,
      `axis-Y dir=(${up.x.toFixed(2)}, ${up.y.toFixed(2)}, ${up.z.toFixed(2)})`,
      `pos=(${b.position.x.toFixed(3)}, ${b.position.y.toFixed(3)}, ${b.position.z.toFixed(3)})`,
    );
  }

  // print all bone-ish names to verify the map
  const boneNames: string[] = [];
  scene.traverse((o) => { if ((o as THREE.Bone).isBone) boneNames.push(o.name); });
  console.log('\nBONE COUNT:', boneNames.length);
  console.log('FIRST 30 BONES:', boneNames.slice(0, 30).join(', '));
  process.exit(0);
}, (err) => {
  console.error('PARSE ERROR', err);
  process.exit(1);
});
