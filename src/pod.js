import { POD, WALL, STUN, BOOST } from './config.js';

// A pod is two numbers: distance along the track (s) and sideways offset (x).
// Speed always moves it forward; steering only changes sideways velocity, so a
// pod can never spin around. Player and bots run exactly this code.
export class Pod {
  constructor({ id, name, color, isPlayer = false, topSpeed = 1, lateralSkill = 1 }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.isPlayer = isPlayer;
    this.topSpeedMult = topSpeed;
    this.lateralSkill = lateralSkill;
    this.reset(0);
  }

  reset(x) {
    this.s = 0;
    this.x = x;
    this.prevS = 0;
    this.prevX = x;
    this.vx = 0;
    this.speed = 0;
    this.steer = 0;
    this.stun = 0;
    this.invuln = 0;
    this.wallContact = 0; // -1 left wall, 1 right wall, 0 none
    this.finished = false;
    this.finishOrder = 0;
    this.finishTime = null;
    this.stunCount = 0;
    this.warped = false; // gone from the track after the finish outro
    this.hasBoost = false; // holding an unused boost
    this.boostUsed = false;
    this.boost = 0; // seconds of boost left
  }

  get boosting() {
    return this.boost > 0;
  }

  /** Fire the held boost. It also shakes off a stun, so it works as a crash recovery. */
  activateBoost() {
    if (!this.hasBoost) return false;
    this.hasBoost = false;
    this.boostUsed = true;
    this.boost = BOOST.duration;
    this.stun = 0;
    this.invuln = 0;
    this.speed = Math.max(this.speed, this.topSpeed * BOOST.kick);
    return true;
  }

  /** Leave the track: stop dead so nothing (camera, audio, streaks) keeps moving. */
  warpOut() {
    this.warped = true;
    this.speed = 0;
    this.vx = 0;
    this.prevS = this.s;
    this.prevX = this.x;
    this.wallContact = 0;
    this.stun = 0;
    this.invuln = 0;
    this.boost = 0;
  }

  get topSpeed() {
    return POD.cruiseSpeed * this.topSpeedMult;
  }

  get stunned() {
    return this.stun > 0;
  }

  /**
   * Advance one fixed step. `steer` is -1 (left), 0 or 1 (right).
   * Returns an event name when the pod hits a wall this step.
   */
  update(dt, track, steer, speedMult = 1) {
    this.prevS = this.s;
    this.prevX = this.x;

    if (this.stun > 0) {
      this.stun -= dt;
      steer = 0;
      if (this.stun <= 0) this.invuln = STUN.invulnerable;
    } else if (this.invuln > 0) {
      this.invuln = Math.max(0, this.invuln - dt);
    }
    this.steer = steer;

    // Sideways: ease toward the target velocity so the pod never snaps.
    const target = steer * POD.maxLateralSpeed * this.lateralSkill;
    const speeding = steer !== 0 && Math.sign(target - this.vx) === steer;
    const a = speeding ? POD.lateralAccel : POD.lateralDecel;
    const dv = target - this.vx;
    this.vx += Math.sign(dv) * Math.min(Math.abs(dv), a * dt);

    // Forward: automatic throttle up to top speed, raised while boosting.
    const boosting = this.boost > 0;
    if (boosting) this.boost = Math.max(0, this.boost - dt);
    const top = this.topSpeed * speedMult * (boosting ? BOOST.speedMult : 1);
    if (this.stun > 0) {
      this.speed = Math.max(0, this.speed - 3 * dt);
    } else if (this.speed < top) {
      this.speed = Math.min(top, this.speed + (boosting ? BOOST.accel : POD.accel) * dt);
    } else {
      this.speed = Math.max(top, this.speed - POD.accel * 0.5 * dt);
    }

    this.s += this.speed * dt;
    this.x += this.vx * dt;

    // Walls: clamp, bounce a little, scrape speed. Never a stun.
    const lim = track.limitAt(this.s);
    let event = null;
    const side = this.x > lim ? 1 : this.x < -lim ? -1 : 0;
    if (side !== 0) {
      this.x = side * lim;
      if (Math.sign(this.vx) === side) {
        const impact = Math.abs(this.vx);
        if (impact > 4 && this.wallContact === 0) event = 'wall';
        this.speed = Math.max(0, this.speed - impact * 0.35);
        this.vx = -this.vx * WALL.bounce;
      }
      this.speed = Math.max(0, this.speed - WALL.scrapeDecel * dt);
    }
    this.wallContact = side;
    return event;
  }

  /** Swept test: did the segment this pod moved this step cross the obstacle's box? */
  sweptHit(o) {
    const halfS = (o.hl + POD.halfLength) * POD.hitboxShrink;
    const halfX = (o.hw + POD.halfWidth) * POD.hitboxShrink;
    return segmentHitsBox(
      this.prevS - o.s,
      this.prevX - o.x,
      this.s - o.s,
      this.x - o.x,
      halfS,
      halfX,
    );
  }

  applyStun() {
    this.speed *= STUN.speedFactor;
    this.stun = STUN.duration;
    this.stunCount++;
  }
}

// Slab test of segment (s0,x0)->(s1,x1) against the box |s|<=hs, |x|<=hx.
function segmentHitsBox(s0, x0, s1, x1, hs, hx) {
  let tMin = 0;
  let tMax = 1;
  const ds = s1 - s0;
  const dx = x1 - x0;
  for (const [p, d, h] of [
    [s0, ds, hs],
    [x0, dx, hx],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < -h || p > h) return false;
    } else {
      let t0 = (-h - p) / d;
      let t1 = (h - p) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      tMin = Math.max(tMin, t0);
      tMax = Math.min(tMax, t1);
      if (tMin > tMax) return false;
    }
  }
  return true;
}
