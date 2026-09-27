// Procedural trailer soundtrack: rendered with an OfflineAudioContext, exported as 16-bit WAV.
// Everything is synthesized: no samples. Timings follow the 120 BPM edit in shots.js.
window.makeTrailerAudio = async function makeTrailerAudio(opts = {}) {
  const SR = 48000, DUR = opts.duration || 48.2;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * DUR), SR);
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();

  // ------------------------------------------------------------ buses
  const master = ctx.createGain(); master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.22;
  const bus = ctx.createGain(); bus.gain.value = 1;
  bus.connect(comp); comp.connect(master); master.connect(ctx.destination);
  // Reverb from a generated impulse response.
  const irLen = Math.floor(SR * 3.4);
  const ir = ctx.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < irLen; i++) { const t = i / SR; lp += (rnd() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.pow(1 - i / irLen, 2.2) * Math.exp(-t * 1.1) * (i < 200 ? i / 200 : 1); }
  }
  const verb = ctx.createConvolver(); verb.buffer = ir; verb.normalize = true;
  const verbIn = ctx.createGain(); verbIn.gain.value = 0.9;
  const verbHP = ctx.createBiquadFilter(); verbHP.type = 'highpass'; verbHP.frequency.value = 160;
  verbIn.connect(verbHP); verbHP.connect(verb); verb.connect(bus);
  const out = (node, gain = 1, send = 0.25, pan = 0) => {
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    node.connect(g); g.connect(p); p.connect(bus);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; p.connect(s); s.connect(verbIn); }
    return g;
  };
  const noiseBuf = (() => { const b = ctx.createBuffer(2, SR * 3, SR); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; } return b; })();
  const noise = (t, dur) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(t, rnd() * 2); n.stop(t + dur + 0.05); return n; };
  const shaper = (amt) => { const w = ctx.createWaveShaper(); const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * amt) / Math.tanh(amt); } w.curve = c; w.oversample = '2x'; return w; };
  const ADSR = (g, t, a, peak, d, sus, rel, end) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0002), t + a + d);
    g.gain.setValueAtTime(Math.max(sus, 0.0002), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
  };

  // ------------------------------------------------------------ instruments
  const boom = (t, gain = 1, len = 2.2) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.9);
    const g = ctx.createGain(); ADSR(g, t, 0.004, 1, 0.3, 0.45, len * 0.8, t + 0.35);
    o.connect(g); const sh = shaper(2.2); g.connect(sh); out(sh, 0.95 * gain, 0.25);
    o.start(t); o.stop(t + len + 1);
    const n = noise(t, 0.6); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const ng = ctx.createGain(); ADSR(ng, t, 0.002, 0.9, 0.12, 0.1, 0.4, t + 0.14);
    n.connect(lp); lp.connect(ng); out(ng, 0.55 * gain, 0.5);
  };
  const taiko = (t, gain = 1, pitch = 1, pan = 0) => {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170 * pitch, t); o.frequency.exponentialRampToValueAtTime(58 * pitch, t + 0.13);
    const g = ctx.createGain(); ADSR(g, t, 0.003, 1, 0.08, 0.35, 0.42, t + 0.1);
    o.connect(g); out(g, 0.8 * gain, 0.3, pan); o.start(t); o.stop(t + 0.8);
    const n = noise(t, 0.2); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 * pitch; bp.Q.value = 0.9;
    const ng = ctx.createGain(); ADSR(ng, t, 0.001, 0.8, 0.05, 0.05, 0.08, t + 0.05);
    n.connect(bp); bp.connect(ng); out(ng, 0.35 * gain, 0.35, pan);
  };
  const snare = (t, gain = 1) => {
    const n = noise(t, 0.35); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
    const g = ctx.createGain(); ADSR(g, t, 0.001, 0.9, 0.06, 0.2, 0.2, t + 0.06);
    n.connect(bp); bp.connect(g); out(g, 0.42 * gain, 0.35);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = ctx.createGain(); ADSR(og, t, 0.001, 0.6, 0.05, 0.05, 0.08, t + 0.04); o.connect(og); out(og, 0.3 * gain, 0.2); o.start(t); o.stop(t + 0.3);
  };
  const tick = (t, gain = 1, pan = 0) => {
    const n = noise(t, 0.08); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain(); ADSR(g, t, 0.001, 0.5, 0.02, 0.05, 0.035, t + 0.02);
    n.connect(hp); hp.connect(g); out(g, 0.22 * gain, 0.05, pan);
  };
  const crash = (t, gain = 1, len = 3) => {
    const n = noise(t, len); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
    const g = ctx.createGain(); ADSR(g, t, 0.002, 0.7, 0.2, 0.3, len, t + 0.2);
    n.connect(hp); hp.connect(g); out(g, 0.28 * gain, 0.5);
  };
  const braam = (t, dur, freqs, gain = 1, bright = 1600, dist = 1.6) => {
    const mix = ctx.createGain(); mix.gain.value = 1 / Math.sqrt(freqs.length);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(140, t); lp.frequency.exponentialRampToValueAtTime(bright, t + 0.32); lp.frequency.exponentialRampToValueAtTime(Math.max(260, bright * 0.3), t + dur);
    const g = ctx.createGain(); ADSR(g, t, 0.05, 1, 0.5, 0.7, 1.3, t + dur);
    for (const f of freqs) for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(mix); o.start(t); o.stop(t + dur + 1.6);
    }
    mix.connect(lp); lp.connect(g); const sh = shaper(dist); g.connect(sh); out(sh, 0.34 * gain, 0.4);
  };
  const pad = (t0, t1, freqs, gain = 1, cutoff = 900, type = 'sawtooth', att = 1.2, rel = 1.6) => {
    const mix = ctx.createGain(); mix.gain.value = 1 / Math.sqrt(freqs.length * 2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.17; const lg = ctx.createGain(); lg.gain.value = cutoff * 0.3; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t0); lfo.stop(t1 + rel + 0.5);
    for (const f of freqs) for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.connect(mix); o.start(t0); o.stop(t1 + rel + 0.5); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + att); g.gain.setValueAtTime(1, t1); g.gain.exponentialRampToValueAtTime(0.0001, t1 + rel);
    mix.connect(lp); lp.connect(g); out(g, 0.2 * gain, 0.55);
  };
  const choir = (t0, t1, freqs, gain = 1, vowel = 'a') => {
    const F = vowel === 'o' ? [[450, 6], [800, 7]] : [[730, 6], [1090, 8], [2440, 10]];
    const src = ctx.createGain(); src.gain.value = 1 / Math.sqrt(freqs.length * 3);
    for (const f of freqs) for (const det of [-12, 0, 11]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const vib = ctx.createOscillator(); vib.frequency.value = 4.6 + rnd() * 0.8; const vg = ctx.createGain(); vg.gain.value = 5; vib.connect(vg); vg.connect(o.detune);
      o.connect(src); o.start(t0); o.stop(t1 + 2.5); vib.start(t0); vib.stop(t1 + 2.5);
    }
    const sum = ctx.createGain();
    for (const [fr, q] of F) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q; src.connect(bp); bp.connect(sum); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + 1.0); g.gain.setValueAtTime(1, t1); g.gain.exponentialRampToValueAtTime(0.0001, t1 + 2.0);
    sum.connect(g); out(g, 1.1 * gain, 0.7);
  };
  const pluck = (t, f, gain = 1, pan = 0, len = 0.12, cutoff = 2400) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 9;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(320, t + len);
    const g = ctx.createGain(); ADSR(g, t, 0.003, 1, len * 0.6, 0.25, len * 0.5, t + len * 0.6);
    o.connect(lp); o2.connect(lp); lp.connect(g); out(g, 0.11 * gain, 0.18, pan);
    o.start(t); o2.start(t); o.stop(t + len * 2 + 0.1); o2.stop(t + len * 2 + 0.1);
  };
  const bell = (t, f, gain = 1, pan = 0) => {
    const parts = [[1, 1, 2.6], [2.0, 0.45, 1.6], [2.76, 0.35, 1.2], [5.4, 0.16, 0.7], [8.93, 0.08, 0.45]];
    for (const [m, a, d] of parts) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * m;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); out(g, 0.16 * gain, 0.65, pan); o.start(t); o.stop(t + d + 0.1);
    }
  };
  const riser = (t0, t1, gain = 1, f0 = 300, f1 = 7000) => {
    const n = noise(t0, t1 - t0); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t1 - 0.02); g.gain.linearRampToValueAtTime(0.0001, t1);
    n.connect(bp); bp.connect(g); out(g, 0.38 * gain, 0.4);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(720, t1);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.5, t1 - 0.02); og.gain.linearRampToValueAtTime(0.0001, t1);
    o.connect(og); out(og, 0.12 * gain, 0.3); o.start(t0); o.stop(t1 + 0.05);
  };
  const whoosh = (t, dur = 0.5, gain = 1, pan = 0) => {
    const n = noise(t, dur); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.6); bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp); bp.connect(g); out(g, 0.3 * gain, 0.3, pan);
  };
  const revCymbal = (tEnd, dur = 1.4, gain = 1) => {
    const t = tEnd - dur; const n = noise(t, dur); const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, tEnd - 0.01); g.gain.linearRampToValueAtTime(0.0001, tEnd);
    n.connect(hp); hp.connect(g); out(g, 0.3 * gain, 0.3);
  };
  const beamHum = (t0, t1, f = 110, gain = 1, pan = 0) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = f * 2.01;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 4;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 11; const lg = ctx.createGain(); lg.gain.value = 600; lfo.connect(lg); lg.connect(lp.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(1, t0 + 0.06); g.gain.setValueAtTime(1, t1 - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t1);
    o.connect(lp); o2.connect(lp); lp.connect(g); out(g, 0.09 * gain, 0.2, pan);
    for (const x of [o, o2, lfo]) { x.start(t0); x.stop(t1 + 0.1); }
  };
  const zap = (t, gain = 1, pan = 0, f0 = 1800, f1 = 180, len = 0.28) => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len);
    const g = ctx.createGain(); ADSR(g, t, 0.003, 1, len * 0.5, 0.3, len * 0.5, t + len * 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    o.connect(bp); bp.connect(g); out(g, 0.16 * gain, 0.35, pan); o.start(t); o.stop(t + len + 0.2);
  };
  const chime = (t, root = 880, gain = 1) => { [1, 1.25, 1.5, 2].forEach((m, i) => bell(t + i * 0.045, root * m, 0.55 * gain, (i - 1.5) * 0.3)); };
  const fire = (t, dur = 1.4, gain = 1) => {
    const n = noise(t, dur); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp); lp.connect(g); out(g, 0.45 * gain, 0.4);
    for (let i = 0; i < 26; i++) { const tt = t + rnd() * dur * 0.8; tick(tt, 0.6 * gain * (1 - (tt - t) / dur), rnd() * 1.4 - 0.7); }
  };
  const heart = (t, gain = 1) => {
    for (const [dt, a] of [[0, 1], [0.24, 0.7]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.18);
      const g = ctx.createGain(); ADSR(g, t + dt, 0.004, a, 0.1, 0.2, 0.2, t + dt + 0.08);
      o.connect(g); out(g, 0.6 * gain, 0.15); o.start(t + dt); o.stop(t + dt + 0.6);
    }
  };

  // ------------------------------------------------------------ harmony
  const N = (name) => { const m = { C: -9, 'C#': -8, D: -7, Eb: -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, Bb: 1, B: 2 }; const [, n, o] = name.match(/^([A-G][#b]?)(\d)$/); return 440 * Math.pow(2, (m[n] + (o - 4) * 12) / 12); };
  const CH = {
    Am: ['A1', 'E2', 'A2', 'C3'], F: ['F1', 'C2', 'F2', 'A2'], C: ['C2', 'G2', 'C3', 'E3'], G: ['G1', 'D2', 'G2', 'B2'],
    Dm: ['D2', 'A2', 'D3', 'F3'], E: ['E1', 'B1', 'E2', 'G#2'], A: ['A1', 'E2', 'A2', 'C#3', 'E3'], Mol: ['A1', 'Bb1', 'Eb2', 'A2'],
  };
  const chord = (k) => CH[k].map(N);
  const third = { Am: 3, F: 4, C: 4, G: 4, Dm: 3, E: 4, A: 4 };
  const rootOf = (k) => N(CH[k][0].replace(/\d/, '3'));
  const ostinato = (t0, t1, keyAt, gain = 1, step = 0.125, oct = 1) => {
    const pat = [0, 12, 7, 12, 0, 12, 7, 'm'];
    let i = 0;
    for (let t = t0; t < t1 - 1e-6; t += step, i++) {
      const k = keyAt(t); const r = rootOf(k) * oct; const s = pat[i % 8]; const semi = s === 'm' ? third[k] : s;
      pluck(t, r * Math.pow(2, semi / 12), gain * (i % 4 === 0 ? 1.15 : 0.9), i % 2 ? 0.25 : -0.25);
    }
  };

  // ------------------------------------------------------------ the cue
  // Intro (0-8): drone, heartbeat, bell motif.
  pad(0.0, 7.7, chord('Am').slice(0, 3), 0.9, 420, 'sawtooth', 2.5, 0.8);
  pad(0.8, 7.8, [N('A4'), N('E5')], 0.5, 2400, 'triangle', 2.0, 0.6);
  for (let t = 1.0; t < 7.6; t += 1.0) heart(t, 0.55 + (t / 8) * 0.4);
  [['E5', 0.7], ['C5', 1.7], ['A4', 2.7], ['B4', 3.35], ['E5', 4.35], ['C5', 5.35], ['D5', 6.35], ['B4', 6.85]].forEach(([n, t]) => bell(t, N(n), 0.9, 0.2));
  whoosh(0.35, 0.8, 0.5); whoosh(4.0, 0.8, 0.5);
  riser(6.4, 8.0, 1.0); revCymbal(8.0, 1.6, 0.9);

  // ACCELERATE (8-12) / OR ALIGN (12-16)
  boom(8.0, 1.1); braam(8.0, 2.6, chord('Am'), 1.1, 1800); crash(8.0, 1, 3.5); taiko(8.0, 1.2, 0.8);
  pad(8.4, 11.9, chord('Am'), 0.55, 900);
  ostinato(8.5, 12.0, () => 'Am', 0.7, 0.25);
  for (let t = 8.5; t < 12; t += 0.5) { taiko(t, (t * 2) % 2 === 0 ? 0.75 : 0.45, 1); tick(t + 0.25, 0.5); }
  whoosh(11.55, 0.45, 0.8);
  boom(12.0, 1.1); braam(12.0, 2.6, chord('F'), 1.05, 2100); crash(12.0, 1, 3.5); taiko(12.0, 1.2, 0.8);
  choir(12.3, 15.6, chord('F').slice(1), 0.8);
  ostinato(12.5, 15.5, (t) => (t < 14 ? 'F' : 'C'), 0.75, 0.25);
  for (let t = 12.5; t < 15.5; t += 0.5) { taiko(t, (t * 2) % 2 === 0 ? 0.8 : 0.5, 1); tick(t + 0.25, 0.55); }
  for (let t = 15.5; t < 16; t += 0.0625) snare(t, 0.35 + (t - 15.5) * 1.6);
  riser(15.0, 16.0, 0.8);

  // Roll call (16-28): 8 champions, 1.5 s each, one chord per champion.
  const roll = [['Am', 'eacc'], ['F', 'ea'], ['C', 'eacc'], ['G', 'ea'], ['Am', 'eacc'], ['F', 'ea'], ['Dm', 'eacc'], ['E', 'ea']];
  roll.forEach(([k, fac], i) => {
    const t = 16 + i * 1.5;
    boom(t, i === 0 ? 1.1 : 0.8, 1.4); braam(t, 1.1, chord(k), 0.8, fac === 'eacc' ? 1500 : 2300, fac === 'eacc' ? 2.0 : 1.3);
    taiko(t, 1.1, 0.85); whoosh(t - 0.3, 0.32, 0.55, fac === 'eacc' ? -0.4 : 0.4);
    if (i === 0) crash(t, 0.9, 2.5);
  });
  ostinato(16.0, 28.0, (t) => roll[Math.min(7, Math.floor((t - 16) / 1.5))][0], 1.0, 0.125);
  for (let t = 16.5; t < 27.9; t += 0.5) { if (Math.abs(((t - 16) / 1.5) % 1) < 1e-6) continue; taiko(t, 0.55, 1.15, ((t * 2) % 2) ? 0.3 : -0.3); }
  for (let t = 16; t < 28; t += 0.25) tick(t + 0.125, 0.45, 0.2);
  for (let t = 27.25; t < 28; t += 0.0625) taiko(t, 0.35 + (t - 27.25) * 0.9, 1.3, 0);
  // Ability SFX in the roll call are generated from logged game events (see sfxFromEvents below).

  // Clash + gameplay (28-32)
  boom(28.0, 1.0); braam(28.0, 1.6, chord('Am'), 0.9, 1900); crash(28.0, 1, 2.2);
  ostinato(28.0, 32.0, (t) => (t < 30 ? 'Am' : 'F'), 1.0, 0.125);
  ostinato(28.0, 32.0, (t) => (t < 30 ? 'Am' : 'F'), 0.55, 0.125, 2);
  for (let t = 28; t < 32; t += 0.25) { const b = Math.round((t - 28) * 4) % 8; taiko(t, [1, 0.35, 0.6, 0.35, 0.9, 0.35, 0.6, 0.5][b], b % 4 === 0 ? 0.85 : 1.15, b % 2 ? 0.3 : -0.3); }
  for (let t = 28.5; t < 32; t += 1.0) snare(t, 0.8);
  for (let t = 28; t < 32; t += 0.125) tick(t, 0.35, 0.3);
  boom(30.0, 0.9); braam(30.0, 1.5, chord('F'), 0.8, 2000);

  // Approach (32-33.7): tension, then silence.
  pad(32.0, 33.6, [N('A4'), N('Bb4'), N('E5')], 0.9, 1800, 'sawtooth', 0.6, 0.1);
  for (let t = 32; t < 33.65; t += 0.0625) pluck(t, N('A5') * ((Math.round(t * 16) % 2) ? 1 : 1.0595), 0.35 + (t - 32) * 0.35, 0, 0.06, 3200);
  riser(32.0, 33.7, 0.9, 200, 5000); revCymbal(33.7, 1.2, 0.8);

  // Moloch (34-37.5)
  boom(34.0, 1.4, 3.0); braam(34.0, 3.2, chord('Mol'), 1.35, 1100, 2.8); crash(34.0, 0.7, 3.0);
  choir(34.2, 37.4, [N('A2'), N('C3'), N('Eb3')], 1.0, 'o');
  pad(34.0, 37.4, [N('A1'), N('Eb2')], 0.8, 260);
  [34.0, 35.0, 36.0, 37.0].forEach((t, i) => taiko(t, 1.1 + i * 0.1, 0.6));
  heart(34.5, 0.7); heart(35.5, 0.8); heart(36.5, 0.9);
  fire(35.0, 2.4, 0.35);

  // Raid (37.5-41)
  boom(37.5, 1.1); braam(37.5, 1.8, chord('Dm'), 1.0, 1900); crash(37.5, 0.9, 2.5);
  const furnace = (opts.events || []).filter((e) => e.k === 'boom' && e.ab === 'furnace').map((e) => e.T);
  const raidBoom = furnace.find((t) => t > 38) ?? 39.72;
  const molBoom = furnace.find((t) => t > 34 && t < 37.6);
  const oEnd = raidBoom - 0.4;
  ostinato(37.5, oEnd, () => 'Dm', 1.05, 0.125); ostinato(37.5, oEnd, () => 'Dm', 0.5, 0.125, 2);
  for (let t = 37.5; t < oEnd; t += 0.125) { const b = Math.round((t - 37.5) * 8) % 8; taiko(t, [1, 0.3, 0.5, 0.3, 0.8, 0.3, 0.55, 0.45][b], b % 4 === 0 ? 0.8 : 1.2, b % 2 ? 0.3 : -0.3); }
  // Slow motion: pitch-dropping suck, then the Furnace detonation.
  const sw = ctx.createOscillator(); sw.type = 'sine'; sw.frequency.setValueAtTime(220, raidBoom - 0.42); sw.frequency.exponentialRampToValueAtTime(35, raidBoom);
  const swg = ctx.createGain(); swg.gain.setValueAtTime(0.0001, raidBoom - 0.42); swg.gain.exponentialRampToValueAtTime(0.7, raidBoom - 0.3); swg.gain.exponentialRampToValueAtTime(0.0001, raidBoom + 0.03); sw.connect(swg); out(swg, 0.5, 0.2); sw.start(raidBoom - 0.42); sw.stop(raidBoom + 0.1);
  boom(raidBoom, 1.5, 2.6); crash(raidBoom, 0.9, 2.2); braam(raidBoom, 1.2, chord('E'), 1.1, 1300, 2.4);
  if (molBoom) { boom(molBoom, 1.1, 1.6); }
  for (let t = 40.3; t < 41; t += 0.0625) snare(t, 0.3 + (t - 40.3) * 1.2);
  riser(39.9, 41.0, 1.1, 250, 8000); revCymbal(41.0, 1.0, 1.0);

  // Title (41-48): resolve to A major.
  boom(41.0, 1.5, 3.2); braam(41.0, 4.0, chord('A'), 1.2, 2600, 1.4); crash(41.0, 1.1, 5.0); taiko(41.0, 1.3, 0.7);
  choir(41.3, 46.8, [N('A3'), N('C#4'), N('E4')], 0.9);
  pad(41.2, 46.8, chord('A'), 0.8, 1400);
  pad(42.0, 46.8, [N('A5'), N('E6')], 0.35, 5000, 'triangle', 1.5, 1.2);
  bell(41.05, N('A5'), 1.0); bell(43.2, N('E6'), 0.8, 0.3); bell(43.2, N('C#6'), 0.6, -0.3); bell(44.6, N('A6'), 0.5);
  taiko(43.2, 0.8, 0.8); boom(43.2, 0.5, 1.5);

  // ------------------------------------------------------------ SFX from logged game events
  const ABFX = opts.abilityFx || {};
  const last = {};
  for (const e of opts.events || []) {
    const key = e.k + ':' + (e.ab || e.p || '');
    const gap = e.k === 'dmg' ? 0.09 : 0.05;
    if (last[key] != null && e.T - last[key] < gap) continue;
    last[key] = e.T;
    const v = Math.max(0.25, Math.min(1, 1.25 - e.dist / 36));
    const pan = e.pan * 0.7, t = e.T;
    const fx = e.ab ? ABFX[e.ab] : null;
    switch (e.k) {
      case 'fire': {
        const flight = Math.max(0.08, e.d / Math.max(0.3, e.sp));
        if (e.p === 'rocket') { whoosh(t, Math.min(0.9, flight + 0.15), 0.9 * v, pan); boom(t + flight, 0.45 * v, 0.9); crash(t + flight, 0.25 * v, 0.8); }
        else if (e.ab === 'auto' || e.ab === 'mob') { zap(t, 0.25 * v, pan, 2400, 900, 0.09); }
        else { zap(t, 0.65 * v, pan, e.p === 'orb' ? 1400 : 2600, 300, 0.22); taiko(t + flight, 0.3 * v, 1.6, pan); }
        break;
      }
      case 'fx':
        if (fx === 'cone') fire(t, 0.55, 0.55 * v);
        else if (fx === 'slam') { boom(t, 0.75 * v, 1.0); crash(t, 0.3 * v, 1.2); }
        else if (fx === 'zap') zap(t, 0.6 * v, pan, 2800, 400, 0.2);
        else if (fx === 'ray') beamHum(t, t + 0.5, 220, 1.1 * v, pan);
        else if (fx === 'shield') bell(t, N('E6'), 0.5 * v, pan);
        else if (fx === 'heal' || fx === 'healnova') chime(t, 1568, 0.6 * v);
        else if (fx === 'buff' || fx === 'aura' || fx === 'ascend') chime(t, 1318, 0.55 * v);
        else if (fx === 'meteor') { whoosh(t, 0.9, 0.8 * v, pan); }
        else if (fx === 'nova') { boom(t, 0.55 * v, 1.0); zap(t, 0.7 * v, pan, 1200, 90, 0.45); }
        else if (fx === 'nova_t') { zap(t, 0.6 * v, pan, 3000, 500, 0.25); boom(t, 0.35 * v, 0.8); }
        else if (fx === 'blink') { zap(t, 0.8 * v, pan, 4200, 1800, 0.12); zap(t + 0.06, 0.6 * v, pan, 1200, 3600, 0.12); }
        else if (fx === 'bomb') { tick(t, 0.8 * v, pan); tick(t + 0.4, 0.8 * v, pan); }
        else if (fx === 'charge' || fx === 'dash') whoosh(t, 0.35, 0.8 * v, pan);
        else if (fx === 'gaze') beamHum(t, t + 0.6, 90, 1.2 * v, pan);
        break;
      case 'beam': beamHum(t, t + Math.min(e.d / Math.max(0.3, e.sp), 3.5), 110, 1.25 * v, pan); break;
      case 'boom':
        if (e.ab === 'furnace') { fire(t, 1.6, 1.1 * v); }
        else { boom(t, 0.8 * v, 1.4); crash(t, 0.35 * v, 1.4); }
        break;
      case 'swing': whoosh(t, 0.22, 0.45 * v, pan); break;
      case 'dash': whoosh(t, 0.3, 0.7 * v, pan); break;
      case 'cast': {
        const d = Math.min(2.2, e.d / Math.max(0.3, e.sp));
        if (e.mob === 'moloch') { riser(t, t + d, 0.7 * v, 80, 900); }
        else riser(t, t + d, 0.22 * v, 500, 3200);
        break;
      }
      case 'dmg': if (e.c || e.a > 45) taiko(t, 0.35 * v, 1.9, pan); break;
      default: break;
    }
  }

  // ------------------------------------------------------------ render + export
  const buf = await ctx.startRendering();
  let peak = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i])); }
  const norm = peak > 0 ? 0.89 / peak : 1;
  const fadeStart = Math.floor(SR * 46.9), fadeEnd = buf.length;
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const n = buf.length;
  const wav = new DataView(new ArrayBuffer(44 + n * 4));
  const W = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
  W(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); W(8, 'WAVE'); W(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
  wav.setUint32(24, SR, true); wav.setUint32(28, SR * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); W(36, 'data'); wav.setUint32(40, n * 4, true);
  let rms = 0;
  for (let i = 0; i < n; i++) {
    const f = i < fadeStart ? 1 : Math.max(0, 1 - (i - fadeStart) / (fadeEnd - fadeStart));
    const l = Math.max(-1, Math.min(1, L[i] * norm * f)), r = Math.max(-1, Math.min(1, R[i] * norm * f));
    rms += l * l;
    wav.setInt16(44 + i * 4, l * 32767, true); wav.setInt16(46 + i * 4, r * 32767, true);
  }
  const blob = new Blob([wav], { type: 'audio/wav' });
  if (opts.upload) {
    const r = await fetch(opts.upload, { method: 'POST', body: blob });
    if (!r.ok) throw new Error('upload failed ' + r.status);
  } else if (opts.download !== false) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'singularity-trailer-music.wav'; document.body.appendChild(a); a.click(); a.remove();
  }
  return { peak, norm, rmsDb: 10 * Math.log10(rms / n), seconds: n / SR, bytes: blob.size };
};
