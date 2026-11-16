// The map: "Neon Yard", an original dusk industrial yard, 70 x 52 m.
// Two bombsites (A in the north-west courtyard, B in the south-east
// warehouse), three lanes between the spawns (west, mid container canyon,
// east), a climbable control tower at the centre, and crates, barrels and
// containers for cover. Every solid is an axis-aligned box: the same box is
// a collider for bodies and a surface a bullet stops on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createTextures } from './textures.js';

export const SITES = [
  { id: 'A', center: { x: -22, z: -16 }, radius: 6, color: PALETTE.cyan },
  { id: 'B', center: { x: 22, z: 14 }, radius: 6, color: PALETTE.magenta },
];

export const SPAWNS = {
  // Yaw 0 faces north (-z), PI faces south: Vipers spawn south and look
  // north up the map, Jackals spawn north and look south.
  vipers: [
    { x: -28, z: 18, yaw: 0 },
    { x: -26, z: 20.5, yaw: 0 },
    { x: -30, z: 15.5, yaw: 0 },
    { x: -25.5, z: 15, yaw: Math.PI * 0.15 },
  ],
  jackals: [
    { x: 28, z: -18, yaw: Math.PI },
    { x: 26, z: -20.5, yaw: Math.PI },
    { x: 30, z: -15.5, yaw: Math.PI },
    { x: 25.5, z: -15, yaw: Math.PI * 0.85 },
  ],
};

// Named waypoint nodes; routes are lists of node ids, so a bot's whole plan
// is one array it walks in order.
export const NODES = {
  a0: [-28, 18], a1: [-26, 10], a2: [-25, 0], a3: [-24, -8], a4: [-22, -14],
  m0: [-16, 14], m1: [-8, 8], m2: [-2, 2], m3: [2, -4], m4: [6, -10], m5: [12, -14],
  e0: [-10, 18], e1: [0, 18], e2: [10, 16], e3: [16, 14], e4: [22, 14],
  d0: [28, -18], d1: [20, -16], d2: [10, -16], d3: [0, -16], d4: [-10, -16],
  d5: [16, -8], d6: [8, -2], d7: [2, 4],
  d8: [26, -8], d9: [24, 2], d10: [22, 8],
};

export const ROUTES = {
  rushA: ['a0', 'a1', 'a2', 'a3', 'a4'],
  rushB: ['a0', 'e0', 'e1', 'e2', 'e3', 'e4'],
  midPush: ['a0', 'm0', 'm1', 'm2', 'm3', 'm4', 'm5'],
  defA: ['d0', 'd1', 'd2', 'd3', 'd4', 'a4'],
  defB: ['d0', 'd8', 'd9', 'd10', 'e4'],
  defMid: ['d0', 'd5', 'd6', 'd7', 'm2'],
};

// Hold spots: where a bot stops and watches when its route ends.
export const HOLDS = {
  A: [
    { x: -25.5, z: -18.5, yaw: -Math.PI / 2 },
    { x: -19, z: -13, yaw: Math.PI },
    { x: -22, z: -19.5, yaw: Math.PI },
  ],
  B: [
    { x: 19, z: 11, yaw: Math.PI / 2 },
    { x: 25, z: 17, yaw: 0 },
    { x: 22, z: 10, yaw: Math.PI / 2 },
  ],
  mid: [
    { x: 6, z: -10, yaw: Math.PI },
    { x: -4, z: 2, yaw: 0 },
    { x: 0, z: 0, yaw: Math.PI * 0.5 },
  ],
};

