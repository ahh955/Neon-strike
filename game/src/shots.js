// Screenshot staging: ?shot=start|play|buy|end&seed=N sets up a
// deterministic frame, renders it twice, then freezes it and sets
// window.__shotReady. Every pose is a real game state — the same code that
// plays the game poses the shot, so the screenshots and the code agree.
// The play pose is the cover: live combat, two enemies in the open, a
// teammate beside the player, a shot just fired (muzzle flash, tracer,
// hitmarker) and a full HUD.
import * as THREE from 'three';

const LOOK = new THREE.Vector3();

function placeBot(G, name, x, z, yaw, dead = false) {
  const bot = G.bots.byName(name);
  bot.position.set(x, 0, z);
  bot.velocity.set(0, 0, 0);
  bot.yaw = yaw;
  bot.alive = !dead;
  bot.health = dead ? 0 : 100;
  bot.group.position.copy(bot.position);
  bot.group.rotation.set(0, yaw, 0);
  if (dead) {
    bot.fall = 1;
    bot.group.rotation.x = -1.45;
    bot.group.position.y = -0.1;
  }
  return bot;
}

function stageStart(G) {
  G.rounds.startRound();
  G.player.reset(-28, 18, 0);
  G.hud.hideBuy();
  G.settle(20);
  G.aimAt(LOOK.set(-6, 2.5, -10));
  G.hud.showOverlay('start');
}

function stagePlay(G) {
  // A mid-match firefight: round 4, Vipers up 2-1, 1:24 on the clock.
  const R = G.rounds.state;
  R.round = 4;
  R.wins.vipers = 2;
  R.wins.jackals = 1;
  R.money = 3250;
  R.phase = 'live';
  R.phaseTime = 84;
  G.player.reset(-6, 6, 0);
  G.player.state.armor = 50;
  G.arsenal.buy('rifle');
  G.arsenal.state.grenades = 1;
  G.arsenal.state.mag.rifle = 27;
  G.arsenal.state.reserve.rifle = 90;
  G.bomb.state.status = 'carried';

  // Two Jackals in the open ahead, one Viper beside the player, and two
  // fallen soldiers from the fight so far — the killfeed names them.
  placeBot(G, 'Fang', 0, -2, Math.PI * 0.85);
  placeBot(G, 'Havoc', 6, -4, 2.27);
  placeBot(G, 'Vex', -3.5, 2.5, -0.5);
  placeBot(G, 'Onyx', 2, -5, 0.4, true);
  placeBot(G, 'Nova', -8, 0, 1.2, true);
  G.bots.byName('Rook').group.visible = false;
  G.bots.byName('Ridge').group.visible = false;

  // No settle: the live sim would let the bots shoot the player before the
  // frame is taken. The bots are placed by hand, so nothing needs to settle.
  G.hud.killfeed('Rook', 'Onyx', false, true);
  G.hud.killfeed('Fang', 'Nova', false, false);
  // One shot at the near Jackal: muzzle flash, tracer and hitmarker frozen
  // in the frame, the target still standing — a fight in progress.
  const fang = G.bots.byName('Fang');
  G.aimAt(LOOK.set(fang.position.x, 1.3, fang.position.z));
  G.shootPlayer(0);
  G.hud.hitMarker(false, 4000);
  G.hud.setCrosshair(10, false);
}

function stageBuy(G) {
  G.rounds.startRound();
  G.rounds.state.money = 2700;
  G.player.reset(-28, 18, 0);
  G.settle(20);
  G.aimAt(LOOK.set(-10, 2, -8));
  G.hud.showBuy(2700, { pistol: true });
}

function stageEnd(G) {
  // Round 6 just ended: the charge blew at Site B, Vipers lead 3-2.
  const R = G.rounds.state;
  R.round = 6;
  R.wins.vipers = 3;
  R.wins.jackals = 2;
  R.money = 4170;
  R.phase = 'over';
  R.phaseTime = 3.2;
  G.player.reset(21, 4, 0);
  G.player.state.health = 62;
  G.player.state.armor = 25;
  G.arsenal.buy('rifle');
  G.arsenal.state.mag.rifle = 12;
  G.arsenal.state.reserve.rifle = 60;
  G.bomb.plant({ id: 'B', center: { x: 22, z: 14 }, radius: 6, color: '#e879f9' });
  // The round is over because the charge already blew: hide the bomb bar
  // (the mesh stays as the wreckage at the site).
  G.bomb.state.status = 'exploded';
  placeBot(G, 'Vex', 18, 10, -1.2);
  placeBot(G, 'Rook', 24, 17, 2.4);
  placeBot(G, 'Fang', 20, 12, 0.8, true);
  G.bots.byName('Havoc').group.visible = false;
  G.bots.byName('Nova').group.visible = false;
  G.bots.byName('Ridge').group.visible = false;
  G.bots.byName('Onyx').group.visible = false;
  G.settle(12);
  G.aimAt(LOOK.set(22, 1, 14));
  G.hud.banner('VIPERS WIN THE ROUND', 'Charge detonated at Site B', 'vipers');
  G.hud.killfeed('Rook', 'Fang', true, true);
}

export function stageShot(name, G) {
  G.hud.hideOverlay();
  G.hud.hideBanner();
  G.hud.showDead(false);
  if (name === 'play') stagePlay(G);
  else if (name === 'buy') stageBuy(G);
  else if (name === 'end') stageEnd(G);
  else stageStart(G);
  G.syncHud();
}
