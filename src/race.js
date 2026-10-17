import { DT, RACE, POD, BOTS, CONTACT, RUBBER_BAND, PLAYER_COLOR } from './config.js';
import { Pod } from './pod.js';
import { BotDriver } from './bot.js';
import { makeRng } from './rng.js';

const GRID = [-4.5, -1.5, 1.5, 4.5];
const PLAYER_SLOT = 2;

// Pure race simulation: no rendering, no DOM. Runs at a fixed timestep and
// reports what happened through `events` for the renderer and audio.
export class Race {
  constructor(track) {
    this.track = track;
    this.player = new Pod({ id: 0, name: 'YOU', color: PLAYER_COLOR, isPlayer: true });
    this.bots = BOTS.map(
      (profile, i) =>
        new Pod({
          id: i + 1,
          name: profile.name,
          color: profile.color,
          topSpeed: profile.topSpeed,
          lateralSkill: profile.lateralSkill,
        }),
    );
    this.pods = [this.player, ...this.bots];
    this.events = [];
    this.reset();
  }

  reset(seed = (Math.random() * 2 ** 32) >>> 0) {
    const rng = makeRng(seed);
    const slots = GRID.filter((_, i) => i !== PLAYER_SLOT);
    this.player.reset(GRID[PLAYER_SLOT]);
    this.drivers = this.bots.map((pod, i) => {
      pod.reset(slots[i]);
      return new BotDriver(pod, BOTS[i], rng);
    });
    this.autopilot = null;
    this.state = 'countdown';
    this.countdown = RACE.countdown;
    this.time = 0;
    this.finishCount = 0;
    this.standings = [...this.pods];
    this.result = null;
    this.contactCooldown = new Map();
    this.events.length = 0;
    this.lastTick = Math.ceil(this.countdown) + 1;
  }

  get playerRank() {
    return this.standings.indexOf(this.player) + 1;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  step(playerSteer) {
    if (this.state === 'countdown') {
      this.countdown -= DT;
      const tick = Math.ceil(this.countdown);
      if (tick !== this.lastTick && tick > 0) this.emit('tick', { n: tick });
      this.lastTick = tick;
      if (this.countdown <= 0) {
        this.state = 'racing';
        this.emit('go');
      }
      return;
    }

    if (this.state === 'racing') this.time += DT;

    // Player input (after finishing, a bot drives the player's pod for the outro).
    let steerP = playerSteer;
    if (this.player.finished || this.state === 'done') {
      this.autopilot ??= new BotDriver(this.player, { ...BOTS[1], mistakeRate: 0 }, makeRng(7));
      steerP = this.autopilot.decide(this, DT);
    }

    const steers = this.drivers.map((d) => d.decide(this, DT));

    this.#movePod(this.player, steerP, 1);
    this.bots.forEach((pod, i) => this.#movePod(pod, steers[i], this.#rubberBand(pod)));

    this.#podContacts();
    this.#checkFinish();
    this.#rank();

    if (this.state === 'racing' && this.time >= RACE.timeLimit) this.#endRace('time');
  }

  #movePod(pod, steer, speedMult) {
    const hit = pod.update(DT, this.track, steer, speedMult);
    if (hit) this.emit('wall', { pod });

    if (pod.stun > 0 || pod.invuln > 0) return;
    const obs = this.track.obstacles;
    const reach = 25; // longest obstacle half-length + pod length, with room to spare
    for (let i = this.track.obstacleIndexAt(pod.prevS - reach); i < obs.length; i++) {
      const o = obs[i];
      if (o.s > pod.s + reach) break;
      if (pod.sweptHit(o)) {
        pod.applyStun();
        this.#knockOut(pod, o);
        this.emit('stun', { pod, obstacle: o });
        break;
      }
    }
  }

  // Shove a stunned pod out of the obstacle sideways so it never drives through rock.
  #knockOut(pod, o) {
    const lim = this.track.limitAt(pod.s);
    const halfX = (o.hw + POD.halfWidth) * POD.hitboxShrink + 0.05;
    const candidates = [o.x - halfX, o.x + halfX]
      .filter((x) => Math.abs(x) <= lim)
      .sort((a, b) => Math.abs(a - pod.x) - Math.abs(b - pod.x));
    if (candidates.length) {
      pod.x = candidates[0];
      pod.vx = Math.sign(pod.x - o.x) * 5;
    } else {
      pod.s = o.s - (o.hl + POD.halfLength) * POD.hitboxShrink - 0.05;
      pod.vx = 0;
    }
  }

  #rubberBand(pod) {
    if (this.player.finished) return 1;
    const d = pod.s - this.player.s;
    const { deadZone, range, maxSlow, maxBoost } = RUBBER_BAND;
    if (Math.abs(d) <= deadZone) return 1;
    const k = Math.min(1, (Math.abs(d) - deadZone) / (range - deadZone));
    return d > 0 ? 1 - maxSlow * k : 1 + maxBoost * k;
  }

  #podContacts() {
    const pods = this.pods;
    for (const [key, t] of this.contactCooldown) {
      if (t - DT <= 0) this.contactCooldown.delete(key);
      else this.contactCooldown.set(key, t - DT);
    }
    for (let i = 0; i < pods.length; i++) {
      for (let j = i + 1; j < pods.length; j++) {
        const a = pods[i];
        const b = pods[j];
        const ds = Math.abs(a.s - b.s);
        const dx = b.x - a.x;
        const minX = POD.halfWidth * 2 * 0.9;
        if (ds >= POD.halfLength * 2 || Math.abs(dx) >= minX) continue;
        // Separate them sideways.
        const dir = dx === 0 ? (a.id < b.id ? 1 : -1) : Math.sign(dx);
        const overlap = minX - Math.abs(dx);
        a.x -= (dir * overlap) / 2;
        b.x += (dir * overlap) / 2;
        const key = a.id * 8 + b.id;
        if (this.contactCooldown.has(key)) continue;
        this.contactCooldown.set(key, CONTACT.cooldown);
        a.vx = -dir * CONTACT.push;
        b.vx = dir * CONTACT.push;
        a.speed *= CONTACT.speedFactor;
        b.speed *= CONTACT.speedFactor;
        this.emit('contact', { a, b });
      }
    }
  }

  #checkFinish() {
    const line = this.track.finishS;
    const crossed = this.pods.filter((p) => !p.finished && p.s >= line);
    if (!crossed.length) return;
    // Same-step crossings: whoever is further past the line wins.
    crossed.sort((a, b) => b.s - a.s);
    for (const pod of crossed) {
      pod.finished = true;
      pod.finishOrder = ++this.finishCount;
      const over = pod.speed > 0 ? (pod.s - line) / pod.speed : 0;
      pod.finishTime = Math.max(0, this.time - over);
      this.emit('finish', { pod });
    }
    if (this.state === 'racing' && this.player.finished) this.#endRace('finish');
  }

  #rank() {
    this.standings.sort((a, b) => {
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.s - a.s;
    });
  }

  #endRace(reason) {
    this.#rank();
    this.state = 'done';
    const rank = this.playerRank;
    this.result = {
      reason,
      rank,
      win: rank === 1,
      time: this.player.finished ? this.player.finishTime : null,
      standings: this.standings.map((p) => ({
        name: p.name,
        color: p.color,
        isPlayer: p.isPlayer,
        time: p.finishTime,
        progress: Math.min(1, p.s / this.track.finishS),
      })),
    };
    this.emit('end', { result: this.result });
  }
}
