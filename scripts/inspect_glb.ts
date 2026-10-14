// inspect_glb.ts — dump skeleton/skins/animations of a GLB via three GLTFLoader (headless)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'fs';

const file = process.argv[2];
const buf = readFileSync(file);
const loader = new GLTFLoader();

loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  console.log('=== ROOT ===');
  console.log('name:', scene.name, '| children:', scene.children.length);
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  console.log('bbox size:', size.x.toFixed(2), size.y.toFixed(2), size.z.toFixed(2));
  console.log('bbox min:', box.min.x.toFixed(2), box.min.y.toFixed(2), box.min.z.toFixed(2));

  console.log('\n=== MESHES ===');
  let meshCount = 0, triCount = 0;
  scene.traverse((o: any) => {
    if (o.isMesh) {
      meshCount++;
      const g = o.geometry as THREE.BufferGeometry;
      const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      triCount += tris;
      const mat = Array.isArray(o.material) ? o.material[0] : o.material;
      console.log(`mesh "${o.name}" tris=${Math.round(tris)} mat="${mat?.name ?? '?'}" map=${mat?.map ? 'Y' : 'N'} nrm=${mat?.normalMap ? 'Y' : 'N'}`);
    }
  });
  console.log(`total meshes: ${meshCount}, total tris: ${Math.round(triCount)}`);

  console.log('\n=== BONES (first 60) ===');
  const bones: string[] = [];
  scene.traverse((o: any) => { if (o.isBone) bones.push(o.name); });
  console.log('bone count:', bones.length);
  console.log(bones.slice(0, 60).join(', '));

  console.log('\n=== ANIMATIONS ===');
  console.log('clip count:', gltf.animations.length);
  for (const clip of gltf.animations) {
    const dur = clip.duration.toFixed(2);
    console.log(`clip "${clip.name}" dur=${dur}s tracks=${clip.tracks.length}`);
  }
}, (err) => {
  console.error('PARSE ERROR:', err);
  process.exit(1);
});
