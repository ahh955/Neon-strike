// The player body: acceleration, friction, gravity, crouch and jump, moved
// by the shared physics module against the world's colliders. Health and
// armor live here too; damage halves through armor until the armor is gone.
import * as THREE from 'three';
import { moveBody, overlapsBox } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.4;
const SHIFT_SPEED = 2.6;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 7.0;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: 100,
    armor: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys, frozen) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching && !overlapsBox(state.position.x, state.position.y, state.position.z, RADIUS, STAND_HEIGHT, 0.02, colliders)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = frozen ? 0 : (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = frozen ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = state.crouching ? CROUCH_SPEED : walking ? SHIFT_SPEED : WALK_SPEED;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    state.velocity.x += (wish.x * speed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * speed - state.velocity.z) * blend;
    if (state.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }
    if (keys.has('Space') && state.onGround && !frozen) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    moveBody(state, dt, RADIUS, state.height, colliders, GRAVITY);
  }

  // Returns the damage actually taken after armor.
  function damage(amount) {
    if (!state.alive) return 0;
    let remaining = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, Math.ceil(amount / 2));
      state.armor -= absorbed;
      remaining = amount - absorbed;
    }
    state.health = Math.max(0, state.health - remaining);
    if (state.health === 0) state.alive = false;
    return remaining;
  }

  function reset(x, z, yaw) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    state.health = 100;
    state.alive = true;
    state.crouching = false;
    state.height = STAND_HEIGHT;
    state.eye = STAND_EYE;
  }

  return {
    state,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
  };
}
