/**
 * Tiny synthesised soundscape (no audio files, nothing fetched): a soft
 * quill scratch, an inkpot "plip" and a purr. Created only after the user
 * explicitly enables sound, so browsers never autoplay anything.
 */
class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private lastScratch = 0;

  private ambient = false;
  private musicTimer = 0;
  private musicNext = 0;
  private musicStep = 0;
  private musicBus: GainNode | null = null;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.ensure();
    else if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
    this.syncMusic();
  }

  /** The music-box lullaby (and the cats' periodic meows) — only while sound is on. */
  setAmbient(on: boolean): void {
    this.ambient = on;
    this.syncMusic();
  }

  get ambientOn(): boolean {
    return this.enabled && this.ambient;
  }

  private syncMusic(): void {
    const want = this.enabled && this.ambient;
    if (want && !this.musicTimer) {
      const ctx = this.ensure();
      if (!ctx || !this.master) return;
      if (!this.musicBus) {
        // music-box bus with a soft echo
        this.musicBus = ctx.createGain();
        this.musicBus.gain.value = 0.0001;
        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.27;
        const fb = ctx.createGain();
        fb.gain.value = 0.28;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2400;
        this.musicBus.connect(this.master);
        this.musicBus.connect(delay);
        delay.connect(lp).connect(fb).connect(delay);
        lp.connect(this.master);
      }
      this.musicBus.gain.cancelScheduledValues(ctx.currentTime);
      this.musicBus.gain.setTargetAtTime(0.16, ctx.currentTime, 0.8);
      this.musicNext = ctx.currentTime + 0.3;
      this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
    } else if (!want && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = 0;
      if (this.ctx && this.musicBus) this.musicBus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
    }
  }

  /**
   * An original little lullaby in C-major pentatonic, played like a music box:
   * melody over a slow bass, with a rest between phrases. Scheduled ahead.
   */
  private static readonly TUNE: (number | null)[] = [
    72, 76, 79, 76, 74, 72, 69, 72, 67, 69, 72, 76, 74, null, null, null,
    76, 79, 81, 79, 76, 74, 72, 74, 76, 72, 69, 67, 72, null, null, null,
    79, 81, 84, 81, 79, 76, 74, 76, 72, 74, 76, 79, 76, null, 74, null,
    72, 69, 67, 69, 72, 74, 76, 74, 72, 69, 67, 69, 72, null, null, null,
    null, null, null, null, null, null, null, null,
  ];
  private static readonly BASS = [48, 45, 41, 43, 48, 45, 43, 48, 45, 41, 43, 45, 41, 43, 48, 48, 48, 48];

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const beat = 0.46;
    while (this.musicNext < ctx.currentTime + 0.6) {
      const tune = SoundBoard.TUNE;
      const i = this.musicStep % tune.length;
      const n = tune[i];
      if (n !== null) this.bell(n, this.musicNext, 0.09);
      if (i % 4 === 0) {
        const b = SoundBoard.BASS[Math.floor(i / 4) % SoundBoard.BASS.length];
        if (tune[i] !== null || i < 64) this.bell(b, this.musicNext, 0.05, 2.4);
      }
      this.musicNext += beat;
      this.musicStep++;
    }
  }

  private bell(midi: number, at: number, vol: number, decay = 1.6): void {
    const ctx = this.ctx!;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    g.connect(this.musicBus!);
    for (const [mult, amp] of [
      [1, 1],
      [2.0, 0.28],
      [3.01, 0.12],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(at);
      o.stop(at + decay + 0.05);
    }
  }

  /** A small "mi-a-ow": pitch glide through shifting vowel formants. */
  meow(variant = 0): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime + 0.02;
    const pitch = variant === 1 ? 1.22 : 1;
    const dur = 0.62 + Math.random() * 0.15;
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(470 * pitch, now);
    src.frequency.linearRampToValueAtTime(760 * pitch, now + dur * 0.3);
    src.frequency.linearRampToValueAtTime(620 * pitch, now + dur * 0.65);
    src.frequency.linearRampToValueAtTime(430 * pitch, now + dur);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vibG = ctx.createGain();
    vibG.gain.value = 9 * pitch;
    vib.connect(vibG).connect(src.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.11, now + 0.06);
    env.gain.setValueAtTime(0.11, now + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const out = ctx.createGain();
    out.gain.value = 0.9;
    // two formant filters gliding i → a → u
    const formants: [number, number, number][] = [
      [350, 900, 520],
      [2300, 1400, 900],
    ];
    for (const [a, b, cEnd] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(a, now);
      bp.frequency.linearRampToValueAtTime(b, now + dur * 0.45);
      bp.frequency.linearRampToValueAtTime(cEnd, now + dur);
      src.connect(bp).connect(env);
    }
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 3200;
    env.connect(body).connect(out).connect(this.master);
    src.start(now);
    vib.start(now);
    src.stop(now + dur + 0.05);
    vib.stop(now + dur + 0.05);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.noise.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        // slightly pink noise: paper fibre texture
        b = 0.86 * b + 0.14 * (Math.random() * 2 - 1);
        ch[i] = b * 2.4;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  scratch(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.noise || !this.master) return;
    const now = ctx.currentTime;
    if (now - this.lastScratch < 0.035) return;
    this.lastScratch = now;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2600 + Math.random() * 1800;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const dur = 0.07 + Math.random() * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.025, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now, Math.random() * 1.2, dur + 0.02);
  }

  dip(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    // glassy tap on the rim
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2350, now);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 0.3);
    // liquid plip
    const p = ctx.createOscillator();
    p.type = 'sine';
    p.frequency.setValueAtTime(520, now + 0.06);
    p.frequency.exponentialRampToValueAtTime(190, now + 0.16);
    const pg = ctx.createGain();
    pg.gain.setValueAtTime(0.0001, now + 0.06);
    pg.gain.exponentialRampToValueAtTime(0.09, now + 0.075);
    pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    p.connect(pg).connect(this.master);
    p.start(now + 0.06);
    p.stop(now + 0.22);
  }

  /** A short trilled "mrrp?" — the greeting of a cat that was just woken. */
  chirp(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.09);
    o.frequency.exponentialRampToValueAtTime(700, now + 0.2);
    const trill = ctx.createOscillator();
    trill.frequency.value = 32;
    const trillGain = ctx.createGain();
    trillGain.gain.value = 40;
    trill.connect(trillGain).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    o.connect(lp).connect(g).connect(this.master);
    o.start(now);
    trill.start(now);
    o.stop(now + 0.26);
    trill.stop(now + 0.26);
  }

  purr(): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.noise || !this.master) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const am = ctx.createGain();
    am.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.22, now + 0.35);
    env.gain.setValueAtTime(0.22, now + 1.4);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    src.connect(lp).connect(am).connect(env).connect(this.master);
    src.start(now);
    lfo.start(now);
    src.stop(now + 2.2);
    lfo.stop(now + 2.2);
  }
}

export const sound = new SoundBoard();
