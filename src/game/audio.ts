// MANSION OF THE DEAD — procedural WebAudio engine.
// Everything is synthesized: dread drone, haunted music-box layer, and SFX.

export type AudioMode = "off" | "title" | "calm" | "dread";

export class AudioSys {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private mode: AudioMode = "off";
  muted = false;

  private pluckT = 2;
  private stingerT = 9;
  private stepFlip = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    // shared noise buffer
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // echo bus (poor man's reverb)
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.master);

    // ---- dread drone ----
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 190;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.057;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 90;
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    lfo.start();

    const mk = (type: OscillatorType, f: number, g: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og);
      og.connect(lp);
      o.start();
    };
    mk("sawtooth", 41.2, 0.5);
    mk("sawtooth", 41.7, 0.42);
    mk("sine", 82.4, 0.4);
    mk("triangle", 123.5, 0.14);
    lp.connect(this.droneGain);
    this.droneGain.connect(this.master);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
    this.musicGain.connect(this.delay);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  setMode(m: AudioMode) {
    if (!this.ctx || this.mode === m) return;
    this.mode = m;
    const t = this.ctx.currentTime;
    const drone = m === "dread" ? 0.17 : m === "title" ? 0.07 : 0.045;
    const music = m === "calm" ? 0.5 : m === "title" ? 0.14 : 0.1;
    this.droneGain?.gain.setTargetAtTime(drone, t, 1.2);
    this.musicGain?.gain.setTargetAtTime(music, t, 1.4);
  }

  /** driven from game loop — schedules haunted ambience */
  tick(dt: number) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    this.pluckT -= dt;
    this.stingerT -= dt;
    if (this.pluckT <= 0) {
      this.pluckT = this.mode === "calm" ? 1.9 + Math.random() * 2.2 : 5 + Math.random() * 7;
      const scale =
        this.mode === "calm"
          ? [220, 261.63, 329.63, 392, 440, 523.25]
          : [110, 130.81, 164.81, 220, 233.08];
      const f = scale[(Math.random() * scale.length) | 0];
      this.musicBox(f, this.mode === "calm" ? 0.5 : 0.22);
    }
    if (this.stingerT <= 0) {
      this.stingerT = 9 + Math.random() * 14;
      if (this.mode === "dread" || this.mode === "title") this.stinger();
    }
  }

  private musicBox(f: number, vol: number) {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 2.7);
  }

  private stinger() {
    const ctx = this.ctx;
    if (!ctx || !this.droneGain) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(96, t);
    o.frequency.exponentialRampToValueAtTime(49, t + 2.4);
    const o2 = ctx.createOscillator();
    o2.type = "sawtooth";
    o2.frequency.setValueAtTime(101, t);
    o2.frequency.exponentialRampToValueAtTime(51, t + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 1.1);
    g.gain.linearRampToValueAtTime(0, t + 2.6);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(this.master!);
    o.start(t);
    o2.start(t);
    o.stop(t + 2.7);
    o2.stop(t + 2.7);
  }

  // ---------------- helpers ----------------
  private get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private noise(dur: number, freq: number, type: BiquadFilterType, vol: number, when = 0, q = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf || !this.master) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    when = 0,
    echo = false
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    if (echo && this.delay) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---------------- SFX ----------------
  shot() {
    this.noise(0.13, 1400, "highpass", 0.5);
    this.noise(0.09, 420, "lowpass", 0.55);
    this.tone("square", 190, 55, 0.09, 0.32);
    this.tone("sine", 1500, 300, 0.05, 0.12);
  }
  dryFire() {
    this.tone("square", 1900, 1400, 0.03, 0.16);
  }
  reloadStart() {
    this.noise(0.05, 1300, "bandpass", 0.3, 0, 3);
    this.tone("square", 300, 220, 0.05, 0.14, 0.09);
  }
  reloadEnd() {
    this.noise(0.06, 500, "lowpass", 0.4);
    this.tone("square", 240, 190, 0.06, 0.2, 0.05);
  }
  zHit() {
    this.noise(0.07, 700, "bandpass", 0.4, 0, 2);
    this.tone("square", 130, 70, 0.07, 0.25);
  }
  zDie() {
    this.tone("sawtooth", 110, 38, 0.6, 0.2);
    this.noise(0.4, 300, "lowpass", 0.22);
  }
  moan(p = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(82 * p, t);
    o.frequency.linearRampToValueAtTime(58 * p, t + 0.8);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const va = ctx.createGain();
    va.gain.value = 6;
    vib.connect(va);
    va.connect(o.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.15);
    g.gain.linearRampToValueAtTime(0, t + 0.95);
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    if (this.delay) g.connect(this.delay);
    o.start(t);
    vib.start(t);
    o.stop(t + 1);
    vib.stop(t + 1);
  }
  bruteRoar() {
    this.tone("sawtooth", 70, 36, 0.8, 0.4);
    this.noise(0.7, 260, "bandpass", 0.35, 0, 1.4);
    this.tone("square", 55, 40, 0.7, 0.2, 0.05);
  }
  hurt() {
    this.noise(0.16, 500, "lowpass", 0.5);
    this.tone("sawtooth", 210, 70, 0.22, 0.3);
  }
  heartbeat() {
    this.tone("sine", 58, 40, 0.1, 0.5);
    this.tone("sine", 52, 38, 0.09, 0.36, 0.16);
  }
  footstep() {
    this.stepFlip = !this.stepFlip;
    this.noise(0.05, this.stepFlip ? 240 : 200, "lowpass", 0.1);
  }
  pickup() {
    this.tone("square", 620, 620, 0.06, 0.16);
    this.tone("square", 930, 930, 0.09, 0.16, 0.07);
  }
  herb() {
    this.tone("triangle", 520, 780, 0.14, 0.2, 0, true);
    this.tone("triangle", 780, 1040, 0.16, 0.16, 0.1, true);
  }
  fuse() {
    [440, 587, 880, 1174].forEach((f, i) => this.tone("square", f, f, 0.09, 0.16, i * 0.07));
    this.noise(0.3, 5200, "highpass", 0.1, 0.2);
  }
  save() {
    for (let i = 0; i < 9; i++) this.noise(0.028, 2400 + (i % 2) * 700, "highpass", 0.12, i * 0.045);
    this.tone("sine", 1244, 1244, 0.5, 0.14, 0.44, true);
  }
  doorUnlock() {
    this.tone("square", 90, 60, 0.5, 0.5);
    this.noise(0.8, 240, "lowpass", 0.35);
    this.tone("sawtooth", 130, 70, 0.9, 0.2, 0.15);
  }
  ratchet() {
    this.noise(0.03, 1800, "bandpass", 0.25, 0, 4);
  }
  stomp() {
    this.tone("sine", 70, 34, 0.2, 0.5);
    this.noise(0.14, 180, "lowpass", 0.4);
  }
  creak() {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(170, t);
    o.frequency.linearRampToValueAtTime(110 + Math.random() * 40, t + 0.6);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.2);
    g.gain.linearRampToValueAtTime(0, t + 0.7);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    if (this.delay) g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.75);
  }
  uiMove() {
    this.tone("square", 330, 330, 0.04, 0.1);
  }
  uiSelect() {
    this.tone("square", 520, 780, 0.08, 0.14);
  }
  deathSting() {
    [110, 130.81, 164.81].forEach((f) => this.tone("sawtooth", f, f * 0.94, 2.4, 0.14, 0, true));
    this.noise(1.6, 200, "lowpass", 0.16);
  }
  victory() {
    [261.63, 329.63, 392, 523.25, 659.25].forEach((f, i) =>
      this.tone("triangle", f, f, 0.4, 0.16, i * 0.14, true)
    );
  }

  destroy() {
    try {
      void this.ctx?.close();
    } catch {
      /* noop */
    }
    this.ctx = null;
  }
}
