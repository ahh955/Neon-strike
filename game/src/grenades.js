// Grenades: thrown with G, they arc with gravity, bounce once off the world
// with a damped reflection, then detonate after a 1.6 s fuse — a flash, a
// ring of sparks and radius damage that falls off with distance. A thrown
// grenade is a small dark sphere with a blinking light.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { overlapsBox } from './physics.js';

const FUSE = 1.6;
const BLAST_RADIUS = 6;
const BLAST_DAMAGE = 120;
const GRAVITY = 14;

export function createGrenades(scene, world, random) {
  const live = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkMetal), roughness: 0.4, metalness: 0.7 });
  const lightMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.red), emissive: new THREE.Color(PALETTE.red), emissiveIntensity: 3 });

  function throwGrenade(from, velocity) {
    const mesh = new THREE.Mesh(geo, mat);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), lightMat);
    light.position.set(0, 0.08, 0);
    mesh.add(light);
    mesh.position.copy(from);
    mesh.castShadow = true;
    scene.add(mesh);
    live.push({ mesh, velocity: velocity.clone(), fuse: FUSE, bounced: false });
  }

  // Steps all live grenades. Returns the explosions that went off this step
  // ({ position }), so main.js can apply damage and spawn effects.
  function step(dt) {
    const explosions = [];
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.velocity.y -= GRAVITY * dt;
      const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
      const hit = overlapsBox(next.x, next.y - 0.09, next.z, 0.09, 0.18, 0, world.colliders);
      if (hit) {
        if (!g.bounced) {
          g.bounced = true;
          // Reflect the dominant velocity component, damped.
          if (Math.abs(g.velocity.y) > Math.abs(g.velocity.x) && Math.abs(g.velocity.y) > Math.abs(g.velocity.z)) {
            g.velocity.y = Math.abs(g.velocity.y) * 0.45;
            next.y = hit.max.y + 0.1;
          } else if (Math.abs(g.velocity.x) > Math.abs(g.velocity.z)) {
            g.velocity.x *= -0.4;
          } else {
            g.velocity.z *= -0.4;
          }
        } else {
          g.velocity.set(0, 0, 0);
          next.copy(g.mesh.position);
        }
      }
      if (next.y < 0.09) {
        next.y = 0.09;
        g.velocity.y = Math.abs(g.velocity.y) * 0.4;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      g.mesh.position.copy(next);
      g.mesh.rotation.x += dt * 9;
      if (g.fuse <= 0) {
        explosions.push({ position: g.mesh.position.clone() });
        scene.remove(g.mesh);
        live.splice(i, 1);
      }
    }
    return explosions;
  }

  function blastDamage(distance) {
    if (distance > BLAST_RADIUS) return 0;
    return Math.round(BLAST_DAMAGE * (1 - (distance / BLAST_RADIUS) * 0.75));
  }

  return {
    throwGrenade,
    step,
    blastDamage,
    blastRadius: BLAST_RADIUS,
    clear() {
      for (const g of live) scene.remove(g.mesh);
      live.length = 0;
    },
  };
}
