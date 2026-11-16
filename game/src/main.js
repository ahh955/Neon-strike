// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. All game state lives in the single object G, and every
// system reads it through the step functions below. Shooting is a raycast
// against the world and the bots' hitboxes; damage, kills, money and round
// ends all funnel through damageTarget, so there is one place that decides
// what a hit means.
// ?shot=start|play|buy|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, pick } from './rng.js';
import { createWorld, SPAWNS, ROUTES, HOLDS, SITES, NODES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE, ARMOR, damageAtRange } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME } from './bomb.js';
import { createGrenades } from './grenades.js';
import { createRounds } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const FIXED_STEP = 1 / 60;
const FOV = 74;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.dusk);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.dusk), 34, 95);
// Dusk sky dome: a gradient sphere (deep violet overhead, warm ember at
// the horizon) so the sky reads as sunset, not a flat void. Unaffected by
// fog; the world sits inside it.
{
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 512;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 512);
  // Canvas y=256 is the horizon (v=0.5): the ember glow sits just above
  // it, fading to deep violet at the zenith and to dark below the ground.
  gradient.addColorStop(0, '#0b0c1c');
  gradient.addColorStop(0.3, '#191736');
  gradient.addColorStop(0.42, '#3d2450');
  gradient.addColorStop(0.49, '#c96a35');
  gradient.addColorStop(0.54, '#241d33');
  gradient.addColorStop(1, '#101018');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 4, 512);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(180, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  scene.add(skyDome);
}
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 200);
scene.add(camera);

const world = createWorld(scene, random);
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const rounds = createRounds();
const bomb = createBomb(scene, world.textures);
const grenades = createGrenades(scene, world, random);
const effects = createEffects(scene, world.textures);
const audio = createAudio();
const hud = createHud();

// The player's own hitboxes (invisible): bots shoot at these, the same way
// the player shoots at the bots'. The player's own raycast never tests them.
const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true });
const playerTorsoHit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.5, 0.42), hitMaterial);
playerTorsoHit.userData.player = true;
playerTorsoHit.userData.part = 'torso';
const playerHeadHit = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), hitMaterial);
playerHeadHit.userData.player = true;
playerHeadHit.userData.part = 'head';
scene.add(playerTorsoHit, playerHeadHit);

const G = {
  scene, camera, world, player, arsenal, rounds, bomb, grenades, effects, audio, hud,
  random, time: 0, started: false, frozen: false,
  kills: 0, deaths: 0,
  playerChannel: null, // { kind: 'plant' | 'defuse', progress }
  bombCarrierBot: null,
  prevFiring: false,
  stepDistance: 0,
  lastStepAt: 0,
};

const bots = createBots(scene, world, random, {
  tracer: (from, to, color) => effects.tracer(from, to, color),
  shotSound: (pos) => audio.shot('rifle', player.state.position.distanceTo(pos) > 15),
  onGunshot: (pos) => bots.hearShot(pos, G.time),
  hit: (target, amount, part, attacker) => damageTarget(target, amount, part, attacker),
  playerHitMeshes: () => [playerTorsoHit, playerHeadHit],
  channelDone: (bot, kind) => {
    if (kind === 'plant') {
      const site = bomb.siteAt(bot.position.x, bot.position.z);
      if (site) {
        bomb.plant(site);
        audio.plant();
        onBombPlanted(site);
      }
    } else if (kind === 'defuse') {
      bomb.state.status = 'defused';
      audio.defuse();
      endRound('jackals', 'Charge defused');
    }
  },
});
G.bots = bots;

const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();
const rightVec = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// ---------------------------------------------------------------- rounds

