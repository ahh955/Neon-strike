// Shared collision: every solid in the world is an axis-aligned box, and
// every body (the player and every bot) moves as a vertical capsule
// approximated by a box, resolved one axis at a time so a wall never swallows
// a body and a body can stand on a crate. One module, used by both.
import * as THREE from 'three';

const probe = new THREE.Box3();

export function overlapsBox(x, y, z, radius, height, lift, colliders) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) {
    if (probe.intersectsBox(collider)) return collider;
  }
  return null;
}

// Moves `body` (position + velocity Vector3s, onGround flag) by dt.
// Returns nothing; mutates body in place. No allocation in the hot path.
export function moveBody(body, dt, radius, height, colliders, gravity = 20) {
  body.velocity.y -= gravity * dt;
  const nextX = body.position.x + body.velocity.x * dt;
  if (!overlapsBox(nextX, body.position.y, body.position.z, radius, height, 0.04, colliders)) {
    body.position.x = nextX;
  } else {
    body.velocity.x = 0;
  }
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!overlapsBox(body.position.x, body.position.y, nextZ, radius, height, 0.04, colliders)) {
    body.position.z = nextZ;
  } else {
    body.velocity.z = 0;
  }
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = overlapsBox(body.position.x, body.position.y, body.position.z, radius, height, 0, colliders);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

// Line of sight between two points: true when no world box blocks the ray.
// Uses a shared raycaster and a preallocated direction vector.
const losRay = new THREE.Raycaster();
const losDir = new THREE.Vector3();

export function hasLineOfSight(from, to, shootables) {
  losDir.subVectors(to, from);
  const distance = losDir.length();
  if (distance < 0.001) return true;
  losDir.divideScalar(distance);
  losRay.set(from, losDir);
  losRay.far = distance - 0.05;
  return losRay.intersectObjects(shootables, false).length === 0;
}