export function createWorld(scene, random) {
  const textures = createTextures(random);
  const group = new THREE.Group();
  scene.add(group);

  const matFloor = new THREE.MeshStandardMaterial({ map: textures.floor, roughness: 0.95, metalness: 0.02 });
  const matWall = new THREE.MeshStandardMaterial({ map: textures.wall, roughness: 0.9, metalness: 0.05 });
  const matMetal = new THREE.MeshStandardMaterial({ map: textures.metal, roughness: 0.6, metalness: 0.45 });
  const matCrate = new THREE.MeshStandardMaterial({ map: textures.crate, roughness: 0.85, metalness: 0.02 });
  const matDark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkMetal), roughness: 0.8, metalness: 0.3 });
  const matHazard = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8, metalness: 0.1 });
  const matCyan = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.cyan), emissive: new THREE.Color(PALETTE.cyan), emissiveIntensity: 2.2, roughness: 0.4 });
  const matMagenta = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.magenta), emissive: new THREE.Color(PALETTE.magenta), emissiveIntensity: 2.2, roughness: 0.4 });
  const matAmber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.amber), emissive: new THREE.Color(PALETTE.amber), emissiveIntensity: 2.0, roughness: 0.4 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(r, h, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), material);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and perimeter: 70 x 52 m, 5 m walls, open to the dusk sky.
  box(70.6, 0.4, 52.6, 0, -0.2, 0, matFloor);
  box(0.6, 5, 52.6, -35.3, 2.5, 0, matWall);
  box(0.6, 5, 52.6, 35.3, 2.5, 0, matWall);
  box(70.6, 5, 0.6, 0, 2.5, -26.3, matWall);
  box(70.6, 5, 0.6, 0, 2.5, 26.3, matWall);

  // Neon guide strips along the top of the west (cyan) and east (magenta) walls.
  box(0.2, 0.18, 40, -34.9, 4.6, 0, matCyan, false);
  box(0.2, 0.18, 40, 34.9, 4.6, 0, matMagenta, false);

  // --- Site A courtyard (north-west): low walls with two gaps. ---
  box(9.6, 1.2, 0.5, -23.2, 0.6, -10.2, matWall); // south wall, gap at x -18.4..-15.8
  box(0.5, 1.2, 7, -15.8, 0.6, -18.5, matWall); // east wall, gap at z -15..-11
  box(0.5, 1.2, 1, -15.8, 0.6, -10.5, matWall);
  box(12, 1.2, 0.5, -22, 0.6, -21.8, matWall); // north wall
  box(0.5, 1.2, 12, -28.2, 0.6, -16, matWall); // west wall

  // --- Site B warehouse (south-east): a big room with two door gaps. ---
  box(5.5, 4.4, 0.5, 17.2, 2.2, 7.8, matMetal); // north wall, door x 19.9..23
  box(6.5, 4.4, 0.5, 26.2, 2.2, 7.8, matMetal);
  box(0.5, 4.4, 4.5, 13.8, 2.2, 10.2, matMetal); // west wall, door z 12.4..15.5
  box(0.5, 4.4, 4.5, 13.8, 2.2, 17.7, matMetal);
  box(16, 4.4, 0.5, 22, 2.2, 20.2, matMetal); // south wall
  box(0.5, 4.4, 12, 30.2, 2.2, 14, matMetal); // east wall

  // --- Mid container canyon: staggered containers force a zigzag. ---
  box(2.4, 2.6, 6, -4, 1.3, 10, matMetal);
  box(2.4, 2.6, 6, 4, 1.3, 2, matMetal);
  box(2.4, 2.6, 6, -4, 1.3, -6, matMetal);
  box(2.4, 2.6, 6, 4, 1.3, -14, matMetal);
  box(2.4, 2.6, 6, -4, 3.9, 10, matMetal); // one stacked pair

  // --- Control tower at the centre: 1.8 m platform, climbed via a crate. ---
  box(6, 1.8, 6, 0, 0.9, 0, matDark);
  box(6, 0.12, 6, 0, 1.86, 0, matHazard, false);
  box(0.9, 0.9, 0.9, 3.6, 0.45, 2.4, matCrate);
  box(0.9, 0.9, 0.9, -3.6, 0.45, -2.4, matCrate);

  // --- Cover: crates and barrels at lane corners and sightlines. ---
  const crates = [
    [-20, 6, 0.9], [-20, 6.9, 0.9], [-12, -2, 0.9], [12, 6, 0.9], [12, 6.9, 0.9],
    [-26, -4, 0.9], [24, -6, 0.9], [18, -12, 0.9], [-14, 18, 0.9], [6, 20, 0.9],
    [-18, -13, 0.9], [18, 11, 0.9], [26, 17, 0.9], [-26, -19, 0.9], [8, -18, 0.9],
    [-8, -14, 0.9], [20, 2, 0.9], [-30, 8, 0.9], [30, -8, 0.9],
  ];
  for (const [x, z, s] of crates) box(s, s, s, x, s / 2, z, matCrate);
  // Two-high stacks.
  box(0.9, 0.9, 0.9, -20, 1.35, 6, matCrate);
  box(0.9, 0.9, 0.9, 12, 1.35, 6, matCrate);
  box(0.9, 0.9, 0.9, 18, 1.35, 11, matCrate);

  const barrels = [
    [-24, 2], [24, -12], [0, 12], [-8, -20], [16, 20], [-28, -12], [28, 6], [2, -20],
  ];
  for (const [x, z] of barrels) cylinder(0.45, 1.1, x, z, matDark);

  // --- Site markers: glowing ground rings and letter signs on posts. ---
  for (const site of SITES) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center.x, 0.03, site.center.z);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.center.x, 0.03, site.center.z);
    group.add(disc);
    const post = box(0.25, 3.4, 0.25, site.center.x + 2.6, 1.7, site.center.z - 2.6, matDark);
    post.castShadow = true;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: site.id === 'A' ? textures.signA : textures.signB, transparent: true }),
    );
    sign.position.set(site.center.x + 2.6, 3.6, site.center.z - 2.6);
    sign.rotation.y = Math.PI / 4;
    group.add(sign);
  }

  // --- Light poles: two sodium mids, one cyan at A, one magenta at B. ---
  function pole(x, z, color, intensity) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 10), matDark);
    p.position.set(x, 2.7, z);
    p.castShadow = true;
    group.add(p);
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 2.4 }),
    );
    head.position.set(x, 5.4, z);
    group.add(head);
    const light = new THREE.PointLight(new THREE.Color(color), intensity, 26, 1.6);
    light.position.set(x, 5.2, z);
    scene.add(light);
  }
  pole(-14, 0, PALETTE.amber, 90);
  pole(14, 0, PALETTE.amber, 90);
  pole(-22, -16, PALETTE.cyan, 70);
  pole(22, 14, PALETTE.magenta, 70);

  // --- Dusk lighting: a low warm sun, a cool sky/ground gradient. ---
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7bd8'), new THREE.Color('#1c1a26'), 1.05);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb26b'), 2.6);
  sun.position.set(-28, 26, 20);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 36;
  sun.shadow.camera.bottom = -36;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const moonFill = new THREE.DirectionalLight(new THREE.Color('#6f7fd6'), 0.5);
  moonFill.position.set(24, 18, -22);
  scene.add(moonFill);

  return { colliders, shootables, group, textures };
}
