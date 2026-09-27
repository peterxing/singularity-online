// All sound is synthesized with WebAudio at runtime.
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this.musicVol = 0.5;
    this.nextChord = 0;
    this.nextNote = 0;
    this.chordIdx = 0;
    this.combat = false;
    this.night = 0;
    this.faction = 'eacc';
    this.nextBird = 0;
    this.nextBeat = 0;
    this.last = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.2);
    const revGain = ctx.createGain(); revGain.gain.value = 0.45;
    this.reverb.connect(revGain).connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master); this.music.connect(this.reverb);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);
    this.sfxRev = ctx.createGain(); this.sfxRev.gain.value = 0.25;
    this.sfxBus.connect(this.sfxRev).connect(this.reverb);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.5;
    this.amb.connect(this.master);
    this.noise = this._noiseBuffer(2);
    // wind
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(6, true);
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.12;
    src.connect(this.windFilter).connect(this.windGain).connect(this.amb);
    src.start();
  }

  _noiseBuffer(sec, brown = false) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusic(v) { this.musicVol = v; if (this.music) this.music.gain.value = v * 0.5; }

  // ------------------------------------------------------------------ primitives
  _tone(freq, dur, { type = 'sine', gain = 0.2, attack = 0.005, release = null, bus = null, detune = 0, sweep = null, at = 0, filter = null } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (sweep) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (release || dur));
    let node = o.connect(g);
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; node = g.connect(f); }
    node.connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + (release || dur) + 0.05);
  }

  _noise(dur, { gain = 0.2, freq = 1000, q = 1, type = 'bandpass', sweep = null, at = 0, attack = 0.005, bus = null } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  _throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return true;
    this.last[key] = now;
    return false;
  }

  // ------------------------------------------------------------------ sfx
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'cast':
        if (this._throttle('cast', 80)) return;
        this._noise(0.6, { gain: 0.05 * v, freq: 400, sweep: 2400, q: 3, attack: 0.3 });
        this._tone(300, 0.6, { type: 'triangle', gain: 0.03 * v, sweep: 900, attack: 0.3 });
        break;
      case 'fire':
        if (this._throttle('fire', 50)) return;
        this._noise(0.35, { gain: 0.12 * v, freq: 3000, sweep: 400, q: 1.2 });
        this._tone(520, 0.2, { type: 'sawtooth', gain: 0.03 * v, sweep: 180, filter: 1800 });
        break;
      case 'rocket':
        this._noise(0.9, { gain: 0.18 * v, freq: 900, sweep: 200, q: 0.7, type: 'lowpass' });
        break;
      case 'hit':
        if (this._throttle('hit', 40)) return;
        this._noise(0.12, { gain: 0.16 * v, freq: 1800, q: 0.8, type: 'lowpass', sweep: 300 });
        this._tone(140, 0.15, { gain: 0.18 * v, sweep: 55 });
        break;
      case 'crit':
        this._noise(0.18, { gain: 0.22 * v, freq: 2600, q: 0.8, type: 'lowpass', sweep: 300 });
        this._tone(180, 0.22, { gain: 0.25 * v, sweep: 50 });
        this._tone(1800, 0.08, { type: 'square', gain: 0.03 * v, filter: 4000 });
        break;
      case 'swing':
        if (this._throttle('swing', 60)) return;
        this._noise(0.18, { gain: 0.12 * v, freq: 2500, sweep: 500, q: 2 });
        break;
      case 'heal':
        if (this._throttle('heal', 120)) return;
        [72, 76, 79, 84].forEach((n, i) => this._tone(NOTE(n), 0.8, { gain: 0.05 * v, at: i * 0.06, attack: 0.01 }));
        break;
      case 'shield':
        [67, 74, 79].forEach((n, i) => this._tone(NOTE(n), 1.2, { type: 'triangle', gain: 0.04 * v, at: i * 0.03, attack: 0.05 }));
        break;
      case 'buff':
        [60, 67, 72, 79].forEach((n, i) => this._tone(NOTE(n), 0.9, { type: 'sawtooth', gain: 0.03 * v, at: i * 0.07, filter: 2400 }));
        break;
      case 'explosion':
        this._noise(1.2, { gain: 0.3 * v, freq: 1200, sweep: 80, q: 0.5, type: 'lowpass' });
        this._tone(90, 0.8, { gain: 0.3 * v, sweep: 30 });
        break;
      case 'nova':
        this._noise(0.8, { gain: 0.16 * v, freq: 600, sweep: 3000, q: 2 });
        this._tone(220, 0.8, { type: 'triangle', gain: 0.08 * v, sweep: 880 });
        break;
      case 'levelup':
        [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => {
          this._tone(NOTE(n), 1.6, { type: 'sawtooth', gain: 0.045, at: i * 0.09, filter: 2600, attack: 0.02 });
          this._tone(NOTE(n + 12), 1.2, { gain: 0.03, at: i * 0.09 });
        });
        break;
      case 'quest':
        [67, 72, 76].forEach((n, i) => this._tone(NOTE(n), 0.9, { type: 'triangle', gain: 0.07, at: i * 0.12 }));
        break;
      case 'questdone':
        [60, 67, 72, 76, 79].forEach((n, i) => this._tone(NOTE(n), 1.3, { type: 'triangle', gain: 0.07, at: i * 0.1 }));
        break;
      case 'loot':
        [88, 91].forEach((n, i) => this._tone(NOTE(n), 0.25, { type: 'square', gain: 0.02, at: i * 0.06, filter: 5000 }));
        break;
      case 'death':
        [64, 60, 55, 48].forEach((n, i) => this._tone(NOTE(n), 1.4, { type: 'triangle', gain: 0.07, at: i * 0.22 }));
        break;
      case 'error':
        if (this._throttle('error', 250)) return;
        this._tone(110, 0.14, { type: 'square', gain: 0.03, filter: 800 });
        break;
      case 'click':
        this._tone(1400, 0.04, { type: 'square', gain: 0.02, filter: 3000 });
        break;
      case 'jump':
        this._noise(0.15, { gain: 0.04, freq: 600, q: 1 });
        break;
      case 'yell':
        this._tone(70, 1.5, { type: 'sawtooth', gain: 0.08, filter: 500, sweep: 50 });
        this._noise(1.5, { gain: 0.08, freq: 300, q: 1, type: 'lowpass' });
        break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ music & ambience
  update(dt, st) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    this.combat = st.combat;
    this.night = st.night;
    this.faction = st.faction || this.faction;
    if (this.windFilter) {
      this.windFilter.frequency.value = 380 + Math.sin(t * 0.13) * 180 + Math.sin(t * 0.41) * 90;
      this.windGain.gain.value = 0.06 + (Math.sin(t * 0.07) * 0.5 + 0.5) * 0.08 + (st.altitude > 60 ? 0.1 : 0);
    }
    if (t > this.nextChord) this._chord(t);
    if (t > this.nextNote) this._melody(t);
    if (this.combat && t > this.nextBeat) {
      this.nextBeat = t + 0.6;
      this._tone(95, 0.3, { gain: 0.09, sweep: 40, bus: this.music });
      if (Math.random() < 0.5) this._noise(0.1, { gain: 0.03, freq: 6000, type: 'highpass', bus: this.music, at: 0.3 });
    }
    if (t > this.nextBird) {
      this.nextBird = t + 2 + Math.random() * 5;
      if (this.night < 0.5 && !st.altitude || (this.night < 0.5 && st.altitude < 60)) this._bird();
      else if (this.night >= 0.5) this._cricket();
    }
  }

  _chord(t) {
    const night = this.night > 0.5;
    const eacc = this.faction === 'eacc';
    const progs = night ? [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]]
      : eacc ? [[60, 64, 67, 71], [57, 60, 64, 67], [65, 69, 72, 76], [62, 66, 69, 72]] : [[62, 66, 69, 73], [59, 62, 66, 69], [67, 71, 74, 78], [64, 67, 71, 74]];
    const ch = progs[this.chordIdx % progs.length];
    this.chordIdx++;
    const dur = night ? 12 : 9;
    this.nextChord = t + dur - 1.5;
    for (const n of ch) {
      this._tone(NOTE(n - 12), dur, { type: 'triangle', gain: 0.035, attack: 2.5, bus: this.music, filter: 1400 });
      this._tone(NOTE(n), dur, { type: 'sine', gain: 0.02, attack: 3, detune: 6, bus: this.music });
    }
    this._tone(NOTE(ch[0] - 24), dur, { type: 'sine', gain: 0.05, attack: 2, bus: this.music });
  }

  _melody(t) {
    const scale = this.night > 0.5 ? [69, 72, 74, 76, 79, 81] : this.faction === 'eacc' ? [72, 74, 76, 79, 81, 84] : [74, 76, 78, 81, 83, 86];
    const n = scale[Math.floor(Math.random() * scale.length)];
    this.nextNote = t + (this.combat ? 0.8 : 1.6) + Math.random() * 2.5;
    this._tone(NOTE(n), 2.2, { type: 'sine', gain: 0.035, attack: 0.01, bus: this.music });
    this._tone(NOTE(n + 12), 0.9, { type: 'sine', gain: 0.01, attack: 0.01, bus: this.music });
  }

  _bird() {
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this._tone(base * (0.9 + Math.random() * 0.3), 0.09, { gain: 0.012, at: i * 0.12, sweep: base * (1.3 + Math.random() * 0.4), bus: this.amb });
  }

  _cricket() {
    for (let i = 0; i < 6; i++) this._tone(4600, 0.03, { gain: 0.006, at: i * 0.05, type: 'square', filter: 6000, bus: this.amb });
  }
}
