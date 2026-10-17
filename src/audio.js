// All sounds are synthesised with the Web Audio API: no files to download,
// nothing to license. The context must be created/resumed inside a user tap
// (iOS rule), which is what unlock() is for.
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.scrapeLevel = 0;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.#build();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  #build() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    // Noise buffer reused by crash / scrape / whoosh.
    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Engine: two detuned oscillators through a low-pass filter.
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 6;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    const bGain = ctx.createGain();
    bGain.gain.value = 0.4;
    this.oscA.connect(this.engineFilter);
    this.oscB.connect(bGain).connect(this.engineFilter);
    // A slow wobble makes it sound like a rattly racing engine.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 23;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain);
    lfoGain.connect(this.oscA.frequency);
    lfoGain.connect(this.oscB.frequency);
    for (const o of [this.oscA, this.oscB, lfo]) o.start();

    // Wall scrape: looping filtered noise, volume driven each frame.
    const scrape = ctx.createBufferSource();
    scrape.buffer = this.noise;
    scrape.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600;
    bp.Q.value = 1.5;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    scrape.connect(bp).connect(this.scrapeGain).connect(this.master);
    scrape.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }

  /** speedNorm 0..~1.1; on = engine running at all */
  engine(speedNorm, on, stunned) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 55 + speedNorm * 120 - (stunned ? 25 : 0);
    this.oscA.frequency.setTargetAtTime(base, t, 0.08);
    this.oscB.frequency.setTargetAtTime(base * 1.505, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speedNorm * 1800, t, 0.1);
    this.engineGain.gain.setTargetAtTime(on ? 0.07 + speedNorm * 0.06 : 0, t, 0.15);
  }

  scrape(on) {
    if (!this.ctx) return;
    this.scrapeGain.gain.setTargetAtTime(on ? 0.18 : 0, this.ctx.currentTime, on ? 0.02 : 0.08);
  }

  #noiseBurst({ dur, freq, type = 'lowpass', q = 1, gain = 0.5, sweepTo }) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  #tone(freq, dur, { type = 'sine', gain = 0.25, at = 0, slideTo } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  crash() {
    if (!this.ctx) return;
    this.#noiseBurst({ dur: 0.6, freq: 2400, sweepTo: 120, gain: 0.9 });
    this.#tone(110, 0.4, { type: 'triangle', gain: 0.6, slideTo: 35 });
  }

  bump() {
    if (!this.ctx) return;
    this.#noiseBurst({ dur: 0.18, freq: 900, sweepTo: 200, gain: 0.45 });
    this.#tone(140, 0.15, { type: 'triangle', gain: 0.3, slideTo: 70 });
  }

  wallHit() {
    if (!this.ctx) return;
    this.#noiseBurst({ dur: 0.25, freq: 3500, type: 'bandpass', q: 2, gain: 0.5, sweepTo: 1200 });
  }

  whoosh() {
    if (!this.ctx) return;
    this.#noiseBurst({ dur: 0.45, freq: 400, type: 'bandpass', q: 3, gain: 0.35, sweepTo: 2500 });
  }

  beep(go) {
    if (!this.ctx) return;
    this.#tone(go ? 880 : 440, go ? 0.5 : 0.22, { type: 'square', gain: 0.12 });
  }

  jingle(win) {
    if (!this.ctx) return;
    const notes = win ? [523, 659, 784, 1047] : [440, 415, 392, 330];
    notes.forEach((f, i) => this.#tone(f, 0.28, { type: 'square', gain: 0.1, at: i * 0.14 }));
  }
}
