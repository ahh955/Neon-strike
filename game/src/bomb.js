// The charge: one bomb per round, carried by a Viper, planted at site A or
// B with a 3.5 s channel, then 35 s on the clock while it beeps faster and
// faster. Defenders defuse with a 5 s channel; taking damage breaks any
// channel. The bomb is a small blinking device on the ground.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './world.js';

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const BOMB_TIMER = 35;

export function createBomb(scene, textures) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkMetal), roughness: 0.5, metalness: 0.6 }),
  );
  body.position.y = 0.11;
  const lightMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.06, 0.1),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.red), emissive: new THREE.Color(PALETTE.red), emissiveIntensity: 3 }),
  );
  lightMesh.position.set(0.1, 0.24, 0);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.4, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.metal), roughness: 0.4, metalness: 0.7 }),
  );
  antenna.position.set(-0.15, 0.4, 0);
  group.add(body, lightMesh, antenna);
  group.visible = false;
  scene.add(group);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: textures.glow, color: new THREE.Color(PALETTE.red), transparent: true, opacity: 0.0, depthWrite: false,
  }));
  glow.scale.set(1.6, 1.6, 1);
  glow.position.y = 0.5;
  group.add(glow);

  const state = {
    status: 'carried', // carried | dropped | planted | exploded | defused
    carrier: null, // { kind: 'player' } or { kind: 'bot', bot }
    site: null,
    position: new THREE.Vector3(),
    timer: BOMB_TIMER,
    lastBeep: 0,
  };

  return {
    state,
    group,
    reset(carrier) {
      state.status = 'carried';
      state.carrier = carrier;
      state.site = null;
      state.timer = BOMB_TIMER;
      state.lastBeep = 0;
      group.visible = false;
      glow.material.opacity = 0;
    },
    dropAt(position) {
      state.status = 'dropped';
      state.carrier = null;
      state.position.copy(position);
      state.position.y = 0;
      group.position.copy(state.position);
      group.visible = true;
      glow.material.opacity = 0.25;
    },
    plant(site) {
      state.status = 'planted';
      state.carrier = null;
      state.site = site;
      state.timer = BOMB_TIMER;
      state.position.set(site.center.x, 0, site.center.z);
      group.position.copy(state.position);
      group.visible = true;
      glow.material.opacity = 0.5;
    },
    siteAt(x, z) {
      for (const site of SITES) {
        const d = Math.hypot(x - site.center.x, z - site.center.z);
        if (d <= site.radius) return site;
      }
      return null;
    },
    // Ticks the planted timer. Returns 'explode' when it runs out, and
    // calls onBeep(fast) on each beep so main.js can play the sound.
    step(dt, time, onBeep) {
      if (state.status !== 'planted') return null;
      state.timer -= dt;
      const fast = state.timer < 10;
      const interval = fast ? 0.25 : state.timer < 20 ? 0.5 : 1;
      if (time - state.lastBeep >= interval) {
        state.lastBeep = time;
        onBeep(fast);
      }
      lightMesh.material.emissiveIntensity = 1.5 + Math.sin(time * (fast ? 18 : 8)) * 1.5;
      glow.material.opacity = 0.3 + Math.sin(time * (fast ? 18 : 8)) * 0.2;
      if (state.timer <= 0) {
        state.status = 'exploded';
        return 'explode';
      }
      return null;
    },
  };
}
