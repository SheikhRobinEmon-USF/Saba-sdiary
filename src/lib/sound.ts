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

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) this.ensure();
    else if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
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
