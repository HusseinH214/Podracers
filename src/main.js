import './style.css';
import * as THREE from 'three';
import { DT, POD, CAMERA, RACE, STUN } from './config.js';
import { Track } from './track.js';
import { Race } from './race.js';
import { buildWorld, trackBasis, PALETTE } from './world.js';
import { createPodModel } from './podModel.js';
import { SpeedStreaks, Particles } from './effects.js';
import { Audio } from './audio.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

// ---- renderer --------------------------------------------------------------

const dpr = window.devicePixelRatio || 1;
const renderer = new THREE.WebGLRenderer({ antialias: dpr < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(dpr, 2)); // 3x phones can't push that many pixels at 60 fps
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.baseFov, 1, 0.1, 1500);
scene.add(camera);

const track = new Track();
const world = buildWorld(scene, track);
const race = new Race(track);
const views = race.pods.map((pod) => {
  const view = createPodModel(pod.color, pod.isPlayer ? null : pod.name);
  scene.add(view.root);
  return { pod, ...view };
});
const streaks = new SpeedStreaks(camera);
const particles = new Particles(scene);
const audio = new Audio();
const input = new Input($('controls'), $('arrow-left'), $('arrow-right'));

// ---- HUD ---------------------------------------------------------------------

const hud = {
  root: $('hud'),
  pos: $('pos'),
  suffix: $('pos-suffix'),
  time: $('time'),
  timeBox: $('time').parentElement,
  stun: $('stun-badge'),
  countdown: $('countdown'),
  flash: $('flash'),
  dots: race.pods.map((pod) => {
    const d = document.createElement('div');
    d.className = pod.isPlayer ? 'dot me' : 'dot';
    d.style.background = '#' + new THREE.Color(pod.color).getHexString();
    $('progress').appendChild(d);
    return d;
  }),
};

const ordinal = (n) => ['th', 'st', 'nd', 'rd'][n] ?? 'th';
const fmtTime = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow so the animation plays again
  el.classList.add(cls);
}

function showCountdown(text, go = false) {
  hud.countdown.textContent = text;
  hud.countdown.classList.remove('hidden');
  hud.countdown.classList.toggle('go', go);
  restartAnim(hud.countdown, 'pop');
  if (go) setTimeout(() => hud.countdown.classList.add('hidden'), 700);
}

// ---- persistent bits (best-effort; storage can be unavailable) --------------

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode etc. */
    }
  },
};

function bestText() {
  const best = Number(store.get('rift-best'));
  return best ? `Best winning time: ${fmtTime(best)}` : '';
}
$('best-title').textContent = bestText();

let muted = store.get('rift-muted') === '1';
const muteBtn = $('mute');
const paintMute = () => {
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
};
paintMute();
audio.setMuted(muted);
muteBtn.addEventListener('click', () => {
  muted = !muted;
  audio.unlock();
  audio.setMuted(muted);
  store.set('rift-muted', muted ? '1' : '0');
  paintMute();
});

// Full screen toggle. No iPhone browser supports full screen for pages, so the
// button only appears where the browser does (Android, desktop, iPad).
const fsBtn = $('fullscreen');
if (document.fullscreenEnabled) {
  fsBtn.classList.remove('hidden');
  app.classList.add('has-fullscreen');
  const paintFs = () => {
    const on = !!document.fullscreenElement;
    fsBtn.classList.toggle('on', on);
    fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
  };
  fsBtn.addEventListener('click', () => {
    const req = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    req.catch(() => {}); // denied or interrupted; the button just stays as it was
  });
  document.addEventListener('fullscreenchange', paintFs);
  paintFs();
}

// ---- game flow ---------------------------------------------------------------

let mode = 'title'; // 'title' | 'race' | 'results'
let paused = false;
let acc = 0;
let resultDelay = -1;
let lastRank = 0;
let shake = 0;
let camX = 0;
let fov = CAMERA.baseFov;
let clock = 0;

function startRace() {
  audio.unlock();
  race.reset();
  mode = 'race';
  paused = false;
  acc = 0;
  resultDelay = -1;
  shake = 0;
  camX = race.player.x;
  lastRank = 0;
  input.clear();
  particles.clear();
  world.gantry.set(-1);
  for (const id of ['title', 'results', 'paused']) $(id).classList.add('hidden');
  hud.root.classList.remove('hidden');
  hud.countdown.classList.add('hidden');
}

$('title').addEventListener('click', startRace); // tap anywhere; this tap also unlocks iOS audio
$('again').addEventListener('click', startRace);
$('resume').addEventListener('click', () => {
  audio.unlock();
  paused = false;
  $('paused').classList.add('hidden');
});

function pause() {
  if (mode !== 'race' || paused) return;
  paused = true;
  input.clear();
  $('paused').classList.remove('hidden');
}