function assignRound() {
  const carrierGoesA = random() < 0.5;
  const defAFirst = random() < 0.5;
  const plans = [
    { name: 'Rook', team: 'vipers', spawn: SPAWNS.vipers[1], route: carrierGoesA ? ROUTES.rushA : ROUTES.rushB, hold: carrierGoesA ? HOLDS.A[0] : HOLDS.B[0], role: 'carrier' },
    { name: 'Vex', team: 'vipers', spawn: SPAWNS.vipers[2], route: carrierGoesA ? ROUTES.rushB : ROUTES.rushA, hold: carrierGoesA ? HOLDS.B[0] : HOLDS.A[1], role: 'rusher' },
    { name: 'Nova', team: 'vipers', spawn: SPAWNS.vipers[3], route: ROUTES.midPush, hold: HOLDS.mid[0], role: 'rusher' },
    { name: 'Fang', team: 'jackals', spawn: SPAWNS.jackals[0], route: defAFirst ? ROUTES.defA : ROUTES.defB, hold: defAFirst ? HOLDS.A[1] : HOLDS.B[1], role: 'holder' },
    { name: 'Havoc', team: 'jackals', spawn: SPAWNS.jackals[1], route: defAFirst ? ROUTES.defB : ROUTES.defA, hold: defAFirst ? HOLDS.B[2] : HOLDS.A[2], role: 'holder' },
    { name: 'Ridge', team: 'jackals', spawn: SPAWNS.jackals[2], route: ROUTES.defMid, hold: HOLDS.mid[1], role: 'holder' },
    { name: 'Onyx', team: 'jackals', spawn: SPAWNS.jackals[3], route: defAFirst ? ROUTES.defA : ROUTES.defB, hold: defAFirst ? HOLDS.A[2] : HOLDS.B[1], role: 'holder' },
  ];
  for (const plan of plans) {
    bots.resetBot(bots.byName(plan.name), plan.spawn, plan.route, plan.hold, plan.role);
  }
  player.reset(SPAWNS.vipers[0].x, SPAWNS.vipers[0].z, SPAWNS.vipers[0].yaw);
  G.bombCarrierBot = bots.byName('Rook');
  bomb.reset({ kind: 'bot', bot: G.bombCarrierBot });
  grenades.clear();
  arsenal.resetRound();
  G.playerChannel = null;
  hud.hideBanner();
  hud.showDead(false);
  rounds.startRound();
  if (G.started) {
    hud.showBuy(rounds.state.money, arsenal.state.owned);
    input.exitLock();
  }
  syncHud();
}

function endRound(winner, reason) {
  if (rounds.state.phase !== 'live') return;
  rounds.endRound(winner, reason);
  const playerWon = winner === 'vipers';
  hud.banner(
    playerWon ? 'VIPERS WIN THE ROUND' : 'JACKALS WIN THE ROUND',
    reason,
    winner,
  );
  if (playerWon) audio.roundWin();
  else audio.roundLose();
  hud.hideBuy();
  G.playerChannel = null;
  syncHud();
}

function checkRoundEnd() {
  if (rounds.state.phase !== 'live') return;
  const planted = bomb.state.status === 'planted';
  const vipersAlive = bots.aliveCount('vipers') + (player.state.alive ? 1 : 0);
  const jackalsAlive = bots.aliveCount('jackals');
  if (jackalsAlive === 0) {
    endRound('vipers', planted ? 'Enemy team eliminated' : 'Enemy team eliminated');
  } else if (vipersAlive === 0 && !planted) {
    endRound('jackals', 'Your team was eliminated');
  }
}

