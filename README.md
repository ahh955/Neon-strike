# Neon Strike — a three.js tactical FPS

[![make.fun bounty](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ahh955/Neon-strike/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ahh955/Neon-strike/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made
famous — built from scratch on three.js 0.187.0, running offline from static
files. An entry for the make.fun bounty
[Make the best three.js tactical FPS](https://make.fun/bounty/threejs-fps-02).

## The game

**Neon Strike** drops you in a dusk industrial yard with two bombsites. You
are a Viper: plant the charge at site A or B, or wipe the Jackals out. First
team to 5 round wins takes the match.

- **Two teams, 4v4** — you plus three AI teammates against four AI enemies.
  Bots walk waypoint routes, hold positions, see and hear, fire aimed bursts,
  and play the objective: the carrier plants, the defenders defuse.
- **Rounds and money** — win a round for $3250, lose for $1400+, $300 a kill.
  Spend it in the buy menu between rounds: rifle, SMG, sniper, armor, grenade.
- **Gunplay where accuracy counts** — recoil and bloom punish spraying,
  spread grows while moving, crouching and standing still tighten the group,
  headshots deal triple damage.
- **An original map** — three lanes, a container canyon, a climbable control
  tower, a warehouse and a courtyard, lit by a low dusk sun and neon.
- **Synthesized sound** — every shot, reload, hit, plant beep and round
  jingle is generated with Web Audio. No audio files, no network requests.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire |
| R | Reload |
| Shift | Walk quietly |
| Ctrl / C | Crouch |
| Space | Jump |
| B / Tab | Buy menu (buy phase) |
| G | Throw grenade |
| E (hold) | Plant the charge |
| 1 / 2 / wheel | Switch weapon |
| Right click | Sniper scope |
| M | Mute |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no dependencies: `game/` is plain static files, three.js is
vendored under `game/vendor/three/`.

## Layout

- `game/index.html` — the page and the HUD
- `game/src/main.js` — boot, fixed-step loop, shooting, rounds
- `game/src/world.js` — the Neon Yard map, waypoints, spawns
- `game/src/bots.js` — bot bodies and AI
- `game/src/player.js` — movement, health, armor
- `game/src/weapons.js` — guns, spread, recoil, view models
- `game/src/bomb.js` — plant / defuse / detonate
- `game/src/grenades.js` — thrown grenades
- `game/src/rounds.js` — round state machine and money
- `game/src/effects.js` — tracers, sparks, explosions
- `game/src/audio.js` — synthesized sound effects
- `game/src/hud.js` — DOM HUD, buy menu, killfeed
- `game/src/shots.js` — deterministic screenshot poses
- `main.ts` — the entry program: copies `game/` + `screenshots/` to
  `/output` and writes `dossier.json`

## License

MIT — see [LICENSE](LICENSE).
