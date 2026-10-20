import { POD } from './config.js';

// A bot only produces the same -1 / 0 / 1 steering input the player has.
// Personality settings decide how far it looks, how close it cuts, and how
// often it gets things wrong.
export class BotDriver {
  constructor(pod, profile, rng) {
    this.pod = pod;
    this.p = profile;
    this.rng = rng;
    this.rowCursor = 0;
    this.plan = null; // { row, target, late }
    this.lane = 0;
    this.laneTimer = 0;
  }

  decide(race, dt) {
    const pod = this.pod;
    const track = race.track;
    const rows = track.rows;
    const lim = track.limitAt(pod.s) - 0.3;

    // Advance to the next row the pod hasn't fully passed.
    while (this.rowCursor < rows.length && rows[this.rowCursor].sMax < pod.s - POD.halfLength) {
      this.rowCursor++;
    }
    const row = rows[this.rowCursor];
    const rowDist = row ? row.sMin - pod.s : Infinity;

    // Default racing line: drift between lanes now and then.
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + this.rng() * 3;
      this.lane = this.p.personality === 'Steady' ? this.rng.range(-2, 2) : this.rng.range(-lim, lim) * 0.6;
    }
    let target = this.lane;
    let bounds = [-lim, lim];

    if (row && rowDist < this.p.lookAhead) {
      if (!this.plan || this.plan.row !== row.index) this.plan = this.#planRow(row);
      const reactAt = this.plan.late ? this.p.lookAhead * 0.3 : Infinity;
      if (rowDist < reactAt) {
        target = this.plan.target;
        bounds = this.plan.bounds;
      }
    }

    // Bully: lean into the player when alongside and nothing is close ahead.
    const player = race.player;
    if (this.p.bully && !player.finished && rowDist > 30) {
      const ds = player.s - pod.s;
      if (ds > -5 && ds < 8) target = player.x;
    }

    // Other pods are moving obstacles: steer around one that's just ahead.
    for (const other of race.pods) {
      if (other === pod || other.warped || (this.p.bully && other === player)) continue;
      const ds = other.s - pod.s;
      const dx = other.x - pod.x;
      if (ds > 0 && ds < 14 && Math.abs(dx) < POD.halfWidth * 2.2) {
        target = pod.x + (dx >= 0 ? -3 : 3);
      }
    }

    target = Math.max(bounds[0], Math.min(bounds[1], target));
    target = Math.max(-lim, Math.min(lim, target));

    // Steer like a person would: account for the distance needed to stop sliding.
    const stop = (pod.vx * pod.vx) / (2 * POD.lateralDecel);
    const predicted = pod.x + Math.sign(pod.vx) * stop;
    const err = target - predicted;
    const dead = 0.25;
    return err > dead ? 1 : err < -dead ? -1 : 0;
  }

  #planRow(row) {
    const pod = this.pod;
    const margin = this.p.gapMargin;
    const options = row.gaps.map(([lo, hi]) => {
      const width = hi - lo;
      const m = Math.min(margin, width / 2);
      const target = Math.max(lo + m, Math.min(hi - m, pod.x));
      // Steady prefers wide gaps and their middle; others take the nearest.
      let cost = Math.abs(target - pod.x);
      if (this.p.personality === 'Steady') cost -= width * 0.4;
      return { target, bounds: [lo + m, hi - m], cost };
    });
    options.sort((a, b) => a.cost - b.cost);
    let choice = options[0];
    let late = false;

    if (this.rng() < this.p.mistakeRate) {
      if (this.rng() < 0.5) {
        late = true; // reacts too late
      } else if (options.length > 1) {
        choice = options[1 + Math.floor(this.rng() * (options.length - 1))]; // wrong gap
      } else {
        const hold = pod.x;
        choice = { target: hold, bounds: [hold - 0.1, hold + 0.1] }; // misjudges and holds line
      }
    }
    return { row: row.index, target: choice.target, bounds: choice.bounds, late };
  }
}
