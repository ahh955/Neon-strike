// Weapons: four guns plus a grenade, each with its own numbers. Spread is
// the heart of the gunplay: a still, crouched player shoots tight groups,
// while moving or spraying opens the cone up — stopping to aim pays.
// The view model (the gun in the player's hands) lives here too, with its
// muzzle flash; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'VK-9 Sidearm', short: 'VK-9', price: 0, slot: 'side',
    damage: 34, headMult: 3, fireGap: 0.17, mag: 12, reserveMax: 48,
    reloadTime: 1.5, spreadStill: 0.0025, spreadMove: 0.024, bloom: 0.004,
    kick: 0.008, auto: false, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Kestrel', short: 'AR-77', price: 2700, slot: 'main',
    damage: 30, headMult: 3, fireGap: 0.096, mag: 30, reserveMax: 90,
    reloadTime: 1.9, spreadStill: 0.0022, spreadMove: 0.03, bloom: 0.0035,
    kick: 0.009, auto: true, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'Raptor-9', short: 'R-9', price: 1200, slot: 'main',
    damage: 22, headMult: 3, fireGap: 0.07, mag: 32, reserveMax: 96,
    reloadTime: 1.7, spreadStill: 0.004, spreadMove: 0.036, bloom: 0.003,
    kick: 0.006, auto: true, zoom: 1,
  },
  sniper: {
    id: 'sniper', name: 'Longbow .50', short: 'LB-50', price: 4750, slot: 'main',
    damage: 110, headMult: 2, fireGap: 1.25, mag: 5, reserveMax: 15,
    reloadTime: 2.6, spreadStill: 0.0004, spreadMove: 0.06, bloom: 0.02,
    kick: 0.045, auto: false, zoom: 2.6,
  },
};

export const GRENADE = { id: 'grenade', name: 'HE Spark', price: 300 };
export const ARMOR = { id: 'armor', name: 'Kevlar Vest', price: 650 };

const MOVE_REFERENCE = 5.4;
const BLOOM_DECAY = 2.2;
const MUZZLE_TIME = 0.06;

export function createArsenal(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkMetal), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7d8190'), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cyan), emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 0.6, roughness: 0.4 });

  const models = {};
  function buildModel(def) {
    const model = new THREE.Group();
    const long = def.id === 'sniper' ? 0.62 : def.id === 'rifle' ? 0.42 : def.id === 'smg' ? 0.34 : 0.24;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, long), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, long * 0.9), grip);
    barrel.position.set(0, 0.03, -long * 0.85);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
    stock.position.set(0, -0.02, long * 0.55);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, long * 0.6), accent);
    stripe.position.set(0, 0.055, -long * 0.1);
    model.add(receiver, barrel, stock, stripe);
    if (def.id === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), grip);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.1, -0.05);
      model.add(scope);
    }
    if (def.id === 'pistol') {
      const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), grip);
      gripMesh.position.set(0, -0.1, 0.06);
      gripMesh.rotation.x = 0.25;
      model.add(gripMesh);
    }
    model.position.set(0.22, -0.23, -0.48);
    model.scale.setScalar(0.72);
    model.visible = false;
    camera.add(model);
    return model;
  }
  for (const def of Object.values(WEAPONS)) models[def.id] = buildModel(def);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.22, -0.2, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color('#ffb26b'), 0, 6);
  flashLight.position.set(0.22, -0.18, -0.7);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    mag: { pistol: 12, rifle: 30, smg: 32, sniper: 5 },
    reserve: { pistol: 48, rifle: 0, smg: 0, sniper: 0 },
    owned: { pistol: true, rifle: false, smg: false, sniper: false },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    grenades: 0,
    scoped: false,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.bloom = Math.max(0, state.bloom - BLOOM_DECAY * dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.48 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.scoped && def().zoom > 1) {
      model.position.set(0, -0.15, -0.4);
      model.rotation.x = 0;
    } else {
      model.position.set(0.22, -0.23, -0.48 + state.kick);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 22 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag[state.current];
        const take = Math.min(need, state.reserve[state.current]);
        state.mag[state.current] += take;
        state.reserve[state.current] -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      const d = def();
      state.cooldown = d.fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = d.id === 'sniper' ? 0.14 : 0.055;
      state.bloom = Math.min(0.05, state.bloom + d.bloom);
    },
    takeRound() {
      if (state.mag[state.current] <= 0) return false;
      state.mag[state.current] -= 1;
      return true;
    },
    reload() {
      const d = def();
      if (state.reloadLeft > 0 || state.mag[state.current] === d.mag || state.reserve[state.current] === 0) return false;
      state.reloadLeft = d.reloadTime;
      return true;
    },
    spread(speed, crouching) {
      const d = def();
      const move = Math.min(1, speed / MOVE_REFERENCE) * d.spreadMove;
      const still = d.spreadStill * (crouching ? 0.7 : 1) * (state.scoped ? 0.25 : 1);
      return still + move + state.bloom;
    },
    switchTo(id) {
      if (!state.owned[id] || id === state.current) return false;
      models[state.current].visible = false;
      state.current = id;
      state.scoped = false;
      state.reloadLeft = 0;
      models[id].visible = true;
      return true;
    },
    buy(id) {
      const d = WEAPONS[id];
      if (!d || state.owned[id]) return false;
      state.owned[id] = true;
      state.reserve[id] = d.reserveMax;
      state.mag[id] = d.mag;
      this.switchTo(id);
      return true;
    },
    refillAmmo() {
      for (const id of Object.keys(state.mag)) {
        if (state.owned[id]) state.reserve[id] = WEAPONS[id].reserveMax;
      }
    },
    resetRound() {
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.bloom = 0;
      state.scoped = false;
    },
  };
}

// Damage at range: full damage to 25 m, then a straight falloff to 60%.
export function damageAtRange(base, distance) {
  if (distance <= 25) return base;
  const t = Math.min(1, (distance - 25) / 35);
  return Math.round(base * (1 - 0.4 * t));
}
