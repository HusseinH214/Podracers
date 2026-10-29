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

Desktop controls are the arrow keys or A / D to steer, and Space (or W / ↑) to boost.

## Decisions on the open questions

| Question | Decision |
|---|---|
| Tap or hold to steer | **Hold.** Holding the left half of the screen steers left and the right half steers right. Holding both cancels out. |
| Max steering angle | Visual bank capped at **30°** (`POD.maxTiltDeg`) |
| Wall hits | **Slow only:** a bounce plus speed scrape, never a stun |
| Pod-to-pod hard hit | **No stun.** Both pods are pushed apart and lose 4% speed. |
| At 90 seconds | **Furthest along wins**, and the player can lose on time |
| Orientation | **Landscape**, with a "Rotate your phone" overlay in portrait (the race pauses) |
| Speed / boost | **Automatic speed**, plus one **single-use boost** (see below) |


## Boost

Crashing into a rock costs about **90 m** (≈1.5 s), which usually decides the race. To give the player a way back:

- **One pickup per race, player only.** It sits in the tightest optional gap between two obstacles between 50% and 75% of the course. Today that is a 2.2 m slot between pillars at 51%, next to a wider safe route, with a light beam above it and a cyan tick on the progress bar.
- **Use it whenever you like** with the ⚡ button above the right arrow (or Space). It's dim until collected, glows when ready, and fades once used. The shortcut has a second cell (see below), so you can hold two; the button shows a **2** badge when you do.
- **Strength:** top speed ×1.35 for 3 s with a quick kick. It's worth **≈88 m, about one crash**. It also clears a stun if you use it right after crashing, and shields you from rocks while it's active, because rows are only spaced to be dodgeable at normal speed.
- **Effect:** a sloppy driver who saves it for after a crash goes from about 33% to 64% wins, with finish times close to a clean run. Tune it in `BOOST` in `src/config.js`.

## Shortcut

One optional, **player-only** shortcut per race: a slot canyon behind a rock ridge on the inside of the sharpest bend between 28% and 47% of the course (today that's 30–38%, on the left wall).

- **Finding it:** green chevrons on the floor point at a gap in the canyon wall, a green marker sits on the ridge prow, and a green band on the progress bar shows where the shortcut is. "SHORTCUT" appears while you're inside.
- **Committing:** steer through the gap before the ridge starts. Hitting the prow head-on is a crash, and once you're past it you can't switch sides until the exit.
- **Payoff vs. risk:** progress counts ×1.25 inside (it cuts the corner), worth **≈0.7 s** on a clean run. Three pillars alternate between the ridge and the outer wall, and each one blocks the middle, so you have to weave. Driving straight down the middle costs two crashes (≈2.5 s net loss).
- **Bonus boost cell:** a second boost cell sits on the open side of the middle pillar, 8 m before it, so weaving cleanly collects it. Its beam shows over the ridge as a lure. A clean run through the tunnel that uses this boost finishes in **69.7 s instead of 71.9 s**, and a clean driver wins 200 of 200 races instead of 155.
- **Isolation:** the main track, its obstacle rows, the boost pickup and every bot behave exactly as before (`npm run sim` output is unchanged apart from the obstacle count). Tune it in `SHORTCUT` in `src/config.js`.

## Code map

| File | What it does |
|---|---|
| `src/config.js` | **Every tunable number** (speeds, stun, bots, rubber-banding, camera) |
| `src/track.js` | Course curve, width profile, obstacle placement with an in-code reachable-gap check, and the shortcut tunnel |
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