const portraitQuery = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
portraitQuery.addEventListener?.('change', (e) => e.matches && pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pause();
    audio.suspend();
  } else {
    audio.resume();
  }
});

function showResults(result) {
  mode = 'results';
  hud.root.classList.add('hidden');
  hud.countdown.classList.add('hidden');
  const el = $('results');
  el.classList.toggle('win', result.win);
  el.classList.toggle('lose', !result.win);
  $('result-title').textContent = result.win ? 'VICTORY' : 'DEFEAT';
  $('result-reason').textContent =
    result.reason === 'time' ? `Time's up · ${RACE.timeLimit}s limit` : 'Finish line';
  $('result-line').textContent =
    result.reason === 'time'
      ? `You were ${result.rank}${ordinal(result.rank)} when the clock ran out`
      : `You finished ${result.rank}${ordinal(result.rank)} in ${fmtTime(result.time)}`;

  if (result.win) {
    const best = Number(store.get('rift-best'));
    if (!best || result.time < best) store.set('rift-best', String(result.time));
  }
  $('best-results').textContent = bestText();
  $('best-title').textContent = bestText();

  const list = $('standings');
  list.innerHTML = '';
  result.standings.forEach((p, i) => {
    const li = document.createElement('li');
    if (p.isPlayer) li.className = 'me';
    const color = '#' + new THREE.Color(p.color).getHexString();
    const t = p.time != null ? fmtTime(p.time) : `${Math.round(p.progress * 100)}%`;
    li.innerHTML = `<span>${i + 1}.</span><span class="swatch" style="background:${color}"></span>
      <span class="name">${p.isPlayer ? 'YOU' : p.name}</span><span class="t">${t}</span>`;
    list.appendChild(li);
  });
  el.classList.remove('hidden');
}

const tmpV = new THREE.Vector3();
const forward = new THREE.Vector3();

function handleEvents() {
  const player = race.player;
  for (const ev of race.events) {
    switch (ev.type) {
      case 'tick':
        showCountdown(String(ev.n));
        world.gantry.set(ev.n);
        audio.beep(false);
        break;
      case 'go':
        showCountdown('GO!', true);
        world.gantry.set(0);
        audio.beep(true);
        break;
      case 'stun': {
        track.pointAt(ev.pod.s, ev.pod.x, tmpV, POD.hoverHeight);
        track.tangentAt(ev.pod.s, forward).multiplyScalar(ev.pod.speed);
        particles.burst(tmpV, 26, PALETTE.rockA, 10, forward);
        if (ev.pod.isPlayer) {
          shake = CAMERA.shakeOnStun;
          restartAnim(hud.flash, 'on');
          audio.crash();
          navigator.vibrate?.(120);
        } else if (Math.abs(ev.pod.s - player.s) < 50) {
          audio.bump();
        }
        break;
      }
      case 'wall':
        if (ev.pod.isPlayer) {
          shake = Math.max(shake, 0.18);
          audio.wallHit();
        }
        break;
      case 'contact':
        if (ev.a.isPlayer || ev.b.isPlayer) {
          shake = Math.max(shake, 0.25);
          audio.bump();
        }
        break;
      case 'end':
        resultDelay = 1.6;
        audio.jingle(ev.result.win);
        break;
    }
  }
  race.events.length = 0;

  if (race.state === 'racing') {
    const rank = race.playerRank;
    if (lastRank && rank !== lastRank) audio.whoosh();
    lastRank = rank;
  }
}

// ---- layout ------------------------------------------------------------------

let viewW = 0;
let viewH = 0;
function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (!w || !h) return;
  viewW = w;
  viewH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

// iOS Safari fires 'resize' before the rotated layout settles, so the handler can
// read stale (portrait) dimensions and CSS then stretches the canvas. Re-check the
// laid-out size every frame and resize whenever it differs.
function syncSize() {
  if (app.clientWidth !== viewW || app.clientHeight !== viewH) resize();
}

// ---- per-frame visuals ---------------------------------------------------------

const basis = new THREE.Matrix4();
const look = new THREE.Vector3();
const maxTilt = THREE.MathUtils.degToRad(POD.maxTiltDeg);

