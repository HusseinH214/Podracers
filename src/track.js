import { CatmullRomCurve3, Vector3 } from 'three';
import { POD, RACE, BOTS, RUBBER_BAND, BOOST, SHORTCUT } from './config.js';
import { makeRng } from './rng.js';

const SAMPLE_STEP = 1; // metres between precomputed track frames
const UP = new Vector3(0, 1, 0);

// Hand-shaped width profile (fraction of the finish distance -> half-width).
// Wide start grid, then narrower sections that force decisions.
const WIDTH_PROFILE = [
  [0.0, 15],
  [0.07, 15],
  [0.14, 12],
  [0.28, 12],
  [0.34, 9],
  [0.46, 9],
  [0.52, 13],
  [0.66, 11],
  [0.72, 8.5],
  [0.86, 8.5],
  [0.92, 12],
  [1.1, 12],
];

export class Track {
  constructor() {
    this.finishS = RACE.targetCleanTime * POD.cruiseSpeed;
    this.length = this.finishS + 400; // run-out past the finish line
    this.#buildCurve();
    this.#sample();
    this.#placeObstacles();
    this.#placeBoost();
    this.#placeShortcut();
  }

  // ---- geometry -----------------------------------------------------------

  #buildCurve() {
    // Mostly forward (down -Z) with gentle bends: sharp turns don't work with
    // left/right-only steering.
    const pts = [new Vector3(0, 0, 60), new Vector3(0, 0, 0), new Vector3(0, 0, -160)];
    const seg = 230;
    let z = -160;
    let i = 0;
    while (-z < this.length + seg * 2) {
      i++;
      z -= seg;
      const x = 75 * Math.sin(i * 0.5) + 28 * Math.sin(i * 1.27 + 1);
      const y = 7 * Math.sin(i * 0.37) + 3 * Math.sin(i * 0.9);
      pts.push(new Vector3(x, y, z));
    }
    this.curve = new CatmullRomCurve3(pts, false, 'centripetal');
    this.curve.arcLengthDivisions = pts.length * 200;
    // The curve starts 60 m behind the grid; s = 0 is the start line.
    const lengths = this.curve.getLengths();
    this.curveLength = lengths[lengths.length - 1];
    this.startOffset = this.#arcLengthAtPoint(1, pts.length);
  }

  #arcLengthAtPoint(index, count) {
    const u = index / (count - 1);
    return this.curve.getLengths()[Math.round(u * this.curve.arcLengthDivisions)];
  }

  #sample() {
    const n = Math.ceil((this.length + 80) / SAMPLE_STEP) + 1;
    this.sampleCount = n;
    this.pos = new Float32Array(n * 3);
    this.tan = new Float32Array(n * 3);
    this.right = new Float32Array(n * 3);
    const p = new Vector3();
    const t = new Vector3();
    const r = new Vector3();
    for (let i = 0; i < n; i++) {
      const arc = Math.min(this.startOffset + (i - 40) * SAMPLE_STEP, this.curveLength);
      const u = Math.max(0, arc / this.curveLength);
      this.curve.getPointAt(u, p);
      this.curve.getTangentAt(u, t);
      r.crossVectors(t, UP).normalize();
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.tan.set([t.x, t.y, t.z], i * 3);
      this.right.set([r.x, r.y, r.z], i * 3);
    }
  }

  /** World position at distance s along the track and sideways offset x. */
  pointAt(s, x, out = new Vector3(), height = 0) {
    const f = Math.max(0, Math.min(this.sampleCount - 2, s / SAMPLE_STEP + 40));
    const i = Math.floor(f);
    const k = f - i;
    const a = i * 3;
    const b = a + 3;
    const P = this.pos;
    const R = this.right;
    out.set(
      P[a] + (P[b] - P[a]) * k + (R[a] + (R[b] - R[a]) * k) * x,
      P[a + 1] + (P[b + 1] - P[a + 1]) * k + height,
      P[a + 2] + (P[b + 2] - P[a + 2]) * k + (R[a + 2] + (R[b + 2] - R[a + 2]) * k) * x,
    );
    return out;
  }

  tangentAt(s, out = new Vector3()) {
    const f = Math.max(0, Math.min(this.sampleCount - 2, s / SAMPLE_STEP + 40));
    const i = Math.round(f) * 3;
    return out.set(this.tan[i], this.tan[i + 1], this.tan[i + 2]);
  }

  rightAt(s, out = new Vector3()) {
    const f = Math.max(0, Math.min(this.sampleCount - 2, s / SAMPLE_STEP + 40));
    const i = Math.round(f) * 3;
    return out.set(this.right[i], this.right[i + 1], this.right[i + 2]);
  }

  halfWidthAt(s) {
    const u = s / this.finishS;
    const W = WIDTH_PROFILE;
    if (u <= W[0][0]) return W[0][1];
    for (let i = 1; i < W.length; i++) {
      if (u <= W[i][0]) {
        const [u0, w0] = W[i - 1];
        const [u1, w1] = W[i];
        const k = (u - u0) / (u1 - u0);
        const e = k * k * (3 - 2 * k); // smoothstep so walls don't kink
        return w0 + (w1 - w0) * e;
      }
    }
    return W[W.length - 1][1];
  }

  /** Sideways limit for a pod's centre. */
  limitAt(s) {
    return this.halfWidthAt(s) - POD.halfWidth;
  }

  /** Canyon wall offset on one side (as |x|): the half-width, opened out along the shortcut. */
  wallAt(s, side) {
    const hw = this.halfWidthAt(s);
    const sc = this.shortcut;
    if (!sc || side !== sc.side || s <= sc.sIn || s >= sc.sEnd) return hw;
    const open =
      s < sc.sOut ? smooth01((s - sc.sIn) / SHORTCUT.open) : 1 - smooth01((s - sc.sOut) / SHORTCUT.exit);
    return hw + (SHORTCUT.ridge + SHORTCUT.width) * open;
  }

  /**
   * Sideways limits for the player's pod centre near the shortcut, or null away
   * from it. `inside` is true in the tunnel proper. `guided` is the side whose
   * wall folds back in at the exit, which pods slide along instead of scraping.
   */
  shortcutBounds(s, x) {
    const sc = this.shortcut;
    if (!sc || s < sc.sIn || s > sc.sEnd) return null;
    const hw = this.halfWidthAt(s);
    const lim = hw - POD.halfWidth;
    const u = sc.side * x; // sideways offset measured toward the tunnel
    let lo = -lim;
    let hi = this.wallAt(s, sc.side) - POD.halfWidth;
    let inside = false;
    if (s >= sc.sNose && s <= sc.sOut) {
      // The ridge splits canyon and tunnel: stay on whichever side you're on.
      inside = u > hw + SHORTCUT.ridge / 2;
      if (inside) lo = hw + SHORTCUT.ridge + POD.halfWidth;
      else hi = lim;
    }
    const guided = s > sc.sOut ? sc.side : 0;
    return sc.side > 0 ? { lo, hi, inside, guided } : { lo: -hi, hi: -lo, inside, guided };
  }

  // ---- obstacles ----------------------------------------------------------

  #placeObstacles() {
    const rng = makeRng(RACE.obstacleSeed);
    this.obstacles = [];
    this.rows = [];
    this.rejectedRows = 0;

    // Fastest any pod can go (best bot + full rubber-band boost).
    const fastest =
      POD.cruiseSpeed * Math.max(1, ...BOTS.map((b) => b.topSpeed)) * (1 + RUBBER_BAND.maxBoost);

    let prevGaps = null;
    let prevEnd = RACE.startObstaclesAt - 200;
    let s = RACE.startObstaclesAt;
    const end = this.finishS - RACE.finishClearZone;

    while (s < end) {
      const progress = s / this.finishS;
      let row = null;
      for (let attempt = 0; attempt < 40 && !row; attempt++) {
        const candidate = this.#makeRow(rng, s, progress);
        const gaps = this.#gapsFor(candidate.obstacles, s);
        if (!gaps.length) continue;
        const d = candidate.sMin - prevEnd;
        const reach = lateralReach(d / fastest);
        if (prevGaps && !everyPointCanReach(prevGaps, gaps, reach)) continue;
        if (!prevGaps && !everyPointCanReach([[-this.limitAt(s), this.limitAt(s)]], gaps, reach)) {
          continue;
        }
        candidate.gaps = gaps;
        row = candidate;
      }
      if (row) {
        row.index = this.rows.length;
        for (const o of row.obstacles) o.row = row.index;
        this.rows.push(row);
        this.obstacles.push(...row.obstacles);
        prevGaps = row.gaps;
        prevEnd = row.sMax;
      } else {
        this.rejectedRows++;
      }
      // Rows come closer together as the race goes on.
      s += lerp(92, 62, progress) + rng.range(0, 22);
    }
    this.obstacles.sort((a, b) => a.s - b.s);
  }

  #makeRow(rng, s, progress) {
    const hw = this.halfWidthAt(s);
    const obstacles = [];
    const roll = rng();
    let kind;
    if (progress < 0.12) kind = roll < 0.75 ? 'rocks' : 'pillars';
    else kind = roll < 0.45 ? 'rocks' : roll < 0.72 ? 'arch' : 'pillars';

    const row = { s, kind, obstacles, beam: null };

    if (kind === 'rocks') {
      const count = rng.int(1, hw > 11 ? 3 : 2);
      for (let i = 0; i < count; i++) {
        const w = rng.range(1.6, 3.8);
        obstacles.push({
          kind: 'rock',
          s: s + rng.range(-2.5, 2.5),
          x: rng.range(-hw + w * 0.5, hw - w * 0.5),
          hw: w,
          hl: w * rng.range(0.7, 1.1),
          h: w * rng.range(0.8, 1.4),
          seed: rng(),
        });
      }
    } else if (kind === 'pillars') {
      const count = rng.int(2, hw > 11 ? 4 : 3);
      for (let i = 0; i < count; i++) {
        const w = rng.range(0.9, 1.5);
        obstacles.push({
          kind: 'pillar',
          s: s + rng.range(-4, 4),
          x: rng.range(-hw + 1, hw - 1),
          hw: w,
          hl: w,
          h: rng.range(9, 18),
          seed: rng(),
        });
      }
    } else {
      // Arch: a wall across the canyon with one opening (two on wide sections).
      const openings = hw > 11 && rng() < 0.5 ? 2 : 1;
      const holes = [];
      for (let i = 0; i < openings; i++) {
        const width = rng.range(4.2, 6.5) + POD.halfWidth * 2;
        const lo = -hw + 1 + rng() * (2 * hw - 2 - width);
        holes.push([lo, lo + width]);
      }
      holes.sort((a, b) => a[0] - b[0]);
      // Merge overlapping holes, then fill the solid spans between them.
      const merged = [];
      for (const h of holes) {
        const last = merged[merged.length - 1];
        if (last && h[0] <= last[1]) last[1] = Math.max(last[1], h[1]);
        else merged.push([...h]);
      }
      let cursor = -hw - 2;
      const spans = [];
      for (const [lo, hi] of merged) {
        spans.push([cursor, lo]);
        cursor = hi;
      }
      spans.push([cursor, hw + 2]);
      for (const [lo, hi] of spans) {
        if (hi - lo < 0.2) continue;
        obstacles.push({
          kind: 'wall',
          s,
          x: (lo + hi) / 2,
          hw: (hi - lo) / 2,
          hl: 1.1,
          h: 10,
          seed: rng(),
        });
      }
      row.beam = { s, x: 0, hw: hw + 2, y: 10 };
    }

    row.sMin = Math.min(...obstacles.map((o) => o.s - o.hl));
    row.sMax = Math.max(...obstacles.map((o) => o.s + o.hl));
    return row;
  }

  /** Open intervals of pod-centre positions that pass a row (conservative: full visual size). */
  #gapsFor(obstacles, s) {
    const lim = this.limitAt(s);
    const blocked = obstacles
      .map((o) => [o.x - o.hw - POD.halfWidth, o.x + o.hw + POD.halfWidth])
      .sort((a, b) => a[0] - b[0]);
    const gaps = [];
    let cursor = -lim;
    for (const [lo, hi] of blocked) {
      if (lo > cursor) gaps.push([cursor, Math.min(lo, lim)]);
      cursor = Math.max(cursor, hi);
      if (cursor >= lim) break;
    }
    if (cursor < lim) gaps.push([cursor, lim]);
    return gaps.filter(([lo, hi]) => hi - lo >= 0.9);
  }

  /**
   * The boost pickup sits in the middle of the tightest gap between two
   * obstacles (not against a canyon wall) in the second half of the course,
   * on a row that has another way through, so grabbing it is a risk you choose.
   * Gaps are measured at full visual size, so the centre is always clear.
   */
  #placeBoost() {
    const from = this.finishS * BOOST.pickupFrom;
    const to = this.finishS * BOOST.pickupTo;
    let best = null;
    let fallback = null;
    for (const row of this.rows) {
      if (row.s < from || row.s > to) continue;
      const lim = this.limitAt(row.s);
      for (const [lo, hi] of row.gaps) {
        const width = hi - lo;
        const spot = { s: row.s, x: (lo + hi) / 2, width, row: row.index };
        if (!fallback || width < fallback.width) fallback = spot;
        const between = row.gaps.length > 1 && lo > -lim + 0.01 && hi < lim - 0.01;
        if (between && width >= BOOST.minGap && (!best || width < best.width)) best = spot;
      }
    }
    this.boostPickup = best ?? fallback;
    // Every boost cell on the course; the shortcut adds its own.
    this.pickups = this.boostPickup ? [this.boostPickup] : [];
  }

  /**
   * The shortcut tunnel goes on the inside of the sharpest bend in its stretch,
   * where nothing crowds that canyon wall at the entrance or the exit, and away
   * from the boost pickup. Main-track rows are left exactly as they are.
   */
  #placeShortcut() {
    const { mouth, length, exit, ridge, width } = SHORTCUT;
    const spanEnd = this.finishS * SHORTCUT.to;
    let best = null;
    for (let sIn = this.finishS * SHORTCUT.from; sIn + mouth + length + exit <= spanEnd; sIn += 5) {
      const sNose = sIn + mouth;
      const sOut = sNose + length;
      const sEnd = sOut + exit;
      let bend = 0;
      for (let s = sNose; s <= sOut; s += 10) bend += this.#curvatureAt(s);
      const side = bend < 0 ? -1 : 1;
      const pick = this.boostPickup;
      if (pick && pick.s > sIn - 60 && pick.s < sEnd + 60) continue;
      if (this.#crowdsWall(side, sIn - 25, sNose + 5) || this.#crowdsWall(side, sOut - 10, sEnd + 20)) continue;
      if (!best || Math.abs(bend) > best.bend) best = { side, sIn, sNose, sOut, sEnd, bend: Math.abs(bend) };
    }
    this.shortcut = best;
    if (!best) return;

    // Ridge nose: hitting it head-on is a crash like any rock (it is never drawn
    // as an obstacle; the ridge mesh covers it).
    const hw = this.halfWidthAt(best.sNose);
    this.obstacles.push({
      kind: 'ridge',
      s: best.sNose + 1.5,
      x: best.side * (hw + ridge / 2),
      hw: ridge / 2,
      hl: 1.5,
      h: 10,
      seed: 0.5,
    });
    // Pillars alternate between the ridge side and the outer wall: a slalom.
    const { pillarSize: size, pillarInset: inset } = SHORTCUT;
    SHORTCUT.pillars.forEach((k, i) => {
      const s = best.sNose + length * k;
      const inner = this.halfWidthAt(s) + ridge;
      const u = i % 2 === 0 ? inner + inset : inner + width - inset;
      this.obstacles.push({ kind: 'pillar', s, x: best.side * u, hw: size, hl: size, h: 13, seed: 0.3 + i * 0.2 });
    });
    this.obstacles.sort((a, b) => a.s - b.s);

    // Bonus boost cell just before the middle pillar, on the side you weave
    // through, so a clean slalom collects it.
    const k = SHORTCUT.pillars[SHORTCUT.boostAtPillar];
    const s = best.sNose + length * k - SHORTCUT.boostLead;
    const inner = this.halfWidthAt(s) + ridge;
    const u = SHORTCUT.boostAtPillar % 2 === 0 ? inner + width - SHORTCUT.boostInset : inner + SHORTCUT.boostInset;
    this.pickups.push({ s, x: best.side * u, shortcut: true });
  }

  /** Signed curvature: positive when the track bends toward +x (right). */
  #curvatureAt(s) {
    const a = this.tangentAt(s - 5);
    const b = this.tangentAt(s + 5);
    return b.sub(a).dot(this.rightAt(s)) / 10;
  }

  /** True if any obstacle between s0 and s1 comes within a pod's width of one canyon wall. */
  #crowdsWall(side, s0, s1) {
    return this.obstacles.some(
      (o) =>
        o.s + o.hl >= s0 &&
        o.s - o.hl <= s1 &&
        side * o.x + o.hw + POD.halfWidth > this.limitAt(o.s) - 1,
    );
  }

  /** Index of the first obstacle with s >= value (binary search). */
  obstacleIndexAt(value) {
    let lo = 0;
    let hi = this.obstacles.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.obstacles[mid].s < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/** How far sideways a pod can travel in time t, starting from rest, after a reaction delay. */
export function lateralReach(t, reaction = 0.3) {
  const T = Math.max(0, t - reaction);
  const v = POD.maxLateralSpeed;
  const a = POD.lateralAccel;
  const tAccel = v / a;
  const d = T < tAccel ? 0.5 * a * T * T : (v * v) / (2 * a) + v * (T - tAccel);
  return d * 0.85; // safety margin
}

function everyPointCanReach(fromGaps, toGaps, reach) {
  for (const [lo, hi] of fromGaps) {
    for (let p = lo; p <= hi + 1e-6; p += 0.5) {
      const ok = toGaps.some(([a, b]) => p >= a - reach && p <= b + reach);
      if (!ok) return false;
    }
  }
  return true;
}

function smooth01(t) {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}
