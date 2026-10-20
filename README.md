# Rift Runners

A 3D pod racer for mobile browsers. Race 3 bots down a canyon, dodge the rocks, and cross the line first within 90 seconds.

Built with Three.js and Vite, and hosted on GitHub Pages. All models are procedural low-poly geometry and every sound is synthesized with the Web Audio API, so the game ships no third-party assets.

## Run locally

Requires Node.js 18+ (https://nodejs.org).

```bash
npm install
npm run dev        # http://localhost:5173, plus a Network URL for phones on the same Wi-Fi
npm run build      # production build into dist/
npm run sim        # headless balance check: 200 simulated races per driver type
```

Desktop controls are the arrow keys or A / D.

## Decisions on the open questions

| Question | Decision |
|---|---|
| Tap or hold to steer | **Hold.** Holding the left half of the screen steers left and the right half steers right. Holding both cancels out. |
| Max steering angle | Visual bank capped at **30°** (`POD.maxTiltDeg`) |
| Wall hits | **Slow only:** a bounce plus speed scrape, never a stun |
| Pod-to-pod hard hit | **No stun.** Both pods are pushed apart and lose 4% speed. |
| At 90 seconds | **Furthest along wins**, and the player can lose on time |
| Orientation | **Landscape**, with a "Rotate your phone" overlay in portrait (the race pauses) |
| Speed / boost | **Automatic speed**, no boost |


## Code map

| File | What it does |
|---|---|
| `src/config.js` | **Every tunable number** (speeds, stun, bots, rubber-banding, camera) |
| `src/track.js` | Course curve, width profile, and obstacle placement with an in-code reachable-gap check |
| `src/pod.js` | Shared pod model (distance along the track + sideways offset), walls, and swept collision |
| `src/bot.js` | Bot driving: look-ahead, gap choice, mistakes, Bully behaviour, avoiding other pods |
| `src/race.js` | Fixed-step race simulation: countdown, collisions, contacts, rubber-banding, finish, ranking |
| `src/world.js`, `podModel.js`, `effects.js` | Three.js scene, pod models, speed streaks, particles |
| `src/audio.js` | Synthesized engine, crash, scrape, and countdown sounds (unlocked by the start tap) |
| `src/input.js` | Multi-touch pointer steering and keyboard |
| `src/main.js` | Wiring, fixed-timestep loop (60 Hz logic, interpolated rendering), camera, HUD, screens |
| `tools/simulate.js` | Runs the race headless to tune difficulty |

The simulation (`track`, `pod`, `bot`, `race`) has no rendering or DOM code, which is why `npm run sim` can run it in Node.

## Current balance (`npm run sim`)

- **Clean driver** (no mistakes): wins about 58% of races and finishes in about 72 s.
- **Sloppy driver:** wins about 25%.
- **Bots:** VEX (Racer) is the main threat but crashes about 2.5 times a race, OLLA (Steady) almost never crashes, and KRAGG (Bully) bumps the player.

Tune in `src/config.js`, then re-run the sim before playtesting on phones.