function updatePods(alpha) {
  for (const v of views) {
    const p = v.pod;
    const s = p.prevS + (p.s - p.prevS) * alpha;
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const bob = Math.sin(clock * 3.1 + p.id * 1.7) * 0.07;
    track.pointAt(s, x, v.root.position, POD.hoverHeight + bob);
    trackBasis(track, s, basis);
    v.root.quaternion.setFromRotationMatrix(basis);

    const lean = THREE.MathUtils.clamp(p.vx / POD.maxLateralSpeed, -1, 1);
    let roll = -lean * maxTilt;
    let yaw = -Math.atan2(p.vx, Math.max(p.speed, 15)) * 0.8;
    let pitch = 0;
    if (p.stun > 0) {
      const w = Math.sin(clock * 34) * 0.4 * (p.stun / STUN.duration);
      roll += w;
      yaw += w * 0.5;
      pitch = w * 0.3;
    }
    v.body.rotation.set(pitch, yaw, roll, 'YXZ');
    // Blink while invulnerable after a stun.
    v.body.visible = !(p.invuln > 0 && Math.floor(clock * 14) % 2);

    const speedNorm = p.speed / POD.cruiseSpeed;
    for (const f of v.flames) {
      f.scale.set(1, 0.3 + speedNorm * 1.2 + Math.random() * 0.2, 1);
    }
    v.binder.material.opacity = 0.55 + Math.random() * 0.4;
    v.shadow.position.y = -(POD.hoverHeight + bob) + 0.08;

    // Wall sparks.
    if (p.wallContact !== 0 && p.speed > 10 && Math.random() < 0.6) {
      track.pointAt(s, x + p.wallContact * POD.halfWidth, tmpV, 0.6);
      track.tangentAt(s, forward).multiplyScalar(p.speed * 0.5);
      particles.burst(tmpV, 3, 0xffc46b, 6, forward);
    }
  }
}

function updateCamera(dt, alpha) {
  const p = race.player;
  const s = p.prevS + (p.s - p.prevS) * alpha;
  const x = p.prevX + (p.x - p.prevX) * alpha;
  const portrait = camera.aspect < 1;

  if (mode === 'title') {
    // Slow orbit around the grid as an attract screen.
    const a = clock * 0.18;
    track.pointAt(2, 0, look, 1.5);
    camera.position.set(look.x + Math.sin(a) * 15, look.y + 5.5, look.z + Math.cos(a) * 15);
    camera.lookAt(look);
    fov = CAMERA.baseFov + (portrait ? CAMERA.portraitFovBoost : 0);
  } else {
    camX += (x - camX) * (1 - Math.exp(-dt * 7));
    track.pointAt(s - CAMERA.behind, camX * 0.85, camera.position, CAMERA.height);
    track.pointAt(s + CAMERA.lookAhead, camX * 0.6, look, 1.2);
    const speedNorm = p.speed / POD.cruiseSpeed;
    const jitter = shake + speedNorm * 0.025;
    camera.position.x += (Math.random() - 0.5) * jitter;
    camera.position.y += (Math.random() - 0.5) * jitter;
    camera.lookAt(look);
    camera.rotateZ(-THREE.MathUtils.clamp(p.vx / POD.maxLateralSpeed, -1, 1) * 0.04);
    const target =
      CAMERA.baseFov +
      CAMERA.speedFov * Math.min(1.1, speedNorm) +
      (portrait ? CAMERA.portraitFovBoost : 0);
    fov += (target - fov) * (1 - Math.exp(-dt * 3));
    shake = Math.max(0, shake - dt * 1.6);
  }
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  world.sky.position.copy(camera.position);
}

function updateHud() {
  const rank = race.playerRank;
  hud.pos.textContent = rank;
  hud.suffix.textContent = ordinal(rank);
  hud.time.textContent = fmtTime(race.time);
  hud.timeBox.classList.toggle('warn', race.time > RACE.timeLimit - 10);
  hud.stun.classList.toggle('hidden', !race.player.stunned);
  race.pods.forEach((p, i) => {
    hud.dots[i].style.left = `${Math.min(1, Math.max(0, p.s / track.finishS)) * 100}%`;
  });
}

// ---- main loop: fixed-step simulation, render as fast as the device allows --

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const running = mode !== 'title' && !paused && !portraitQuery.matches;
  if (!running) dt = mode === 'title' ? dt : 0;
  clock += dt;

  if (running) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 8) {
      race.step(input.steer);
      handleEvents();
      acc -= DT;
      steps++;
    }
    if (steps === 8) acc = 0; // device fell way behind; don't spiral
    if (resultDelay > 0) {
      resultDelay -= dt;
      if (resultDelay <= 0) showResults(race.result);
    }
  }
  const alpha = running ? acc / DT : 1;

  updatePods(alpha);
  updateCamera(dt, alpha);
  streaks.update(dt, mode === 'title' ? 0 : race.player.speed / POD.cruiseSpeed);
  particles.update(dt);
  if (mode === 'race') updateHud();

  const p = race.player;
  audio.engine(p.speed / POD.cruiseSpeed, running, p.stunned);
  audio.scrape(running && p.wallContact !== 0 && p.speed > 8);

  syncSize();
  renderer.render(scene, camera);
}

requestAnimationFrame((t) => {
  last = t;
  $('loading').classList.add('hidden');
  frame(t);
});