function onBombPlanted(site) {
  // Defenders converge on the planted site; attackers fall back to guard it.
  const defRoute = site.id === 'A' ? ROUTES.defA : ROUTES.defB;
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    if (bot.team === 'jackals') {
      bots.setRoute(bot, defRoute);
      // Skip ahead to the node nearest the bot so it does not backtrack.
      let best = 0;
      let bestDist = Infinity;
      defRoute.forEach((id, i) => {
        const [x, z] = NODES[id];
        const d = Math.hypot(bot.position.x - x, bot.position.z - z);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      bot.routeIndex = best;
    } else if (bot.role !== 'carrier') {
      bots.setRoute(bot, [nearestNode(bot.position), site.id === 'A' ? 'a4' : 'e4'], pick(random, HOLDS[site.id]));
    }
  }
}

function nearestNode(position) {
  const ids = ['m2', 'm3', 'm4', 'a2', 'a3', 'e1', 'e2', 'd5', 'd6', 'd3'];
  let best = 'm2';
  let bestDist = Infinity;
  for (const id of ids) {
    const [x, z] = NODES[id];
    const d = Math.hypot(position.x - x, position.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

// ---------------------------------------------------------------- damage

function damageTarget(target, amount, part, attacker) {
  const isPlayerVictim = target.kind === 'player';
  const victimBot = isPlayerVictim ? null : target.bot;
  if (isPlayerVictim && !player.state.alive) return;
  if (victimBot && !victimBot.alive) return;
  const killed = isPlayerVictim
    ? (player.damage(amount), !player.state.alive)
    : bots.damage(victimBot, amount);
  const attackerIsPlayer = attacker === 'player';
  const attackerBot = attacker !== 'player' && attacker !== 'grenade' ? attacker : null;
  const killerName = attackerIsPlayer ? 'You' : attacker === 'grenade' ? 'You' : attackerBot.name;
  const killerIsViper = attackerIsPlayer || attacker === 'grenade' || (attackerBot && attackerBot.team === 'vipers');

  if (isPlayerVictim) {
    hud.damageFlash();
    audio.hurt();
    G.playerChannel = null;
  }
  if (killed) {
    const victimName = isPlayerVictim ? 'You' : victimBot.name;
    if (!(attackerIsPlayer && isPlayerVictim)) {
      hud.killfeed(killerName, victimName, part === 'head', killerIsViper);
    }
    if (attackerIsPlayer || attacker === 'grenade') {
      G.kills += 1;
      rounds.payKill();
      if (!isPlayerVictim) {
        audio.hit(true);
        hud.hitMarker(true);
      }
    }
    if (isPlayerVictim) {
      G.deaths += 1;
      hud.showDead(true);
      input.exitLock();
      if (bomb.state.status === 'carried' && bomb.state.carrier.kind === 'player') {
        bomb.dropAt(player.state.position);
      }
    } else if (bomb.state.status === 'carried' && bomb.state.carrier.kind === 'bot' && bomb.state.carrier.bot === victimBot) {
      bomb.dropAt(victimBot.position);
      G.bombCarrierBot = null;
      // The nearest living Viper goes to pick the charge up.
      let best = null;
      let bestDist = Infinity;
      for (const bot of bots.list) {
        if (bot.team !== 'vipers' || !bot.alive) continue;
        const d = bot.position.distanceTo(victimBot.position);
        if (d < bestDist) {
          bestDist = d;
          best = bot;
        }
      }
      if (best) {
        best.role = 'carrier';
        bots.setRoute(best, [[victimBot.position.x, victimBot.position.z]]);
      }
    }
    checkRoundEnd();
  }
  syncHud();
}

// ---------------------------------------------------------------- shooting

function shootPlayer(spread) {
  const def = arsenal.def();
  if (!arsenal.ready()) return false;
  if (!arsenal.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() + random() - 1) * spread;
  direction.y += (random() + random() - 1) * spread;
  direction.z += (random() + random() - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  camera.getWorldDirection(tmpVec);
  rightVec.set(1, 0, 0).applyQuaternion(camera.quaternion);
  muzzlePos.copy(camera.position).addScaledVector(tmpVec, 0.6).addScaledVector(rightVec, 0.22);
  muzzlePos.y -= 0.14;
  const end = hit ? hit.point : tmpVec.copy(camera.position).addScaledVector(direction, 70);
  effects.tracer(muzzlePos, end, '#ffd27a');
  arsenal.pullTrigger();
  player.recoil(def.kick * (0.9 + random() * 0.3), (random() * 2 - 1) * def.kick * 0.4);
  audio.shot(def.id);
  bots.hearShot(player.state.position, G.time);
  if (hit) {
    if (hit.object.userData.bot) {
      const victim = hit.object.userData.bot;
      if (victim.team === 'jackals') {
        const head = hit.object.userData.part === 'head';
        const damage = damageAtRange(def.damage, hit.distance) * (head ? def.headMult : 1);
        const wasAlive = victim.alive;
        damageTarget({ kind: 'bot', bot: victim }, damage, head ? 'head' : 'torso', 'player');
        if (wasAlive) {
          audio.hit(!victim.alive);
          if (victim.alive) hud.hitMarker(false);
          effects.hitSparks(hit.point, head ? 14 : 8);
        }
      } else {
        // Teammates block the bullet but take no damage: no friendly fire.
        effects.hitSparks(hit.point, 6);
      }
    } else {
      effects.hitSparks(hit.point, 6);
    }
  }
  syncHud();
  return true;
}

function throwGrenade() {
  if (arsenal.state.grenades <= 0 || rounds.state.phase !== 'live' || !player.state.alive) return;
  arsenal.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const velocity = direction.clone().multiplyScalar(14);
  velocity.y += 3.5;
  velocity.add(player.state.velocity);
  muzzlePos.copy(camera.position).addScaledVector(direction, 0.6);
  grenades.throwGrenade(muzzlePos, velocity);
  audio.throwGrenade();
  syncHud();
}

function explodeAt(position) {
  effects.explosion(position);
  audio.explosion();
  const targets = [{ kind: 'player', pos: player.state.position }];
  for (const bot of bots.list) targets.push({ kind: 'bot', bot, pos: bot.position });
  for (const t of targets) {
    const dist = Math.hypot(t.pos.x - position.x, t.pos.z - position.z);
    const damage = grenades.blastDamage(dist);
    if (damage > 0) damageTarget(t, damage, 'torso', 'grenade');
  }
}

// ---------------------------------------------------------------- channels

function updateChannels(dt) {
  const live = rounds.state.phase === 'live' && player.state.alive;
  const inSite = live ? bomb.siteAt(player.state.position.x, player.state.position.z) : null;
  const carrying = bomb.state.status === 'carried' && bomb.state.carrier.kind === 'player';
  const holdingE = input.state.keys.has('KeyE');
  let prompt = null;

  // Pick up a dropped charge by walking over it.
  if (live && bomb.state.status === 'dropped') {
    const d = Math.hypot(player.state.position.x - bomb.state.position.x, player.state.position.z - bomb.state.position.z);
    if (d < 1.6) {
      bomb.state.status = 'carried';
      bomb.state.carrier = { kind: 'player' };
      bomb.group.visible = false;
      hud.killfeed('You', 'picked up the charge', false, true);
    } else if (d < 6) {
      prompt = 'Walk over the charge to pick it up';
    }
  }
  // A Viper bot picks up a dropped charge the same way.
  if (live && bomb.state.status === 'dropped') {
    for (const bot of bots.list) {
      if (bot.team !== 'vipers' || !bot.alive) continue;
      const d = Math.hypot(bot.position.x - bomb.state.position.x, bot.position.z - bomb.state.position.z);
      if (d < 1.6) {
        bomb.state.status = 'carried';
        bomb.state.carrier = { kind: 'bot', bot };
        bomb.group.visible = false;
        G.bombCarrierBot = bot;
        bot.role = 'carrier';
        const siteA = Math.hypot(bot.position.x - SITES[0].center.x, bot.position.z - SITES[0].center.z);
        const siteB = Math.hypot(bot.position.x - SITES[1].center.x, bot.position.z - SITES[1].center.z);
        const site = siteA < siteB ? 'A' : 'B';
        bots.setRoute(bot, [nearestNode(bot.position), site === 'A' ? 'a4' : 'e4'], pick(random, HOLDS[site]));
        break;
      }
    }
  }

  if (live && carrying && inSite) {
    prompt = 'Hold E to plant the charge';
    if (holdingE) {
      if (!G.playerChannel || G.playerChannel.kind !== 'plant') G.playerChannel = { kind: 'plant', progress: 0 };
      G.playerChannel.progress += dt / PLANT_TIME;
      if (G.playerChannel.progress >= 1) {
        bomb.plant(inSite);
        audio.plant();
        G.playerChannel = null;
        onBombPlanted(inSite);
      }
    } else {
      G.playerChannel = null;
    }
  } else if (G.playerChannel && G.playerChannel.kind === 'plant') {
    G.playerChannel = null;
  }

  // Carrier bot plants when it reaches its site.
  if (live && G.bombCarrierBot && G.bombCarrierBot.alive && bomb.state.status === 'carried') {
    const bot = G.bombCarrierBot;
    const site = bomb.siteAt(bot.position.x, bot.position.z);
    if (site && bot.routeIndex >= bot.route.length && !bot.channelKind && bot.state !== 'engage') {
      bots.startChannel(bot, 'plant');
    }
  }
  // Defenders defuse when they reach the planted charge unopposed.
  if (live && bomb.state.status === 'planted') {
    for (const bot of bots.list) {
      if (bot.team !== 'jackals' || !bot.alive || bot.channelKind) continue;
      const d = Math.hypot(bot.position.x - bomb.state.position.x, bot.position.z - bomb.state.position.z);
      if (d < 2.5 && bot.state !== 'engage') bots.startChannel(bot, 'defuse');
    }
  }

  if (G.playerChannel) {
    hud.setChannel(G.playerChannel.kind === 'plant' ? 'PLANTING CHARGE' : 'DEFUSING', G.playerChannel.progress);
  } else {
    hud.setChannel(null, 0);
  }
  hud.setPrompt(prompt);
}

// ---------------------------------------------------------------- buy

function buyItem(id) {
  if (rounds.state.phase !== 'buy') {
    audio.denied();
    return;
  }
  if (id === 'armor') {
    if (player.state.armor >= 100 || !rounds.spend(ARMOR.price)) {
      audio.denied();
      return;
    }
    player.state.armor = 100;
  } else if (id === 'grenade') {
    if (arsenal.state.grenades >= 2 || !rounds.spend(GRENADE.price)) {
      audio.denied();
      return;
    }
    arsenal.state.grenades += 1;
  } else {
    const def = WEAPONS[id];
    if (!def || arsenal.state.owned[id] || !rounds.spend(def.price)) {
      audio.denied();
      return;
    }
    arsenal.buy(id);
  }
  audio.buy();
  hud.showBuy(rounds.state.money, arsenal.state.owned);
  syncHud();
}

function toggleBuy() {
  if (rounds.state.phase !== 'buy' || !G.started) return;
  if (hud.isBuyOpen()) {
    hud.hideBuy();
    input.requestLock();
  } else {
    hud.showBuy(rounds.state.money, arsenal.state.owned);
    input.exitLock();
  }
}

// ---------------------------------------------------------------- hud / camera

function syncHud() {
  hud.setHealth(player.state.health, player.state.armor);
  const def = arsenal.def();
  hud.setAmmo(arsenal.state.mag[arsenal.state.current], arsenal.state.reserve[arsenal.state.current], def.name, arsenal.state.grenades);
  hud.setMoney(rounds.state.money);
  hud.setTimer(rounds.state.phaseTime, rounds.state.phase);
  hud.setScore(rounds.state.wins.vipers, rounds.state.wins.jackals, rounds.state.round);
  hud.setBomb(bomb.state.status === 'planted' ? bomb.state.timer : null);
}
G.syncHud = syncHud;

function syncCamera() {
  const body = player.state;
  const eyeY = body.alive ? body.eye : 0.4;
  camera.position.set(body.position.x, body.position.y + eyeY, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const wantFov = arsenal.state.scoped ? FOV / arsenal.def().zoom : FOV;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov += (wantFov - camera.fov) * 0.35;
    camera.updateProjectionMatrix();
  }
}

G.aimAt = (point) => {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
};
G.shootPlayer = (spread) => shootPlayer(spread);
G.settle = (steps) => {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
};

// ---------------------------------------------------------------- input flow

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    G.started = true;
    hud.hideOverlay();
  } else if (G.started && rounds.state.phase === 'live' && player.state.alive && !hud.isBuyOpen() && rounds.state.phase !== 'match') {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  audio.unlock();
  if (shot) return;
  if (rounds.state.phase === 'match') {
    resetMatch();
    return;
  }
  G.started = true;
  hud.hideOverlay();
  if (rounds.state.phase === 'buy') {
    // Round 1 starts in the buy phase: open the menu instead of locking,
    // so the player can click items before the round starts.
    hud.showBuy(rounds.state.money, arsenal.state.owned);
  } else if (!hud.isBuyOpen()) {
    input.requestLock();
  }
});

hud.onBuy(buyItem);

renderer.domElement.addEventListener('click', () => {
  if (shot || !G.started) return;
  if (!input.state.locked && !hud.isBuyOpen() && rounds.state.phase !== 'match') input.requestLock();
});

function resetMatch() {
  const fresh = createRounds();
  Object.assign(rounds.state, fresh.state);
  G.kills = 0;
  G.deaths = 0;
  arsenal.state.owned = { pistol: true, rifle: false, smg: false, sniper: false };
  arsenal.state.reserve = { pistol: 48, rifle: 0, smg: 0, sniper: 0 };
  arsenal.state.mag = { pistol: 12, rifle: 30, smg: 32, sniper: 5 };
  arsenal.state.grenades = 0;
  arsenal.switchTo('pistol');
  player.state.armor = 0;
  assignRound();
  hud.hideOverlay();
}

// ---------------------------------------------------------------- step

function step(dt) {
  G.time += dt;
  const phase = rounds.state.phase;
  const frozen = phase === 'buy' || phase === 'over' || phase === 'match' || !G.started;
  const live = phase === 'live' && G.started;

  player.step(dt, input.state.keys, frozen || !player.state.alive);
  arsenal.step(dt);

  // Footsteps: a soft tick every couple of metres on the ground.
  if (player.state.onGround && player.state.alive) {
    const speed = player.groundSpeed();
    G.stepDistance += speed * dt;
    if (speed > 1 && G.stepDistance > 2.4) {
      G.stepDistance = 0;
      audio.step();
    }
  }

  playerTorsoHit.position.set(player.state.position.x, player.state.position.y + 0.85, player.state.position.z);
  playerHeadHit.position.set(player.state.position.x, player.state.position.y + 1.66, player.state.position.z);

  const enemiesOf = (bot) => {
    const list = [];
    // The player fights for the Vipers: only Jackal bots count them as an
    // enemy. (A teammate must never target the player.)
    if (bot.team === 'jackals') {
      list.push({ kind: 'player', pos: player.state.position, speed: player.groundSpeed(), alive: player.state.alive });
    }
    for (const other of bots.list) {
      if (other.team !== bot.team) list.push({ kind: 'bot', bot: other, alive: other.alive });
    }
    return list;
  };
  bots.step(dt, G.time, { frozen: frozen || !live, enemies: enemiesOf });

  for (const boom of grenades.step(dt)) explodeAt(boom.position);

  if (live) {
    const bombResult = bomb.step(dt, G.time, (fast) => audio.beep(fast));
    if (bombResult === 'explode') {
      effects.explosion(bomb.state.position);
      audio.explosion();
      endRound('vipers', 'Charge detonated');
    }
    updateChannels(dt);
  }

  const tick = rounds.step(dt);
  if (tick === 'buyEnd') {
    hud.hideBuy();
    if (G.started) input.requestLock();
  } else if (tick === 'timeUp') {
    if (bomb.state.status !== 'planted') endRound('jackals', 'Time expired — site held');
    else rounds.state.phaseTime = 0.01; // the bomb's clock decides now
  } else if (tick === 'overEnd') {
    if (rounds.state.matchWinner) {
      rounds.endMatch();
      const won = rounds.state.matchWinner === 'vipers';
      hud.showOverlay('end', {
        copy: won
          ? `Vipers take the match ${rounds.state.wins.vipers}–${rounds.state.wins.jackals}. You finished ${G.kills} kills, ${G.deaths} deaths.`
          : `Jackals take the match ${rounds.state.wins.jackals}–${rounds.state.wins.vipers}. You finished ${G.kills} kills, ${G.deaths} deaths.`,
        rows: `<div class="score-row"><span>VIPERS</span><b>${rounds.state.wins.vipers}</b></div><div class="score-row"><span>JACKALS</span><b>${rounds.state.wins.jackals}</b></div><div class="score-row"><span>YOUR KILLS</span><b>${G.kills}</b></div><div class="score-row"><span>YOUR DEATHS</span><b>${G.deaths}</b></div>`,
      });
      input.exitLock();
    } else {
      rounds.nextRound();
      assignRound();
    }
  }
}

// ---------------------------------------------------------------- frame

let accumulator = 0;
let lastTime = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (G.frozen) {
    renderer.render(scene, camera);
    return;
  }

  const live = rounds.state.phase === 'live' && G.started && player.state.alive;
  const look = input.takeLook();
  player.look(look.x, look.y);
  const def = arsenal.def();

  // Scope: right mouse, sniper only.
  arsenal.state.scoped = input.state.aiming && def.id === 'sniper' && live;

  const firing = input.state.firing && live && !hud.isBuyOpen();
  const freshPress = firing && !G.prevFiring;
  if ((def.auto && firing) || (!def.auto && freshPress)) {
    if (!shootPlayer(arsenal.spread(player.groundSpeed(), player.state.crouching))) {
      if (arsenal.state.mag[arsenal.state.current] === 0 && freshPress) audio.dryFire();
    }
  }
  G.prevFiring = input.state.firing;

  if (input.pressed('KeyR') && live) {
    if (arsenal.reload()) audio.reload();
  }
  if (input.pressed('KeyG') && live) throwGrenade();
  if (input.pressed('KeyB') || input.pressed('Tab')) toggleBuy();
  if (input.pressed('KeyM')) audio.setMuted(!audio.isMuted());
  if (input.pressed('Digit1') && live) {
    const mains = ['rifle', 'smg', 'sniper'].filter((id) => arsenal.state.owned[id]);
    if (mains.length > 0) {
      const current = mains.indexOf(arsenal.state.current);
      arsenal.switchTo(mains[(current + 1) % mains.length]);
    }
  }
  if (input.pressed('Digit2') && live) arsenal.switchTo('pistol');
  const wheel = input.takeWheel();
  if (wheel !== 0 && live) {
    const owned = ['rifle', 'smg', 'sniper', 'pistol'].filter((id) => arsenal.state.owned[id]);
    const current = owned.indexOf(arsenal.state.current);
    const next = (current + (wheel > 0 ? 1 : -1) + owned.length) % owned.length;
    arsenal.switchTo(owned[next]);
  }
  if (hud.isBuyOpen()) {
    for (const [index, id] of ['rifle', 'smg', 'sniper', 'armor', 'grenade'].entries()) {
      if (input.pressed(`Digit${index + 1}`)) buyItem(id);
    }
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;

  // Crosshair gap follows the live spread: still is tight, moving is wide.
  const spreadPx = 5 + arsenal.spread(player.groundSpeed(), player.state.crouching) * 620;
  hud.setCrosshair(spreadPx, arsenal.state.scoped);
  effects.step(dt);
  syncCamera();
  syncHud();
  input.endFrame();
  renderer.render(scene, camera);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      G.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

assignRound();
syncCamera();
if (shot) {
  G.started = true;
  stageShot(shot, G);
  paintTwiceThenReady();
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
