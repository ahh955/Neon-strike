// Bots: three Viper teammates and four Jackal enemies. Each bot walks a
// waypoint route, watches for enemies with a real line-of-sight test, fires
// aimed bursts when it sees one, hears nearby gunshots and investigates,
// and plays the objective: the carrier plants, the defenders defuse.
// A bot is a box-built soldier with invisible hitboxes (torso + head) that
// the same raycast as the player's bullets tests.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { moveBody, hasLineOfSight } from './physics.js';
import { range, pick } from './rng.js';
import { NODES } from './world.js';

const BOT_SPEED = 4.3;
const BOT_RADIUS = 0.34;
const BOT_HEIGHT = 1.72;
const EYE_HEIGHT = 1.55;
const PERCEIVE_EVERY = 0.12;
const VIEW_DISTANCE = 48;
const HEAR_DISTANCE = 28;
const BURST_MIN = 3;
const BURST_MAX = 5;
const BOT_DAMAGE = 26;
const BOT_HEAD_MULT = 3;
const BOT_FIRE_GAP = 0.12;

const TEAM_COLOR = { vipers: PALETTE.cyan, jackals: PALETTE.amber };
const NAMES = {
  vipers: ['Rook', 'Vex', 'Nova'],
  jackals: ['Fang', 'Havoc', 'Ridge', 'Onyx'],
};

const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true });

function buildSoldier(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'vipers' ? '#1f3a44' : '#453219'), roughness: 0.85, metalness: 0.05 });
  const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'vipers' ? '#123040' : '#3d2c12'), roughness: 0.7, metalness: 0.15 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.8 });
  const teamGlow = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM_COLOR[team]), emissive: new THREE.Color(TEAM_COLOR[team]), emissiveIntensity: 1.6 });
  const gunMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.darkMetal), roughness: 0.5, metalness: 0.5 });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.22), suit);
  legL.position.set(-0.12, 0.39, 0);
  const legR = legL.clone();
  legR.position.x = 0.12;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.32), suit);
  torso.position.y = 1.1;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.36), vest);
  plate.position.y = 1.14;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.36), teamGlow);
  band.position.y = 1.32;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.y = 1.62;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.05), teamGlow);
  visor.position.set(0, 1.64, -0.16);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), vest);
  helmet.position.y = 1.8;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.62), gunMat);
  gun.position.set(0.18, 1.28, -0.34);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.14), suit);
  armL.position.set(-0.32, 1.18, -0.1);
  armL.rotation.x = -0.7;
  const armR = armL.clone();
  armR.position.set(0.32, 1.18, -0.14);
  group.add(legL, legR, torso, plate, band, head, visor, helmet, gun, armL, armR);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // Invisible hitboxes: the raycast tests these, never the visuals.
  const torsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.5, 0.42), hitMaterial);
  torsoHit.position.y = 0.85;
  const headHit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), hitMaterial);
  headHit.position.y = 1.66;
  group.add(torsoHit, headHit);
  return { group, legL, legR, torsoHit, headHit };
}

