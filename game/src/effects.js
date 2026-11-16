// Combat feedback: tracer lines for every shot, spark bursts on hits and
// a big flash + shockwave ring on explosions. All effects are pooled and
// reused — nothing is allocated per frame in the hot loops. A tracer is a
// thin glowing cylinder: unlike a plane it looks the same from every
// angle, so a shot fired at the camera never becomes a wall of light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const TRACER_LIFE = 0.07;
const MAX_SPARKS = 240;

export function createEffects(scene, textures) {
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 5), mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color('#ffcf7d'), size: 0.09, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, map: textures.glow,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkIndex = 0;

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures.glow, color: new THREE.Color('#ffdf9e'), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.scale.set(8, 8, 1);
  scene.add(flash);
  let flashLife = 0;
  const flashLight = new THREE.PointLight(new THREE.Color('#ffb26b'), 0, 30, 1.5);
  scene.add(flashLight);

  const up = new THREE.Vector3(0, 1, 0);
  const mid = new THREE.Vector3();
  const delta = new THREE.Vector3();

  function spawnSparks(position, count, speed, spreadY = 1) {
    for (let n = 0; n < count; n += 1) {
      const i = sparkIndex;
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      sparkPos[i * 3] = position.x;
      sparkPos[i * 3 + 1] = position.y;
      sparkPos[i * 3 + 2] = position.z;
      const a = (n / count) * Math.PI * 2 + (i % 7) * 0.7;
      const r = speed * (0.4 + ((i * 37) % 10) / 16);
      sparkVel[i * 3] = Math.cos(a) * r;
      sparkVel[i * 3 + 1] = speed * spreadY * (0.3 + ((i * 13) % 10) / 14);
      sparkVel[i * 3 + 2] = Math.sin(a) * r;
      sparkLife[i] = 0.35 + ((i * 11) % 10) / 28;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  }

  return {
    tracer(from, to, color) {
      const t = tracers[tracerIndex];
      tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
      delta.subVectors(to, from);
      const length = delta.length();
      if (length < 0.5) return;
      mid.addVectors(from, to).multiplyScalar(0.5);
      t.mesh.position.copy(mid);
      t.mesh.scale.set(1, length, 1);
      t.mesh.quaternion.setFromUnitVectors(up, delta.normalize());
      t.mesh.material.color.set(color);
      t.mesh.material.opacity = 0.85;
      t.mesh.visible = true;
      t.life = TRACER_LIFE;
    },
    hitSparks(position, count = 8) {
      spawnSparks(position, count, 3.2);
    },
    explosion(position) {
      flash.position.copy(position).setY(position.y + 1.2);
      flash.material.opacity = 1;
      flashLife = 0.5;
      flashLight.position.copy(position).setY(position.y + 1.5);
      flashLight.intensity = 900;
      spawnSparks(position, 90, 9, 1.4);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
        else t.mesh.material.opacity = (t.life / TRACER_LIFE) * 0.85;
      }
      let anyAlive = false;
      for (let i = 0; i < MAX_SPARKS; i += 1) {
        if (sparkLife[i] <= 0) continue;
        anyAlive = true;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 12 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) {
          sparkPos[i * 3 + 1] = 0.02;
          sparkVel[i * 3 + 1] *= -0.4;
        }
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = -100;
      }
      if (anyAlive) sparkGeo.attributes.position.needsUpdate = true;
      if (flashLife > 0) {
        flashLife -= dt;
        flash.material.opacity = Math.max(0, flashLife / 0.5);
        flashLight.intensity = Math.max(0, (flashLife / 0.5) * 900);
        flash.scale.setScalar(8 + (0.5 - Math.max(0, flashLife)) * 14);
      } else {
        flashLight.intensity = 0;
      }
    },
  };
}