export function createBots(scene, world, random, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const dir = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const chest = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  const bots = [];
  const hitMeshes = [];

  for (const team of ['vipers', 'jackals']) {
    for (const name of NAMES[team]) {
      const parts = buildSoldier(team);
      scene.add(parts.group);
      const bot = {
        name,
        team,
        skill: range(random, 0.6, 0.92),
        health: 100,
        alive: true,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        onGround: true,
        yaw: 0,
        group: parts.group,
        legL: parts.legL,
        legR: parts.legR,
        route: [],
        routeIndex: 0,
        hold: null,
        role: 'rusher',
        state: 'route',
        target: null,
        targetLostAt: 0,
        perceiveAt: random() * PERCEIVE_EVERY,
        burstLeft: 0,
        burstPause: 0,
        fireAt: 0,
        alertPoint: null,
        alertUntil: 0,
        walkPhase: random() * 6,
        fall: 0,
        channel: 0,
        channelKind: null,
      };
      parts.torsoHit.userData.bot = bot;
      parts.torsoHit.userData.part = 'torso';
      parts.headHit.userData.bot = bot;
      parts.headHit.userData.part = 'head';
      hitMeshes.push(parts.torsoHit, parts.headHit);
      bots.push(bot);
    }
  }

  function resolveRoute(route) {
    // A route mixes waypoint ids ('a4') and raw [x, z] points.
    return route.map((point) => (typeof point === 'string' ? NODES[point] : point));
  }

  function resetBot(bot, spawn, route, hold, role) {
    bot.position.set(spawn.x, 0, spawn.z);
    bot.velocity.set(0, 0, 0);
    bot.yaw = spawn.yaw;
    bot.health = 100;
    bot.alive = true;
    bot.route = resolveRoute(route);
    bot.routeIndex = 0;
    bot.hold = hold;
    bot.role = role;
    bot.state = 'route';
    bot.target = null;
    bot.burstLeft = 0;
    bot.burstPause = 0;
    bot.alertPoint = null;
    bot.channel = 0;
    bot.channelKind = null;
    bot.fall = 0;
    bot.group.visible = true;
    bot.group.rotation.set(0, bot.yaw, 0);
    bot.group.position.copy(bot.position);
  }

  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.position.x), -(z - bot.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function seek(bot, x, z, dt) {
    faceToward(bot, x, z, dt, 8);
    const dx = x - bot.position.x;
    const dz = z - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.4) {
      bot.velocity.x *= Math.max(0, 1 - 8 * dt);
      bot.velocity.z *= Math.max(0, 1 - 8 * dt);
      return true;
    }
    const speed = BOT_SPEED * Math.min(1, dist);
    bot.velocity.x += ((dx / dist) * speed - bot.velocity.x) * Math.min(1, dt * 8);
    bot.velocity.z += ((dz / dist) * speed - bot.velocity.z) * Math.min(1, dt * 8);
    return false;
  }

  function eyeOf(bot, out) {
    return out.set(bot.position.x, bot.position.y + EYE_HEIGHT, bot.position.z);
  }

  function chestOf(target, out) {
    if (target.kind === 'player') return out.set(target.pos.x, target.pos.y + 1.2, target.pos.z);
    return out.set(target.bot.position.x, target.bot.position.y + 1.2, target.bot.position.z);
  }

  function canSee(bot, target, time) {
    eyeOf(bot, eye);
    chestOf(target, chest);
    const dist = eye.distanceTo(chest);
    if (dist > VIEW_DISTANCE) return false;
    toTarget.subVectors(chest, eye).normalize();
    const forward = Math.sin(bot.yaw) * -toTarget.x + Math.cos(bot.yaw) * -toTarget.z;
    if (forward < 0.2 && time >= bot.alertUntil) return false;
    return hasLineOfSight(eye, chest, world.shootables);
  }

  function perceive(bot, enemies, time) {
    let best = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (!canSee(bot, enemy, time)) continue;
      const d = bot.position.distanceTo(enemy.kind === 'player' ? enemy.pos : enemy.bot.position);
      if (d < bestDist) {
        best = enemy;
        bestDist = d;
      }
    }
    if (best) {
      bot.target = best;
      bot.targetLostAt = 0;
      bot.state = 'engage';
    } else if (bot.target) {
      if (bot.targetLostAt === 0) bot.targetLostAt = time;
      else if (time - bot.targetLostAt > 2.5) {
        bot.target = null;
        bot.state = bot.routeIndex < bot.route.length ? 'route' : 'hold';
      }
    }
  }

  function shootAt(bot, time) {
    if (time < bot.fireAt) return;
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > time) return;
      bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
      bot.burstPause = 0;
    }
    bot.fireAt = time + BOT_FIRE_GAP;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) bot.burstPause = time + range(random, 0.35, 0.8);

    eyeOf(bot, eye);
    chestOf(bot.target, chest);
    const dist = eye.distanceTo(chest);
    const targetSpeed = bot.target.kind === 'player' ? bot.target.speed : Math.hypot(bot.target.bot.velocity.x, bot.target.bot.velocity.z);
    const error = (1 - bot.skill) * 0.055 + dist * 0.0009 + targetSpeed * 0.004;
    dir.subVectors(chest, eye).normalize();
    dir.x += (random() + random() + random() - 1.5) * error * 2;
    dir.y += (random() + random() + random() - 1.5) * error * 2;
    dir.z += (random() + random() + random() - 1.5) * error * 2;
    dir.normalize();
    muzzle.copy(eye).addScaledVector(dir, 0.7);
    raycaster.set(muzzle, dir);
    const hits = raycaster.intersectObjects(world.shootables.concat(hitMeshes).concat(hooks.playerHitMeshes()), false);
    const hit = hits[0];
    const end = hit ? hit.point : muzzle.clone().addScaledVector(dir, 60);
    hooks.tracer(muzzle, end, TEAM_COLOR[bot.team]);
    hooks.shotSound(bot.position, true);
    hooks.onGunshot(bot.position);
    if (hit && hit.object.userData.bot) {
      const victim = hit.object.userData.bot;
      if (victim.alive && victim.team !== bot.team) {
        const head = hit.object.userData.part === 'head';
        hooks.hit({ kind: 'bot', bot: victim }, BOT_DAMAGE * (head ? BOT_HEAD_MULT : 1), head ? 'head' : 'torso', bot);
      }
    } else if (hit && hit.object.userData.player) {
      const head = hit.object.userData.part === 'head';
      hooks.hit({ kind: 'player' }, BOT_DAMAGE * (head ? BOT_HEAD_MULT : 1), head ? 'head' : 'torso', bot);
    }
  }

  function stepBot(bot, dt, time, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      bot.group.position.y = -bot.fall * 0.1;
      return;
    }
    if (ctx.frozen) return;

    // Channeling a plant or a defuse roots the bot in place.
    if (bot.channelKind) {
      bot.channel += dt;
      const need = bot.channelKind === 'plant' ? 3.5 : 5;
      if (bot.channel >= need) hooks.channelDone(bot, bot.channelKind);
      return;
    }

    if (time >= bot.perceiveAt) {
      bot.perceiveAt = time + PERCEIVE_EVERY;
      perceive(bot, ctx.enemies(bot), time);
    }
    if (bot.target && !bot.target.alive) {
      bot.target = null;
      bot.state = bot.routeIndex < bot.route.length ? 'route' : 'hold';
    }

    if (bot.state === 'engage' && bot.target) {
      const targetPos = bot.target.kind === 'player' ? bot.target.pos : bot.target.bot.position;
      faceToward(bot, targetPos.x, targetPos.z, dt, 10);
      // Strafe slowly while fighting; never stand perfectly still.
      const strafeDir = Math.sin(time * 0.7 + bot.walkPhase) > 0 ? 1 : -1;
      bot.velocity.x += (Math.cos(bot.yaw) * strafeDir * 1.1 - bot.velocity.x) * Math.min(1, dt * 6);
      bot.velocity.z += (-Math.sin(bot.yaw) * strafeDir * 1.1 - bot.velocity.z) * Math.min(1, dt * 6);
      shootAt(bot, time);
    } else if (bot.alertPoint && time < bot.alertUntil) {
      if (seek(bot, bot.alertPoint.x, bot.alertPoint.z, dt)) {
        bot.alertPoint = null;
      }
    } else if (bot.routeIndex < bot.route.length) {
      const [x, z] = bot.route[bot.routeIndex];
      if (seek(bot, x, z, dt)) bot.routeIndex += 1;
    } else if (bot.hold) {
      if (Math.hypot(bot.position.x - bot.hold.x, bot.position.z - bot.hold.z) > 0.8) {
        seek(bot, bot.hold.x, bot.hold.z, dt);
      } else {
        faceToward(bot, bot.hold.x + Math.sin(bot.hold.yaw) * -2, bot.hold.z + Math.cos(bot.hold.yaw) * -2, dt, 3);
        bot.velocity.x *= Math.max(0, 1 - 8 * dt);
        bot.velocity.z *= Math.max(0, 1 - 8 * dt);
      }
    }

    moveBody(bot, dt, BOT_RADIUS, BOT_HEIGHT, world.colliders);
    bot.group.position.copy(bot.position);
    bot.group.rotation.y = bot.yaw;
    const speed = Math.hypot(bot.velocity.x, bot.velocity.z);
    if (speed > 0.5) {
      bot.walkPhase += dt * speed * 1.6;
      bot.legL.rotation.x = Math.sin(bot.walkPhase) * 0.55;
      bot.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.55;
    } else {
      bot.legL.rotation.x *= 0.8;
      bot.legR.rotation.x *= 0.8;
    }
  }

  return {
    list: bots,
    hitMeshes,
    resetBot,
    // Re-routes a living bot mid-round (bomb pickup, planted defence).
    setRoute(bot, route, hold = null) {
      if (!bot.alive) return;
      bot.route = resolveRoute(route);
      bot.routeIndex = 0;
      bot.hold = hold;
      if (bot.state !== 'engage') bot.state = 'route';
      bot.alertPoint = null;
    },
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    byName(name) {
      return bots.find((b) => b.name === name);
    },
    hearShot(position, time) {
      for (const bot of bots) {
        if (!bot.alive || bot.state === 'engage') continue;
        if (bot.position.distanceTo(position) < HEAR_DISTANCE && time > bot.alertUntil) {
          bot.alertPoint = { x: position.x + range(random, -3, 3), z: position.z + range(random, -3, 3) };
          bot.alertUntil = time + 6;
        }
      }
    },
    startChannel(bot, kind) {
      bot.channelKind = kind;
      bot.channel = 0;
    },
    cancelChannel(bot) {
      bot.channelKind = null;
      bot.channel = 0;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.channelKind) {
        bot.channelKind = null;
        bot.channel = 0;
      }
      if (bot.health > 0) return false;
      bot.alive = false;
      bot.fall = 0;
      bot.target = null;
      return true;
    },
    step(dt, time, ctx) {
      for (const bot of bots) stepBot(bot, dt, time, ctx);
    },
  };
}
